/** 微信 onNeedPrivacyAuthorization 回调：须在用户点击 agree 按钮的 bindagreeprivacyauthorization 之后调用 */
export type PrivacyResolve = (detail: {
  buttonId: string
  event: 'agree' | 'disagree'
}) => void

export function completePrivacyAuthorization(buttonId: string) {
  const app = getApp<{ globalData: { privacyResolve: PrivacyResolve | null } }>()
  const resolve = app.globalData.privacyResolve
  if (resolve) {
    resolve({ buttonId, event: 'agree' })
    app.globalData.privacyResolve = null
  }
}
