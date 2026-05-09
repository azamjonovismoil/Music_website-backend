import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const usePlayerStore = defineStore('player', () => {
  const currentTrack = ref(null)
  const queue = ref([])
  const queueIndex = ref(-1)
  const currentTime = ref(0)
  const isPlaying = ref(false)

  const shuffle = ref(false)
  const repeatMode = ref('off') // off | all | one

  const showLyricsPanel = ref(false)
  const showKaraokeMode = ref(false)

  const hasQueue = computed(() => queue.value.length > 0)
  const currentTrackId = computed(() => String(currentTrack.value?._id || ''))

  const findQueueIndex = (trackId) =>
    queue.value.findIndex((item) => String(item?._id || '') === String(trackId || ''))

  const setQueue = (tracks = [], activeTrack = null) => {
    queue.value = Array.isArray(tracks) ? [...tracks] : []

    if (!queue.value.length) {
      queueIndex.value = -1
      if (!activeTrack) currentTrack.value = null
      return
    }

    if (activeTrack?._id) {
      currentTrack.value = activeTrack
      const idx = findQueueIndex(activeTrack._id)

      if (idx >= 0) queueIndex.value = idx
      else {
        queue.value.unshift(activeTrack)
        queueIndex.value = 0
      }
      return
    }

    currentTrack.value = queue.value[0]
    queueIndex.value = 0
  }

  const setTrack = (track, options = {}) => {
    if (!track) {
      currentTrack.value = null
      queue.value = []
      queueIndex.value = -1
      currentTime.value = 0
      isPlaying.value = false
      return
    }

    if (Array.isArray(options.queue)) {
      queue.value = [...options.queue]
    }

    currentTrack.value = track

    const idx = findQueueIndex(track._id)
    if (idx >= 0) {
      queueIndex.value = idx
    } else {
      queue.value = [track, ...queue.value.filter((item) => String(item?._id || '') !== String(track._id || ''))]
      queueIndex.value = 0
    }

    if (options.resetTime !== false) currentTime.value = 0
    if (typeof options.playing === 'boolean') isPlaying.value = options.playing
  }

  const addToQueue = (track) => {
    if (!track?._id) return
    const exists = queue.value.some((q) => String(q?._id) === String(track._id))
    if (exists) return
    queue.value.push(track)
  }

  const setCurrentTime = (time) => {
    currentTime.value = Number(time) || 0
  }

  const setPlaying = (value) => {
    isPlaying.value = !!value
  }

  const toggleShuffle = () => {
    shuffle.value = !shuffle.value
  }

  const cycleRepeatMode = () => {
    repeatMode.value =
      repeatMode.value === 'off'
        ? 'all'
        : repeatMode.value === 'all'
          ? 'one'
          : 'off'
  }

  const playNext = () => {
    if (!queue.value.length) return null

    if (shuffle.value && queue.value.length > 1) {
      let nextIndex = queueIndex.value >= 0 ? queueIndex.value : findQueueIndex(currentTrack.value?._id)
      while (nextIndex === queueIndex.value || nextIndex < 0) {
        nextIndex = Math.floor(Math.random() * queue.value.length)
      }
      queueIndex.value = nextIndex
    } else {
      const baseIndex = queueIndex.value >= 0 ? queueIndex.value : findQueueIndex(currentTrack.value?._id)

      if (baseIndex < queue.value.length - 1) {
        queueIndex.value = baseIndex + 1
      } else if (repeatMode.value === 'all') {
        queueIndex.value = 0
      } else {
        isPlaying.value = false
        return null
      }
    }

    currentTrack.value = queue.value[queueIndex.value] || null
    currentTime.value = 0
    isPlaying.value = true
    return currentTrack.value
  }

  const playPrev = () => {
    if (!queue.value.length) return null

    const baseIndex = queueIndex.value >= 0 ? queueIndex.value : findQueueIndex(currentTrack.value?._id)
    const prevIndex = baseIndex > 0 ? baseIndex - 1 : queue.value.length - 1

    queueIndex.value = prevIndex
    currentTrack.value = queue.value[prevIndex] || null
    currentTime.value = 0
    isPlaying.value = true
    return currentTrack.value
  }

  const removeFromQueue = (trackId) => {
    const id = String(trackId || '')
    if (!id) return

    const wasCurrent = String(currentTrack.value?._id || '') === id
    queue.value = queue.value.filter((item) => String(item?._id || '') !== id)

    if (!queue.value.length) {
      currentTrack.value = null
      queueIndex.value = -1
      currentTime.value = 0
      isPlaying.value = false
      return
    }

    if (wasCurrent) {
      const nextIndex = Math.min(queueIndex.value, queue.value.length - 1)
      queueIndex.value = nextIndex
      currentTrack.value = queue.value[nextIndex]
      currentTime.value = 0
      return
    }

    queueIndex.value = findQueueIndex(currentTrack.value?._id)
  }

  const clearQueue = () => {
    queue.value = []
    queueIndex.value = -1
  }

  const openLyrics = () => { showLyricsPanel.value = true }
  const closeLyrics = () => { showLyricsPanel.value = false }
  const toggleLyrics = () => { showLyricsPanel.value = !showLyricsPanel.value }

  const openKaraoke = () => { showKaraokeMode.value = true }
  const closeKaraoke = () => { showKaraokeMode.value = false }
  const toggleKaraoke = () => { showKaraokeMode.value = !showKaraokeMode.value }

  const resetPlayer = () => {
    currentTrack.value = null
    queue.value = []
    queueIndex.value = -1
    currentTime.value = 0
    isPlaying.value = false
    shuffle.value = false
    repeatMode.value = 'off'
    showLyricsPanel.value = false
    showKaraokeMode.value = false
  }

  return {
    currentTrack,
    queue,
    queueIndex,
    currentTime,
    isPlaying,
    shuffle,
    repeatMode,
    showLyricsPanel,
    showKaraokeMode,
    hasQueue,
    currentTrackId,
    setQueue,
    setTrack,
    addToQueue,
    setCurrentTime,
    setPlaying,
    toggleShuffle,
    cycleRepeatMode,
    playNext,
    playPrev,
    removeFromQueue,
    clearQueue,
    openLyrics,
    closeLyrics,
    toggleLyrics,
    openKaraoke,
    closeKaraoke,
    toggleKaraoke,
    resetPlayer,
  }
})