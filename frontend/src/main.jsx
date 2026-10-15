import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { Analytics } from "@vercel/analytics/react"

import 'bootstrap/dist/css/bootstrap.min.css'
import './index.css'
import 'leaflet/dist/leaflet.css';

const root = createRoot(document.getElementById('root'))

// A build without its Supabase settings would otherwise show a blank page.
const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'].filter((k) => !import.meta.env[k])

if (missing.length) {
  console.error('Missing environment variables:', missing.join(', '))
  root.render(
    <div role="alert" style={{ maxWidth: 480, margin: '15vh auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '1.25rem', marginBottom: 8 }}>AGOS is not set up</h1>
      <p>Missing settings: {missing.join(', ')}.</p>
    </div>
  )
} else {
  // Loaded only when configured: importing the app creates the Supabase client.
  Promise.all([import('./App.jsx'), import('./components/ErrorBoundary.jsx')]).then(([{ default: App }, { default: ErrorBoundary }]) => {
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
        <Analytics />
      </StrictMode>
    )
  })
}
