Component({
  data: {
    value: '/pages/edit/index',
    list: [
      { value: '/pages/edit/index', label: '修图', icon: 'image' },
      { value: '/pages/templates/index', label: '灵感', icon: 'app' },
      { value: '/pages/profile/index', label: '我的', icon: 'user' },
    ],
  },
  methods: {
    onTap(
      this: { data: { value: string }; setData: (data: Record<string, string>) => void },
      e: WechatMiniprogram.BaseEvent,
    ) {
      const url = e.currentTarget?.dataset?.value as string
      if (url && url !== this.data.value) {
        this.setData({ value: url })
        wx.switchTab({ url })
      }
    },
    init(this: { setData: (data: Record<string, string>) => void }) {
      const page = getCurrentPages().pop()
      const route = page ? `/${page.route}` : '/pages/edit/index'
      this.setData({ value: route })
    },
  } as any,
})
