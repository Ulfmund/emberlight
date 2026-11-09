import { useEffect, useMemo, useState } from 'react'
import { ImageSettingsPanel } from './ImageSettingsPanel'
import { EmbeddingSettingsPanel } from './EmbeddingSettingsPanel'
import { AnimatePresence, motion } from 'motion/react'
import { PRESETS, findPreset, type Preset } from '@shared/presets'
import type { Connection, TestResult } from '@shared/types'
import { api } from '../api'
import { useGame } from '../store'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { EmberField } from '../components/EmberField'

export function ConnectScreen() {
  const { settings, setSettings, go } = useGame()
  const saved = settings?.connection

  const [presetId, setPresetId] = useState(saved?.presetId ?? 'lmstudio')
  const preset = findPreset(presetId) as Preset
  const [baseUrl, setBaseUrl] = useState(saved?.baseUrl ?? preset.baseUrl)
  const [model, setModel] = useState(saved?.model ?? '')
  const [contextSize, setContextSize] = useState(saved?.contextSize ?? 0)
  const [key, setKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)
  const [saveError, setSaveError] = useState('')

  const hasSavedKey = settings?.savedKeys[presetId] ?? false

  const connection = useMemo<Connection>(
    () => ({ presetId, kind: preset.kind, baseUrl, model, contextSize }),
    [presetId, preset.kind, baseUrl, model, contextSize]
  )

  const pick = (p: Preset) => {
    if (p.id === presetId) return
    setPresetId(p.id)
    setBaseUrl(saved?.presetId === p.id ? saved.baseUrl : p.baseUrl)
    setModel(saved?.presetId === p.id ? saved.model : '')
    setKey('')
    setResult(null)
  }

  const test = async () => {
    setTesting(true)
    setResult(null)
    try {
      const r = await api.testConnection(connection, key || undefined)
      setResult(r)
      if (r.ok) {
        if (r.resolvedBaseUrl) setBaseUrl(r.resolvedBaseUrl)
        if (r.model) setModel(r.model)
      }
    } catch (err) {
      setResult({ ok: false, message: (err as Error).message })
    } finally {
      setTesting(false)
    }
  }

  // Test automatically when a preset is picked, so the model list just appears.
  useEffect(() => {
    if (!preset.needsKey || hasSavedKey) void test()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId])

  const changeModel = async (m: string) => {
    setModel(m)
    try {
      const r = await api.testConnection({ ...connection, model: m }, key || undefined)
      if (r.ok) setResult(r)
    } catch {
      /* keep the old result */
    }
  }

  const save = async () => {
    setSaving(true)
    setSaveError('')
    try {
      if (key.trim()) setSettings(await api.saveKey(presetId, key))
      setSettings(await api.saveConnection(connection))
      go('title')
    } catch (err) {
      setSaveError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const models = result?.ok ? result.models : []
  const ctx = result?.ok ? result.context : undefined

  return (
    <div className="relative flex-1 overflow-y-auto">
      <EmberField density={0.35} className="opacity-60" />
      <div className="relative z-10 mx-auto max-w-5xl px-4 pt-5 pb-16 md:px-8 md:pt-8">
        <div className="mb-6 flex items-center gap-3 md:mb-8 md:gap-4">
          <Button variant="ghost" icon="back" size="sm" onClick={() => go('title')} aria-label="Back" className="shrink-0 px-2 md:px-3">
            <span className="hidden md:inline">Back</span>
          </Button>
          <div className="min-w-0">
            <h2 className="font-display text-2xl tracking-wider text-gold-300 md:text-3xl">Connect a Model</h2>
            <p className="mt-1 text-parchment-400">Pick where your Dungeon Master's mind lives.</p>
          </div>
        </div>

        {/* Preset cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          {PRESETS.map((p, i) => {
            const active = p.id === presetId
            return (
              <motion.button
                key={p.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => pick(p)}
                className={`focus-ring group relative cursor-pointer overflow-hidden rounded-xl border p-4 text-left transition-colors ${
                  active
                    ? 'border-gold-400/80 bg-gradient-to-b from-gold-500/15 to-ink-850'
                    : 'border-gold-500/15 bg-ink-850/80 hover:border-gold-500/45'
                }`}
              >
                {active && (
                  <motion.div
                    layoutId="preset-glow"
                    className="absolute inset-0 rounded-xl shadow-[inset_0_0_30px_rgb(255_170_60/0.18),0_0_30px_-6px_rgb(255_150_40/0.5)]"
                  />
                )}
                <div className="relative flex items-start gap-3">
                  <div
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border transition-colors ${
                      active
                        ? 'border-gold-300/70 bg-gold-400/15 text-gold-200'
                        : 'border-gold-500/25 bg-ink-800 text-gold-400 group-hover:text-gold-300'
                    }`}
                  >
                    <Icon name={p.icon} size={24} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-parchment-50">{p.label}</span>
                      <span
                        className={`rounded px-1.5 py-px text-[0.62rem] font-semibold tracking-wider ${
                          p.local ? 'bg-moss-400/15 text-moss-400' : 'bg-arcane-400/15 text-arcane-400'
                        }`}
                      >
                        {p.local ? 'LOCAL' : 'CLOUD'}
                      </span>
                    </div>
                    <p className="mt-1 text-[0.8rem] leading-snug text-parchment-400">{p.blurb}</p>
                  </div>
                </div>
              </motion.button>
            )
          })}
        </div>

        {/* Details */}
        <motion.div layout className="panel mt-6 rounded-2xl p-6">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Address" hint={preset.kind === 'anthropic' ? 'Fixed for Claude' : 'Where the model server is listening'}>
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                disabled={preset.kind === 'anthropic'}
                spellCheck={false}
                className="input"
              />
            </Field>

            {settings?.remote && (preset.needsKey || presetId === 'custom') ? (
              <Field label="API key" hint={hasSavedKey ? 'A key is saved on the computer running Emberlight.' : 'Keys can only be entered on the computer running Emberlight.'}>
                <input disabled value="" placeholder={hasSavedKey ? '•••••••••••• (saved)' : 'Enter it on the computer'} className="input" />
              </Field>
            ) : preset.needsKey || presetId === 'custom' ? (
              <Field
                label="API key"
                hint={
                  hasSavedKey && !key
                    ? 'A key is saved. Type a new one to replace it.'
                    : settings?.secureStorage === false
                      ? 'Secure storage unavailable: keys can only come from .env'
                      : 'Stored encrypted on this PC, never shared'
                }
              >
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder={hasSavedKey ? '•••••••••••• (saved)' : 'Paste your key'}
                    spellCheck={false}
                    autoComplete="off"
                    className="input pr-10"
                  />
                  <button
                    onClick={() => setShowKey((s) => !s)}
                    className="no-drag absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer p-1 text-parchment-400 hover:text-gold-300"
                    title={showKey ? 'Hide key' : 'Show key'}
                  >
                    <Icon name="eye" size={18} />
                  </button>
                </div>
              </Field>
            ) : (
              <Field label="API key" hint="Not needed for models on this PC">
                <input disabled value="" placeholder="No key needed" className="input" />
              </Field>
            )}

            <Field label="Model" hint={models.length ? `${models.length} available` : 'Test the connection to load the list'}>
              <select value={model} onChange={(e) => void changeModel(e.target.value)} disabled={!models.length} className="input">
                {!models.length && <option value="">{model || 'No models loaded yet'}</option>}
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label ? `${m.label} (${m.id})` : m.id}
                  </option>
                ))}
              </select>
            </Field>

            <div className="flex items-end gap-3">
              <Button variant="secondary" icon={testing ? undefined : 'plug'} onClick={() => void test()} disabled={testing}>
                {testing ? <Spinner /> : null}
                {testing ? 'Testing…' : 'Test connection'}
              </Button>
              <button
                onClick={() => setAdvanced((a) => !a)}
                className="no-drag flex cursor-pointer items-center gap-1 py-2.5 text-sm text-parchment-400 hover:text-gold-300"
              >
                Advanced
                <Icon name="chevron" size={16} className={`transition-transform ${advanced ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {advanced && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-5 grid gap-5 border-t border-gold-500/15 pt-5 md:grid-cols-2">
                  <Field
                    label={preset.kind === 'anthropic' ? 'Context limit (tokens)' : 'Context size (tokens)'}
                    hint={
                      preset.kind === 'ollama'
                        ? '0 = automatic (up to 16k). Bigger remembers more but uses more memory.'
                        : preset.kind === 'anthropic'
                          ? "0 = 60k. Lower sends less of the story word for word each turn, so it costs less; the app's summaries fill the gap."
                          : "0 = 8k. Set it to the context length your model is loaded with, so the app knows how much story fits."
                    }
                  >
                    <input
                      type="number"
                      min={0}
                      step={1024}
                      value={contextSize}
                      onChange={(e) => setContextSize(Math.max(0, Number(e.target.value) || 0))}
                      className="input"
                    />
                  </Field>
                  <p className="self-end text-sm leading-relaxed text-parchment-400">
                    Generation settings (temperature and friends) and separate models for each DM job arrive in later
                    milestones.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Result */}
          <AnimatePresence mode="wait">
            {result && (
              <motion.div
                key={result.message + (ctx?.warning ?? '')}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-5 space-y-2"
              >
                <Banner tone={result.ok ? 'good' : 'bad'} icon={result.ok ? 'check' : 'x'}>
                  {result.message}
                  {result.ok && result.resolvedBaseUrl && ` Found it at ${result.resolvedBaseUrl}.`}
                  {result.ok && ctx && (ctx.requested || ctx.loaded || ctx.max) && (
                    <span className="text-parchment-400">
                      {' '}
                      Context: {fmtCtx(ctx.requested ?? ctx.loaded)}
                      {ctx.max && ctx.max !== (ctx.requested ?? ctx.loaded) ? ` (model max ${fmtCtx(ctx.max)})` : ''}.
                    </span>
                  )}
                </Banner>
                {ctx?.warning && (
                  <Banner tone="warn" icon="warn">
                    {ctx.warning}
                  </Banner>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-6 flex items-center justify-end gap-3 border-t border-gold-500/15 pt-5">
            {saveError && <span className="mr-auto text-sm text-blood-400">{saveError}</span>}
            <Button variant="ghost" onClick={() => go('title')}>
              Cancel
            </Button>
            <Button variant="primary" icon="check" onClick={() => void save()} disabled={!model || saving}>
              Save connection
            </Button>
          </div>
        </motion.div>
        {!settings?.remote && <ImageSettingsPanel />}
        {!settings?.remote && <EmbeddingSettingsPanel connection={settings?.connection} />}
      </div>
    </div>
  )
}

function fmtCtx(n?: number) {
  if (!n) return 'unknown'
  return n >= 1024 ? `${Math.round(n / 1024)}k tokens` : `${n} tokens`
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold tracking-[0.14em] text-gold-400 uppercase">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-parchment-500">{hint}</span>}
    </label>
  )
}

function Banner({ tone, icon, children }: { tone: 'good' | 'bad' | 'warn'; icon: string; children: React.ReactNode }) {
  const c =
    tone === 'good'
      ? 'border-moss-400/30 bg-moss-400/10 text-parchment-100 [&>svg]:text-moss-400'
      : tone === 'bad'
        ? 'border-blood-400/40 bg-blood-500/15 text-parchment-100 [&>svg]:text-blood-400'
        : 'border-gold-400/40 bg-gold-500/10 text-parchment-100 [&>svg]:text-gold-300'
  return (
    <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm leading-relaxed ${c}`}>
      <Icon name={icon} size={18} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  )
}

function Spinner() {
  return (
    <motion.span
      className="inline-block h-4 w-4 rounded-full border-2 border-gold-300/30 border-t-gold-300"
      animate={{ rotate: 360 }}
      transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
    />
  )
}
