/** 云开发环境 ID */
export const CLOUD_ENV_ID = 'ai-d6galcttd058c3cc5'

/**
 * 云存储模版图片加速前缀。cloud://xxx.6169-xxx/templates 对应的默认 HTTP CDN 是：
 * https://6169-ai-d6galcttd058c3cc5-1358988647.tcb.qcloud.la/templates
 * 全量模版封面已上传到 MinIO 桶 ai_model_minio/platform-ai-base/youmind/templates/。
 */
/**
 * MinIO / CDN 上的全量模版封面地址前缀。
 * 本地 cloud-storage-assets/templates/{id}.jpg 已通过 mc mirror 上传到
 * ai_model_minio/platform-ai-base/youmind/templates/。
 */
export const TEMPLATE_CDN_IMAGE_PREFIX =
  'https://inner-oss-wlcb.bellecdn.cn/files/platform-ai-base/youmind/templates'

export const CLOUD_STORAGE_IMAGE_PREFIX = ''

/**
 * 运行前请在微信公众平台配置 request / downloadFile 合法域名。
 */
export const SUB2API_BASE_URL = 'https://sub2api.343426.xyz'

/** Sub2API 业务 API 前缀 */
export const SUB2API_API_V1 = `${SUB2API_BASE_URL}/api/v1`

/**
 * 分页 manifest 根路径（M2 上传 OSS 后的 HTTPS 前缀，末尾无 /）。
 * USE_DEV_MANIFEST=true 时使用内置 dev-manifest（仅 1 个分类 20 条，便于联调）。
 */
export const USE_DEV_MANIFEST = true

export const MANIFEST_BASE_URL =
  'https://inner-oss-wlcb.bellecdn.cn/files/platform-ai-base/youmind/manifest'

/** 生图模型名（与 sub2api 渠道配置一致） */
export const IMAGE_MODEL = 'gpt-image-2'

export const LIST_PAGE_SIZE = 20
