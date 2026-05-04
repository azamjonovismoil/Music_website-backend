const express = require('express')
const path = require('path')
const fs = require('fs')
const mm = require('music-metadata')
const axios = require('axios')
const jwt = require('jsonwebtoken')

const router = express.Router()

const Music = require('../models/music-temp')
const User = require('../models/User')
const upload = require('../middleware/upload')
const { authMiddleware, adminMiddleware, COOKIE_NAME } = require('../middleware/auth')
const {
  DATA_ROOT,
  coversDir,
  toStoredUrl,
  toAbsolutePath,
} = require('../config/storage')

const SYNC_SERVICE_URL = process.env.SYNC_SERVICE_URL || 'http://127.0.0.1:8001'

const normalizeString = (value = '') => String(value || '').trim()

const safeUnlink = (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch { }
}

const parseTags = (rawTags) => {
  if (!rawTags) return []
  try {
    const parsed = JSON.parse(rawTags)
    if (Array.isArray(parsed)) {
      return parsed.map((tag) => String(tag).replace(/^#/, '').trim()).filter(Boolean)
    }
    return []
  } catch {
    return String(rawTags)
      .split(',')
      .map((tag) => String(tag).replace(/^#/, '').trim())
      .filter(Boolean)
  }
}

const parseStringArray = (rawValue) => {
  if (!rawValue) return []
  try {
    const parsed = JSON.parse(rawValue)
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean)
    }
    return []
  } catch {
    return String(rawValue)
      .split(',')
      .map((item) => String(item).trim())
      .filter(Boolean)
  }
}

const normalizeDate = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const normalizeBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  return String(value).toLowerCase() === 'true'
}

const parseSyncedLyrics = (raw = '') => {
  if (!raw || !String(raw).trim()) return []

  return String(raw)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.+)$/)
      if (!match) return null

      const minutes = parseInt(match[1], 10)
      const seconds = parseInt(match[2], 10)
      const msRaw = match[3] || '0'
      const text = match[4]?.trim()
      if (!text) return null

      const milliseconds = parseInt(msRaw.padEnd(3, '0'), 10)
      const time = minutes * 60 + seconds + milliseconds / 1000

      return {
        time,
        start: time,
        end: time + 2,
        text,
        confidence: 0,
        words: [],
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time)
}

const extractOptionalToken = (req) => {
  const bearerHeader = req.headers.authorization || ''
  const bearerToken = bearerHeader.startsWith('Bearer ')
    ? bearerHeader.slice(7).trim()
    : null

  const cookieToken = req.cookies?.[COOKIE_NAME]
  return bearerToken || cookieToken || null
}

const getOptionalUser = async (req) => {
  try {
    const token = extractOptionalToken(req)
    if (!token || !process.env.JWT_SECRET) return null

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (!decoded?.id) return null

    return await User.findById(decoded.id).select(
      'favourites downloaded recentlyPlayed continueListening preferences isAdmin'
    )
  } catch {
    return null
  }
}

const extractSyncPayload = (data) => {
  if (!data) return {}
  return data.data && typeof data.data === 'object' ? data.data : data
}

const runPythonSyncFromLyrics = async (audioPath, lyricsText) => {
  const form = new URLSearchParams()
  form.append('audio_path', audioPath)
  form.append('lyrics', lyricsText)
  form.append('model_size', 'base')

  const { data } = await axios.post(`${SYNC_SERVICE_URL}/sync/from-lyrics`, form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 1000 * 60 * 10,
  })

  return extractSyncPayload(data)
}

const resolveStoredFilePath = (storedUrl = '') => {
  if (!storedUrl) return null
  const full = toAbsolutePath(storedUrl)
  return fs.existsSync(full) ? full : null
}

const getExtFromMime = (mime = '') => {
  if (mime === 'image/png') return '.png'
  if (mime === 'image/webp') return '.webp'
  return '.jpg'
}

const downloadCoverFromUrl = async (coverUrl) => {
  const url = normalizeString(coverUrl)
  if (!url) return ''

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Invalid cover URL')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Cover URL must start with http or https')
  }

  const response = await axios.get(url, {
    responseType: 'stream',
    timeout: 1000 * 30,
    maxContentLength: 10 * 1024 * 1024,
    headers: {
      'User-Agent': 'Mozilla/5.0 MusicAppBot',
    },
  })

  const contentType = String(response.headers['content-type'] || '').split(';')[0].trim()
  if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(contentType)) {
    throw new Error('Cover URL must point to PNG, JPG, JPEG, or WEBP image')
  }

  const ext = getExtFromMime(contentType)
  const filename = `${Date.now()}-cover-url${ext}`
  const filepath = path.join(coversDir, filename)

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(filepath)
    response.data.pipe(writer)
    writer.on('finish', resolve)
    writer.on('error', reject)
  })

  return toStoredUrl('covers', filename)
}

const toSafeMusic = (music, extras = {}) => {
  const obj = music.toObject ? music.toObject() : { ...music }

  return {
    ...obj,
    streamUrl: `/api/music/${obj._id}/stream`,
    liked: false,
    downloaded: false,
    ...extras,
  }
}

const serializeForUser = (music, user) => {
  const musicId = String(music._id)
  const liked = (user?.favourites || []).some((id) => String(id) === musicId)
  const downloaded = (user?.downloaded || []).some((id) => String(id) === musicId)

  return toSafeMusic(music, { liked, downloaded })
}

const sendAudioStream = (req, res, filePath) => {
  const stat = fs.statSync(filePath)
  const fileSize = stat.size
  const range = req.headers.range

  const ext = path.extname(filePath).toLowerCase()
  const contentType =
    ext === '.mp3'
      ? 'audio/mpeg'
      : ext === '.wav'
        ? 'audio/wav'
        : ext === '.ogg'
          ? 'audio/ogg'
          : ext === '.m4a'
            ? 'audio/mp4'
            : 'application/octet-stream'

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-')
    const start = parseInt(parts[0], 10)
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1

    if (Number.isNaN(start) || start >= fileSize) {
      res.status(416).set({ 'Content-Range': `bytes */${fileSize}` })
      return res.end()
    }

    const finalEnd = Number.isNaN(end) ? fileSize - 1 : Math.min(end, fileSize - 1)
    const chunkSize = finalEnd - start + 1

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${finalEnd}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    })

    fs.createReadStream(filePath, { start, end: finalEnd }).pipe(res)
    return
  }

  res.writeHead(200, {
    'Content-Length': fileSize,
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  })

  fs.createReadStream(filePath).pipe(res)
}

router.get('/', async (req, res) => {
  try {
    const musics = await Music.find({ status: 'published' }).sort({ createdAt: -1 })
    const user = await getOptionalUser(req)
    res.json(musics.map((music) => serializeForUser(music, user)))
  } catch (err) {
    console.error('[GET /api/music]', err)
    res.status(500).json({ message: 'Error fetching musics', error: err.message })
  }
})

router.get('/admin/all', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const musics = await Music.find({}).sort({ createdAt: -1 })
    res.json(musics.map((music) => serializeForUser(music, req.user)))
  } catch (err) {
    res.status(500).json({ message: 'Error fetching admin musics', error: err.message })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const music = await Music.findById(req.params.id)
    if (!music || music.status !== 'published') {
      return res.status(404).json({ message: 'Music not found' })
    }

    const user = await getOptionalUser(req)
    res.json(serializeForUser(music, user))
  } catch (err) {
    res.status(500).json({ message: 'Error fetching music', error: err.message })
  }
})

router.get('/:id/stream', async (req, res) => {
  try {
    const music = await Music.findById(req.params.id)
    if (!music) return res.status(404).json({ message: 'Music not found' })

    const user = await getOptionalUser(req)

    if (music.status !== 'published' && Number(user?.isAdmin) !== 1) {
      return res.status(403).json({ message: 'Music is not available' })
    }

    const filePath = resolveStoredFilePath(music.url)
    if (!filePath) {
      return res.status(404).json({ message: 'Audio file not found', storedUrl: music.url })
    }

    sendAudioStream(req, res, filePath)
  } catch (err) {
    res.status(500).json({ message: 'Error streaming music', error: err.message })
  }
})

router.post(
  '/',
  authMiddleware,
  adminMiddleware,
  upload.fields([
    { name: 'cover', maxCount: 1 },
    { name: 'song', maxCount: 1 },
  ]),
  async (req, res) => {
    let downloadedCoverUrl = ''

    try {
      const songFile = req.files?.song?.[0]
      if (!songFile) {
        return res.status(400).json({ message: 'Song file is required' })
      }

      const title = normalizeString(req.body.title)
      const artist = normalizeString(req.body.artist)

      if (!title || !artist) {
        return res.status(400).json({ message: 'Title and artist are required' })
      }

      const tags = parseTags(req.body.tags)
      const genre = parseStringArray(req.body.genre)
      const mood = parseStringArray(req.body.mood)
      const featuredArtists = parseStringArray(req.body.featuredArtists)

      let duration = 0
      try {
        const metadata = await mm.parseFile(songFile.path)
        duration = Math.round(metadata.format.duration || 0)
      } catch { }

      const normalizedSyncedLyricsRaw = normalizeString(req.body.syncedLyricsRaw)
      const syncedLyrics = parseSyncedLyrics(normalizedSyncedLyricsRaw)

      let cover = req.files?.cover?.[0]
        ? toStoredUrl('covers', req.files.cover[0].filename)
        : ''

      const coverUrl = normalizeString(req.body.coverUrl)
      if (!cover && coverUrl) {
        downloadedCoverUrl = await downloadCoverFromUrl(coverUrl)
        cover = downloadedCoverUrl
      }

      const music = new Music({
        title,
        artist,
        author: normalizeString(req.body.author),
        featuredArtists,
        bio: normalizeString(req.body.bio),
        artistBio: normalizeString(req.body.artistBio),
        lyrics: normalizeString(req.body.lyrics),
        syncedLyricsRaw: normalizedSyncedLyricsRaw,
        syncedLyrics,
        tags,
        genre,
        album: normalizeString(req.body.album),
        language: normalizeString(req.body.language),
        mood,
        country: normalizeString(req.body.country),
        releaseDate: normalizeDate(req.body.releaseDate),
        status: ['draft', 'published', 'archived'].includes(normalizeString(req.body.status))
          ? normalizeString(req.body.status)
          : 'draft',
        isExplicit: normalizeBoolean(req.body.isExplicit, false),
        isFeatured: normalizeBoolean(req.body.isFeatured, false),
        isRecommended: normalizeBoolean(req.body.isRecommended, false),
        duration,
        syncStatus: normalizedSyncedLyricsRaw ? 'ready' : 'none',
        syncModel: normalizedSyncedLyricsRaw ? 'manual' : '',
        syncUpdatedAt: normalizedSyncedLyricsRaw ? new Date() : null,
        syncError: '',
        cover,
        url: toStoredUrl('songs', songFile.filename),
      })

      const savedMusic = await music.save()
      res.status(201).json(serializeForUser(savedMusic, req.user))
    } catch (err) {
      if (downloadedCoverUrl) {
        const absolute = resolveStoredFilePath(downloadedCoverUrl)
        if (absolute) safeUnlink(absolute)
      }

      console.error('[POST /api/music]', err)
      res.status(500).json({ message: 'Error saving music', error: err.message })
    }
  }
)

router.put(
  '/:id',
  authMiddleware,
  adminMiddleware,
  upload.fields([
    { name: 'cover', maxCount: 1 },
    { name: 'song', maxCount: 1 },
  ]),
  async (req, res) => {
    let downloadedCoverUrl = ''

    try {
      const music = await Music.findById(req.params.id)
      if (!music) return res.status(404).json({ message: 'Music not found' })

      if (req.body.title !== undefined) music.title = normalizeString(req.body.title) || music.title
      if (req.body.artist !== undefined) music.artist = normalizeString(req.body.artist) || music.artist
      if (req.body.author !== undefined) music.author = normalizeString(req.body.author)
      if (req.body.bio !== undefined) music.bio = normalizeString(req.body.bio)
      if (req.body.artistBio !== undefined) music.artistBio = normalizeString(req.body.artistBio)
      if (req.body.lyrics !== undefined) music.lyrics = normalizeString(req.body.lyrics)
      if (req.body.featuredArtists !== undefined) music.featuredArtists = parseStringArray(req.body.featuredArtists)
      if (req.body.genre !== undefined) music.genre = parseStringArray(req.body.genre)
      if (req.body.album !== undefined) music.album = normalizeString(req.body.album)
      if (req.body.language !== undefined) music.language = normalizeString(req.body.language)
      if (req.body.mood !== undefined) music.mood = parseStringArray(req.body.mood)
      if (req.body.country !== undefined) music.country = normalizeString(req.body.country)
      if (req.body.releaseDate !== undefined) music.releaseDate = normalizeDate(req.body.releaseDate)
      if (req.body.tags !== undefined) music.tags = parseTags(req.body.tags)

      if (req.body.status !== undefined) {
        const nextStatus = normalizeString(req.body.status)
        if (['draft', 'published', 'archived'].includes(nextStatus)) {
          music.status = nextStatus
        }
      }

      if (req.body.isExplicit !== undefined) {
        music.isExplicit = normalizeBoolean(req.body.isExplicit, music.isExplicit)
      }

      if (req.body.isFeatured !== undefined) {
        music.isFeatured = normalizeBoolean(req.body.isFeatured, music.isFeatured)
      }

      if (req.body.isRecommended !== undefined) {
        music.isRecommended = normalizeBoolean(req.body.isRecommended, music.isRecommended)
      }

      if (req.body.syncedLyricsRaw !== undefined) {
        const raw = normalizeString(req.body.syncedLyricsRaw)
        music.syncedLyricsRaw = raw
        music.syncedLyrics = parseSyncedLyrics(raw)
        music.syncStatus = raw ? 'ready' : 'none'
        music.syncUpdatedAt = raw ? new Date() : null
        music.syncError = ''
        music.syncModel = raw ? (music.syncModel || 'manual') : ''
      }

      if (req.files?.cover?.[0]) {
        const oldCoverPath = resolveStoredFilePath(music.cover)
        if (oldCoverPath) safeUnlink(oldCoverPath)
        music.cover = toStoredUrl('covers', req.files.cover[0].filename)
      } else if (req.body.coverUrl !== undefined && normalizeString(req.body.coverUrl)) {
        downloadedCoverUrl = await downloadCoverFromUrl(req.body.coverUrl)
        const oldCoverPath = resolveStoredFilePath(music.cover)
        if (oldCoverPath) safeUnlink(oldCoverPath)
        music.cover = downloadedCoverUrl
      }

      if (req.files?.song?.[0]) {
        const oldSongPath = resolveStoredFilePath(music.url)
        if (oldSongPath) safeUnlink(oldSongPath)

        const newSongFile = req.files.song[0]
        music.url = toStoredUrl('songs', newSongFile.filename)

        try {
          const metadata = await mm.parseFile(newSongFile.path)
          music.duration = Math.round(metadata.format.duration || 0)
        } catch {
          music.duration = 0
        }

        music.syncedLyrics = []
        music.syncedLyricsRaw = ''
        music.lrcFile = ''
        music.syncStatus = 'none'
        music.syncUpdatedAt = null
        music.syncError = ''
        music.syncModel = ''
      }

      const updatedMusic = await music.save()
      res.json(serializeForUser(updatedMusic, req.user))
    } catch (err) {
      if (downloadedCoverUrl) {
        const absolute = resolveStoredFilePath(downloadedCoverUrl)
        if (absolute) safeUnlink(absolute)
      }

      console.error('[PUT /api/music/:id]', err)
      res.status(500).json({ message: 'Error updating music', error: err.message })
    }
  }
)

router.post('/:id/generate-sync-from-lyrics', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const music = await Music.findById(req.params.id)
    if (!music) return res.status(404).json({ message: 'Music not found' })
    if (!music.url) return res.status(400).json({ message: 'Music file url not found' })
    if (!music.lyrics?.trim()) return res.status(400).json({ message: 'Lyrics text is required' })

    const absoluteAudioPath = resolveStoredFilePath(music.url)
    if (!absoluteAudioPath) {
      return res.status(400).json({ message: 'Audio file not found', storedUrl: music.url })
    }

    music.syncStatus = 'processing'
    music.syncError = ''
    await music.save()

    const parsed = await runPythonSyncFromLyrics(absoluteAudioPath, music.lyrics)

    music.language = parsed.language || music.language || ''
    music.duration = parsed.duration || music.duration || 0
    music.syncedLyricsRaw = parsed.syncedLyricsRaw || ''
    music.syncedLyrics = Array.isArray(parsed.syncedLyrics)
      ? parsed.syncedLyrics
      : parseSyncedLyrics(parsed.syncedLyricsRaw || '')
    music.syncStatus = music.syncedLyricsRaw ? 'ready' : 'none'
    music.syncModel = parsed.backend || 'auto'
    music.syncUpdatedAt = new Date()
    music.syncError = ''

    const savedMusic = await music.save()
    res.json(serializeForUser(savedMusic, req.user))
  } catch (err) {
    try {
      const music = await Music.findById(req.params.id)
      if (music) {
        music.syncStatus = 'failed'
        music.syncError = err?.response?.data?.detail || err.message || 'Sync failed'
        await music.save()
      }
    } catch { }

    res.status(500).json({
      message: 'Generate sync from lyrics failed',
      error: err?.response?.data?.detail || err.message,
    })
  }
})

router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const music = await Music.findById(req.params.id)
    if (!music) return res.status(404).json({ message: 'Music not found' })

    const coverPath = resolveStoredFilePath(music.cover)
    const songPath = resolveStoredFilePath(music.url)
    const lrcPath = resolveStoredFilePath(music.lrcFile)

    if (coverPath) safeUnlink(coverPath)
    if (songPath) safeUnlink(songPath)
    if (lrcPath) safeUnlink(lrcPath)

    await Music.findByIdAndDelete(req.params.id)

    await User.updateMany(
      {},
      {
        $pull: {
          favourites: music._id,
          downloaded: music._id,
          recentlyPlayed: { music: music._id },
          continueListening: { music: music._id },
        },
      }
    )

    res.json({ message: 'Music deleted successfully' })
  } catch (err) {
    res.status(500).json({ message: 'Error deleting music', error: err.message })
  }
})

module.exports = router