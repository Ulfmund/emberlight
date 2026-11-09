import { useEffect, useState } from 'react'
import { DEFAULT_EMBEDDING_SETTINGS, type EmbeddingSettings } from '@shared/embeddings'
import type { Connection } from '@shared/types'
import { api } from '../api'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'

/**
 * Memory by meaning (docs/spec/07-memory-and-lore.md#memory-by-meaning): an embedding model lets
 * the DM recall people, places and lore by what's happening, not only by name. Optional.
 */
export function EmbeddingSettingsPanel({ connection }: { connection: Connection | null | undefined }) {
  const [s, setS] = useState<EmbeddingSettings>(DEFAULT_EMBEDDING_SETTINGS)
  const [hasKey, setHasKey] = useState(false)
  const [key, setKey] = useState('')
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<{ busy?: boolean; saved?: boolean; error?: string; result?: string }>({})
  const local = Boolean(connection && connection.kind !== 'anthropic')

  useEffect(() => {
    api
      .embeddingSettings()
      .then((r) => {
        const { hasKey: k, ready: _ready, ...rest } = r
        setS(rest)
        setHasKey(k)
        setOpen(rest.enabled)
      })
      .catch(() => {})
  }, [])

  const set = (p: Partial<EmbeddingSettings>) => setS((x) => ({ ...x, ...p }))
  const persist = async () => {
    if (s.baseUrl.trim() && key.trim()) {
      await api.saveKey('embeddings', key.trim())
      setKey('')
      setHasKey(true)
    }
    const r = await api.saveEmbeddingSettings(s)
    setHasKey(r.hasKey)
    return r
  }
  const save = async () => {
    setState({ busy: true })
    try {
      await persist()
      setState({ saved: true })
    } catch (e) {
      setState({ error: (e as Error).message })
    }
  }
  const test = async () => {
    setState({ busy: true })
    try {
      await persist()
      const r = await api.testEmbeddings()
      const fine = r.alike > r.unlike + 0.1
      setState({ result: `${fine ? 'Working' : 'It answers, but it can barely tell sentences apart'}: ${r.dims} numbers per text. Two sentences that mean the same scored ${r.alike.toFixed(2)}; an unrelated one ${r.unlike.toFixed(2)}.` })
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
        <Icon name="book" size={20} className="text-gold-300" />
        <span className="flex-1">
          <span className="block font-display text-lg tracking-wider text-gold-200">Memory by meaning</span>
          <span className="block text-sm text-parchment-400">
            {s.enabled ? `On, with ${s.model || 'no model yet'}.` : 'Optional: the DM recalls people, places and lore by what is happening, not only by name.'}
          </span>
        </span>
        <Icon name="chevron" size={18} className={`text-parchment-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-5 grid gap-5 border-t border-gold-500/15 pt-5 md:grid-cols-2">
          <p className="text-sm text-parchment-300 md:col-span-2">
            It needs an <b>embedding model</b>: a small model that turns text into numbers, so things that mean the same end up close. In LM Studio, download and load one such as <i>nomic-embed-text</i>; in Ollama, run <code className="text-gold-200">ollama pull nomic-embed-text</code>. It's quick, and each text is only worked out once.
          </p>
          {label(
            'Memory by meaning',
            undefined,
            <select value={s.enabled ? 'on' : 'off'} onChange={(e) => set({ enabled: e.target.value === 'on' })} className="input">
              <option value="off">Off (names and keywords only)</option>
              <option value="on">On</option>
            </select>
          )}
          {label(
            'Model',
            'Its name as the server lists it.',
            <input value={s.model} onChange={(e) => set({ model: e.target.value })} placeholder={connection?.kind === 'ollama' ? 'nomic-embed-text' : 'text-embedding-nomic-embed-text-v1.5'} className="input" />
          )}
          <div className="md:col-span-2">
            {label(
              'Address',
              local && !s.baseUrl.trim()
                ? 'Empty: the same server as the story model.'
                : !local && !s.baseUrl.trim()
                  ? 'Claude has no embedding models: give the address of one (LM Studio, Ollama, llama.cpp, or an embeddings API).'
                  : 'An OpenAI-compatible server, ending in /v1.',
              <input value={s.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} placeholder={local ? 'Same as the story model' : 'http://localhost:1234/v1'} className="input" />
            )}
          </div>
          {s.baseUrl.trim() &&
            label(
              'API key',
              hasKey ? 'A key is saved (encrypted). Type a new one to replace it.' : 'Only for a cloud service. Saved encrypted on this computer.',
              <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={hasKey ? '••••••••' : 'Optional'} className="input" autoComplete="off" />
            )}
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <Button variant="primary" size="sm" icon="check" disabled={state.busy} onClick={() => void save()}>
              Save
            </Button>
            <Button variant="secondary" size="sm" icon="sparkle" disabled={state.busy || !s.enabled || !s.model.trim()} onClick={() => void test()}>
              Test
            </Button>
            {state.saved && <span className="text-sm text-moss-400">Saved.</span>}
            {state.result && <span className="text-sm text-parchment-300">{state.result}</span>}
            {state.error && <span className="text-sm text-blood-400">{state.error}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
