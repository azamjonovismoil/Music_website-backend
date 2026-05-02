const express = require('express')
const jwt = require('jsonwebtoken')
const passport = require('../utils/googleAuth')
const User = require('../models/User')
const { sendEmail } = require('../utils/sendEmail')
const { resetPasswordTemplate } = require('../utils/emailTemplates')
const { authMiddleware, COOKIE_NAME } = require('../middleware/auth')

const router = express.Router()

const { JWT_SECRET, CLIENT_URL, NODE_ENV } = process.env

if (!JWT_SECRET) throw new Error('JWT_SECRET is missing')
if (!CLIENT_URL) throw new Error('CLIENT_URL is missing')

const generateCode = () => String(Math.floor(100000 + Math.random() * 900000))

const signToken = (user) =>
  jwt.sign({ id: user._id, email: user.email, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '7d' })

const cookieOptions = {
  httpOnly: true,
  secure: NODE_ENV === 'production',
  sameSite: NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
}

const setTokenCookie = (res, token) => res.cookie(COOKIE_NAME, token, cookieOptions)

const clearTokenCookie = (res) =>
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: NODE_ENV === 'production' ? 'none' : 'lax',
  })

const safeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  bio: user.bio,
  avatar: user.avatar,
  isAdmin: user.isAdmin,
  authProvider: user.authProvider,
})

// ── Register ────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, bio } = req.body
    if (!name || !email || !password)
      return res.status(400).json({ message: 'Name, email and password are required' })
    if (password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' })

    const normalizedEmail = email.toLowerCase().trim()
    const exists = await User.findOne({ email: normalizedEmail })
    if (exists) return res.status(409).json({ message: 'Email already registered' })

    const user = await User.create({
      name: name.trim(), email: normalizedEmail, password,
      bio: bio?.trim() || '', isAdmin: 0, authProvider: 'local', isEmailVerified: true,
    })
    const token = signToken(user)
    setTokenCookie(res, token)
    return res.status(201).json({ message: 'Account created successfully', user: safeUser(user) })
  } catch (err) {
    console.error('[Register]', err)
    return res.status(500).json({ message: err.message || 'Server error' })
  }
})

// ── Login ───────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password)
      return res.status(400).json({ message: 'Email and password are required' })

    const normalizedEmail = email.toLowerCase().trim()
    const user = await User.findOne({ email: normalizedEmail }).select('+password')
    if (!user) return res.status(401).json({ message: 'Invalid credentials' })

    if (user.authProvider === 'google' && !user.password)
      return res.status(400).json({ message: 'This account uses Google sign-in.' })

    const valid = await user.comparePassword(password)
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' })

    const token = signToken(user)
    setTokenCookie(res, token)
    return res.json({ message: 'Login successful', user: safeUser(user) })
  } catch (err) {
    console.error('[Login]', err)
    return res.status(500).json({ message: err.message || 'Server error' })
  }
})

// ── Forgot Password ─────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ message: 'Email is required' })

    const normalizedEmail = email.toLowerCase().trim()
    const user = await User.findOne({ email: normalizedEmail })
    if (!user || user.authProvider === 'google')
      return res.json({ message: 'If that email exists, a reset code was sent' })

    const code = generateCode()
    user.passwordResetCode = code
    user.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000)
    await user.save()
    await sendEmail({ to: user.email, ...resetPasswordTemplate(user.name, code) })
    return res.json({ message: 'Reset code sent to your email' })
  } catch (err) {
    console.error('[ForgotPassword]', err)
    return res.status(500).json({ message: err.message || 'Server error' })
  }
})

// ── Reset Password ──────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body
    if (!email || !code || !newPassword)
      return res.status(400).json({ message: 'All fields are required' })
    if (newPassword.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' })

    const normalizedEmail = email.toLowerCase().trim()
    const user = await User.findOne({ email: normalizedEmail }).select('+password')
    if (!user) return res.status(404).json({ message: 'User not found' })
    if (!user.passwordResetCode || user.passwordResetCode !== code)
      return res.status(400).json({ message: 'Invalid reset code' })
    if (!user.passwordResetExpires || new Date() > new Date(user.passwordResetExpires))
      return res.status(400).json({ message: 'Reset code expired' })

    user.password = newPassword
    user.passwordResetCode = undefined
    user.passwordResetExpires = undefined
    user.authProvider = 'local'
    await user.save()
    return res.json({ message: 'Password reset successfully. You can now sign in.' })
  } catch (err) {
    console.error('[ResetPassword]', err)
    return res.status(500).json({ message: err.message || 'Server error' })
  }
})

// ── Google OAuth ────────────────────────────────────────────
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }))

router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: `${CLIENT_URL}/login?error=google_failed`, session: false }),
  (req, res) => {
    try {
      const token = signToken(req.user)
      setTokenCookie(res, token)
      const redirectPath = Number(req.user.isAdmin) === 1 ? '/admin' : '/user'
      return res.redirect(`${CLIENT_URL}${redirectPath}`)
    } catch (err) {
      console.error('[Google Callback]', err)
      return res.redirect(`${CLIENT_URL}/login?error=server`)
    }
  }
)

// ── Me ──────────────────────────────────────────────────────
router.get('/me', authMiddleware, (req, res) => {
  return res.json({ user: safeUser(req.user) })
})

// ── Logout ──────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  clearTokenCookie(res)
  return res.json({ message: 'Logged out successfully' })
})

// ── Profile Update (no ID — uses authenticated session) ─────
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, email, bio } = req.body

    if (!name || !String(name).trim())
      return res.status(400).json({ message: 'Name is required' })

    const normalizedEmail = email ? email.toLowerCase().trim() : req.user.email

    if (normalizedEmail !== req.user.email) {
      const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: req.user._id } })
      if (existing) return res.status(409).json({ message: 'Email already in use' })
    }

    req.user.name = String(name).trim()
    req.user.email = normalizedEmail
    req.user.bio = bio ? String(bio).trim() : ''
    await req.user.save()

    return res.json({ message: 'Profile updated successfully', user: safeUser(req.user) })
  } catch (err) {
    console.error('[Profile Update]', err)
    return res.status(500).json({ message: err.message || 'Server error' })
  }
})

// ── Profile Update by ID (backward-compat) ─────────────────
router.put('/profile/:id', authMiddleware, async (req, res) => {
  try {
    const { name, email, bio } = req.body

    if (!name || !String(name).trim())
      return res.status(400).json({ message: 'Name is required' })

    if (String(req.user._id) !== String(req.params.id) && Number(req.user.isAdmin) !== 1)
      return res.status(403).json({ message: 'Forbidden' })

    const targetUser =
      String(req.user._id) === String(req.params.id)
        ? req.user
        : await User.findById(req.params.id)

    if (!targetUser) return res.status(404).json({ message: 'User not found' })

    const normalizedEmail = email ? email.toLowerCase().trim() : targetUser.email

    if (normalizedEmail !== targetUser.email) {
      const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: targetUser._id } })
      if (existing) return res.status(409).json({ message: 'Email already in use' })
    }

    targetUser.name = String(name).trim()
    targetUser.email = normalizedEmail
    targetUser.bio = bio ? String(bio).trim() : ''
    await targetUser.save()

    return res.json({ message: 'Profile updated successfully', user: safeUser(targetUser) })
  } catch (err) {
    console.error('[Profile Update By ID]', err)
    return res.status(500).json({ message: err.message || 'Server error' })
  }
})

module.exports = router