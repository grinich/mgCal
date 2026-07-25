// Writes a Google OAuth client ID into public/manifest.json, so setting up your
// own client is one command instead of hand-editing JSON:
//
//   npm run set-client-id 1234567890-abc123.apps.googleusercontent.com
//
// Chrome-extension OAuth clients have no secret — Google binds them to the
// extension ID instead — so this value isn't sensitive. It just shouldn't be
// *this* repo's, since every user authorizes against their own Cloud project.
import { readFileSync, writeFileSync } from 'node:fs'

const MANIFEST = 'public/manifest.json'
const SUFFIX = '.apps.googleusercontent.com'

// Tolerate a pasted value wrapped in quotes, and `--id=` style if someone tries it.
const raw = (process.argv[2] ?? '').trim().replace(/^["']|["']$/g, '').replace(/^--?(?:id=)?/, '')

function fail(message) {
  console.error(`\n  ${message}\n`)
  console.error('  Usage: npm run set-client-id <CLIENT_ID>')
  console.error(`  e.g.   npm run set-client-id 1234567890-abc123${SUFFIX}\n`)
  console.error('  Get one at https://console.cloud.google.com/apis/credentials')
  console.error('  (Create credentials → OAuth client ID → Chrome Extension). See README.\n')
  process.exit(1)
}

if (!raw) fail('No client ID given.')
if (!raw.endsWith(SUFFIX)) fail(`That doesn't look like a client ID — it should end with ${SUFFIX}`)
if (raw.startsWith('YOUR_CLIENT_ID')) fail('That’s the placeholder, not a real client ID.')

const manifest = readFileSync(MANIFEST, 'utf8')
const before = /"client_id":\s*"([^"]*)"/.exec(manifest)
if (!before) fail(`Couldn't find an oauth2.client_id field in ${MANIFEST}.`)

if (before[1] === raw) {
  console.log(`\n  ${MANIFEST} already uses that client ID — nothing to do.\n`)
  process.exit(0)
}

writeFileSync(MANIFEST, manifest.replace(/"client_id":\s*"[^"]*"/, `"client_id": "${raw}"`))

console.log(`\n  ✓ ${MANIFEST} → ${raw}\n`)
console.log('  Next:')
console.log('    npm run build')
console.log('    then hit the reload icon for mgCal on chrome://extensions\n')
console.log('  Heads up: this edits a tracked file. Keep it out of commits with')
console.log(`    git update-index --skip-worktree ${MANIFEST}\n`)
