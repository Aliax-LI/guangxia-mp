# 光匣 设计系统

<!-- impeccable:design-schema 1 -->

**光匣** toC AI 修图气质：白底、大留白、荧光绿强调、黑色主按钮。实现基于 **TDesign 小程序** + 主题变量覆盖。

## 色彩

| Token | 值 | 用途 |
|-------|-----|------|
| Brand | `#C8F031` | Tab 选中、标签、光晕 Logo |
| Brand Light | `#EEF9D4` | 次要按钮底、选中 Tag 底 |
| Brand Active | `#A8D600` | 按下态 |
| Ink | `#111111` | 主文字、主按钮（登录） |
| Muted | `#8E8E93` | 次要文字 |
| Surface | `#FFFFFF` | 页面底 |
| Surface Muted | `#F5F5F7` | 输入框、搜索栏 |

## 圆角与阴影

- 卡片 / 大按钮：`20rpx`（`--td-radius-large`）
- 胶囊 Tag / 分段：`999rpx`
- 卡片阴影：`0 8rpx 32rpx rgba(0,0,0,0.04)`，避免重阴影

##  typography

- 系统栈：PingFang SC / SF Pro
- 标题：600–800，正文 28–30rpx
- 不在 UI 标签上使用 display 衬线

## 组件策略（TDesign）

- **登录**：`t-input` + 黑色块级 `t-button` + `t-checkbox`
- **修图首页**：自定义大色块（相册/相机）+ 风格预设 + `textarea`
- **模版**：`t-search` + 分类 Tag + 双列卡片
- **我的**：账户卡片 + 双功能入口 + 作品集 Tab

## 模式

Operate：任务完成优先；品牌体现在 accent、主按钮和 Tab 选中色。

## 禁止

- 渐变文字、无目的玻璃拟态
- 暗色全站（与光匣白底风格不一致）
- 在 for 循环内嵌套未做 key 优化的重型组件（列表用稳定 id）
