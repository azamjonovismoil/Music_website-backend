const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      default: '',
      select: false,
    },
    bio: {
      type: String,
      default: '',
    },
    avatar: {
      type: String,
      default: '',
    },
    isAdmin: {
      type: Number,
      default: 0, // 0 = user, 1 = admin
    },

    // Auth provider
    authProvider: {
      type: String,
      enum: ['local', 'google'],
      default: 'local',
    },
    googleId: {
      type: String,
      default: '',
    },

    // Email verification
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationCode: {
      type: String,
      default: undefined,
    },
    emailVerificationExpires: {
      type: Date,
      default: undefined,
    },

    // Password reset
    passwordResetCode: {
      type: String,
      default: undefined,
    },
    passwordResetExpires: {
      type: Date,
      default: undefined,
    },

    // User library
    favourites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Music',
      },
    ],
    downloaded: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Music',
      },
    ],
  },
  { timestamps: true }
)

// Hash password before save (only if modified and not empty)
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next()
  this.password = await bcrypt.hash(this.password, 12)
  next()
})

// Compare password
userSchema.methods.comparePassword = async function (candidate) {
  if (!this.password) return false
  return bcrypt.compare(candidate, this.password)
}

module.exports = mongoose.model('User', userSchema)