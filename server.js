require('dotenv').config()

const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const path = require('path')
const fs = require('fs')
const { verifyMailConnection } = require('./utils/sendEmail')

const authRouter = require('./routes/auth')
const musicRouter = require('./routes/music')
const playlistsRouter = require('./routes/playlists')

const app = express()
const PORT = process.env.PORT || 5000

// Google passport — ixtiyoriy, yo'q bo'lsa server ishlab turadi
let passport = null
try {
  passport = require('./utils/googleAuth')
} catch (e) {
  console.warn('[Google Auth] Disabled:', e.message)
}

const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.CLIENT_URL_2,
  process.env.CLIENT_URL_3,
  'http://localhost:5173',
  'http://localhost:7777',
  'http://localhost:3000',
  'https://exclusivemusics.netlify.app',
  'https://exclusivemusics.com',
  'https://www.exclusivemusics.com',
].filter(Boolean)

const DATA_ROOT =
  process.env.DATA_ROOT ||
  (process.env.NODE_ENV === 'production'
    ? '/tmp/musicapp-uploads'
    : path.join(__dirname, 'uploads'))

const coversPath = path.join(DATA_ROOT, 'covers')
const songsPath = path.join(DATA_ROOT, 'songs')

fs.mkdirSync(coversPath, { recursive: true })
fs.mkdirSync(songsPath, { recursive: true })

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
    console.warn('[CORS] Blocked origin:', origin)
    return callback(new Error(`CORS blocked for origin: ${origin}`))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Content-Type'],
}

app.use(cors(corsOptions))
app.options(/.*/, cors(corsOptions))

app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))
app.use(cookieParser())

if (passport) {
  app.use(passport.initialize())
}

app.use(
  '/uploads/covers',
  express.static(coversPath, {
    setHeaders(res) {
      res.setHeader('Cache-Control', 'public, max-age=31536000')
      res.setHeader('Access-Control-Allow-Origin', '*')
    },
  })
)

app.use(
  '/uploads/songs',
  express.static(songsPath, {
    setHeaders(res) {
      res.setHeader('Cache-Control', 'public, max-age=31536000')
      res.setHeader('Access-Control-Allow-Origin', '*')
    },
  })
)

app.get('/', (req, res) => {
  res.status(200).json({ message: 'Backend is running', dataRoot: DATA_ROOT })
})

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    dataRoot: DATA_ROOT,
    allowedOrigins,
    nodeEnv: process.env.NODE_ENV,
    googleAuth: !!passport,
  })
})

app.use('/api/auth', authRouter)
app.use('/api/music', musicRouter)
app.use('/api/playlists', playlistsRouter)

app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.path} not found` })
})

app.use((err, req, res, next) => {
  console.error('[Server Error]', err.stack || err)
  if (String(err.message || '').startsWith('CORS blocked for origin:')) {
    return res.status(403).json({ message: err.message })
  }
  return res.status(500).json({ message: err.message || 'Internal server error' })
})

async function startServer() {
  try {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is missing')

    await mongoose.connect(process.env.MONGODB_URI)
    console.log('[DB] MongoDB connected')

    try {
      await verifyMailConnection()
    } catch (e) {
      console.warn('[Mail] Non-fatal:', e.message)
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[Server] Running on port ${PORT}`)
      console.log('[Server] Allowed origins:', allowedOrigins)
      console.log('[Server] DATA_ROOT:', DATA_ROOT)
    })
  } catch (err) {
    console.error('[Startup] Error:', err.message)
    process.exit(1)
  }
}

startServer()

module.exports = app