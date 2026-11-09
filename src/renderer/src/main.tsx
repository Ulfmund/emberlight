import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import '@fontsource/cinzel/500.css'
import '@fontsource/cinzel/700.css'
import '@fontsource/crimson-pro/400.css'
import '@fontsource/crimson-pro/400-italic.css'
import '@fontsource/crimson-pro/600.css'
import '@fontsource-variable/inter'
import './styles.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* "user" = follow the operating system's reduce-motion setting */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>
)
