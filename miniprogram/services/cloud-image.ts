import { TEMPLATE_CDN_IMAGE_PREFIX } from '../config/index'

/**
 * 云存储地址转换器。
 *
 * 数据库封面仍保留原始 YouMind 地址作为兜底；只要知道模版 ID 且已上传全量封面，
 * 就统一替换成 MinIO / CDN 地址，避免小程序直连慢速图片源。
 * CLOUD_STORAGE_IMAGE_PREFIX 留空表示当前不使用微信云存储 fileID 直链。
 */
export function toTemplateImageUrl(url: string, id?: number | string): string {
  if (!url) return ''

  // 数据库保存了 cloud:// fileID 时，转换成小程序可直接加载的默认云存储 HTTPS 地址
  if (url.startsWith('cloud://')) {
    const rest = url.slice('cloud://'.length)
    const slashIndex = rest.indexOf('/')
    if (slashIndex > 0) {
      const bucket = rest.slice(0, slashIndex).split('.').pop()
      const objectPath = rest.slice(slashIndex + 1)
      if (bucket) return `https://${bucket}.tcb.qcloud.la/${objectPath}`
    }
  }

  const templateId = id == null ? '' : String(id).trim()
  if (!templateId || !TEMPLATE_CDN_IMAGE_PREFIX) return url

  // 当前全量封面已在 MinIO/CDN；原始 CMS 地址和旧云存储直链都可以按 ID 安全替换
  if (/^https:\/\/.+(youmind\.com|tcb\.qcloud\.la|tcb\.qcloud\.cn)\//i.test(url)) {
    return `${TEMPLATE_CDN_IMAGE_PREFIX}/${encodeURIComponent(templateId)}.jpg`
  }

  return url
}
