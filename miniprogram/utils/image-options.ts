export type ImageOption = {
  id: string
  label: string
  shortLabel?: string
  size?: string
}

export const IMAGE_RATIOS: ImageOption[] = [
  { id: 'auto', label: '自动', shortLabel: '自动', size: 'auto' },
  { id: '1:1', label: '方形 1:1', shortLabel: '1:1', size: '1024x1024' },
  { id: '2:3', label: '竖版 2:3', shortLabel: '2:3', size: '1024x1536' },
  { id: '3:2', label: '横版 3:2', shortLabel: '3:2', size: '1536x1024' },
]

export const IMAGE_QUALITIES: ImageOption[] = [
  { id: 'auto', label: '自动推荐', shortLabel: '自动' },
  { id: 'low', label: '快速', shortLabel: '快速' },
  { id: 'medium', label: '标准', shortLabel: '标准' },
  { id: 'high', label: '精细', shortLabel: '精细' },
]

export const IMAGE_COUNTS = [1, 2, 3, 4] as const

export function pickedImageSize(ratioId: string, resolution = 'auto'): { size: string; label: string; shortLabel: string } {
  const ratio = IMAGE_RATIOS.find((item) => item.id === ratioId) || IMAGE_RATIOS[0]
  const size = resolution === '1k' && ratio.id === 'auto' ? '1024x1024' : ratio.size || 'auto'
  return {
    size,
    label: ratio.label,
    shortLabel: ratio.shortLabel || ratio.label,
  }
}

export function shortModelLabel(modelId: string): string {
  return (modelId || '').replace(/^gpt-image-/i, '') || '默认'
}
