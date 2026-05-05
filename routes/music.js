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

const parseBool = (v) => String(v).toLowerCase() === 'true'
const parseNum = (v, d = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}
const parseJsonField = (value) => {
  if (Array.isArray(value)) return value
  if (!value) return []
  try {
    return JSON.parse(value)
  } catch {
    return String(value).split(',').map((s) => s.trim()).filter(Boolean)
  }
}
const parseDate = (value) => (value ? new Date(value) : null)
const parseObject = (value, fallback = {}) => {
  if (!value) return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}
const slugify = (s = '') =>
  String(s)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const buildDoc = (doc, userId) => {
  const obj = doc.toObject ? doc.toObject() : { ...doc }
  const likedBy = obj.likedBy || []
  const liked = userId ? likedBy.some((id) => String(id) === String(userId)) : false
  const { likedBy: _lb, ...rest } = obj
  return { ...rest, liked }
}

const canViewTrack = (track, user) => {
  if (!track) return false
  if (track.status === 'published' && track.visibility !== 'private') return true
  if (user?.role === 'admin') return true
  return false
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const tracks = await Music.find({
      status: 'published',
      visibility: { $in: ['public', 'unlisted'] },
    }).sort({ createdAt: -1 })

    res.json(tracks.map((t) => buildDoc(t, req.user?._id)))
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.get('/admin/all', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const tracks = await Music.find().sort({ createdAt: -1 })
    res.json(tracks.map((t) => buildDoc(t, req.user?._id)))
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.get('/me/liked', authMiddleware, async (req, res) => {
  try {
    const tracks = await Music.find({
      likedBy: req.user._id,
      status: 'published',
      visibility: { $in: ['public', 'unlisted'] },
    }).sort({ createdAt: -1 })

    res.json(tracks.map((t) => buildDoc(t, req.user._id)))
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.get('/:id/stream', authMiddleware, async (req, res) => {
  try {
    const track = await Music.findById(req.params.id).select('url status visibility')
    if (!track) return res.status(404).json({ message: 'Track not found' })
    if (!canViewTrack(track, req.user)) return res.status(403).json({ message: 'Forbidden' })
    if (!track.url) return res.status(404).json({ message: 'Audio not found' })

    if (/^https?:\/\//i.test(track.url)) return res.redirect(302, track.url)
    return res.status(404).json({ message: 'Invalid audio URL' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const track = await Music.findById(req.params.id)
    if (!track) return res.status(404).json({ message: 'Track not found' })
    if (!canViewTrack(track, req.user)) return res.status(403).json({ message: 'Forbidden' })
    res.json(buildDoc(track, req.user?._id))
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.post(
  '/',
  authMiddleware,
  adminMiddleware,
  upload.fields([{ name: 'cover', maxCount: 1 }, { name: 'song', maxCount: 1 }]),
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

      if (files.cover?.[0]) {
        const f = files.cover[0]
        const key = makeFileKey('covers', f.originalname)
        const r = await uploadBufferToBucket({
          bucket: COVERS_BUCKET,
          key,
          buffer: f.buffer,
          contentType: f.mimetype,
        })
        coverUrl = r.url
        coverStorageKey = r.path
      }

      if (files.song?.[0]) {
        const f = files.song[0]
        const key = makeFileKey('songs', f.originalname)
        const r = await uploadBufferToBucket({
          bucket: SONGS_BUCKET,
          key,
          buffer: f.buffer,
          contentType: f.mimetype,
        })
        audioUrl = r.url
        audioStorageKey = r.path
      }

      const track = await Music.create({
        title: String(body.title).trim(),
        slug: String(body.slug || '').trim() || slugify(body.title),
        artist: String(body.artist).trim(),
        author: String(body.author || '').trim(),
        composer: String(body.composer || '').trim(),
        producer: String(body.producer || '').trim(),
        featuredArtists: parseJsonField(body.featuredArtists),

        album: String(body.album || '').trim(),
        trackNumber: parseNum(body.trackNumber),
        discNumber: parseNum(body.discNumber),
        version: String(body.version || '').trim(),

        genre: parseJsonField(body.genre),
        mood: parseJsonField(body.mood),
        tags: parseJsonField(body.tags),

        language: String(body.language || '').trim(),
        lyricsLanguage: String(body.lyricsLanguage || '').trim(),
        country: String(body.country || '').trim(),

        releaseType: String(body.releaseType || 'single').trim(),
        visibility: String(body.visibility || 'public').trim(),

        releaseDate: parseDate(body.releaseDate),
        publishAt: parseDate(body.publishAt),

        bio: String(body.bio || '').trim(),
        artistBio: String(body.artistBio || '').trim(),
        lyrics: String(body.lyrics || '').trim(),
        syncedLyricsRaw: String(body.syncedLyricsRaw || '').trim(),

        cover: coverUrl,
        coverStorageKey,
        url: audioUrl,
        audioStorageKey,

        duration: parseNum(body.duration),
        bpm: parseNum(body.bpm),
        keySignature: String(body.keySignature || '').trim(),
        isrc: String(body.isrc || '').trim(),

        labelName: String(body.labelName || '').trim(),
        copyright: String(body.copyright || '').trim(),

        status: String(body.status || 'draft').trim(),
        isExplicit: parseBool(body.isExplicit),
        isFeatured: parseBool(body.isFeatured),
        isRecommended: parseBool(body.isRecommended),
        isFreeDownload: parseBool(body.isFreeDownload),

        adminNote: String(body.adminNote || '').trim(),
        externalLinks: parseObject(body.externalLinks, {}),
      })

      res.status(201).json(buildDoc(track, req.user?._id))
    } catch (err) {
      console.error('[Music POST]', err)
      res.status(500).json({ message: err.message })
    }
  }
)

router.put(
  '/:id',
  authMiddleware,
  adminMiddleware,
  upload.fields([{ name: 'cover', maxCount: 1 }, { name: 'song', maxCount: 1 }]),
  async (req, res) => {
    try {
      const track = await Music.findById(req.params.id)
      if (!track) return res.status(404).json({ message: 'Track not found' })

      const { body, files } = req
      const oldCoverKey = track.coverStorageKey
      const oldAudioKey = track.audioStorageKey

      if (files?.cover?.[0]) {
        const f = files.cover[0]
        const key = makeFileKey('covers', f.originalname)
        const r = await uploadBufferToBucket({
          bucket: COVERS_BUCKET,
          key,
          buffer: f.buffer,
          contentType: f.mimetype,
        })
        track.cover = r.url
        track.coverStorageKey = r.path
      } else if (body.coverUrl !== undefined) {
        track.cover = String(body.coverUrl || '').trim()
      }

      if (files?.song?.[0]) {
        const f = files.song[0]
        const key = makeFileKey('songs', f.originalname)
        const r = await uploadBufferToBucket({
          bucket: SONGS_BUCKET,
          key,
          buffer: f.buffer,
          contentType: f.mimetype,
        })
        track.url = r.url
        track.audioStorageKey = r.path
      }

      const stringFields = [
        'title', 'slug', 'artist', 'author', 'composer', 'producer',
        'album', 'version', 'language', 'lyricsLanguage', 'country',
        'bio', 'artistBio', 'lyrics', 'syncedLyricsRaw', 'keySignature',
        'isrc', 'labelName', 'copyright', 'status', 'releaseType',
        'visibility', 'adminNote'
      ]

      for (const f of stringFields) {
        if (body[f] !== undefined) track[f] = String(body[f] || '').trim()
      }

      for (const f of ['featuredArtists', 'genre', 'mood', 'tags']) {
        if (body[f] !== undefined) track[f] = parseJsonField(body[f])
      }

      for (const f of ['isExplicit', 'isFeatured', 'isRecommended', 'isFreeDownload']) {
        if (body[f] !== undefined) track[f] = parseBool(body[f])
      }

      if (body.trackNumber !== undefined) track.trackNumber = parseNum(body.trackNumber)
      if (body.discNumber !== undefined) track.discNumber = parseNum(body.discNumber)
      if (body.duration !== undefined) track.duration = parseNum(body.duration)
      if (body.bpm !== undefined) track.bpm = parseNum(body.bpm)

      if (body.releaseDate !== undefined) track.releaseDate = parseDate(body.releaseDate)
      if (body.publishAt !== undefined) track.publishAt = parseDate(body.publishAt)
      if (body.externalLinks !== undefined) track.externalLinks = parseObject(body.externalLinks, {})

      await track.save()

      if (files?.cover?.[0] && oldCoverKey) {
        await removeFromBucket({ bucket: COVERS_BUCKET, key: oldCoverKey }).catch(() => { })
      }
      if (files?.song?.[0] && oldAudioKey) {
        await removeFromBucket({ bucket: SONGS_BUCKET, key: oldAudioKey }).catch(() => { })
      }

      res.json(buildDoc(track, req.user?._id))
    } catch (err) {
      console.error('[Music PUT]', err)
      res.status(500).json({ message: err.message })
    }
  }
)

router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const track = await Music.findByIdAndDelete(req.params.id)
    if (!track) return res.status(404).json({ message: 'Track not found' })

    if (track.coverStorageKey) {
      await removeFromBucket({ bucket: COVERS_BUCKET, key: track.coverStorageKey }).catch(() => { })
    }
    if (track.audioStorageKey) {
      await removeFromBucket({ bucket: SONGS_BUCKET, key: track.audioStorageKey }).catch(() => { })
    }

    res.json({ message: 'Track deleted successfully' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.patch('/:id/like', authMiddleware, async (req, res) => {
  try {
    const track = await Music.findById(req.params.id)
    if (!track) return res.status(404).json({ message: 'Track not found' })
    if (!canViewTrack(track, req.user)) return res.status(403).json({ message: 'Forbidden' })

    const userId = String(req.user._id)
    const idx = (track.likedBy || []).findIndex((id) => String(id) === userId)

    if (idx === -1) {
      track.likedBy.push(req.user._id)
      track.likeCount = (track.likeCount || 0) + 1
    } else {
      track.likedBy.splice(idx, 1)
      track.likeCount = Math.max(0, (track.likeCount || 0) - 1)
    }

    await track.save()
    res.json(buildDoc(track, req.user._id))
  } catch (err) {
    console.error('[Like]', err)
    res.status(500).json({ message: err.message })
  }
})

router.patch('/:id/download', authMiddleware, async (req, res) => {
  try {
    const track = await Music.findById(req.params.id)
    if (!track) return res.status(404).json({ message: 'Track not found' })
    if (!canViewTrack(track, req.user)) return res.status(403).json({ message: 'Forbidden' })

    track.downloadCount = (track.downloadCount || 0) + 1
    await track.save()

    res.json(buildDoc(track, req.user?._id))
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.patch('/:id/play', authMiddleware, async (req, res) => {
  try {
    const track = await Music.findById(req.params.id)
    if (!track) return res.status(404).json({ message: 'Track not found' })
    if (!canViewTrack(track, req.user)) return res.status(403).json({ message: 'Forbidden' })

    track.playCount = (track.playCount || 0) + 1
    await track.save()

    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router