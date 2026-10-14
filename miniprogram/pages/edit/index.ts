import { isLoggedIn } from '../../services/auth'
import { pickOneImage, type PickImageSource } from '../../utils/pick-image'
import {
  onPagePrivacyAgree,
  openPrivacyContractPage,
  refreshPagePrivacy,
} from '../../utils/privacy-page'
import { setEditorImage, setEditorPrompt } from '../../utils/session'

interface StylePreset {
  id: string
  label: string
  prompt: string
  icon: string
  tag: string
}

const PRESETS: StylePreset[] = [
  { id: 'soft', label: '柔光人像', tag: '通透奶油感', prompt: '柔和漫射自然光，空灵氛围，保留人物身份', icon: 'user' },
  { id: 'film', label: '胶片复古', tag: '细腻颗粒感', prompt: '胶片质感，轻微颗粒，自然肤色，保留人物身份', icon: 'film' },
  { id: 'cyber', label: '赛博潮酷', tag: '未来霓虹光', prompt: '赛博朋克霓虹氛围，高对比，保留主体构图', icon: 'lighting-circle' },
  { id: 'clean', label: '清爽通透', tag: '原相机高质感', prompt: '干净明亮，轻微磨皮，自然真实', icon: 'sunny' },
]

const QUICK_TAGS = ['细腻胶片微粒', '自然通透冷白皮', '电影光影氛围', '8K超清质感', '氛围感柔焦']

Page({
  data: {
    imagePath: '',
    presets: PRESETS,
    selectedPresetId: 'soft',
    promptExtra: '',
    quickTags: QUICK_TAGS,
    privacyOk: false,
    showPrivacyPanel: false,
    privacyContractName: '用户隐私保护指引',
    privacyDesc: '',
    pendingPickSource: '' as PickImageSource | '',
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ value: '/pages/edit/index' })
    }
    void refreshPagePrivacy((patch) => this.setData(patch), 'picker')
  },

  onOpenPrivacyContract() {
    openPrivacyContractPage()
  },

  onPrivacyAgree() {
    onPagePrivacyAgree(this, 'edit-agree-btn', () => {
      const source = this.data.pendingPickSource || 'any'
      this.setData({ pendingPickSource: '' })
      this.runPick(source)
    })
  },

  onPickImage(e: WechatMiniprogram.BaseEvent) {
    const source = (e.currentTarget?.dataset?.source as PickImageSource) || 'any'
    if (!this.data.privacyOk) {
      this.setData({ showPrivacyPanel: true, pendingPickSource: source })
      return
    }
    this.runPick(source)
  },

  runPick(source: PickImageSource) {
    pickOneImage(source)
      .then((path) => this.setData({ imagePath: path }))
      .catch(() => {})
  },

  onClearImage() {
    this.setData({ imagePath: '' })
  },

  onSelectPreset(e: WechatMiniprogram.BaseEvent) {
    const id = e.currentTarget?.dataset?.id as string
    this.setData({ selectedPresetId: id })
  },

  onAddTag(e: WechatMiniprogram.BaseEvent) {
    const tag = e.currentTarget?.dataset?.tag as string
    const current = this.data.promptExtra.trim()
    if (current.includes(tag)) return
    const updated = current ? `${current}，${tag}` : tag
    this.setData({ promptExtra: updated })
  },

  onPromptChange(e: WechatMiniprogram.CustomEvent) {
    this.setData({ promptExtra: (e.detail as { value?: string })?.value || '' })
  },

  onClearPrompt() {
    this.setData({ promptExtra: '' })
  },

  onGoEditor() {
    if (!this.data.imagePath) {
      wx.showToast({ title: '请先导入照片', icon: 'none' })
      return
    }
    if (!isLoggedIn()) {
      wx.navigateTo({ url: '/pages/login/index' })
      return
    }
    const preset = PRESETS.find((p) => p.id === this.data.selectedPresetId)
    const prompt = [preset?.prompt, this.data.promptExtra].filter(Boolean).join('，')
    setEditorImage(this.data.imagePath)
    setEditorPrompt(prompt)
    wx.navigateTo({ url: '/pages/editor-edit/index' })
  },
})
