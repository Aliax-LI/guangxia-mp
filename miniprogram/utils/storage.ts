const ACCESS_TOKEN = 'sub2api_access_token'
const REFRESH_TOKEN = 'sub2api_refresh_token'
const API_KEY = 'sub2api_api_key'
const API_KEY_ID = 'sub2api_api_key_id'
const USER_EMAIL = 'sub2api_user_email'
const MANIFEST_VERSION = 'manifest_version'

export function getAccessToken(): string {
  return wx.getStorageSync(ACCESS_TOKEN) || ''
}

export function setAccessToken(token: string) {
  wx.setStorageSync(ACCESS_TOKEN, token)
}

export function getRefreshToken(): string {
  return wx.getStorageSync(REFRESH_TOKEN) || ''
}

export function setRefreshToken(token: string) {
  wx.setStorageSync(REFRESH_TOKEN, token)
}

export function getApiKey(): string {
  return wx.getStorageSync(API_KEY) || ''
}

export function setApiKey(key: string) {
  wx.setStorageSync(API_KEY, key)
}

export function getApiKeyId(): number {
  return Number(wx.getStorageSync(API_KEY_ID) || 0)
}

export function setApiKeyId(id: number) {
  wx.setStorageSync(API_KEY_ID, id)
}

export function getUserEmail(): string {
  return wx.getStorageSync(USER_EMAIL) || ''
}

export function setUserEmail(email: string) {
  wx.setStorageSync(USER_EMAIL, email)
}

export function clearAuth() {
  wx.removeStorageSync(ACCESS_TOKEN)
  wx.removeStorageSync(REFRESH_TOKEN)
  wx.removeStorageSync(API_KEY)
  wx.removeStorageSync(API_KEY_ID)
  wx.removeStorageSync(USER_EMAIL)
}

export function getManifestVersion(): string {
  return wx.getStorageSync(MANIFEST_VERSION) || ''
}

export function setManifestVersion(v: string) {
  wx.setStorageSync(MANIFEST_VERSION, v)
}

/** @deprecated 兼容旧键名 */
export function getUserToken(): string {
  return getAccessToken()
}
