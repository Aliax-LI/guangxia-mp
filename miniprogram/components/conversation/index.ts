import type { ChatTurn } from '../../utils/compose'
import { turnInputImages } from '../../utils/compose'
import {
  choicePrompt,
  normalizeReply,
  parseReply,
  stripGenUiForMarkdown,
  type ReplySegment,
} from '../../utils/gen-ui'

type Content = { type: string; data: unknown }

/** 渲染用字段；不展开整份 ChatTurn，避免 reply 等在 setData 里重复多份。 */
type Row = {
  id: string
  kind: 'text' | 'image'
  prompt: string
  status: ChatTurn['status']
  model: string
  inputImages: string[]
  images: string[]
  errorLabel: string
  assistantContent: Content[]
  assistantStatus: 'pending' | 'streaming' | 'error' | 'complete'
  showImages: boolean
  generating: boolean
  liveText: boolean
  thinking: boolean
  progress: number
  places: number[]
  segments: ReplySegment[]
  pick: string
  detail: string
}

const parseCache = new Map<
  string,
  { reply: string; segments: ReplySegment[]; assistantContent: Content[]; liveText: boolean }
>()

const startedAt: Record<string, number> = {}
const picks: Record<string, { value: string; detail: string }> = {}
let clock: ReturnType<typeof setInterval> | 0 = 0
let paintTimer: ReturnType<typeof setTimeout> | 0 = 0
let scrollBottomTimer: ReturnType<typeof setTimeout> | 0 = 0

function arc(from: number, now: number): number {
  const elapsed = Math.max(0, now - from)
  const pct = 92 * (1 - Math.exp(-elapsed / 14000))
  return Math.max(1, Math.min(92, Math.round(pct)))
}

function resolveTextView(turn: ChatTurn, reply: string) {
  const cached = parseCache.get(turn.id)
  if (cached && cached.reply === turn.reply) {
    return cached
  }
  const segments = turn.kind === 'text' && reply ? parseReply(reply) || [] : []
  let assistantContent: Content[] = []
  if (turn.status !== 'error' && turn.kind !== 'image' && reply && !segments.length) {
    const md = turn.kind === 'text' ? stripGenUiForMarkdown(reply) : reply
    assistantContent = [{ type: 'markdown', data: md }]
  }
  const liveText = turn.kind === 'text' && turn.status === 'generating' && !!reply && !segments.length
  const view = { reply: turn.reply, segments, assistantContent, liveText }
  parseCache.set(turn.id, view)
  return view
}

function toRow(turn: ChatTurn, now: number): Row {
  const inputImages = turnInputImages(turn)
  const errorLabel = (turn.error || '失败了').replace(/，点重试$/, '')

  const generating = turn.kind === 'image' && turn.status === 'generating'
  const reply = turn.reply ? normalizeReply(turn.reply) : ''
  const thinking = turn.kind === 'text' && turn.status === 'generating' && !reply
  const assistantStatus =
    turn.status === 'generating'
      ? thinking
        ? 'complete'
        : reply || generating
          ? 'streaming'
          : 'pending'
      : 'complete'
  const textView = turn.kind === 'text' ? resolveTextView(turn, reply) : null
  const segments = textView?.segments || []
  const card = segments.find((item) => item.kind === 'choices')
  if (card && card.kind === 'choices' && !picks[turn.id]) {
    picks[turn.id] = { value: card.card.initial, detail: '' }
  }
  const pick = picks[turn.id]

  let assistantContent: Content[] = []
  if (turn.status === 'error') {
    assistantContent = []
  } else if (generating || segments.length) {
    assistantContent = []
  } else if (textView?.assistantContent.length) {
    assistantContent = textView.assistantContent
  }

  const count = Math.max(1, Math.min(4, turn.count || 1))
  const places = generating ? Array.from({ length: count }, (_, i) => i) : []
  let progress = 0
  if (generating) {
    if (!startedAt[turn.id]) startedAt[turn.id] = now
    progress = arc(startedAt[turn.id], now)
  } else {
    delete startedAt[turn.id]
  }

  return {
    id: turn.id,
    kind: turn.kind,
    prompt: turn.prompt,
    status: turn.status,
    model: turn.model || '',
    inputImages,
    images: turn.images || [],
    errorLabel,
    assistantContent,
    assistantStatus:
      turn.status === 'error' ? 'error' : generating ? 'complete' : assistantStatus,
    showImages: turn.kind === 'image' && turn.status === 'done' && (turn.images || []).length > 0,
    generating,
    liveText: textView?.liveText || false,
    thinking,
    progress,
    places,
    segments,
    pick: pick?.value || '',
    detail: pick?.detail || '',
  }
}

function rowRenderKey(row: Row): string {
  const md = row.assistantContent[0]?.data
  const mdLen = typeof md === 'string' ? md.length : 0
  const segLen = row.segments.reduce((n, s) => {
    if (s.kind === 'md') return n + s.text.length
    if (s.kind === 'copy') return n + s.text.length
    return n + 1
  }, 0)
  return [
    row.status,
    row.thinking ? 1 : 0,
    row.liveText ? 1 : 0,
    row.generating ? 1 : 0,
    row.progress,
    row.showImages ? 1 : 0,
    row.images.length,
    row.pick,
    row.detail,
    row.errorLabel,
    mdLen,
    segLen,
    row.segments.length,
  ].join('|')
}

type ConvSelf = WechatMiniprogram.Component.TrivialInstance & { _turnList?: ChatTurn[] }

Component({
  data: {
    rows: [] as Row[],
    motion: true,
    scrollIntoView: '',
  },

  lifetimes: {
    detached() {
      this.stopClock()
      if (paintTimer) {
        clearTimeout(paintTimer)
        paintTimer = 0
      }
      if (scrollBottomTimer) {
        clearTimeout(scrollBottomTimer)
        scrollBottomTimer = 0
      }
    },
  },

  pageLifetimes: {
    hide() {
      this.stopClock()
      this.setData({ motion: false })
    },
    show() {
      this.setData({ motion: true })
      this.paint(this.currentTurns())
    },
  },

  methods: {
    currentTurns(): ChatTurn[] {
      return (this as ConvSelf)._turnList || []
    },

    applyTurns(turns: ChatTurn[]) {
      ;(this as ConvSelf)._turnList = Array.isArray(turns) ? turns : []
      if (!turns.length) this.setData({ rows: [], scrollIntoView: '' })
      this.schedulePaint(this.currentTurns())
    },

    scrollToBottom() {
      const rows = (this.data.rows || []) as Row[]
      const last = rows[rows.length - 1]
      if (!last) {
        this.setData({ scrollIntoView: '' })
        return
      }
      const anchor = `turn-${last.id}`
      if (this.data.scrollIntoView === anchor) {
        this.setData({ scrollIntoView: '' })
        wx.nextTick(() => this.setData({ scrollIntoView: anchor }))
      } else {
        this.setData({ scrollIntoView: anchor })
      }
    },

    scheduleScrollToBottom() {
      if (scrollBottomTimer) return
      scrollBottomTimer = setTimeout(() => {
        scrollBottomTimer = 0
        this.scrollToBottom()
      }, 80)
    },

    schedulePaint(turns: ChatTurn[]) {
      const list = Array.isArray(turns) ? turns : []
      if (paintTimer) clearTimeout(paintTimer)
      paintTimer = setTimeout(() => {
        paintTimer = 0
        this.paint(list)
      }, 80)
    },

    paint(turns: ChatTurn[]) {
      const list = Array.isArray(turns) ? turns : []
      const now = Date.now()
      const nextRows = list.map((turn) => toRow(turn, now))
      const prevRows = (this.data.rows || []) as Row[]

      let changed = false
      if (!prevRows.length || prevRows.length !== nextRows.length) {
        this.setData({ rows: nextRows })
        changed = true
      } else {
        const patch: Record<string, Row> = {}
        for (let i = 0; i < nextRows.length; i++) {
          if (prevRows[i].id !== nextRows[i].id || rowRenderKey(prevRows[i]) !== rowRenderKey(nextRows[i])) {
            patch[`rows[${i}]`] = nextRows[i]
          }
        }
        if (Object.keys(patch).length) {
          this.setData(patch)
          changed = true
        }
      }

      if (changed && nextRows.length) this.scheduleScrollToBottom()

      if (nextRows.some((row) => row.generating)) this.startClock()
      else this.stopClock()
    },

    startClock() {
      if (clock) return
      clock = setInterval(() => {
        this.paint(this.currentTurns())
      }, 200)
    },

    stopClock() {
      if (!clock) return
      clearInterval(clock)
      clock = 0
    },
    onCreate() {
      this.triggerEvent('create')
    },

    onRetry(e: WechatMiniprogram.BaseEvent) {
      this.triggerEvent('retry', { id: e.currentTarget.dataset.id })
    },

    onPreview(e: WechatMiniprogram.BaseEvent) {
      this.triggerEvent('preview', {
        id: e.currentTarget.dataset.id,
        src: e.currentTarget.dataset.src,
      })
    },

    onPreviewInput(e: WechatMiniprogram.BaseEvent) {
      const id = String(e.currentTarget.dataset.id || '')
      const src = String(e.currentTarget.dataset.src || '')
      const turn = this.currentTurns().find((item) => item.id === id)
      const urls = turn ? turnInputImages(turn) : src ? [src] : []
      if (!src || !urls.length) return
      wx.previewImage({ current: src, urls })
    },

    onSave(e: WechatMiniprogram.BaseEvent) {
      this.triggerEvent('save', { id: e.currentTarget.dataset.id })
    },

    onPickChoice(e: WechatMiniprogram.BaseEvent) {
      const id = String(e.currentTarget.dataset.id || '')
      const value = String(e.currentTarget.dataset.value || '')
      if (!id || !value || !picks[id]) return
      picks[id].value = value
      this.paint(this.currentTurns())
    },

    onDetail(e: { currentTarget: { dataset: { id?: string } }; detail: { value?: string } }) {
      const id = String(e.currentTarget.dataset.id || '')
      if (!id || !picks[id]) return
      picks[id].detail = e.detail.value || ''
      const rows = this.data.rows as Row[]
      const idx = rows.findIndex((row) => row.id === id)
      if (idx < 0) return
      this.setData({ [`rows[${idx}].detail`]: picks[id].detail })
    },

    onStartChoice(e: WechatMiniprogram.BaseEvent) {
      const id = String(e.currentTarget.dataset.id || '')
      const pick = picks[id]
      if (!pick?.value) return
      this.triggerEvent('choose', { prompt: choicePrompt(pick.value, pick.detail) })
    },

    onCopyGenUi(e: WechatMiniprogram.BaseEvent) {
      const id = String(e.currentTarget.dataset.id || '')
      const si = Number(e.currentTarget.dataset.si)
      if (!id || Number.isNaN(si)) return
      const row = this.data.rows.find((item) => item.id === id)
      const seg = row?.segments[si]
      if (!seg || seg.kind !== 'copy' || !seg.text) return
      wx.setClipboardData({
        data: seg.text,
        success: () => wx.showToast({ title: '已复制', icon: 'success' }),
      })
    },
  },
})
