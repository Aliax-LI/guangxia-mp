const ACCESS_TOKEN = 'sub2api_access_token'
const REFRESH_TOKEN = 'sub2api_refresh_token'
const TOKEN_EXPIRES_AT = 'sub2api_token_expires_at'
const API_KEY = 'sub2api_api_key'
const API_KEY_ID = 'sub2api_api_key_id'
const API_KEY_NAME = 'sub2api_api_key_name'
/** 记住这个 Key 属于哪个 Sub2API 分组，用来判断能不能出图 */
const API_KEY_GROUP = 'sub2api_api_key_group'
const PREFERRED_GROUP_ID = 'sub2api_preferred_group_id'
const PREFERRED_GROUP_NAME = 'sub2api_preferred_group_name'
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

function decodeBase64Url(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const bytes = new Uint8Array(wx.base64ToArrayBuffer(base64 + pad))
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  try {
    return decodeURIComponent(escape(binary))
  } catch {
    return binary
  }
}

/** JWT `exp`（毫秒）。解析失败返回 0。 */
function readJwtExpMs(token: string): number {
  const payload = token.split('.')[1]
  if (!payload) return 0
  try {
    const exp = Number(JSON.parse(decodeBase64Url(payload)).exp)
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : 0
  } catch {
    return 0
  }
}

/** 优先用登录时记下的绝对过期时间，旧会话回退到 JWT exp。 */
export function getAccessTokenExpiresAt(token = ''): number {
  const stored = Number(wx.getStorageSync(TOKEN_EXPIRES_AT) || 0)
  if (stored > 0) return stored
  return token ? readJwtExpMs(token) : 0
}

export function setAccessTokenExpiry(expiresInSeconds?: number, accessToken?: string) {
  if (expiresInSeconds && expiresInSeconds > 0) {
    wx.setStorageSync(TOKEN_EXPIRES_AT, Date.now() + expiresInSeconds * 1000)
    return
  }
  const exp = accessToken ? readJwtExpMs(accessToken) : 0
  if (exp) wx.setStorageSync(TOKEN_EXPIRES_AT, exp)
  else wx.removeStorageSync(TOKEN_EXPIRES_AT)
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

export function getApiKeyName(): string {
  return wx.getStorageSync(API_KEY_NAME) || ''
}

export function setApiKeyName(name: string) {
  if (name) wx.setStorageSync(API_KEY_NAME, name)
  else wx.removeStorageSync(API_KEY_NAME)
}

export function getApiKeyGroup(): string {
  return wx.getStorageSync(API_KEY_GROUP) || ''
}

export function clearApiKey() {
  wx.removeStorageSync(API_KEY)
  wx.removeStorageSync(API_KEY_ID)
  wx.removeStorageSync(API_KEY_NAME)
  wx.removeStorageSync(API_KEY_GROUP)
}

export function setApiKeyGroup(group: string) {
  if (group) wx.setStorageSync(API_KEY_GROUP, group)
  else wx.removeStorageSync(API_KEY_GROUP)
}

export function getPreferredGroupId(): number {
  const n = Number(wx.getStorageSync(PREFERRED_GROUP_ID) || 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function getPreferredGroupName(): string {
  return wx.getStorageSync(PREFERRED_GROUP_NAME) || ''
}

export function setPreferredGroup(id: number, name?: string) {
  if (id > 0) wx.setStorageSync(PREFERRED_GROUP_ID, id)
  else wx.removeStorageSync(PREFERRED_GROUP_ID)
  if (name) wx.setStorageSync(PREFERRED_GROUP_NAME, name)
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
  wx.removeStorageSync(TOKEN_EXPIRES_AT)
  wx.removeStorageSync(API_KEY)
  wx.removeStorageSync(API_KEY_ID)
  wx.removeStorageSync(API_KEY_NAME)
  wx.removeStorageSync(API_KEY_GROUP)
  wx.removeStorageSync(PREFERRED_GROUP_ID)
  wx.removeStorageSync(PREFERRED_GROUP_NAME)
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
