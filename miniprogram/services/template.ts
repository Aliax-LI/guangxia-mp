import type {
  ManifestMeta,
  TemplateCategory,
  TemplateDetail,
  TemplateListItem,
} from '../types/template'
import { CLOUD_ENV_ID } from '../config/index'
import { toTemplateImageUrl } from './cloud-image'

export type {
  ManifestMeta,
  TemplateCategory,
  TemplateDetail,
  TemplateListItem,
} from '../types/template'

// 默认一级分类
export const DEFAULT_PRIMARY_CATEGORIES: TemplateCategory[] = [
  { id: 'ai', name: 'AI玩法' },
  { id: 'hot', name: '热门' },
  { id: 'life', name: '生活分享' },
  { id: 'live', name: 'live一下' },
  { id: 'puzzle', name: '拼图' },
  { id: 'food', name: '美食' },
  { id: 'fan', name: '粉丝应援' },
  { id: 'photo', name: '摄影' },
]

// 默认二级胶囊标签
export const DEFAULT_SUB_TAGS: TemplateCategory[] = [
  { id: 'featured', name: '精选' },
  { id: 'portrait', name: '写真' },
  { id: 'fun', name: '趣味玩图' },
  { id: 'motion', name: '创意动效' },
  { id: 'anime', name: '动漫' },
  { id: 'art', name: '艺术' },
  { id: '3d', name: '3D渲染' },
  { id: 'retro', name: '复古' },
]

// 内置兜底模版数据（100% 严格对齐 youmind-prompts.json 真实标题、图片、Prompt 与作者）
const FALLBACK_TEMPLATES: TemplateDetail[] = [
  {
    id: 35053,
    title: '时尚现代肖像提示词',
    coverUrl: 'https://cms-assets.youmind.com/media/1789885865583_xcnnu4_HSjlEl3b0AAngVs.jpg',
    author: { name: 'Karan', avatar: 'https://tdesign.gtimg.com/mobile/demos/avatar1.png' },
    likes: 907,
    aspectRatio: 1.35,
    requiresImage: true,
    tags: ['摄影', '人像 / 自拍', '电影剧照', '时尚单品'],
    prompt: '创建一张 18 岁 男孩 的时尚现代肖像。面部特征需与参考图保持 100% 一致。发型蓬松有型。身穿一件 红色 衬衫，带有黑色泼墨图案。佩戴银色智能手表、黑金边框眼镜以及银色链条项链和手链。背景为都市风格，柔和、极简且略带模糊，营造当代时尚氛围。采用电影级布光，超高清细节，真实质感。姿态为坐姿全身照，或行走中回眸注视。他穿着白色衬衫',
    description: '一个详细的提示词，用于创作一位 18 岁男孩的时尚现代肖像，包含具体的服装和背景指令。',
  },
  {
    id: 35069,
    title: '高端女性骑士手办',
    coverUrl: 'https://cms-assets.youmind.com/media/1789893412697_m4mwip_HSk96rua0AAg7EN.jpg',
    author: { name: '佚傩🍃', avatar: 'https://tdesign.gtimg.com/mobile/demos/avatar2.png' },
    likes: 3093,
    aspectRatio: 1.15,
    requiresImage: false,
    tags: ['摄影', '3D 渲染', '角色', '产品'],
    prompt: '微距摄影展示一款高端微缩模型女性骑士手办。角色身穿高度精细的哥特式板甲，配有繁复的金色金银丝雕刻，手持巨型雕花盾牌与利剑，站立于大理石底座上，背景为虚化华丽陈列柜，柔和戏剧性棚拍光泽。',
    description: '用于生成展示高端、具有微缩质感女性骑士手办的微距照片提示词。包含关于盔甲、布料和背景材质的丰富细节。',
  },
  {
    id: 35019,
    title: '迷你星球城市全景',
    coverUrl: 'https://cms-assets.youmind.com/media/1789806829594_wnp771_HSjzd4bbEAAu90c.jpg',
    author: { name: '小森林🌿', avatar: 'https://tdesign.gtimg.com/mobile/demos/avatar3.png' },
    likes: 1420,
    aspectRatio: 1.25,
    requiresImage: false,
    tags: ['摄影', '3D 渲染', '城市风光 / 街道', '海报 / 传单'],
    prompt: '悉尼海港 360 度迷你小行星全景航拍，悉尼歌剧院帆形屋顶与海港大桥呈环状展开，碧蓝海水泛着微波，微缩建筑与城市天际线立体呈现，温暖清澈的午后阳光。',
    description: '用于生成悉尼天际线 360 度迷你星球全景的提示词，呈现微缩建筑风格。',
  },
  {
    id: 35081,
    title: '柔光人像转换',
    coverUrl: 'https://cms-assets.youmind.com/media/1789893419692_lner5o_HSpRfYwacAAMXOv.jpg',
    author: { name: '南鸢 nuyoah', avatar: 'https://tdesign.gtimg.com/mobile/demos/avatar4.png' },
    likes: 5218,
    aspectRatio: 1.55,
    requiresImage: true,
    tags: ['摄影', '人像 / 自拍', '个人资料 / 头像'],
    prompt: '使用提供的参考图像，重新生成主体为带有柔和、忧郁表情的特写人像，同时保持角色的核心身份不变。应用柔和的漫射自然光以营造温柔且空灵的氛围。将背景更改为模糊明亮的户外环境。添加微妙的细节，如被风吹动的发丝和脸颊上淡淡的污渍，以增强真实感。',
    description: '此提示词可将参考图像转换为柔光特写人像，通过调整光线并添加精致细节，营造出空灵的效果。',
  },
  {
    id: 35015,
    title: 'Risograph 建筑海报',
    coverUrl: 'https://cms-assets.youmind.com/media/1789806824937_mpbm15_HShfJCgXgAAjBIu.jpg',
    author: { name: 'Studio Riso', avatar: 'https://tdesign.gtimg.com/mobile/demos/avatar5.png' },
    likes: 2740,
    aspectRatio: 1.3,
    requiresImage: false,
    tags: ['摄影', '插画', '复古 / 怀旧', '建筑 / 室内设计'],
    prompt: '复古孔版印刷 Risograph 风格建筑插画海报，双色油墨错位叠印，温暖的荧光粉与青蓝色调，颗粒质感艺术纸纹理，极简主义几何建筑线条。',
    description: '用于生成带有双色调墨水印刷和半调网点纹理的复古 Risograph 风格建筑海报的提示词。',
  },
  {
    id: 35003,
    title: '电影级影棚人像提示词',
    coverUrl: 'https://cms-assets.youmind.com/media/1789803924733_8hsv1z_HSjMUR0bwAAEe3S.jpg',
    author: { name: '阿泽影像', avatar: 'https://tdesign.gtimg.com/mobile/demos/avatar1.png' },
    likes: 1890,
    aspectRatio: 1.2,
    requiresImage: false,
    tags: ['摄影', '电影 / 电影剧照', '人像 / 自拍'],
    prompt: '专业摄影棚高对比度人像，伦勃朗布光，戏剧性阴影与明亮眼神光，浅景深虚化背景，8K 清晰度，保留细腻毛孔与真实肤感。',
    description: '用于生成具有专业影棚布光和浅景深的戏剧性、高细节肖像摄影的提示词。',
  },
  {
    id: 35055,
    title: 'GPT Image 2 电影感男性人像提示词',
    coverUrl: 'https://cms-assets.youmind.com/media/1789891171968_78b4ke_HSoUJGmbQAAX-RX.jpg',
    author: { name: 'VogueSnap', avatar: 'https://tdesign.gtimg.com/mobile/demos/avatar2.png' },
    likes: 3410,
    aspectRatio: 1.4,
    requiresImage: true,
    tags: ['摄影', '电影 / 电影剧照', '人像 / 自拍', '时尚单品'],
    prompt: '写实电影感男性特写肖像，湿漉漉的发丝贴在额头，晶莹水滴飞溅环绕，深色冷灰棚拍背景，雕塑感骨骼轮廓，大光圈湿发时尚大片。',
    description: '用于生成具有戏剧性高对比度光影和复杂水效的写实电影感男性肖像的提示词。',
  },
  {
    id: 35063,
    title: '旅行 Vlog 分镜网格',
    coverUrl: 'https://cms-assets.youmind.com/media/1789893410242_jesa0r_HSkjxt4bgAA47FQ.jpg',
    author: { name: 'FujifilmLab', avatar: 'https://tdesign.gtimg.com/mobile/demos/avatar3.png' },
    likes: 1650,
    aspectRatio: 1.1,
    requiresImage: false,
    tags: ['摄影', '风景 / 自然', '漫画 / 故事板', '社交媒体帖子'],
    prompt: '电影感旅行 Vlog 多格故事板，海边小火车、木制车站站台、骑单车回眸与海边日落，清新日系胶片色彩，故事感镜头语言。',
    description: '一个包含 10 个画面的电影感分镜，展示了一位女性乘坐渡轮和骑自行车探索日本沿海小镇的旅行 Vlog。',
  },
  {
    id: 35056,
    title: 'GPT Image 2 分屏旅行海报提示词',
    coverUrl: 'https://cms-assets.youmind.com/media/1789891171902_3t0gre_HSo5s3jbsAArQri.jpg',
    author: { name: 'GeoNature', avatar: 'https://tdesign.gtimg.com/mobile/demos/avatar4.png' },
    likes: 2130,
    aspectRatio: 1.45,
    requiresImage: false,
    tags: ['摄影', '3D 渲染', '极简主义', '风景 / 自然', '海报 / 传单'],
    prompt: '垂直分屏旅行海报，上半部分为瑞士阿尔卑斯山脉真实摄影，下半部分为同一视角的精致多层 3D 剪纸立体艺术，优雅排版海报设计。',
    description: '用于生成垂直旅行海报的详细提示词，上半部分为写实摄影，下半部分为 3D 纸艺插画。包含可自定义的地点、光线、主体和排版字段。',
  },
  {
    id: 35065,
    title: '公园中女性的写实自拍肖像',
    coverUrl: 'https://cms-assets.youmind.com/media/1789893411430_h812c6_HSisXdebwAAdHXT.jpg',
    author: { name: '月亮邮局', avatar: 'https://tdesign.gtimg.com/mobile/demos/avatar5.png' },
    likes: 4180,
    aspectRatio: 1.3,
    requiresImage: false,
    tags: ['摄影', '人像 / 自拍', '社交媒体帖子', '个人资料 / 头像'],
    prompt: '逼真高分辨率自拍肖像，年轻亚洲女性，深棕色凌乱丸子头与松散刘海，平静微笑，身穿浅米色拉链防风夹克，背景为阳光洒满的户外公园与盛开樱花树。',
    description: '用于生成年轻女性在公园背景下休闲自拍肖像的逼真提示词，背景包含樱花和游乐设施。',
  },
  {
    id: 35048,
    title: '电影感印度男性时尚拼贴提示词',
    coverUrl: 'https://cms-assets.youmind.com/media/1789885862478_2ts90e_HSoauRaaIAAcCHi.jpg',
    author: { name: 'FashionSnap', avatar: 'https://tdesign.gtimg.com/mobile/demos/avatar1.png' },
    likes: 1980,
    aspectRatio: 1.25,
    requiresImage: false,
    tags: ['摄影', '电影 / 电影剧照', '人像 / 自拍', '时尚单品'],
    prompt: '写实电影感男性时尚拼贴画，中年男子戴墨镜、浅蓝亚麻衬衫与米色长裤，周围环绕戏剧性飞溅水浪，冷色调商业棚拍灯光。',
    description: '用于生成具有戏剧性水效和影棚布光的写实电影感男模时尚拼贴画的提示词。',
  },
  {
    id: 35060,
    title: '空中岛屿 Logo 形状生成器',
    coverUrl: 'https://cms-assets.youmind.com/media/1789893407972_gua1mf_HSmnvy6boAAfttO.jpg',
    author: { name: 'IslandArt', avatar: 'https://tdesign.gtimg.com/mobile/demos/avatar2.png' },
    likes: 3120,
    aspectRatio: 1.15,
    requiresImage: true,
    tags: ['摄影', '风景 / 自然', '产品营销', '创意'],
    prompt: '无人机俯瞰鸟瞰热带岛屿，海岸线与沙滩天然勾勒出几何造型，翠绿椰林与白沙滩，清澈浅蓝泻湖环绕，黄金时刻阳光照射。',
    description: '生成一张超写实的航拍照片，展示一座热带岛屿，其海岸线和陆地自然形成所提供形状。',
  },
]

const REAL_CMS_IMAGE_MAP: Record<string, string> = {
  '35053': 'https://cms-assets.youmind.com/media/1789885865583_xcnnu4_HSjlEl3b0AAngVs.jpg',
  '35069': 'https://cms-assets.youmind.com/media/1789893412697_m4mwip_HSk96rua0AAg7EN.jpg',
  '35019': 'https://cms-assets.youmind.com/media/1789806829594_wnp771_HSjzd4bbEAAu90c.jpg',
  '35081': 'https://cms-assets.youmind.com/media/1789893419692_lner5o_HSpRfYwacAAMXOv.jpg',
  '35015': 'https://cms-assets.youmind.com/media/1789806824937_mpbm15_HShfJCgXgAAjBIu.jpg',
  '35003': 'https://cms-assets.youmind.com/media/1789803924733_8hsv1z_HSjMUR0bwAAEe3S.jpg',
  '35055': 'https://cms-assets.youmind.com/media/1789891171968_78b4ke_HSoUJGmbQAAX-RX.jpg',
  '35063': 'https://cms-assets.youmind.com/media/1789893410242_jesa0r_HSkjxt4bgAA47FQ.jpg',
  '35056': 'https://cms-assets.youmind.com/media/1789891171902_3t0gre_HSo5s3jbsAArQri.jpg',
}

const TEMPLATE_ID_TO_CMS: Record<string, string> = {
  '101': REAL_CMS_IMAGE_MAP['35053'],
  '102': REAL_CMS_IMAGE_MAP['35069'],
  '103': REAL_CMS_IMAGE_MAP['35019'],
  '104': REAL_CMS_IMAGE_MAP['35081'],
  '105': REAL_CMS_IMAGE_MAP['35015'],
  '106': REAL_CMS_IMAGE_MAP['35003'],
  '107': REAL_CMS_IMAGE_MAP['35055'],
  '108': REAL_CMS_IMAGE_MAP['35063'],
}

export function sanitizeCoverUrl(url: string, id?: number | string): string {
  if (!url) {
    if (id && TEMPLATE_ID_TO_CMS[String(id)]) return TEMPLATE_ID_TO_CMS[String(id)]
    return ''
  }
  // 识别旧版失效链接中的 ID 并替换为有效 cms 图片
  const match = url.match(/\/image\/(\d+)\.png/)
  if (match && REAL_CMS_IMAGE_MAP[match[1]]) {
    return REAL_CMS_IMAGE_MAP[match[1]]
  }
  if (id && TEMPLATE_ID_TO_CMS[String(id)] && url.includes('inner-oss-wlcb.bellecdn.cn')) {
    return TEMPLATE_ID_TO_CMS[String(id)]
  }
  return url
}

const REF_HINT = /参考图|上传|提供的参考|使用提供|主体图|参考图像/i

export function inferRequiresImage(detail: {
  prompt: string
  referenceImageUrls?: string[]
}): boolean {
  if (detail.referenceImageUrls && detail.referenceImageUrls.length > 0) return true
  return REF_HINT.test(detail.prompt)
}

/** 同一资源 CDN / CMS 不同 URL 的归一 key，避免轮播重复 */
function galleryAssetKey(url: string, templateId?: number | string): string {
  const cms = url.match(/media\/(\d+_[^/?#]+)/i)
  if (cms) return cms[1]
  const cdn = url.match(/\/youmind\/templates\/([^/?#]+)\.jpg/i)
  if (cdn) return `tpl-${decodeURIComponent(cdn[1])}`
  if (templateId != null && String(templateId) !== '' && url.includes(String(templateId))) {
    return `tpl-${templateId}`
  }
  return url.split('?')[0]
}

/** 封面 + 参考图去重，供详情页轮播（不含 sourceCoverUrl，常与 cover 同图） */
export function buildTemplateGallery(
  detail: Pick<TemplateDetail, 'id' | 'coverUrl' | 'sourceCoverUrl' | 'referenceImageUrls'>
): string[] {
  const urls: string[] = []
  const keys = new Set<string>()
  const add = (raw?: string) => {
    if (!raw) return
    const u = sanitizeCoverUrl(raw, detail.id).trim()
    if (!u) return
    const key = galleryAssetKey(u, detail.id)
    if (keys.has(key)) return
    keys.add(key)
    urls.push(u)
  }
  add(detail.coverUrl)
  for (const ref of detail.referenceImageUrls || []) add(ref)
  if (urls.length) return urls
  const fallback = sanitizeCoverUrl(detail.coverUrl, detail.id).trim()
  return fallback ? [fallback] : []
}

export function formatTemplateMetaDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
}

const META_CACHE_KEY = 'template_meta_v1'
const META_CACHE_TTL_MS = 10 * 60 * 1000

function readMetaCache(): ManifestMeta | null {
  try {
    const raw = wx.getStorageSync(META_CACHE_KEY) as { at: number; data: ManifestMeta } | ''
    if (!raw || typeof raw !== 'object' || !raw.data) return null
    if (Date.now() - raw.at > META_CACHE_TTL_MS) return null
    return raw.data
  } catch {
    return null
  }
}

function writeMetaCache(data: ManifestMeta) {
  try {
    wx.setStorageSync(META_CACHE_KEY, { at: Date.now(), data })
  } catch {
    /* storage full */
  }
}

/** 通过云函数获取分类元数据 */
export async function fetchManifestMeta(): Promise<ManifestMeta> {
  const cached = readMetaCache()
  if (cached) return cached

  if (wx.cloud) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'templates',
        config: { env: CLOUD_ENV_ID },
        data: { action: 'meta' },
      })
      const result = res.result as { code: number; data: any }
      if (result && result.code === 0 && result.data) {
        const meta: ManifestMeta = {
          version: result.data.version || '2.2.0',
          pageSize: 20,
          tags: (result.data.subTags || []).map((t: any) => ({ name: t.name, count: t.count || 0 })),
          primaryCategories: result.data.primaryCategories || DEFAULT_PRIMARY_CATEGORIES,
          subTags: result.data.subTags || DEFAULT_SUB_TAGS,
          updatedAt: new Date().toISOString(),
        }
        writeMetaCache(meta)
        return meta
      }
    } catch {
      /* 云函数未上传时静默回退本地 */
    }
  }

  return {
    version: '2.2.0-local',
    pageSize: 20,
    tags: DEFAULT_SUB_TAGS.map((t) => ({ name: t.name, count: 8 })),
    primaryCategories: DEFAULT_PRIMARY_CATEGORIES,
    subTags: DEFAULT_SUB_TAGS,
    updatedAt: new Date().toISOString(),
  }
}

/** 通过云函数分页拉取模版列表 */
export async function fetchTemplateList(params: {
  category?: string
  subTag?: string
  keyword?: string
  page?: number
  pageSize?: number
}): Promise<{ items: TemplateListItem[]; hasMore: boolean; total: number }> {
  const { category = 'ai', subTag = 'featured', keyword = '', page = 1, pageSize = 10 } = params

  if (wx.cloud) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'templates',
        config: { env: CLOUD_ENV_ID },
        data: {
          action: 'list',
          category,
          subTag,
          keyword,
          page,
          pageSize,
        },
      })
      const result = res.result as { code: number; data: any }
      if (result && result.code === 0 && result.data) {
        const rawItems = (result.data.items || []) as TemplateListItem[]
        const items = rawItems.map((item) => ({
          ...item,
          sourceCoverUrl: sanitizeCoverUrl(item.sourceCoverUrl || item.coverUrl, item.id),
          coverUrl: toTemplateImageUrl(sanitizeCoverUrl(item.coverUrl, item.id), item.id),
        }))
        return {
          items,
          hasMore: !!result.data.hasMore,
          total: result.data.total || 0,
        }
      }
    } catch {
      /* 云函数不可用时回退本地 */
    }
  }

  // 本地过滤与分页兜底
  let filtered = [...FALLBACK_TEMPLATES]
  if (keyword) {
    const kw = keyword.toLowerCase()
    filtered = filtered.filter(
      (t) => t.title.toLowerCase().includes(kw) || t.tags.some((tag) => tag.toLowerCase().includes(kw))
    )
  }

  const start = (page - 1) * pageSize
  const paged = filtered.slice(start, start + pageSize)
  return {
    items: paged.map((item) => ({
      ...item,
      sourceCoverUrl: sanitizeCoverUrl(item.sourceCoverUrl || item.coverUrl, item.id),
      coverUrl: toTemplateImageUrl(sanitizeCoverUrl(item.coverUrl, item.id), item.id),
    })),
    hasMore: start + pageSize < filtered.length,
    total: filtered.length,
  }
}

/** 通过云函数拉取模版详情 */
export async function fetchTemplateDetail(id: number | string): Promise<TemplateDetail> {
  if (wx.cloud) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'templates',
        config: { env: CLOUD_ENV_ID },
        data: { action: 'detail', id },
      })
      const result = res.result as { code: number; data: any }
      if (result && result.code === 0 && result.data) {
        return {
          ...result.data,
          sourceCoverUrl: sanitizeCoverUrl(result.data.sourceCoverUrl || result.data.coverUrl, result.data.id),
          coverUrl: toTemplateImageUrl(sanitizeCoverUrl(result.data.coverUrl, result.data.id), result.data.id),
        }
      }
    } catch {
      /* 回退本地 */
    }
  }

  const item = FALLBACK_TEMPLATES.find((t) => String(t.id) === String(id)) || FALLBACK_TEMPLATES[0]
  return {
    ...item,
    sourceCoverUrl: sanitizeCoverUrl(item.coverUrl, item.id),
    coverUrl: toTemplateImageUrl(sanitizeCoverUrl(item.coverUrl, item.id), item.id),
  }
}

/** 通过云函数记录点赞 */
export async function toggleTemplateLike(id: number | string): Promise<number> {
  if (wx.cloud) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'templates',
        config: { env: CLOUD_ENV_ID },
        data: { action: 'like', id },
      })
      const result = res.result as { code: number; likes: number }
      if (result && result.likes !== undefined) {
        return result.likes
      }
    } catch {
      /* 回退 */
    }
  }
  return 0
}
