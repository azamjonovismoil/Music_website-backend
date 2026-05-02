const multer = require('multer')
const path = require('path')
const fs = require('fs')

const DATA_ROOT =
  process.env.DATA_ROOT ||
  (process.env.NODE_ENV === 'production'
    ? '/tmp/musicapp-uploads'
    : path.join(__dirname, '..', 'uploads'))

const coversDir = path.join(DATA_ROOT, 'covers')
const songsDir = path.join(DATA_ROOT, 'songs')

fs.mkdirSync(coversDir, { recursive: true })
fs.mkdirSync(songsDir, { recursive: true })

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

const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'cover') {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Only PNG, JPG, JPEG, WEBP allowed for cover'))
    }
  }

  if (file.fieldname === 'song') {
    const allowed = [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/x-wav',
      'audio/mp4',
      'audio/x-m4a',
    ]
    if (!allowed.includes(file.mimetype)) {
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