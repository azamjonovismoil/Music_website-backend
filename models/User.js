const mongoose = require('mongoose')

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 40,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 80,
      index: true,
    },

    password: {
      type: String,
      required: false,
      default: '',
    },

    bio: {
      type: String,
      default: '',
      trim: true,
      maxlength: 160,
    },

    isAdmin: {
      type: Number,
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
      index: true,
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    emailVerificationCode: {
      type: String,
      default: '',
    },

    emailVerificationExpires: {
      type: Date,
      default: null,
    },

    resetPasswordCode: {
      type: String,
      default: '',
    },

    resetPasswordExpires: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
)

module.exports = mongoose.model('User', userSchema)