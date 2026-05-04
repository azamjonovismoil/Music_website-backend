const mongoose = require('mongoose')

const syncedLyricLineSchema = new mongoose.Schema(
  {
    time: { type: Number, default: 0 },
    start: { type: Number, default: 0 },
    end: { type: Number, default: 0 },
    text: { type: String, default: '' },
    confidence: { type: Number, default: 0 },
    words: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { _id: false }
)

const musicSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    artist: { type: String, required: true, trim: true },
    author: { type: String, default: '', trim: true },

    featuredArtists: { type: [String], default: [] },
    genre: { type: [String], default: [] },
    mood: { type: [String], default: [] },
    tags: { type: [String], default: [] },

    album: { type: String, default: '', trim: true },
    language: { type: String, default: '', trim: true },
    country: { type: String, default: '', trim: true },

    bio: { type: String, default: '', trim: true },
    artistBio: { type: String, default: '', trim: true },
    lyrics: { type: String, default: '', trim: true },

    syncedLyricsRaw: { type: String, default: '' },
    syncedLyrics: { type: [syncedLyricLineSchema], default: [] },

    syncStatus: {
      type: String,
      enum: ['none', 'processing', 'ready', 'failed'],
      default: 'none',
    },
    syncModel: { type: String, default: '' },
    syncUpdatedAt: { type: Date, default: null },
    syncError: { type: String, default: '' },

    cover: { type: String, default: '' },
    coverStorageKey: { type: String, default: '' },

    url: { type: String, default: '' },
    audioStorageKey: { type: String, default: '' },

    duration: { type: Number, default: 0 },
    releaseDate: { type: Date, default: null },

    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
    },

    isExplicit: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },
    isRecommended: { type: Boolean, default: false },

    likeCount: { type: Number, default: 0 },
    downloadCount: { type: Number, default: 0 },
    playCount: { type: Number, default: 0 },
  },
  { timestamps: true }
)

module.exports = mongoose.model('Music', musicSchema)