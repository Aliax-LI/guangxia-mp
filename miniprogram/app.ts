import { isLoggedIn, ensureApiKey } from './services/auth'
import { CLOUD_ENV_ID } from './config/index'
import type { PrivacyResolve } from './utils/privacy-resolve'

App({
  globalData: {
    manifestVersion: '',
    privacyResolve: null as PrivacyResolve | null,
  },
  onLaunch() {
    if (wx.onNeedPrivacyAuthorization) {
      wx.onNeedPrivacyAuthorization((resolve) => {
        this.globalData.privacyResolve = resolve as PrivacyResolve
        const pages = getCurrentPages()
        const cur = pages[pages.length - 1] as WechatMiniprogram.Page.TrivialInstance | undefined
        cur?.setData?.({ showPrivacyPanel: true })
      })
    }
    if (wx.cloud) {
      try {
        wx.cloud.init({
          env: CLOUD_ENV_ID,
          traceUser: true,
        })
      } catch {
        /* 云环境未配置时平稳兜底 */
      }
    }
    if (typeof wx.loadFontFace === 'function') {
      wx.loadFontFace({
        family: 't',
        source: 'url("https://tdesign.gtimg.com/icon/0.4.5/fonts/t.woff")',
        global: true,
        scopes: ['webview', 'native'],
        fail: () => {},
      })
    }
    if (isLoggedIn()) {
      ensureApiKey().catch(() => {})
    }
  },
})
