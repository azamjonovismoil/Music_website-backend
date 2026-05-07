const express = require('express')
const axios = require('axios')
const FormData = require('form-data')
const upload = require('../middleware/upload')
const { authMiddleware, adminMiddleware } = require('../middleware/auth')

const router = express.Router()

const SYNC_SERVICE_URL = String(process.env.SYNC_SERVICE_URL || '').replace(/\/+$/, '')

if (!SYNC_SERVICE_URL) {
  console.warn('[Tools] SYNC_SERVICE_URL is missing')
}

router.post(
  '/transcribe-lyrics',
  authMiddleware,
  adminMiddleware,
  upload.fields([{ name: 'song', maxCount: 1 }]),
  async (req, res) => {
    try {
      if (!SYNC_SERVICE_URL) {
        return res.status(500).json({ message: 'Sync service is not configured' })
      }

      const song = req.files?.song?.[0]
      if (!song) {
        return res.status(400).json({ message: 'Audio file is required' })
      }

      const fd = new FormData()
      fd.append('audio', song.buffer, {
        filename: song.originalname,
        contentType: song.mimetype,
      })
      fd.append('model_size', 'small')

      const { data } = await axios.post(`${SYNC_SERVICE_URL}/transcribe`, fd, {
        headers: fd.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 1000 * 60 * 10,
      })

      return res.json(data)
    } catch (err) {
      console.error('[Tools POST /transcribe-lyrics]', err.response?.data || err.message || err)
      return res.status(500).json({
        message: err.response?.data?.detail || err.message || 'Failed to transcribe lyrics',
      })
    }
  }
)

router.post(
  '/sync-lyrics',
  authMiddleware,
  adminMiddleware,
  upload.fields([{ name: 'song', maxCount: 1 }]),
  async (req, res) => {
    try {
      if (!SYNC_SERVICE_URL) {
        return res.status(500).json({ message: 'Sync service is not configured' })
      }

      const song = req.files?.song?.[0]
      const lyrics = String(req.body.lyrics || '').trim()

      if (!song) {
        return res.status(400).json({ message: 'Audio file is required' })
      }

      if (!lyrics) {
        return res.status(400).json({ message: 'Lyrics text is required' })
      }

      const fd = new FormData()
      fd.append('audio', song.buffer, {
        filename: song.originalname,
        contentType: song.mimetype,
      })
      fd.append('lyrics', lyrics)
      fd.append('model_size', 'small')

      const { data } = await axios.post(`${SYNC_SERVICE_URL}/sync`, fd, {
        headers: fd.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 1000 * 60 * 10,
      })

      return res.json(data)
    } catch (err) {
      console.error('[Tools POST /sync-lyrics]', err.response?.data || err.message || err)
      return res.status(500).json({
        message: err.response?.data?.detail || err.message || 'Failed to sync lyrics',
      })
    }
  }
)

module.exports = router