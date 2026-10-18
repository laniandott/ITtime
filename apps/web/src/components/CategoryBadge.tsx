import type { CSSProperties } from 'react'
import type { Category } from '../types'

type CategoryBadgeData = Pick<Category, 'name' | 'color' | 'icon'>

function contrastColor(color: string) {
  const match = color.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i)
  if (!match) return '#fff'
  const raw = match[1].length === 3
    ? [...match[1]].map((digit) => `${digit}${digit}`).join('')
    : match[1]
  const channels = [0, 2, 4].map((index) => parseInt(raw.slice(index, index + 2), 16) / 255)
  const luminance = channels
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0)
  return luminance > 0.179 ? '#17212b' : '#fff'
}

export function CategoryBadge({ category, size = 'sm', className = '', style }: {
  category: CategoryBadgeData
  size?: 'xs' | 'sm'
  className?: string
  style?: CSSProperties
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center truncate rounded-full font-medium ${size === 'xs' ? 'px-1.5 py-0.5 text-[0.6rem]' : 'px-2 py-0.5 text-xs'} ${className}`}
      style={{ backgroundColor: category.color, color: contrastColor(category.color), ...style }}
      title={category.name}
    >
      {category.icon ? `${category.icon} ` : ''}{category.name}
    </span>
  )
}
