import * as Icons from '@ant-design/icons'
import type { ComponentType } from 'react'

const iconMap = Icons as unknown as Record<string, ComponentType>

export function resolveIcon(name?: string): ComponentType | null {
  if (!name) return null
  if (iconMap[name]) return iconMap[name]
  if (iconMap[name + 'Outlined']) return iconMap[name + 'Outlined']
  return null
}
