const multer = require('multer')
const path = require('path')
const { coversDir, songsDir } = require('../config/storage')

const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
const AUDIO_MIMES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
]

const storage = multer.diskStorage({
  destination(req, file, cb) {
    if (file.fieldname === 'cover') return cb(null, coversDir)
    if (file.fieldname === 'song') return cb(null, songsDir)
    return cb(new Error('Invalid field name'))
  },

  filename(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase()

    const safeName = path
      .basename(file.originalname || 'file', ext)
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase()

    cb(null, `${Date.now()}-${safeName || 'file'}${ext}`)
  },
})

function fileFilter(req, file, cb) {
  if (file.fieldname === 'cover') {
    if (!IMAGE_MIMES.includes(file.mimetype)) {
      return cb(new Error('Only PNG, JPG, JPEG, WEBP allowed for cover'))
    }
  }

  if (file.fieldname === 'song') {
    if (!AUDIO_MIMES.includes(file.mimetype)) {
      return cb(new Error('Only MP3, WAV, M4A allowed for audio'))
    }
  }

  cb(null, true)
}

module.exports = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
})