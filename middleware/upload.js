const multer = require('multer')

const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
const AUDIO_MIMES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
]

const storage = multer.memoryStorage()

function fileFilter(req, file, cb) {
  if (file.fieldname === 'cover' && !IMAGE_MIMES.includes(file.mimetype)) {
    return cb(new Error('Only PNG, JPG, JPEG, WEBP allowed for cover'))
  }

  if (file.fieldname === 'song' && !AUDIO_MIMES.includes(file.mimetype)) {
    return cb(new Error('Only MP3, WAV, M4A allowed for audio'))
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