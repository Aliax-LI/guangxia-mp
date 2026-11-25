import { CHAT_INSTRUCTIONS, CHAT_MODEL, SUB2API_BASE_URL } from '../config/index'
import { getApiKey } from '../utils/storage'
import type { ChatContentPart, ChatMessage, ChatRole } from './chat-types'
import {
  createStreamTextAccumulator,
  chatMessagesToResponseInput,
  deltaFromStreamEvent,
  textFromResponsePayload,
} from './open-responses'

export type { ChatContentPart, ChatMessage, ChatRole }

type ChunkTask = {
  abort?: () => void
  onChunkReceived?: (cb: (res: { data: ArrayBuffer }) => void) => void
  offChunkReceived?: (cb?: (res: { data: ArrayBuffer }) => void) => void
}

class StreamMiss extends Error {
  constructor() {
    super('没有收到回复')
  }
}

function readFail(data: unknown): string {
  if (data instanceof ArrayBuffer) data = pushUtf8([], data)
  if (typeof data === 'string') {
    const raw = data
    try {
      data = JSON.parse(raw)
    } catch {
      return raw.slice(0, 120)
    }
  }
  if (!data || typeof data !== 'object') return ''
  const body = data as { message?: string; error?: { message?: string } }
  return body.error?.message || body.message || ''
}

/** 分片可能切断多字节字符，未完成的字节留到下一块。 */
function pushUtf8(carry: number[], chunk: ArrayBuffer | Uint8Array | string): string {
  if (typeof chunk === 'string') return chunk
  const view = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk)
  const incoming = Array.prototype.slice.call(view) as number[]
  const bytes = carry.length ? carry.concat(incoming) : incoming
  carry.length = 0
  let i = 0
  let out = ''
  while (i < bytes.length) {
    const lead = bytes[i]
    let need = 1
    if (lead >= 0xf0) need = 4
    else if (lead >= 0xe0) need = 3
    else if (lead >= 0xc0) need = 2
    if (i + need > bytes.length) {
      for (let j = i; j < bytes.length; j++) carry.push(bytes[j])
      break
    }
    if (need === 1) {
      out += String.fromCharCode(lead)
    } else {
      const hex = bytes.slice(i, i + need).map((n) => `%${n.toString(16).padStart(2, '0')}`).join('')
      try {
        out += decodeURIComponent(hex)
      } catch {
        out += String.fromCharCode(lead)
      }
    }
    i += need
  }
  return out
}

function drip(text: string, onDelta: (text: string) => void): Promise<void> {
/*  */  const step = Math.max(2, Math.ceil(text.length / 24))
  return new Promise((resolve) => {
    let i = 0
    const tick = () => {
      i = Math.min(text.length, i + step)
      onDelta(text.slice(0, i))
      if (i >= text.length) resolve()
      else setTimeout(tick, 28)
    }
    tick()
  })
}

function parseSseDataLine(line: string): unknown | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return null
  const payload = trimmed.slice(5).trim()
  if (!payload || payload === '[DONE]') return null
  try {
    return JSON.parse(payload)
  } catch {
    return null
  }
}

export type ChatStreamOptions = {
  onAbortReady?: (abort: () => void) => void
}

function requestResponses(
  messages: ChatMessage[],
  stream: boolean,
  onDelta?: (text: string) => void,
  options?: ChatStreamOptions,
): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) return Promise.reject(new Error('未登录'))

  const input = chatMessagesToResponseInput(messages)

  return new Promise((resolve, reject) => {
    let buffer = ''
    let full: string = ''
    let sawChunk = false
    let settled = false
    let aborted = false
    let failed = ''
    const carry: number[] = []

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      fn()
    }

    const acc = createStreamTextAccumulator()
    const consumeEvent = (json: unknown) => {
      const piece = deltaFromStreamEvent(json)
      if (!piece) return
      const next = acc.feed(piece)
      if (next === full) return
      full = next
      if (onDelta) onDelta(full)
    }

    const takeLine = (line: string) => {
      try {
        const json = parseSseDataLine(line)
        if (json) consumeEvent(json)
      } catch (err) {
        failed = err instanceof Error ? err.message : '对话失败'
      }
    }

    const task = wx.request({
      url: `${SUB2API_BASE_URL}/v1/responses`,
      method: 'POST',
      timeout: 120000,
      dataType: stream ? '其他' : 'json',
      ...(stream ? { enableChunked: true } : {}),
      header: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      data: {
        model: CHAT_MODEL,
        instructions: CHAT_INSTRUCTIONS,
        input,
        stream,
        store: false,
      },
      success(res) {
        if (aborted) {
          full = acc.end()
          if (full && onDelta) onDelta(full)
          if (full.trim()) finish(() => resolve(full))
          else finish(() => reject(new Error('已停止生成')))
          return
        }
        if (failed) {
          finish(() => reject(new Error(failed)))
          return
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          finish(() => reject(new Error(readFail(res.data) || `HTTP ${res.statusCode}`)))
          return
        }
        if (buffer.trim()) takeLine(buffer)
        if (failed) {
          finish(() => reject(new Error(failed)))
          return
        }
        if (!sawChunk) {
          try {
            const text = textFromResponsePayload(res.data)
            finish(() => {
              if (onDelta) drip(text, onDelta).then(() => resolve(text), reject)
              else resolve(text)
            })
          } catch (err) {
            const message = err instanceof Error ? err.message : ''
            if (stream && (!message || message === '没有收到回复')) finish(() => reject(new StreamMiss()))
            else finish(() => reject(err instanceof Error ? err : new Error('没有收到回复')))
          }
          return
        }
        const prevFull = full
        full = acc.end() // 提交挂起中的短块（网关重发容错的一部分）
        if (full !== prevFull && onDelta) onDelta(full)
        if (!full.trim()) {
          finish(() => reject(new Error('没有收到回复')))
          return
        }
        finish(() => resolve(full))
      },
      fail(err) {
        const message = aborted ? '已停止生成' : err.errMsg || '对话失败'
        const prevFull = full
        full = acc.end()
        if (full !== prevFull && onDelta) onDelta(full)
        if (full.trim()) finish(() => resolve(full))
        else finish(() => reject(new Error(message)))
      },
    }) as ChunkTask

    if (options?.onAbortReady) {
      options.onAbortReady(() => {
        if (settled || aborted) return
        aborted = true
        task.abort?.()
        const prevFull = full
        full = acc.end()
        if (full !== prevFull && onDelta) onDelta(full)
        if (full.trim()) finish(() => resolve(full))
        else finish(() => reject(new Error('已停止生成')))
      })
    }

    if (task.onChunkReceived) {
      task.onChunkReceived((res) => {
        if (aborted) return
        sawChunk = true
        buffer += pushUtf8(carry, res.data)
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        lines.forEach(takeLine)
      })
    }
  })
}

/** 对话走 Open Responses 流式（`response.output_text.delta`）。 */
export function chatStream(
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  options?: ChatStreamOptions,
): Promise<string> {
  return requestResponses(messages, true, onDelta, options)
}
