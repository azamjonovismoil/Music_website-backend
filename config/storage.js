const path = require('path')
const crypto = require('crypto')
const supabase = require('./supabase')

const COVERS_BUCKET = process.env.SUPABASE_BUCKET_COVERS || 'music-covers'
const SONGS_BUCKET = process.env.SUPABASE_BUCKET_SONGS || 'music-songs'

const sanitizeBaseName = (filename = 'file') => {
  const ext = path.extname(filename)
  return (
    path
      .basename(filename, ext)
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase() || 'file'
  )
}

const makeFileKey = (folder, originalname = 'file') => {
  const ext = path.extname(originalname || '').toLowerCase()
  const safe = sanitizeBaseName(originalname)
  const rand = crypto.randomBytes(6).toString('hex')
  return `${folder}/${Date.now()}-${rand}-${safe}${ext}`
}

const uploadBufferToBucket = async ({ bucket, key, buffer, contentType }) => {
  const { error } = await supabase.storage.from(bucket).upload(key, buffer, {
    contentType,
    upsert: false,
  })

  if (error) throw error

  const { data } = supabase.storage.from(bucket).getPublicUrl(key)

  return {
    path: key,
    url: data.publicUrl,
  }
}

const removeFromBucket = async ({ bucket, key }) => {
  if (!key) return
  const { error } = await supabase.storage.from(bucket).remove([key])
  if (error) throw error
}

module.exports = {
  COVERS_BUCKET,
  SONGS_BUCKET,
  makeFileKey,
  uploadBufferToBucket,
  removeFromBucket,
}