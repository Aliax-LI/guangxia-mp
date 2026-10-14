import { completePrivacyAuthorization } from './privacy-resolve'
import { openPrivacyContract, queryPrivacyAuthorized } from './privacy'

type PrivacyPageData = {
  privacyOk: boolean
  showPrivacyPanel: boolean
  privacyContractName: string
  privacyDesc: string
}

/** 页面 onShow 同步 wx.getPrivacySetting */
export async function refreshPagePrivacy(
  setData: (patch: Partial<PrivacyPageData>) => void,
  scene: 'picker' | 'profile',
) {
  const { ok, contractName } = await queryPrivacyAuthorized()
  const name = contractName || '用户隐私保护指引'
  const privacyDesc =
    scene === 'profile'
      ? `使用微信头像、昵称前，需阅读并同意《${name}》。`
      : `使用相册、相机选择照片前，需阅读并同意《${name}》。`
  setData({
    privacyOk: ok,
    privacyContractName: name,
    privacyDesc,
    showPrivacyPanel: false,
  })
}

export function onPagePrivacyAgree(
  page: WechatMiniprogram.Page.Instance<{ showPrivacyPanel: boolean; privacyOk: boolean }>,
  buttonId: string,
  after?: () => void,
) {
  completePrivacyAuthorization(buttonId)
  page.setData({ privacyOk: true, showPrivacyPanel: false })
  if (after) after()
  void queryPrivacyAuthorized().then(({ ok }) => {
    page.setData({ privacyOk: ok })
  })
}

export function openPrivacyContractPage() {
  openPrivacyContract()
}
