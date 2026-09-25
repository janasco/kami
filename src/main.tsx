import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { LandingPage } from './LandingPage'
import './styles.css'
import './landing.css'

const isEditorRoute = window.location.pathname.replace(/\/$/, '') === '/editor'

document.documentElement.classList.toggle('landing-mode', !isEditorRoute)
document.body.classList.toggle('landing-mode', !isEditorRoute)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isEditorRoute ? <App /> : <LandingPage />}
  </StrictMode>,
)
