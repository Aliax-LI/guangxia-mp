export type PrivacySheetHost = {
  requestAuthorize: (contractName?: string, scene?: string) => Promise<void>
}

export function getActivePrivacySheet(): PrivacySheetHost | null {
  const pages = getCurrentPages()
  const page = pages[pages.length - 1]
  if (!page) return null
  const sheet = (page as WechatMiniprogram.Page.TrivialInstance).selectComponent?.('#privacy-sheet')
  return (sheet as unknown as PrivacySheetHost) || null
}
