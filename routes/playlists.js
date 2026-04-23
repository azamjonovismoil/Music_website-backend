const express = require('express')
const router = express.Router()

const Playlist = require('../models/Playlist')
const Music = require('../models/Music')
const { authMiddleware } = require('../middleware/auth')

const normalizeString = (value = '') => String(value).trim()

router.get('/', authMiddleware, async (req, res) => {
  try {
    const playlists = await Playlist.find({ owner: req.user._id })
      .populate('tracks')
      .sort({ createdAt: -1 })

    const result = playlists.map((playlist) => ({
      ...playlist.toObject(),
      count: playlist.tracks?.length || 0,
    }))

    res.json(result)
  } catch (err) {
    res.status(500).json({
      message: 'Failed to fetch playlists',
      error: err.message,
    })
  }
})

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const playlist = await Playlist.findOne({
      _id: req.params.id,
      owner: req.user._id,
    }).populate('tracks')

    if (!playlist) {
      return res.status(404).json({ message: 'Playlist not found' })
    }

    res.json({
      ...playlist.toObject(),
      count: playlist.tracks?.length || 0,
    })
  } catch (err) {
    res.status(500).json({
      message: 'Failed to fetch playlist',
      error: err.message,
    })
  }
})

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, description, color, cover } = req.body

    if (!normalizeString(name) || normalizeString(name).length < 2) {
      return res.status(400).json({ message: 'Playlist name must be at least 2 characters' })
    }

    const playlist = await Playlist.create({
      name: normalizeString(name),
      description: normalizeString(description),
      color: normalizeString(color) || 'linear-gradient(135deg,#0ea5e9,#2563eb)',
      cover: normalizeString(cover),
      owner: req.user._id,
      tracks: [],
    })

    res.status(201).json({
      ...playlist.toObject(),
      count: 0,
    })
  } catch (err) {
    res.status(500).json({
      message: 'Failed to create playlist',
      error: err.message,
    })
  }
})

router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const playlist = await Playlist.findOne({
      _id: req.params.id,
      owner: req.user._id,
    })

    if (!playlist) {
      return res.status(404).json({ message: 'Playlist not found' })
    }

    const { name, description, color, cover, isPinned } = req.body

    if (name !== undefined) {
      const nextName = normalizeString(name)
      if (nextName.length < 2) {
        return res.status(400).json({ message: 'Playlist name must be at least 2 characters' })
      }
      playlist.name = nextName
    }

    if (description !== undefined) playlist.description = normalizeString(description)
    if (color !== undefined) playlist.color = normalizeString(color)
    if (cover !== undefined) playlist.cover = normalizeString(cover)
    if (isPinned !== undefined) playlist.isPinned = Boolean(isPinned)

    await playlist.save()
    await playlist.populate('tracks')

    res.json({
      ...playlist.toObject(),
      count: playlist.tracks?.length || 0,
    })
  } catch (err) {
    res.status(500).json({
      message: 'Failed to update playlist',
      error: err.message,
    })
  }
})

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const playlist = await Playlist.findOneAndDelete({
      _id: req.params.id,
      owner: req.user._id,
    })

    if (!playlist) {
      return res.status(404).json({ message: 'Playlist not found' })
    }

    res.json({ message: 'Playlist deleted successfully' })
  } catch (err) {
    res.status(500).json({
      message: 'Failed to delete playlist',
      error: err.message,
    })
  }
})

router.post('/:id/tracks', authMiddleware, async (req, res) => {
  try {
    const { musicId } = req.body

    if (!musicId) {
      return res.status(400).json({ message: 'musicId is required' })
    }

    const playlist = await Playlist.findOne({
      _id: req.params.id,
      owner: req.user._id,
    })

    if (!playlist) {
      return res.status(404).json({ message: 'Playlist not found' })
    }

    const music = await Music.findById(musicId)
    if (!music) {
      return res.status(404).json({ message: 'Music not found' })
    }

    const exists = playlist.tracks.some((id) => id.toString() === musicId)
    if (!exists) {
      playlist.tracks.push(musicId)
      await playlist.save()
    }

    await playlist.populate('tracks')

    res.json({
      ...playlist.toObject(),
      count: playlist.tracks?.length || 0,
    })
  } catch (err) {
    res.status(500).json({
      message: 'Failed to add track to playlist',
      error: err.message,
    })
  }
})

router.delete('/:id/tracks/:musicId', authMiddleware, async (req, res) => {
  try {
    const playlist = await Playlist.findOne({
      _id: req.params.id,
      owner: req.user._id,
    })

    if (!playlist) {
      return res.status(404).json({ message: 'Playlist not found' })
    }

    playlist.tracks = playlist.tracks.filter(
      (trackId) => trackId.toString() !== req.params.musicId
    )

    await playlist.save()
    await playlist.populate('tracks')

    res.json({
      ...playlist.toObject(),
      count: playlist.tracks?.length || 0,
    })
  } catch (err) {
    res.status(500).json({
      message: 'Failed to remove track from playlist',
      error: err.message,
    })
  }
})

module.exports = router