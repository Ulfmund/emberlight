import CHANGES from './changelog.json'

/**
 * What changed in each version (docs/spec/08-ui-ux.md#whats-new), newest first. The app shows
 * it after an update, and the GitHub release notes are printed from it (scripts/release-notes.mjs),
 * so the two always say the same thing. Each item is one sentence or a few; **bold** works.
 */
export type Change = { version: string; date: string; title: string; items: string[] }

export const CHANGELOG: Change[] = CHANGES

/** -1, 0 or 1, comparing "1.2.10" with "1.2.9" the way people mean it. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0)
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d > 0 ? 1 : -1
  }
  return 0
}

/** What a screen last shown `seen` hasn't seen yet, up to `current` (newest first, at most `max`). */
export function changesSince(seen: string, current: string, max = 6): Change[] {
  return CHANGELOG.filter((c) => compareVersions(c.version, seen) > 0 && compareVersions(c.version, current) <= 0).slice(0, max)
}

/** One version's notes as Markdown, for its GitHub release. */
export function releaseNotes(c: Change): string {
  return [`**${c.title}**`, '', ...c.items.map((i) => `- ${i}`)].join('\n')
}
