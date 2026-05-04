const mongoose = require('mongoose')

const syncedWordSchema = new mongoose.Schema(
  {
    word: { type: String, required: true, trim: true },
    start: { type: Number, default: 0 },
    end: { type: Number, default: 0 },
  },
  { _id: false }
)

const syncedLyricSchema = new mongoose.Schema(
  {
    time: { type: Number, required: true },
    start: { type: Number, default: 0 },
    end: { type: Number, default: 0 },
    text: { type: String, required: true, trim: true },
    confidence: { type: Number, default: 0 },
    words: { type: [syncedWordSchema], default: [] },
  },
  { _id: false }
)

const musicSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    artist: { type: String, required: true, trim: true },
    author: { type: String, default: '', trim: true },
    featuredArtists: { type: [String], default: [] },

    bio: { type: String, default: '' },
    artistBio: { type: String, default: '' },
    lyrics: { type: String, default: '' },

    syncedLyricsRaw: { type: String, default: '' },
    syncedLyrics: { type: [syncedLyricSchema], default: [] },

    tags: { type: [String], default: [] },
    genre: { type: [String], default: [] },
    album: { type: String, default: '', trim: true },
    language: { type: String, default: '', trim: true },
    mood: { type: [String], default: [] },
    country: { type: String, default: '', trim: true },
    releaseDate: { type: Date, default: null },

    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
    },

    isExplicit: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },
    isRecommended: { type: Boolean, default: false },

    duration: { type: Number, default: 0 },
    lrcFile: { type: String, default: '' },
    cover: { type: String, default: '' },
    url: { type: String, default: '' },

    playCount: { type: Number, default: 0 },
    likeCount: { type: Number, default: 0 },
    downloadCount: { type: Number, default: 0 },

    syncStatus: {
      type: String,
      enum: ['none', 'processing', 'ready', 'failed'],
      default: 'none',
    },
    syncModel: { type: String, default: 'base' },
    syncUpdatedAt: { type: Date, default: null },
    syncError: { type: String, default: '' },
  },
  { timestamps: true }
)

module.exports = mongoose.model('Music', musicSchema)