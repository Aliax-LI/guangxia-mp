export type PickImageSource = 'album' | 'camera' | 'any'

function sourceTypes(source: PickImageSource): Array<'album' | 'camera'> {
  return source === 'any' ? ['album', 'camera'] : [source]
}

function failMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'errMsg' in err) {
    return String((err as WechatMiniprogram.GeneralCallbackResult).errMsg)
  }
  if (err instanceof Error) return err.message
  return '未知错误'
}

function showPickError(source: PickImageSource, msg: string) {
  if (msg.includes('cancel')) return
  if (/not declared|privacy agreement|errno.*112/i.test(msg)) {
    wx.showModal({
      title: '需在后台声明隐私类型',
      content:
        '微信公众平台 → 设置 → 用户隐私保护指引：勾选「选中的照片或视频信息」「摄像头」等，保存约 5 分钟后生效。\n\n' + msg,
      showCancel: false,
      confirmText: '我知道了',
      confirmColor: '#111111',
    })
    return
  }
  if (/privacy|authorize|103|拒绝/i.test(msg)) {
    wx.showModal({
      title: '需同意隐私指引',
      content: '请先在本页或微信弹窗中点击同意隐私保护指引，再选图。\n\n' + msg,
      showCancel: false,
      confirmColor: '#111111',
    })
    return
  }
  wx.showModal({
    title: source === 'camera' ? '无法打开相机' : '无法选择图片',
    content: msg,
    showCancel: false,
    confirmColor: '#111111',
  })
}

function chooseMediaMany(source: PickImageSource, count: number): Promise<string[]> {
  const sourceType = sourceTypes(source)
  const opts: WechatMiniprogram.ChooseMediaOption = {
    count: Math.max(1, Math.min(9, count)),
    mediaType: ['image'],
    sourceType,
  }
  if (sourceType.includes('camera')) {
    opts.camera = 'back'
  }

  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      ...opts,
      success: (res) => {
        const paths = (res.tempFiles || [])
          .map((f) => f.tempFilePath)
          .filter((p): p is string => !!p)
        if (paths.length) resolve(paths)
        else reject(new Error('未选择图片'))
      },
      fail: reject,
    })
  })
}

function chooseImageMany(source: PickImageSource, count: number): Promise<string[]> {
  const sourceType = sourceTypes(source)
  return new Promise((resolve, reject) => {
    wx.chooseImage({
      count: Math.max(1, Math.min(9, count)),
      sizeType: ['compressed', 'original'],
      sourceType,
      success: (res) => {
        const paths = (res.tempFilePaths || []).filter(Boolean)
        if (paths.length) resolve(paths)
        else reject(new Error('未选择图片'))
      },
      fail: reject,
    })
  })
}

async function pickWithMediaApis(source: PickImageSource, count: number): Promise<string[]> {
  try {
    return await chooseMediaMany(source, count)
  } catch (e) {
    const msg = failMessage(e)
    if (msg.includes('cancel')) throw e
    return chooseImageMany(source, count)
  }
}

/** 选 1–9 张；相机始终 1 张。 */
export function pickImages(source: PickImageSource = 'any', count = 1): Promise<string[]> {
  const n = source === 'camera' ? 1 : Math.max(1, Math.min(9, count))
  return pickWithMediaApis(source, n).catch((e) => {
    showPickError(source, failMessage(e))
    throw e
  })
}

/** 直接调相册/相机 API；隐私由页面弹层或微信官方弹窗处理 */
export function pickOneImage(source: PickImageSource = 'any'): Promise<string> {
  return pickImages(source, 1).then((paths) => paths[0] || Promise.reject(new Error('未选择图片')))
}
