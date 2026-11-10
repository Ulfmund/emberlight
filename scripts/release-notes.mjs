// Prints one version's notes from the in-app changelog (src/shared/changelog.json), for its
// GitHub release: `node scripts/release-notes.mjs 1.2.2 | gh release create v1.2.2 --notes-file -`
import { readFileSync } from 'node:fs'

const version = (process.argv[2] ?? '').replace(/^v/, '')
const all = JSON.parse(readFileSync(new URL('../src/shared/changelog.json', import.meta.url), 'utf8'))
const c = all.find((x) => x.version === version)
if (!c) {
  console.error(`No changelog entry for ${version || '(no version given)'}. Add one to src/shared/changelog.json first.`)
  process.exit(1)
}
process.stdout.write([`**${c.title}**`, '', ...c.items.map((i) => `- ${i}`)].join('\n') + '\n')
