const TURNS_KEY = 'chat_turns_v1'
const PENDING_KEY = 'chat_pending_job'
const OPEN_KEY = 'chat_open_sheet'
const DRAFT_KEY = 'chat_composer_draft'

/** 用户输入的参考图（多模态 / 图生图），与生成结果 `images` 区分。 */
export function turnInputImages(turn: { imagePath?: string; imagePaths?: string[] }): string[] {
  if (Array.isArray(turn.imagePaths) && turn.imagePaths.length) {
    return turn.imagePaths.filter((p) => typeof p === 'string' && p)
  }
  const single = (turn.imagePath || '').trim()
  return single ? [single] : []
}

export function syncInputImages(paths: string[]): { imagePath: string; imagePaths: string[] } {
  const imagePaths = paths.filter(Boolean)
  return { imagePaths, imagePath: imagePaths[0] || '' }
}

export type ComposeJob = {
  prompt: string
  imagePath: string
  imagePaths?: string[]
  size: string
  ratioLabel: string
  count: number
  /** auto 不传给网关；low / medium / high 对应 gpt-image quality */
  quality?: string
  templateId: string
  templateTitle: string
  model?: string
}

export type ComposerDraft = {
  prompt: string
  templateId: string
  templateTitle: string
}

export type ChatTurn = ComposeJob & {
  id: string
  kind: 'image' | 'text'
  model: string
  reply: string
  status: 'generating' | 'done' | 'error'
  images: string[]
  error: string
}

const MAX_TURNS = 40

export function loadTurns(): ChatTurn[] {
  const raw = wx.getStorageSync(TURNS_KEY)
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item) => item && typeof item.id === 'string' && typeof item.prompt === 'string')
    .map((item) => {
      const kind = item.kind === 'text' ? 'text' : 'image'
      return {
        ...item,
        kind,
        model: item.model || (kind === 'text' ? 'auto' : 'gpt-image-2.5'),
        reply: item.reply || '',
        images: item.images || [],
        error: item.error || '',
        ...syncInputImages(
          Array.isArray(item.imagePaths) && item.imagePaths.length
            ? item.imagePaths
            : item.imagePath
              ? [item.imagePath]
              : [],
        ),
        size: item.size || 'auto',
        ratioLabel: item.ratioLabel || '自动',
        count: item.count || 1,
        quality: item.quality || 'auto',
        templateId: item.templateId || '',
        templateTitle: item.templateTitle || '',
      }
    })
}

export function saveTurns(turns: ChatTurn[]) {
  wx.setStorageSync(TURNS_KEY, turns.slice(-MAX_TURNS))
}

export function setPendingCompose(job: ComposeJob) {
  wx.setStorageSync(PENDING_KEY, job)
}

export function consumePendingCompose(): ComposeJob | null {
  const job = wx.getStorageSync(PENDING_KEY) as ComposeJob | ''
  if (!job || typeof job !== 'object' || !job.prompt) return null
  wx.removeStorageSync(PENDING_KEY)
  return job
}

export function requestOpenComposer() {
  wx.setStorageSync(OPEN_KEY, 1)
}

export function consumeOpenComposer(): boolean {
  if (!wx.getStorageSync(OPEN_KEY)) return false
  wx.removeStorageSync(OPEN_KEY)
  return true
}

/** 做同款：把提示词放进首页输入框，不自动开画。 */
export function setComposerDraft(draft: ComposerDraft) {
  wx.setStorageSync(DRAFT_KEY, draft)
}

export function consumeComposerDraft(): ComposerDraft | null {
  const draft = wx.getStorageSync(DRAFT_KEY) as ComposerDraft | ''
  if (!draft || typeof draft !== 'object') return null
  wx.removeStorageSync(DRAFT_KEY)
  return {
    prompt: draft.prompt || '',
    templateId: draft.templateId || '',
    templateTitle: draft.templateTitle || '',
  }
}
