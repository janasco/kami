import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { LandingPage } from './LandingPage'
import './styles.css'
import './landing.css'

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '')
const appPath = window.location.pathname.startsWith(basePath)
  ? window.location.pathname.slice(basePath.length) || '/'
  : window.location.pathname
const isEditorRoute = appPath.replace(/\/$/, '') === '/editor'

document.documentElement.classList.toggle('landing-mode', !isEditorRoute)
document.body.classList.toggle('landing-mode', !isEditorRoute)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isEditorRoute ? <App /> : <LandingPage />}
  </StrictMode>,
)
