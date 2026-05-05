const { createClient } = require('@supabase/supabase-js')
const WebSocket = require('ws')

if (!process.env.SUPABASE_URL) {
  throw new Error('SUPABASE_URL is missing')
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing')
}

global.WebSocket = WebSocket

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    realtime: {
      transport: WebSocket,
    },
  }
)

module.exports = supabase