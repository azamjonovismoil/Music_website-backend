const mongoose = require('mongoose')

const externalLinksSchema = new mongoose.Schema(
  {
    youtube: { type: String, trim: true, default: '' },
    spotify: { type: String, trim: true, default: '' },
    appleMusic: { type: String, trim: true, default: '' },
    soundcloud: { type: String, trim: true, default: '' },
    instagram: { type: String, trim: true, default: '' },
    tiktok: { type: String, trim: true, default: '' },
  },
  { _id: false }
)

const musicSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, trim: true, index: true, default: '' },

    artist: { type: String, required: true, trim: true },
    author: { type: String, trim: true, default: '' },
    composer: { type: String, trim: true, default: '' },
    producer: { type: String, trim: true, default: '' },
    featuredArtists: [{ type: String, trim: true }],

    album: { type: String, trim: true, default: '' },
    trackNumber: { type: Number, default: 0 },
    discNumber: { type: Number, default: 0 },
    version: { type: String, trim: true, default: '' },

    genre: [{ type: String, trim: true }],
    mood: [{ type: String, trim: true }],
    tags: [{ type: String, trim: true }],

    language: { type: String, trim: true, default: '' },
    lyricsLanguage: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: '' },

    releaseType: {
      type: String,
      enum: ['single', 'ep', 'album-track', 'remix', 'live', 'instrumental'],
      default: 'single',
    },
    visibility: {
      type: String,
      enum: ['public', 'unlisted', 'private'],
      default: 'public',
    },

    releaseDate: { type: Date, default: null },
    publishAt: { type: Date, default: null },

    bio: { type: String, trim: true, default: '' },
    artistBio: { type: String, trim: true, default: '' },
    lyrics: { type: String, trim: true, default: '' },
    syncedLyricsRaw: { type: String, trim: true, default: '' },

    cover: { type: String, trim: true, default: '' },
    coverStorageKey: { type: String, trim: true, default: '' },
    url: { type: String, trim: true, default: '' },
    audioStorageKey: { type: String, trim: true, default: '' },

    duration: { type: Number, default: 0 },
    bpm: { type: Number, default: 0 },
    keySignature: { type: String, trim: true, default: '' },
    isrc: { type: String, trim: true, default: '' },

    labelName: { type: String, trim: true, default: '' },
    copyright: { type: String, trim: true, default: '' },

    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
      index: true,
    },

    isExplicit: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },
    isRecommended: { type: Boolean, default: false },
    isFreeDownload: { type: Boolean, default: false },

    adminNote: { type: String, trim: true, default: '' },

    externalLinks: {
      type: externalLinksSchema,
      default: () => ({}),
    },

    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    likeCount: { type: Number, default: 0 },
    playCount: { type: Number, default: 0 },
    downloadCount: { type: Number, default: 0 },
  },
  { timestamps: true }
)

musicSchema.index({ title: 1, artist: 1 })
musicSchema.index({ slug: 1 })

module.exports = mongoose.model('Music', musicSchema)