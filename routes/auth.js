const express = require('express')
const jwt = require('jsonwebtoken')
const passport = require('../utils/googleAuth')
const User = require('../models/User')
const { sendEmail } = require('../utils/sendEmail')
const {
  verificationTemplate,
  resetPasswordTemplate,
  welcomeTemplate,
} = require('../utils/emailTemplates')
const { authMiddleware, COOKIE_NAME } = require('../middleware/auth')

const router = express.Router()

const { JWT_SECRET, CLIENT_URL, NODE_ENV } = process.env

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is missing')
}

if (!CLIENT_URL) {
  throw new Error('CLIENT_URL is missing')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const generateCode = () => String(Math.floor(100000 + Math.random() * 900000))

const signToken = (user) =>
  jwt.sign(
    {
      id: user._id,
      email: user.email,
      isAdmin: user.isAdmin,
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
  isAdmin: user.isAdmin,
  isEmailVerified: user.isEmailVerified,
  authProvider: user.authProvider,
})

// ── Register ──────────────────────────────────────────────────────────────────

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, bio } = req.body

    if (!name || !email || !password) {
      return res.status(400).json({
        message: 'Name, email and password are required',
      })
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: 'Password must be at least 6 characters',
      })
    }

    const normalizedEmail = email.toLowerCase().trim()

    const exists = await User.findOne({ email: normalizedEmail })
    if (exists) {
      return res.status(409).json({
        message: 'Email already registered',
      })
    }

    const code = generateCode()
    const codeExpires = new Date(Date.now() + 10 * 60 * 1000)

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      bio: bio?.trim() || '',
      isAdmin: 0,
      authProvider: 'local',
      emailVerificationCode: code,
      emailVerificationExpires: codeExpires,
      isEmailVerified: false,
    })

    await sendEmail({
      to: user.email,
      ...verificationTemplate(user.name, code),
    })

    const token = signToken(user)
    setTokenCookie(res, token)

    return res.status(201).json({
      message: 'Registered successfully. Check your email for the verification code.',
      user: safeUser(user),
    })
  } catch (err) {
    console.error('[Register]', err)
    return res.status(500).json({
      message: err.message || 'Server error',
    })
  }
})

// ── Login ─────────────────────────────────────────────────────────────────────

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({
        message: 'Email and password are required',
      })
    }

    const normalizedEmail = email.toLowerCase().trim()

    const user = await User.findOne({ email: normalizedEmail }).select('+password')
    if (!user) {
      return res.status(401).json({
        message: 'Invalid credentials',
      })
    }

    if (user.authProvider === 'google' && !user.password) {
      return res.status(400).json({
        message: 'This account uses Google sign-in. Please continue with Google.',
      })
    }

    const valid = await user.comparePassword(password)
    if (!valid) {
      return res.status(401).json({
        message: 'Invalid credentials',
      })
    }

    const token = signToken(user)
    setTokenCookie(res, token)

    if (!user.isEmailVerified) {
      return res.status(200).json({
        message: 'Email not verified',
        needsEmailVerification: true,
        user: safeUser(user),
      })
    }

    return res.json({
      message: 'Login successful',
      user: safeUser(user),
    })
  } catch (err) {
    console.error('[Login]', err)
    return res.status(500).json({
      message: err.message || 'Server error',
    })
  }
})

// ── Verify email ──────────────────────────────────────────────────────────────

router.post('/verify-email', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body
    const user = req.user

    if (user.isEmailVerified) {
      return res.json({
        message: 'Already verified',
        user: safeUser(user),
      })
    }

    if (!code || user.emailVerificationCode !== code) {
      return res.status(400).json({
        message: 'Invalid code',
      })
    }

    if (!user.emailVerificationExpires || new Date() > new Date(user.emailVerificationExpires)) {
      return res.status(400).json({
        message: 'Code expired. Please request a new one.',
      })
    }

    user.isEmailVerified = true
    user.emailVerificationCode = undefined
    user.emailVerificationExpires = undefined
    await user.save()

    sendEmail({
      to: user.email,
      ...welcomeTemplate(user.name),
    }).catch((err) => {
      console.warn('[Welcome email]', err.message)
    })

    const newToken = signToken(user)
    setTokenCookie(res, newToken)

    return res.json({
      message: 'Email verified successfully',
      user: safeUser(user),
    })
  } catch (err) {
    console.error('[VerifyEmail]', err)
    return res.status(500).json({
      message: err.message || 'Server error',
    })
  }
})

// ── Resend verification ───────────────────────────────────────────────────────

router.post('/resend-verification', authMiddleware, async (req, res) => {
  try {
    const user = req.user

    if (user.isEmailVerified) {
      return res.status(400).json({
        message: 'Email already verified',
      })
    }

    const code = generateCode()
    user.emailVerificationCode = code
    user.emailVerificationExpires = new Date(Date.now() + 10 * 60 * 1000)
    await user.save()

    await sendEmail({
      to: user.email,
      ...verificationTemplate(user.name, code),
    })

    return res.json({
      message: 'Verification code resent',
    })
  } catch (err) {
    console.error('[ResendVerification]', err)
    return res.status(500).json({
      message: err.message || 'Server error',
    })
  }
})

// ── Forgot password ───────────────────────────────────────────────────────────

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({
        message: 'Email is required',
      })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const user = await User.findOne({ email: normalizedEmail })

    if (!user || user.authProvider === 'google') {
      return res.json({
        message: 'If that email exists, a reset code was sent',
      })
    }

    const code = generateCode()
    user.passwordResetCode = code
    user.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000)
    await user.save()

    await sendEmail({
      to: user.email,
      ...resetPasswordTemplate(user.name, code),
    })

    return res.json({
      message: 'Reset code sent to your email',
    })
  } catch (err) {
    console.error('[ForgotPassword]', err)
    return res.status(500).json({
      message: err.message || 'Server error',
    })
  }
})

// ── Reset password ────────────────────────────────────────────────────────────

router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body

    if (!email || !code || !newPassword) {
      return res.status(400).json({
        message: 'All fields are required',
      })
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: 'Password must be at least 6 characters',
      })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const user = await User.findOne({ email: normalizedEmail }).select('+password')

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
      })
    }

    if (!user.passwordResetCode || user.passwordResetCode !== code) {
      return res.status(400).json({
        message: 'Invalid reset code',
      })
    }

    if (!user.passwordResetExpires || new Date() > new Date(user.passwordResetExpires)) {
      return res.status(400).json({
        message: 'Reset code expired',
      })
    }

    user.password = newPassword
    user.passwordResetCode = undefined
    user.passwordResetExpires = undefined
    await user.save()

    return res.json({
      message: 'Password reset successfully. You can now sign in.',
    })
  } catch (err) {
    console.error('[ResetPassword]', err)
    return res.status(500).json({
      message: err.message || 'Server error',
    })
  }
})

// ── Google OAuth — initiate ───────────────────────────────────────────────────

router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
  })
)

// ── Google OAuth — callback ───────────────────────────────────────────────────

router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${CLIENT_URL}/login?error=google_failed`,
    session: false,
  }),
  (req, res) => {
    try {
      const token = signToken(req.user)
      setTokenCookie(res, token)

      const redirectPath = req.user.isAdmin === 1 ? '/admin' : '/user'
      return res.redirect(`${CLIENT_URL}${redirectPath}`)
    } catch (err) {
      console.error('[Google Callback]', err)
      return res.redirect(`${CLIENT_URL}/login?error=server`)
    }
  }
)

// ── Get current user ──────────────────────────────────────────────────────────

router.get('/me', authMiddleware, (req, res) => {
  return res.json({
    user: safeUser(req.user),
  })
})

// ── Logout ────────────────────────────────────────────────────────────────────

router.post('/logout', (req, res) => {
  clearTokenCookie(res)
  return res.json({
    message: 'Logged out successfully',
  })
})

module.exports = router