const multer = require('multer')
const path = require('path')
const fs = require('fs')

const BASE_DIR = path.join(__dirname, '..')
const coversDir = path.join(BASE_DIR, 'uploads', 'covers')
const songsDir = path.join(BASE_DIR, 'uploads', 'songs')

fs.existsSync(coversDir) || fs.mkdirSync(coversDir, { recursive: true })
fs.existsSync(songsDir) || fs.mkdirSync(songsDir, { recursive: true })

const storage = multer.diskStorage({
  destination(req, file, cb) {
    if (file.fieldname === 'cover') return cb(null, coversDir)
    if (file.fieldname === 'song') return cb(null, songsDir)
    cb(new Error('Invalid field name'))
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase()
    const safeName = path
      .basename(file.originalname || 'file', ext)
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .replace(/_+/g, '_')
      .toLowerCase()

    cb(null, `${Date.now()}-${safeName}${ext}`)
  }
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
      'audio/x-m4a'
    ]
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Only MP3, WAV, M4A allowed for audio'))
    }
  }

  cb(null, true)
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024
  }
})

module.exports = upload