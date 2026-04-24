const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const passport = require('passport')
const User = require('../models/User')
const { authMiddleware, COOKIE_NAME } = require('../middleware/auth')
const { sendEmail } = require('../utils/sendEmail')
const {
  verificationTemplate,
  resetPasswordTemplate,
  welcomeTemplate,
} = require('../utils/emailTemplates')

const router = express.Router()

const JWT_SECRET = process.env.JWT_SECRET
const CLIENT_URL = process.env.CLIENT_URL

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is missing in environment variables')
}

if (!CLIENT_URL) {
  throw new Error('CLIENT_URL is missing in environment variables')
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const signToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      isAdmin: Number(user.isAdmin) === 1 ? 1 : 0,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  )
}

const sanitizeUser = (user) => {
  const obj = user.toObject ? user.toObject() : { ...user }
  delete obj.password
  delete obj.emailVerificationCode
  delete obj.emailVerificationExpires
  delete obj.resetPasswordCode
  delete obj.resetPasswordExpires
  return obj
}

const generateCode = () => String(Math.floor(100000 + Math.random() * 900000))
const verificationExpiry = () => new Date(Date.now() + 10 * 60 * 1000)
const resetExpiry = () => new Date(Date.now() + 10 * 60 * 1000)

const sendVerificationEmail = async (user, code) => {
  const tpl = verificationTemplate(user.name, code)
  await sendEmail({ to: user.email, ...tpl })
}

const sendResetEmail = async (user, code) => {
  const tpl = resetPasswordTemplate(user.name, code)
  await sendEmail({ to: user.email, ...tpl })
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, bio } = req.body

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ message: 'Name must be at least 2 characters' })
    }

    if (!email || !emailRe.test(email)) {
      return res.status(400).json({ message: 'Enter a valid email address' })
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const exists = await User.findOne({ email: normalizedEmail })

    if (exists) {
      return res.status(409).json({ message: 'Email already registered' })
    }

    const hashed = await bcrypt.hash(password, 12)
    const code = generateCode()

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashed,
      bio: bio?.trim() || '',
      isAdmin: 0,
      authProvider: 'local',
      isEmailVerified: false,
      emailVerificationCode: code,
      emailVerificationExpires: verificationExpiry(),
    })

    const token = signToken(user)
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS)

    await sendVerificationEmail(user, code)

    return res.status(201).json({
      message: 'Account created successfully. Verification code sent to email.',
      user: sanitizeUser(user),
      needsEmailVerification: true,
    })
  } catch (err) {
    return res.status(500).json({
      message: 'Server error',
      error: err.message,
    })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const user = await User.findOne({ email: normalizedEmail })

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' })
    }

    if (!user.password) {
      return res.status(400).json({ message: 'This account uses Google sign-in' })
    }

    const match = await bcrypt.compare(password, user.password)
    if (!match) {
      return res.status(401).json({ message: 'Invalid email or password' })
    }

    const token = signToken(user)
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS)

    return res.json({
      message: user.isEmailVerified
        ? 'Logged in successfully'
        : 'Logged in, but email is not verified yet',
      user: sanitizeUser(user),
      needsEmailVerification: !user.isEmailVerified,
    })
  } catch (err) {
    return res.status(500).json({
      message: 'Server error',
      error: err.message,
    })
  }
})

router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
  })
)

router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${CLIENT_URL}/login`,
    session: false,
  }),
  async (req, res) => {
    try {
      const token = signToken(req.user)
      res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS)
      return res.redirect(`${CLIENT_URL}/`)
    } catch (err) {
      return res.redirect(`${CLIENT_URL}/login`)
    }
  }
)

router.post('/verify-email', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body

    if (!code || String(code).trim().length !== 6) {
      return res.status(400).json({ message: 'Enter a valid 6-digit code' })
    }

    const user = await User.findById(req.user._id)
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    if (user.isEmailVerified) {
      return res.json({
        message: 'Email already verified',
        user: sanitizeUser(user),
      })
    }

    if (!user.emailVerificationCode || !user.emailVerificationExpires) {
      return res.status(400).json({ message: 'Verification code not found' })
    }

    if (user.emailVerificationExpires.getTime() < Date.now()) {
      return res.status(400).json({ message: 'Verification code expired' })
    }

    if (user.emailVerificationCode !== String(code).trim()) {
      return res.status(400).json({ message: 'Invalid verification code' })
    }

    user.isEmailVerified = true
    user.emailVerificationCode = ''
    user.emailVerificationExpires = null
    await user.save()

    const welcomeTpl = welcomeTemplate(user.name)
    sendEmail({ to: user.email, ...welcomeTpl }).catch(() => { })

    return res.json({
      message: 'Email verified successfully',
      user: sanitizeUser(user),
    })
  } catch (err) {
    return res.status(500).json({
      message: 'Server error',
      error: err.message,
    })
  }
})

router.post('/resend-verification-code', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ message: 'Email already verified' })
    }

    const code = generateCode()
    user.emailVerificationCode = code
    user.emailVerificationExpires = verificationExpiry()
    await user.save()

    await sendVerificationEmail(user, code)

    return res.json({ message: 'Verification code sent again' })
  } catch (err) {
    return res.status(500).json({
      message: 'Server error',
      error: err.message,
    })
  }
})

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body

    if (!email || !emailRe.test(email)) {
      return res.status(400).json({ message: 'Enter a valid email address' })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const user = await User.findOne({ email: normalizedEmail })

    if (!user) {
      return res.json({
        message: 'If that email exists, a reset code has been sent.',
      })
    }

    const code = generateCode()
    user.resetPasswordCode = code
    user.resetPasswordExpires = resetExpiry()
    await user.save()

    await sendResetEmail(user, code)

    return res.json({
      message: 'If that email exists, a reset code has been sent.',
    })
  } catch (err) {
    return res.status(500).json({
      message: 'Server error',
      error: err.message,
    })
  }
})

router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, password } = req.body

    if (!email || !emailRe.test(email)) {
      return res.status(400).json({ message: 'Enter a valid email address' })
    }

    if (!code || String(code).trim().length !== 6) {
      return res.status(400).json({ message: 'Enter a valid 6-digit code' })
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const user = await User.findOne({ email: normalizedEmail })

    if (!user) {
      return res.status(400).json({ message: 'Invalid email or reset code' })
    }

    if (!user.password && user.authProvider === 'google') {
      return res.status(400).json({ message: 'This account uses Google sign-in' })
    }

    if (!user.resetPasswordCode || !user.resetPasswordExpires) {
      return res.status(400).json({ message: 'Reset code not found' })
    }

    if (user.resetPasswordExpires.getTime() < Date.now()) {
      return res.status(400).json({ message: 'Reset code expired' })
    }

    if (user.resetPasswordCode !== String(code).trim()) {
      return res.status(400).json({ message: 'Invalid reset code' })
    }

    user.password = await bcrypt.hash(password, 12)
    user.resetPasswordCode = ''
    user.resetPasswordExpires = null
    await user.save()

    return res.json({ message: 'Password reset successfully' })
  } catch (err) {
    return res.status(500).json({
      message: 'Server error',
      error: err.message,
    })
  }
})

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  })

  return res.json({ message: 'Logged out successfully' })
})

router.get('/me', authMiddleware, async (req, res) => {
  return res.json(req.user)
})

router.put('/profile/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user._id.toString() !== req.params.id) {
      return res.status(403).json({ message: 'Access denied' })
    }

    const { name, email, bio } = req.body
    const updates = {}

    if (name !== undefined) {
      if (!name.trim() || name.trim().length < 2) {
        return res.status(400).json({ message: 'Name must be at least 2 characters' })
      }
      updates.name = name.trim()
    }

    if (email !== undefined) {
      if (!emailRe.test(email)) {
        return res.status(400).json({ message: 'Enter a valid email address' })
      }

      const normalizedEmail = email.toLowerCase().trim()
      const exists = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: req.params.id },
      })

      if (exists) {
        return res.status(409).json({ message: 'Email already in use' })
      }

      updates.email = normalizedEmail
      updates.isEmailVerified = false

      const code = generateCode()
      updates.emailVerificationCode = code
      updates.emailVerificationExpires = verificationExpiry()
    }

    if (bio !== undefined) {
      updates.bio = String(bio).trim()
    }

    const updated = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
    })

    if (!updated) {
      return res.status(404).json({ message: 'User not found' })
    }

    if (updates.email) {
      await sendVerificationEmail(updated, updated.emailVerificationCode)
    }

    return res.json({
      message: 'Profile updated successfully',
      user: sanitizeUser(updated),
    })
  } catch (err) {
    return res.status(500).json({
      message: 'Server error',
      error: err.message,
    })
  }
})

module.exports = { router }