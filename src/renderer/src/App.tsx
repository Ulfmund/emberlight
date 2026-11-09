import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { findPreset } from '@shared/presets'
import { useGame } from './store'
import { TitleBar } from './components/TitleBar'
import { Button } from './components/Button'
import { TitleScreen } from './screens/TitleScreen'
import { ConnectScreen } from './screens/ConnectScreen'
import { PlayScreen } from './screens/PlayScreen'

export function App() {
  const { screen, loadSettings } = useGame()

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  return (
    <div className="flex h-full flex-col bg-ink-950">
      <TitleBar>
        <BarContent />
      </TitleBar>
      <AnimatePresence mode="wait">
        <motion.div
          key={screen}
          className="flex min-h-0 flex-1 flex-col"
          initial={{ opacity: 0, filter: 'blur(8px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, filter: 'blur(8px)' }}
          transition={{ duration: 0.35 }}
        >
          {screen === 'title' && <TitleScreen />}
          {screen === 'connect' && <ConnectScreen />}
          {screen === 'play' && <PlayScreen />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function BarContent() {
  const { screen, go, settings, newStory, streaming } = useGame()
  if (screen !== 'play') return null
  const conn = settings?.connection
  return (
    <>
      <span className="text-parchment-500">/</span>
      <span className="font-display text-[0.78rem] tracking-[0.2em] text-parchment-200">ADVENTURE</span>
      <div className="ml-auto flex items-center gap-1">
        {conn && (
          <span className="mr-2 hidden truncate text-xs text-parchment-500 md:inline">
            {findPreset(conn.presetId)?.label} · {conn.model}
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          icon="d20"
          disabled={streaming}
          onClick={newStory}
          title="Start a fresh adventure"
        >
          New
        </Button>
        <Button variant="ghost" size="sm" icon="back" onClick={() => go('title')}>
          Menu
        </Button>
      </div>
    </>
  )
}
