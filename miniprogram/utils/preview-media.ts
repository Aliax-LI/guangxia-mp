/**
 * 预览用路径转换。
 *
 * 背景：生成结果以 base64 落盘到用户永久目录（真机 `wxfile://usr/...`，
 * 开发者工具里是 `http://usr/...`）。`<image>` 组件能直接显示它们，
 * 但 `wx.previewImage` 只接受真实网络地址或临时文件路径：
 * `http://usr/...` 会被当网络请求永远转圈，部分系统的 `wxfile://usr/...`
 * 也不被支持。预览前用 `wx.compressImage`（quality 100 = 无损压缩拷贝）
 * 换成一个临时路径即可。
 */

/** 网络图直接可用；其余（永久目录、临时目录以外的本地路径）走转换 */
function isNetworkUrl(src: string): boolean {
  return /^https?:\/\//i.test(src) && !/^http:\/\/usr\//i.test(src)
}

/** 单张：本地持久路径 → 临时路径（任何一步失败都回退原路径，不吞预览） */
export function toPreviewable(src: string): Promise<string> {
  if (!src || isNetworkUrl(src)) return Promise.resolve(src)
  return new Promise((resolve) => {
    wx.compressImage({
      src,
      quality: 100,
      success: (res) => resolve(res.tempFilePath || src),
      fail: () => resolve(src),
    })
  })
}

/** 一批：并发转换 */
export function toPreviewableAll(urls: string[]): Promise<string[]> {
  return Promise.all(urls.map(toPreviewable))
}
