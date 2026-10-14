const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

// 一级大分类
const PRIMARY_CATEGORIES = [
  { id: 'ai', name: 'AI玩法' },
  { id: 'hot', name: '热门' },
  { id: 'life', name: '生活分享' },
  { id: 'live', name: 'live一下' },
  { id: 'puzzle', name: '拼图' },
  { id: 'food', name: '美食' },
  { id: 'fan', name: '粉丝应援' },
  { id: 'photo', name: '摄影' },
]

// 二级标签胶囊
const SUB_TAGS = [
  { id: 'featured', name: '精选' },
  { id: 'portrait', name: '写真' },
  { id: 'fun', name: '趣味玩图' },
  { id: 'motion', name: '创意动效' },
  { id: 'anime', name: '动漫' },
  { id: 'art', name: '艺术' },
  { id: '3d', name: '3D渲染' },
  { id: 'retro', name: '复古' },
]

// 基础优质模版库（100% 严格对齐 youmind-prompts.json 真实标题、图片、Prompt 与作者）
const TEMPLATES_DATABASE = [
  {
    id: 35053,
    title: '时尚现代肖像提示词',
    coverUrl: 'https://cms-assets.youmind.com/media/1789885865583_xcnnu4_HSjlEl3b0AAngVs.jpg',
    author: { name: 'Karan', avatar: 'https://tdesign.gtimg.com/mobile/demos/avatar1.png' },
    likes: 907,
    aspectRatio: 1.35,
    requiresImage: true,
    category: 'ai',
    subTag: 'portrait',
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
    category: 'ai',
    subTag: '3d',
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
    category: 'life',
    subTag: '3d',
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
    category: 'ai',
    subTag: 'portrait',
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
    category: 'ai',
    subTag: 'art',
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
    category: 'photo',
    subTag: 'portrait',
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
    category: 'ai',
    subTag: 'art',
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
    category: 'life',
    subTag: 'retro',
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
    category: 'ai',
    subTag: 'art',
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
    category: 'life',
    subTag: 'portrait',
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
    category: 'hot',
    subTag: 'featured',
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
    category: 'ai',
    subTag: 'fun',
    tags: ['摄影', '风景 / 自然', '产品营销', '创意'],
    prompt: '无人机俯瞰鸟瞰热带岛屿，海岸线与沙滩天然勾勒出几何造型，翠绿椰林与白沙滩，清澈浅蓝泻湖环绕，黄金时刻阳光照射。',
    description: '生成一张超写实的航拍照片，展示一座热带岛屿，其海岸线和陆地自然形成所提供形状。',
  },
]

// 数据库真实标签显示名
const CATEGORY_LABELS = {
  photo: '摄影',
  life: '生活分享',
  ai: 'AI玩法',
  puzzle: '拼图',
  food: '美食',
  live: 'live一下',
  fan: '粉丝应援',
  hot: '热门',
}

const SUB_TAG_LABELS = {
  portrait: '写真',
  anime: '动漫',
  art: '艺术',
  featured: '精选',
  '3d': '3D渲染',
  retro: '复古',
  fun: '趣味玩图',
  motion: '创意动效',
}

// 固定 UI 展示顺序；数据库聚合只负责提供真实数量
const CATEGORY_ORDER = ['ai', 'photo', 'life', 'puzzle', 'food', 'live', 'fan', 'hot']
const SUB_TAG_ORDER = ['featured', 'portrait', 'anime', 'art', '3d', 'fun', 'retro', 'motion']

/** 按固定 UI 顺序整理聚合结果，并兜底保留新增标签 */
function orderTemplateLabels(items, order) {
  const grouped = new Map(items.map((item) => [item.id, item]))
  const ordered = order.map((id) => grouped.get(id)).filter(Boolean)
  for (const item of items) {
    if (!ordered.some((row) => row.id === item.id)) ordered.push(item)
  }
  return ordered
}

/** ponytail: 聚合统计依赖 category/subTag 索引；全量 reseed 后 meta 缓存最多滞后 META_CACHE_TTL_MS */
const META_CACHE_TTL_MS = 5 * 60 * 1000
let metaCache = { at: 0, data: null }

/** 云数据库 aggregate 一次出各分类数量，替代分页扫全表 */
async function aggregateTemplateLabels(db, field) {
  const $ = db.command.aggregate
  const res = await db
    .collection('templates')
    .aggregate()
    .match({ [field]: $.neq(null) })
    .group({
      _id: `$${field}`,
      count: $.sum(1),
    })
    .sort({ count: -1 })
    .limit(24)
    .end()
  return (res.list || [])
    .filter((row) => row._id)
    .map((row) => ({ id: row._id, count: row.count || 0 }))
}

const LIST_FIELDS = {
  id: true,
  title: true,
  coverUrl: true,
  author: true,
  likes: true,
  aspectRatio: true,
  requiresImage: true,
  category: true,
  subTag: true,
  tags: true,
}

/** 冷启动后复用集合探测结果，避免每次 list 都 count + sample */
let collectionProbe = null

async function probeTemplatesCollection(db) {
  if (collectionProbe) return collectionProbe
  const collection = db.collection('templates')
  try {
    const countRes = await collection.count()
    if (!countRes || !countRes.total) {
      collectionProbe = { mode: 'builtin', total: 0 }
      return collectionProbe
    }
    const sample = await collection.limit(1).field({ id: true, title: true, coverUrl: true }).get()
    const row = sample.data && sample.data[0]
    const isDirty =
      row &&
      (row.id === 101 ||
        row.title === '情侣diy壁纸和背景图💕' ||
        (row.coverUrl && row.coverUrl.includes('inner-oss-wlcb')))
    collectionProbe = isDirty
      ? { mode: 'builtin', total: countRes.total }
      : { mode: 'cloud', total: countRes.total, collection }
  } catch {
    collectionProbe = { mode: 'builtin', total: 0 }
  }
  return collectionProbe
}

// MinIO / CDN 全量模版封面；内置兜底数据和云数据库数据都按 ID 拼接
const TEMPLATE_CDN_IMAGE_PREFIX = 'https://inner-oss-wlcb.bellecdn.cn/files/platform-ai-base/youmind/templates'

function toCdnTemplateCover(item) {
  if (!item || !item.id) return item
  return {
    ...item,
    sourceCoverUrl: item.coverUrl,
    coverUrl: `${TEMPLATE_CDN_IMAGE_PREFIX}/${encodeURIComponent(String(item.id))}.jpg`,
  }
}

// 前端展示顺序与显示名；按真实统计数量展示，数量为 0 的标签不显示
const CATEGORY_UI_ORDER = ['ai', 'hot', 'life', 'live', 'puzzle', 'food', 'fan', 'photo']
const CATEGORY_UI_LABELS = {
  ai: 'AI玩法',
  photo: '摄影',
  life: '生活分享',
  puzzle: '拼图',
  food: '美食',
  live: 'live一下',
  fan: '粉丝应援',
  hot: '热门',
}
const SUB_TAG_UI_ORDER = ['featured', 'portrait', 'fun', 'motion', 'anime', 'art', '3d', 'retro']
const SUB_TAG_UI_LABELS = {
  featured: '精选',
  portrait: '写真',
  anime: '动漫',
  art: '艺术',
  '3d': '3D渲染',
  fun: '趣味玩图',
  retro: '复古',
  motion: '创意动效',
}

/** 按固定 UI 顺序整理聚合结果，并兜底保留新增标签 */
function orderTemplateUiLabels(items, order) {
  const grouped = new Map(items.map((item) => [item.id, item]))
  const ordered = order.map((id) => grouped.get(id)).filter(Boolean)
  for (const item of items) {
    if (!ordered.some((row) => row.id === item.id)) ordered.push(item)
  }
  return ordered
}

exports.main = async (event, context) => {
  const { action = 'list', category = 'ai', subTag = 'featured', keyword = '', page = 1, pageSize = 10, id } = event
  const db = cloud.database()

  // 1. 初始化或重置数据库模版集合（清除脏数据并灌入 100% 真实数据）
  if (action === 'initDb' || action === 'reseedDb') {
    try {
      const collection = db.collection('templates')
      // 循环清空旧记录
      let hasMoreOld = true
      while (hasMoreOld) {
        const oldDocs = await collection.limit(20).get()
        if (oldDocs.data && oldDocs.data.length > 0) {
          for (const doc of oldDocs.data) {
            await collection.doc(doc._id).remove().catch(() => {})
          }
        } else {
          hasMoreOld = false
        }
      }
      // 灌入真实模版
      for (const item of TEMPLATES_DATABASE) {
        await collection.add({ data: item }).catch(() => {})
      }
      metaCache = { at: 0, data: null }
      collectionProbe = null
      return { code: 0, message: '重置并初始化真实模版数据成功', count: TEMPLATES_DATABASE.length }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  }

  // 2. 获取分类与标签元数据
  if (action === 'meta') {
    if (metaCache.data && Date.now() - metaCache.at < META_CACHE_TTL_MS) {
      return { code: 0, data: metaCache.data }
    }

    let total = TEMPLATES_DATABASE.length
    const probe = await probeTemplatesCollection(db)
    if (probe.total > 0) total = probe.total

    if (probe.mode === 'builtin') {
      const fallbackMeta = {
        version: '2.3.0-fallback',
        primaryCategories: PRIMARY_CATEGORIES,
        subTags: SUB_TAGS,
        total,
      }
      metaCache = { at: Date.now(), data: fallbackMeta }
      return { code: 0, data: fallbackMeta }
    }

    try {
      const [aggregatedCategories, aggregatedSubTags] = await Promise.all([
        aggregateTemplateLabels(db, 'category'),
        aggregateTemplateLabels(db, 'subTag'),
      ])

      // 固定展示顺序，数量使用云数据库真实统计；数量为 0 的固定标签不展示
      const primaryCategories = orderTemplateUiLabels(aggregatedCategories, CATEGORY_UI_ORDER)
        .filter((item) => item.count > 0)
      const subTags = orderTemplateUiLabels(aggregatedSubTags, SUB_TAG_UI_ORDER)
        .filter((item) => item.count > 0)

      const payload = {
        version: '2.4.3',
        primaryCategories: primaryCategories.map((item) => ({
          id: item.id,
          name: CATEGORY_UI_LABELS[item.id] || item.id,
          count: item.count,
        })),
        subTags: subTags.map((item) => ({
          id: item.id,
          name: SUB_TAG_UI_LABELS[item.id] || item.id,
          count: item.count,
        })),
        total,
      }
      metaCache = { at: Date.now(), data: payload }
      return { code: 0, data: payload }
    } catch (error) {
      console.error('[templates] meta aggregate failed', error)
      const fallbackMeta = {
        version: '2.3.0-fallback',
        primaryCategories: PRIMARY_CATEGORIES,
        subTags: SUB_TAGS,
        total,
      }
      return { code: 0, data: fallbackMeta }
    }
  }

  // 3. 模版详情
  if (action === 'detail') {
    try {
      const doc = await db.collection('templates').doc(String(id)).get()
      if (doc && doc.data && doc.data.title !== '情侣diy壁纸和背景图💕') {
        return { code: 0, data: toCdnTemplateCover(doc.data) }
      }
    } catch {
      // 容错处理
    }

    const item = TEMPLATES_DATABASE.find((t) => String(t.id) === String(id)) || TEMPLATES_DATABASE[0]
    return {
      code: 0,
      data: toCdnTemplateCover(item),
    }
  }

  // 4. 点赞互动
  if (action === 'like') {
    try {
      const _ = db.command
      await db.collection('templates').doc(String(id)).update({
        data: { likes: _.inc(1) }
      })
      const doc = await db.collection('templates').doc(String(id)).get()
      if (doc && doc.data) {
        return { code: 0, likes: doc.data.likes }
      }
    } catch {
      // 容错处理
    }

    const item = TEMPLATES_DATABASE.find((t) => String(t.id) === String(id))
    if (item) {
      item.likes = (item.likes || 0) + 1
    }
    return {
      code: 0,
      likes: item ? item.likes : 0,
    }
  }

  // 5. 将图片转存至云存储（腾讯云国内 CDN 高速加速）
  if (action === 'syncCoverToStorage') {
    const { id, coverUrl } = event
    if (!id || !coverUrl) return { code: -1, message: '缺少参数' }
    try {
      const https = require('https')
      const buffer = await new Promise((resolve, reject) => {
        https.get(coverUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 }, (res) => {
          if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode))
          const chunks = []
          res.on('data', (c) => chunks.push(c))
          res.on('end', () => resolve(Buffer.concat(chunks)))
        }).on('error', reject)
      })

      const uploadRes = await cloud.uploadFile({
        cloudPath: `templates/${id}.jpg`,
        fileContent: buffer,
      })

      if (uploadRes && uploadRes.fileID) {
        await db.collection('templates').doc(String(id)).update({
          data: { coverUrl: uploadRes.fileID },
        }).catch(() => {})
        return { code: 0, fileID: uploadRes.fileID }
      }
      return { code: -1, message: '上传云存储未返回 fileID' }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  }

  // 6. 模版列表（字段投影 + 省略 count，显著减小响应体）
  try {
    const probe = await probeTemplatesCollection(db)
    if (probe.mode === 'cloud' && probe.collection) {
      const collection = probe.collection
      const _ = db.command
      let query = collection

      if (keyword && keyword.trim()) {
        const kwRegex = db.RegExp({ regexp: keyword.trim(), options: 'i' })
        query = query.where(
          _.or([{ title: kwRegex }, { tags: kwRegex }])
        )
      } else {
        const condition = {}
        if (category && category !== 'hot') condition.category = category
        if (subTag && subTag !== 'featured') condition.subTag = subTag
        if (Object.keys(condition).length > 0) {
          query = query.where(condition)
        }
      }

      const res = await query
        .field(LIST_FIELDS)
        .orderBy('likes', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()

      const rows = res.data || []
      return {
        code: 0,
        data: {
          items: rows.map(toCdnTemplateCover),
          total: probe.total,
          page,
          hasMore: rows.length >= pageSize,
        },
      }
    }
  } catch (err) {
    console.error('[templates] list query failed', err)
  }

  // 内置数据过滤与分页
  let filtered = [...TEMPLATES_DATABASE]

  if (keyword && keyword.trim()) {
    const kw = keyword.trim().toLowerCase()
    filtered = filtered.filter((t) =>
      t.title.toLowerCase().includes(kw) ||
      (t.tags && t.tags.some((tag) => tag.toLowerCase().includes(kw)))
    )
  } else {
    if (category && category !== 'hot') {
      const matchCat = filtered.filter((t) => t.category === category)
      if (matchCat.length > 0) filtered = matchCat
    }
    if (subTag && subTag !== 'featured') {
      const matchSub = filtered.filter((t) => t.subTag === subTag)
      if (matchSub.length > 0) filtered = matchSub
    }
  }

  const start = (page - 1) * pageSize
  const pagedItems = filtered.slice(start, start + pageSize)
  const hasMore = start + pageSize < filtered.length

  return {
    code: 0,
    data: {
      items: pagedItems.map(toCdnTemplateCover),
      total: filtered.length,
      page,
      hasMore,
    },
  }
}
