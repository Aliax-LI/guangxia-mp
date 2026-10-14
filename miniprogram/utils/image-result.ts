import type { GenerateResult } from '../services/image-gen'

export function persistGenerateResult(result: GenerateResult): Promise<string> {
  if (result.imageUrl) return Promise.resolve(result.imageUrl)
  if (result.b64) {
    const fs = wx.getFileSystemManager()
    const path = `${wx.env.USER_DATA_PATH}/gen_${Date.now()}.png`
    return new Promise((resolve, reject) => {
      fs.writeFile({
        filePath: path,
        data: result.b64!,
        encoding: 'base64',
        success: () => resolve(path),
        fail: () => reject(new Error('保存图片失败')),
      })
    })
  }
  return Promise.reject(new Error('无图片结果'))
}
