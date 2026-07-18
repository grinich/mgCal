// Keeps public/manifest.json's version in lockstep with package.json.
// Runs as the npm `version` lifecycle hook, so `npm version minor` bumps both.
import { readFileSync, writeFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const path = 'public/manifest.json'
const manifest = readFileSync(path, 'utf8')
const updated = manifest.replace(/"version":\s*"[^"]*"/, `"version": "${pkg.version}"`)
writeFileSync(path, updated)
console.log(`manifest.json version → ${pkg.version}`)
