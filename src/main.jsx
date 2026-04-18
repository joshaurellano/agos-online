import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { Analytics } from "@vercel/analytics/react"

import 'bootstrap/dist/css/bootstrap.min.css'
import './index.css'

import App from './App.jsx'



createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
)
