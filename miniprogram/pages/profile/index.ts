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
    worksList: [] as Array<{ id: string; url: string; isDraft?: boolean }>,  // 初始化为空数组
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

    // 加载作品集数据
    if (this.data.activeTab === 'works') {
      this.loadWorks()
    } else if (this.data.activeTab === 'liked') {
      this.loadLikedWorks()
    }

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
      if (!isLoggedIn()) {
        this.setData({
          loggedIn: false,
          balanceDisplay: '--',
          usageCount: 0,
          totalCostDisplay: '0',
          accountText: '未登录',
        })
      }
    }
  },

  async loadWorks() {
    try {
      const userId = wx.getStorageSync('user_openid') || 'demo_user'
      const res = await wx.cloud.callFunction({
        name: 'userworks',
        data: {
          action: 'getWorks',
          userId,
          page: 1,
          pageSize: 20,
        },
      })

      if (res.result && res.result.code === 0) {
        // 云函数调用成功，显示返回的数据（可能为空）
        const works = (res.result.data.items || []).map((item: any) => ({
          id: item.id,
          url: item.url,
          isDraft: false,
        }))
        
        this.setData({ worksList: works })
        return
      }
    } catch (e) {
      console.error('加载作品集失败', e)
    }
    
    // 云函数调用失败时，显示空列表
    this.setData({ worksList: [] })
  },

  async loadLikedWorks() {
    try {
      const userId = wx.getStorageSync('user_openid') || 'demo_user'
      const res = await wx.cloud.callFunction({
        name: 'userworks',
        data: {
          action: 'getLiked',
          userId,
          page: 1,
          pageSize: 20,
        },
      })

      if (res.result && res.result.code === 0) {
        const works = res.result.data.items.map((item: any) => ({
          id: item.workId,
          url: item.url,
          isDraft: false,
        }))
        
        this.setData({ worksList: works })
        return
      }
    } catch (e) {
      console.error('加载点赞列表失败', e)
    }
    
    // 点赞列表为空时，显示空状态
    this.setData({ worksList: [] })
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
    
    // 切换 Tab 时加载对应数据
    if (tab === 'works') {
      void this.loadWorks()
    } else if (tab === 'liked') {
      void this.loadLikedWorks()
    } else {
      // 动态和收藏暂时显示空状态
      this.setData({ worksList: [] })
    }
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

  onLongPressWork(e: any) {
    const workId = e.currentTarget.dataset.id as string
    const workUrl = e.currentTarget.dataset.url as string
    
    wx.showActionSheet({
      itemList: ['删除作品', '保存到相册'],
      itemColor: '#111111',
      success: (res) => {
        if (res.tapIndex === 0) {
          // 删除作品
          this.deleteWork(workId)
        } else if (res.tapIndex === 1) {
          // 保存到相册
          this.saveToAlbum(workUrl)
        }
      },
    })
  },

  async deleteWork(workId: string) {
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除这张作品吗？',
      confirmText: '删除',
      confirmColor: '#FF0000',
      success: async (res) => {
        if (!res.confirm) return

        wx.showLoading({ title: '删除中...' })
        try {
          const userId = wx.getStorageSync('user_openid') || 'demo_user'
          await wx.cloud.callFunction({
            name: 'userworks',
            data: {
              action: 'deleteWork',
              userId,
              workId,
            },
          })

          wx.hideLoading()
          wx.showToast({ title: '已删除', icon: 'success' })

          // 刷新作品列表
          void this.loadWorks()
        } catch (e: any) {
          wx.hideLoading()
          console.error('删除作品失败:', e)
          wx.showToast({
            title: e.errMsg || '删除失败',
            icon: 'none',
          })
        }
      },
    })
  },

  saveToAlbum(imageUrl: string) {
    wx.showLoading({ title: '保存中...' })
    wx.saveImageToPhotosAlbum({
      filePath: imageUrl,
      success: () => {
        wx.hideLoading()
        wx.showToast({ title: '已保存到相册', icon: 'success' })
      },
      fail: (err) => {
        wx.hideLoading()
        if (err.errMsg.includes('auth deny')) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中开启相册权限',
            confirmText: '去设置',
            success: (res) => {
              if (res.confirm) {
                wx.openSetting()
              }
            },
          })
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' })
        }
      },
    })
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
      content: '光匣是一款 AI 生图小程序。从灵感做同款，或在对话里直接描述画面。账户积分由 Sub2API 统一管理。',
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
