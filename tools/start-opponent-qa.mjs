import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const children = []

function start(name, cwd, args) {
  const child = spawn('npm', args, {
    cwd,
    stdio: 'inherit',
  })
  children.push(child)
  child.on('error', (error) => {
    console.error(`[opponent-qa] failed to start ${name}: ${error.message}`)
    shutdown(1)
  })
  child.on('exit', (code, signal) => {
    if (stopping) {
      return
    }
    const reason = signal ? `signal ${signal}` : `code ${code}`
    console.error(`[opponent-qa] ${name} exited with ${reason}`)
    shutdown(code ?? 1)
  })
}

let stopping = false
function shutdown(code = 0) {
  if (stopping) {
    return
  }
  stopping = true
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM')
    }
  }
  setTimeout(() => process.exit(code), 100)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

start('vertual-server', join(root, 'vertual-server'), ['start'])
start('opponent-controller', join(root, 'opponent-controller'), ['run', 'dev'])

console.log('[opponent-qa] starting server and controller')
console.log('[opponent-qa] controller: http://127.0.0.1:4318')
