import { openPrivacyContract } from '../../utils/privacy'
import { completePrivacyAuthorization } from '../../utils/privacy-resolve'

type Waiter = { resolve: () => void; reject: (e: Error) => void }

Component({
  properties: {
    visible: { type: Boolean, value: false },
    contractName: { type: String, value: '用户隐私保护指引' },
    scene: { type: String, value: 'picker' },
  },

  data: {
    descText: '',
    localRequest: false,
  },

  lifetimes: {
    attached() {
      this.updateDesc()
    },
  },

  observers: {
    'visible, localRequest, contractName, scene'() {
      this.updateDesc()
    },
  },

  methods: {
    noop() {},

    updateDesc() {
      if (!this.properties.visible && !this.data.localRequest) return
      const name = this.properties.contractName || '用户隐私保护指引'
      const scene = this.properties.scene
      const desc =
        scene === 'profile'
          ? `使用微信头像、昵称前，需阅读并同意《${name}》。`
          : `使用相册、相机选择照片前，需阅读并同意《${name}》。`
      this.setData({ descText: desc })
    },

    requestAuthorize(contractName?: string, scene?: string): Promise<void> {
      if (contractName) {
        this.setData({ contractName })
      }
      if (scene) {
        this.setData({ scene })
      }
      return new Promise((resolve, reject) => {
        ;(this as unknown as { _waiter: Waiter | null })._waiter = { resolve, reject }
        this.setData({ localRequest: true }, () => this.updateDesc())
      })
    },

    onOpenContract() {
      openPrivacyContract()
    },

    /** 官方：用户点击 agreePrivacyAuthorization 后再同步微信 / resolve 挂起接口 */
    onAgree() {
      completePrivacyAuthorization('agree-privacy-btn')

      const self = this as unknown as { _waiter: Waiter | null }
      if (self._waiter) {
        self._waiter.resolve()
        self._waiter = null
      }

      this.setData({ localRequest: false })
      this.triggerEvent('agreed')
    },
  },
})
