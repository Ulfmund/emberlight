import { afterAll, beforeAll, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { z } from 'zod'
import { OpenAICompatProvider } from './openaiCompat'

/** A stand-in for a server like DeepSeek's: it turns down a JSON Schema, and answers plain requests with JSON in prose. */
let server: Server
let url = ''
const seen: { schema: boolean; system: string }[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const b = JSON.parse(body) as { messages: { content: string }[]; response_format?: { type?: string } }
      const schema = b.response_format?.type === 'json_schema'
      seen.push({ schema, system: b.messages[0].content })
      res.setHeader('Content-Type', 'application/json')
      if (schema) {
        res.statusCode = 400
        return res.end(JSON.stringify({ error: { message: 'This response_format type is unavailable now', type: 'invalid_request_error' } }))
      }
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Here it is:\n```json\n{"answer": "yes"}\n```' } }] }))
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
})
afterAll(() => server.close())

it('writes the format into the prompt when the server turns down a schema, and remembers that', async () => {
  const p = new OpenAICompatProvider(url, 'test-key', 'DeepSeek')
  const schema = z.object({ answer: z.string().describe('Yes or no') })
  const opts = { system: 'Answer.', messages: [{ role: 'user' as const, content: 'Go.' }], schema, name: 'some_job' }
  expect(await p.complete('deepseek-chat', opts)).toEqual({ answer: 'yes' })
  expect(seen.map((s) => s.schema)).toEqual([true, false])
  expect(seen[1].system).toMatch(/^Answer\.\n\nAnswer with one JSON object and nothing else, matching this JSON Schema:\n\{.*"answer".*"Yes or no"/)
  // The next time, straight to plain JSON, with the format written in again.
  await p.complete('deepseek-chat', opts)
  expect(seen.map((s) => s.schema)).toEqual([true, false, false])
  expect(seen[2].system).toBe(seen[1].system)
})
