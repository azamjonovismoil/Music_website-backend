require('dotenv').config()

const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const path = require('path')
const passport = require('./utils/googleAuth')
const { verifyMailConnection } = require('./utils/sendEmail')

const authRouter = require('./routes/auth')
const musicRouter = require('./routes/music')
const playlistsRouter = require('./routes/playlists')

const app = express()
const PORT = process.env.PORT || 5000

const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:7777',
].filter(Boolean)

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true)
      if (allowedOrigins.includes(origin)) return callback(null, true)
      return callback(new Error(`CORS blocked for origin: ${origin}`))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)

app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))
app.use(cookieParser())

app.use(passport.initialize())

app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Backend is running',
  })
})

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  })
})

app.use('/api/auth', authRouter)
app.use('/api/music', musicRouter)
app.use('/api/playlists', playlistsRouter)

app.use((req, res) => {
  res.status(404).json({
    message: `Route ${req.method} ${req.path} not found`,
  })
})

app.use((err, req, res, next) => {
  console.error('Server error:', err)
  res.status(500).json({
    message: err.message || 'Internal server error',
  })
})

async function startServer() {
  try {
    const MONGODB_URI = process.env.MONGODB_URI
    if (!MONGODB_URI) throw new Error('MONGODB_URI is missing')

    await mongoose.connect(MONGODB_URI)
    console.log('MongoDB connected')

    try {
      await verifyMailConnection()
    } catch (mailErr) {
      console.warn('Mail connection failed (non-fatal):', mailErr.message)
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`)
    })
  } catch (err) {
    console.error('Startup error:', err.message)
    process.exit(1)
  }
}

startServer()

module.exports = app