const express = require('express')
const mongoose = require('mongoose')
const router = express.Router()

const Music = require('../models/music-temp')
const Playlist = require('../models/playlist-temp')
const upload = require('../middleware/upload')
const { authMiddleware, adminMiddleware } = require('../middleware/auth')
const {
  COVERS_BUCKET,
  SONGS_BUCKET,
  makeFileKey,
  uploadBufferToBucket,
  removeFromBucket,
} = require('../config/storage')

const ALLOWED_STATUS = ['draft', 'published', 'archived']
const ALLOWED_VISIBILITY = ['public', 'unlisted', 'private']
const ALLOWED_RELEASE_TYPES = ['single', 'ep', 'album-track', 'remix', 'live', 'instrumental']

const parseBool = (v) => String(v).toLowerCase() === 'true'

const parseNum = (v, d = 0) => {
  if (v === '' || v === null || v === undefined) return d
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

const parseDate = (v) => {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

const parseJsonField = (v) => {
  if (Array.isArray(v)) return v
  if (!v) return []
  try {
    const parsed = JSON.parse(v)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return String(v).split(',').map((x) => x.trim()).filter(Boolean)
  }
}

const parseObject = (v, fallback = {}) => {
  if (!v) return fallback
  if (typeof v === 'object') return v
  try {
    return JSON.parse(v)
  } catch {
    return fallback
  }
}

const sanitizeEnum = (value, allowed, fallback) => {
  const normalized = String(value || '').trim()
  return allowed.includes(normalized) ? normalized : fallback
}

const slugify = (s = '') =>
  String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

const canViewTrack = (track, user) => {
  if (!track) return false
  if (Number(user?.isAdmin) === 1) return true
  return track.status === 'published' && track.visibility !== 'private'
}

const getHealth = (track) => {
  const checks = [
    !!String(track.title || '').trim(),
    !!String(track.artist || '').trim(),
    !!String(track.url || '').trim(),
    !!String(track.cover || '').trim(),
    Array.isArray(track.genre) && track.genre.length > 0,
    !!(track.externalLinks && Object.values(track.externalLinks).some((v) => String(v || '').trim())),
    !!String(track.visibility || '').trim(),
  ]

  const score = Math.round((checks.filter(Boolean).length / checks.length) * 100)

  let tier = 'basic'
  if (score >= 90) tier = 'premium'
  else if (score >= 70) tier = 'rich'
  else if (score >= 45) tier = 'good'

  return { score, tier }
}

const getAttentionReasons = (track) => {
  const reasons = []

  if (!track.cover) reasons.push('Missing cover')
  if (!track.url) reasons.push('Missing audio')
  if (track.status === 'draft') reasons.push('Still draft')
  if (track.publishAt && new Date(track.publishAt) < new Date() && track.status !== 'published') {
    reasons.push('Publish time passed')
  }
  if ((track.likeCount || 0) >= 10 && track.status !== 'published') {
    reasons.push('Popular but not published')
  }

  return reasons
}

const buildDoc = (doc, userId) => {
  const obj = doc.toObject ? doc.toObject() : { ...doc }

  const likedBy = Array.isArray(obj.likedBy) ? obj.likedBy : []
  const downloadedBy = Array.isArray(obj.downloadedBy) ? obj.downloadedBy : []

  const liked = userId ? likedBy.some((id) => String(id) === String(userId)) : false
  const downloaded = userId ? downloadedBy.some((id) => String(id) === String(userId)) : false

  const health = getHealth(obj)
  const attention = getAttentionReasons(obj)

  delete obj.likedBy

  return {
    ...obj,
    liked,
    downloaded,
    likeCount: likedBy.length,
    downloadCount: downloadedBy.length,
    healthScore: health.score,
    healthTier: health.tier,
    needsAttention: attention.length > 0,
    attentionReasons: attention,
  }
}

const validateBase = ({ body, files, isCreate = false }) => {
  const errors = {}
  const status = String(body.status || 'draft').trim()

  if (!String(body.title || '').trim()) errors.title = 'Title is required'
  if (!String(body.artist || '').trim()) errors.artist = 'Artist is required'

  if (isCreate && status === 'published' && !files?.song?.[0]) {
    errors.song = 'Audio file is required'
  }

  return errors
}

const validatePublishable = (payload) => {
  const errors = {}

  if (!String(payload.title || '').trim()) errors.title = 'Title is required'
  if (!String(payload.artist || '').trim()) errors.artist = 'Artist is required'
  if (!String(payload.url || '').trim()) errors.song = 'Audio file is required'
  if (!String(payload.cover || '').trim()) errors.cover = 'Cover is required for publishing'
  if (!Array.isArray(payload.genre) || !payload.genre.length) errors.genre = 'At least one genre is required'
  if (!String(payload.visibility || '').trim()) errors.visibility = 'Visibility is required'

  return errors
}

const uploadToStorage = async ({ file, bucket, folder }) => {
  const key = makeFileKey(folder, file.originalname)
  return uploadBufferToBucket({
    bucket,
    key,
    buffer: file.buffer,
    contentType: file.mimetype,
  })
}

const ensureUniqueSlug = async (rawSlug, excludeId = null) => {
  const normalizedBase = slugify(rawSlug || 'track') || 'track'
  let candidate = normalizedBase
  let counter = 2

  while (true) {
    const existing = await Music.findOne({
      slug: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    }).select('_id')

    if (!existing) return candidate
    candidate = `${normalizedBase}-${counter++}`
  }
}

const buildPayload = async (body, existing = {}, excludeId = null) => {
  const title = body.title !== undefined ? String(body.title).trim() : existing.title
  const rawSlug = body.slug !== undefined ? String(body.slug).trim() : existing.slug || slugify(title)

  return {
    title,
    slug: await ensureUniqueSlug(rawSlug || title, excludeId),
    artist: body.artist !== undefined ? String(body.artist).trim() : existing.artist,
    author: body.author !== undefined ? String(body.author).trim() : existing.author,
    composer: body.composer !== undefined ? String(body.composer).trim() : existing.composer,
    producer: body.producer !== undefined ? String(body.producer).trim() : existing.producer,
    featuredArtists: body.featuredArtists !== undefined ? parseJsonField(body.featuredArtists) : existing.featuredArtists,
    album: body.album !== undefined ? String(body.album).trim() : existing.album,
    trackNumber: body.trackNumber !== undefined ? parseNum(body.trackNumber, 0) : existing.trackNumber,
    discNumber: body.discNumber !== undefined ? parseNum(body.discNumber, 0) : existing.discNumber,
    version: body.version !== undefined ? String(body.version).trim() : existing.version,
    genre: body.genre !== undefined ? parseJsonField(body.genre) : existing.genre,
    mood: body.mood !== undefined ? parseJsonField(body.mood) : existing.mood,
    tags: body.tags !== undefined ? parseJsonField(body.tags) : existing.tags,
    language: body.language !== undefined ? String(body.language).trim() : existing.language,
    lyricsLanguage: body.lyricsLanguage !== undefined ? String(body.lyricsLanguage).trim() : existing.lyricsLanguage,
    country: body.country !== undefined ? String(body.country).trim() : existing.country,
    releaseType: body.releaseType !== undefined ? sanitizeEnum(body.releaseType, ALLOWED_RELEASE_TYPES, 'single') : existing.releaseType,
    visibility: body.visibility !== undefined ? sanitizeEnum(body.visibility, ALLOWED_VISIBILITY, 'public') : existing.visibility,
    releaseDate: body.releaseDate !== undefined ? parseDate(body.releaseDate) : existing.releaseDate,
    publishAt: body.publishAt !== undefined ? parseDate(body.publishAt) : existing.publishAt,
    bio: body.bio !== undefined ? String(body.bio).trim() : existing.bio,
    artistBio: body.artistBio !== undefined ? String(body.artistBio).trim() : existing.artistBio,
    lyrics: body.lyrics !== undefined ? String(body.lyrics).trim() : existing.lyrics,
    syncedLyricsRaw: body.syncedLyricsRaw !== undefined ? String(body.syncedLyricsRaw).trim() : existing.syncedLyricsRaw,
    duration: body.duration !== undefined ? parseNum(body.duration, 0) : existing.duration,
    bpm: body.bpm !== undefined ? parseNum(body.bpm, 0) : existing.bpm,
    keySignature: body.keySignature !== undefined ? String(body.keySignature).trim() : existing.keySignature,
    isrc: body.isrc !== undefined ? String(body.isrc).trim() : existing.isrc,
    labelName: body.labelName !== undefined ? String(body.labelName).trim() : existing.labelName,
    copyright: body.copyright !== undefined ? String(body.copyright).trim() : existing.copyright,
    status: body.status !== undefined ? sanitizeEnum(body.status, ALLOWED_STATUS, 'draft') : existing.status,
    isExplicit: body.isExplicit !== undefined ? parseBool(body.isExplicit) : existing.isExplicit,
    isFeatured: body.isFeatured !== undefined ? parseBool(body.isFeatured) : existing.isFeatured,
    isRecommended: body.isRecommended !== undefined ? parseBool(body.isRecommended) : existing.isRecommended,
    isFreeDownload: body.isFreeDownload !== undefined ? parseBool(body.isFreeDownload) : existing.isFreeDownload,
    adminNote: body.adminNote !== undefined ? String(body.adminNote).trim() : existing.adminNote,
    externalLinks: body.externalLinks !== undefined ? parseObject(body.externalLinks, {}) : existing.externalLinks,
  }
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const tracks = await Music.find({
      status: 'published',
      visibility: { $in: ['public', 'unlisted'] },
    }).sort({ createdAt: -1 })

    res.json(tracks.map((t) => buildDoc(t, req.user?._id)))
  } catch (err) {
    console.error('[Music GET /]', err)
    res.status(500).json({ message: 'Failed to fetch tracks' })
  }
})

router.get('/admin/all', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const tracks = await Music.find().sort({ createdAt: -1 })
    res.json(tracks.map((t) => buildDoc(t, req.user?._id)))
  } catch (err) {
    console.error('[Music GET /admin/all]', err)
    res.status(500).json({ message: 'Failed to fetch admin tracks' })
  }
})

router.get('/admin/summary', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const tracks = await Music.find().sort({ createdAt: -1 })
    const docs = tracks.map((t) => buildDoc(t, req.user?._id))
    const attention = docs.filter((t) => t.needsAttention)
    const avgHealth = docs.length
      ? Math.round(docs.reduce((s, t) => s + (t.healthScore || 0), 0) / docs.length)
      : 0

    res.json({
      total: docs.length,
      published: docs.filter((t) => t.status === 'published').length,
      draft: docs.filter((t) => t.status === 'draft').length,
      archived: docs.filter((t) => t.status === 'archived').length,
      liked: docs.filter((t) => t.liked).length,
      downloaded: docs.filter((t) => t.downloaded).length,
      synced: docs.filter((t) => String(t.syncedLyricsRaw || '').trim()).length,
      avgHealth,
      attentionCount: attention.length,
      attention: attention.slice(0, 8),
    })
  } catch (err) {
    console.error('[Music GET /admin/summary]', err)
    res.status(500).json({ message: 'Failed to fetch summary' })
  }
})

router.get('/me/liked', authMiddleware, async (req, res) => {
  try {
    const tracks = await Music.find({ likedBy: req.user._id }).sort({ createdAt: -1 })
    res.json(tracks.map((t) => buildDoc(t, req.user?._id)))
  } catch (err) {
    console.error('[Music GET /me/liked]', err)
    res.status(500).json({ message: 'Failed to fetch liked tracks' })
  }
})

router.get('/me/downloaded/list', authMiddleware, async (req, res) => {
  try {
    const tracks = await Music.find({ downloadedBy: req.user._id }).sort({ updatedAt: -1 })
    res.json(tracks.map((t) => buildDoc(t, req.user?._id)))
  } catch (err) {
    console.error('[Music GET /me/downloaded/list]', err)
    res.status(500).json({ message: 'Failed to fetch downloaded tracks' })
  }
})

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const track = await Music.findById(req.params.id)
    if (!track) return res.status(404).json({ message: 'Track not found' })
    if (!canViewTrack(track, req.user)) return res.status(403).json({ message: 'Forbidden' })
    res.json(buildDoc(track, req.user?._id))
  } catch (err) {
    console.error('[Music GET /:id]', err)
    res.status(500).json({ message: 'Failed to fetch track' })
  }
})

router.post(
  '/',
  authMiddleware,
  adminMiddleware,
  upload.fields([{ name: 'cover', maxCount: 1 }, { name: 'song', maxCount: 1 }]),
  async (req, res) => {
    let uploadedCoverKey = ''
    let uploadedSongKey = ''

    try {
      const { body, files } = req
      const baseErrors = validateBase({ body, files, isCreate: true })

      if (Object.keys(baseErrors).length) {
        return res.status(400).json({ message: 'Validation failed', errors: baseErrors })
      }

      const payload = await buildPayload(body)

      let cover = String(body.coverUrl || '').trim()
      let url = ''

      if (files?.cover?.[0]) {
        const uploaded = await uploadToStorage({
          file: files.cover[0],
          bucket: COVERS_BUCKET,
          folder: 'covers',
        })
        cover = uploaded.url
        uploadedCoverKey = uploaded.path
      }

      if (files?.song?.[0]) {
        const uploaded = await uploadToStorage({
          file: files.song[0],
          bucket: SONGS_BUCKET,
          folder: 'songs',
        })
        url = uploaded.url
        uploadedSongKey = uploaded.path
      }

      const finalPayload = {
        ...payload,
        cover,
        coverStorageKey: uploadedCoverKey || '',
        url,
        audioStorageKey: uploadedSongKey || '',
      }

      if (finalPayload.status === 'published') {
        const publishErrors = validatePublishable(finalPayload)
        if (Object.keys(publishErrors).length) {
          if (uploadedCoverKey) await removeFromBucket({ bucket: COVERS_BUCKET, key: uploadedCoverKey }).catch(() => { })
          if (uploadedSongKey) await removeFromBucket({ bucket: SONGS_BUCKET, key: uploadedSongKey }).catch(() => { })
          return res.status(400).json({ message: 'Publish requirements not met', errors: publishErrors })
        }
      }

      const track = await Music.create(finalPayload)
      res.status(201).json(buildDoc(track, req.user?._id))
    } catch (err) {
      console.error('[Music POST]', err)
      if (uploadedCoverKey) await removeFromBucket({ bucket: COVERS_BUCKET, key: uploadedCoverKey }).catch(() => { })
      if (uploadedSongKey) await removeFromBucket({ bucket: SONGS_BUCKET, key: uploadedSongKey }).catch(() => { })
      res.status(500).json({ message: err.message || 'Failed to create track' })
    }
  }
)

router.put(
  '/:id',
  authMiddleware,
  adminMiddleware,
  upload.fields([{ name: 'cover', maxCount: 1 }, { name: 'song', maxCount: 1 }]),
  async (req, res) => {
    let newCoverKey = ''
    let newSongKey = ''

    try {
      const track = await Music.findById(req.params.id)
      if (!track) return res.status(404).json({ message: 'Track not found' })

      const oldCoverKey = track.coverStorageKey
      const oldAudioKey = track.audioStorageKey

      Object.assign(track, await buildPayload(req.body, track, track._id))

      if (req.files?.cover?.[0]) {
        const uploaded = await uploadToStorage({
          file: req.files.cover[0],
          bucket: COVERS_BUCKET,
          folder: 'covers',
        })
        track.cover = uploaded.url
        track.coverStorageKey = uploaded.path
        newCoverKey = uploaded.path
      } else if (req.body.coverUrl !== undefined) {
        const nextCoverUrl = String(req.body.coverUrl || '').trim()
        if (nextCoverUrl) {
          track.cover = nextCoverUrl
          if (oldCoverKey && !newCoverKey) track.coverStorageKey = ''
        }
      }

      if (req.files?.song?.[0]) {
        const uploaded = await uploadToStorage({
          file: req.files.song[0],
          bucket: SONGS_BUCKET,
          folder: 'songs',
        })
        track.url = uploaded.url
        track.audioStorageKey = uploaded.path
        newSongKey = uploaded.path
      }

      if (track.status === 'published') {
        const publishErrors = validatePublishable(track)
        if (Object.keys(publishErrors).length) {
          if (newCoverKey) await removeFromBucket({ bucket: COVERS_BUCKET, key: newCoverKey }).catch(() => { })
          if (newSongKey) await removeFromBucket({ bucket: SONGS_BUCKET, key: newSongKey }).catch(() => { })
          return res.status(400).json({ message: 'Publish requirements not met', errors: publishErrors })
        }
      }

      await track.save()

      if (newCoverKey && oldCoverKey) {
        await removeFromBucket({ bucket: COVERS_BUCKET, key: oldCoverKey }).catch(() => { })
      }
      if (newSongKey && oldAudioKey) {
        await removeFromBucket({ bucket: SONGS_BUCKET, key: oldAudioKey }).catch(() => { })
      }

      res.json(buildDoc(track, req.user?._id))
    } catch (err) {
      console.error('[Music PUT]', err)
      if (newCoverKey) await removeFromBucket({ bucket: COVERS_BUCKET, key: newCoverKey }).catch(() => { })
      if (newSongKey) await removeFromBucket({ bucket: SONGS_BUCKET, key: newSongKey }).catch(() => { })
      res.status(500).json({ message: err.message || 'Failed to update track' })
    }
  }
)

router.patch('/:id/archive', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const track = await Music.findById(req.params.id)
    if (!track) return res.status(404).json({ message: 'Track not found' })
    track.status = 'archived'
    await track.save()
    res.json(buildDoc(track, req.user?._id))
  } catch (err) {
    console.error('[Music PATCH /archive]', err)
    res.status(500).json({ message: 'Failed to archive track' })
  }
})

router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const track = await Music.findById(req.params.id)
    if (!track) return res.status(404).json({ message: 'Track not found' })

    const coverKey = track.coverStorageKey
    const audioKey = track.audioStorageKey
    const trackId = track._id

    await Playlist.updateMany(
      { tracks: trackId },
      { $pull: { tracks: trackId } }
    )

    await track.deleteOne()

    if (coverKey) {
      await removeFromBucket({ bucket: COVERS_BUCKET, key: coverKey }).catch(() => { })
    }

    if (audioKey) {
      await removeFromBucket({ bucket: SONGS_BUCKET, key: audioKey }).catch(() => { })
    }

    res.json({ ok: true, message: 'Track deleted successfully', id: req.params.id })
  } catch (err) {
    console.error('[Music DELETE /:id]', err)
    res.status(500).json({ message: 'Failed to delete track' })
  }
})

router.post('/:id/clone', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const source = await Music.findById(req.params.id)
    if (!source) return res.status(404).json({ message: 'Track not found' })

    const raw = source.toObject()
    delete raw._id
    delete raw.createdAt
    delete raw.updatedAt
    delete raw.likedBy
    delete raw.downloadedBy
    delete raw.likeCount
    delete raw.playCount
    delete raw.downloadCount

    raw.title = `${source.title} Copy`
    raw.slug = await ensureUniqueSlug(`${source.slug || slugify(source.title)}-copy`)
    raw.status = 'draft'

    const cloned = await Music.create(raw)
    res.status(201).json(buildDoc(cloned, req.user?._id))
  } catch (err) {
    console.error('[Music POST /clone]', err)
    res.status(500).json({ message: 'Failed to clone track' })
  }
})

router.patch('/:id/like', authMiddleware, async (req, res) => {
  try {
    const track = await Music.findById(req.params.id)
    if (!track) return res.status(404).json({ message: 'Track not found' })
    if (!canViewTrack(track, req.user)) return res.status(403).json({ message: 'Forbidden' })

    const userId = String(req.user._id)
    const likedBy = Array.isArray(track.likedBy) ? track.likedBy : []
    const idx = likedBy.findIndex((id) => String(id) === userId)

    if (idx === -1) track.likedBy.push(req.user._id)
    else track.likedBy.splice(idx, 1)

    track.likeCount = track.likedBy.length
    await track.save()

    res.json(buildDoc(track, req.user?._id))
  } catch (err) {
    console.error('[Music PATCH /like]', err)
    res.status(500).json({ message: 'Failed to toggle like' })
  }
})

router.patch('/:id/download', authMiddleware, async (req, res) => {
  try {
    const track = await Music.findById(req.params.id)
    if (!track) return res.status(404).json({ message: 'Track not found' })
    if (!canViewTrack(track, req.user)) return res.status(403).json({ message: 'Forbidden' })

    const userId = String(req.user._id)
    const downloadedBy = Array.isArray(track.downloadedBy) ? track.downloadedBy : []
    const idx = downloadedBy.findIndex((id) => String(id) === userId)

    if (idx === -1) track.downloadedBy.push(req.user._id)
    else track.downloadedBy.splice(idx, 1)

    track.downloadCount = track.downloadedBy.length
    await track.save()

    res.json(buildDoc(track, req.user?._id))
  } catch (err) {
    console.error('[Music PATCH /download]', err)
    res.status(500).json({ message: 'Failed to toggle download' })
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
    console.error('[Music PATCH /play]', err)
    res.status(500).json({ message: 'Failed to track play' })
  }
})

module.exports = router