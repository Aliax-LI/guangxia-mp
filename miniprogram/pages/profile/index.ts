import { fetchUserSelf, getBoundGroupSnapshot, isLoggedIn, ensureApiKey } from '../../services/auth'
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
import { copyText } from '../../utils/clipboard'
import { DEFAULT_AVATAR_URL, loadStoredProfile } from '../../utils/profile-storage'

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
    groupName: '',
    avatarUrl: '',
    defaultAvatarUrl: DEFAULT_AVATAR_URL,
    privacyOk: false,
    showPrivacyPanel: false,
    privacyContractName: '用户隐私保护指引',
    privacyDesc: '',
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
      wx.showToast({ title: '已同意隐私指引', icon: 'success' })
    })
  },

  async refresh() {
    const loggedIn = isLoggedIn()
    const email = getUserEmail()
    const profile = loadStoredProfile(email)
    const bound = loggedIn ? getBoundGroupSnapshot() : { groupId: 0, groupName: '' }

    this.setData({
      loggedIn,
      email,
      nickname: profile.nickname,
      avatarUrl: profile.avatarUrl,
      bio: profile.bio,
      balanceDisplay: '--',
      usageCount: 0,
      totalCostDisplay: '0',
      accountText: email || '未登录',
      groupName: bound.groupName,
    })

    // 加载作品集数据
    void this.loadWorks()

    if (!loggedIn) return

    try {
      await ensureApiKey()
      const self = await fetchUserSelf()
      this.setData({
        email: self.email || email,
        nickname: profile.nickname || self.username || email.split('@')[0],
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

  onEditProfile() {
    if (!this.data.loggedIn) {
      wx.navigateTo({ url: '/pages/login/index' })
      return
    }
    wx.navigateTo({ url: '/pages/profile-edit/index' })
  },

  onCopyAccount() {
    const account = this.data.accountText
    if (!this.data.loggedIn || !account) return
    copyText(account, { successTitle: '已复制账户' })
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

  onLogin() {
    wx.navigateTo({ url: '/pages/login/index' })
  },
})
