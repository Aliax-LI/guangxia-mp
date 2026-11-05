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
export const SUB2API_BASE_URL = 'https://sub2api.e2mai3lzz.top'

/** Sub2API 业务 API 前缀 */
export const SUB2API_API_V1 = `${SUB2API_BASE_URL}/api/v1`

/**
 * 分页 manifest 根路径（M2 上传 OSS 后的 HTTPS 前缀，末尾无 /）。
 * USE_DEV_MANIFEST=true 时使用内置 dev-manifest（仅 1 个分类 20 条，便于联调）。
 */
export const USE_DEV_MANIFEST = true

export const MANIFEST_BASE_URL =
  'https://inner-oss-wlcb.bellecdn.cn/files/platform-ai-base/youmind/manifest'

/** 对话模型（Open Responses `/v1/responses`）。创作出图不用这个。 */
export const CHAT_MODEL = 'auto'

/** 对话系统提示。只约束文字回复，不参与出图。 */
export const CHAT_INSTRUCTIONS = [
  '只用普通中文和 Markdown 回答。',
  '可以用 <grid columns={N}> 与成对的 <grid-item> 输出「标题+说明」式清单；每个 grid-item 的第一行是条目标题，其余行是一句说明。不要嵌套 grid。',
  '引用来源用 <Cite refs={{...}}/>，必须自闭合，不要包正文。',
  '除此之外禁止输出任何界面标签：<box> <row> <card> <radio> <radio-group> <button> <title> <text> <icon> <AsyncImage> <divider> <CodeBlock>、GenUI.copy(...)、{@body ...}、useState(...) 都不要写。',
  '不要用代码块把标签包起来。要给选项就写 Markdown 列表；要给文案就直接写在正文里。',
].join('')

/** 创作出图模型（与 sub2api 渠道配置一致） */
export const IMAGE_MODEL = 'gpt-image-2.5'

/**
 * 生图必须使用的 Sub2API 分组（限时特价组，allow_image_generation: true）。
 * Key 不在这个分组时，网关会报
 * "Model ... is not supported by any configured account in this group"。
 *
 * 分组以 **id 锁定**（12），name 只用于展示与报错文案——运营改名不会破坏匹配。
 * 改渠道时改这两个值。
 */
export const IMAGE_KEY_GROUP_ID = 12
export const IMAGE_KEY_GROUP_NAME = '限时特价'

export const LIST_PAGE_SIZE = 20
