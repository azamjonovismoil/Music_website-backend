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
  const rand = crypto.randomBytes(8).toString('hex')
  return `${folder}/${Date.now()}-${rand}-${safe}${ext}`
}

const uploadBufferToBucket = async ({ bucket, key, buffer, contentType }) => {
  if (!bucket) throw new Error('Bucket is required')
  if (!key) throw new Error('File key is required')
  if (!buffer) throw new Error('Buffer is required')

  const { data, error } = await supabase.storage.from(bucket).upload(key, buffer, {
    contentType: contentType || 'application/octet-stream',
    upsert: false,
    cacheControl: '3600',
  })

  if (error) {
    throw new Error(`[Storage upload] ${bucket}/${key}: ${error.message}`)
  }

  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(key)

  return {
    path: data?.path || key,
    url: publicData?.publicUrl || '',
    fullPath: data?.fullPath || '',
  }
}

const removeFromBucket = async ({ bucket, key }) => {
  if (!bucket || !key) return

  const cleanKey = String(key)
    .replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/public\/[^/]+\//, '')
    .replace(/^\/+/, '')

  const { error } = await supabase.storage.from(bucket).remove([cleanKey])

  if (error) {
    throw new Error(`[Storage remove] ${bucket}/${cleanKey}: ${error.message}`)
  }
}

module.exports = {
  COVERS_BUCKET,
  SONGS_BUCKET,
  makeFileKey,
  uploadBufferToBucket,
  removeFromBucket,
}