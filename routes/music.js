const express = require("express");
const path = require("path");
const fs = require("fs");
const mm = require("music-metadata");
const axios = require("axios");
const router = express.Router();

const Music = require("../models/Music");
const upload = require("../middleware/upload");

const BASE_DIR = path.join(__dirname, "..");
const SYNC_SERVICE_URL = process.env.SYNC_SERVICE_URL || "http://127.0.0.1:8001";

const cleanRelativePath = (value = "") => String(value).replace(/^\/+/, "");

const safeUnlink = (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch { }
};

const parseTags = (rawTags) => {
  if (!rawTags) return [];
  try {
    const parsed = JSON.parse(rawTags);
    if (Array.isArray(parsed)) {
      return parsed.map((tag) => String(tag).replace(/^#/, "").trim()).filter(Boolean);
    }
    return [];
  } catch {
    return String(rawTags)
      .split(",")
      .map((tag) => tag.replace(/^#/, "").trim())
      .filter(Boolean);
  }
};

const parseStringArray = (rawValue) => {
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
    return [];
  } catch {
    return String(rawValue)
      .split(",")
      .map((item) => String(item).trim())
      .filter(Boolean);
  }
};

const parseSyncedLyrics = (raw = "") => {
  if (!raw || !String(raw).trim()) return [];

  return String(raw)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.+)$/);
      if (!match) return null;

      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const msRaw = match[3] || "0";
      const text = match[4]?.trim();
      if (!text) return null;

      const milliseconds = parseInt(msRaw.padEnd(3, "0"), 10);
      const time = minutes * 60 + seconds + milliseconds / 1000;

      return {
        time,
        start: time,
        end: time + 2,
        text,
        confidence: 0,
        words: []
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);
};

const normalizeString = (value = "") => String(value).trim();

const normalizeDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return String(value).toLowerCase() === "true";
};

const extractSyncPayload = (data) => {
  if (!data) return {};
  return data.data && typeof data.data === "object" ? data.data : data;
};

const runPythonSyncFromLyrics = async (audioPath, lyricsText) => {
  const form = new URLSearchParams();
  form.append("audio_path", audioPath);
  form.append("lyrics", lyricsText);
  form.append("model_size", "base");

  const { data } = await axios.post(`${SYNC_SERVICE_URL}/sync/from-lyrics`, form, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    timeout: 1000 * 60 * 10
  });

  return extractSyncPayload(data);
};

router.get("/", async (req, res) => {
  try {
    const musics = await Music.find().sort({ createdAt: -1 });
    res.json(musics);
  } catch (err) {
    res.status(500).json({ message: "Error fetching musics", error: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const music = await Music.findById(req.params.id);
    if (!music) return res.status(404).json({ message: "Music not found" });
    res.json(music);
  } catch (err) {
    res.status(500).json({ message: "Error fetching music", error: err.message });
  }
});

router.post(
  "/",
  upload.fields([
    { name: "cover", maxCount: 1 },
    { name: "song", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const {
        title,
        artist,
        author,
        bio,
        artistBio,
        lyrics,
        syncedLyricsRaw,
        album,
        language,
        releaseDate,
        download,
        country,
        status,
        isExplicit,
        isFeatured,
        isRecommended
      } = req.body;

      const tags = parseTags(req.body.tags);
      const genre = parseStringArray(req.body.genre);
      const mood = parseStringArray(req.body.mood);
      const featuredArtists = parseStringArray(req.body.featuredArtists);

      if (!normalizeString(title) || !normalizeString(artist)) {
        return res.status(400).json({ message: "Title and artist are required" });
      }

      if (!req.files?.song?.[0]) {
        return res.status(400).json({ message: "Song file is required" });
      }

      const songFile = req.files.song[0];
      let duration = 0;

      try {
        const metadata = await mm.parseFile(songFile.path);
        duration = Math.round(metadata.format.duration || 0);
      } catch { }

      const normalizedSyncedLyricsRaw = normalizeString(syncedLyricsRaw);
      const syncedLyrics = parseSyncedLyrics(normalizedSyncedLyricsRaw);

      const music = new Music({
        title: normalizeString(title),
        artist: normalizeString(artist),
        author: normalizeString(author),
        featuredArtists,

        bio: normalizeString(bio),
        artistBio: normalizeString(artistBio),
        lyrics: normalizeString(lyrics),

        syncedLyricsRaw: normalizedSyncedLyricsRaw,
        syncedLyrics,

        tags,
        genre,
        album: normalizeString(album),
        language: normalizeString(language),
        mood,
        country: normalizeString(country),
        releaseDate: normalizeDate(releaseDate),

        status: normalizeString(status) || "draft",
        isExplicit: normalizeBoolean(isExplicit, false),
        isFeatured: normalizeBoolean(isFeatured, false),
        isRecommended: normalizeBoolean(isRecommended, false),

        duration,
        liked: false,
        download: normalizeBoolean(download, false),
        syncStatus: normalizedSyncedLyricsRaw ? "ready" : "none",
        syncModel: normalizedSyncedLyricsRaw ? "manual" : "",
        syncUpdatedAt: normalizedSyncedLyricsRaw ? new Date() : null,
        syncError: "",

        cover: req.files?.cover?.[0] ? `/uploads/covers/${req.files.cover[0].filename}` : "",
        url: `/uploads/songs/${songFile.filename}`
      });

      const savedMusic = await music.save();
      res.status(201).json(savedMusic);
    } catch (err) {
      res.status(500).json({ message: "Error saving music", error: err.message });
    }
  }
);

router.put(
  "/:id",
  upload.fields([
    { name: "cover", maxCount: 1 },
    { name: "song", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const music = await Music.findById(req.params.id);
      if (!music) return res.status(404).json({ message: "Music not found" });

      if (req.body.title !== undefined) music.title = normalizeString(req.body.title) || music.title;
      if (req.body.artist !== undefined) music.artist = normalizeString(req.body.artist) || music.artist;
      if (req.body.author !== undefined) music.author = normalizeString(req.body.author);
      if (req.body.bio !== undefined) music.bio = normalizeString(req.body.bio);
      if (req.body.artistBio !== undefined) music.artistBio = normalizeString(req.body.artistBio);
      if (req.body.lyrics !== undefined) music.lyrics = normalizeString(req.body.lyrics);

      if (req.body.featuredArtists !== undefined) {
        music.featuredArtists = parseStringArray(req.body.featuredArtists);
      }

      if (req.body.genre !== undefined) {
        music.genre = parseStringArray(req.body.genre);
      }

      if (req.body.album !== undefined) {
        music.album = normalizeString(req.body.album);
      }

      if (req.body.language !== undefined) {
        music.language = normalizeString(req.body.language);
      }

      if (req.body.mood !== undefined) {
        music.mood = parseStringArray(req.body.mood);
      }

      if (req.body.country !== undefined) {
        music.country = normalizeString(req.body.country);
      }

      if (req.body.releaseDate !== undefined) {
        music.releaseDate = normalizeDate(req.body.releaseDate);
      }

      if (req.body.tags !== undefined) {
        music.tags = parseTags(req.body.tags);
      }

      if (req.body.status !== undefined) {
        music.status = normalizeString(req.body.status) || music.status;
      }

      if (req.body.isExplicit !== undefined) {
        music.isExplicit = normalizeBoolean(req.body.isExplicit, music.isExplicit);
      }

      if (req.body.isFeatured !== undefined) {
        music.isFeatured = normalizeBoolean(req.body.isFeatured, music.isFeatured);
      }

      if (req.body.isRecommended !== undefined) {
        music.isRecommended = normalizeBoolean(req.body.isRecommended, music.isRecommended);
      }

      if (req.body.download !== undefined) {
        music.download = normalizeBoolean(req.body.download, music.download);
      }

      if (req.body.syncedLyricsRaw !== undefined) {
        const normalizedSyncedLyricsRaw = normalizeString(req.body.syncedLyricsRaw);
        music.syncedLyricsRaw = normalizedSyncedLyricsRaw;
        music.syncedLyrics = parseSyncedLyrics(normalizedSyncedLyricsRaw);
        music.syncStatus = normalizedSyncedLyricsRaw ? "ready" : "none";
        music.syncUpdatedAt = normalizedSyncedLyricsRaw ? new Date() : null;
        music.syncError = "";
        music.syncModel = normalizedSyncedLyricsRaw ? (music.syncModel || "manual") : "";
      }

      if (req.files?.cover?.[0]) {
        if (music.cover) safeUnlink(path.join(BASE_DIR, cleanRelativePath(music.cover)));
        music.cover = `/uploads/covers/${req.files.cover[0].filename}`;
      }

      if (req.files?.song?.[0]) {
        if (music.url) safeUnlink(path.join(BASE_DIR, cleanRelativePath(music.url)));

        const newSongFile = req.files.song[0];
        music.url = `/uploads/songs/${newSongFile.filename}`;
        music.syncedLyrics = [];
        music.syncedLyricsRaw = "";
        music.lrcFile = "";
        music.syncStatus = "none";
        music.syncUpdatedAt = null;
        music.syncError = "";
        music.syncModel = "";

        try {
          const metadata = await mm.parseFile(newSongFile.path);
          music.duration = Math.round(metadata.format.duration || 0);
        } catch {
          music.duration = 0;
        }
      }

      const updatedMusic = await music.save();
      res.json(updatedMusic);
    } catch (err) {
      res.status(500).json({ message: "Error updating music", error: err.message });
    }
  }
);

router.post("/:id/generate-sync-from-lyrics", async (req, res) => {
  try {
    const music = await Music.findById(req.params.id);

    if (!music) {
      return res.status(404).json({ message: "Music not found" });
    }

    if (!music.url) {
      return res.status(400).json({ message: "Music file url not found" });
    }

    if (!music.lyrics?.trim()) {
      return res.status(400).json({ message: "Lyrics text is required" });
    }

    const absoluteAudioPath = path.join(BASE_DIR, cleanRelativePath(music.url));

    if (!fs.existsSync(absoluteAudioPath)) {
      return res.status(400).json({
        message: "Audio file not found",
        path: absoluteAudioPath
      });
    }

    music.syncStatus = "processing";
    music.syncError = "";
    await music.save();

    const parsed = await runPythonSyncFromLyrics(absoluteAudioPath, music.lyrics);

    music.language = parsed.language || music.language || "";
    music.duration = parsed.duration || music.duration || 0;
    music.syncedLyricsRaw = parsed.syncedLyricsRaw || "";
    music.syncedLyrics = Array.isArray(parsed.syncedLyrics)
      ? parsed.syncedLyrics
      : parseSyncedLyrics(parsed.syncedLyricsRaw || "");
    music.syncStatus = music.syncedLyricsRaw ? "ready" : "none";
    music.syncModel = parsed.backend || "auto";
    music.syncUpdatedAt = new Date();
    music.syncError = "";

    const savedMusic = await music.save();
    res.json(savedMusic);
  } catch (err) {
    console.error("generate-sync-from-lyrics error:", err?.response?.data || err.message || err);

    try {
      const music = await Music.findById(req.params.id);
      if (music) {
        music.syncStatus = "failed";
        music.syncError = err?.response?.data?.detail || err.message || "Sync failed";
        await music.save();
      }
    } catch { }

    res.status(500).json({
      message: "Generate sync from lyrics failed",
      error: err?.response?.data?.detail || err.message
    });
  }
});

router.patch("/:id/like", async (req, res) => {
  try {
    const music = await Music.findById(req.params.id);
    if (!music) return res.status(404).json({ message: "Music not found" });

    music.liked = !music.liked;
    await music.save();

    res.json(music);
  } catch (err) {
    res.status(500).json({ message: "Error toggling like", error: err.message });
  }
});

router.patch("/:id/download", async (req, res) => {
  try {
    const music = await Music.findById(req.params.id);
    if (!music) return res.status(404).json({ message: "Music not found" });

    music.download = !music.download;
    await music.save();

    res.json(music);
  } catch (err) {
    res.status(500).json({ message: "Error toggling download", error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const music = await Music.findById(req.params.id);
    if (!music) return res.status(404).json({ message: "Music not found" });

    if (music.cover) safeUnlink(path.join(BASE_DIR, cleanRelativePath(music.cover)));
    if (music.url) safeUnlink(path.join(BASE_DIR, cleanRelativePath(music.url)));
    if (music.lrcFile) safeUnlink(path.join(BASE_DIR, cleanRelativePath(music.lrcFile)));

    await Music.findByIdAndDelete(req.params.id);

    res.json({ message: "Music deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting music", error: err.message });
  }
});

module.exports = router;