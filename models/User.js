const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [emailRegex, 'Please provide a valid email address'],
    },
    password: {
      type: String,
      default: '',
      select: false,
    },
    bio: {
      type: String,
      default: '',
      maxlength: 500,
      trim: true,
    },
    avatar: {
      type: String,
      default: '',
      trim: true,
    },
    isAdmin: {
      type: Number,
      enum: [0, 1],
      default: 0,
    },

    authProvider: {
      type: String,
      enum: ['local', 'google'],
      default: 'local',
    },
    googleId: {
      type: String,
      default: '',
      trim: true,
      unique: true,
      sparse: true,
    },

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

    passwordResetCode: {
      type: String,
      default: undefined,
    },
    passwordResetExpires: {
      type: Date,
      default: undefined,
    },

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
  {
    timestamps: true,
  }
)

userSchema.pre('save', async function (next) {
  try {
    if (!this.isModified('password')) return next()
    if (!this.password || !this.password.trim()) return next()

    this.password = await bcrypt.hash(this.password, 12)
    return next()
  } catch (err) {
    return next(err)
  }
})

userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false
  if (!candidatePassword) return false

  return bcrypt.compare(candidatePassword, this.password)
}

module.exports = mongoose.model('User', userSchema)