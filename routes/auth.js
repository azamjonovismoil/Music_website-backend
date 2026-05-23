const express = require('express')
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const { authMiddleware, COOKIE_NAME } = require('../middleware/auth')

const router = express.Router()

const cleanUrl = (value = '') =>
  String(value || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/\/+$/, '')

const JWT_SECRET = String(process.env.JWT_SECRET || '').trim()
const NODE_ENV = String(process.env.NODE_ENV || '').trim()
const CLIENT_URL = cleanUrl(process.env.CLIENT_URL)
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase()

if (!JWT_SECRET) throw new Error('JWT_SECRET is missing')
if (!CLIENT_URL) throw new Error('CLIENT_URL is missing')

let passport = null
try {
  passport = require('../utils/googleAuth')
} catch (e) {
  console.warn('[Auth] Google passport not loaded:', e.message)
}

const normalizeEmail = (value) => String(value || '').toLowerCase().trim()
const normalizeName = (value) => String(value || '').trim()
const normalizeText = (value) => String(value || '').trim()
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())

const isAdminEmail = (email) => normalizeEmail(email) === ADMIN_EMAIL
const getAdminFlag = (email) => (isAdminEmail(email) ? 1 : 0)

const signToken = (user) =>
  jwt.sign(
    {
      id: user._id,
      email: user.email,
      isAdmin: Number(user.isAdmin) === 1 ? 1 : 0,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  )

const cookieOptions = {
  httpOnly: true,
  secure: NODE_ENV === 'production',
  sameSite: NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
}

const setTokenCookie = (res, token) => {
  res.cookie(COOKIE_NAME, token, cookieOptions)
}

const clearTokenCookie = (res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: NODE_ENV === 'production' ? 'none' : 'lax',
  })
}

const safeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  bio: user.bio,
  avatar: user.avatar,
  isAdmin: Number(user.isAdmin) === 1 ? 1 : 0,
  authProvider: user.authProvider,
  isEmailVerified: true,
})

router.post('/register', async (req, res) => {
  try {
    const name = normalizeName(req.body.name)
    const email = normalizeEmail(req.body.email)
    const password = String(req.body.password || '')
    const bio = normalizeText(req.body.bio)

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' })
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Enter a valid email address' })
    }

    if (name.length < 2) {
      return res.status(400).json({ message: 'Name must be at least 2 characters' })
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' })
    }

    const existingUser = await User.findOne({ email })

    if (existingUser) {
      if (existingUser.authProvider === 'google' && !existingUser.password) {
        return res.status(409).json({
          message: 'This email is already connected to Google sign-in',
          code: 'EMAIL_ALREADY_GOOGLE',
        })
      }

      return res.status(409).json({
        message: 'Email already registered',
        code: 'EMAIL_ALREADY_EXISTS',
      })
    }

    const user = await User.create({
      name,
      email,
      password,
      bio,
      isAdmin: getAdminFlag(email),
      authProvider: 'local',
      isEmailVerified: true,
    })

    const token = signToken(user)
    setTokenCookie(res, token)

    return res.status(201).json({
      message: 'Account created successfully',
      user: safeUser(user),
    })
  } catch (err) {
    console.error('[Register]', err)
    return res.status(500).json({ message: err.message || 'Server error' })
  }
})

router.post('/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email)
    const password = String(req.body.password || '')

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' })
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Enter a valid email address' })
    }

    const user = await User.findOne({ email }).select('+password')

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    if (user.authProvider === 'google' && !user.password) {
      return res.status(400).json({
        message: 'This account uses Google sign-in. Please continue with Google.',
        code: 'GOOGLE_ACCOUNT',
      })
    }

    const valid = await user.comparePassword(password)

    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    user.isAdmin = getAdminFlag(user.email)
    user.isEmailVerified = true
    await user.save()

    const token = signToken(user)
    setTokenCookie(res, token)

    return res.json({
      message: 'Login successful',
      user: safeUser(user),
    })
  } catch (err) {
    console.error('[Login]', err)
    return res.status(500).json({ message: err.message || 'Server error' })
  }
})

if (passport) {
  router.get(
    '/google',
    passport.authenticate('google', {
      scope: ['profile', 'email'],
      session: false,
      prompt: 'select_account',
    })
  )

  router.get(
    '/google/callback',
    passport.authenticate('google', {
      failureRedirect: `${CLIENT_URL}/#/login?error=google_failed`,
      session: false,
    }),
    (req, res) => {
      try {
        const token = signToken(req.user)
        setTokenCookie(res, token)

        const redirectPath = Number(req.user.isAdmin) === 1 ? '/#/admin' : '/#/user'
        return res.redirect(`${CLIENT_URL}${redirectPath}`)
      } catch (err) {
        console.error('[Google Callback]', err)
        return res.redirect(`${CLIENT_URL}/#/login?error=server`)
      }
    }
  )
} else {
  router.get('/google', (req, res) => {
    res.status(503).json({ message: 'Google login is not configured' })
  })

  router.get('/google/callback', (req, res) => {
    res.redirect(`${CLIENT_URL}/#/login?error=google_not_configured`)
  })
}

router.get('/me', authMiddleware, (req, res) => {
  return res.json({ user: safeUser(req.user) })
})

router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const nextName = normalizeName(req.body.name)
    const nextEmail = normalizeEmail(req.body.email)
    const nextBio = normalizeText(req.body.bio)

    if (!nextName || !nextEmail) {
      return res.status(400).json({ message: 'Name and email are required' })
    }

    if (!isValidEmail(nextEmail)) {
      return res.status(400).json({ message: 'Enter a valid email address' })
    }

    const emailOwner = await User.findOne({
      email: nextEmail,
      _id: { $ne: req.user._id },
    })

    if (emailOwner) {
      return res.status(409).json({ message: 'Email already in use' })
    }

    req.user.name = nextName
    req.user.email = nextEmail
    req.user.bio = nextBio
    req.user.isAdmin = getAdminFlag(nextEmail)
    req.user.isEmailVerified = true

    await req.user.save()

    const token = signToken(req.user)
    setTokenCookie(res, token)

    return res.json({
      message: 'Profile updated successfully',
      user: safeUser(req.user),
    })
  } catch (err) {
    console.error('[UpdateProfile]', err)
    return res.status(500).json({ message: err.message || 'Server error' })
  }
})

router.post('/logout', (req, res) => {
  clearTokenCookie(res)
  return res.json({ message: 'Logged out successfully' })
})

module.exports = router