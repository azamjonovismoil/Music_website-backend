const mongoose = require('mongoose')

const playlistSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60,
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 240,
    },
    color: {
      type: String,
      default: 'linear-gradient(135deg,#0ea5e9,#2563eb)',
      trim: true,
    },
    cover: {
      type: String,
      default: '',
      trim: true,
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    tracks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Music',
      },
    ],
  },
  { timestamps: true }
)

module.exports = mongoose.model('Playlist', playlistSchema)