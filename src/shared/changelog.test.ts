import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { CHANGELOG, changesSince, compareVersions, releaseNotes } from './changelog'

describe("what's new", () => {
  it('has notes for the version being built, so every release says what changed', () => {
    const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
    expect(CHANGELOG[0].version).toBe(version)
    // Newest first, each with something to say.
    for (let i = 1; i < CHANGELOG.length; i++) expect(compareVersions(CHANGELOG[i - 1].version, CHANGELOG[i].version)).toBe(1)
    for (const c of CHANGELOG) expect(c.items.length).toBeGreaterThan(0)
  })

  it('compares versions the way people mean them, and shows only what this screen missed', () => {
    expect(compareVersions('1.2.10', '1.2.9')).toBe(1)
    expect(compareVersions('1.2.0', '1.2')).toBe(0)
    expect(compareVersions('0.9.9', '1.0.0')).toBe(-1)
    expect(changesSince('1.1.1', '1.2.1').map((c) => c.version)).toEqual(['1.2.1', '1.2.0'])
    expect(changesSince('1.2.1', '1.2.1')).toEqual([])
  })

  it('prints a version as release notes', () => {
    expect(releaseNotes({ version: '9.9.9', date: '', title: 'A title.', items: ['**One.** Two.', 'Three.'] })).toBe('**A title.**\n\n- **One.** Two.\n- Three.')
  })
})
