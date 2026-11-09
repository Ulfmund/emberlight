import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig, MotionGlobalConfig } from 'motion/react'
import '@fontsource/cinzel/500.css'
import '@fontsource/cinzel/700.css'
import '@fontsource/crimson-pro/400.css'
import '@fontsource/crimson-pro/400-italic.css'
import '@fontsource/crimson-pro/600.css'
import '@fontsource-variable/inter'
import './styles.css'
import { App } from './App'
import { useEffectsLevel } from './prefs'
import { unlockAudio } from './sound'

// Testing aid (development only): ?test=1 makes animations finish instantly, so screens can
// be checked in a background browser tab where animation frames don't run.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('test')) {
  MotionGlobalConfig.skipAnimations = true
  document.documentElement.classList.add('test-mode')
}

// Browsers allow sound only after a first touch or click.
for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, unlockAudio, { once: true, capture: true })

/** "Off" stops animation everywhere; otherwise the operating system's reduce-motion setting is followed. */
function Motion({ children }: { children: React.ReactNode }) {
  const effects = useEffectsLevel()
  return <MotionConfig reducedMotion={effects === 'off' ? 'always' : 'user'}>{children}</MotionConfig>
}

// Files dropped anywhere but a drop zone are ignored (instead of the window opening them).
for (const type of ['dragover', 'drop'] as const) window.addEventListener(type, (e) => e.preventDefault())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Motion>
      <App />
    </Motion>
  </StrictMode>
)
