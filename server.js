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
const PORT = Number(process.env.PORT || 5000)
const NODE_ENV = String(process.env.NODE_ENV || 'development').trim()

app.set('trust proxy', 1)

let passport = null
try {
  passport = require('./utils/googleAuth')
} catch (e) {
  console.warn('[Google Auth] Disabled:', e.message)
}

const cleanUrl = (value = '') =>
  String(value || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/\/+$/, '')

const baseAllowedOrigins = [
  cleanUrl(process.env.CLIENT_URL),
  cleanUrl(process.env.CLIENT_URL_2),
  cleanUrl(process.env.CLIENT_URL_3),
  'http://localhost:5173',
  'http://localhost:7777',
  'http://localhost:3000',
  'https://exclusivemusics.vercel.app',
  'https://exclusivemusics.netlify.app',
  'https://exclusivemusics.com',
  'https://www.exclusivemusics.com',
].filter(Boolean)

const allowedOrigins = [...new Set(baseAllowedOrigins)]

const vercelPreviewRegex =
  /^https:\/\/music-website-[a-z0-9-]+-azamjonovismoils-projects\.vercel\.app$/

const isOriginAllowed = (origin) => {
  if (!origin) return true
  if (allowedOrigins.includes(origin)) return true
  if (vercelPreviewRegex.test(origin)) return true
  return false
}

const corsOptionsDelegate = (req, callback) => {
  const requestOrigin = req.header('Origin')

  if (isOriginAllowed(requestOrigin)) {
    return callback(null, {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
      exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Content-Type'],
      optionsSuccessStatus: 204,
    })
  }

  return callback(new Error(`CORS blocked for origin: ${requestOrigin || 'unknown'}`))
}

app.use(cors(corsOptionsDelegate))
app.options(/.*/, cors(corsOptionsDelegate))

app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))
app.use(cookieParser())

if (passport) {
  app.use(passport.initialize())
}

app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Backend is running',
    environment: NODE_ENV,
    storage: 'supabase',
  })
})

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    nodeEnv: NODE_ENV,
    requestOrigin: req.header('Origin') || null,
    originAllowed: isOriginAllowed(req.header('Origin')),
    allowedOrigins,
    googleAuth: Boolean(passport),
    storage: 'supabase',
    syncService: Boolean(process.env.SYNC_SERVICE_URL),
    trustProxy: true,
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

  return res.status(500).json({
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
      console.log('[Server] Environment:', NODE_ENV)
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