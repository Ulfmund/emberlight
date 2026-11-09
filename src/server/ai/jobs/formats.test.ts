import { describe, expect, it } from 'vitest'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { z } from 'zod'
import { toJsonSchema } from '../providers/types'
import { ScribeSchema } from './scribe'
import { CombatRefereeSchema, RefereeSchema } from './referee'
import { ArcSchema, ChapterSchema, SceneSchema } from './summarizer'

type Js = Record<string, unknown>
type Field = { described: boolean; choices: boolean }

/**
 * Every field of a JSON Schema by its path, $refs followed: whether it carries a description of
 * its own (not just the keywords a converter moved into the description, like "{default: ''}"),
 * and whether its list of allowed values is still there to read.
 *
 * Why this matters: Claude's format helper keeps only the pointer when a field becomes a $ref,
 * and a field written `.default(x).describe(…)` becomes one, so its description was dropped
 * before it reached the model. Written `.describe(…).default(x)`, it stays whole.
 */
function fields(root: Js): Map<string, Field> {
  const defs = ((root.$defs ?? root.definitions ?? {}) as Record<string, Js>)
  const out = new Map<string, Field>()
  const resolve = (n: Js): Js => {
    if (typeof n.$ref !== 'string') return n
    const target = defs[n.$ref.split('/').pop()!] ?? {}
    const beside = Object.fromEntries(Object.entries(n).filter(([k]) => k !== '$ref'))
    return { ...resolve(target), ...beside }
  }
  const walk = (node: Js, path: string) => {
    const n = resolve(node)
    if (path) {
      const own = String(n.description ?? '').replace(/\s*\{[\s\S]*\}\s*$/, '').trim()
      // Claude's SDK (1.6) writes the allowed values into the description as "{enum: [...]}" rather
      // than as a constraint: the model reads them there, and our own schema checks the answer.
      out.set(path, { described: own.length > 0, choices: Array.isArray(n.enum) || /\benum: \[/.test(String(n.description ?? '')) })
    }
    for (const [k, v] of Object.entries((n.properties ?? {}) as Record<string, Js>)) walk(v, path ? `${path}.${k}` : k)
    if (n.items && typeof n.items === 'object') walk(n.items as Js, `${path}[]`)
  }
  walk(root, '')
  return out
}

const JOBS: [string, z.ZodType][] = [
  ['scribe', ScribeSchema],
  ['referee', RefereeSchema],
  ['combat referee', CombatRefereeSchema],
  ['scene summary', SceneSchema],
  ['chapter summary', ChapterSchema],
  ['story so far', ArcSchema]
]

describe("the jobs' answer formats", () => {
  it.each(JOBS)('%s: Claude sees every description and every list of choices the format has', (_name, schema) => {
    const ours = fields(toJsonSchema(schema))
    const claude = fields((zodOutputFormat(schema as z.ZodObject) as unknown as { schema: Js }).schema)
    const lost: string[] = []
    for (const [path, f] of ours) {
      const c = claude.get(path)
      if (f.described && !c?.described) lost.push(`${path}: description`)
      if (f.choices && !c?.choices) lost.push(`${path}: choices`)
    }
    expect(lost).toEqual([])
  })
})
