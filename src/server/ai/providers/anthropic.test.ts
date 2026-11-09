import { afterAll, beforeAll, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { z } from 'zod'
import { AnthropicProvider } from './anthropic'

/** A stand-in for the API: strict formats are "too big"; plain requests get JSON in prose. */
let server: Server
let url = ''
const seen: { strict: boolean; system: string }[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const b = JSON.parse(body) as { model: string; system: string; output_config?: { format?: unknown } }
      const strict = Boolean(b.output_config?.format)
      seen.push({ strict, system: b.system })
      res.setHeader('Content-Type', 'application/json')
      if (strict) {
        res.statusCode = 400
        return res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'The compiled grammar is too large, which would cause performance issues.' } }))
      }
      res.end(
        JSON.stringify({
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: b.model,
          content: [{ type: 'text', text: 'Here it is:\n```json\n{"answer": "yes", "count": 2}\n```' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 5 }
        })
      )
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => server.close())

it('asks for plain JSON when a format is too big for strict output, and remembers that', async () => {
  const p = new AnthropicProvider('test-key', url)
  const schema = z.object({ answer: z.string(), count: z.number().int(), extra: z.array(z.string()).default([]) })
  const opts = { system: 'Answer.', messages: [{ role: 'user' as const, content: 'Go.' }], schema, name: 'big_job' }
  expect(await p.complete('claude-haiku-5-5', opts)).toEqual({ answer: 'yes', count: 2, extra: [] })
  expect(seen.map((s) => s.strict)).toEqual([true, false])
  expect(seen[1].system).toMatch(/^Answer\.\n\nAnswer with one JSON object and nothing else, matching this JSON Schema:\n\{/)
  // The next time, straight to plain JSON.
  await p.complete('claude-haiku-5-5', opts)
  expect(seen.map((s) => s.strict)).toEqual([true, false, false])
})
