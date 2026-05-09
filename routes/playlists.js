const express = require('express')
const mongoose = require('mongoose')
const router = express.Router()

const Playlist = require('../models/playlist-temp')
const Music = require('../models/music-temp')
const { authMiddleware } = require('../middleware/auth')

const normalizeString = (value = '') => String(value || '').trim()

const serializePlaylist = (playlist) => ({
  ...playlist.toObject(),
  count: playlist.tracks?.length || 0,
})

const isValidId = (id) => mongoose.Types.ObjectId.isValid(String(id || ''))

router.get('/', authMiddleware, async (req, res) => {
  try {
    const playlists = await Playlist.find({ owner: req.user._id })
      .populate('tracks')
      .sort({ isPinned: -1, createdAt: -1 })

    res.json(playlists.map(serializePlaylist))
  } catch (err) {
    res.status(500).json({
      message: 'Failed to fetch playlists',
      error: err.message,
    })
  }
})

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid playlist id' })
    }

    const playlist = await Playlist.findOne({
      _id: req.params.id,
      owner: req.user._id,
    }).populate('tracks')

    if (!playlist) {
      return res.status(404).json({ message: 'Playlist not found' })
    }

    res.json(serializePlaylist(playlist))
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

    const cleanName = normalizeString(name)
    if (!cleanName || cleanName.length < 2) {
      return res.status(400).json({ message: 'Playlist name must be at least 2 characters' })
    }

    const playlist = await Playlist.create({
      name: cleanName,
      description: normalizeString(description),
      color: normalizeString(color) || 'linear-gradient(135deg,#0ea5e9,#2563eb)',
      cover: normalizeString(cover),
      owner: req.user._id,
      tracks: [],
    })

    res.status(201).json(serializePlaylist(playlist))
  } catch (err) {
    res.status(500).json({
      message: 'Failed to create playlist',
      error: err.message,
    })
  }
})

router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid playlist id' })
    }

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

    res.json(serializePlaylist(playlist))
  } catch (err) {
    res.status(500).json({
      message: 'Failed to update playlist',
      error: err.message,
    })
  }
})

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid playlist id' })
    }

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
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid playlist id' })
    }

    const musicId = req.body.musicId || req.body.trackId

    if (!musicId || !isValidId(musicId)) {
      return res.status(400).json({ message: 'Valid musicId is required' })
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

    const exists = playlist.tracks.some((id) => String(id) === String(musicId))
    if (!exists) {
      playlist.tracks.push(musicId)
      await playlist.save()
    }

    await playlist.populate('tracks')

    res.json(serializePlaylist(playlist))
  } catch (err) {
    res.status(500).json({
      message: 'Failed to add track to playlist',
      error: err.message,
    })
  }
})

router.delete('/:id/tracks/:musicId', authMiddleware, async (req, res) => {
  try {
    if (!isValidId(req.params.id) || !isValidId(req.params.musicId)) {
      return res.status(400).json({ message: 'Invalid id' })
    }

    const playlist = await Playlist.findOne({
      _id: req.params.id,
      owner: req.user._id,
    })

    if (!playlist) {
      return res.status(404).json({ message: 'Playlist not found' })
    }

    playlist.tracks = playlist.tracks.filter(
      (trackId) => String(trackId) !== String(req.params.musicId)
    )

    await playlist.save()
    await playlist.populate('tracks')

    res.json(serializePlaylist(playlist))
  } catch (err) {
    res.status(500).json({
      message: 'Failed to remove track from playlist',
      error: err.message,
    })
  }
})

module.exports = router