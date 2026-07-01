#!/usr/bin/env node
/**
 * # 개요
 * Phase 1 Convex 개발 배포를 선택/동기화하고 web Vite env까지 맞추는 bootstrap 스크립트다.
 * 안전을 위해 기본 동작은 새 Convex project를 만들지 않는다.
 *
 * # 의존성
 * - Node.js fs/path/process/child_process 표준 라이브러리.
 * - Convex CLI: `npx convex deployment select`, `npx convex dev`, `npx convex env set`.
 * - root `.env.local`: Convex CLI가 `CONVEX_DEPLOYMENT`, `CONVEX_URL`을 기록한다.
 * - `web/.env.local`: browser client용 `VITE_CONVEX_URL`을 기록한다.
 *
 * # I/O
 * - 입력:
 *   - `CONVEX_DEPLOYMENT_REF`: 선택할 기존 deployment. 예: `mossborg:cylinderdicer:dev`.
 *   - `CONVEX_TEAM`: 새 project 생성 시에만 필요. 예: `mossborg`, `WizPerch`.
 *   - `CONVEX_PROJECT`: 새 project 생성 시에만 사용. 기본값 `cylinderdicer`.
 *   - `CONVEX_ALLOW_CREATE`: `1`일 때만 새 Convex project 생성을 허용한다.
 *   - `CLERK_JWT_ISSUER_DOMAIN`: 선택. 없으면 Clerk publishable key에서 추론한다.
 * - 출력:
 *   - Convex dev deployment/codegen 결과.
 *   - `web/.env.local`의 `VITE_CONVEX_URL` 갱신.
 *   - `npm run phase1:check` 실행 결과.
 *
 * # 의사코드
 * ```text
 * if root .env.local has CONVEX_DEPLOYMENT:
 *   reuse selected deployment
 * else if CONVEX_DEPLOYMENT_REF:
 *   select existing deployment
 * else if CONVEX_ALLOW_CREATE == "1":
 *   require CONVEX_TEAM
 *   create/configure new local deployment
 * else:
 *   fail without changing external state
 * derive Clerk issuer from CLERK_JWT_ISSUER_DOMAIN or VITE_CLERK_PUBLISHABLE_KEY
 * set Convex env CLERK_JWT_ISSUER_DOMAIN before pushing functions when possible
 * read CONVEX_URL from root .env.local or .env
 * upsert VITE_CONVEX_URL into web/.env.local
 * run phase1:check
 * ```
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()

function run(command, args, options = {}) {
  console.log(`$ ${[command, ...args].join(' ')}`)
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    ...options,
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
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

    result.set(trimmed.slice(0, equalsIndex).trim(), trimmed.slice(equalsIndex + 1).trim())
  }
  return result
}

function readEnvValue(key, envFiles) {
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

function upsertEnvValue(relativePath, key, value) {
  const absolutePath = path.join(root, relativePath)
  const lines = fs.existsSync(absolutePath)
    ? fs.readFileSync(absolutePath, 'utf8').split(/\r?\n/)
    : []

  let replaced = false
  const nextLines = lines.map((line) => {
    const trimmed = line.trim()
    if (trimmed.startsWith(`${key}=`)) {
      replaced = true
      return `${key}=${value}`
    }
    return line
  })

  if (!replaced) {
    if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== '') {
      nextLines.push('')
    }
    nextLines.push(`${key}=${value}`)
  }

  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  fs.writeFileSync(absolutePath, `${nextLines.join('\n').replace(/\n+$/u, '')}\n`)
}

function deriveClerkIssuerFromPublishableKey(key) {
  const match = key?.match(/^pk_(test|live)_(.+)$/)
  if (!match) {
    return ''
  }

  try {
    const decoded = Buffer.from(match[2].replace(/\$/u, ''), 'base64')
      .toString('utf8')
      .replace(/\$/u, '')
      .trim()
    if (!decoded) {
      return ''
    }
    return decoded.startsWith('http') ? decoded : `https://${decoded}`
  } catch {
    return ''
  }
}

const rootEnvLocalBefore = readEnvFile('.env.local')
const rootEnvBefore = readEnvFile('.env')
const webEnvLocalBefore = readEnvFile('web/.env.local')
const webEnvBefore = readEnvFile('web/.env')

const selectedDeployment = readEnvValue('CONVEX_DEPLOYMENT', [rootEnvLocalBefore, rootEnvBefore])
const deploymentRef = process.env.CONVEX_DEPLOYMENT_REF
const team = process.env.CONVEX_TEAM
const project = process.env.CONVEX_PROJECT || 'cylinderdicer'
const allowCreate = process.env.CONVEX_ALLOW_CREATE === '1'
const publishableKey = readEnvValue('VITE_CLERK_PUBLISHABLE_KEY', [
  webEnvLocalBefore,
  webEnvBefore,
  rootEnvBefore,
])
const clerkIssuer =
  process.env.CLERK_JWT_ISSUER_DOMAIN || deriveClerkIssuerFromPublishableKey(publishableKey)

if (!selectedDeployment && !deploymentRef && !allowCreate) {
  console.error('No Convex deployment is selected.')
  console.error('')
  console.error('This script will not create a new Convex project by default.')
  console.error('')
  console.error('Select an existing deployment first, for example:')
  console.error('  CONVEX_DEPLOYMENT_REF=mossborg:cylinderdicer:dev npm run phase1:bootstrap')
  console.error('  CONVEX_DEPLOYMENT_REF=mossborg:cylinderdicer:local npm run phase1:bootstrap')
  console.error('')
  console.error('To inspect teams/projects:')
  console.error('  npx convex login status')
  console.error('')
  console.error('Only if you intentionally want a new project, run:')
  console.error('  CONVEX_ALLOW_CREATE=1 CONVEX_TEAM=mossborg npm run phase1:bootstrap')
  process.exit(1)
}

if (allowCreate && !team) {
  console.error('CONVEX_TEAM is required when CONVEX_ALLOW_CREATE=1.')
  process.exit(1)
}

if (!selectedDeployment && deploymentRef) {
  run('npx', ['convex', 'deployment', 'select', deploymentRef])
}

if ((selectedDeployment || deploymentRef) && clerkIssuer) {
  run('npx', ['convex', 'env', 'set', 'CLERK_JWT_ISSUER_DOMAIN', clerkIssuer])
}

const devArgs = ['convex', 'dev', '--once']
if (!selectedDeployment && allowCreate) {
  devArgs.push(
    '--configure',
    'new',
    '--team',
    team,
    '--project',
    project,
    '--dev-deployment',
    'local',
  )
}
run('npx', devArgs, {
  env: {
    ...process.env,
    ...(clerkIssuer ? { CLERK_JWT_ISSUER_DOMAIN: clerkIssuer } : {}),
  },
})

const rootEnvLocal = readEnvFile('.env.local')
const rootEnv = readEnvFile('.env')
const convexUrl = readEnvValue('CONVEX_URL', [rootEnvLocal, rootEnv])
if (!convexUrl) {
  console.error('Convex CLI did not expose CONVEX_URL in root .env.local/.env.')
  process.exit(1)
}

upsertEnvValue('web/.env.local', 'VITE_CONVEX_URL', convexUrl)
console.log('Synced CONVEX_URL to web/.env.local as VITE_CONVEX_URL.')

if (!selectedDeployment && !deploymentRef && clerkIssuer) {
  run('npx', ['convex', 'env', 'set', 'CLERK_JWT_ISSUER_DOMAIN', clerkIssuer])
}

if (!clerkIssuer) {
  console.warn('Skipped Convex env CLERK_JWT_ISSUER_DOMAIN: env var was not provided and could not be derived.')
}

run('npm', ['run', 'phase1:check'])
