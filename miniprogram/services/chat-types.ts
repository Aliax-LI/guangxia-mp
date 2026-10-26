export type ChatRole = 'user' | 'assistant'

export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } }

export type ChatMessage = {
  role: ChatRole
  content: string | ChatContentPart[]
}
