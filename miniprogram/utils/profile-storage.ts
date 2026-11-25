export const NICKNAME_STORAGE_KEY = 'profile_nickname'
export const AVATAR_STORAGE_KEY = 'profile_avatar'
export const BIO_STORAGE_KEY = 'profile_bio'
export const DEFAULT_AVATAR_URL = 'https://tdesign.gtimg.com/mobile/demos/avatar1.png'

export type StoredProfile = {
  nickname: string
  avatarUrl: string
  bio: string
}

export function loadStoredProfile(email = ''): StoredProfile {
  const storedNickname = (wx.getStorageSync(NICKNAME_STORAGE_KEY) as string) || ''
  const avatarUrl = (wx.getStorageSync(AVATAR_STORAGE_KEY) as string) || ''
  const bio = (wx.getStorageSync(BIO_STORAGE_KEY) as string) || ''
  const nickname = storedNickname || (email ? email.split('@')[0] : '')
  return { nickname, avatarUrl, bio }
}

export function saveStoredNickname(nickname: string) {
  wx.setStorageSync(NICKNAME_STORAGE_KEY, nickname.trim())
}

export function saveStoredBio(bio: string) {
  wx.setStorageSync(BIO_STORAGE_KEY, bio.trim())
}

export function persistStoredAvatar(tempPath: string): Promise<string> {
  return new Promise((resolve) => {
    const apply = (path: string) => {
      wx.setStorageSync(AVATAR_STORAGE_KEY, path)
      resolve(path)
    }
    const fs = wx.getFileSystemManager?.()
    if (fs && typeof fs.saveFile === 'function') {
      fs.saveFile({
        tempFilePath: tempPath,
        success: (res) => apply(res.savedFilePath),
        fail: () => apply(tempPath),
      })
      return
    }
    apply(tempPath)
  })
}
