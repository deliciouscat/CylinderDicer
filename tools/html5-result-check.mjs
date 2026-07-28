#!/usr/bin/env node
/**
 * Focused standalone-local-simulator QA for the result HUD.
 * This does not exercise Convex rating writes or production matchmaking.
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const harnessSource = readFileSync(join(__dirname, 'html5-diagnosis-harness.js'), 'utf8')
const url = process.argv.find((arg) => arg.startsWith('http'))
  ?? 'http://127.0.0.1:5173/play/index.html'
const outputDir = join(__dirname, '../.tmp/html5-result-shots')
mkdirSync(outputDir, { recursive: true })

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--enable-webgl'],
}).catch(() => chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-gl=angle', '--enable-webgl'],
}))
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errors = []
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
    errors.push(message.text())
  }
})
page.on('pageerror', (error) => errors.push(String(error.message ?? error)))
page.on('response', (response) => {
  if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`)
})

async function statusWhere(predicateSource, timeout = 10000) {
  return await page.evaluate(async ({ predicateSource, timeout }) => {
    const predicate = new Function('status', `return (${predicateSource})(status)`)
    return await window.__cdHarness.waitStatus(predicate, timeout)
  }, { predicateSource, timeout })
}

async function clickLogical(x, y) {
  const point = await page.evaluate(({ x, y }) => {
    const canvas = document.getElementById('canvas') || document.querySelector('canvas')
    const rect = canvas.getBoundingClientRect()
    return {
      x: rect.left + x / 1280 * rect.width,
      y: rect.bottom - y / 720 * rect.height,
    }
  }, { x, y })
  await page.mouse.click(point.x, point.y)
}

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(
    () => typeof window.CylinderDicerSendToDefold === 'function',
    { timeout: 120000 },
  )
  await page.evaluate(harnessSource)
  await page.evaluate(() => window.__cdHarness.startMatch())
  await page.waitForTimeout(1000)

  await page.evaluate(() => window.__cdHarness.qa('result', 'local-player', {
    place: 4,
    player_count: 6,
    mmr_before: 1000,
    mmr_after: 993,
    rated: true,
    match_complete: false,
  }))
  const eliminated = await statusWhere(
    `(status) => status.visual?.result?.visible === true
      && status.visual.result.place === 4`,
  )
  await page.screenshot({ path: join(outputDir, 'eliminated-choice-desktop.png') })

  await clickLogical(752, 126)
  const spectating = await statusWhere(
    `(status) => status.visual?.result?.visible === false`,
  )
  await page.screenshot({ path: join(outputDir, 'spectating-desktop.png') })

  await page.evaluate(() => window.__cdHarness.qa('result', 'local-player', {
    place: 1,
    player_count: 6,
    mmr_before: 1000,
    mmr_after: 1016,
    rated: true,
    match_complete: true,
  }))
  const complete = await statusWhere(
    `(status) => status.visual?.result?.visible === true
      && status.visual.result.place === 1
      && status.visual.result.reel_complete === true`,
    12000,
	  )
	  await page.screenshot({ path: join(outputDir, 'victory-final-desktop.png') })

	  await page.evaluate(() => { window.__fromDefold.length = 0 })
	  await clickLogical(640, 126)
	  await page.waitForFunction(
	    () => window.__fromDefold.some((message) => message.type === 'EXIT_TO_LOBBY'),
	    { timeout: 5000 },
	  )

	  await page.setViewportSize({ width: 375, height: 812 })
	  await page.waitForTimeout(500)
	  await page.screenshot({ path: join(outputDir, 'victory-final-mobile.png') })

	  await page.setViewportSize({ width: 1440, height: 900 })
	  await page.waitForTimeout(500)
	  await page.screenshot({ path: join(outputDir, 'victory-final-wide.png') })

  console.log(JSON.stringify({
    ok: Boolean(eliminated && spectating && complete) && errors.length === 0,
    url,
    outputDir,
    eliminated: eliminated?.visual?.result,
    spectating: spectating?.visual?.result,
    complete: complete?.visual?.result,
    exitToLobby: true,
    errors,
  }, null, 2))
} finally {
  await browser.close()
}
