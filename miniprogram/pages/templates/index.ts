import { isLoggedIn } from '../../services/auth'
import {
  fetchManifestMeta,
  fetchTemplateList,
  toggleTemplateLike,
  type TemplateCategory,
  type TemplateListItem,
} from '../../services/template'
import { requestOpenComposer } from '../../utils/compose'

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
  },

  onLoad() {
    this.initPage()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ value: '/pages/templates/index' })
    }
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

  onFabClick() {
    requestOpenComposer()
    wx.switchTab({ url: '/pages/edit/index' })
  },
})
