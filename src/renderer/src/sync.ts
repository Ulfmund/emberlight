import { useEffect } from 'react'
import { api } from './api'
import { useGame } from './store'

/** How often an open adventure checks whether it moved on somewhere else. */
const EVERY_MS = 3000

/**
 * One adventure, several screens (docs/spec/08-ui-ux.md#one-adventure-several-screens). The PC
 * and a paired phone play the same story through the PC's server, so each screen checks every
 * few seconds, and whenever it wakes, whether anything changed, and catches up. It also learns
 * when the DM is answering a turn sent from the other screen.
 */
export function useSync(campaignId: string) {
  useEffect(() => {
    let alive = true
    let checking = false
    const check = async () => {
      if (!alive || checking || document.visibilityState !== 'visible') return
      const g = useGame.getState()
      if (g.busy || g.view?.id !== campaignId) return
      checking = true
      try {
        const s = await api.stamp(campaignId)
        const now = useGame.getState()
        if (!alive || now.busy || now.view?.id !== campaignId) return
        if (now.elsewhere !== s.answering) useGame.setState({ elsewhere: s.answering })
        if (s.stamp && s.stamp !== now.view.stamp) {
          // The story itself moved: follow it if it carried on from here, ask if it split. Only the
          // journal or the like changed: just catch up.
          if ((s.head ?? null) !== (now.view.headId ?? null)) await now.reconcile()
          else await now.refresh()
        }
      } catch {
        // Off the network for a moment: the next check tries again.
      } finally {
        checking = false
      }
    }
    const timer = window.setInterval(() => void check(), EVERY_MS)
    const wake = () => void check()
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('focus', wake)
    return () => {
      alive = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('focus', wake)
      useGame.setState({ elsewhere: false })
    }
  }, [campaignId])
}
