#!/usr/bin/env node
/**
 * Bundle the Defold project as HTML5 (wasm-web) using bob.jar.
 *
 * Usage:
 *   node tools/bundle-defold-web.mjs [options]
 *   npm run defold:web:bundle
 *   npm run defold:web:build          # bundle + sync to web/public/play
 *
 * Requires OpenJDK 25+ on PATH (or --java / JAVA_HOME).
 * On macOS, falls back to the JDK bundled inside /Applications/Defold.app.
 * bob.jar is downloaded automatically unless --skip-download is set.
 */
import { spawnSync } from 'node:child_process'
import { createWriteStream, existsSync, readdirSync } from 'node:fs'
import { access, copyFile, mkdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const defaultProjectDir = path.join(repoRoot, 'play')
const defaultBundleOutput = path.join(defaultProjectDir, 'wasm-web')
const defaultToolsDir = path.join(scriptDir, 'defold')
const defaultDefoldVersion = '1.13.0'

const HELP = `
Bundle Defold HTML5 (wasm-web) via bob.jar

Usage:
  node tools/bundle-defold-web.mjs [options]

Options:
  -h, --help                 Show this help
  --defold-version <ver>     Defold release tag (default: from build metadata or ${defaultDefoldVersion})
  --project-dir <dir>        Defold project root containing game.project (default: play/)
  --bundle-output <dir>      Bundle output directory (default: play/wasm-web)
  --variant <type>           debug | release | headless (default: release)
  --architectures <list>     Comma-separated architectures, e.g. wasm-web,wasm_pthread-web
  --build-server <url>       Native extension build server URL
  --bob-jar <path>           Use an existing bob.jar instead of downloading
  --java <path>              Java executable (default: JAVA_HOME/bin/java or java on PATH)
  --skip-download            Do not download bob.jar automatically
  --skip-distclean           Skip the distclean step
  --sync                     Sync bundle to web/public/play after build
  --dry-run                  Print the bob command without executing

Environment:
  DEFOLD_VERSION             Default Defold release tag
  JAVA_HOME                  Used to locate the Java executable
  BOB_JAR                      Override bob.jar path
`.trim()

function printHelp() {
  console.log(HELP)
}

function parseArgs(argv) {
  const options = {
    help: false,
    defoldVersion: process.env.DEFOLD_VERSION ?? '',
    projectDir: defaultProjectDir,
    bundleOutput: defaultBundleOutput,
    variant: 'release',
    architectures: '',
    buildServer: '',
    bobJar: process.env.BOB_JAR ?? '',
    java: process.env.JAVA ?? '',
    skipDownload: false,
    skipDistclean: false,
    sync: false,
    dryRun: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '-h' || arg === '--help') {
      options.help = true
      continue
    }

    if (arg === '--skip-download') {
      options.skipDownload = true
      continue
    }

    if (arg === '--skip-distclean') {
      options.skipDistclean = true
      continue
    }

    if (arg === '--sync') {
      options.sync = true
      continue
    }

    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }

    const valueFlags = {
      '--defold-version': 'defoldVersion',
      '--project-dir': 'projectDir',
      '--bundle-output': 'bundleOutput',
      '--variant': 'variant',
      '--architectures': 'architectures',
      '--build-server': 'buildServer',
      '--bob-jar': 'bobJar',
      '--java': 'java',
    }

    if (arg in valueFlags) {
      const value = argv[index + 1]
      if (!value || value.startsWith('-')) {
        throw new Error(`Missing value for ${arg}`)
      }
      options[valueFlags[arg]] = value
      index += 1
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  options.projectDir = path.resolve(repoRoot, options.projectDir)
  options.bundleOutput = path.resolve(repoRoot, options.bundleOutput)
  if (options.bobJar) {
    options.bobJar = path.resolve(repoRoot, options.bobJar)
  }

  return options
}

async function pathExists(targetPath) {
  try {
    await access(targetPath)
    return true
  } catch {
    return false
  }
}

async function readDefaultDefoldVersion(bundleOutput) {
  const metadataPath = path.join(bundleOutput, 'build_input_data.json')
  if (!(await pathExists(metadataPath))) {
    return defaultDefoldVersion
  }

  try {
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'))
    const version = metadata?.bob_arguments?.version
    return typeof version === 'string' && version.length > 0 ? version : defaultDefoldVersion
  } catch {
    return defaultDefoldVersion
  }
}

function findDefoldAppJava() {
  if (process.platform !== 'darwin') {
    return ''
  }

  const packagesDir = '/Applications/Defold.app/Contents/Resources/packages'
  let entries
  try {
    entries = readdirSync(packagesDir)
  } catch {
    return ''
  }

  for (const entry of entries) {
    if (!entry.startsWith('jdk-')) {
      continue
    }
    const candidate = path.join(packagesDir, entry, 'bin', 'java')
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return ''
}

function javaWorks(javaExecutable) {
  const result = spawnSync(javaExecutable, ['-version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return !result.error && result.status === 0
}

function resolveJavaExecutable(explicitJava) {
  if (explicitJava) {
    return explicitJava
  }

  const javaHome = process.env.JAVA_HOME
  if (javaHome) {
    return path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
  }

  if (javaWorks('java')) {
    return 'java'
  }

  // No system Java: fall back to the JDK shipped inside the Defold editor app.
  const defoldJava = findDefoldAppJava()
  if (defoldJava) {
    return defoldJava
  }

  return 'java'
}

function assertJava(javaExecutable, dryRun) {
  if (dryRun) {
    return
  }

  const result = spawnSync(javaExecutable, ['-version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (result.error || result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || result.error?.message || 'unknown error'
    throw new Error(
      `Java runtime not available (${javaExecutable}). Install OpenJDK 25+, ` +
        `or install the Defold editor (its bundled JDK is used as a macOS fallback), ` +
        `or pass --java <path>.\n${detail}`,
    )
  }

  const versionLine = `${result.stderr ?? ''}${result.stdout ?? ''}`.trim().split('\n')[0] ?? ''
  console.log(`Using Java: ${versionLine}`)
}

function bobDownloadUrl(defoldVersion) {
  return `https://github.com/defold/defold/releases/download/${defoldVersion}/bob.jar`
}

async function downloadBobJar(defoldVersion, destination) {
  const url = bobDownloadUrl(defoldVersion)
  console.log(`Downloading bob.jar (${defoldVersion})`)
  console.log(`  from: ${url}`)
  console.log(`  to:   ${path.relative(repoRoot, destination)}`)

  await mkdir(path.dirname(destination), { recursive: true })

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download bob.jar (${response.status} ${response.statusText}) from ${url}`)
  }

  if (!response.body) {
    throw new Error(`Failed to download bob.jar: empty response body from ${url}`)
  }

  await pipeline(response.body, createWriteStream(destination))

  const info = await stat(destination)
  if (!info.isFile() || info.size < 1024 * 1024) {
    throw new Error(`Downloaded bob.jar looks invalid: ${destination}`)
  }
}

async function ensureBobJar(options) {
  if (options.bobJar) {
    if (!options.dryRun && !(await pathExists(options.bobJar))) {
      throw new Error(`bob.jar not found: ${options.bobJar}`)
    }
    return options.bobJar
  }

  const versionedBobJar = path.join(defaultToolsDir, `bob-${options.defoldVersion}.jar`)
  if (await pathExists(versionedBobJar)) {
    return versionedBobJar
  }

  const legacyBobJar = path.join(repoRoot, '.tools', 'defold', `bob-${options.defoldVersion}.jar`)
  if (await pathExists(legacyBobJar)) {
    return legacyBobJar
  }

  if (options.dryRun) {
    return versionedBobJar
  }

  if (options.skipDownload) {
    throw new Error(
      `bob.jar not found for Defold ${options.defoldVersion}. ` +
        `Download it manually to ${versionedBobJar} or pass --bob-jar.`,
    )
  }

  await downloadBobJar(options.defoldVersion, versionedBobJar)
  return versionedBobJar
}

async function assertProject(projectDir) {
  const gameProjectPath = path.join(projectDir, 'game.project')
  if (!(await pathExists(gameProjectPath))) {
    throw new Error(`game.project not found in project dir: ${projectDir}`)
  }
}

async function prepareHtml5LoaderAssets(projectDir, dryRun) {
  if (dryRun) {
    return
  }

  const sourceDir = path.join(projectDir, 'assets', 'images')
  const bundleResourceDir = path.join(projectDir, 'html5', 'bundle_resources', 'web')
  const filenames = ['background.png', 'logo.png']

  await mkdir(bundleResourceDir, { recursive: true })
  for (const filename of filenames) {
    const source = path.join(sourceDir, filename)
    if (!(await pathExists(source))) {
      throw new Error(`HTML5 loader asset missing: ${path.relative(repoRoot, source)}`)
    }
    await copyFile(source, path.join(bundleResourceDir, filename))
  }

  console.log('Prepared HTML5 loader assets')
  console.log(`  from: ${path.relative(repoRoot, sourceDir)}`)
  console.log(`  to:   ${path.relative(repoRoot, bundleResourceDir)}`)
}

function buildBobCommand(options, bobJar) {
  const javaExecutable = resolveJavaExecutable(options.java)
  const args = [
    '-jar',
    bobJar,
    '--platform',
    'wasm-web',
    '--bundle-output',
    options.bundleOutput,
    '--variant',
    options.variant,
    '--archive',
  ]

  if (options.architectures) {
    args.push('--architectures', options.architectures)
  }

  if (options.buildServer) {
    args.push('--build-server', options.buildServer)
  }

  args.push('resolve')
  if (!options.skipDistclean) {
    args.push('distclean')
  }
  args.push('build', 'bundle')

  return { javaExecutable, args }
}

function runBob(command, projectDir, dryRun) {
  const printable = [command.javaExecutable, ...command.args]
    .map((part) => (/\s/.test(part) ? `"${part}"` : part))
    .join(' ')

  console.log(`Running bob from ${path.relative(repoRoot, projectDir)}`)
  console.log(`  ${printable}`)

  if (dryRun) {
    return
  }

  const result = spawnSync(command.javaExecutable, command.args, {
    cwd: projectDir,
    stdio: 'inherit',
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`bob.jar failed with exit code ${result.status ?? 'unknown'}`)
  }
}

async function assertBundleOutput(bundleOutput, projectDir) {
  const projectTitle = (await readFile(path.join(projectDir, 'game.project'), 'utf8'))
    .match(/^\s*title\s*=\s*(.+)\s*$/m)?.[1]
    ?.trim()

  if (!projectTitle) {
    throw new Error(`Could not read project title from ${path.join(projectDir, 'game.project')}`)
  }

  const bundleDir = path.join(bundleOutput, projectTitle)
  for (const requiredFile of ['index.html', 'dmloader.js']) {
    const filePath = path.join(bundleDir, requiredFile)
    if (!(await pathExists(filePath))) {
      throw new Error(`Expected bundle file missing: ${path.relative(repoRoot, filePath)}`)
    }
  }

  console.log(`HTML5 bundle ready at ${path.relative(repoRoot, bundleDir)}`)
  return bundleDir
}

async function syncBundle(bundleDir) {
  const syncScript = path.join(scriptDir, 'sync-defold-web-bundle.mjs')
  const syncProcess = spawnSync(process.execPath, [syncScript, bundleDir], {
    cwd: repoRoot,
    stdio: 'inherit',
  })

  if (syncProcess.error) {
    throw syncProcess.error
  }

  if (syncProcess.status !== 0) {
    throw new Error(`Bundle sync failed with exit code ${syncProcess.status ?? 'unknown'}`)
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (options.help) {
    printHelp()
    return
  }

  if (!options.defoldVersion) {
    options.defoldVersion = await readDefaultDefoldVersion(options.bundleOutput)
  }

  await assertProject(options.projectDir)
  await prepareHtml5LoaderAssets(options.projectDir, options.dryRun)

  const javaExecutable = resolveJavaExecutable(options.java)
  assertJava(javaExecutable, options.dryRun)

  const bobJar = await ensureBobJar(options)
  console.log(`Using bob.jar: ${path.relative(repoRoot, bobJar)}`)

  const command = buildBobCommand({ ...options, java: javaExecutable }, bobJar)
  runBob(command, options.projectDir, options.dryRun)

  if (options.dryRun) {
    return
  }

  const bundleDir = await assertBundleOutput(options.bundleOutput, options.projectDir)

  if (options.sync) {
    await syncBundle(bundleDir)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
