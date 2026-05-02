require('dotenv').config()

const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const path = require('path')
const fs = require('fs')
const passport = require('./utils/googleAuth')
const { verifyMailConnection } = require('./utils/sendEmail')

const authRouter = require('./routes/auth')
const musicRouter = require('./routes/music')
const playlistsRouter = require('./routes/playlists')

const app = express()
const PORT = process.env.PORT || 5000

// ── CORS ────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:7777',
  'http://localhost:3000',
  // Add your Netlify/Vercel frontend URL here too
].filter(Boolean)

// ── Upload directories ───────────────────────────────────────
// On Render free tier: use /tmp for uploads (persists during session)
// On paid Render: set DATA_ROOT to a persistent disk path like /var/data
// Locally: defaults to ./uploads
const DATA_ROOT = process.env.DATA_ROOT || path.join(__dirname, 'uploads')
const coversPath = path.join(DATA_ROOT, 'covers')
const songsPath = path.join(DATA_ROOT, 'songs')

fs.mkdirSync(coversPath, { recursive: true })
fs.mkdirSync(songsPath, { recursive: true })

console.log(`[Storage] DATA_ROOT: ${DATA_ROOT}`)
console.log(`[Storage] covers: ${coversPath}`)
console.log(`[Storage] songs: ${songsPath}`)

// ── Middleware ───────────────────────────────────────────────
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true)
      if (allowedOrigins.includes(origin)) return callback(null, true)
      console.warn(`[CORS] Blocked: ${origin}`)
      return callback(new Error(`CORS blocked for origin: ${origin}`))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Content-Type'],
  })
)

app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))
app.use(cookieParser())
app.use(passport.initialize())

// ── Static file serving ──────────────────────────────────────
// These MUST match the paths stored in the database
// DB stores: /uploads/covers/filename.jpg
// So we serve /uploads/covers -> coversPath directory
app.use('/uploads/covers', express.static(coversPath, {
  setHeaders(res) {
    res.set('Cache-Control', 'public, max-age=31536000')
    res.set('Access-Control-Allow-Origin', '*')
  }
}))
app.use('/uploads/songs', express.static(songsPath, {
  setHeaders(res) {
    res.set('Cache-Control', 'public, max-age=31536000')
    res.set('Access-Control-Allow-Origin', '*')
  }
}))

// ── Health check ─────────────────────────────────────────────
app.get('/', (req, res) => res.status(200).json({ message: 'Backend is running', dataRoot: DATA_ROOT }))

app.get('/api/health', (req, res) =>
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString(), dataRoot: DATA_ROOT })
)

// ── Debug: list uploaded covers (remove in production) ───────
app.get('/api/debug/covers', (req, res) => {
  try {
    const files = fs.readdirSync(coversPath)
    res.json({ count: files.length, files: files.slice(0, 20), coversPath })
  } catch (err) {
    res.json({ error: err.message, coversPath })
  }
})

// ── Routes ───────────────────────────────────────────────────
app.use('/api/auth', authRouter)
app.use('/api/music', musicRouter)
app.use('/api/playlists', playlistsRouter)

// ── 404 & Error handler ──────────────────────────────────────
app.use((req, res) => res.status(404).json({ message: `Route ${req.method} ${req.path} not found` }))

app.use((err, req, res, next) => {
  console.error('Server error:', err)
  res.status(500).json({ message: err.message || 'Internal server error' })
})

// ── Start ────────────────────────────────────────────────────
async function startServer() {
  try {
    const MONGODB_URI = process.env.MONGODB_URI
    if (!MONGODB_URI) throw new Error('MONGODB_URI is missing')

    await mongoose.connect(MONGODB_URI)
    console.log('[DB] MongoDB connected')

    try { await verifyMailConnection() } catch (e) { console.warn('[Mail] Non-fatal:', e.message) }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[Server] Running on port ${PORT}`)
      console.log(`[Server] Allowed origins: ${allowedOrigins.join(', ')}`)
    })
  } catch (err) {
    console.error('[Startup] Error:', err.message)
    process.exit(1)
  }
}

startServer()
module.exports = app