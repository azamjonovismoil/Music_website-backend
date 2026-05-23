const passport = require('passport')
const GoogleStrategy = require('passport-google-oauth20').Strategy
const User = require('../models/User')

const cleanUrl = (value = '') =>
  String(value || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/\/+$/, '')

const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID || '').trim()
const GOOGLE_CLIENT_SECRET = String(process.env.GOOGLE_CLIENT_SECRET || '').trim()
const GOOGLE_CALLBACK_URL = cleanUrl(process.env.GOOGLE_CALLBACK_URL)
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase()

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_CALLBACK_URL) {
  console.warn('[Google Auth] Missing env vars — Google login disabled')
} else {
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase().trim()
          const googleId = String(profile.id || '').trim()
          const name = String(profile.displayName || 'Google User').trim()

          if (!email) {
            return done(new Error('Google account email not found'), null)
          }

          let user = await User.findOne({ email }).select('+password')

          if (!user) {
            user = await User.create({
              name,
              email,
              password: '',
              bio: '',
              isAdmin: email === ADMIN_EMAIL ? 1 : 0,
              authProvider: 'google',
              googleId,
              isEmailVerified: true,
            })

            return done(null, user)
          }

          if (!user.googleId) user.googleId = googleId
          if (!user.name && name) user.name = name

          user.authProvider = user.authProvider || 'google'
          user.isEmailVerified = true

          if (email === ADMIN_EMAIL && Number(user.isAdmin) !== 1) {
            user.isAdmin = 1
          }

          await user.save()

          return done(null, user)
        } catch (err) {
          console.error('[Google Auth Strategy]', err)
          return done(err, null)
        }
      }
    )
  )

  console.log('[Google Auth] Ready')
  console.log('[Google Auth] Callback URL:', GOOGLE_CALLBACK_URL)
}

passport.serializeUser((user, done) => {
  done(null, user.id)
})

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id)
    done(null, user)
  } catch (err) {
    done(err, null)
  }
})

module.exports = passport