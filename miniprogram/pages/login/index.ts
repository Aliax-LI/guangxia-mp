import { login, register, sendRegisterVerifyCode } from '../../services/auth'
import { fetchPublicSettings } from '../../services/settings'

Page({
  data: {
    mode: 'login' as 'login' | 'register',
    email: '',
    password: '',
    verifyCode: '',
    emailVerifyEnabled: true,
    loading: false,
    codeSending: false,
    codeCountdown: 0,
    agreed: false,
  },

  timer: 0 as ReturnType<typeof setInterval> | 0,

  onLoad() {
    fetchPublicSettings()
      .then((s) => this.setData({ emailVerifyEnabled: s.email_verify_enabled }))
      .catch(() => {})
  },

  onUnload() {
    if (this.timer) clearInterval(this.timer)
  },

  onBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) wx.navigateBack()
    else wx.switchTab({ url: '/pages/profile/index' })
  },

  onHelp() {
    wx.showModal({
      title: '关于登录与账号',
      content: '光匣账号直连 Sub2API 高性能网关，新注册可获赠修图体验积分，支持多端登录。',
      showCancel: false,
      confirmColor: '#111111',
    })
  },

  onToggleMode() {
    this.setData({ mode: this.data.mode === 'login' ? 'register' : 'login' })
  },

  onToggleAgreement() {
    this.setData({ agreed: !this.data.agreed })
  },

  onShowProtocol() {
    wx.showModal({
      title: '用户协议与隐私指引',
      content: '光匣重视您的隐私安全。上传的照片仅在当次生成中使用，不用于模型二次训练。',
      showCancel: false,
      confirmColor: '#111111',
    })
  },

  onEmailChange(e: any) {
    this.setData({ email: e.detail?.value?.trim?.() || '' })
  },

  onPasswordChange(e: any) {
    this.setData({ password: e.detail?.value || '' })
  },

  onVerifyChange(e: any) {
    this.setData({ verifyCode: e.detail?.value?.trim?.() || '' })
  },

  onAgreeChange(e: any) {
    this.setData({ agreed: !!e.detail?.checked })
  },

  async onSendCode() {
    const email = this.data.email
    if (!email.includes('@')) {
      wx.showToast({ title: '请先填写有效邮箱', icon: 'none' })
      return
    }
    this.setData({ codeSending: true })
    try {
      await sendRegisterVerifyCode(email)
      wx.showToast({ title: '验证码已发送', icon: 'success' })
      this.startCountdown(60)
    } catch (e) {
      wx.showToast({ title: e instanceof Error ? e.message : '发送失败', icon: 'none' })
    } finally {
      this.setData({ codeSending: false })
    }
  },

  startCountdown(sec: number) {
    this.setData({ codeCountdown: sec })
    if (this.timer) clearInterval(this.timer)
    this.timer = setInterval(() => {
      const next = this.data.codeCountdown - 1
      if (next <= 0) {
        clearInterval(this.timer)
        this.timer = 0
        this.setData({ codeCountdown: 0 })
      } else {
        this.setData({ codeCountdown: next })
      }
    }, 1000)
  },

  async onSubmit() {
    const { email, password, mode, verifyCode, emailVerifyEnabled, agreed } = this.data
    if (!agreed) {
      wx.showToast({ title: '请先勾选同意协议', icon: 'none' })
      return
    }
    if (!email || !password) {
      wx.showToast({ title: '请填写邮箱和密码', icon: 'none' })
      return
    }
    if (password.length < 6) {
      wx.showToast({ title: '密码至少 6 位', icon: 'none' })
      return
    }
    this.setData({ loading: true })
    try {
      if (mode === 'register') {
        if (emailVerifyEnabled && !verifyCode) {
          wx.showToast({ title: '请填写邮箱验证码', icon: 'none' })
          this.setData({ loading: false })
          return
        }
        await register(email, password, verifyCode)
      } else {
        await login(email, password)
      }
      wx.showToast({ title: '欢迎回来', icon: 'success' })
      setTimeout(() => {
        const pages = getCurrentPages()
        if (pages.length > 1) wx.navigateBack()
        else wx.switchTab({ url: '/pages/profile/index' })
      }, 400)
    } catch (e) {
      wx.showToast({
        title: e instanceof Error ? e.message : '失败',
        icon: 'none',
        duration: 3000,
      })
    } finally {
      this.setData({ loading: false })
    }
  },
})
