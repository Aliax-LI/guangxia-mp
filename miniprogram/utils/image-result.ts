import type { GeneratedImage, GenerateResult } from '../services/image-gen'

function imageExt(b64: string): string {
  if (b64.startsWith('/9j/')) return 'jpg'
  if (b64.startsWith('UklG')) return 'webp'
  return 'png'
}

export function persistGenerateResult(result: GeneratedImage): Promise<string> {
  if (result.imageUrl) return Promise.resolve(result.imageUrl)

  if (result.b64) {
    const fs = wx.getFileSystemManager()
    const timestamp = Date.now()
    const random = Math.random().toString(36).slice(2, 9)
    const path = `${wx.env.USER_DATA_PATH}/gen_${timestamp}_${random}.${imageExt(result.b64)}`
    
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

export async function persistGenerateOutputs(result: GenerateResult): Promise<string[]> {
  const list = result.outputs?.length
    ? result.outputs
    : [{ imageUrl: result.imageUrl, b64: result.b64 }]
  const paths: string[] = []
  for (const item of list) {
    paths.push(await persistGenerateResult(item))
  }
  return paths
}
