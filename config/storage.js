const path = require('path')
const fs = require('fs')

const isProd = process.env.NODE_ENV === 'production'

const DATA_ROOT =
  process.env.DATA_ROOT ||
  (isProd
    ? '/tmp/musicapp-uploads'
    : path.join(__dirname, '..', 'uploads'))

const coversDir = path.join(DATA_ROOT, 'covers')
const songsDir = path.join(DATA_ROOT, 'songs')

fs.mkdirSync(coversDir, { recursive: true })
fs.mkdirSync(songsDir, { recursive: true })

function stripUploadsPrefix(value = '') {
  return String(value || '')
    .replace(/^\/+/, '')
    .replace(/^uploads\/+/, '')
}

function toStoredUrl(type, filename) {
  if (!filename) return ''
  return `/uploads/${type}/${filename}`
}

function toAbsolutePath(storedUrl = '') {
  const clean = stripUploadsPrefix(storedUrl)
  return path.join(DATA_ROOT, clean)
}

module.exports = {
  DATA_ROOT,
  coversDir,
  songsDir,
  stripUploadsPrefix,
  toStoredUrl,
  toAbsolutePath,
}