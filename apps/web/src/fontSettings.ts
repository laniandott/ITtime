export type FontSizePreference = 'compact' | 'standard' | 'comfortable'

export const FONT_SIZE_KEY = 'ittime-font-size'

const FONT_SIZE_PIXELS: Record<FontSizePreference, number> = {
  compact: 14,
  standard: 15,
  comfortable: 16,
}

export function readFontSizePreference(): FontSizePreference {
  const value = localStorage.getItem(FONT_SIZE_KEY)
  return value === 'compact' || value === 'comfortable' ? value : 'standard'
}

export function applyFontSizePreference(value = readFontSizePreference()) {
  document.documentElement.style.fontSize = `${FONT_SIZE_PIXELS[value]}px`
}
