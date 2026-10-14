export type TemplateCategory = {
  id: string
  name: string
}

export type ManifestMeta = {
  version: string
  pageSize: number
  tags: Array<{ name: string; count: number }>
  primaryCategories?: TemplateCategory[]
  subTags?: TemplateCategory[]
  updatedAt: string
  source?: string
  detailCount?: number
  note?: string
  [key: string]: any
}

export type TemplateAuthor = {
  name: string
  avatar: string
}

export type TemplateListItem = {
  id: number | string
  title: string
  coverUrl: string
  sourceCoverUrl?: string
  tags: string[]
  requiresImage: boolean
  author?: TemplateAuthor
  likes?: number
  liked?: boolean
  aspectRatio?: number
}

export type TemplateDetail = TemplateListItem & {
  prompt: string
  description?: string
  referenceImageUrls?: string[]
  createdAt?: string
  sourceUrl?: string
}
