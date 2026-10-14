# Product

<!-- impeccable:product-schema 1 -->

## Platform

WeChat miniprogram (微信小程序)

## Stack

TypeScript + 原生小程序；Sub2API（`https://sub2api.343426.xyz`）负责账号、余额、API Key、调用日志与 gpt-image-2 网关。

## Users

- 主要用户：希望在手机上快速做 AI 修图、套用模板风格的普通用户。
- 情境：从相册选图 → 描述或选模板 → 生成 → 对比保存；积分与 Key 由 Sub2API 管理。

## Product Purpose

提供 **修图 / 模版 / 我的** 三 Tab 的 **光匣** AI 修图小程序：全图风格与局部意图（无 mask API 时用 prompt + 用户图）、YouMind 模板库（中文 tag 分页）、Sub2API 账号体系直连。

## Positioning

不是通用 Chat，而是 **「模板 + 修图」一体化** 的微信端入口，模板数据来自分页 manifest，生成走用户自己的 Sub2API Key 与积分。

## Operating Context

- 用户需在 Sub2API 注册（邮箱验证码）；新用户赠送额度由后台配置。
- 模板 manifest 定时构建上传 OSS；开发期可用内置 bootstrap。
- 微信小程序需配置 request / downloadFile 合法域名。

## Capabilities and Constraints

- 已实现：注册登录、自动创建 Key、积分、使用明细、修图/模板双编辑器、结果对比。
- 约束：Sub2API 不支持 mask 编辑；长 prompt 模板可能受模型上下文限制。
- 待定：OSS manifest 全量上线后关闭 `USE_DEV_MANIFEST`。

## Brand Commitments

- 产品名展示：**光匣**（AI 修图）。
- 视觉：白底、荧光绿 `#C8F031` / `#D4F826`、黑色主按钮、大圆角操作块。
- UI 框架：**TDesign 小程序**（主题见根目录 `DESIGN.md`）。

## Evidence on Hand

- Sub2API 管理后台与用户自助注册已开放。
- 模板源：YouMind prompts JSON（bellecdn）。

## Product Principles

1. 任务优先：生成路径短，状态清晰（登录、生成中、失败、对比）。
2. 诚实计费：积分与日志来自 Sub2API，不重复造账。
3. 模板可发现：中文分类 + 分页，不全量拉 49MB JSON。
4. 用户图优先：模板参考图仅作示意，API 输入用用户相册。
5. 微信原生：合法域名、相册权限、不依赖 require JSON。

## Accessibility & Inclusion

- 对比度与触控目标按小程序常规可读性；错误文案说明可恢复操作。
