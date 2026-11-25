import { CHAT_MODEL, IMAGE_MODEL } from '../../config/index'
import { ensureApiKey, isLoggedIn } from '../../services/auth'
import { chatStream } from '../../services/chat'
import type { ChatMessage } from '../../services/chat'
import { humanizeGenerateError, listImageModels, runGenerate } from '../../services/image-gen'
import { buildUserChatContent, chatTurnLabel } from '../../utils/chat-media'
import { persistGenerateOutputs } from '../../utils/image-result'
import { pickImages } from '../../utils/pick-image'
import { toPreviewableAll } from '../../utils/preview-media'
import {
  consumeComposerDraft,
  consumeOpenComposer,
  consumePendingCompose,
  setPendingCompose,
  syncInputImages,
  turnInputImages,
  type ChatTurn,
  type ComposeJob,
} from '../../utils/compose'
import {
  activateOrCreate,
  clearSessionTurns,
  createSession,
  deleteSession,
  ensureBootstrapped,
  formatSessionTime,
  getSession,
  loadAllSessions,
  sessionKindToTool,
  setActiveSessionId,
  updateSessionTurns,
  type ChatSession,
  type SessionKind,
} from '../../utils/chat-sessions'
import {
  IMAGE_COUNTS,
  IMAGE_QUALITIES,
  IMAGE_RATIOS,
  pickedImageSize,
  shortModelLabel,
} from '../../utils/image-options'
import {
  onPagePrivacyAgree,
  openPrivacyContractPage,
  refreshPagePrivacy,
} from '../../utils/privacy-page'

const RESOLUTIONS = [
  { id: 'auto', label: '自动' },
  { id: '1k', label: '1K' },
]

function localImage(src: string): Promise<string> {
  if (!/^https?:\/\//i.test(src) || /^https?:\/\/(tmp|usr)\//i.test(src)) {
    return Promise.resolve(src)
  }
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url: src,
      success(res) {
        if (res.statusCode === 200 && res.tempFilePath) resolve(res.tempFilePath)
        else reject(new Error('图片下载失败'))
      },
      fail(err) {
        reject(new Error(err.errMsg || '图片下载失败'))
      },
    })
  })
}

function workExt(path: string): string {
  if (/\.jpe?g($|\?)/i.test(path)) return 'jpg'
  if (/\.webp($|\?)/i.test(path)) return 'webp'
  return 'png'
}

/** 单条输入上限：与 Sub2API 侧 prompt 处理能力对齐，超长在输入阶段就截断 */
const PROMPT_LIMIT = 4000

const MAX_CHAT_REFS = 9
const MAX_IMAGE_REFS = 1

function mergeRefPaths(existing: string[], added: string[], max: number): string[] {
  const seen = new Set(existing)
  const out = existing.slice()
  for (const path of added) {
    if (!path || seen.has(path)) continue
    seen.add(path)
    out.push(path)
    if (out.length >= max) break
  }
  return out.slice(0, max)
}

type SessionRow = {
  id: string
  kind: SessionKind
  kindLabel: string
  title: string
  timeLabel: string
  active: boolean
}

Page({
  turns: [] as ChatTurn[],
  sessionId: '',
  pickSource: 'album' as 'album' | 'camera',
  /** 已存入作品集的 turn id：防重复提交，并与组件内 saved 态联动 */
  savedTurnIds: new Set<string>(),
  activeChatAbort: null as (() => void) | null,
  modelsLoaded: false,
  modelsLoading: false,
  data: {
    /** 仅用于空态；完整 turns 在 this.turns，避免 setData 整表传输 */
    turnCount: 0,
    sessionId: '',
    sessionTitle: '新对话',
    historyOpen: false,
    sessionRows: [] as SessionRow[],
    draft: '',
    tool: 'chat' as 'chat' | 'image',
    menuOpen: false,
    panelOpen: false,
    activeParam: '' as '' | 'model' | 'ratio' | 'count' | 'quality',
    imageModel: IMAGE_MODEL,
    imageModelShort: shortModelLabel(IMAGE_MODEL),
    imageModels: [IMAGE_MODEL],
    imageModelLabels: [`${IMAGE_MODEL}（默认）`],
    imageModelIndex: 0,
    modelOpen: false,
    ratios: IMAGE_RATIOS,
    qualities: IMAGE_QUALITIES,
    resolutions: RESOLUTIONS,
    counts: [...IMAGE_COUNTS],
    ratioId: 'auto',
    ratioLabel: '自动',
    ratioShort: '自动',
    quality: 'auto',
    qualityLabel: '',
    qualityShort: '自动',
    resolution: 'auto',
    count: 1,
    refImages: [] as string[],
    templateId: '',
    templateTitle: '',
    keyboard: 0,
    inputFocus: false,
    inputLines: 1,
    viewportHeight: 0,
    busy: false,
    advancedOpen: false,
    nearLimit: false,
    overLimit: false,
    canSend: false,
    chatIdeas: ['帮我写一段朋友圈文案', '今天适合拍什么', '把这段话改得更自然'],
    imageIdeas: ['一张清新的人像写真', '胶片感的街头照片', '一张极简海报'],
    privacyOk: false,
    showPrivacyPanel: false,
    privacyContractName: '用户隐私保护指引',
    privacyDesc: '',
  },

  onLoad() {
    this.setData({ viewportHeight: wx.getWindowInfo().windowHeight })
    const session = ensureBootstrapped()
    const turns = session.turns.map((turn) =>
      turn.status === 'generating'
        ? Object.assign({}, turn, { status: 'error' as const, error: '上次生成中断了，点重试' })
        : turn,
    )
    if (turns.some((t, i) => t !== session.turns[i])) {
      updateSessionTurns(session.id, turns)
    }
    this.mountSession(session, turns)
  },

  onReady() {
    this.syncConversation()
  },

  mountSession(session: ChatSession, turns?: ChatTurn[]) {
    const list = turns ?? session.turns
    this.sessionId = session.id
    this.turns = list
    const last = list[list.length - 1]
    this.setData({
      sessionId: session.id,
      sessionTitle: session.title,
      tool: sessionKindToTool(session.kind),
      turnCount: list.length,
      busy: list.some((turn) => turn.status === 'generating'),
      sessionRows: this.buildSessionRows(session.id),
    })
    wx.nextTick(() => {
      this.syncConversation()
      if (last) this.scrollConversationToBottom()
    })
  },

  syncConversation() {
    const conv = this.selectComponent('#chat-conversation') as WechatMiniprogram.Component.TrivialInstance & {
      applyTurns?: (turns: ChatTurn[]) => void
      scrollToBottom?: () => void
      scheduleScrollToBottom?: () => void
    }
    wx.nextTick(() => {
      const mounted = this.selectComponent('#chat-conversation') as typeof conv
      mounted?.applyTurns?.(this.turns || [])
    })
    this.setData({ busy: (this.turns || []).some((turn) => turn.status === 'generating') })
  },

  scrollConversationToBottom() {
    const conv = this.selectComponent('#chat-conversation') as WechatMiniprogram.Component.TrivialInstance & {
      scrollToBottom?: () => void
      scheduleScrollToBottom?: () => void
    }
    conv?.scheduleScrollToBottom?.()
  },

  buildSessionRows(activeId: string): SessionRow[] {
    return loadAllSessions().map((s) => ({
      id: s.id,
      kind: s.kind,
      kindLabel: s.kind === 'image' ? '画图' : '对话',
      title: s.title,
      timeLabel: formatSessionTime(s.updatedAt),
      active: s.id === activeId,
    }))
  },

  persistTurns(turns: ChatTurn[], titleFromPrompt?: string) {
    const id = this.sessionId
    if (!id) return
    updateSessionTurns(id, turns, titleFromPrompt ? { titleFromPrompt } : undefined)
    const session = getSession(id)
    this.setData({
      sessionTitle: session?.title || this.data.sessionTitle,
      sessionRows: this.buildSessionRows(id),
    })
  },

  switchSession(id: string) {
    const session = getSession(id)
    if (!session || session.id === this.sessionId) {
      this.setData({ historyOpen: false })
      return
    }
    setActiveSessionId(id)
    this.mountSession(session)
    this.setData({ historyOpen: false, menuOpen: false, panelOpen: session.kind === 'image' && this.data.panelOpen })
  },

  openNewSession(kind: SessionKind) {
    const session = createSession(kind)
    this.mountSession(session, [])
    this.setData({
      historyOpen: false,
      menuOpen: false,
      panelOpen: false,
      draft: '',
      inputLines: 1,
      canSend: false,
      refImages: [] as string[],
      templateId: '',
      templateTitle: '',
    })
  },

  ensureToolSession(tool: 'chat' | 'image') {
    const kind: SessionKind = tool === 'image' ? 'image' : 'chat'
    const current = getSession(this.sessionId)
    if (current?.kind === kind) return current
    const session = activateOrCreate(kind)
    this.mountSession(session)
    return session
  },

  onShow() {
    this.syncConversation()
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ value: '/pages/edit/index' })
    }
    void refreshPagePrivacy((patch) => this.setData(patch), 'picker')
    const job = isLoggedIn() ? consumePendingCompose() : null
    if (job) {
      this.ensureToolSession('image')
      this.pushTurn(job)
      return
    }
    if (consumeOpenComposer()) {
      this.ensureToolSession('image')
      this.setData({ panelOpen: false, menuOpen: false, historyOpen: false })
      this.syncTabBarVisibility()
    }
    const draft = consumeComposerDraft()
    if (!draft) return
    this.ensureToolSession('image')
    this.setData({
      draft: draft.prompt,
      canSend: !!draft.prompt.trim(),
      panelOpen: false,
      menuOpen: false,
      historyOpen: false,
      templateId: draft.templateId,
      templateTitle: draft.templateTitle,
    })
    this.syncTabBarVisibility()
  },

  noop() {},

  onToggleHistory() {
    this.onHideKeyboard()
    const open = !this.data.historyOpen
    this.setData({
      historyOpen: open,
      menuOpen: false,
      panelOpen: false,
      sessionRows: open ? this.buildSessionRows(this.sessionId) : this.data.sessionRows,
    })
    this.syncTabBarVisibility()
  },

  onCloseHistory() {
    this.setData({ historyOpen: false })
    this.syncTabBarVisibility()
  },

  onPickSession(e: WechatMiniprogram.BaseEvent) {
    const id = String(e.currentTarget.dataset.id || '')
    if (id) this.switchSession(id)
  },

  onNewSessionTap(e: WechatMiniprogram.BaseEvent) {
    const kind = e.currentTarget.dataset.kind === 'image' ? 'image' : 'chat'
    this.openNewSession(kind)
  },

  onNewSameKind() {
    const kind: SessionKind = this.data.tool === 'image' ? 'image' : 'chat'
    this.openNewSession(kind)
  },

  onDeleteSession(e: WechatMiniprogram.BaseEvent) {
    const id = String(e.currentTarget.dataset.id || '')
    if (!id) return
    wx.showModal({
      title: '删除会话',
      content: '删除后无法恢复，确定吗？',
      confirmColor: '#e34d59',
      success: (res) => {
        if (!res.confirm) return
        const fallback = deleteSession(id)
        if (fallback) {
          this.mountSession(fallback)
          this.setData({
            historyOpen: false,
            menuOpen: false,
            panelOpen: fallback.kind === 'image' && this.data.panelOpen,
            draft: '',
            inputLines: 1,
            canSend: false,
            refImages: [] as string[],
          })
        } else {
          this.setData({ sessionRows: this.buildSessionRows(this.sessionId) })
        }
        wx.showToast({ title: '已删除', icon: 'success' })
      },
    })
  },

  onClearCurrentSession() {
    if (!this.data.turnCount) {
      wx.showToast({ title: '当前没有消息', icon: 'none' })
      return
    }
    const id = this.sessionId
    if (!id) return
    wx.showModal({
      title: '清空当前会话',
      content: '将删除本会话全部消息，会话仍保留在列表中。确定吗？',
      confirmColor: '#e34d59',
      success: (res) => {
        if (!res.confirm) return
        const session = clearSessionTurns(id)
        this.turns = []
        this.setData({
          turnCount: 0,
          sessionTitle: session?.title || this.data.sessionTitle,
          sessionRows: this.buildSessionRows(id),
        })
        this.syncConversation()
        wx.showToast({ title: '已清空', icon: 'success' })
      },
    })
  },

  onClosePop() {
    this.setData({ menuOpen: false, panelOpen: false, historyOpen: false, modelOpen: false, activeParam: '' })
    this.syncTabBarVisibility()
  },

  onToggleMenu() {
    this.onHideKeyboard()
    this.setData({ menuOpen: !this.data.menuOpen, panelOpen: false, activeParam: '' })
    this.syncTabBarVisibility()
  },

  onToggleParam(e: WechatMiniprogram.BaseEvent) {
    this.onHideKeyboard()
    const key = String(e.currentTarget.dataset.param || '') as '' | 'model' | 'ratio' | 'count' | 'quality'
    const next = this.data.activeParam === key ? '' : key
    this.setData({ activeParam: next, menuOpen: false, panelOpen: false })
    if (next === 'model') void this.loadImageModels()
  },

  onTogglePanel() {
    this.onHideKeyboard()
    this.setData({ panelOpen: !this.data.panelOpen, menuOpen: false })
    this.syncTabBarVisibility()
    if (this.data.panelOpen) void this.loadImageModels()
  },

  onOpenImage() {
    this.onHideKeyboard()
    this.ensureToolSession('image')
    this.setData({ panelOpen: false, menuOpen: false, historyOpen: false, inputFocus: true })
    this.syncTabBarVisibility()
  },

  onIdea(e: WechatMiniprogram.BaseEvent) {
    const text = String(e.currentTarget.dataset.text || '')
    if (!text) return
    this.setData({ draft: text, canSend: true, menuOpen: false, panelOpen: false })
  },

  onKeyboard(e: WechatMiniprogram.CustomEvent<{ height?: number }>) {
    const keyboard = Number(e.detail?.height) || 0
    const was = this.data.keyboard
    if (keyboard === was) return
    this.setData({ keyboard })
    this.syncTabBarVisibility()
    // 键盘每一次高度变化都要把消息流贴回底部，否则会被顶起的输入坞盖住最后一条
    if (keyboard) {
      wx.nextTick(() => this.scrollConversationToBottom())
      setTimeout(() => this.scrollConversationToBottom(), 220)
    }
  },

  onHideKeyboard() {
    this.setData({ inputFocus: false })
    this.syncTabBarVisibility()
    wx.hideKeyboard({ complete: () => {
      this.setData({ keyboard: 0 })
      this.syncTabBarVisibility()
    } })
  },

  onInputFocus() {
    this.setData({ inputFocus: true, panelOpen: false, menuOpen: false, historyOpen: false })
    this.syncTabBarVisibility()
  },

  onInputBlur() {
    this.setData({ inputFocus: false })
  },

  onInputLineChange(e: WechatMiniprogram.CustomEvent<{ lineCount?: number }>) {
    const inputLines = Math.max(1, Math.min(4, Number(e.detail?.lineCount) || 1))
    if (inputLines !== this.data.inputLines) this.setData({ inputLines })
  },

  onHide() {
    this.setData({ panelOpen: false, menuOpen: false, historyOpen: false })
    this.onHideKeyboard()
  },

  onUnload() {
    this.activeChatAbort?.()
    this.activeChatAbort = null
  },

  onResize(e: { size: { windowHeight: number } }) {
    this.setData({ viewportHeight: e.size.windowHeight })
  },

  onToggleAdvanced() {
    this.setData({ advancedOpen: !this.data.advancedOpen })
  },

  onResetOptions() {
    this.setData({
      ratioId: 'auto',
      ratioLabel: '自动',
      ratioShort: '自动',
      quality: 'auto',
      qualityLabel: '',
      qualityShort: '自动',
      count: 1,
      resolution: 'auto',
      imageModel: IMAGE_MODEL,
      imageModelShort: shortModelLabel(IMAGE_MODEL),
      imageModelIndex: Math.max(0, this.data.imageModels.indexOf(IMAGE_MODEL)),
      activeParam: '',
    })
    wx.showToast({ title: '已恢复默认参数', icon: 'none' })
  },

  syncTabBarVisibility() {
    this.getTabBar?.()?.setData({ keyboardHidden: !!(this.data.keyboard || this.data.panelOpen || this.data.historyOpen) })
  },

  async loadImageModels() {
    if (this.modelsLoaded || this.modelsLoading || !isLoggedIn()) return
    this.modelsLoading = true
    try {
      const imageModels = await listImageModels()
      this.modelsLoaded = true
      this.setData({
        imageModels,
        imageModelLabels: imageModels.map((id) => (id === IMAGE_MODEL ? `${id}（默认）` : id)),
        imageModelIndex: Math.max(0, imageModels.indexOf(this.data.imageModel)),
        imageModelShort: shortModelLabel(this.data.imageModel),
      })
    } catch {
      wx.showToast({ title: '模型列表暂不可用，保留默认模型', icon: 'none' })
    } finally {
      this.modelsLoading = false
    }
  },

  onToggleModels() {
    this.setData({ modelOpen: !this.data.modelOpen })
    if (this.data.modelOpen) void this.loadImageModels()
  },

  onPickModel(e: WechatMiniprogram.BaseEvent) {
    const imageModelIndex = Number(e.currentTarget.dataset.index)
    const imageModel = this.data.imageModels[imageModelIndex]
    if (imageModel) {
      this.setData({
        imageModel,
        imageModelShort: shortModelLabel(imageModel),
        imageModelIndex,
        modelOpen: false,
        activeParam: '',
      })
    }
  },

  async onEditImage(e: WechatMiniprogram.CustomEvent<{ id?: string }>) {
    const turn = this.turns.find((item) => item.id === e.detail.id)
    if (!turn?.images.length) return
    try {
      const src = await localImage(turn.images[0])
      this.setData({ refImages: [src], panelOpen: false, menuOpen: false, inputFocus: false })
      this.syncCanSend({ refImages: [src] })
      wx.nextTick(() => this.setData({ inputFocus: true }))
    } catch {
      wx.showToast({ title: '图片读取失败，请重新添加', icon: 'none' })
    }
  },

  onPickTool(e: WechatMiniprogram.BaseEvent) {
    const tool = e.currentTarget.dataset.tool
    if (tool !== 'chat' && tool !== 'image') return
    this.ensureToolSession(tool)
    this.setData({
      menuOpen: false,
      activeParam: '',
      panelOpen: tool === 'image' ? this.data.panelOpen : false,
    })
    this.syncTabBarVisibility()
  },

  onPickOpt(e: WechatMiniprogram.BaseEvent) {
    const group = String(e.currentTarget.dataset.group || '')
    const id = String(e.currentTarget.dataset.id || '')
    if (group === 'quality') {
      const picked = IMAGE_QUALITIES.find((item) => item.id === id)
      if (!picked) return
      this.setData({
        quality: id,
        qualityLabel: id === 'auto' ? '' : picked.label,
        qualityShort: picked.shortLabel || picked.label,
        activeParam: '',
      })
      return
    }
    if (group === 'count') {
      const count = Number(id)
      if (count >= 1 && count <= 4) this.setData({ count, activeParam: '' })
      return
    }
    if (group === 'resolution' && RESOLUTIONS.some((item) => item.id === id)) {
      this.setData({ resolution: id, activeParam: '' })
      return
    }
    if (group === 'ratio') {
      const ratio = IMAGE_RATIOS.find((item) => item.id === id)
      if (!ratio) return
      this.setData({
        ratioId: id,
        ratioLabel: ratio.label,
        ratioShort: ratio.shortLabel || ratio.label,
        activeParam: '',
      })
    }
  },

  composerRefLimit(): number {
    return this.data.tool === 'image' ? MAX_IMAGE_REFS : MAX_CHAT_REFS
  },

  syncCanSend(patch?: { draft?: string; refImages?: string[] }) {
    const draft = patch?.draft ?? this.data.draft
    const refImages = patch?.refImages ?? this.data.refImages
    const canSend = !!String(draft).trim() || !!(refImages && refImages.length)
    if (canSend !== this.data.canSend) this.setData({ canSend })
  },

  onDraft(e: WechatMiniprogram.CustomEvent<{ value?: string }>) {
    const draft = e.detail?.value || ''
    // 单次输入上限与后端 prompt 限制对齐，超长在输入阶段就截断，避免发送后才报错
    const capped = draft.length > PROMPT_LIMIT ? draft.slice(0, PROMPT_LIMIT) : draft
    if (capped !== draft) wx.showToast({ title: `最多 ${PROMPT_LIMIT} 字`, icon: 'none' })
    const nearLimit = capped.length > PROMPT_LIMIT - 200
    const patch: Record<string, unknown> = { draft: capped, nearLimit, overLimit: capped.length >= PROMPT_LIMIT }
    if (!capped) patch.inputLines = 1
    this.setData(patch)
    this.syncCanSend({ draft: capped })
  },

  onOpenPrivacyContract() {
    openPrivacyContractPage()
  },

  onPrivacyAgree() {
    onPagePrivacyAgree(this, 'edit-agree-btn', () => this.chooseRef())
  },

  onCamera() {
    this.pickRef('camera')
  },

  onAlbum() {
    this.pickRef('album')
  },

  pickRef(source: 'album' | 'camera') {
    this.pickSource = source
    if (!this.data.privacyOk) {
      this.setData({ showPrivacyPanel: true })
      return
    }
    this.chooseRef()
  },

  chooseRef() {
    const max = this.composerRefLimit()
    const current = this.data.refImages || []
    if (current.length >= max) {
      wx.showToast({ title: max === 1 ? '画图仅支持 1 张参考图' : `最多 ${max} 张图片`, icon: 'none' })
      return
    }
    const pickCount = this.pickSource === 'camera' ? 1 : max - current.length
    pickImages(this.pickSource, pickCount)
      .then((paths) => {
        const refImages =
          max === 1 ? paths.slice(0, 1) : mergeRefPaths(current, paths, max)
        this.setData({ refImages, menuOpen: false })
        this.syncCanSend({ refImages })
      })
      .catch(() => {})
  },

  onRemoveRef(e: WechatMiniprogram.BaseEvent) {
    const index = Number(e.currentTarget.dataset.index)
    const refImages = (this.data.refImages || []).filter((_, i) => i !== index)
    this.setData({ refImages })
    this.syncCanSend({ refImages })
  },

  imageJob(prompt: string, imagePaths: string[]): ComposeJob {
    const sized = pickedImageSize(this.data.ratioId, this.data.resolution)
    const synced = syncInputImages(imagePaths)
    return Object.assign({}, synced, {
      prompt,
      size: sized.size,
      ratioLabel: sized.label,
      count: this.data.count,
      quality: this.data.quality,
      templateId: this.data.templateId,
      templateTitle: this.data.templateTitle,
      model: this.data.imageModel,
    })
  },

  onChoose(e: WechatMiniprogram.CustomEvent<{ prompt?: string }>) {
    const prompt = String(e.detail?.prompt || '').trim()
    if (!prompt) return
    if (!isLoggedIn()) {
      this.setData({ draft: prompt, canSend: true, menuOpen: false, panelOpen: false })
      wx.navigateTo({ url: '/pages/login/index' })
      return
    }
    this.pushText(prompt)
  },

  onStopStream() {
    this.activeChatAbort?.()
    this.activeChatAbort = null
  },

  onSendTap() {
    this.submit(this.data.draft)
  },

  onSend(e: WechatMiniprogram.CustomEvent<{ value?: string }>) {
    this.submit(String(e.detail?.value || this.data.draft || ''))
  },

  submit(raw: string) {
    if (this.data.busy) {
      wx.showToast({ title: '正在生成，可先编辑下一条消息', icon: 'none' })
      return
    }
    const prompt = raw.trim()
    const refImages = (this.data.refImages || []).slice()
    if (this.data.tool === 'image') {
      if (!prompt) {
        wx.showToast({ title: '先写下想生成的画面', icon: 'none' })
        return
      }
    } else if (!prompt && !refImages.length) {
      wx.showToast({ title: '输入文字或添加图片', icon: 'none' })
      return
    }
    this.ensureToolSession(this.data.tool)
    // 发送后重置输入区状态：清空草稿、收起键盘、长度提示归零
    this.setData({
      menuOpen: false,
      panelOpen: false,
      draft: '',
      canSend: false,
      inputLines: 1,
      refImages: [],
      nearLimit: false,
      overLimit: false,
    })
    if (this.data.tool === 'image') {
      const job = this.imageJob(prompt, refImages)
      this.setData({ templateId: '', templateTitle: '' })
      if (!isLoggedIn()) {
        setPendingCompose(job)
        wx.navigateTo({ url: '/pages/login/index' })
        return
      }
      this.pushTurn(job)
      return
    }
    if (!isLoggedIn()) {
      this.setData({ draft: prompt, refImages, canSend: true })
      wx.navigateTo({ url: '/pages/login/index' })
      return
    }
    this.pushText(prompt, refImages)
  },

  pushText(prompt: string, imagePaths: string[] = []) {
    const synced = syncInputImages(imagePaths)
    const turn = Object.assign({}, synced, {
      id: `t${Date.now()}`,
      kind: 'text' as const,
      prompt,
      reply: '',
      size: '',
      ratioLabel: '',
      count: 1,
      templateId: '',
      templateTitle: '',
      model: CHAT_MODEL,
      status: 'generating' as const,
      images: [] as string[],
      error: '',
    }) as ChatTurn
    const turns = (this.turns || []).concat(turn).slice(-40)
    this.turns = turns
    this.setData({ turnCount: turns.length })
    this.syncConversation()
    this.persistTurns(turns, chatTurnLabel(prompt, synced.imagePaths))
    void this.runTurn(turn.id)
  },

  pushTurn(job: ComposeJob) {
    const turn = Object.assign({}, job, {
      id: `t${Date.now()}`,
      kind: 'image' as const,
      model: job.model || IMAGE_MODEL,
      reply: '',
      status: 'generating' as const,
      images: [] as string[],
      error: '',
    }) as ChatTurn
    const turns = (this.turns || []).concat(turn).slice(-40)
    this.turns = turns
    this.setData({ turnCount: turns.length })
    this.syncConversation()
    this.persistTurns(turns, job.prompt)
    void this.runTurn(turn.id)
  },

  patchTurn(id: string, patch: Partial<ChatTurn>, persist = true, sessionId?: string) {
    const targetSessionId = sessionId || this.sessionId
    if (targetSessionId !== this.sessionId) {
      const session = getSession(targetSessionId)
      if (session && persist) updateSessionTurns(targetSessionId, session.turns.map((turn) =>
        turn.id === id ? Object.assign({}, turn, patch) : turn,
      ))
      return
    }
    const prev = this.turns || []
    const idx = prev.findIndex((turn) => turn.id === id)
    if (idx < 0) return
    const turns = prev.map((turn, i) =>
      i === idx ? (Object.assign({}, turn, patch) as ChatTurn) : turn,
    )
    this.turns = turns

    if (Object.keys(patch).length) this.syncConversation()
    if (persist) this.persistTurns(turns)
  },

  async runTurn(id: string) {
    const sessionId = this.sessionId
    const contextTurns = (this.turns || []).slice()
    const patch = (value: Partial<ChatTurn>, persist = true) => this.patchTurn(id, value, persist, sessionId)
    const turn = (this.turns || []).find((item) => item.id === id)
    if (!turn) return
    const startedAt = Date.now()
    patch({ status: 'generating', error: '', images: [], reply: '', startedAt, durationMs: undefined })
    try {
      if (turn.kind === 'text') {
        await ensureApiKey()
        const messages: ChatMessage[] = []
        for (const item of contextTurns) {
          if (item.kind !== 'text' || item.id === id || item.status !== 'done' || !item.reply) continue
          messages.push({
            role: 'user',
            content: await buildUserChatContent(item.prompt, turnInputImages(item)),
          })
          messages.push({ role: 'assistant', content: item.reply })
        }
        messages.push({
          role: 'user',
          content: await buildUserChatContent(turn.prompt, turnInputImages(turn)),
        })
        let latest = ''
        let timer: ReturnType<typeof setTimeout> | 0 = 0
        const paint = () => {
          timer = 0
          patch({ reply: latest, status: 'generating' }, false)
        }
        let reply = ''
        try {
          reply = await chatStream(
            messages,
            (text) => {
              latest = text
              if (timer) return
              timer = setTimeout(paint, 50)
            },
            {
              onAbortReady: (abort) => {
                this.activeChatAbort = abort
              },
            },
          )
        } finally {
          if (timer) clearTimeout(timer)
          this.activeChatAbort = null
        }
        patch({ status: 'done', reply: reply || latest, error: '' })
        return
      }
      const result = await runGenerate({
        prompt: turn.prompt,
        imagePath: turn.imagePath || undefined,
        size: turn.size || 'auto',
        n: turn.count || 1,
        model: turn.model || IMAGE_MODEL,
        quality: turn.quality,
      })
      const images = await persistGenerateOutputs(result)
      patch({ status: 'done', images, error: '', durationMs: Date.now() - startedAt })
    } catch (err) {
      const raw = err instanceof Error ? err.message : '生成失败'
      patch({ status: 'error', error: humanizeGenerateError(raw), images: [] })
      if (/未登录/.test(raw)) wx.navigateTo({ url: '/pages/login/index' })
    }
  },

  onRetry(e: WechatMiniprogram.CustomEvent<{ id?: string }>) {
    const id = String(e.detail?.id || '')
    const turn = (this.turns || []).find((item) => item.id === id)
    if (!id || !turn || turn.status === 'generating') return
    this.patchTurn(id, { status: 'generating', error: '', images: [] })
    void this.runTurn(id)
  },

  async onPreview(e: WechatMiniprogram.CustomEvent<{ id?: string; src?: string }>) {
    const id = String(e.detail?.id || '')
    const src = String(e.detail?.src || '')
    const turn = (this.turns || []).find((item) => item.id === id)
    const raw = turn?.images?.length ? turn.images : src ? [src] : []
    if (!src || !raw.length) return
    // 永久目录路径 previewImage 会一直转圈，先转临时路径
    const urls = await toPreviewableAll(raw)
    const current = urls[raw.indexOf(src)] || urls[0]
    wx.previewImage({ current, urls })
  },

  async onSave(e: WechatMiniprogram.CustomEvent<{ id?: string }>) {
    const id = String(e.detail?.id || '')
    const turn = (this.turns || []).find((item) => item.id === id)
    if (!turn?.images.length) return
    if (this.savedTurnIds.has(id)) return // 已存过，静默忽略重复点击
    wx.showLoading({ title: '保存中', mask: true })
    try {
      for (const src of turn.images) await archiveWork(src, turn)
      wx.hideLoading()
      this.savedTurnIds.add(id)
      ;(this.selectComponent('#chat-conversation') as any)?.markSaved?.(id)
      wx.showToast({ title: '已放入作品集', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      const message = (err as { errMsg?: string; message?: string })?.errMsg
        || (err as { message?: string })?.message
        || ''
      wx.showToast({
        title: /未登录|云开发/.test(message) ? message : '保存失败，请再试一次',
        icon: 'none',
      })
    }
  },
})

function archiveWork(src: string, turn: ChatTurn): Promise<void> {
  if (!wx.cloud || typeof wx.cloud.uploadFile !== 'function') {
    return Promise.reject(new Error('云开发还没就绪'))
  }
  return localImage(src).then((filePath) => {
    const cloudPath = `works/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${workExt(filePath)}`
    return wx.cloud.uploadFile({ cloudPath, filePath }).then((upload) =>
      wx.cloud.callFunction({
        name: 'userworks',
        data: {
          action: 'addWork',
          userId: wx.getStorageSync('user_openid') || 'demo_user',
          url: upload.fileID,
          templateId: turn.templateId || null,
          prompt: turn.prompt,
        },
      }),
    )
  }).then((res) => {
    const result = res.result as { code?: number; message?: string } | undefined
    if (!result || result.code !== 0) throw new Error(result?.message || '保存失败')
  })
}
