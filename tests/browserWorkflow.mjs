// Optional browser smoke test for the intentionally small four-section workflow.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'], headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:3000');

  const workflow = ['1. Original Voices', '2. Voice Creator', '3. New Voice Library', '4. Script to MP3'];
  for (const name of workflow) assert.equal(await page.getByRole('button', { name, exact: true }).count(), 1, name);
  assert.equal(await page.getByRole('button').count() >= 4, true);

  await page.getByRole('button', { name: '1. Original Voices', exact: true }).click();
  await page.getByRole('heading', { name: 'Original Voices', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Test voice', exact: true }).count(), 60);

  await page.getByRole('button', { name: '2. Voice Creator', exact: true }).click();
  await page.getByRole('heading', { name: 'Voice Creation Studio', exact: true }).waitFor();
  assert.ok(await page.getByLabel('Base source', { exact: true }).count());

  await page.getByRole('button', { name: '3. New Voice Library', exact: true }).click();
  await page.getByRole('heading', { name: 'New Voice Library', exact: true }).waitFor();
  await page.getByText('No new voices yet', { exact: true }).waitFor();

  await page.getByRole('button', { name: '4. Script to MP3', exact: true }).click();
  await page.getByRole('heading', { name: 'Script to MP3', exact: true }).waitFor();
  assert.ok(await page.getByLabel('Voice', { exact: true }).count());
  assert.ok(await page.getByLabel('Script', { exact: true }).count());

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log('PASS four-section original -> creator -> new library -> script workflow');
} finally {
  await browser.close();
}
