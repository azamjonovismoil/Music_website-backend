export const API_ROOT = (
  import.meta.env.VITE_API_ROOT || 'https://music-website-backend-12.onrender.com'
).replace(/\/+$/, '')

export const fallbackCover =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <rect width="100%" height="100%" fill="#0f172a"/>
      <text x="50%" y="50%" fill="#1e3460" font-size="52" text-anchor="middle" dominant-baseline="middle">♪</text>
    </svg>`
  )

export function norm(value = '') {
  const s = String(value || '').trim()
  if (!s) return ''
  if (/^(blob:|data:|https?:)/i.test(s)) return s
  return `${API_ROOT}/${s.replace(/^\/+/, '')}`
}

export function resolveCover(music) {
  if (!music) return fallbackCover

  for (const key of ['coverUrl', 'cover', 'thumbnail', 'image']) {
    const url = norm(music[key] || '')
    if (url) return url
  }

  return fallbackCover
}

export function resolveAudio(music) {
  if (!music?._id) return ''

  if (music.audioUrl) return norm(music.audioUrl)

  if (music.streamUrl) {
    if (/^https?:/i.test(music.streamUrl)) return music.streamUrl
    return `${API_ROOT}${music.streamUrl.startsWith('/') ? '' : '/'}${music.streamUrl}`
  }

  if (music.url) return norm(music.url)

  return `${API_ROOT}/api/music/${music._id}/stream`
}

export function buildMusic(music) {
  if (!music) return null
  return {
    ...music,
    audioUrl: resolveAudio(music),
    coverUrl: resolveCover(music),
  }
}