import { useEffect, useState } from 'react'
import { DEFAULT_IMAGE_SETTINGS, IMAGE_BACKENDS, type ImageBackend, type ImageSettings } from '@shared/images'
import { api } from '../api'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'

/**
 * Images (docs/spec/03-characters-and-cards.md#image-generation): which image generator makes
 * portraits, and in what style. Optional; everything works without one.
 */
export function ImageSettingsPanel() {
  const [s, setS] = useState<ImageSettings>(DEFAULT_IMAGE_SETTINGS)
  const [hasKey, setHasKey] = useState(false)
  const [key, setKey] = useState('')
  const [open, setOpen] = useState(false)
  const [workflow, setWorkflow] = useState(false)
  const [state, setState] = useState<{ busy?: boolean; saved?: boolean; error?: string; picture?: string }>({})

  useEffect(() => {
    api
      .imageSettings()
      .then((r) => {
        const { hasKey: k, ...rest } = r
        setS(rest)
        setHasKey(k)
        setOpen(rest.backend !== 'none')
        setWorkflow(Boolean(rest.workflow))
      })
      .catch(() => {})
  }, [])

  const set = (p: Partial<ImageSettings>) => setS((x) => ({ ...x, ...p }))
  const choose = (backend: ImageBackend) => set({ backend, baseUrl: backend === 'none' ? '' : s.backend === backend ? s.baseUrl : IMAGE_BACKENDS[backend].url })

  const save = async () => {
    setState({ busy: true })
    try {
      if (s.backend === 'openai' && key.trim()) {
        await api.saveKey('images', key.trim())
        setKey('')
        setHasKey(true)
      }
      const r = await api.saveImageSettings({ ...s, workflow: workflow ? s.workflow : '' })
      setHasKey(r.hasKey)
      setState({ saved: true })
    } catch (e) {
      setState({ error: (e as Error).message })
    }
  }
  const test = async () => {
    setState({ busy: true })
    try {
      await api.saveImageSettings({ ...s, workflow: workflow ? s.workflow : '' })
      if (s.backend === 'openai' && key.trim()) {
        await api.saveKey('images', key.trim())
        setKey('')
        setHasKey(true)
      }
      setState({ picture: await api.testImages() })
    } catch (e) {
      setState({ error: (e as Error).message })
    }
  }

  const label = (text: string, hint?: string, control?: React.ReactNode) => (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold tracking-[0.14em] text-gold-400 uppercase">{text}</span>
      {control}
      {hint && <span className="mt-1.5 block text-xs text-parchment-500">{hint}</span>}
    </label>
  )

  return (
    <div className="panel mt-6 rounded-2xl p-5 md:p-6">
      <button onClick={() => setOpen(!open)} className="no-drag flex w-full cursor-pointer items-center gap-3 text-left">
        <Icon name="sparkle" size={20} className="text-gold-300" />
        <span className="flex-1">
          <span className="block font-display text-lg tracking-wider text-gold-200">Images</span>
          <span className="block text-sm text-parchment-400">
            {s.backend === 'none' ? 'Optional: paint portraits with Stable Diffusion, ComfyUI or an images API.' : `Portraits from ${IMAGE_BACKENDS[s.backend].label}.`}
          </span>
        </span>
        <Icon name="chevron" size={18} className={`text-parchment-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-5 grid gap-5 border-t border-gold-500/15 pt-5 md:grid-cols-2">
          {label(
            'Image generator',
            s.backend === 'none' ? 'Without one, you can still upload your own pictures.' : IMAGE_BACKENDS[s.backend].hint,
            <select value={s.backend} onChange={(e) => choose(e.target.value as ImageBackend)} className="input">
              <option value="none">None</option>
              {(Object.keys(IMAGE_BACKENDS) as (keyof typeof IMAGE_BACKENDS)[]).map((k) => (
                <option key={k} value={k}>
                  {IMAGE_BACKENDS[k].label}
                </option>
              ))}
            </select>
          )}
          {s.backend !== 'none' && (
            <>
              {label('Address', undefined, <input value={s.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} placeholder={IMAGE_BACKENDS[s.backend].url} className="input" />)}
              {label('Model', s.backend === 'sdwebui' ? 'Empty: the model it has loaded.' : undefined, <input value={s.model} onChange={(e) => set({ model: e.target.value })} placeholder={s.backend === 'openai' ? 'gpt-image-1' : s.backend === 'comfyui' ? 'sd_xl_base_1.0.safetensors' : ''} className="input" />)}
              {s.backend === 'openai' &&
                label(
                  'API key',
                  hasKey ? 'A key is saved (encrypted). Type a new one to replace it.' : 'Saved encrypted on this computer; never shown again.',
                  <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={hasKey ? '••••••••' : 'sk-…'} className="input" autoComplete="off" />
                )}
              <div className="md:col-span-2">{label('Art style', 'Added to every portrait. The artist can make it their own.', <textarea value={s.style} onChange={(e) => set({ style: e.target.value })} rows={2} className="input w-full resize-y text-sm" />)}</div>
              {label(
                'Paint people who matter',
                'When someone keeps coming up in the story, is tied to you, or travels with you, their portrait is painted in the background, unasked. Each person once.',
                <select value={s.autoPortraits ? 'on' : 'off'} onChange={(e) => set({ autoPortraits: e.target.value === 'on' })} className="input">
                  <option value="off">Off: only when I ask</option>
                  <option value="on">On</option>
                </select>
              )}
              {s.backend !== 'openai' && (
                <div className="md:col-span-2">{label('Leave out', undefined, <textarea value={s.negative} onChange={(e) => set({ negative: e.target.value })} rows={2} className="input w-full resize-y text-sm" />)}</div>
              )}
              {s.backend !== 'openai' && (
                <>
                  {label(
                    'Size',
                    undefined,
                    <select value={s.size} onChange={(e) => set({ size: Number(e.target.value) as ImageSettings['size'] })} className="input">
                      <option value={512}>512 × 512 (SD 1.5)</option>
                      <option value={768}>768 × 768</option>
                      <option value={1024}>1024 × 1024 (SDXL)</option>
                    </select>
                  )}
                  {label('Steps', undefined, <input type="number" min={4} max={80} value={s.steps} onChange={(e) => set({ steps: Math.max(4, Math.min(80, Number(e.target.value) || 28)) })} className="input" />)}
                </>
              )}
              {s.backend === 'comfyui' && (
                <div className="md:col-span-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-parchment-300">
                    <input type="checkbox" checked={workflow} onChange={(e) => setWorkflow(e.target.checked)} />
                    Use my own workflow
                  </label>
                  {workflow && (
                    <textarea
                      value={s.workflow}
                      onChange={(e) => set({ workflow: e.target.value })}
                      rows={6}
                      placeholder='Paste a workflow saved with "Save (API format)". Put {{prompt}}, {{negative}}, {{seed}}, {{width}}, {{height}}, {{steps}} and {{model}} where they go.'
                      className="input mt-2 w-full resize-y font-mono text-xs"
                    />
                  )}
                </div>
              )}
            </>
          )}
          <div className="flex flex-wrap items-center justify-end gap-3 md:col-span-2">
            {state.error && <span className="mr-auto text-sm text-blood-400">{state.error}</span>}
            {state.saved && <span className="mr-auto text-sm text-moss-400">Saved.</span>}
            {s.backend !== 'none' && (
              <Button variant="secondary" onClick={() => void test()} disabled={state.busy || !s.baseUrl.trim()}>
                {state.busy && !state.saved ? 'Painting a test…' : 'Test'}
              </Button>
            )}
            <Button variant="primary" icon="check" onClick={() => void save()} disabled={state.busy}>
              Save images
            </Button>
          </div>
          {state.picture && <img src={state.picture} alt="A test portrait" className="mx-auto max-h-64 rounded-xl border border-gold-500/30 md:col-span-2" />}
        </div>
      )}
    </div>
  )
}
