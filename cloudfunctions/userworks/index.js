const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { action, workId, userId, imageUrl, prompt, resultUrl } = event
  const wxContext = cloud.getWXContext()
  const openid = userId || wxContext.OPENID

  // 1. 获取用户作品集
  if (action === 'getWorks') {
    try {
      const { page = 1, pageSize = 20 } = event
      const skip = (page - 1) * pageSize

      const res = await db.collection('user_works')
        .where({ userId: openid })
        .orderBy('createdAt', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get()

      const total = await db.collection('user_works')
        .where({ userId: openid })
        .count()

      return {
        code: 0,
        data: {
          items: res.data || [],  // 修改为 items
          total: total.total || 0,
          page,
          hasMore: (res.data || []).length >= pageSize,
        },
      }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  }

  // 2. 保存作品（addWork 匹配前端调用）
  if (action === 'addWork') {
    try {
      const { url, templateId, prompt } = event
      
      const work = {
        id: `work_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: openid,
        url: url || '',
        templateId: templateId || null,
        prompt: prompt || '',
        likes: 0,
        isLiked: false,
        createdAt: Date.now(),
      }

      const res = await db.collection('user_works').add({ data: work })
      
      return {
        code: 0,
        data: {
          workId: work.id,
          message: '作品已保存',
        },
      }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  }

  // 3. 点赞/取消点赞作品
  if (action === 'toggleLike') {
    try {
      if (!workId) {
        return { code: -1, message: '缺少作品ID' }
      }

      // 查询当前作品状态
      const workRes = await db.collection('user_works')
        .doc(workId)
        .get()

      if (!workRes.data) {
        return { code: -1, message: '作品不存在' }
      }

      const work = workRes.data
      const newLiked = !work.liked
      const newLikes = Math.max(0, (work.likes || 0) + (newLiked ? 1 : -1))

      await db.collection('user_works')
        .doc(workId)
        .update({
          data: {
            liked: newLiked,
            likes: newLikes,
          },
        })

      return {
        code: 0,
        data: {
          liked: newLiked,
          likes: newLikes,
        },
      }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  }

  // 4. 获取点赞的作品列表
  if (action === 'getLiked') {  // 修改 action 名称以匹配前端调用
    try {
      const { page = 1, pageSize = 20 } = event
      const skip = (page - 1) * pageSize

      const res = await db.collection('user_works')
        .where({
          userId: openid,
          liked: true,
        })
        .orderBy('createdAt', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get()

      const total = await db.collection('user_works')
        .where({
          userId: openid,
          liked: true,
        })
        .count()

      return {
        code: 0,
        data: {
          items: res.data || [],  // 修改为 items
          total: total.total || 0,
          page,
          hasMore: (res.data || []).length >= pageSize,
        },
      }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  }

  // 5. 删除作品
  if (action === 'deleteWork') {
    try {
      if (!workId || !userId) {
        return { code: -1, message: '缺少参数' }
      }

      await db.collection('user_works')
        .where({ id: workId, userId: openid })
        .remove()

      return {
        code: 0,
        data: {
          message: '作品已删除',
        },
      }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  }

  return { code: -1, message: '未知操作' }
}
