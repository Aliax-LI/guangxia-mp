import { ensureApiKey } from '../../services/auth'
import { runGenerate } from '../../services/image-gen'
import { persistGenerateResult } from '../../utils/image-result'
import {
  getEditorImage,
  getEditorPrompt,
  setEditorPrompt,
  setResultPaths,
} from '../../utils/session'

Page({
  data: {
    imagePath: '',
    prompt: '',
    generating: false,
  },

  onLoad() {
    const imagePath = getEditorImage()
    const prompt = getEditorPrompt()
    if (!imagePath) {
      wx.showToast({ title: '请先选择图片', icon: 'none' })
      wx.navigateBack()
      return
    }
    this.setData({ imagePath, prompt })
  },

  onPromptChange(e: any) {
    const prompt = e.detail?.value || ''
    this.setData({ prompt })
    setEditorPrompt(prompt)
  },

  async onGenerate() {
    if (this.data.generating) return
    const prompt = this.data.prompt.trim()
    if (!prompt) {
      wx.showToast({ title: '请输入描述', icon: 'none' })
      return
    }
    this.setData({ generating: true })
    try {
      await ensureApiKey()
      const result = await runGenerate({
        prompt,
        imagePath: this.data.imagePath,
      })
      const output = await persistGenerateResult(result)
      setResultPaths(this.data.imagePath, output)
      wx.navigateTo({ url: '/pages/result/index' })
    } catch (e) {
      wx.showToast({
        title: e instanceof Error ? e.message : '生成失败',
        icon: 'none',
        duration: 3000,
      })
    } finally {
      this.setData({ generating: false })
    }
  },
})
