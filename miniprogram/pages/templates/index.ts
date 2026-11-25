import { IMAGE_MODEL } from '../../config/index'
import { isLoggedIn } from '../../services/auth'
import { listImageModels } from '../../services/image-gen'
import {
  fetchManifestMeta,
  fetchTemplateList,
  toggleTemplateLike,
  type TemplateCategory,
  type TemplateListItem,
} from '../../services/template'
import { setPendingCompose } from '../../utils/compose'
import {
  IMAGE_COUNTS,
  IMAGE_QUALITIES,
  IMAGE_RATIOS,
  pickedImageSize,
  shortModelLabel,
} from '../../utils/image-options'
import { pickImages } from '../../utils/pick-image'
import {
  onPagePrivacyAgree,
  openPrivacyContractPage,
  refreshPagePrivacy,
} from '../../utils/privacy-page'

Page({
  data: {
    loading: true,
    loadingMore: false,
    primaryCategories: [] as TemplateCategory[],
    activePrimary: 'ai',
    subTags: [] as TemplateCategory[],
    activeSubTag: 'featured',
    keyword: '',
    searchPlaceholder: '用闪光灯出神图一张',
    leftColumn: [] as TemplateListItem[],
    rightColumn: [] as TemplateListItem[],
    allItems: [] as TemplateListItem[],
    page: 1,
    hasMore: true,
    /** 头部右侧的计数：只表达「多少条可挑」，无数据时返回空串，不印占位符 */
    totalLabel: '',
    /** 豆包式悬浮创作浮层 */
    composerOpen: false,
    keyboard: 0,
    draft: '',
    canSend: false,
    refImages: [] as string[],
    activeParam: '' as '' | 'model' | 'ratio' | 'count' | 'quality',
    ratios: IMAGE_RATIOS,
    qualities: IMAGE_QUALITIES,
    counts: [...IMAGE_COUNTS],
    ratioId: 'auto',
    ratioShort: '自动',
    quality: 'auto',
    qualityShort: '自动',
    count: 1,
    imageModel: IMAGE_MODEL,
    imageModelShort: shortModelLabel(IMAGE_MODEL),
    imageModels: [IMAGE_MODEL],
    imageModelLabels: [`${IMAGE_MODEL}（默认）`],
    imageModelIndex: 0,
    privacyOk: false,
    showPrivacyPanel: false,
    privacyContractName: '用户隐私保护指引',
    privacyDesc: '',
  },
  modelsLoaded: false,
  modelsLoading: false,

  onLoad() {
    this.initPage()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        value: '/pages/templates/index',
        keyboardHidden: this.data.composerOpen,
      })
    }
    void refreshPagePrivacy((patch) => this.setData(patch), 'picker')
  },

  onHide() {
    if (this.data.composerOpen) this.closeComposer()
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.loadList(this.data.page + 1, true)
    }
  },

  async initPage() {
    this.setData({ loading: true })
    const defaultPrimary = 'ai'
    const defaultSub = 'featured'
    try {
      const metaPromise = fetchManifestMeta()
      const listPromise = fetchTemplateList({
        category: defaultPrimary,
        subTag: defaultSub,
        keyword: '',
        page: 1,
        pageSize: 10,
      })
      const [meta, firstList] = await Promise.all([metaPromise, listPromise])

      const primaryCategories = meta.primaryCategories || []
      const subTags = meta.subTags || []
      const activePrimary = primaryCategories[0]?.id || defaultPrimary
      const activeSubTag = subTags[0]?.id || defaultSub

      const needReload =
        activePrimary !== defaultPrimary || activeSubTag !== defaultSub

      if (needReload) {
        this.setData({
          primaryCategories,
          subTags,
          activePrimary,
          activeSubTag,
        })
        await this.loadList(1, false)
      } else {
        const { leftColumn, rightColumn } = this.distributeWaterfall(firstList.items)
        this.setData({
          primaryCategories,
          subTags,
          activePrimary,
          activeSubTag,
          allItems: firstList.items,
          leftColumn,
          rightColumn,
          page: 1,
          hasMore: firstList.hasMore,
        })
      }
    } catch {
      await this.loadList(1, false)
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadList(page: number, append: boolean) {
    if (append) {
      this.setData({ loadingMore: true })
    }
    try {
      const { items, hasMore } = await fetchTemplateList({
        category: this.data.activePrimary,
        subTag: this.data.activeSubTag,
        keyword: this.data.keyword,
        page,
        pageSize: 10,
      })

      const allItems = append ? this.data.allItems.concat(items) : items
      const { leftColumn, rightColumn } = this.distributeWaterfall(allItems)

      this.setData({
        allItems,
        leftColumn,
        rightColumn,
        page,
        hasMore,
        loadingMore: false,
        totalLabel: allItems.length ? `${allItems.length} 个模板` : '',
      })
    } catch {
      this.setData({ loadingMore: false })
    }
  },

  /** 双列真实错落瀑布流分布算法 */
  distributeWaterfall(items: TemplateListItem[]) {
    let leftHeight = 0
    let rightHeight = 0
    const leftColumn: TemplateListItem[] = []
    const rightColumn: TemplateListItem[] = []

    for (const item of items) {
      const h = item.aspectRatio || 1.3
      if (leftHeight <= rightHeight) {
        leftColumn.push(item)
        leftHeight += h
      } else {
        rightColumn.push(item)
        rightHeight += h
      }
    }
    return { leftColumn, rightColumn }
  },

  onSelectPrimary(e: any) {
    const id = e.currentTarget.dataset.id as string
    if (id === this.data.activePrimary) return
    this.setData({
      activePrimary: id,
      page: 1,
      allItems: [],
      leftColumn: [],
      rightColumn: [],
      hasMore: true,
    })
    this.loadList(1, false)
  },

  onSelectSubTag(e: any) {
    const id = e.currentTarget.dataset.id as string
    if (id === this.data.activeSubTag) return
    this.setData({
      activeSubTag: id,
      page: 1,
      allItems: [],
      leftColumn: [],
      rightColumn: [],
      hasMore: true,
    })
    this.loadList(1, false)
  },

  onKeywordChange(e: any) {
    this.setData({ keyword: e.detail?.value || '' })
  },

  onSearch() {
    this.setData({ page: 1, allItems: [], leftColumn: [], rightColumn: [], hasMore: true })
    this.loadList(1, false)
  },

  onClearSearch() {
    this.setData({ keyword: '', page: 1, allItems: [], leftColumn: [], rightColumn: [], hasMore: true })
    this.loadList(1, false)
  },

  async onToggleLike(e: any) {
    const id = e.currentTarget.dataset.id as string | number
    const updateItems = (list: TemplateListItem[]) =>
      list.map((it) => {
        if (String(it.id) === String(id)) {
          const liked = !it.liked
          const likes = (it.likes || 0) + (liked ? 1 : -1)
          return { ...it, liked, likes: Math.max(0, likes) }
        }
        return it
      })

    const allItems = updateItems(this.data.allItems)
    const { leftColumn, rightColumn } = this.distributeWaterfall(allItems)
    this.setData({ allItems, leftColumn, rightColumn })

    toggleTemplateLike(id).catch(() => {})
  },

  onOpenTemplate(e: any) {
    if (!isLoggedIn()) {
      wx.navigateTo({ url: '/pages/login/index?redirect=templates' })
      return
    }
    const id = e.currentTarget.dataset.id as string | number
    wx.navigateTo({ url: `/pages/editor-template/index?id=${id}` })
  },

  /** 某张封面尚未同步到云存储时，回退到原图片地址，避免出现空白卡片 */
  onCoverError(e: any) {
    const id = e.currentTarget.dataset.id as string | number
    const column = e.currentTarget.dataset.column as 'left' | 'right'
    const key = column === 'right' ? 'rightColumn' : 'leftColumn'
    const list = this.data[key].map((item) => {
      if (String(item.id) !== String(id) || !item.sourceCoverUrl) return item
      return { ...item, coverUrl: item.sourceCoverUrl }
    })
    if (list.some((item, index) => item !== this.data[key][index])) {
      this.setData({ [key]: list } as any)
    }
  },

  noop() {},

  syncTabBar() {
    this.getTabBar?.()?.setData({ keyboardHidden: !!(this.data.composerOpen || this.data.keyboard) })
  },

  async loadComposerModels() {
    if (this.modelsLoaded || this.modelsLoading || !isLoggedIn()) return
    this.modelsLoading = true
    try {
      const imageModels = await listImageModels()
      this.modelsLoaded = true
      const imageModel = imageModels[0] || this.data.imageModel
      this.setData({
        imageModels,
        imageModelLabels: imageModels.map((id) => (id === IMAGE_MODEL ? `${id}（默认）` : id)),
        imageModelIndex: Math.max(0, imageModels.indexOf(this.data.imageModel)),
        imageModelShort: shortModelLabel(this.data.imageModel || imageModel),
      })
    } catch {
      /* 使用默认模型兜底 */
    } finally {
      this.modelsLoading = false
    }
  },

  onFabClick() {
    this.setData({ composerOpen: true, activeParam: '' })
    this.syncTabBar()
    void this.loadComposerModels()
  },

  closeComposer() {
    wx.hideKeyboard({ complete: () => {} })
    this.setData({ composerOpen: false, activeParam: '', keyboard: 0 })
    this.syncTabBar()
  },

  onComposerKeyboard(e: WechatMiniprogram.CustomEvent<{ height?: number }>) {
    const keyboard = Number(e.detail?.height) || 0
    if (keyboard !== this.data.keyboard) {
      this.setData({ keyboard })
      this.syncTabBar()
    }
  },

  onComposerDraft(e: WechatMiniprogram.TextareaInput) {
    const draft = (e.detail?.value || '').slice(0, 4000)
    this.setData({ draft, canSend: !!draft.trim() })
  },

  onToggleParam(e: WechatMiniprogram.BaseEvent) {
    const key = String(e.currentTarget.dataset.param || '') as '' | 'model' | 'ratio' | 'count' | 'quality'
    const next = this.data.activeParam === key ? '' : key
    this.setData({ activeParam: next })
    if (next === 'model') void this.loadComposerModels()
  },

  onPickComposerOpt(e: WechatMiniprogram.BaseEvent) {
    const group = String(e.currentTarget.dataset.group || '')
    const id = String(e.currentTarget.dataset.id || '')
    if (group === 'ratio') {
      const ratio = IMAGE_RATIOS.find((item) => item.id === id)
      if (!ratio) return
      this.setData({ ratioId: id, ratioShort: ratio.shortLabel || ratio.label, activeParam: '' })
      return
    }
    if (group === 'count') {
      const count = Number(id)
      if (count >= 1 && count <= 4) this.setData({ count, activeParam: '' })
      return
    }
    if (group === 'quality') {
      const q = IMAGE_QUALITIES.find((item) => item.id === id)
      if (!q) return
      this.setData({ quality: id, qualityShort: q.shortLabel || q.label, activeParam: '' })
      return
    }
    if (group === 'model') {
      const idx = Number(id)
      const imageModel = this.data.imageModels[idx]
      if (!imageModel) return
      this.setData({
        imageModel,
        imageModelIndex: idx,
        imageModelShort: shortModelLabel(imageModel),
        activeParam: '',
      })
    }
  },

  onPickRefImage() {
    if (!this.data.privacyOk) {
      this.setData({ showPrivacyPanel: true })
      return
    }
    void this.chooseRefImage()
  },

  async chooseRefImage() {
    try {
      const paths = await pickImages('any', 1)
      if (paths.length) this.setData({ refImages: [paths[0]] })
    } catch (err) {
      const msg = (err as { errMsg?: string })?.errMsg || ''
      if (/cancel/i.test(msg)) return
      wx.showToast({ title: '选择图片失败', icon: 'none' })
    }
  },

  onRemoveRefImage() {
    this.setData({ refImages: [] })
  },

  onOpenPrivacyContract() {
    openPrivacyContractPage()
  },

  onPrivacyAgree() {
    onPagePrivacyAgree(this, 'tpl-agree-btn', () => {
      void this.chooseRefImage()
    })
  },

  onSubmitComposer() {
    const prompt = this.data.draft.trim()
    if (!prompt) {
      wx.showToast({ title: '先描述你想生成的画面', icon: 'none' })
      return
    }
    const { size, label } = pickedImageSize(this.data.ratioId)
    const imagePath = this.data.refImages[0] || ''
    setPendingCompose({
      prompt,
      imagePath,
      imagePaths: imagePath ? [imagePath] : [],
      size,
      ratioLabel: label,
      count: this.data.count,
      quality: this.data.quality === 'auto' ? undefined : this.data.quality,
      templateId: '',
      templateTitle: '',
      model: this.data.imageModel,
    })
    this.setData({ draft: '', canSend: false, refImages: [] })
    this.closeComposer()
    if (!isLoggedIn()) {
      wx.navigateTo({ url: '/pages/login/index' })
      return
    }
    wx.switchTab({ url: '/pages/edit/index' })
  },
})
