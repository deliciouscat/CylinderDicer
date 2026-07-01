#!/usr/bin/env node
/**
 * # 개요
 * Convex 배포/codegen 연결을 진행할 준비가 되었는지 검사하는 Phase 1 preflight다.
 * 실제 secret 값은 출력하지 않고, 필요한 파일·환경 변수·generated API 존재 여부만 확인한다.
 *
 * # 의존성
 * - Node.js fs/path/process 표준 라이브러리.
 * - root `package.json`, `convex/`, `web/.env.local`.
 * - `npx convex dev`가 생성하는 root `.env.local`과 `convex/_generated/`.
 *
 * # I/O
 * - 입력:
 *   - repository filesystem.
 *   - 현재 process env.
 * - 출력:
 *   - 통과/누락 항목 report.
 *   - 누락 항목이 있으면 exit code 1.
 *
 * # 의사코드
 * ```text
 * read known env files without printing values
 * check Convex source files and root scripts
 * check Convex deployment selector exists
 * check generated API files exist
 * check web client env can point at Convex and Clerk
 * print next command suggestions for missing items
 * ```
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'))
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
}

function readTextFile(relativePath) {
  const absolutePath = path.join(root, relativePath)
  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, 'utf8') : ''
}

function listFilesRecursive(relativePath, predicate) {
  const absolutePath = path.join(root, relativePath)
  if (!fs.existsSync(absolutePath)) {
    return []
  }

  const result = []
  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    const childRelativePath = path.join(relativePath, entry.name)
    if (entry.isDirectory()) {
      result.push(...listFilesRecursive(childRelativePath, predicate))
    } else if (predicate(childRelativePath)) {
      result.push(childRelativePath)
    }
  }
  return result
}

function readEnvFile(relativePath) {
  const absolutePath = path.join(root, relativePath)
  if (!fs.existsSync(absolutePath)) {
    return new Map()
  }

  const result = new Map()
  const lines = fs.readFileSync(absolutePath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const equalsIndex = trimmed.indexOf('=')
    if (equalsIndex <= 0) {
      continue
    }

    const key = trimmed.slice(0, equalsIndex).trim()
    const value = trimmed.slice(equalsIndex + 1).trim()
    result.set(key, value)
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

const rootEnvLocal = readEnvFile('.env.local')
const rootEnv = readEnvFile('.env')
const webEnvLocal = readEnvFile('web/.env.local')
const webEnv = readEnvFile('web/.env')

const checks = []

function check(name, passed, fix) {
  checks.push({ name, passed, fix })
}

const packageJson = readJson('package.json')
const scripts = packageJson.scripts ?? {}

check('root package.json has convex:dev', Boolean(scripts['convex:dev']), 'Add `convex:dev` script.')
check('root package.json has convex:codegen', Boolean(scripts['convex:codegen']), 'Add `convex:codegen` script.')
check('root package.json has convex:typecheck', Boolean(scripts['convex:typecheck']), 'Add `convex:typecheck` script.')
check('convex/schema.ts exists', fileExists('convex/schema.ts'), 'Create Convex schema.')
check('convex/auth.config.ts exists', fileExists('convex/auth.config.ts'), 'Create Convex Clerk auth config.')
check('convex/matches.ts exists', fileExists('convex/matches.ts'), 'Create match queries/mutations.')
check('convex/commands.ts exists', fileExists('convex/commands.ts'), 'Create command mutation entrypoint.')

const deployment = envValue('CONVEX_DEPLOYMENT', [rootEnvLocal, rootEnv])
const convexUrl = envValue('CONVEX_URL', [rootEnvLocal, rootEnv])
const selfHostedUrl = envValue('CONVEX_SELF_HOSTED_URL', [rootEnvLocal, rootEnv])
const selfHostedAdminKey = envValue('CONVEX_SELF_HOSTED_ADMIN_KEY', [rootEnvLocal, rootEnv])

check(
  'Convex deployment selector is configured',
  Boolean(deployment || (selfHostedUrl && selfHostedAdminKey)),
  'Run `npx convex dev` interactively once, or configure `CONVEX_DEPLOYMENT` in root `.env.local`.',
)
check(
  'Convex URL is available for clients',
  Boolean(convexUrl || selfHostedUrl),
  '`npx convex dev` should write `CONVEX_URL`; copy that URL to `web/.env.local` as `VITE_CONVEX_URL`.',
)
check(
  'convex/_generated/api exists',
  fileExists('convex/_generated/api.d.ts') || fileExists('convex/_generated/api.js') || fileExists('convex/_generated/api.ts'),
  'Run `npx convex dev` or `npm run convex:codegen` after deployment configuration.',
)
check(
  'convex/_generated/server exists',
  fileExists('convex/_generated/server.d.ts') || fileExists('convex/_generated/server.js') || fileExists('convex/_generated/server.ts'),
  'Run `npx convex dev` or `npm run convex:codegen` after deployment configuration.',
)

const functionReferenceRegistry = readTextFile('web/src/services/convex/functionReferences.ts')
const webConvexServiceFiles = listFilesRecursive(
  'web/src/services/convex',
  (relativePath) => relativePath.endsWith('.ts'),
)
const webConvexServiceFilesWithRawReferences = webConvexServiceFiles.filter((relativePath) => {
  if (relativePath.endsWith('functionReferences.ts')) {
    return false
  }
  return readTextFile(relativePath).includes('makeFunctionReference')
})

check(
  'web Convex registry uses generated api',
  functionReferenceRegistry.includes("convex/_generated/api") ||
    functionReferenceRegistry.includes("convex/_generated/api'") ||
    functionReferenceRegistry.includes('convex/_generated/api"'),
  'Update `web/src/services/convex/functionReferences.ts` to import generated `api`.',
)
check(
  'web Convex services do not use raw makeFunctionReference',
  webConvexServiceFilesWithRawReferences.length === 0,
  `Move raw function references into generated API registry: ${webConvexServiceFilesWithRawReferences.join(', ')}`,
)

const webConvexUrl = envValue('VITE_CONVEX_URL', [webEnvLocal, webEnv])
const webClerkKey = envValue('VITE_CLERK_PUBLISHABLE_KEY', [webEnvLocal, webEnv])

check(
  'web has VITE_CONVEX_URL',
  Boolean(webConvexUrl),
  'Set `VITE_CONVEX_URL=<CONVEX_URL from root .env.local>` in `web/.env.local`.',
)
check(
  'web has VITE_CLERK_PUBLISHABLE_KEY',
  Boolean(webClerkKey),
  'Set Clerk publishable key in `web/.env.local`.',
)

const missing = checks.filter((item) => !item.passed)

for (const item of checks) {
  console.log(`${item.passed ? '✓' : '✗'} ${item.name}`)
  if (!item.passed) {
    console.log(`  fix: ${item.fix}`)
  }
}

if (missing.length > 0) {
  console.log('')
  console.log(`Phase 1 preflight failed: ${missing.length} item(s) missing.`)
  console.log('')
  console.log('Recommended next sequence:')
  console.log('  1. npx convex login status')
  console.log('  2. Select an existing deployment:')
  console.log('     CONVEX_DEPLOYMENT_REF=mossborg:cylinderdicer:dev npm run phase1:bootstrap')
  console.log('  3. Optional Clerk env in the same command:')
  console.log('     CONVEX_DEPLOYMENT_REF=mossborg:cylinderdicer:dev CLERK_JWT_ISSUER_DOMAIN=https://<issuer> npm run phase1:bootstrap')
  console.log('')
  console.log('Manual equivalent:')
  console.log('  npx convex deployment select <team_slug>:<project_slug>:<deployment_ref>')
  console.log('  npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<issuer>')
  console.log('  copy CONVEX_URL to web/.env.local as VITE_CONVEX_URL')
  console.log('  npm run phase1:check')
  process.exit(1)
}

console.log('')
console.log('Phase 1 preflight passed.')
