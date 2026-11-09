import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
export const isConfigured = Boolean(url && key)

export const supabase = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder', {
  auth: { persistSession: true, autoRefreshToken: true },
  realtime: { params: { eventsPerSecond: 20 } },
})

// Short-lived signed URL for a private doodle image
export async function doodleUrl(path) {
  const { data, error } = await supabase.storage.from('doodles').createSignedUrl(path, 3600)
  if (error) return null
  return data.signedUrl
}
