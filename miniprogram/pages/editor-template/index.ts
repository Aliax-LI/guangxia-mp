import {
  buildTemplateGallery,
  fetchTemplateDetail,
  formatTemplateMetaDate,
  inferRequiresImage,
  type TemplateDetail,
} from '../../services/template'
import { setComposerDraft } from '../../utils/compose'

Page({
  data: {
    loading: true,
    detail: {} as TemplateDetail,
    galleryImages: [] as string[],
    galleryIndex: 0,
    galleryHeightPx: 320,
    galleryHeightByIndex: {} as Record<number, number>,
    metaDate: '',
  },

  onLoad(query: Record<string, string | undefined>) {
    const id = Number(query.id)
    if (!id) {
      wx.navigateBack()
      return
    }
    this.loadDetail(id)
  },

  async loadDetail(id: number) {
    try {
      const detail = await fetchTemplateDetail(id)
      detail.requiresImage = inferRequiresImage(detail)
      const galleryImages = buildTemplateGallery(detail)
      this.setData({
        loading: false,
        detail,
        galleryImages,
        galleryIndex: 0,
        galleryHeightByIndex: {},
        galleryHeightPx: this.estimateGalleryHeight(detail.aspectRatio),
        metaDate: formatTemplateMetaDate(detail.createdAt),
      })
    } catch (e) {
      wx.showToast({
        title: e instanceof Error ? e.message : '加载失败',
        icon: 'none',
      })
      wx.navigateBack()
    }
  },

  estimateGalleryHeight(aspectRatio?: number): number {
    const sys = wx.getSystemInfoSync()
    const padPx = (64 / 750) * sys.windowWidth
    const widthPx = sys.windowWidth - padPx
    const ratio = aspectRatio && aspectRatio > 0 ? aspectRatio : 1.15
    return this.clampGalleryHeight(Math.round(widthPx * ratio))
  },

  clampGalleryHeight(h: number): number {
    const sys = wx.getSystemInfoSync()
    const padPx = (64 / 750) * sys.windowWidth
    const widthPx = sys.windowWidth - padPx
    const minH = Math.round(widthPx * 0.55)
    const maxH = Math.round(sys.windowHeight * 0.62)
    return Math.min(Math.max(h, minH), maxH)
  },

  galleryContentWidthPx(): number {
    const sys = wx.getSystemInfoSync()
    const padPx = (64 / 750) * sys.windowWidth
    return sys.windowWidth - padPx
  },

  onGalleryImageLoad(e: WechatMiniprogram.ImageLoad) {
    const index = Number(e.currentTarget.dataset.index)
    const { width, height } = e.detail
    if (!width || !height || Number.isNaN(index)) return
    const h = this.clampGalleryHeight(Math.round(this.galleryContentWidthPx() * (height / width)))
    const galleryHeightByIndex = { ...this.data.galleryHeightByIndex, [index]: h }
    const patch: Record<string, unknown> = { galleryHeightByIndex }
    if (index === this.data.galleryIndex) patch.galleryHeightPx = h
    this.setData(patch)
  },

  onGalleryChange(e: WechatMiniprogram.SwiperChange) {
    const idx = e.detail.current
    if (typeof idx !== 'number') return
    const cached = this.data.galleryHeightByIndex[idx]
    this.setData({
      galleryIndex: idx,
      galleryHeightPx: cached ?? this.estimateGalleryHeight(this.data.detail.aspectRatio),
    })
  },

  onPickGallery(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index)
    if (Number.isNaN(index)) return
    const cached = this.data.galleryHeightByIndex[index]
    this.setData({
      galleryIndex: index,
      galleryHeightPx: cached ?? this.estimateGalleryHeight(this.data.detail.aspectRatio),
    })
  },

  onPreviewGallery(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index) || 0
    const urls = this.data.galleryImages
    wx.previewImage({ urls, current: urls[index] || urls[0] })
  },

  onCopyPrompt() {
    const prompt = this.data.detail.prompt || ''
    if (!prompt) return
    wx.setClipboardData({
      data: prompt,
      success: () => wx.showToast({ title: '已复制提示词', icon: 'success' }),
    })
  },

  onMakeSame() {
    const inspiration = this.data.detail
    setComposerDraft({
      prompt: inspiration.prompt || '',
      templateId: inspiration.id ? String(inspiration.id) : '',
      templateTitle: inspiration.title || '',
    })
    wx.switchTab({ url: '/pages/edit/index' })
  },
})
