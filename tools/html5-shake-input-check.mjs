#!/usr/bin/env node
/**
 * Focused HTML5 regression check for native Space -> local shake gauge input.
 * This uses the standalone local simulator and does not exercise Convex.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const harnessSource = readFileSync(join(__dirname, 'html5-diagnosis-harness.js'), 'utf8')
const url = process.argv.find((arg) => arg.startsWith('http'))
  ?? 'http://127.0.0.1:5173/play/index.html'

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

async function pressSpace(durationMs = 140) {
  await page.keyboard.down('Space')
  await page.waitForTimeout(durationMs)
  await page.keyboard.up('Space')
  await page.waitForTimeout(50)
}

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(
    () => typeof window.CylinderDicerSendToDefold === 'function',
    { timeout: 120000 },
  )
  await page.evaluate(harnessSource)
  await page.evaluate(() => window.__cdHarness.startMatch())
  await page.waitForTimeout(700)
  await page.evaluate(() => window.__cdHarness.qa('load_all', 'local-player'))
  await page.evaluate(async () => window.__cdHarness.waitStatus(
    (status) => status.phase === 'cup_shake',
    8000,
  ))
  await page.evaluate(() => document.querySelector('canvas')?.focus())

  for (let index = 0; index < 3; index += 1) {
    await pressSpace()
  }
  const afterThree = await page.evaluate(async () => window.__cdHarness.waitStatus(
    (status) => status.phase === 'cup_shake'
      && Number(status.visual?.shake?.gauge ?? 0) > 0,
    3000,
  ))

  for (let index = 0; index < 2; index += 1) {
    await pressSpace(100)
  }
  const complete = await page.evaluate(async () => window.__cdHarness.waitStatus(
    (status) => Number(status.shake?.counts?.['local-player'] ?? 0) >= 6,
    5000,
  ))

  const report = {
    ok: Number(afterThree?.visual?.shake?.gauge ?? 0) > 0
      && complete?.visual?.shake?.submitted === true
      && Number(complete?.shake?.counts?.['local-player'] ?? 0) >= 6
      && errors.length === 0,
    url,
    gaugeAfterThree: afterThree?.visual?.shake?.gauge,
    gaugeComplete: complete?.visual?.shake?.gauge,
    serverCount: complete?.shake?.counts?.['local-player'],
    errors,
  }
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) {
    process.exitCode = 1
  }
} finally {
  await browser.close()
}
