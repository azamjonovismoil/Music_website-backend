require('dotenv').config()

const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const multer = require('multer')
const { verifyMailConnection } = require('./utils/sendEmail')

const authRouter = require('./routes/auth')
const musicRouter = require('./routes/music')
const playlistsRouter = require('./routes/playlists')
const toolsRouter = require('./routes/tools')

const app = express()
const PORT = process.env.PORT || 5000

app.set('trust proxy', 1)

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

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
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

app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Backend is running',
    storage: 'supabase',
  })
})

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV,
    allowedOrigins,
    googleAuth: Boolean(passport),
    storage: 'supabase',
    syncService: Boolean(process.env.SYNC_SERVICE_URL),
  })
})

app.use('/api/auth', authRouter)
app.use('/api/music', musicRouter)
app.use('/api/playlists', playlistsRouter)
app.use('/api/tools', toolsRouter)

app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.path} not found` })
})

app.use((err, req, res, next) => {
  console.error('[Server Error]', err.stack || err)

  if (String(err.message || '').startsWith('CORS blocked for origin:')) {
    return res.status(403).json({ message: err.message })
  }

  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      message: err.message || 'Upload failed',
    })
  }

  return res.status(400).json({
    message: err.message || 'Internal server error',
  })
})

async function startServer() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is missing')
    }

    if (!process.env.SUPABASE_URL) {
      throw new Error('SUPABASE_URL is missing')
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing')
    }

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
      console.log('[Server] Storage: Supabase')
      console.log('[Server] Tools router: /api/tools')
    })
  } catch (err) {
    console.error('[Startup] Error:', err.message)
    process.exit(1)
  }
}

startServer()

module.exports = app