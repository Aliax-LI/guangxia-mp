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

/**
 * 把一条文本增量接到已有回复上。
 * 增量若以已有全文开头，说明这次下发的是快照而不是新字，直接换掉，避免越拼越长。
 */
/**
 * 流式文本合并，带「网关重发」容错。
 *
 * 背景：部分 OpenAI 兼容网关会把上游已发过的内容块当作新 delta 再次下发
 * （抓包证据：delta[3]==delta[5]、delta[4]==delta[6]、delta[7]==delta[9]，
 * 且 response.completed 的服务端最终文本与"忠实拼接"结果完全一致——损坏
 * 发生在网关侧，不是客户端拼接错误）。这里做两级去重，让界面不出现
 * 「同一段话循环重复」：
 *  1) 整块重发：delta 已完整出现在已累积文本的尾部窗口里 → 丢弃；
 *  2) 前缀重叠：delta 以已累积文本的某段尾部开头（把快照当增量发）→ 只追加新出的部分。
 */
/**
 * 流式文本累积器，带「网关重发」容错。
 *
 * 背景：部分 OpenAI 兼容网关会把上游已发过的内容块当作新 delta 再次下发
 * （抓包证据：delta[3]==delta[5]、delta[4]==delta[6]、delta[7]==delta[9]，
 * 且 response.completed 的服务端最终文本与"忠实拼接"结果完全一致——损坏
 * 发生在网关侧，不是客户端拼接错误）。
 *
 * 算法：短块（<12 字）先挂起不提交，等下一个块到达后合并做窗口匹配——
 * 「好」这样的单字重发单独看无法判定，必须靠后续块的上下文。
 * 合并时在已累积文本的尾部窗口里找最长匹配前缀，跳过重复，只追加新出的部分。
 */
export function createStreamTextAccumulator() {
  let full = ''
  let pending = ''

  function flushWith(piece: string): string {
    const combined = pending + piece
    pending = ''
    if (!combined) return full
    if (!full || combined.startsWith(full)) {
      full = combined
      return full
    }
    if (combined.length >= 6) {
      const window = full.slice(-Math.max(combined.length + 400, 800))
      if (window.includes(combined)) return full
    }
    const win = full.slice(-Math.max(combined.length + 400, 800))
    let skip = 0
    for (let w = win.length - 1; w >= 12; w--) {
      let match = 0
      while (match < combined.length && w + match < win.length && win[w + match] === combined[match]) match++
      if (match >= 12 && match > skip) skip = match
    }
    if (skip >= 12) {
      const rest = combined.slice(skip)
      if (!rest) return full
      if (rest.length >= 6 && win.includes(rest)) return full
      full += rest
      return full
    }
    full += combined
    return full
  }

  return {
    /** 喂入一个 delta；返回当前完整文本 */
    feed(piece: string): string {
      if (!piece) return full
      pending += piece
      // 首段文本（full 尚短时）立即提交，避免首字被 12 字窗口扣住导致「正在思考」过久
      if (full.length >= 12 && pending.length < 12) return full
      return flushWith('')
    },
    /** 流结束时调用：把挂起的短块提交掉 */
    end(): string {
      return flushWith('')
    },
    /** 当前完整文本（不含挂起中的短块） */
    current(): string {
      return full
    },
  }
}

/**
 * 兼容入口：一次性合并一个 delta（供缓冲整段 SSE 的路径折叠使用）。
 * 活流请用 createStreamTextAccumulator。
 */
export function applyStreamText(full: string, piece: string): string {
  const acc = createStreamTextAccumulator()
  for (const ch of full) acc.feed(ch)
  acc.end()
  return acc.feed(piece)
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
  // 这些事件里的 text / output / choices 是全文，不是增量。
  if (
    type === 'response.output_text.done' ||
    type === 'response.content_part.done' ||
    type === 'response.output_item.done' ||
    type === 'response.completed' ||
    type === 'response.incomplete'
  ) {
    return ''
  }

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

function samePrefix(a: Uint8Array, b: Uint8Array, n: number): boolean {
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false
  return true
}

/**
 * 本次分片里还没见过的字节。
 * 开发者工具有时把「至今收到的全部字节」再发一遍；前缀相同就只留后缀。
 * ponytail: 每个分片都从头比对，单条回复几十 KB 内可以接受。回复大到兆级再改成滚动哈希。
 */
export function takeFreshBytes(seen: Uint8Array, incoming: Uint8Array): { seen: Uint8Array; fresh: Uint8Array } {
  if (incoming.length >= seen.length && samePrefix(incoming, seen, seen.length)) {
    return { seen: incoming.slice(), fresh: incoming.slice(seen.length) }
  }
  if (seen.length > incoming.length && samePrefix(seen, incoming, incoming.length)) {
    return { seen, fresh: new Uint8Array(0) }
  }
  const next = new Uint8Array(seen.length + incoming.length)
  next.set(seen, 0)
  next.set(incoming, seen.length)
  return { seen: next, fresh: incoming.slice() }
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
          if (delta) full = applyStreamText(full, delta)
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
