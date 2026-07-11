#!/usr/bin/env node
/**
 * Phase 4 admin opponent controller preflight.
 * Verifies local admin scaffolding and, when a deployment is configured,
 * confirms admin/custom-game functions are live on that deployment.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()

const REQUIRED_ADMIN_FUNCTIONS = [
  'adminMatches.js:createDevMatchWithBots',
  'adminMatches.js:listAdminDevMatches',
  'adminMatches.js:getAdminMatchState',
  'adminMatches.js:submitOpponentCommand',
  'adminMatches.js:probeAdminAccess',
  'adminMatches.js:listRecentAdminAudit',
  'adminMatches.js:setCustomGameOpponentReady',
]

function fileExists(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
}

function readTextFile(relativePath) {
  const absolutePath = path.join(root, relativePath)
  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, 'utf8') : ''
}

function readEnvFile(relativePath) {
  const absolutePath = path.join(root, relativePath)
  if (!fs.existsSync(absolutePath)) {
    return new Map()
  }

  const result = new Map()
  for (const line of fs.readFileSync(absolutePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }
    const equalsIndex = trimmed.indexOf('=')
    if (equalsIndex <= 0) {
      continue
    }
    result.set(trimmed.slice(0, equalsIndex).trim(), trimmed.slice(equalsIndex + 1).trim())
  }
  return result
}

function envValue(key, envFiles) {
  if (process.env[key]) {
    return process.env[key]
  }
  for (const envFile of envFiles) {
    const value = envFile.get(key)
    if (value) {
      return value
    }
  }
  return ''
}

const checks = []

function check(name, passed, fix) {
  checks.push({ name, passed, fix })
}

const rootEnvLocal = readEnvFile('.env.local')
const rootEnv = readEnvFile('.env')
const apiTypes = readTextFile('convex/_generated/api.d.ts')
const functionReferences = readTextFile('web/src/services/convex/functionReferences.ts')
const adminScreen = readTextFile('web/src/admin/OpponentControllerScreen.vue')

check('convex/adminMatches.ts exists', fileExists('convex/adminMatches.ts'), 'Add admin match controller module.')
check('adminAudit table is defined', readTextFile('convex/schema.ts').includes('adminAudit:'), 'Add adminAudit table to schema.')
check('OpponentControllerScreen exists', fileExists('web/src/admin/OpponentControllerScreen.vue'), 'Add /admin/opponents UI.')
check(
  'OpponentControllerScreen supports matchId query param',
  adminScreen.includes('matchId'),
  'Support `/admin/opponents?matchId=...` in OpponentControllerScreen.',
)
check(
  'generated api exposes adminMatches',
  apiTypes.includes('adminMatches'),
  'Run `npm run convex:codegen` after adding admin functions.',
)
check(
  'web registry exposes adminMatches.submitOpponentCommand',
  functionReferences.includes('submitOpponentCommand'),
  'Register admin functions in web/src/services/convex/functionReferences.ts.',
)
check(
  'shared docs describe Clerk admin claim',
  readTextFile('shared/docs/CONVEX_IMPLEMENTATION.md').includes('"role": "admin"'),
  'Document Clerk admin claim in shared/docs/CONVEX_IMPLEMENTATION.md.',
)

const deployment = envValue('CONVEX_DEPLOYMENT', [rootEnvLocal, rootEnv])
const convexUrl = envValue('CONVEX_URL', [rootEnvLocal, rootEnv])

check(
  'Convex deployment selector is configured',
  Boolean(deployment || convexUrl),
  'Run `npm run phase1:bootstrap` or `npx convex dev --once` after selecting a deployment.',
)

let liveFunctionCheck = {
  attempted: false,
  passed: false,
  missing: REQUIRED_ADMIN_FUNCTIONS,
}

if (deployment || convexUrl) {
  liveFunctionCheck.attempted = true
  const result = spawnSync('npx', ['convex', 'function-spec'], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  })

  if (result.status === 0 && result.stdout) {
    try {
      const spec = JSON.parse(result.stdout)
      const identifiers = new Set((spec.functions ?? []).map((fn) => fn.identifier))
      const missing = REQUIRED_ADMIN_FUNCTIONS.filter((name) => !identifiers.has(name))
      liveFunctionCheck = {
        attempted: true,
        passed: missing.length === 0,
        missing,
        url: spec.url,
        total: identifiers.size,
      }
      check(
        'live deployment exposes Phase 4 admin functions',
        missing.length === 0,
        missing.length > 0
          ? `Run \`npm run phase4:deploy\` to push functions. Missing: ${missing.join(', ')}`
          : 'Admin functions are live.',
      )
    } catch (error) {
      check(
        'live deployment exposes Phase 4 admin functions',
        false,
        `Could not parse \`npx convex function-spec\` output: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  } else {
    check(
      'live deployment exposes Phase 4 admin functions',
      false,
      'Run `npx convex function-spec` manually after configuring deployment access.',
    )
  }
} else {
  check(
    'live deployment exposes Phase 4 admin functions',
    false,
    'Configure Convex deployment first, then run `npm run phase4:deploy`.',
  )
}

const missing = checks.filter((item) => !item.passed)

for (const item of checks) {
  console.log(`${item.passed ? '✓' : '✗'} ${item.name}`)
  if (!item.passed) {
    console.log(`  fix: ${item.fix}`)
  }
}

if (liveFunctionCheck.attempted) {
  console.log('')
  console.log(`Deployment: ${liveFunctionCheck.url ?? convexUrl ?? deployment}`)
  console.log(`Functions on deployment: ${liveFunctionCheck.total ?? 'unknown'}`)
}

console.log('')
console.log('Manual Phase 4 E2E checklist:')
console.log('  1. Clerk JWT template "convex" includes {"role":"admin"}')
console.log('  2. Sign out/in, open /admin/opponents')
console.log('  3. probe shows AUTHORIZED')
console.log('  4. Create/Reuse dev match, Open Play with same matchId')
console.log('  5. Submit opponent load/shake/check/bid via admin UI')
console.log('  6. Confirm play tab snapshot updates + adminAudit rows appear')
console.log('  7. Non-admin account receives UNAUTHORIZED on admin queries')

if (missing.length > 0) {
  console.log('')
  console.log(`Phase 4 preflight failed: ${missing.length} item(s) missing.`)
  console.log('Recommended:')
  console.log('  npm run phase4:deploy')
  console.log('  npm run phase4:check')
  process.exit(1)
}

console.log('')
console.log('Phase 4 preflight passed.')
