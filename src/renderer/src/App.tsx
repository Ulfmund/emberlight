import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { findPreset } from '@shared/presets'
import { useGame } from './store'
import { TitleBar } from './components/TitleBar'
import { Button } from './components/Button'
import { TitleScreen } from './screens/TitleScreen'
import { ConnectScreen } from './screens/ConnectScreen'
import { CreatorScreen } from './screens/CreatorScreen'
import { PlayScreen } from './screens/PlayScreen'
import { LoadScreen } from './screens/LoadScreen'

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
          transition={{ duration: 0.3 }}
        >
          {screen === 'title' && <TitleScreen />}
          {screen === 'connect' && <ConnectScreen />}
          {screen === 'creator' && <CreatorScreen />}
          {screen === 'load' && <LoadScreen />}
          {screen === 'play' && <PlayScreen />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

const LABEL: Record<string, string> = { connect: 'CONNECT', creator: 'NEW ADVENTURER', load: 'ADVENTURES', play: 'ADVENTURE' }

function BarContent() {
  const { screen, go, settings, view, loadCampaigns } = useGame()
  if (screen === 'title') return null
  const conn = settings?.connection
  return (
    <>
      <span className="text-parchment-500">/</span>
      <span className="truncate font-display text-[0.78rem] tracking-[0.2em] text-parchment-200">
        {screen === 'play' && view ? view.name.toUpperCase() : LABEL[screen]}
      </span>
      {screen === 'play' && (
        <div className="ml-auto flex items-center gap-1">
          {conn && (
            <button onClick={() => go('connect')} className="no-drag mr-2 hidden cursor-pointer truncate text-xs text-parchment-500 hover:text-gold-300 md:inline" title="Change model">
              {findPreset(conn.presetId)?.label} · {conn.model}
            </button>
          )}
          <Button
            variant="ghost"
            size="sm"
            icon="back"
            onClick={() => {
              void loadCampaigns()
              go('title')
            }}
          >
            Menu
          </Button>
        </div>
      )}
    </>
  )
}
