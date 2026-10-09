import { createClient } from '@supabase/supabase-js'

let clientPromise

export function getSupabaseClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      let response
      try {
        response = await fetch('/api/config')
      } catch {
        throw new Error('ToKa Fitness could not reach its configuration API. Start the FastAPI server and try again.')
      }

      let config
      try {
        config = await response.json()
      } catch {
        throw new Error(`The configuration API returned an unexpected response (HTTP ${response.status}). Check that FastAPI is running.`)
      }
      if (!response.ok) {
        throw new Error(config.detail || 'The Supabase account service is not configured.')
      }
      if (!config.supabase_url || !config.supabase_publishable_key) {
        throw new Error('The Supabase account service is not configured on the API server.')
      }
      return createClient(config.supabase_url, config.supabase_publishable_key)
    })()
      .catch((error) => {
        clientPromise = null
        throw error
      })
  }
  return clientPromise
}
