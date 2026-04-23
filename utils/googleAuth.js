const passport = require('passport')
const GoogleStrategy = require('passport-google-oauth20').Strategy
const User = require('../models/User')

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value?.toLowerCase().trim()
        const googleId = profile.id
        const name = profile.displayName || 'Google User'

        if (!email) {
          return done(new Error('Google account email not found'), null)
        }

        let user = await User.findOne({ email })

        if (!user) {
          user = await User.create({
            name,
            email,
            password: '',
            bio: '',
            isAdmin: 0,
            authProvider: 'google',
            googleId,
            isEmailVerified: true,
          })
          return done(null, user)
        }

        if (!user.googleId) {
          user.googleId = googleId
        }

        user.authProvider = 'google'
        user.isEmailVerified = true
        if (!user.name && name) user.name = name

        await user.save()

        return done(null, user)
      } catch (err) {
        return done(err, null)
      }
    }
  )
)

passport.serializeUser((user, done) => done(null, user.id))
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id)
    done(null, user)
  } catch (err) {
    done(err, null)
  }
})

console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID)
console.log('GOOGLE_CALLBACK_URL:', process.env.GOOGLE_CALLBACK_URL)

module.exports = passport