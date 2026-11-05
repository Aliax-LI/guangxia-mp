type TabItem = { value: string; label: string; icon: string }

const TABS: TabItem[] = [
  { value: '/pages/edit/index', label: '对话', icon: 'chat-bubble' },
  { value: '/pages/templates/index', label: '灵感', icon: 'app' },
  { value: '/pages/profile/index', label: '我的', icon: 'user' },
]

Component({
  data: {
    value: '/pages/edit/index',
    list: TABS,
    /** TDesign 需要显式的十六进制色值，选中是墨黑（压在琥珀块上），未选中是相纸灰 */
    inkOn: '#1A1208',
    inkOff: '#94836F',
  },
  created(this: any) {
    // 组件实例创建时就能拿到当前路由，早于页面 onShow，冷启动高亮不会闪错
    const route = this.syncRoute()
    if (route) this.setData({ value: route })
  },
  methods: {
    syncRoute(): string {
      const pages = getCurrentPages()
      const page = pages[pages.length - 1] as { route?: string } | undefined
      const route = page?.route ? `/${page.route}` : ''
      return TABS.some((tab) => tab.value === route) ? route : ''
    },
    onTap(
      this: { data: { value: string }; setData: (data: Record<string, string>) => void },
      e: WechatMiniprogram.BaseEvent,
    ) {
      const url = e.currentTarget?.dataset?.value as string
      if (!url) return
      if (url === this.data.value) {
        // 再次点击当前 Tab：回到顶部而不是无响应
        const pages = getCurrentPages()
        const page = pages[pages.length - 1] as { scrollToTop?: () => void } | undefined
        page?.scrollToTop?.()
        return
      }
      this.setData({ value: url })
      wx.switchTab({ url })
    },
    init(this: { setData: (data: Record<string, string>) => void; syncRoute: () => string }) {
      const route = this.syncRoute()
      if (route) this.setData({ value: route })
    },
  } as any,
})
