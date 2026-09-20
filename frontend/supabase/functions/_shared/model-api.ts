// Single source of truth for reaching the flood model API from edge functions.
//
// The model URL is configuration, not code: it is read from the
// MODEL_BASE_URL environment variable (`supabase secrets set MODEL_BASE_URL=...`)
// so it can change without a redeploy of the code. There is deliberately NO
// hardcoded fallback host -- a stale fallback silently masks a dead backend.

// Matches the backend's DEFAULT_MODEL_KEY.
export const MODEL_KEY = 'gru'

export const PATHS = {
  predict:  '/api/predict-flood',
  forecast: `/api/forecast-flood/${MODEL_KEY}`,
} as const

function getBaseUrl(): string {
  const url = Deno.env.get('MODEL_BASE_URL')
  if (!url) {
    throw new Error('MODEL_BASE_URL is not set. Run: supabase secrets set MODEL_BASE_URL=https://<your-model-host>')
  }
  return url.replace(/\/+$/, '')
}

export async function fetchModel(path: string) {
  const baseUrl = getBaseUrl()
  // Fail cleanly rather than hang until the edge runtime kills the function.
  const res = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`Model API error: ${res.status} (${baseUrl}${path})`)
  const data = await res.json()
  // The backend can return HTTP 200 with `status: "error"` in the body.
  if (data.status && data.status !== 'success') {
    throw new Error(data.message || 'Model API returned error status')
  }
  return data
}

export const fetchPrediction = () => fetchModel(PATHS.predict)
export const fetchForecast   = () => fetchModel(PATHS.forecast)
