import { fetchUserSelf, isLoggedIn, logout, ensureApiKey } from '../../services/auth'
import { getUserEmail } from '../../utils/storage'
import { formatPointsFromUsd } from '../../utils/quota'
import { fetchUsageSummary } from '../../services/logs'
import { redeemCardCode } from '../../services/redeem'
import { setEditorImage } from '../../utils/session'
import {
  onPagePrivacyAgree,
  openPrivacyContractPage,
  refreshPagePrivacy,
} from '../../utils/privacy-page'
import { pickOneImage } from '../../utils/pick-image'
const NICKNAME_STORAGE_KEY = 'profile_nickname'
const AVATAR_STORAGE_KEY = 'profile_avatar'
const BIO_STORAGE_KEY = 'profile_bio'
const DEFAULT_AVATAR_URL = 'https://tdesign.gtimg.com/mobile/demos/avatar1.png'

const DEFAULT_WORKS = [
  { id: '1', url: 'https://cms-assets.youmind.com/media/1789893419692_lner5o_HSpRfYwacAAMXOv.jpg', isDraft: true },
  { id: '2', url: 'https://cms-assets.youmind.com/media/1789885865583_xcnnu4_HSjlEl3b0AAngVs.jpg' },
  { id: '3', url: 'https://cms-assets.youmind.com/media/1789893412697_m4mwip_HSk96rua0AAg7EN.jpg' },
  { id: '4', url: 'https://cms-assets.youmind.com/media/1789806824937_mpbm15_HShfJCgXgAAjBIu.jpg' },
  { id: '5', url: 'https://cms-assets.youmind.com/media/1789806829594_wnp771_HSjzd4bbEAAu90c.jpg' },
  { id: '6', url: 'https://cms-assets.youmind.com/media/1789891171968_78b4ke_HSoUJGmbQAAX-RX.jpg' },
  { id: '7', url: 'https://cms-assets.youmind.com/media/1789803924733_8hsv1z_HSjMUR0bwAAEe3S.jpg' },
  { id: '8', url: 'https://cms-assets.youmind.com/media/1789893410242_jesa0r_HSkjxt4bgAA47FQ.jpg' },
  { id: '9', url: 'https://cms-assets.youmind.com/media/1789891171902_3t0gre_HSo5s3jbsAArQri.jpg' },
]

Page({
  data: {
    loggedIn: false,
    email: '',
    nickname: '',
    bio: '',
    balanceDisplay: '--',
    usageCount: 0,
    totalCostDisplay: '0',
    accountText: '未登录',
    avatarUrl: '',
    defaultAvatarUrl: DEFAULT_AVATAR_URL,
    nicknameReviewPass: true,
    privacyOk: false,
    showPrivacyPanel: false,
    privacyContractName: '用户隐私保护指引',
    privacyDesc: '',
    /** 从「编辑资料」进入隐私弹窗，同意后引导点头像/昵称 */
    editAfterPrivacy: false,
    nicknameEditing: false,
    nicknameFocus: false,
    activeTab: 'works' as 'works' | 'dynamics' | 'starred' | 'liked',
    worksList: DEFAULT_WORKS,
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ value: '/pages/profile/index' })
    }
    void refreshPagePrivacy((patch) => this.setData(patch), 'profile').then(() => this.refresh())
  },

  onOpenPrivacyContract() {
    openPrivacyContractPage()
  },

  onAgreePrivacy() {
    onPagePrivacyAgree(this, 'profile-agree-btn', () => {
      if (this.data.editAfterPrivacy) {
        this.setData({ editAfterPrivacy: false })
        this.focusProfileWechatBlock()
        return
      }
      wx.showToast({ title: '已同意隐私指引', icon: 'success' })
    })
  },

  focusProfileWechatBlock() {
    this.setData({ nicknameEditing: false, nicknameFocus: false })
    wx.showToast({ title: '请点头像更换', icon: 'none' })
  },

  onStartNicknameEdit() {
    if (!this.data.loggedIn) {
      this.onLogin()
      return
    }
    if (!this.data.privacyOk) {
      this.setData({ showPrivacyPanel: true, editAfterPrivacy: false })
      return
    }
    this.setData({ nicknameEditing: true, nicknameFocus: true })
  },

  async refresh() {
    const loggedIn = isLoggedIn()
    const email = getUserEmail()
    const storedNickname = wx.getStorageSync(NICKNAME_STORAGE_KEY) as string
    const storedAvatar = wx.getStorageSync(AVATAR_STORAGE_KEY) as string
    const storedBio = wx.getStorageSync(BIO_STORAGE_KEY) as string
    const nickname = storedNickname || (email ? email.split('@')[0] : '')

    this.setData({
      loggedIn,
      email,
      nickname,
      avatarUrl: storedAvatar || '',
      bio: storedBio || '',
      balanceDisplay: '--',
      usageCount: 0,
      totalCostDisplay: '0',
      accountText: email || '未登录',
    })

    if (!loggedIn) return

    try {
      await ensureApiKey()
      const self = await fetchUserSelf()
      this.setData({
        email: self.email || email,
        nickname: storedNickname || self.username || email.split('@')[0],
        balanceDisplay: formatPointsFromUsd(self.balance ?? 0),
        accountText: self.email || email,
      })

      const usage = await fetchUsageSummary()
      this.setData({
        usageCount: usage.usageCount,
        totalCostDisplay: formatPointsFromUsd(usage.totalCost),
      })
    } catch {
      /* 保持当前展示，避免账户信息加载失败影响页面 */
    }
  },

  async onEditProfile() {
    if (!this.data.loggedIn) {
      wx.showModal({
        title: '登录后编辑资料',
        content: '登录后可使用微信头像、昵称能力；账户与积分仍由 Sub2API 管理。',
        confirmText: '去登录',
        confirmColor: '#111111',
        success: (res) => {
          if (res.confirm) this.onLogin()
        },
      })
      return
    }
    if (!this.data.privacyOk) {
      this.setData({ showPrivacyPanel: true, editAfterPrivacy: true })
      return
    }
    this.focusProfileWechatBlock()
  },

  persistAvatar(tempPath: string) {
    const apply = (path: string) => {
      wx.setStorageSync(AVATAR_STORAGE_KEY, path)
      this.setData({ avatarUrl: path })
      wx.showToast({ title: '头像已更新', icon: 'success' })
    }
    wx.saveFile({
      tempFilePath: tempPath,
      success: (res) => apply(res.savedFilePath),
      fail: () => apply(tempPath),
    })
  },

  /** 微信 chooseAvatar 回调 */
  onChooseWechatAvatar(e: WechatMiniprogram.CustomEvent) {
    const url = (e.detail as { avatarUrl?: string }).avatarUrl
    if (url) this.persistAvatar(url)
  },

  onNicknameInput(e: WechatMiniprogram.Input) {
    this.setData({ nickname: e.detail.value })
  },

  onNicknameBlur() {
    this.setData({ nicknameEditing: false, nicknameFocus: false })
    if (!this.data.nicknameReviewPass) return
    const nickname = (this.data.nickname || '').trim()
    if (!nickname) return
    wx.setStorageSync(NICKNAME_STORAGE_KEY, nickname)
  },

  onNicknameReview(e: WechatMiniprogram.CustomEvent) {
    const pass = !!(e.detail as { pass?: boolean }).pass
    this.setData({ nicknameReviewPass: pass })
    if (!pass) {
      wx.showToast({ title: '昵称未通过微信校验', icon: 'none' })
      return
    }
    const nickname = (this.data.nickname || '').trim()
    if (nickname) {
      wx.setStorageSync(NICKNAME_STORAGE_KEY, nickname)
      wx.showToast({ title: '昵称已保存', icon: 'success' })
    }
  },

  onSwitchTab(e: any) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
  },

  onCopyAccount() {
    const account = this.data.accountText
    if (!this.data.loggedIn || !account) return
    wx.setClipboardData({
      data: account,
      success: () => wx.showToast({ title: '已复制账户', icon: 'success' }),
    })
  },

  onEditBio() {
    wx.showModal({
      title: '编辑个性签名',
      editable: true,
      placeholderText: '写下一句有态度的修图格言…',
      content: this.data.bio,
      confirmColor: '#111111',
      success: (res) => {
        if (res.confirm) {
          const value = ((res as any).content || '').trim()
          wx.setStorageSync(BIO_STORAGE_KEY, value)
          this.setData({ bio: value })
        }
      },
    })
  },

  onPreviewWork(e: any) {
    const current = e.currentTarget.dataset.url as string
    const urls = this.data.worksList.map((w) => w.url)
    wx.previewImage({ current, urls })
  },

  onOpenDraft() {
    wx.switchTab({ url: '/pages/edit/index' })
  },

  onRedeemCard() {
    if (!this.data.loggedIn) {
      wx.navigateTo({ url: '/pages/login/index' })
      return
    }
    wx.showModal({
      title: '卡密充值',
      editable: true,
      placeholderText: '粘贴或输入兑换码',
      confirmText: '兑换',
      confirmColor: '#111111',
      success: async (res) => {
        if (!res.confirm) return
        const code = ((res as { content?: string }).content || '').trim()
        if (!code) {
          wx.showToast({ title: '请输入卡密', icon: 'none' })
          return
        }
        wx.showLoading({ title: '兑换中', mask: true })
        try {
          const result = await redeemCardCode(code)
          await this.refresh()
          wx.hideLoading()
          const extra =
            result.new_balance != null
              ? `\n当前可用积分 ${formatPointsFromUsd(result.new_balance)}`
              : ''
          wx.showModal({
            title: '兑换成功',
            content: (result.message || '已到账') + extra,
            showCancel: false,
            confirmColor: '#111111',
          })
        } catch (e) {
          wx.hideLoading()
          wx.showToast({
            title: e instanceof Error ? e.message : '兑换失败',
            icon: 'none',
            duration: 3000,
          })
        }
      },
    })
  },

  onUsageDetail() {
    if (!this.data.loggedIn) {
      wx.navigateTo({ url: '/pages/login/index' })
      return
    }
    wx.navigateTo({ url: '/pages/logs/index' })
  },

  onOpenHelp() {
    wx.showModal({
      title: '使用帮助',
      content: '光匣是一款 AI 质感修图小程序，灵感模版与智能修图助你快速出片，账户积分由 Sub2API 统一管理。',
      showCancel: false,
      confirmColor: '#111111',
    })
  },

  onFabClick(skipPrivacyCheck?: boolean | WechatMiniprogram.BaseEvent) {
    const skip = skipPrivacyCheck === true
    if (!skip && !this.data.privacyOk) {
      this.setData({ showPrivacyPanel: true })
      return
    }
    pickOneImage('any')
      .then((path) => {
        setEditorImage(path)
        wx.switchTab({ url: '/pages/edit/index' })
      })
      .catch(() => {})
  },

  onLogout() {
    wx.showModal({
      title: '确认退出',
      content: '退出登录后将返回未登录状态',
      confirmColor: '#111111',
      success: (res) => {
        if (res.confirm) {
          logout()
          this.refresh()
          wx.showToast({ title: '已退出' })
        }
      },
    })
  },

  onLogin() {
    wx.navigateTo({ url: '/pages/login/index' })
  },
})
