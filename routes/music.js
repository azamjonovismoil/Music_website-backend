const express = require('express')
const router = express.Router()
const Music = require('../models/music-temp')
const upload = require('../middleware/upload')
const { authMiddleware, adminMiddleware } = require('../middleware/auth')
const {
  COVERS_BUCKET,
  SONGS_BUCKET,
  makeFileKey,
  uploadBufferToBucket,
  removeFromBucket,
} = require('../config/storage')

// ─── helpers ────────────────────────────────────────────────────────────────

const parseBool = (v) => String(v).toLowerCase() === 'true'

const parseJsonField = (value) => {
  if (Array.isArray(value)) return value
  if (!value) return []
  try {
    return JSON.parse(value)
  } catch {
    return String(value)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
}

const buildPublicFields = (doc, userId) => {
  const obj = doc.toObject ? doc.toObject() : { ...doc }
  return {
    ...obj,
    liked: userId ? (obj.likedBy || []).some((id) => String(id) === String(userId)) : false,
  }
}

// ─── GET all (public – published only) ──────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const tracks = await Music.find({ status: 'published' }).sort({ createdAt: -1 })
    const userId = req.user?._id
    res.json(tracks.map((t) => buildPublicFields(t, userId)))
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── GET all (admin – all statuses) ─────────────────────────────────────────
router.get('/admin/all', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const tracks = await Music.find().sort({ createdAt: -1 })
    const userId = req.user?._id
    res.json(tracks.map((t) => buildPublicFields(t, userId)))
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── GET single ──────────────────────────────────────────────────────────────
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const track = await Music.findById(req.params.id)
    if (!track) return res.status(404).json({ message: 'Track not found' })
    res.json(buildPublicFields(track, req.user?._id))
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── STREAM audio ────────────────────────────────────────────────────────────
router.get('/:id/stream', async (req, res) => {
  try {
    const track = await Music.findById(req.params.id)
    if (!track || !track.url) {
      return res.status(404).json({ message: 'Audio not found' })
    }
    // If url is already a public Supabase URL, redirect
    if (/^https?:\/\//i.test(track.url)) {
      return res.redirect(302, track.url)
    }
    res.status(404).json({ message: 'Audio URL not available' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── POST create ─────────────────────────────────────────────────────────────
router.post(
  '/',
  authMiddleware,
  adminMiddleware,
  upload.fields([
    { name: 'cover', maxCount: 1 },
    { name: 'song', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { body, files } = req

      const errors = {}
      if (!String(body.title || '').trim()) errors.title = 'Title is required'
      if (!String(body.artist || '').trim()) errors.artist = 'Artist is required'
      if (!files?.song?.[0]) errors.song = 'Audio file is required'

      if (Object.keys(errors).length) {
        return res.status(400).json({ message: 'Validation failed', errors })
      }

      let coverUrl = String(body.coverUrl || '').trim()
      let coverStorageKey = ''
      let audioUrl = ''
      let audioStorageKey = ''

      // Upload cover to Supabase
      if (files.cover?.[0]) {
        const coverFile = files.cover[0]
        const key = makeFileKey('covers', coverFile.originalname)
        const result = await uploadBufferToBucket({
          bucket: COVERS_BUCKET,
          key,
          buffer: coverFile.buffer,
          contentType: coverFile.mimetype,
        })
        coverUrl = result.url
        coverStorageKey = result.path
      }

      // Upload song to Supabase
      if (files.song?.[0]) {
        const songFile = files.song[0]
        const key = makeFileKey('songs', songFile.originalname)
        const result = await uploadBufferToBucket({
          bucket: SONGS_BUCKET,
          key,
          buffer: songFile.buffer,
          contentType: songFile.mimetype,
        })
        audioUrl = result.url
        audioStorageKey = result.path
      }

      // Get duration from duration field if passed
      const duration = Number(body.duration) || 0

      const track = await Music.create({
        title: String(body.title).trim(),
        artist: String(body.artist).trim(),
        author: String(body.author || '').trim(),
        featuredArtists: parseJsonField(body.featuredArtists),
        genre: parseJsonField(body.genre),
        mood: parseJsonField(body.mood),
        tags: parseJsonField(body.tags),
        album: String(body.album || '').trim(),
        language: String(body.language || '').trim(),
        country: String(body.country || '').trim(),
        releaseDate: body.releaseDate ? new Date(body.releaseDate) : null,
        bio: String(body.bio || '').trim(),
        artistBio: String(body.artistBio || '').trim(),
        lyrics: String(body.lyrics || '').trim(),
        syncedLyricsRaw: String(body.syncedLyricsRaw || '').trim(),
        cover: coverUrl,
        coverStorageKey,
        url: audioUrl,
        audioStorageKey,
        duration,
        status: body.status || 'draft',
        isExplicit: parseBool(body.isExplicit),
        isFeatured: parseBool(body.isFeatured),
        isRecommended: parseBool(body.isRecommended),
      })

      res.status(201).json(buildPublicFields(track, req.user?._id))
    } catch (err) {
      console.error('[Music POST]', err)
      res.status(500).json({ message: err.message })
    }
  }
)

// ─── PUT update ───────────────────────────────────────────────────────────────
router.put(
  '/:id',
  authMiddleware,
  adminMiddleware,
  upload.fields([
    { name: 'cover', maxCount: 1 },
    { name: 'song', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const track = await Music.findById(req.params.id)
      if (!track) return res.status(404).json({ message: 'Track not found' })

      const { body, files } = req

      const errors = {}
      if (body.title !== undefined && !String(body.title).trim()) errors.title = 'Title is required'
      if (body.artist !== undefined && !String(body.artist).trim()) errors.artist = 'Artist is required'

      if (Object.keys(errors).length) {
        return res.status(400).json({ message: 'Validation failed', errors })
      }

      // Upload new cover
      if (files?.cover?.[0]) {
        if (track.coverStorageKey) {
          await removeFromBucket({ bucket: COVERS_BUCKET, key: track.coverStorageKey })
        }
        const coverFile = files.cover[0]
        const key = makeFileKey('covers', coverFile.originalname)
        const result = await uploadBufferToBucket({
          bucket: COVERS_BUCKET,
          key,
          buffer: coverFile.buffer,
          contentType: coverFile.mimetype,
        })
        track.cover = result.url
        track.coverStorageKey = result.path
      } else if (body.coverUrl && String(body.coverUrl).trim()) {
        track.cover = String(body.coverUrl).trim()
      }

      // Upload new song
      if (files?.song?.[0]) {
        if (track.audioStorageKey) {
          await removeFromBucket({ bucket: SONGS_BUCKET, key: track.audioStorageKey })
        }
        const songFile = files.song[0]
        const key = makeFileKey('songs', songFile.originalname)
        const result = await uploadBufferToBucket({
          bucket: SONGS_BUCKET,
          key,
          buffer: songFile.buffer,
          contentType: songFile.mimetype,
        })
        track.url = result.url
        track.audioStorageKey = result.path
      }

      // Update text fields
      const fields = [
        'title', 'artist', 'author', 'album', 'language',
        'country', 'bio', 'artistBio', 'lyrics', 'syncedLyricsRaw', 'status',
      ]
      for (const f of fields) {
        if (body[f] !== undefined) track[f] = String(body[f]).trim()
      }

      const arrayFields = ['featuredArtists', 'genre', 'mood', 'tags']
      for (const f of arrayFields) {
        if (body[f] !== undefined) track[f] = parseJsonField(body[f])
      }

      const boolFields = ['isExplicit', 'isFeatured', 'isRecommended']
      for (const f of boolFields) {
        if (body[f] !== undefined) track[f] = parseBool(body[f])
      }

      if (body.releaseDate !== undefined) {
        track.releaseDate = body.releaseDate ? new Date(body.releaseDate) : null
      }

      await track.save()
      res.json(buildPublicFields(track, req.user?._id))
    } catch (err) {
      console.error('[Music PUT]', err)
      res.status(500).json({ message: err.message })
    }
  }
)

// ─── DELETE ───────────────────────────────────────────────────────────────────
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const track = await Music.findByIdAndDelete(req.params.id)
    if (!track) return res.status(404).json({ message: 'Track not found' })

    if (track.coverStorageKey) {
      await removeFromBucket({ bucket: COVERS_BUCKET, key: track.coverStorageKey })
    }
    if (track.audioStorageKey) {
      await removeFromBucket({ bucket: SONGS_BUCKET, key: track.audioStorageKey })
    }

    res.json({ message: 'Track deleted successfully' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── PATCH like (toggle) ──────────────────────────────────────────────────────
router.patch('/:id/like', authMiddleware, async (req, res) => {
  try {
    const track = await Music.findById(req.params.id)
    if (!track) return res.status(404).json({ message: 'Track not found' })

    const userId = req.user._id
    const likedBy = track.likedBy || []
    const idx = likedBy.findIndex((id) => String(id) === String(userId))

    if (idx === -1) {
      likedBy.push(userId)
      track.likeCount = Math.max(0, (track.likeCount || 0) + 1)
    } else {
      likedBy.splice(idx, 1)
      track.likeCount = Math.max(0, (track.likeCount || 0) - 1)
    }

    track.likedBy = likedBy
    await track.save()

    res.json(buildPublicFields(track, userId))
  } catch (err) {
    console.error('[Like]', err)
    res.status(500).json({ message: err.message })
  }
})

// ─── PATCH download (toggle) ──────────────────────────────────────────────────
router.patch('/:id/download', authMiddleware, async (req, res) => {
  try {
    const track = await Music.findById(req.params.id)
    if (!track) return res.status(404).json({ message: 'Track not found' })

    track.downloadCount = (track.downloadCount || 0) + 1
    await track.save()

    res.json(buildPublicFields(track, req.user?._id))
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── PATCH play count ─────────────────────────────────────────────────────────
router.patch('/:id/play', authMiddleware, async (req, res) => {
  try {
    await Music.findByIdAndUpdate(req.params.id, { $inc: { playCount: 1 } })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// ─── POST generate synced lyrics ──────────────────────────────────────────────
router.post('/:id/generate-sync-from-lyrics', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const track = await Music.findById(req.params.id)
    if (!track) return res.status(404).json({ message: 'Track not found' })

    if (!track.lyrics) {
      return res.status(400).json({ message: 'No lyrics to sync' })
    }

    // Basic fake-sync: timestamp every line evenly across 3 minutes
    const lines = track.lyrics.split('\n').filter(Boolean)
    const totalTime = 180
    const interval = totalTime / Math.max(lines.length, 1)

    const syncedLyricsRaw = lines
      .map((line, i) => {
        const t = i * interval
        const mins = Math.floor(t / 60).toString().padStart(2, '0')
        const secs = (t % 60).toFixed(2).padStart(5, '0')
        return `[${mins}:${secs}]${line}`
      })
      .join('\n')

    track.syncedLyricsRaw = syncedLyricsRaw
    track.syncStatus = 'ready'
    await track.save()

    res.json({ syncedLyricsRaw })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router