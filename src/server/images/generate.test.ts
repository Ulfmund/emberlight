import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { DEFAULT_IMAGE_SETTINGS, emblemPrompt, portraitPrompt, scenePrompt, styleBeyondFaces, type ImageSettings } from '@shared/images'
import { comfyWorkflow, dimensions, generateImage } from './generate'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

/** Pretend image servers: what each of the three kinds answers. */
let server: Server
let base = ''
const seen: { path: string; body: unknown; auth?: string }[] = []
let historyCalls = 0

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : undefined
      seen.push({ path: req.url ?? '', body, auth: req.headers.authorization })
      const json = (o: unknown) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(o))
      }
      if (req.url === '/sdapi/v1/txt2img') return json({ images: [PNG.toString('base64')] })
      if (req.url === '/prompt') return json({ prompt_id: 'p1' })
      if (req.url === '/history/p1') {
        // Not done the first time it's asked.
        historyCalls++
        return json(historyCalls < 2 ? {} : { p1: { outputs: { '9': { images: [{ filename: 'emberlight_1.png', subfolder: '', type: 'output' }] } } } })
      }
      if (req.url?.startsWith('/view?')) {
        res.writeHead(200, { 'Content-Type': 'image/png' })
        return res.end(PNG)
      }
      if (req.url === '/v1/images/generations') return json({ data: [{ b64_json: PNG.toString('base64') }] })
      res.writeHead(404)
      res.end()
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => server.close())

const settings = (p: Partial<ImageSettings>): ImageSettings => ({ ...DEFAULT_IMAGE_SETTINGS, baseUrl: base, ...p })

describe('image generators', () => {
  it('builds a portrait prompt from the style and what is known', () => {
    expect(portraitPrompt('oil painting', { kind: 'a young human woman', details: ['hunter.', 'a long copper braid'] })).toBe('oil painting, portrait of a young human woman, hunter, a long copper braid')
  })

  it('Stable Diffusion WebUI / Forge', async () => {
    const pic = await generateImage(settings({ backend: 'sdwebui', model: 'dreamshaper' }), undefined, 'a bard')
    expect(pic).toEqual({ mime: 'image/png', data: PNG })
    const sent = seen.find((s) => s.path === '/sdapi/v1/txt2img')!.body as Record<string, unknown>
    expect(sent).toMatchObject({ prompt: 'a bard', width: 768, height: 768, steps: 28, override_settings: { sd_model_checkpoint: 'dreamshaper' } })
  })

  it('ComfyUI, with the built-in workflow or the player’s own', async () => {
    await expect(generateImage(settings({ backend: 'comfyui' }), undefined, 'a bard')).rejects.toThrow(/needs a model/)
    const pic = await generateImage(settings({ backend: 'comfyui', model: 'sdxl.safetensors' }), undefined, 'a bard', { pollMs: 5 })
    expect(pic.data).toEqual(PNG)
    const graph = (seen.find((s) => s.path === '/prompt')!.body as { prompt: Record<string, { inputs: Record<string, unknown> }> }).prompt
    expect(graph['4'].inputs.ckpt_name).toBe('sdxl.safetensors')
    expect(graph['6'].inputs.text).toBe('a bard')
    // A custom workflow gets the values put in, numbers and all.
    const own = comfyWorkflow(settings({ backend: 'comfyui', workflow: '{"1":{"inputs":{"text":"{{prompt}}, best","seed":{{seed}},"steps":"{{steps}}"}}}' }), 'a "quoted" bard', 42) as Record<string, { inputs: Record<string, unknown> }>
    expect(own['1'].inputs).toEqual({ text: 'a "quoted" bard, best', seed: 42, steps: 28 })
    expect(() => comfyWorkflow(settings({ backend: 'comfyui', workflow: '{not json' }), 'x', 1)).toThrow(/isn't valid JSON/)
  })

  it('an OpenAI-compatible images API (with its key)', async () => {
    await expect(generateImage(settings({ backend: 'openai', baseUrl: `${base}/v1` }), undefined, 'a bard')).rejects.toThrow(/needs an API key/)
    const pic = await generateImage(settings({ backend: 'openai', baseUrl: `${base}/v1`, model: 'gpt-image-1' }), 'sk-test', 'a bard')
    expect(pic.data).toEqual(PNG)
    const call = seen.find((s) => s.path === '/v1/images/generations')!
    expect(call.auth).toBe('Bearer sk-test')
    expect(call.body).toMatchObject({ model: 'gpt-image-1', prompt: 'a bard', n: 1 })
  })

  it('paints places wide, and groups as an emblem', async () => {
    expect(scenePrompt('oil painting', { what: 'Millbrook Crossing, a ferry landing', details: ['the ferry is gone.'] })).toBe('oil painting, landscape painting of Millbrook Crossing, a ferry landing, the ferry is gone, wide view, no figures')
    expect(emblemPrompt('', { what: 'the Town Watch', details: [] })).toBe('heraldic emblem of the Town Watch, a banner or crest, centred, plain background')
    // The default style is for faces: a place keeps the look, not the framing.
    expect(styleBeyondFaces(DEFAULT_IMAGE_SETTINGS.style)).not.toMatch(/portrait|head and shoulders/i)
    expect(styleBeyondFaces('painterly fantasy portrait, head and shoulders, oil painting')).toBe('painterly fantasy, oil painting')
    expect(dimensions({ size: 768 })).toEqual({ width: 768, height: 768 })
    expect(dimensions({ size: 768 }, true)).toEqual({ width: 1152, height: 768 })
    expect(dimensions({ size: 1024 }, true)).toEqual({ width: 1536, height: 1024 })
    seen.length = 0
    await generateImage(settings({ backend: 'sdwebui' }), undefined, 'a ford', { wide: true })
    expect(seen.find((s) => s.path === '/sdapi/v1/txt2img')!.body).toMatchObject({ width: 1152, height: 768 })
    const graph = comfyWorkflow(settings({ backend: 'comfyui', model: 'm' }), 'a ford', 1, dimensions({ size: 768 }, true)) as Record<string, { inputs: Record<string, unknown> }>
    expect(graph['5'].inputs).toMatchObject({ width: 1152, height: 768 })
    await generateImage(settings({ backend: 'openai', baseUrl: `${base}/v1` }), 'sk-test', 'a ford', { wide: true })
    expect(seen.find((s) => s.path === '/v1/images/generations')!.body).toMatchObject({ size: '1536x1024' })
  })

  it('says plainly when nothing is set up or the server is down', async () => {
    await expect(generateImage(DEFAULT_IMAGE_SETTINGS, undefined, 'x')).rejects.toThrow(/No image generator is set up/)
    await expect(generateImage(settings({ backend: 'sdwebui', baseUrl: 'http://127.0.0.1:1' }), undefined, 'x')).rejects.toThrow(/Couldn't reach Stable Diffusion WebUI/)
  })
})
