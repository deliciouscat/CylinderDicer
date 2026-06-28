import { appendFile, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { validateCommand } from './protocol.mjs'

const statusFile = process.env.QA_STATUS_FILE || '/tmp/cylinderdicer_qa_status.txt'
const commandFile = process.env.QA_COMMAND_FILE || '/tmp/cylinderdicer_qa_commands.txt'
const port = Number(process.env.PORT || 4319)
const host = process.env.HOST || '127.0.0.1'

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(body))
}

async function readStatus() {
  const raw = await readFile(statusFile, 'utf8')
  return JSON.parse(raw)
}

async function readBody(request) {
  let body = ''
  for await (const chunk of request) {
    body += chunk
    if (body.length > 64 * 1024) {
      throw new Error('request_too_large')
    }
  }
  return JSON.parse(body || '{}')
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${host}:${port}`)

  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {})
    return
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { ok: true })
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/status') {
    try {
      sendJson(response, 200, await readStatus())
    } catch (error) {
      sendJson(response, 503, {
        error: 'status_unavailable',
        detail: error instanceof Error ? error.message : String(error),
      })
    }
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/commands') {
    try {
      const status = await readStatus()
      const command = await readBody(request)
      const validation = validateCommand(status, command)
      if (!validation.ok) {
        sendJson(response, 409, { error: validation.error })
        return
      }

      await appendFile(commandFile, `${JSON.stringify(command)}\n`, 'utf8')
      sendJson(response, 202, { accepted: true, id: command.id })
    } catch (error) {
      sendJson(response, 400, {
        error: 'command_rejected',
        detail: error instanceof Error ? error.message : String(error),
      })
    }
    return
  }

  sendJson(response, 404, { error: 'not_found' })
})

server.listen(port, host, () => {
  console.log(`CylinderDicer vertual server: http://${host}:${port}`)
  console.log(`Status: ${statusFile}`)
  console.log(`Commands: ${commandFile}`)
})
