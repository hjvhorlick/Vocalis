/* Browser-level smoke test of the real UI, API, WAV decoder and audio graph.
 * Run with BROWSER_EXECUTABLE_PATH set to a Chromium executable and servers on 5173/8000.
 * Audio output is muted in headless Chromium; this does not test audible speakers or intelligibility.
 */
const { chromium } = require('../../apps/web/node_modules/playwright-core');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

(async () => {
  const base = process.env.VOCALIS_TEST_BASE || 'http://127.0.0.1:5173';
  const browserPath = process.env.BROWSER_EXECUTABLE_PATH;
  if (!browserPath) throw new Error('Set BROWSER_EXECUTABLE_PATH to a Chromium executable');
  const id = `audio-test-${randomUUID()}`;
  const response = await fetch(`${base}/api/profiles/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({profile_id: id, name: 'Temporary audio test', preset: 'Test'})
  });
  if (!response.ok) throw new Error(`Could not create test profile: ${response.status}`);
  let browser;
  try {
    browser = await chromium.launch({executablePath: browserPath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']});
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/tts`);
    await page.waitForSelector(`option[value="${id}"]`, {state: 'attached'});
    await page.getByLabel('Voice profile').selectOption(id);
    const toneSignal = page.waitForResponse(r => r.url().includes('/engine/playback-diagnostics') && r.request().method() === 'POST' && r.request().postDataJSON()?.event === 'test_tone_signal' && r.ok(), {timeout: 10000});
    await page.getByRole('button', {name: 'Play test beep'}).click();
    const tone = (await toneSignal).request().postDataJSON();
    assert(tone.value > 0.1 && tone.detail === 'running', 'No test beep signal reached the browser audio graph');
    console.log('Test beep graph:', {peak: tone.value, context: tone.detail});
    const signal = page.waitForResponse(r => r.url().includes('/engine/playback-diagnostics') && r.request().method() === 'POST' && r.request().postDataJSON()?.event === 'web_audio_signal' && r.ok(), {timeout: 10000});
    await page.getByRole('button', {name: 'Generate experimental audio'}).click();
    await page.waitForSelector('audio');
    const event = (await signal).request().postDataJSON();
    assert(event.value > 0.001 && event.detail === 'running', 'Direct audio graph has no signal');
    console.log('Direct Web Audio graph:', {peak: event.value, context: event.detail});
    const result = await page.locator('audio').evaluate(async (audio) => {
      const data = await (await fetch(audio.src)).arrayBuffer();
      const context = new AudioContext();
      const decoded = await context.decodeAudioData(data.slice(0));
      const samples = decoded.getChannelData(0);
      let energy = 0;
      for (const sample of samples) energy += sample * sample;
      const source = context.createMediaElementSource(audio);
      const analyser = context.createAnalyser();
      source.connect(analyser);
      analyser.connect(context.destination);
      await context.resume();
      audio.currentTime = 0;
      await audio.play();
      let peak = 0;
      for (let i = 0; i < 15; i++) {
        await new Promise(resolve => setTimeout(resolve, 50));
        const frame = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(frame);
        for (const sample of frame) peak = Math.max(peak, Math.abs(sample));
      }
      const result = {duration: decoded.duration, rms: Math.sqrt(energy / samples.length),
        playbackPeak: peak, time: audio.currentTime, state: context.state, error: audio.error?.message};
      await context.close();
      return result;
    });
    assert(result.duration > 0 && result.rms > 0.001, 'Decoded WAV was silent or empty');
    assert(result.playbackPeak > 0.001 && result.time > 0 && result.state === 'running', 'No signal reached the browser audio graph');
    assert(!result.error && !errors.length, `Browser errors: ${result.error || errors.join(', ')}`);
    console.log('Browser audio graph test passed:', result);
    // Simulate an enumerated headset without requiring real hardware.
    const routing = await browser.newPage();
    await routing.addInitScript(() => {
      window.__sinkCalls = [];
      Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', {value: async () => [
        {kind:'audiooutput', deviceId:'headset-test', label:'Test headset'}
      ]});
      AudioContext.prototype.setSinkId = async function(id) { window.__sinkCalls.push(['context',id]); };
      HTMLMediaElement.prototype.setSinkId = async function(id) { window.__sinkCalls.push(['media',id]); };
    });
    await routing.goto(`${base}/tts`);
    await routing.waitForSelector(`option[value="${id}"]`, {state:'attached'});
    await routing.getByRole('button', {name:'Find audio devices'}).click();
    await routing.getByLabel('Output device').selectOption('headset-test');
    await routing.getByText('Selected output applied to direct audio.').waitFor();
    await routing.getByLabel('Voice profile').selectOption(id);
    await routing.getByRole('button', {name:'Generate experimental audio'}).click();
    await routing.waitForSelector('audio');
    await routing.waitForFunction(() => window.__sinkCalls.some(([type, id]) => type === 'media' && id === 'headset-test'));
    await routing.getByLabel('Output device').selectOption('');
    await routing.getByText('Using the computer’s default audio output.').waitFor();
    const sinkCalls = await routing.evaluate(() => window.__sinkCalls);
    assert(sinkCalls.some(([type, value]) => type === 'context' && value === 'headset-test'));
    assert(sinkCalls.some(([type, value]) => type === 'context' && value === ''));
    console.log('Mock headset routing and default reset passed:', sinkCalls);
    await routing.close();
  } finally {
    if (browser) await browser.close();
    await fetch(`${base}/api/profiles/${encodeURIComponent(id)}`, {method:'DELETE'});
  }
})().catch(error => {console.error(error); process.exitCode = 1});
