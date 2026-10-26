import { CHAT_MODEL, IMAGE_MODEL } from '../../config/index'
import { ensureApiKey, isLoggedIn } from '../../services/auth'
import { chatStream } from '../../services/chat'
import { humanizeGenerateError, runGenerate } from '../../services/image-gen'
import { persistGenerateOutputs } from '../../utils/image-result'
import { pickOneImage } from '../../utils/pick-image'
import {
  consumeComposerDraft,
  consumeOpenComposer,
  consumePendingCompose,
  loadTurns,
  saveTurns,
  setPendingCompose,
  type ChatTurn,
  type ComposeJob,
} from '../../utils/compose'
import {
  onPagePrivacyAgree,
  openPrivacyContractPage,
  refreshPagePrivacy,
} from '../../utils/privacy-page'

type Opt = { id: string; label: string; size?: string }

/** 网关尺寸只有 auto / 1024 方图 / 1536 横竖图。2:3、3:4、9:16 共用竖图，3:2、4:3、16:9 共用横图。 */
const RATIOS: Opt[] = [
  { id: 'auto', label: '自动', size: 'auto' },
  { id: '1:1', label: '1:1', size: '1024x1024' },
  { id: '2:3', label: '2:3', size: '1024x1536' },
  { id: '3:2', label: '3:2', size: '1536x1024' },
  { id: '3:4', label: '3:4', size: '1024x1536' },
  { id: '4:3', label: '4:3', size: '1536x1024' },
  { id: '9:16', label: '9:16', size: '1024x1536' },
  { id: '16:9', label: '16:9', size: '1536x1024' },
]

const QUALITIES: Opt[] = [
  { id: 'auto', label: '自动' },
  { id: 'low', label: '低' },
  { id: 'medium', label: '中' },
  { id: 'high', label: '高' },
]

const RESOLUTIONS: Opt[] = [
  { id: 'auto', label: '自动' },
  { id: '1k', label: '1K' },
]

function pickedSize(ratioId: string, resolution: string): { size: string; label: string } {
  const ratio = RATIOS.find((item) => item.id === ratioId) || RATIOS[0]
  if (resolution === '1k' && ratio.id === 'auto') return { size: '1024x1024', label: ratio.label }
  return { size: ratio.size || 'auto', label: ratio.label }
}

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

Page({
  turns: [] as ChatTurn[],
  pickSource: 'album' as 'album' | 'camera',

  data: {
    turns: [] as ChatTurn[],
    scrollTick: 0,
    draft: '',
    tool: 'chat' as 'chat' | 'image',
    menuOpen: false,
    panelOpen: false,
    senderPresets: [{ name: 'send', type: 'icon' }],
    imageModel: IMAGE_MODEL,
    ratios: RATIOS,
    qualities: QUALITIES,
    resolutions: RESOLUTIONS,
    counts: [1, 2, 3, 4],
    ratioId: 'auto',
    ratioLabel: '自动',
    quality: 'auto',
    resolution: 'auto',
    count: 1,
    refImage: '',
    templateId: '',
    templateTitle: '',
    keyboard: 0,
    canSend: false,
    chatIdeas: ['帮我写一段朋友圈文案', '今天适合拍什么', '把这段话改得更自然'],
    imageIdeas: ['一张清新的人像写真', '胶片感的街头照片', '一张极简海报'],
    privacyOk: false,
    showPrivacyPanel: false,
    privacyContractName: '用户隐私保护指引',
    privacyDesc: '',
  },

  onLoad() {
    const turns = loadTurns().map((turn) =>
      turn.status === 'generating'
        ? { ...turn, status: 'error' as const, error: '上次生成中断了，点重试' }
        : turn,
    )
    saveTurns(turns)
    this.turns = turns
    const last = turns[turns.length - 1]
    this.setData({ turns, scrollTick: last ? 999999 : 0 })
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ value: '/pages/edit/index' })
    }
    void refreshPagePrivacy((patch) => this.setData(patch), 'picker')
    const job = isLoggedIn() ? consumePendingCompose() : null
    if (job) {
      this.pushTurn(job)
      return
    }
    if (consumeOpenComposer()) {
      this.setData({ tool: 'image', panelOpen: true, menuOpen: false })
    }
    const draft = consumeComposerDraft()
    if (!draft) return
    this.setData({
      draft: draft.prompt,
      canSend: !!draft.prompt.trim(),
      tool: 'image',
      panelOpen: true,
      menuOpen: false,
      templateId: draft.templateId,
      templateTitle: draft.templateTitle,
    })
  },

  noop() {},

  onClosePop() {
    this.setData({ menuOpen: false, panelOpen: false })
  },

  onToggleMenu() {
    this.setData({ menuOpen: !this.data.menuOpen, panelOpen: false })
  },

  onTogglePanel() {
    this.setData({ panelOpen: !this.data.panelOpen, menuOpen: false })
  },

  onOpenImage() {
    this.setData({ tool: 'image', panelOpen: true, menuOpen: false })
  },

  onIdea(e: WechatMiniprogram.BaseEvent) {
    const text = String(e.currentTarget.dataset.text || '')
    if (!text) return
    this.setData({ draft: text, canSend: true, menuOpen: false, panelOpen: false })
  },

  onKeyboard(e: WechatMiniprogram.CustomEvent<{ height?: number }>) {
    const keyboard = Number(e.detail?.height) || 0
    const was = this.data.keyboard
    this.setData({
      keyboard,
      scrollTick: keyboard && !was ? this.data.scrollTick + 100000 : this.data.scrollTick,
    })
  },

  onPickTool(e: WechatMiniprogram.BaseEvent) {
    const tool = e.currentTarget.dataset.tool
    if (tool !== 'chat' && tool !== 'image') return
    this.setData({
      tool,
      menuOpen: false,
      panelOpen: tool === 'image' ? this.data.panelOpen : false,
    })
  },

  onPickOpt(e: WechatMiniprogram.BaseEvent) {
    const group = String(e.currentTarget.dataset.group || '')
    const id = String(e.currentTarget.dataset.id || '')
    if (group === 'quality' && QUALITIES.some((item) => item.id === id)) {
      this.setData({ quality: id })
      return
    }
    if (group === 'count') {
      const count = Number(id)
      if (count >= 1 && count <= 4) this.setData({ count })
      return
    }
    if (group === 'resolution' && RESOLUTIONS.some((item) => item.id === id)) {
      this.setData({ resolution: id })
      return
    }
    if (group === 'ratio' && RATIOS.some((item) => item.id === id)) {
      const ratio = RATIOS.find((item) => item.id === id) || RATIOS[0]
      this.setData({ ratioId: id, ratioLabel: ratio.label })
    }
  },

  onDraft(e: WechatMiniprogram.CustomEvent<{ value?: string }>) {
    const draft = e.detail?.value || ''
    this.setData({ draft, canSend: !!draft.trim() })
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
    pickOneImage(this.pickSource)
      .then((path) => this.setData({ refImage: path, tool: 'image', menuOpen: false }))
      .catch(() => {})
  },

  onClearRef() {
    this.setData({ refImage: '' })
  },

  imageJob(prompt: string): ComposeJob {
    const sized = pickedSize(this.data.ratioId, this.data.resolution)
    return {
      prompt,
      imagePath: this.data.refImage || '',
      size: sized.size,
      ratioLabel: sized.label,
      count: this.data.count,
      quality: this.data.quality,
      templateId: this.data.templateId,
      templateTitle: this.data.templateTitle,
      model: IMAGE_MODEL,
    }
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

  onSendTap() {
    this.submit(this.data.draft)
  },

  onSend(e: WechatMiniprogram.CustomEvent<{ value?: string }>) {
    this.submit(String(e.detail?.value || this.data.draft || ''))
  },

  submit(raw: string) {
    const prompt = raw.trim()
    if (!prompt) {
      if (this.data.tool === 'image') wx.showToast({ title: '先写下想生成的画面', icon: 'none' })
      return
    }
    this.setData({ menuOpen: false, panelOpen: false, draft: '', canSend: false })
    if (this.data.tool === 'image') {
      const job = this.imageJob(prompt)
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
      this.setData({ draft: prompt, canSend: true })
      wx.navigateTo({ url: '/pages/login/index' })
      return
    }
    this.pushText(prompt)
  },

  pushText(prompt: string) {
    const turn: ChatTurn = {
      id: `t${Date.now()}`,
      kind: 'text',
      prompt,
      reply: '',
      imagePath: '',
      size: '',
      ratioLabel: '',
      count: 1,
      templateId: '',
      templateTitle: '',
      model: CHAT_MODEL,
      status: 'generating',
      images: [],
      error: '',
    }
    const turns = (this.turns || this.data.turns).concat(turn).slice(-40)
    this.turns = turns
    this.setData({ turns, scrollTick: this.data.scrollTick + 100000 })
    saveTurns(turns)
    void this.runTurn(turn.id)
  },

  pushTurn(job: ComposeJob) {
    const turn: ChatTurn = {
      ...job,
      id: `t${Date.now()}`,
      kind: 'image',
      model: job.model || IMAGE_MODEL,
      reply: '',
      status: 'generating',
      images: [],
      error: '',
    }
    const turns = (this.turns || this.data.turns).concat(turn).slice(-40)
    this.turns = turns
    this.setData({ turns, scrollTick: this.data.scrollTick + 100000 })
    saveTurns(turns)
    void this.runTurn(turn.id)
  },

  patchTurn(id: string, patch: Partial<ChatTurn>, persist = true) {
    const turns = (this.turns || this.data.turns).map((turn) => (turn.id === id ? { ...turn, ...patch } : turn))
    this.turns = turns
    this.setData({ turns, scrollTick: this.data.scrollTick + 100000 })
    if (persist) saveTurns(turns)
  },

  async runTurn(id: string) {
    const turn = (this.turns || this.data.turns).find((item) => item.id === id)
    if (!turn) return
    this.patchTurn(id, { status: 'generating', error: '', images: [], reply: '' })
    try {
      await ensureApiKey()
      if (turn.kind === 'text') {
        const messages: { role: 'user' | 'assistant'; content: string }[] = []
        ;(this.turns || []).forEach((item) => {
          if (item.kind !== 'text' || item.id === id || item.status !== 'done' || !item.reply) return
          messages.push({ role: 'user', content: item.prompt })
          messages.push({ role: 'assistant', content: item.reply })
        })
        messages.push({ role: 'user', content: turn.prompt })
        let latest = ''
        let timer: ReturnType<typeof setTimeout> | 0 = 0
        const paint = () => {
          timer = 0
          this.patchTurn(id, { reply: latest, status: 'generating' }, false)
        }
        const reply = await chatStream(messages, (text) => {
          latest = text
          if (timer) return
          timer = setTimeout(paint, 80)
        })
        if (timer) clearTimeout(timer)
        this.patchTurn(id, { status: 'done', reply: reply || latest, error: '' })
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
      this.patchTurn(id, { status: 'done', images, error: '' })
    } catch (err) {
      const raw = err instanceof Error ? err.message : '生成失败'
      this.patchTurn(id, { status: 'error', error: humanizeGenerateError(raw), images: [] })
      if (/未登录/.test(raw)) wx.navigateTo({ url: '/pages/login/index' })
    }
  },

  onRetry(e: WechatMiniprogram.CustomEvent<{ id?: string }>) {
    const id = String(e.detail?.id || '')
    const turn = (this.turns || this.data.turns).find((item) => item.id === id)
    if (!id || !turn || turn.status === 'generating') return
    this.patchTurn(id, { status: 'generating', error: '', images: [] })
    void this.runTurn(id)
  },

  onPreview(e: WechatMiniprogram.CustomEvent<{ id?: string; src?: string }>) {
    const id = String(e.detail?.id || '')
    const src = String(e.detail?.src || '')
    const turn = (this.turns || this.data.turns).find((item) => item.id === id)
    const urls = turn?.images?.length ? turn.images : src ? [src] : []
    if (!src || !urls.length) return
    wx.previewImage({ current: src, urls })
  },

  async onSave(e: WechatMiniprogram.CustomEvent<{ id?: string }>) {
    const id = String(e.detail?.id || '')
    const turn = (this.turns || this.data.turns).find((item) => item.id === id)
    if (!turn?.images.length) return
    wx.showLoading({ title: '保存中', mask: true })
    try {
      for (const src of turn.images) await archiveWork(src, turn)
      wx.hideLoading()
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
