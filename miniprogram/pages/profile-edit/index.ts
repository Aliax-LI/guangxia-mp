import {
  fetchAvailableGroups,
  getBoundGroupSnapshot,
  isLoggedIn,
  logout,
  switchBoundGroup,
  type Sub2Group,
} from '../../services/auth'
import { copyText } from '../../utils/clipboard'
import {
  onPagePrivacyAgree,
  openPrivacyContractPage,
  refreshPagePrivacy,
} from '../../utils/privacy-page'
import {
  DEFAULT_AVATAR_URL,
  loadStoredProfile,
  persistStoredAvatar,
  saveStoredBio,
  saveStoredNickname,
} from '../../utils/profile-storage'
import { getUserEmail } from '../../utils/storage'

Page({
  data: {
    email: '',
    nickname: '',
    bio: '',
    avatarUrl: '',
    defaultAvatarUrl: DEFAULT_AVATAR_URL,
    nicknameReviewPass: true,
    privacyOk: false,
    showPrivacyPanel: false,
    privacyContractName: '用户隐私保护指引',
    privacyDesc: '',
    groupsLoading: false,
    groups: [] as Sub2Group[],
    groupLabels: [] as string[],
    groupIndex: 0,
    initialGroupId: 0,
    groupId: 0,
    groupName: '',
    groupAllowsImage: true,
  },

  onLoad() {
    if (!isLoggedIn()) {
      wx.redirectTo({ url: '/pages/login/index' })
      return
    }
    const email = getUserEmail()
    const profile = loadStoredProfile(email)
    const bound = getBoundGroupSnapshot()
    this.setData({
      email,
      nickname: profile.nickname,
      bio: profile.bio,
      avatarUrl: profile.avatarUrl,
      initialGroupId: bound.groupId,
      groupId: bound.groupId,
      groupName: bound.groupName,
    })
    void this.loadGroups(bound.groupId)
  },

  async loadGroups(currentGroupId: number) {
    this.setData({ groupsLoading: true })
    try {
      const groups = await fetchAvailableGroups()
      const idx = Math.max(0, groups.findIndex((g) => g.id === currentGroupId))
      const selected = groups[idx]
      const groupLabels = groups.map((g) => {
        const rate = g.rate_multiplier != null ? ` · ${g.rate_multiplier}x` : ''
        const tag = g.allow_image_generation === false ? '（仅对话）' : ''
        return `${g.name}${rate}${tag}`
      })
      this.setData({
        groups,
        groupLabels,
        groupIndex: idx,
        groupId: selected?.id || currentGroupId,
        groupName: selected?.name || this.data.groupName,
        groupAllowsImage: selected ? selected.allow_image_generation !== false : true,
      })
    } catch {
      /* 拉取分组失败时保留当前默认展示 */
    } finally {
      this.setData({ groupsLoading: false })
    }
  },

  onPickGroup(e: WechatMiniprogram.CustomEvent<{ value?: string | number }>) {
    const idx = Number(e.detail?.value ?? 0)
    const picked = this.data.groups[idx]
    if (!picked) return
    this.setData({
      groupIndex: idx,
      groupId: picked.id,
      groupName: picked.name,
      groupAllowsImage: picked.allow_image_generation !== false,
    })
  },

  onShow() {
    void refreshPagePrivacy((patch) => this.setData(patch), 'profile')
  },

  onRequestPrivacy() {
    this.setData({ showPrivacyPanel: true })
  },

  onOpenPrivacyContract() {
    openPrivacyContractPage()
  },

  onAgreePrivacy() {
    onPagePrivacyAgree(this, 'profile-edit-agree-btn', () => {
      wx.showToast({ title: '已同意，请点击头像更换', icon: 'none' })
    })
  },

  async onChooseAvatar(e: WechatMiniprogram.CustomEvent) {
    const url = (e.detail as { avatarUrl?: string }).avatarUrl
    if (!url) return
    const saved = await persistStoredAvatar(url)
    this.setData({ avatarUrl: saved })
    wx.showToast({ title: '头像已更新', icon: 'success' })
  },

  onNicknameInput(e: WechatMiniprogram.Input) {
    this.setData({ nickname: e.detail.value, nicknameReviewPass: true })
  },

  onNicknameReview(e: WechatMiniprogram.CustomEvent) {
    const pass = !!(e.detail as { pass?: boolean }).pass
    this.setData({ nicknameReviewPass: pass })
    if (!pass) {
      wx.showToast({ title: '昵称未通过微信校验', icon: 'none' })
    }
  },

  onBioInput(e: WechatMiniprogram.TextareaInput) {
    this.setData({ bio: e.detail.value })
  },

  onCopyAccount() {
    if (!this.data.email) return
    copyText(this.data.email, { successTitle: '已复制账户' })
  },

  async onSave() {
    if (!this.data.nicknameReviewPass) {
      wx.showToast({ title: '昵称未通过微信校验，请修改', icon: 'none' })
      return
    }
    const nickname = (this.data.nickname || '').trim()
    if (!nickname) {
      wx.showToast({ title: '请填写昵称', icon: 'none' })
      return
    }
    const groupChanged = this.data.groupId > 0 && this.data.groupId !== this.data.initialGroupId
    if (groupChanged) {
      wx.showLoading({ title: '切换分组中', mask: true })
      try {
        await switchBoundGroup(this.data.groupId, this.data.groupName)
        wx.hideLoading()
      } catch (err) {
        wx.hideLoading()
        wx.showToast({
          title: err instanceof Error ? err.message : '切换分组失败',
          icon: 'none',
          duration: 3000,
        })
        return
      }
    }
    saveStoredNickname(nickname)
    saveStoredBio(this.data.bio || '')
    wx.showToast({ title: '资料已保存', icon: 'success' })
    setTimeout(() => {
      wx.navigateBack()
    }, 350)
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后将返回未登录状态，本地保存的头像与简介仍会保留。',
      confirmText: '退出',
      confirmColor: '#c0392b',
      success: (res) => {
        if (!res.confirm) return
        logout()
        wx.showToast({ title: '已退出登录', icon: 'none' })
        setTimeout(() => {
          wx.navigateBack()
        }, 300)
      },
    })
  },
})
