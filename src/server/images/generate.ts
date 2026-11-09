import type { ImageSettings } from '@shared/images'

/**
 * Talks to an image server (docs/spec/03-characters-and-cards.md#image-generation): Stable
 * Diffusion WebUI or Forge, ComfyUI (with a basic text-to-image workflow, or the player's own),
 * or an OpenAI-compatible images API. Always returns the picture's bytes.
 */

export class ImageError extends Error {}

export type Picture = { mime: string; data: Buffer }

const trimUrl = (u: string) => u.trim().replace(/\/+$/, '')

async function ok(res: Response, server: string) {
  if (res.ok) return
  let detail = ''
  try {
    detail = (await res.text()).slice(0, 300)
  } catch {
    /* no body */
  }
  throw new ImageError(`${server} answered ${res.status}${detail ? `: ${detail}` : ''}`)
}

function reach(err: unknown, server: string, url: string): never {
  if (err instanceof ImageError) throw err
  if ((err as Error).name === 'AbortError' || (err as Error).name === 'TimeoutError') throw new ImageError(`${server} took too long to answer.`)
  throw new ImageError(`Couldn't reach ${server} at ${url}. Is it running?`)
}

const sniff = (b: Buffer): string => (b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b.subarray(8, 12).toString('latin1') === 'WEBP' ? 'image/webp' : 'image/png')

/** Square by default; a wide picture (a place) is half as wide again, kept to multiples of 64. */
export function dimensions(s: Pick<ImageSettings, 'size'>, wide = false): { width: number; height: number } {
  return wide ? { width: Math.round((s.size * 1.5) / 64) * 64, height: s.size } : { width: s.size, height: s.size }
}

/** ComfyUI: a plain checkpoint text-to-image graph, if the player hasn't given their own. */
export function comfyWorkflow(s: ImageSettings, prompt: string, seed: number, dims = dimensions(s)): Record<string, unknown> {
  const values: Record<string, string | number> = { prompt, negative: s.negative, seed, width: dims.width, height: dims.height, steps: s.steps, model: s.model }
  if (s.workflow.trim()) {
    // Each placeholder becomes the value, JSON-escaped. "{{seed}}" on its own becomes the bare value
    // (so numbers stay numbers); inside a longer string it's spliced in.
    const text = s.workflow.replace(/("?)\{\{(\w+)\}\}("?)/g, (m, open: string, k: string, close: string) => {
      if (!(k in values)) return m
      const v = values[k]
      if (open && close) return typeof v === 'number' ? String(v) : JSON.stringify(v)
      return `${open}${typeof v === 'number' ? String(v) : JSON.stringify(String(v)).slice(1, -1)}${close}`
    })
    try {
      return JSON.parse(text)
    } catch {
      throw new ImageError("The ComfyUI workflow isn't valid JSON. Export it with \"Save (API format)\".")
    }
  }
  if (!s.model.trim()) throw new ImageError('ComfyUI needs a model: the checkpoint file name, e.g. sd_xl_base_1.0.safetensors.')
  return {
    '3': { class_type: 'KSampler', inputs: { seed, steps: s.steps, cfg: 6.5, sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: 1, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] } },
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: s.model.trim() } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width: dims.width, height: dims.height, batch_size: 1 } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['4', 1] } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: s.negative, clip: ['4', 1] } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'emberlight', images: ['8', 0] } }
  }
}

export async function generateImage(s: ImageSettings, key: string | undefined, prompt: string, opts: { signal?: AbortSignal; pollMs?: number; timeoutMs?: number; wide?: boolean } = {}): Promise<Picture> {
  const dims = dimensions(s, opts.wide)
  const base = trimUrl(s.baseUrl)
  if (s.backend === 'none' || !base) throw new ImageError('No image generator is set up. Choose one under Connect a Model, Images.')
  const timeout = opts.timeoutMs ?? 300_000
  const signal = opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout)

  if (s.backend === 'sdwebui') {
    const server = 'Stable Diffusion WebUI'
    let res: Response
    try {
      res = await fetch(`${base}/sdapi/v1/txt2img`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          prompt,
          negative_prompt: s.negative,
          width: dims.width,
          height: dims.height,
          steps: s.steps,
          cfg_scale: 6,
          batch_size: 1,
          ...(s.model.trim() ? { override_settings: { sd_model_checkpoint: s.model.trim() } } : {})
        })
      })
    } catch (err) {
      reach(err, server, base)
    }
    await ok(res, server)
    const j = (await res.json()) as { images?: string[] }
    const b64 = j.images?.[0]
    if (!b64) throw new ImageError(`${server} sent back no picture.`)
    const data = Buffer.from(b64.replace(/^data:[^,]+,/, ''), 'base64')
    return { mime: sniff(data), data }
  }

  if (s.backend === 'comfyui') {
    const server = 'ComfyUI'
    const seed = Math.floor(Math.random() * 2 ** 31)
    const workflow = comfyWorkflow(s, prompt, seed, dims)
    let id: string
    try {
      const res = await fetch(`${base}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, body: JSON.stringify({ prompt: workflow, client_id: 'emberlight' }) })
      await ok(res, server)
      id = ((await res.json()) as { prompt_id?: string }).prompt_id ?? ''
      if (!id) throw new ImageError(`${server} didn't accept the workflow.`)
      // Wait for it to finish, then fetch the first picture it saved.
      for (;;) {
        await new Promise((r) => setTimeout(r, opts.pollMs ?? 1000))
        const h = await fetch(`${base}/history/${encodeURIComponent(id)}`, { signal })
        await ok(h, server)
        const hist = ((await h.json()) as Record<string, { outputs?: Record<string, { images?: { filename: string; subfolder: string; type: string }[] }>; status?: { status_str?: string } }>)[id]
        if (hist?.status?.status_str === 'error') throw new ImageError(`${server} hit an error running the workflow. Check its window for details.`)
        const img = Object.values(hist?.outputs ?? {}).flatMap((o) => o.images ?? [])[0]
        if (!img) continue
        const v = await fetch(`${base}/view?${new URLSearchParams({ filename: img.filename, subfolder: img.subfolder, type: img.type })}`, { signal })
        await ok(v, server)
        const data = Buffer.from(await v.arrayBuffer())
        return { mime: sniff(data), data }
      }
    } catch (err) {
      reach(err, server, base)
    }
  }

  // An OpenAI-compatible images API.
  const server = 'The image service'
  if (!key) throw new ImageError('The images API needs an API key (saved under Connect a Model, Images).')
  let res: Response
  try {
    res = await fetch(`${base}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      signal,
      body: JSON.stringify({ model: s.model.trim() || 'gpt-image-1', prompt, n: 1, size: opts.wide ? '1536x1024' : '1024x1024' })
    })
  } catch (err) {
    reach(err, server, base)
  }
  await ok(res, server)
  const j = (await res.json()) as { data?: { b64_json?: string; url?: string }[] }
  const first = j.data?.[0]
  if (first?.b64_json) {
    const data = Buffer.from(first.b64_json, 'base64')
    return { mime: sniff(data), data }
  }
  if (first?.url) {
    const r = await fetch(first.url, { signal })
    await ok(r, server)
    const data = Buffer.from(await r.arrayBuffer())
    return { mime: sniff(data), data }
  }
  throw new ImageError(`${server} sent back no picture.`)
}
