// utils/media.js — Single source of truth for all media URLs

export const API_ROOT = (
  import.meta.env.VITE_API_ROOT || 'https://music-website-backend-12.onrender.com'
).replace(/\/+$/, '')

export const fallbackCover =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <rect width="100%" height="100%" fill="#0f172a"/>
      <text x="50%" y="50%" fill="#1e3460" font-size="52"
        text-anchor="middle" dominant-baseline="middle">♪</text>
    </svg>`
  )

/**
 * Normalize any path/URL to a full URL
 */
export function norm(value = '') {
  const s = String(value || '').trim()
  if (!s) return ''
  if (/^(blob:|data:|https?:)/.test(s)) return s
  return `${API_ROOT}/${s.replace(/^\/+/, '')}`
}

/**
 * Resolve cover image URL from music object
 */
export function resolveCover(music) {
  if (!music) return fallbackCover
  for (const key of ['coverUrl', 'cover', 'thumbnail', 'image']) {
    const url = norm(music[key] || '')
    if (url) return url
  }
  return fallbackCover
}

/**
 * Resolve audio stream URL from music object
 */
export function resolveAudio(music) {
  if (!music?._id) return ''
  // Prefer stream endpoint
  if (music.streamUrl) {
    if (/^https?:/.test(music.streamUrl)) return music.streamUrl
    return `${API_ROOT}${music.streamUrl.startsWith('/') ? '' : '/'}${music.streamUrl}`
  }
  // Fallback to stream endpoint by ID
  return `${API_ROOT}/api/music/${music._id}/stream`
}

/**
 * Build a "safe" music object with resolved URLs
 */
export function buildMusic(music) {
  if (!music) return null
  return {
    ...music,
    audioUrl: resolveAudio(music),
    coverUrl: resolveCover(music),
  }
}