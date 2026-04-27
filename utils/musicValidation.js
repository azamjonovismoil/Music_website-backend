const normalizeString = (value = '') => String(value || '').trim()

const normalizeBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  return String(value).toLowerCase() === 'true'
}

const normalizeDate = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const uniqueCleanArray = (items = []) =>
  [...new Set(items.map((item) => String(item).trim()).filter(Boolean))]

const parseJsonArray = (value) => {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return uniqueCleanArray(parsed)
  } catch {
    return uniqueCleanArray(String(value).split(','))
  }
}

const validateMusicPayload = ({
  body,
  hasSongFile = false,
  currentMusic = null,
}) => {
  const errors = {}

  const title = normalizeString(body.title ?? currentMusic?.title)
  const artist = normalizeString(body.artist ?? currentMusic?.artist)
  const author = normalizeString(body.author ?? currentMusic?.author)
  const album = normalizeString(body.album ?? currentMusic?.album)
  const language = normalizeString(body.language ?? currentMusic?.language)
  const country = normalizeString(body.country ?? currentMusic?.country)
  const bio = normalizeString(body.bio ?? currentMusic?.bio)
  const artistBio = normalizeString(body.artistBio ?? currentMusic?.artistBio)
  const lyrics = normalizeString(body.lyrics ?? currentMusic?.lyrics)
  const syncedLyricsRaw = normalizeString(body.syncedLyricsRaw ?? currentMusic?.syncedLyricsRaw)
  const status = normalizeString(body.status ?? currentMusic?.status || 'draft')

  const genre = body.genre !== undefined ? parseJsonArray(body.genre) : (currentMusic?.genre || [])
  const mood = body.mood !== undefined ? parseJsonArray(body.mood) : (currentMusic?.mood || [])
  const tags = body.tags !== undefined ? parseJsonArray(body.tags) : (currentMusic?.tags || [])
  const featuredArtists = body.featuredArtists !== undefined
    ? parseJsonArray(body.featuredArtists)
    : (currentMusic?.featuredArtists || [])

  const releaseDate = body.releaseDate !== undefined
    ? normalizeDate(body.releaseDate)
    : (currentMusic?.releaseDate || null)

  const isExplicit = normalizeBoolean(body.isExplicit, currentMusic?.isExplicit || false)
  const isFeatured = normalizeBoolean(body.isFeatured, currentMusic?.isFeatured || false)
  const isRecommended = normalizeBoolean(body.isRecommended, currentMusic?.isRecommended || false)

  if (!['draft', 'published', 'archived'].includes(status)) {
    errors.status = 'Invalid status'
  }

  if (!title) errors.title = 'Title is required'
  else if (title.length < 2) errors.title = 'Title must be at least 2 characters'
  else if (title.length > 120) errors.title = 'Title must be under 120 characters'

  if (!artist) errors.artist = 'Artist is required'
  else if (artist.length < 2) errors.artist = 'Artist must be at least 2 characters'
  else if (artist.length > 120) errors.artist = 'Artist must be under 120 characters'

  if (author.length > 120) errors.author = 'Author must be under 120 characters'
  if (album.length > 120) errors.album = 'Album must be under 120 characters'
  if (language.length > 60) errors.language = 'Language must be under 60 characters'
  if (country.length > 60) errors.country = 'Country must be under 60 characters'
  if (bio.length > 1200) errors.bio = 'Track description must be under 1200 characters'
  if (artistBio.length > 2000) errors.artistBio = 'Artist bio must be under 2000 characters'

  if (body.releaseDate !== undefined && body.releaseDate && !releaseDate) {
    errors.releaseDate = 'Invalid release date'
  }

  if (!Array.isArray(genre)) errors.genre = 'Genre must be an array'
  if (!Array.isArray(mood)) errors.mood = 'Mood must be an array'
  if (!Array.isArray(tags)) errors.tags = 'Tags must be an array'
  if (!Array.isArray(featuredArtists)) errors.featuredArtists = 'Featured artists must be an array'

  if (genre.length > 10) errors.genre = 'Maximum 10 genres allowed'
  if (mood.length > 10) errors.mood = 'Maximum 10 moods allowed'
  if (tags.length > 20) errors.tags = 'Maximum 20 tags allowed'
  if (featuredArtists.length > 10) errors.featuredArtists = 'Maximum 10 featured artists allowed'

  if (status === 'published') {
    if (!hasSongFile && !currentMusic?.url) {
      errors.song = 'Audio file is required for publishing'
    }

    if (genre.length === 0) {
      errors.genre = 'At least one genre is required for publishing'
    }
  }

  return {
    errors,
    normalized: {
      title,
      artist,
      author,
      album,
      language,
      country,
      bio,
      artistBio,
      lyrics,
      syncedLyricsRaw,
      status,
      genre,
      mood,
      tags,
      featuredArtists,
      releaseDate,
      isExplicit,
      isFeatured,
      isRecommended,
    },
  }
}

module.exports = {
  validateMusicPayload,
  parseJsonArray,
  normalizeString,
  normalizeBoolean,
  normalizeDate,
}