import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const source = path.resolve(repoRoot, process.argv[2] ?? 'play/wasm-web/CylinderDicer')
const destination = path.resolve(repoRoot, process.argv[3] ?? 'web/public/play')
const defoldProjectDir = path.join(repoRoot, 'play')
const bundleRuntime = path.join(source, 'CylinderDicer_wasm.js')
const defoldScriptExtensions = new Set(['.lua', '.script', '.gui_script', '.render_script'])
const skippedSourceDirs = new Set(['.deps', 'build', 'wasm-web'])

function assertInsideRepo(label, target) {
  if (target !== repoRoot && !target.startsWith(`${repoRoot}${path.sep}`)) {
    throw new Error(`${label} must be inside repository: ${target}`)
  }
}

async function assertFile(filePath, label) {
  const info = await stat(filePath).catch(() => null)
  if (!info?.isFile()) {
    throw new Error(`${label} not found: ${filePath}`)
  }
}

async function latestDefoldScriptMtime(directory) {
  let latest = null
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])

  for (const entry of entries) {
    const filePath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      if (directory === defoldProjectDir && skippedSourceDirs.has(entry.name)) {
        continue
      }
      const child = await latestDefoldScriptMtime(filePath)
      if (child && (!latest || child.mtimeMs > latest.mtimeMs)) {
        latest = child
      }
      continue
    }

    if (!entry.isFile() || !defoldScriptExtensions.has(path.extname(entry.name))) {
      continue
    }

    const info = await stat(filePath)
    if (!latest || info.mtimeMs > latest.mtimeMs) {
      latest = {
        filePath,
        mtimeMs: info.mtimeMs,
      }
    }
  }

  return latest
}

async function warnIfBundleLooksStale() {
  const runtimeInfo = await stat(bundleRuntime).catch(() => null)
  const latestScript = await latestDefoldScriptMtime(defoldProjectDir)

  if (!runtimeInfo?.isFile() || !latestScript) {
    return
  }

  if (runtimeInfo.mtimeMs + 1000 < latestScript.mtimeMs) {
    console.warn(`WARNING: Defold HTML5 bundle may be stale.`)
    console.warn(`  bundle: ${path.relative(repoRoot, bundleRuntime)}`)
    console.warn(`  latest: ${path.relative(repoRoot, latestScript.filePath)}`)
    console.warn(`  Run npm run defold:web:build after editing play/** scripts.`)
    return
  }

  console.log(`Bundle freshness check passed`)
  console.log(`  bundle: ${path.relative(repoRoot, bundleRuntime)}`)
  console.log(`  latest: ${path.relative(repoRoot, latestScript.filePath)}`)
}

assertInsideRepo('Source', source)
assertInsideRepo('Destination', destination)
await assertFile(path.join(source, 'index.html'), 'Defold bundle index.html')
await assertFile(path.join(source, 'dmloader.js'), 'Defold bundle dmloader.js')

await mkdir(destination, { recursive: true })
for (const entry of await readdir(destination)) {
  if (entry === '.gitkeep') {
    continue
  }
  await rm(path.join(destination, entry), { recursive: true, force: true })
}

for (const entry of await readdir(source)) {
  await cp(path.join(source, entry), path.join(destination, entry), {
    recursive: true,
    force: true,
  })
}

console.log(`Synced Defold HTML5 bundle`)
console.log(`  from: ${path.relative(repoRoot, source)}`)
console.log(`  to:   ${path.relative(repoRoot, destination)}`)
await warnIfBundleLooksStale()
