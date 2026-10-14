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
    onChange(this: { data: { value: string }; setData: (data: Record<string, string>) => void }, e: any) {
      const url: string = e.detail?.value || e.detail
      if (url && url !== this.data.value) {
        this.setData({ value: url })
      }
      wx.switchTab({ url })
    },
    init(this: { setData: (data: Record<string, string>) => void }) {
      const page = getCurrentPages().pop()
      const route = page ? `/${page.route}` : '/pages/edit/index'
      this.setData({ value: route })
    },
  } as any,
})
