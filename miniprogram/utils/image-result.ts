import type { GenerateResult } from '../services/image-gen'

export function persistGenerateResult(result: GenerateResult): Promise<string> {
  // 如果返回的是 URL，直接使用
  if (result.imageUrl) {
    console.log('使用 imageUrl:', result.imageUrl)
    return Promise.resolve(result.imageUrl)
  }
  
  // 如果返回的是 base64，保存到本地
  if (result.b64) {
    const fs = wx.getFileSystemManager()
    const timestamp = Date.now()
    const random = Math.random().toString(36).substr(2, 9)
    const path = `${wx.env.USER_DATA_PATH}/gen_${timestamp}_${random}.png`
    
    console.log('保存 base64 图片到:', path)
    
    return new Promise((resolve, reject) => {
      fs.writeFile({
        filePath: path,
        data: result.b64!,
        encoding: 'base64',
        success: () => {
          console.log('图片保存成功:', path)
          resolve(path)
        },
        fail: (err) => {
          console.error('保存图片失败:', err)
          reject(new Error('保存图片失败: ' + (err.errMsg || '')))
        },
      })
    })
  }
  
  return Promise.reject(new Error('无图片结果'))
}
