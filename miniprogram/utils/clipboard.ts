/**
 * 复制文本到剪切板，并在微信小程序隐私指引未声明剪切板权限（errno 112）时触发兜底。
 */
export function copyText(
  data: string,
  options?: {
    successTitle?: string
    onPrivacyFallback?: (text: string) => void
  },
): void {
  const text = (data || '').trim()
  if (!text) return
  wx.setClipboardData({
    data: text,
    success: () => {
      if (options?.successTitle) {
        wx.showToast({ title: options.successTitle, icon: 'success' })
      }
    },
    fail: (err: { errno?: number; errMsg?: string }) => {
      const msg = err?.errMsg || ''
      const isPrivacyBlock = err?.errno === 112 || /privacy/i.test(msg)
      if (isPrivacyBlock) {
        if (options?.onPrivacyFallback) {
          options.onPrivacyFallback(text)
          return
        }
        wx.showModal({
          title: '暂无法一键复制',
          content: '微信隐私指引尚未声明剪切板权限，暂不支持一键复制。请在微信公众平台补充「剪切板」声明后重试。',
          showCancel: false,
          confirmColor: '#1c1815',
        })
        return
      }
      wx.showToast({ title: '复制失败，请再试一次', icon: 'none' })
    },
  })
}
