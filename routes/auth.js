const express = require('express')
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const { sendEmail } = require('../utils/sendEmail')
const {
  verificationTemplate,
  resetPasswordTemplate,
  welcomeTemplate,
} = require('../utils/emailTemplates')
const { authMiddleware, COOKIE_NAME } = require('../middleware/auth')

const router = express.Router()

const cleanUrl = (value = '') =>
  String(value || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/\/+$/, '')

const JWT_SECRET = String(process.env.JWT_SECRET || '').trim()
const NODE_ENV = String(process.env.NODE_ENV || '').trim().toLowerCase()
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

const isProd =
  NODE_ENV === 'production' ||
  String(process.env.RENDER || '').trim().toLowerCase() === 'true'

const generateCode = () => String(Math.floor(100000 + Math.random() * 900000))
const codeExpiryDate = () => new Date(Date.now() + 10 * 60 * 1000)

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
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
}

const setTokenCookie = (res, token) => {
  res.cookie(COOKIE_NAME, token, cookieOptions)
}

const clearTokenCookie = (res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
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
  isEmailVerified: !!user.isEmailVerified,
})

const sendVerificationEmail = async (user) => {
  if (!user?.email) return

  const code = generateCode()
  user.emailVerificationCode = code
  user.emailVerificationExpires = codeExpiryDate()
  await user.save()

  await sendEmail({
    to: user.email,
    ...verificationTemplate(user.name, code),
  })
}

router.post('/register', async (req, res) => {
  try {
    const name = normalizeName(req.body.name)
    const email = normalizeEmail(req.body.email)
    const password = String(req.body.password || '')
    const bio = normalizeText(req.body.bio)
    const adminEmail = isAdminEmail(email)

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' })
    }

    if (name.length < 2) {
      return res.status(400).json({ message: 'Name must be at least 2 characters' })
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Enter a valid email address' })
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
      isEmailVerified: adminEmail,
    })

    if (!adminEmail) {
      await sendVerificationEmail(user)
    }

    return res.status(201).json({
      message: adminEmail
        ? 'Account created successfully.'
        : 'Account created. Verification code sent to your email.',
      requiresVerification: !adminEmail,
      email: user.email,
      user: safeUser(user),
    })
  } catch (err) {
    console.error('[Register]', err)
    return res.status(500).json({ message: err.message || 'Server error' })
  }
})

router.post('/verify-email', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email)
    const code = normalizeText(req.body.code)

    if (!email || !code) {
      return res.status(400).json({ message: 'Email and verification code are required' })
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Enter a valid email address' })
    }

    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ message: 'Enter a valid 6-digit verification code' })
    }

    const user = await User.findOne({ email }).select('+password')

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    user.isAdmin = getAdminFlag(user.email)

    if (Number(user.isAdmin) === 1) {
      user.isEmailVerified = true
      user.emailVerificationCode = undefined
      user.emailVerificationExpires = undefined
      await user.save()

      const token = signToken(user)
      setTokenCookie(res, token)

      return res.json({
        message: 'Admin email verified automatically',
        user: safeUser(user),
      })
    }

    if (user.isEmailVerified) {
      const token = signToken(user)
      setTokenCookie(res, token)

      return res.json({
        message: 'Email already verified',
        user: safeUser(user),
      })
    }

    if (!user.emailVerificationCode || user.emailVerificationCode !== code) {
      return res.status(400).json({ message: 'Invalid verification code' })
    }

    if (!user.emailVerificationExpires || new Date() > new Date(user.emailVerificationExpires)) {
      return res.status(400).json({ message: 'Verification code expired' })
    }

    user.isEmailVerified = true
    user.emailVerificationCode = undefined
    user.emailVerificationExpires = undefined
    await user.save()

    try {
      await sendEmail({
        to: user.email,
        ...welcomeTemplate(user.name),
      })
    } catch (mailErr) {
      console.warn('[VerifyEmail] Welcome email failed:', mailErr.message)
    }

    const token = signToken(user)
    setTokenCookie(res, token)

    return res.json({
      message: 'Email verified successfully',
      user: safeUser(user),
    })
  } catch (err) {
    console.error('[VerifyEmail]', err)
    return res.status(500).json({ message: err.message || 'Server error' })
  }
})

router.post('/resend-verification', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email)

    if (!email) {
      return res.status(400).json({ message: 'Email is required' })
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Enter a valid email address' })
    }

    const user = await User.findOne({ email }).select('+password')

    if (!user) {
      return res.status(404).json({ message: 'No account found with this email' })
    }

    if (isAdminEmail(user.email)) {
      return res.json({ message: 'Admin account does not require verification' })
    }

    if (user.authProvider === 'google' && !user.password) {
      return res.status(400).json({
        message: 'This account uses Google sign-in. Please continue with Google.',
        code: 'GOOGLE_ACCOUNT',
      })
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ message: 'Email is already verified' })
    }

    await sendVerificationEmail(user)

    return res.json({ message: 'Verification code sent again' })
  } catch (err) {
    console.error('[ResendVerification]', err)
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

    if (Number(user.isAdmin) === 1) {
      user.isEmailVerified = true
      user.emailVerificationCode = undefined
      user.emailVerificationExpires = undefined
      await user.save()
    }

    if (!user.isEmailVerified) {
      return res.status(403).json({
        message: 'Please verify your email before signing in',
        code: 'EMAIL_NOT_VERIFIED',
        requiresVerification: true,
        email: user.email,
      })
    }

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

router.post('/forgot-password', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email)

    if (!email) {
      return res.status(400).json({ message: 'Email is required' })
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Enter a valid email address' })
    }

    const user = await User.findOne({ email }).select('+password')

    if (!user) {
      return res.status(404).json({ message: 'No account found with this email' })
    }

    if (user.authProvider === 'google' && !user.password) {
      return res.status(400).json({
        message: 'This account uses Google sign-in. Please continue with Google.',
        code: 'GOOGLE_ACCOUNT',
      })
    }

    const code = generateCode()
    user.passwordResetCode = code
    user.passwordResetExpires = codeExpiryDate()
    await user.save()

    await sendEmail({
      to: user.email,
      ...resetPasswordTemplate(user.name, code),
    })

    return res.json({
      message: 'Reset code sent to your email',
      email: user.email,
    })
  } catch (err) {
    console.error('[ForgotPassword]', err)
    return res.status(500).json({ message: err.message || 'Server error' })
  }
})

router.post('/reset-password', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email)
    const code = normalizeText(req.body.code)
    const newPassword = String(req.body.newPassword || '')

    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: 'All fields are required' })
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Enter a valid email address' })
    }

    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ message: 'Enter a valid 6-digit reset code' })
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' })
    }

    const user = await User.findOne({ email }).select('+password')

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    if (!user.passwordResetCode || user.passwordResetCode !== code) {
      return res.status(400).json({ message: 'Invalid reset code' })
    }

    if (!user.passwordResetExpires || new Date() > new Date(user.passwordResetExpires)) {
      return res.status(400).json({ message: 'Reset code expired' })
    }

    user.password = newPassword
    user.passwordResetCode = undefined
    user.passwordResetExpires = undefined
    user.authProvider = 'local'
    user.isEmailVerified = true
    user.isAdmin = getAdminFlag(user.email)

    await user.save()

    return res.json({
      message: 'Password reset successfully. You can now sign in.',
    })
  } catch (err) {
    console.error('[ResetPassword]', err)
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
    async (req, res) => {
      try {
        req.user.isAdmin = getAdminFlag(req.user.email)
        await req.user.save()

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
    return res.redirect(`${CLIENT_URL}/#/login?error=google_not_configured`)
  })

  router.get('/google/callback', (req, res) => {
    return res.redirect(`${CLIENT_URL}/#/login?error=google_not_configured`)
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

    if (nextName.length < 2) {
      return res.status(400).json({ message: 'Name must be at least 2 characters' })
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

    const emailChanged = nextEmail !== req.user.email
    const nextIsAdmin = getAdminFlag(nextEmail)

    req.user.name = nextName
    req.user.email = nextEmail
    req.user.bio = nextBio
    req.user.isAdmin = nextIsAdmin

    if (nextIsAdmin === 1) {
      req.user.isEmailVerified = true
      req.user.emailVerificationCode = undefined
      req.user.emailVerificationExpires = undefined
    }

    if (emailChanged && req.user.authProvider === 'local' && nextIsAdmin !== 1) {
      req.user.isEmailVerified = false
      await req.user.save()
      await sendVerificationEmail(req.user)

      clearTokenCookie(res)

      return res.json({
        message: 'Profile updated. Please verify your new email.',
        requiresVerification: true,
        email: req.user.email,
        user: safeUser(req.user),
      })
    }

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