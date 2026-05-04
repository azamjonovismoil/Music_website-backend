const express = require('express')
const axios = require('axios')
const jwt = require('jsonwebtoken')

const router = express.Router()

const Music = require('../models/music-temp')
const User = require('../models/User')
const upload = require('../middleware/upload')
const { authMiddleware, adminMiddleware, COOKIE_NAME } = require('../middleware/auth')
const {
  COVERS_BUCKET,
  SONGS_BUCKET,
  makeFileKey,
  uploadBufferToBucket,
  removeFromBucket,
} = require('../utils/storage')

const SYNC_SERVICE_URL = process.env.SYNC_SERVICE_URL || 'http://127.0.0.1:8001'

const normalizeString = (value = '') => String(value || '').trim()

const parseTags = (rawTags) => {
  if (!rawTags) return []
  try {
    const parsed = JSON.parse(rawTags)
    if (Array.isArray(parsed)) return parsed.map((tag) => String(tag).replace(/^#/, '').trim()).filter(Boolean)
    return []
  } catch {
    return String(rawTags).split(',').map((tag) => String(tag).replace(/^#/, '').trim()).filter(Boolean)
  }
}

const parseStringArray = (rawValue) => {
  if (!rawValue) return []
  try {
    const parsed = JSON.parse(rawValue)
    if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean)
    return []
  } catch {
    return String(rawValue).split(',').map((item) => String(item).trim()).filter(Boolean)
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

const runPythonSyncFromUrl = async (audioUrl, lyricsText) => {
  const form = new URLSearchParams()
  form.append('audio_url', audioUrl)
  form.append('lyrics', lyricsText)
  form.append('model_size', 'base')

  const { data } = await axios.post(`${SYNC_SERVICE_URL}/sync/from-url`, form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 1000 * 60 * 10,
  })

  return extractSyncPayload(data)
}

const downloadImageToBuffer = async (url) => {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 1000 * 30,
    maxContentLength: 10 * 1024 * 1024,
  })

  const contentType = String(response.headers['content-type'] || '').split(';')[0].trim()
  const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']

  if (!allowed.includes(contentType)) {
    throw new Error('Cover URL must point to PNG, JPG, JPEG, or WEBP image')
  }

  return {
    buffer: Buffer.from(response.data),
    contentType,
  }
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

router.get('/', async (req, res) => {
  try {
    const musics = await Music.find({ status: 'published' }).sort({ createdAt: -1 })
    const user = await getOptionalUser(req)
    res.json(musics.map((music) => serializeForUser(music, user)))
  } catch (err) {
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

    if (!music.url) return res.status(404).json({ message: 'Audio URL not found' })

    return res.redirect(music.url)
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
    let uploadedCoverKey = ''
    let uploadedSongKey = ''

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

      const songKey = makeFileKey('songs', songFile.originalname)
      const uploadedSong = await uploadBufferToBucket({
        bucket: SONGS_BUCKET,
        key: songKey,
        buffer: songFile.buffer,
        contentType: songFile.mimetype,
      })
      uploadedSongKey = uploadedSong.path

      let cover = ''
      let coverStorageKey = ''

      const coverFile = req.files?.cover?.[0]
      if (coverFile) {
        const coverKey = makeFileKey('covers', coverFile.originalname)
        const uploadedCover = await uploadBufferToBucket({
          bucket: COVERS_BUCKET,
          key: coverKey,
          buffer: coverFile.buffer,
          contentType: coverFile.mimetype,
        })
        cover = uploadedCover.url
        coverStorageKey = uploadedCover.path
        uploadedCoverKey = uploadedCover.path
      } else if (normalizeString(req.body.coverUrl)) {
        const downloaded = await downloadImageToBuffer(req.body.coverUrl)
        const coverKey = makeFileKey('covers', 'cover-from-url.jpg')
        const uploadedCover = await uploadBufferToBucket({
          bucket: COVERS_BUCKET,
          key: coverKey,
          buffer: downloaded.buffer,
          contentType: downloaded.contentType,
        })
        cover = uploadedCover.url
        coverStorageKey = uploadedCover.path
        uploadedCoverKey = uploadedCover.path
      }

      const normalizedSyncedLyricsRaw = normalizeString(req.body.syncedLyricsRaw)
      const syncedLyrics = parseSyncedLyrics(normalizedSyncedLyricsRaw)

      const music = new Music({
        title,
        artist,
        author: normalizeString(req.body.author),
        featuredArtists: parseStringArray(req.body.featuredArtists),
        bio: normalizeString(req.body.bio),
        artistBio: normalizeString(req.body.artistBio),
        lyrics: normalizeString(req.body.lyrics),
        syncedLyricsRaw: normalizedSyncedLyricsRaw,
        syncedLyrics,
        tags: parseTags(req.body.tags),
        genre: parseStringArray(req.body.genre),
        album: normalizeString(req.body.album),
        language: normalizeString(req.body.language),
        mood: parseStringArray(req.body.mood),
        country: normalizeString(req.body.country),
        releaseDate: normalizeDate(req.body.releaseDate),
        status: ['draft', 'published', 'archived'].includes(normalizeString(req.body.status))
          ? normalizeString(req.body.status)
          : 'draft',
        isExplicit: normalizeBoolean(req.body.isExplicit, false),
        isFeatured: normalizeBoolean(req.body.isFeatured, false),
        isRecommended: normalizeBoolean(req.body.isRecommended, false),
        duration: 0,
        syncStatus: normalizedSyncedLyricsRaw ? 'ready' : 'none',
        syncModel: normalizedSyncedLyricsRaw ? 'manual' : '',
        syncUpdatedAt: normalizedSyncedLyricsRaw ? new Date() : null,
        syncError: '',
        cover,
        coverStorageKey,
        url: uploadedSong.url,
        audioStorageKey: uploadedSong.path,
      })

      const savedMusic = await music.save()
      res.status(201).json(serializeForUser(savedMusic, req.user))
    } catch (err) {
      if (uploadedCoverKey) await removeFromBucket({ bucket: COVERS_BUCKET, key: uploadedCoverKey })
      if (uploadedSongKey) await removeFromBucket({ bucket: SONGS_BUCKET, key: uploadedSongKey })

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
    let newCoverKey = ''
    let newSongKey = ''

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
        if (['draft', 'published', 'archived'].includes(nextStatus)) music.status = nextStatus
      }

      if (req.body.isExplicit !== undefined) music.isExplicit = normalizeBoolean(req.body.isExplicit, music.isExplicit)
      if (req.body.isFeatured !== undefined) music.isFeatured = normalizeBoolean(req.body.isFeatured, music.isFeatured)
      if (req.body.isRecommended !== undefined) music.isRecommended = normalizeBoolean(req.body.isRecommended, music.isRecommended)

      if (req.body.syncedLyricsRaw !== undefined) {
        const raw = normalizeString(req.body.syncedLyricsRaw)
        music.syncedLyricsRaw = raw
        music.syncedLyrics = parseSyncedLyrics(raw)
        music.syncStatus = raw ? 'ready' : 'none'
        music.syncUpdatedAt = raw ? new Date() : null
        music.syncError = ''
        music.syncModel = raw ? (music.syncModel || 'manual') : ''
      }

      const coverFile = req.files?.cover?.[0]
      if (coverFile) {
        const coverKey = makeFileKey('covers', coverFile.originalname)
        const uploadedCover = await uploadBufferToBucket({
          bucket: COVERS_BUCKET,
          key: coverKey,
          buffer: coverFile.buffer,
          contentType: coverFile.mimetype,
        })
        newCoverKey = uploadedCover.path

        if (music.coverStorageKey) {
          await removeFromBucket({ bucket: COVERS_BUCKET, key: music.coverStorageKey })
        }

        music.cover = uploadedCover.url
        music.coverStorageKey = uploadedCover.path
      }

      const songFile = req.files?.song?.[0]
      if (songFile) {
        const songKey = makeFileKey('songs', songFile.originalname)
        const uploadedSong = await uploadBufferToBucket({
          bucket: SONGS_BUCKET,
          key: songKey,
          buffer: songFile.buffer,
          contentType: songFile.mimetype,
        })
        newSongKey = uploadedSong.path

        if (music.audioStorageKey) {
          await removeFromBucket({ bucket: SONGS_BUCKET, key: music.audioStorageKey })
        }

        music.url = uploadedSong.url
        music.audioStorageKey = uploadedSong.path
        music.duration = 0
        music.syncedLyrics = []
        music.syncedLyricsRaw = ''
        music.syncStatus = 'none'
        music.syncUpdatedAt = null
        music.syncError = ''
        music.syncModel = ''
      }

      const updatedMusic = await music.save()
      res.json(serializeForUser(updatedMusic, req.user))
    } catch (err) {
      if (newCoverKey) await removeFromBucket({ bucket: COVERS_BUCKET, key: newCoverKey })
      if (newSongKey) await removeFromBucket({ bucket: SONGS_BUCKET, key: newSongKey })

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

    music.syncStatus = 'processing'
    music.syncError = ''
    await music.save()

    const parsed = await runPythonSyncFromUrl(music.url, music.lyrics)

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

    if (music.coverStorageKey) {
      await removeFromBucket({ bucket: COVERS_BUCKET, key: music.coverStorageKey })
    }
    if (music.audioStorageKey) {
      await removeFromBucket({ bucket: SONGS_BUCKET, key: music.audioStorageKey })
    }

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