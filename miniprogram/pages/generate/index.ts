import { ensureApiKey } from '../../services/auth'
import { runGenerate } from '../../services/image-gen'
import { persistGenerateResult } from '../../utils/image-result'

Page({
  data: {
    statusBarHeight: 44,
    previewImage: '',
    resultImage: '',
    generating: false,
    completed: false,
    progress: 0,
    statusText: '色彩美化中…',
    remainingTime: 49,
    colorIntensity: 70,
    templateId: null as number | null,
    prompt: '',
    editingPrompt: true, // 默认显示提示词编辑界面
    promptInput: '', // 用户输入的提示词
    apiType: 'generate' as 'generate' | 'edit', // API 类型
  },

  onLoad(query: Record<string, string | undefined>) {
    const systemInfo = wx.getSystemInfoSync()
    const hasImage = !!query.image
    
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight || 44,
      previewImage: query.image || '',
      templateId: query.templateId ? Number(query.templateId) : null,
      prompt: decodeURIComponent(query.prompt || ''),
      promptInput: decodeURIComponent(query.prompt || ''),
      apiType: hasImage ? 'edit' : 'generate', // 有图片默认图生图，否则文生图
    })
  },

  onImageLoad() {
    // 图片加载完成
  },

  onSelectApi(e: any) {
    const type = e.currentTarget.dataset.type as 'generate' | 'edit'
    
    // 如果选择图生图但没有图片，提示用户
    if (type === 'edit' && !this.data.previewImage) {
      wx.showToast({ 
        title: '图生图需要上传图片', 
        icon: 'none',
        duration: 2000,
      })
      return
    }
    
    this.setData({ apiType: type })
  },

  onPromptInput(e: any) {
    this.setData({ promptInput: e.detail.value })
  },

  onCancelEdit() {
    wx.navigateBack()
  },

  onConfirmGenerate() {
    const { promptInput, apiType, previewImage } = this.data
    
    // 验证提示词
    if (!promptInput || promptInput.trim().length === 0) {
      wx.showToast({ 
        title: '请输入提示词', 
        icon: 'none',
        duration: 2000,
      })
      return
    }
    
    // 验证图生图必须有图片
    if (apiType === 'edit' && !previewImage) {
      wx.showToast({ 
        title: '图生图需要上传图片', 
        icon: 'none',
        duration: 2000,
      })
      return
    }
    
    // 更新提示词并开始生成
    this.setData({ 
      prompt: promptInput.trim(),
      editingPrompt: false,
    })
    
    console.log('准备生成，参数:', {
      prompt: promptInput.trim(),
      apiType,
      previewImage,
      hasImage: !!previewImage,
      imageType: previewImage ? (previewImage.startsWith('http') ? 'network' : 'local') : 'none',
    })
    
    // 延迟一帧再开始生成，确保界面切换流畅
    setTimeout(() => {
      this.startGenerate()
    }, 100)
  },

  async startGenerate() {
    this.setData({ 
      generating: true,
      progress: 0,
      statusText: '色彩美化中…',
    })

    // 模拟进度更新（醒图风格）
    this.simulateProgress()

    try {
      await ensureApiKey()
      
      // 如果没有图片且 prompt 为空，提示错误
      if (!this.data.previewImage && !this.data.prompt) {
        throw new Error('缺少生成参数，请返回重试')
      }
      
      console.log('开始生成，调用 API:', {
        prompt: this.data.prompt,
        hasImage: !!this.data.previewImage,
        apiType: this.data.previewImage ? '图生图 (edits)' : '文生图 (generations)',
      })
      
      const result = await runGenerate({
        prompt: this.data.prompt,
        imagePath: this.data.previewImage || undefined,
      })

      const output = await persistGenerateResult(result)
      
      this.setData({
        generating: false,
        completed: true,
        progress: 100,
        resultImage: output,
        statusText: '生成完成',
      })

      // 注意：不在这里自动保存，等用户点击"一键出片"时再保存
      // 这样避免重复保存，也给用户选择的机会
    } catch (e) {
      this.setData({ generating: false })
      
      const errorMsg = e instanceof Error ? e.message : '生成失败'
      console.error('生成失败:', errorMsg, e)
      
      wx.showModal({
        title: '生成失败',
        content: errorMsg,
        showCancel: true,
        cancelText: '返回',
        confirmText: '重试',
        confirmColor: '#D4F826',
        success: (res) => {
          if (res.confirm) {
            // 重试
            void this.startGenerate()
          } else {
            // 返回到编辑界面
            this.setData({ editingPrompt: true })
          }
        },
      })
    }
  },

  simulateProgress() {
    const stages = [
      { progress: 15, text: '色彩美化中…', time: 45 },
      { progress: 35, text: '细节优化中…', time: 35 },
      { progress: 53, text: '质感渲染中…', time: 25 },
      { progress: 70, text: 'AI增强中…', time: 15 },
      { progress: 85, text: '最终调整中…', time: 8 },
      { progress: 95, text: '即将完成…', time: 3 },
    ]

    let currentStage = 0
    const updateProgress = () => {
      if (!this.data.generating || currentStage >= stages.length) return

      const stage = stages[currentStage]
      this.setData({
        progress: stage.progress,
        statusText: stage.text,
        remainingTime: stage.time,
      })

      currentStage++
      setTimeout(updateProgress, 2000 + Math.random() * 1000)
    }

    setTimeout(updateProgress, 500)
  },

  async saveToWorks(imageUrl: string) {
    try {
      // 如果是本地路径，先上传到云存储
      let cloudUrl = imageUrl
      
      console.log('准备保存作品，图片路径:', imageUrl)
      
      // 检查是否是本地路径
      const isLocalPath = imageUrl.startsWith('wxfile://') || 
                         imageUrl.startsWith('http://tmp/') ||
                         imageUrl.includes(wx.env.USER_DATA_PATH)
      
      if (isLocalPath) {
        try {
          // 验证文件是否存在
          const fs = wx.getFileSystemManager()
          const fileExists = await new Promise<boolean>((resolve) => {
            fs.access({
              path: imageUrl,
              success: () => resolve(true),
              fail: () => resolve(false),
            })
          })
          
          if (!fileExists) {
            console.error('本地文件不存在:', imageUrl)
            throw new Error('本地文件不存在')
          }
          
          console.log('开始上传到云存储...')
          const cloudPath = `works/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.png`
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath,
            filePath: imageUrl,
          })
          cloudUrl = uploadRes.fileID
          console.log('图片已上传到云存储:', cloudUrl)
        } catch (uploadErr: any) {
          console.error('上传图片到云存储失败:', uploadErr)
          wx.showToast({ 
            title: uploadErr.errMsg || '上传失败', 
            icon: 'none',
            duration: 3000,
          })
          // 上传失败时不保存作品
          return
        }
      }

      // 保存到数据库
      console.log('保存作品到数据库...')
      await wx.cloud.callFunction({
        name: 'userworks',
        data: {
          action: 'addWork',
          userId: wx.getStorageSync('user_openid') || 'demo_user',
          url: cloudUrl,
          templateId: this.data.templateId,
          prompt: this.data.prompt,
        },
      })
      
      console.log('作品已保存成功')
      wx.showToast({ 
        title: '已保存到作品集', 
        icon: 'success',
        duration: 2000,
      })
    } catch (e: any) {
      console.error('保存作品失败:', e)
      wx.showToast({ 
        title: e.errMsg || '保存失败', 
        icon: 'none',
        duration: 3000,
      })
    }
  },

  onColorIntensityChange(e: WechatMiniprogram.SliderChange) {
    this.setData({
      colorIntensity: e.detail.value,
    })
  },

  onClose() {
    if (this.data.generating) {
      wx.showModal({
        title: '确认退出',
        content: '生成进行中，确定要退出吗？',
        confirmText: '继续生成',
        cancelText: '退出',
        confirmColor: '#D4F826',
        success: (res) => {
          if (!res.confirm) {
            wx.navigateBack()
          }
        },
      })
    } else {
      wx.navigateBack()
    }
  },

  onCancel() {
    wx.showModal({
      title: '取消生成',
      content: '确定要取消当前生成任务吗？',
      confirmText: '继续生成',
      cancelText: '取消任务',
      confirmColor: '#D4F826',
      success: (res) => {
        if (!res.confirm) {
          this.setData({ generating: false })
          wx.navigateBack()
        }
      },
    })
  },

  onShowMore() {
    wx.showToast({ title: '编辑功能开发中', icon: 'none' })
  },

  onSaveToAlbum() {
    if (!this.data.resultImage) {
      wx.showToast({ title: '请等待生成完成', icon: 'none' })
      return
    }

    console.log('准备保存到相册，图片路径:', this.data.resultImage)

    wx.showLoading({ title: '保存中' })
    wx.saveImageToPhotosAlbum({
      filePath: this.data.resultImage,
      success: () => {
        wx.hideLoading()
        wx.showToast({ title: '已保存到相册', icon: 'success' })
      },
      fail: (err) => {
        wx.hideLoading()
        console.error('保存到相册失败:', err)
        if (err.errMsg.includes('auth deny')) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中开启相册权限',
            confirmText: '去设置',
            confirmColor: '#D4F826',
            success: (res) => {
              if (res.confirm) {
                wx.openSetting()
              }
            },
          })
        } else {
          wx.showToast({ 
            title: err.errMsg || '保存失败', 
            icon: 'none',
            duration: 3000,
          })
        }
      },
    })
  },

  async onOneKeyExport() {
    if (!this.data.resultImage) {
      wx.showToast({ title: '请等待生成完成', icon: 'none' })
      return
    }

    console.log('一键出片，图片路径:', this.data.resultImage)

    // 先保存到云存储和数据库
    wx.showLoading({ title: '保存中...' })
    
    try {
      await this.saveToWorks(this.data.resultImage)
      wx.hideLoading()
      
      // 然后保存到相册
      try {
        await new Promise<void>((resolve, reject) => {
          wx.saveImageToPhotosAlbum({
            filePath: this.data.resultImage,
            success: () => resolve(),
            fail: (err) => reject(err),
          })
        })
        
        // 保存成功，延迟返回
        wx.showToast({ 
          title: '已保存到相册和作品集', 
          icon: 'success',
          duration: 2000,
        })
        setTimeout(() => {
          wx.navigateBack()
        }, 2000)
      } catch (albumErr: any) {
        console.error('保存到相册失败:', albumErr)
        // 相册保存失败，但作品已保存到云端
        if (albumErr.errMsg && albumErr.errMsg.includes('auth deny')) {
          wx.showModal({
            title: '需要相册权限',
            content: '作品已保存到云端，但保存到相册需要授权',
            confirmText: '去设置',
            cancelText: '知道了',
            confirmColor: '#D4F826',
            success: (res) => {
              if (res.confirm) {
                wx.openSetting()
              } else {
                wx.navigateBack()
              }
            },
          })
        } else {
          wx.showToast({ 
            title: '作品已保存到云端', 
            icon: 'success',
            duration: 2000,
          })
          setTimeout(() => {
            wx.navigateBack()
          }, 2000)
        }
      }
    } catch (saveErr: any) {
      wx.hideLoading()
      console.error('保存作品失败:', saveErr)
      // 如果保存失败，显示详细错误信息
      const errorMsg = saveErr.message || saveErr.errMsg || '保存失败，请重试'
      wx.showModal({
        title: '保存失败',
        content: errorMsg,
        showCancel: false,
        confirmColor: '#D4F826',
      })
    }
  },

  onShare() {
    wx.showToast({ title: '分享功能开发中', icon: 'none' })
  },
})
