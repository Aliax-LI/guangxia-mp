/** 查询用户是否已同意《小程序用户隐私保护指引》 */
export function queryPrivacyAuthorized(): Promise<{
  ok: boolean
  contractName: string
}> {
  return new Promise((resolve) => {
    if (!wx.getPrivacySetting) {
      resolve({ ok: true, contractName: '' })
      return
    }
    wx.getPrivacySetting({
      success: (res) => {
        resolve({
          ok: !res.needAuthorization,
          contractName: res.privacyContractName || '用户隐私保护指引',
        })
      },
      fail: () => resolve({ ok: true, contractName: '' }),
    })
  })
}

export function openPrivacyContract() {
  if (wx.openPrivacyContract) {
    wx.openPrivacyContract({ fail: () => {} })
  }
}
