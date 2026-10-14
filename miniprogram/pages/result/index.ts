import { getResultOriginal, getResultOutput } from '../../utils/session'

Page({
  data: {
    original: '',
    output: '',
    splitPercent: 50,
    compareWidth: 375,
    compareHeight: 420,
  },

  onLoad() {
    const original = getResultOriginal()
    const output = getResultOutput()
    if (!output) {
      wx.navigateBack()
      return
    }
    const sys = wx.getSystemInfoSync()
    const compareWidth = sys.windowWidth
    const compareHeight = Math.round(compareWidth * 1.1)
    this.setData({ original, output, compareWidth, compareHeight })
  },

  onHandleStart() {
    /* move handled in onHandleMove */
  },

  onHandleMove(e: any) {
    const x = e.touches[0]?.clientX ?? 0
    const w = this.data.compareWidth
    const pct = Math.min(98, Math.max(2, (x / w) * 100))
    this.setData({ splitPercent: pct })
  },

  onSave() {
    const path = this.data.output
    const saveLocal = (filePath: string) => {
      wx.saveImageToPhotosAlbum({
        filePath,
        success: () => wx.showToast({ title: '已保存' }),
        fail: () => wx.showToast({ title: '保存失败，请授权相册', icon: 'none' }),
      })
    }
    if (path.startsWith('http')) {
      wx.downloadFile({
        url: path,
        success: (res) => {
          if (res.statusCode === 200) saveLocal(res.tempFilePath)
        },
        fail: () => wx.showToast({ title: '下载失败', icon: 'none' }),
      })
    } else {
      saveLocal(path)
    }
  },

  onBack() {
    wx.navigateBack({ delta: 2 })
  },
})
