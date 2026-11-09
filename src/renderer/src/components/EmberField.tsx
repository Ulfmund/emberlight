import { useEffect, useRef } from 'react'

type Ember = { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; flicker: number }

/**
 * Drifting embers drawn on a canvas behind the UI. Cheap: a few dozen particles, additive
 * blending, paused when the tab is hidden, and static when the OS asks for reduced motion.
 */
export function EmberField({ density = 1, className = '' }: { density?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0
    let h = 0
    let raf = 0
    const embers: Ember[] = []

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const spawn = (anywhere = false): Ember => {
      const max = 6 + Math.random() * 8
      return {
        x: Math.random() * w,
        y: anywhere ? Math.random() * h : h + 10,
        vx: (Math.random() - 0.5) * 12,
        vy: -(14 + Math.random() * 34),
        r: 0.6 + Math.random() * 1.8,
        life: anywhere ? Math.random() * max : 0,
        max,
        flicker: Math.random() * Math.PI * 2
      }
    }

    resize()
    const count = Math.round(((w * h) / 22000) * density)
    for (let i = 0; i < count; i++) embers.push(spawn(true))

    let last = performance.now()
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < embers.length; i++) {
        const e = embers[i]
        if (!reduced) {
          e.life += dt
          e.flicker += dt * 6
          e.vx += Math.sin(now / 900 + i) * 4 * dt
          e.x += e.vx * dt
          e.y += e.vy * dt
          if (e.life > e.max || e.y < -10) embers[i] = spawn()
        }
        const t = e.life / e.max
        const fade = Math.sin(Math.PI * Math.min(1, t)) * (0.75 + 0.25 * Math.sin(e.flicker))
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 6)
        g.addColorStop(0, `rgba(255,214,150,${0.95 * fade})`)
        g.addColorStop(0.25, `rgba(255,130,50,${0.55 * fade})`)
        g.addColorStop(1, 'rgba(255,90,20,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(e.x, e.y, e.r * 6, 0, Math.PI * 2)
        ctx.fill()
      }
      if (!reduced) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    const onVis = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden && !reduced) {
        last = performance.now()
        raf = requestAnimationFrame(draw)
      }
    }
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [density])

  return <canvas ref={ref} className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} />
}
