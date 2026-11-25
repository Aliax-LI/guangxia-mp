import type { ChatTurn } from '../../utils/compose'
import { turnInputImages } from '../../utils/compose'
import { copyText } from '../../utils/clipboard'
import { toPreviewableAll } from '../../utils/preview-media'
import {
  choicePrompt,
  normalizeReply,
  parseReply,
  stripGenUiForMarkdown,
  type ReplySegment,
} from '../../utils/gen-ui'

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
  markdown: string
  assistantStatus: 'pending' | 'streaming' | 'error' | 'complete'
  showImages: boolean
  /** 是否已存入作品集：保存成功后置位，按钮转为已存态 */
  saved: boolean
  generating: boolean
  liveText: boolean
  thinking: boolean
  stage: string
  loadingMessage: string
  elapsed: string
  duration: string
  waitPadding: number
  copyImageUrl: string
  places: number[]
  segments: ReplySegment[]
  pick: string
  detail: string
}

const parseCache = new Map<
  string,
  { reply: string; segments: ReplySegment[]; markdown: string; liveText: boolean }
>()

const startedAt: Record<string, number> = {}
/** 已保存的 turn id：页面级状态，组件重挂载也不丢 */
const savedTurns = new Set<string>()
const picks: Record<string, { value: string; detail: string }> = {}

function formatElapsed(milliseconds: number): string {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remaining = seconds % 60
  const two = (value: number) => String(value).padStart(2, '0')
  return hours ? `${hours}:${two(minutes)}:${two(remaining)}` : `${two(minutes)}:${two(remaining)}`
}

/** 等待时的提示文案；不代表服务端实际进度。 */
function loadingMessage(milliseconds: number): string {
  const seconds = Math.max(0, milliseconds) / 1000
  if (seconds < 4) return '正在准备画布'
  if (seconds < 10) return '正在起稿'
  if (seconds < 22) return '正在上色'
  if (seconds < 45) return '正在收尾'
  return '正在努力生成'
}

function resolveTextView(turn: ChatTurn, reply: string) {
  const cached = parseCache.get(turn.id)
  if (cached && cached.reply === turn.reply) {
    return cached
  }
  const segments = turn.kind === 'text' && reply ? parseReply(reply) || [] : []
  let markdown = ''
  if (turn.status !== 'error' && turn.kind !== 'image' && reply && !segments.length) {
    markdown = turn.kind === 'text' ? stripGenUiForMarkdown(reply) : reply
  }
  const liveText = turn.kind === 'text' && turn.status === 'generating' && !!reply && !segments.length
  const view = { reply: turn.reply, segments, markdown, liveText }
  parseCache.set(turn.id, view)
  if (parseCache.size > 80) {
    const first = parseCache.keys().next().value
    if (first !== undefined) parseCache.delete(first)
  }
  return view
}

function toRow(turn: ChatTurn, now: number): Row {
  const dimensions = /^(\d+)x(\d+)$/.exec(turn.size || '')
  const width = dimensions ? Number(dimensions[1]) : 0
  const height = dimensions ? Number(dimensions[2]) : 0
  const waitPadding = width > 0 && height > 0 ? (height / width) * 100 : 100
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

  const markdown =
    turn.status === 'error' || generating || segments.length ? '' : textView?.markdown || ''

  const count = Math.max(1, Math.min(4, turn.count || 1))
  const places = generating ? Array.from({ length: count }, (_, i) => i) : []
  let elapsed = ''
  let message = ''
  if (generating) {
    if (!startedAt[turn.id]) startedAt[turn.id] = now
    const elapsedMs = now - (turn.startedAt || startedAt[turn.id])
    elapsed = formatElapsed(elapsedMs)
    message = loadingMessage(elapsedMs)
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
    markdown,
    assistantStatus:
      turn.status === 'error' ? 'error' : generating ? 'complete' : assistantStatus,
    showImages: turn.kind === 'image' && turn.status === 'done' && (turn.images || []).length > 0,
    saved: savedTurns.has(turn.id),
    generating,
    liveText: textView?.liveText || false,
    thinking,
    stage: generating ? (inputImages.length ? '正在编辑图片' : '正在生成图片') : '',
    loadingMessage: message,
    elapsed,
    duration: turn.status === 'done' && typeof turn.durationMs === 'number' ? formatElapsed(turn.durationMs) : '',
    waitPadding,
    copyImageUrl: (turn.images || []).find((src) => /^https?:\/\//i.test(src) && !/^https?:\/\/(tmp|usr)\//i.test(src)) || '',
    places,
    segments,
    pick: pick?.value || '',
    detail: pick?.detail || '',
  }
}

function rowRenderKey(row: Row): string {
  const md = row.markdown
  const mdTail = md ? `${md.length}:${md.slice(-12)}` : '0'
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
    row.elapsed,
    row.loadingMessage,
    row.duration,
    row.waitPadding,
    row.copyImageUrl,
    row.showImages ? 1 : 0,
    row.images.length,
    row.pick,
    row.detail,
    row.errorLabel,
    mdTail,
    segLen,
    row.segments.length,
  ].join('|')
}

type ConvSelf = WechatMiniprogram.Component.TrivialInstance & {
  _turnList?: ChatTurn[]
  _viewportHeight?: number
  _lastScrollTop?: number
  _programmaticScrollUntil?: number
  _clock?: ReturnType<typeof setInterval> | 0
  _paintQueued?: boolean
  _scrollTimer?: ReturnType<typeof setTimeout> | 0
  _readyTimer?: ReturnType<typeof setTimeout> | 0
}

Component({
  data: {
    rows: [] as Row[],
    ready: false,
    motion: true,
    scrollIntoView: '',
    scrollAnimated: false,
    following: true,
    copyFallbackText: '',
  },

  lifetimes: {
    attached() {
      const self = this as ConvSelf
      self._readyTimer = setTimeout(() => {
        if (!this.data.ready) this.setData({ ready: true })
      }, 150)
    },
    detached() {
      this.stopClock()
      const self = this as ConvSelf
      if (self._readyTimer) {
        clearTimeout(self._readyTimer)
        self._readyTimer = 0
      }
      if (self._scrollTimer) {
        clearTimeout(self._scrollTimer)
        self._scrollTimer = 0
      }
      self._paintQueued = false
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
      const previous = this.currentTurns()
      const appended = previous[previous.length - 1]?.id !== turns[turns.length - 1]?.id
      ;(this as ConvSelf)._turnList = Array.isArray(turns) ? turns : []
      if (appended && !this.data.following) this.setData({ following: true })
      if (!turns.length) {
        this.setData({ rows: [], ready: true, scrollIntoView: '' })
        this.stopClock()
        return
      }
      this.schedulePaint()
    },

    onTapLatest() {
      this.scrollToBottom(true)
    },

    scrollToBottom(animated = false) {
      const self = this as ConvSelf
      self._programmaticScrollUntil = Date.now() + (animated ? 400 : 180)
      if (!this.data.following) this.setData({ following: true })
      const rows = (this.data.rows || []) as Row[]
      if (!rows.length) {
        this.setData({ scrollIntoView: '' })
        return
      }
      const anchor = 'thread-end'
      if (this.data.scrollAnimated !== animated) {
        this.setData({ scrollAnimated: animated })
      }
      if (this.data.scrollIntoView === anchor) {
        // 同一锚点重设：流式期间关闭动画，避免每帧重启动画导致跳动
        this.setData({ scrollIntoView: '' })
        wx.nextTick(() => this.setData({ scrollIntoView: anchor }))
      } else {
        this.setData({ scrollIntoView: anchor })
      }
    },

    scheduleScrollToBottom() {
      if (!this.data.following) return
      const self = this as ConvSelf
      if (self._scrollTimer) return
      self._scrollTimer = setTimeout(() => {
        self._scrollTimer = 0
        if (this.data.following) this.scrollToBottom(false)
      }, 32)
    },

    onThreadTouch() {
      const self = this as ConvSelf
      if (self._scrollTimer) {
        clearTimeout(self._scrollTimer)
        self._scrollTimer = 0
      }
      self._programmaticScrollUntil = 0
    },

    onThreadScroll(e: WechatMiniprogram.CustomEvent<{ scrollTop: number; scrollHeight: number }>) {
      const self = this as ConvSelf
      const scrollTop = e.detail.scrollTop
      const prevTop = self._lastScrollTop ?? scrollTop
      self._lastScrollTop = scrollTop
      const scrolledUp = scrollTop < prevTop - 8

      const update = (height: number) => {
        const nearBottom = e.detail.scrollHeight - scrollTop - height < 64
        if (nearBottom) {
          if (!this.data.following) this.setData({ following: true })
          return
        }
        // 自动滚底期间的布局滞后不取消跟随，只有用户主动上滑才退出跟随
        const inAutoScroll = (self._programmaticScrollUntil || 0) > Date.now()
        if ((!inAutoScroll || scrolledUp) && this.data.following) {
          this.setData({ following: false, scrollIntoView: '' })
        }
      }
      const height = self._viewportHeight
      if (height) {
        update(height)
        return
      }
      this.createSelectorQuery().select('.thread-scroll').boundingClientRect((rect) => {
        const box = rect as WechatMiniprogram.BoundingClientRectCallbackResult
        if (box?.height) {
          self._viewportHeight = box.height
          update(box.height)
        }
      }).exec()
    },

    onMediaLoad() {
      this.scheduleScrollToBottom()
    },

    onEditImage(e: WechatMiniprogram.BaseEvent) {
      this.triggerEvent('editimage', { id: e.currentTarget.dataset.id })
    },

    schedulePaint(reason: 'append' | 'interaction' = 'append') {
      const self = this as ConvSelf
      if (self._paintQueued) return
      self._paintQueued = true
      wx.nextTick(() => {
        self._paintQueued = false
        this.paint(this.currentTurns(), reason)
      })
    },

    paint(turns: ChatTurn[], reason: 'append' | 'interaction' = 'append') {
      const list = Array.isArray(turns) ? turns : []
      const now = Date.now()
      const nextRows = list.map((turn) => toRow(turn, now))
      const prevRows = (this.data.rows || []) as Row[]

      let changed = false
      if (!this.data.ready) {
        this.setData({ rows: nextRows, ready: true })
        changed = true
      } else if (!prevRows.length || prevRows.length !== nextRows.length) {
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

      // 只有「内容在增长」才回贴底部；用户点选项/输备注引发的 repaint 不滚动，
      // 否则视图会被强行拽走（用户看到的就是"跳到输出开头"）
      const grew = nextRows.length !== prevRows.length || nextRows.some((row, i) => {
        const prev = prevRows[i]
        return !prev || row.showImages !== prev.showImages || row.status !== prev.status ||
          (row.kind === 'text' && (row.markdown !== prev.markdown || row.segments !== prev.segments))
      })
      if (changed && grew && nextRows.length && reason === 'append') this.scheduleScrollToBottom()

      if (nextRows.some((row) => row.generating)) this.startClock()
      else this.stopClock()
    },

    startClock() {
      const self = this as ConvSelf
      if (self._clock) return
      self._clock = setInterval(() => {
        this.paint(this.currentTurns())
      }, 1000)
    },

    stopClock() {
      const self = this as ConvSelf
      if (!self._clock) return
      clearInterval(self._clock)
      self._clock = 0
    },
    onCreate() {
      this.triggerEvent('create')
    },

    onRetry(e: WechatMiniprogram.BaseEvent) {
      this.triggerEvent('retry', { id: e.currentTarget.dataset.id })
    },

    openCopyFallback(text: string) {
      this.setData({ copyFallbackText: text })
    },

    onCloseCopyFallback() {
      this.setData({ copyFallbackText: '' })
    },

    noop() {},

    onCopyReply(e: WechatMiniprogram.BaseEvent) {
      const turn = this.currentTurns().find((item) => item.id === e.currentTarget.dataset.id)
      if (!turn || turn.kind !== 'text' || !turn.reply) return
      const data = stripGenUiForMarkdown(normalizeReply(turn.reply)).trim()
      if (!data) return
      copyText(data, { onPrivacyFallback: (text) => this.openCopyFallback(text) })
    },

    onCopyImageLink(e: WechatMiniprogram.BaseEvent) {
      const row = (this.data.rows as Row[]).find((item) => item.id === e.currentTarget.dataset.id)
      if (!row?.copyImageUrl) return
      copyText(row.copyImageUrl, { onPrivacyFallback: (text) => this.openCopyFallback(text) })
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
      const raw = turn ? turnInputImages(turn) : src ? [src] : []
      if (!src || !raw.length) return
      toPreviewableAll(raw).then((urls) => {
        const current = urls[raw.indexOf(src)] || urls[0]
        wx.previewImage({ current, urls })
      })
    },

    onSave(e: WechatMiniprogram.BaseEvent) {
      this.triggerEvent('save', { id: e.currentTarget.dataset.id })
    },

    /** 页面在保存成功后调用：按钮转为「已存作品集」并禁点 */
    markSaved(id: string) {
      if (!id) return
      savedTurns.add(id)
      const rows = (this.data.rows || []) as Row[]
      const next = rows.map((r) => (r.id === id && !r.saved ? { ...r, saved: true } : r))
      if (next.some((r, i) => r !== rows[i])) this.setData({ rows: next })
    },

    onPickChoice(e: WechatMiniprogram.BaseEvent) {
      const id = String(e.currentTarget.dataset.id || '')
      const value = String(e.currentTarget.dataset.value || '')
      if (!id || !value || !picks[id]) return
      picks[id].value = value
      this.paint(this.currentTurns(), 'interaction')
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
      const rows = this.data.rows as Row[]
      const row = rows.find((item) => item.id === id)
      const seg = row?.segments[si]
      if (!seg || seg.kind !== 'copy' || !seg.text) return
      copyText(seg.text, {
        successTitle: '已复制',
        onPrivacyFallback: (text) => this.openCopyFallback(text),
      })
    },
  },
})
