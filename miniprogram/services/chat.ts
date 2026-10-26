import { CHAT_MODEL, SUB2API_BASE_URL } from '../config/index'
import { getApiKey } from '../utils/storage'

export type ChatRole = 'user' | 'assistant'

export type ChatMessage = {
  role: ChatRole
  content: string
}

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

function readReply(data: unknown): string {
  if (data instanceof ArrayBuffer) data = pushUtf8([], data)
  if (typeof data === 'string') {
    const trimmed = data.trim()
    if (!trimmed) return ''
    if (trimmed.startsWith('data:')) return readSse(trimmed)
    try {
      data = JSON.parse(trimmed)
    } catch {
      return trimmed
    }
  }
  if (data && typeof data === 'object' && 'code' in data) {
    const env = data as { code?: number; message?: string; data?: unknown }
    if (env.code !== 0) throw new Error(env.message || '对话失败')
    data = env.data
  }
  if (!data || typeof data !== 'object') throw new Error('对话响应格式异常')
  const body = data as {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> }; delta?: { content?: string } }>
    error?: { message?: string }
  }
  if (body.error?.message) throw new Error(body.error.message)
  const content = body.choices?.[0]?.message?.content ?? body.choices?.[0]?.delta?.content
  if (typeof content === 'string' && content.trim()) return content
  if (Array.isArray(content)) {
    const text = content.map((part) => part?.text || '').join('')
    if (text.trim()) return text
  }
  throw new Error('没有收到回复')
}

function readSse(raw: string): string {
  let full = ''
  raw.split('\n').forEach((line) => {
    const piece = deltaOf(line)
    if (piece) full += piece
  })
  if (!full.trim()) throw new Error('没有收到回复')
  return full
}

function deltaOf(line: string): string {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return ''
  const payload = trimmed.slice(5).trim()
  if (!payload || payload === '[DONE]') return ''
  let json: {
    error?: { message?: string }
    choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>
  }
  try {
    json = JSON.parse(payload)
  } catch {
    return ''
  }
  if (json.error?.message) throw new Error(json.error.message)
  const choice = json.choices?.[0]
  const delta = choice?.delta?.content
  if (typeof delta === 'string') return delta
  const message = choice?.message?.content
  return typeof message === 'string' ? message : ''
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
function pushUtf8(carry: number[], chunk: ArrayBuffer | string): string {
  if (typeof chunk === 'string') return chunk
  const incoming = Array.prototype.slice.call(new Uint8Array(chunk)) as number[]
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
  const step = Math.max(1, Math.ceil(text.length / 48))
  return new Promise((resolve) => {
    let i = 0
    const tick = () => {
      i = Math.min(text.length, i + step)
      onDelta(text.slice(0, i))
      if (i >= text.length) resolve()
      else setTimeout(tick, 40)
    }
    tick()
  })
}

function requestChat(messages: ChatMessage[], stream: boolean, onDelta?: (text: string) => void): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) return Promise.reject(new Error('未登录'))

  return new Promise((resolve, reject) => {
    let buffer = ''
    let full = ''
    let sawChunk = false
    let settled = false
    let failed = ''
    const carry: number[] = []

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      fn()
    }

    const takeLine = (line: string) => {
      try {
        const piece = deltaOf(line)
        if (!piece) return
        full += piece
        if (onDelta) onDelta(full)
      } catch (err) {
        failed = err instanceof Error ? err.message : '对话失败'
      }
    }

    const task = wx.request({
      url: `${SUB2API_BASE_URL}/v1/chat/completions`,
      method: 'POST',
      timeout: 120000,
      dataType: stream ? '其他' : 'json',
      ...(stream ? { enableChunked: true } : {}),
      header: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      data: {
        model: CHAT_MODEL,
        messages,
        stream,
      },
      success(res) {
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
            const text = readReply(res.data)
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
        if (!full.trim()) {
          finish(() => reject(new Error('没有收到回复')))
          return
        }
        finish(() => resolve(full))
      },
      fail(err) {
        const message = err.errMsg || '对话失败'
        if (full.trim()) finish(() => resolve(full))
        else finish(() => reject(new Error(message)))
      },
    }) as ChunkTask

    if (task.onChunkReceived) {
      task.onChunkReceived((res) => {
        sawChunk = true
        buffer += pushUtf8(carry, res.data)
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        lines.forEach(takeLine)
      })
    }
  })
}

/** 对话一律走流式。分片到达就往外写；工具把整段一次性给回时，再按字铺开。 */
export function chatStream(messages: ChatMessage[], onDelta: (text: string) => void): Promise<string> {
  return requestChat(messages, true, onDelta)
}
