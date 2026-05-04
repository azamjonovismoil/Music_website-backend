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

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp']
const AUDIO_EXTS = ['.mp3', '.wav', '.m4a']

const sanitizeBaseName = (filename = 'file') => {
  const ext = path.extname(filename)
  return (
    path
      .basename(filename, ext)
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase() || 'file'
  )
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    try {
      if (file.fieldname === 'cover') return cb(null, coversDir)
      if (file.fieldname === 'song') return cb(null, songsDir)
      return cb(new Error('Invalid field name'))
    } catch (err) {
      return cb(err)
    }
  },

  filename(req, file, cb) {
    try {
      const ext = path.extname(file.originalname || '').toLowerCase()
      const safeName = sanitizeBaseName(file.originalname || 'file')
      cb(null, `${Date.now()}-${safeName}${ext}`)
    } catch (err) {
      cb(err)
    }
  },
})

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase()

  if (file.fieldname === 'cover') {
    if (!IMAGE_MIMES.includes(file.mimetype) || !IMAGE_EXTS.includes(ext)) {
      return cb(new Error('Only PNG, JPG, JPEG, WEBP allowed for cover'))
    }
  }

  if (file.fieldname === 'song') {
    if (!AUDIO_MIMES.includes(file.mimetype) || !AUDIO_EXTS.includes(ext)) {
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
    files: 2,
  },
})