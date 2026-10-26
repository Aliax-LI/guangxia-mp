import type { ChatTurn } from '../../utils/compose'
import { choicePrompt, normalizeReply, parseReply, type ReplySegment } from '../../utils/gen-ui'

type Content = { type: string; data: unknown }

type Row = ChatTurn & {
  userContent: Content[]
  assistantContent: Content[]
  assistantStatus: 'pending' | 'streaming' | 'error' | 'complete'
  showImages: boolean
  generating: boolean
  liveText: boolean
  progress: number
  places: number[]
  segments: ReplySegment[]
  pick: string
  detail: string
}

const startedAt: Record<string, number> = {}
const picks: Record<string, { value: string; detail: string }> = {}
let clock: ReturnType<typeof setInterval> | 0 = 0

function arc(from: number, now: number): number {
  const elapsed = Math.max(0, now - from)
  const pct = 92 * (1 - Math.exp(-elapsed / 14000))
  return Math.max(1, Math.min(92, Math.round(pct)))
}

function toRow(turn: ChatTurn, now: number): Row {
  const userContent: Content[] = []
  if (turn.imagePath) {
    userContent.push({
      type: 'attachment',
      data: [
        {
          fileType: 'image',
          name: '参考图',
          url: turn.imagePath,
          size: 0,
          status: 'success',
        },
      ],
    })
  }
  userContent.push({ type: 'text', data: turn.prompt || '' })

  const generating = turn.kind === 'image' && turn.status === 'generating'
  const reply = turn.reply ? normalizeReply(turn.reply) : ''
  const assistantStatus =
    turn.status === 'generating' ? (reply || generating ? 'streaming' : 'pending') : 'complete'
  const segments = turn.kind === 'text' && reply && turn.status !== 'error' ? parseReply(reply) || [] : []
  const card = segments.find((item) => item.kind === 'choices')
  if (card && card.kind === 'choices' && !picks[turn.id]) {
    picks[turn.id] = { value: card.card.initial, detail: '' }
  }
  const pick = picks[turn.id]

  let assistantContent: Content[] = []
  if (turn.status === 'error') {
    assistantContent = [{ type: 'text', data: (turn.error || '失败了').replace(/，点重试$/, '') }]
  } else if (generating || segments.length) {
    assistantContent = []
  } else if (turn.kind !== 'image' && reply) {
    assistantContent = [{ type: 'markdown', data: reply }]
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
    ...turn,
    userContent,
    assistantContent,
    assistantStatus: generating ? 'complete' : assistantStatus,
    showImages: turn.kind === 'image' && turn.status === 'done' && (turn.images || []).length > 0,
    generating,
    liveText: turn.kind === 'text' && turn.status === 'generating' && !!reply && !segments.length,
    progress,
    places,
    segments,
    pick: pick?.value || '',
    detail: pick?.detail || '',
  }
}

Component({
  properties: {
    turns: { type: Array, value: [] },
  },

  data: {
    rows: [] as Row[],
    motion: true,
  },

  lifetimes: {
    detached() {
      this.stopClock()
    },
  },

  pageLifetimes: {
    hide() {
      this.stopClock()
      this.setData({ motion: false })
    },
    show() {
      this.setData({ motion: true })
      this.paint(this.properties.turns as ChatTurn[])
    },
  },

  observers: {
    turns(turns: ChatTurn[]) {
      this.paint(turns)
    },
  },

  methods: {
    paint(turns: ChatTurn[]) {
      const list = Array.isArray(turns) ? turns : []
      const now = Date.now()
      const rows = list.map((turn) => toRow(turn, now))
      this.setData({ rows })
      if (rows.some((row) => row.generating)) this.startClock()
      else this.stopClock()
    },

    startClock() {
      if (clock) return
      clock = setInterval(() => {
        this.paint(this.properties.turns as ChatTurn[])
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

    onSave(e: WechatMiniprogram.BaseEvent) {
      this.triggerEvent('save', { id: e.currentTarget.dataset.id })
    },

    onPickChoice(e: WechatMiniprogram.BaseEvent) {
      const id = String(e.currentTarget.dataset.id || '')
      const value = String(e.currentTarget.dataset.value || '')
      if (!id || !value || !picks[id]) return
      picks[id].value = value
      this.paint(this.properties.turns as ChatTurn[])
    },

    onDetail(e: { currentTarget: { dataset: { id?: string } }; detail: { value?: string } }) {
      const id = String(e.currentTarget.dataset.id || '')
      if (!id || !picks[id]) return
      picks[id].detail = e.detail.value || ''
      const rows = this.data.rows.map((row) => (row.id === id ? { ...row, detail: picks[id].detail } : row))
      this.setData({ rows })
    },

    onStartChoice(e: WechatMiniprogram.BaseEvent) {
      const id = String(e.currentTarget.dataset.id || '')
      const pick = picks[id]
      if (!pick?.value) return
      this.triggerEvent('choose', { prompt: choicePrompt(pick.value, pick.detail) })
    },
  },
})
