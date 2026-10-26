import type { ChatContentPart, ChatMessage } from './chat-types'

export type OpenResponsesInputText = { type: 'input_text'; text: string }
export type OpenResponsesInputImage = {
  type: 'input_image'
  image_url: string
  detail?: 'auto' | 'low' | 'high' | 'original'
}
export type OpenResponsesOutputText = { type: 'output_text'; text: string }

export type OpenResponsesMessageInput = {
  type: 'message'
  role: 'user' | 'assistant' | 'system'
  content: Array<OpenResponsesInputText | OpenResponsesInputImage | OpenResponsesOutputText>
}

export type OpenResponsesInputItem = OpenResponsesMessageInput

function userParts(content: string | ChatContentPart[]): Array<OpenResponsesInputText | OpenResponsesInputImage> {
  if (typeof content === 'string') {
    return [{ type: 'input_text', text: content.trim() || ' ' }]
  }
  const parts: Array<OpenResponsesInputText | OpenResponsesInputImage> = []
  for (const part of content) {
    if (part.type === 'text' && part.text.trim()) {
      parts.push({ type: 'input_text', text: part.text })
    } else if (part.type === 'image_url' && part.image_url?.url) {
      parts.push({
        type: 'input_image',
        image_url: part.image_url.url,
        detail: part.image_url.detail || 'auto',
      })
    }
  }
  if (!parts.length) parts.push({ type: 'input_text', text: ' ' })
  return parts
}

/** ChatMessage 历史 → Open Responses `input` 数组 */
export function chatMessagesToResponseInput(messages: ChatMessage[]): OpenResponsesInputItem[] {
  const input: OpenResponsesInputItem[] = []
  for (const msg of messages) {
    if (msg.role === 'assistant') {
      const text = typeof msg.content === 'string' ? msg.content : ''
      input.push({
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text }],
      })
      continue
    }
    input.push({
      type: 'message',
      role: 'user',
      content: userParts(msg.content),
    })
  }
  return input
}

type StreamEvent = {
  type?: string
  delta?: string
  message?: string
  error?: { message?: string; code?: string }
  response?: { error?: { message?: string } }
}

/** 从 Open Responses SSE 事件（或兼容的旧 chat/completions 块）提取文本增量。 */
export function deltaFromStreamEvent(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return ''
  const evt = raw as StreamEvent
  const type = evt.type || ''

  if (type === 'response.output_text.delta' && typeof evt.delta === 'string') return evt.delta

  if (type === 'error' || type === 'response.failed') {
    const msg = evt.error?.message || evt.message || evt.response?.error?.message || '对话失败'
    throw new Error(msg)
  }
  if (type === 'response.incomplete') return ''

  const legacy = raw as {
    choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>
    error?: { message?: string }
  }
  if (legacy.error?.message) throw new Error(legacy.error.message)
  const choice = legacy.choices?.[0]
  if (typeof choice?.delta?.content === 'string') return choice.delta.content
  if (typeof choice?.message?.content === 'string') return choice.message.content
  return ''
}

type OutputItem = {
  type?: string
  content?: Array<{ type?: string; text?: string }>
}

function collectOutputText(items: OutputItem[] | undefined): string {
  let text = ''
  for (const item of items || []) {
    if (item.type !== 'message') continue
    for (const part of item.content || []) {
      if (part.type === 'output_text' && part.text) text += part.text
    }
  }
  return text
}

/** 非流式或整包 JSON 的 Open Responses 回复文本。 */
export function textFromResponsePayload(data: unknown): string {
  if (data instanceof ArrayBuffer) {
    data = new TextDecoder().decode(new Uint8Array(data))
  }
  if (typeof data === 'string') {
    const trimmed = data.trim()
    if (!trimmed) return ''
    if (trimmed.startsWith('data:')) {
      let full = ''
      trimmed.split('\n').forEach((line) => {
        const piece = line.trim()
        if (!piece.startsWith('data:')) return
        const payload = piece.slice(5).trim()
        if (!payload || payload === '[DONE]') return
        try {
          const delta = deltaFromStreamEvent(JSON.parse(payload))
          if (delta) full += delta
        } catch (err) {
          if (err instanceof Error && err.message !== '对话失败') throw err
        }
      })
      if (full.trim()) return full
    }
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
    output?: OutputItem[]
    response?: { output?: OutputItem[] }
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>
    error?: { message?: string }
  }

  if (body.error?.message) throw new Error(body.error.message)

  const fromOutput = collectOutputText(body.output) || collectOutputText(body.response?.output)
  if (fromOutput.trim()) return fromOutput

  const content = body.choices?.[0]?.message?.content
  if (typeof content === 'string' && content.trim()) return content
  if (Array.isArray(content)) {
    const text = content.map((part) => part?.text || '').join('')
    if (text.trim()) return text
  }

  throw new Error('没有收到回复')
}
