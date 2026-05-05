const multer = require('multer')

const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
const AUDIO_MIMES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/flac',
]

const storage = multer.memoryStorage()

function fileFilter(req, file, cb) {
  if (file.fieldname === 'cover') {
    if (!IMAGE_MIMES.includes(file.mimetype)) {
      return cb(new Error('Only PNG, JPG, JPEG, WEBP allowed for cover'))
    }
    return cb(null, true)
  }

  if (file.fieldname === 'song') {
    if (!AUDIO_MIMES.includes(file.mimetype)) {
      return cb(new Error('Only MP3, WAV, M4A, AAC, FLAC allowed for audio'))
    }
    return cb(null, true)
  }

  return cb(new Error(`Unexpected field: ${file.fieldname}`))
}

module.exports = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 120 * 1024 * 1024,
    files: 2,
  },
})