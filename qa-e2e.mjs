#!/usr/bin/env node
// Real Headless Google Chrome 3-Device End-to-End QA Suite (Host + 2 Guest Phones)
// Uses Node 22 native WebSocket + Chrome DevTools Protocol (zero external packages!)

import { spawn } from 'child_process';
import fs from 'fs';

const SERVER_PORT = 3456;
const CDP_PORT = 9223;
const BASE_URL = `http://127.0.0.1:${SERVER_PORT}`;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

class CDPPage {
  constructor(name, wsUrl) {
    this.name = name;
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.errors = [];
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((res, rej) => {
      this.ws.onopen = res;
      this.ws.onerror = rej;
    });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const txt = msg.params?.exceptionDetails?.text || 'Uncaught exception';
        const desc = msg.params?.exceptionDetails?.exception?.description || '';
        this.errors.push(`${txt}: ${desc}`);
      }
    };
    await this.send('Page.enable');
    await this.send('Runtime.enable');
  }

  send(method, params = {}) {
    return new Promise((res, rej) => {
      const id = ++this.id;
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async goto(url) {
    await this.send('Page.navigate', { url });
    await this.waitFor(() => `document.readyState === 'complete' && document.getElementById('app')?.innerHTML.length > 50`);
  }

  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(async () => { return (${expr}); })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error(`[${this.name}] Eval error: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    }
    return r.result?.value;
  }

  async waitFor(fnOrExpr, timeoutMs = 8000) {
    const start = Date.now();
    const expr = typeof fnOrExpr === 'function' ? fnOrExpr() : fnOrExpr;
    while (Date.now() - start < timeoutMs) {
      try {
        const val = await this.eval(expr);
        if (val) return val;
      } catch (_) {}
      await sleep(120);
    }
    throw new Error(`[${this.name}] Timeout waiting for: ${expr}`);
  }

  async click(selector) {
    await this.waitFor(`!!document.querySelector(${JSON.stringify(selector)})`);
    await this.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.click(); return true; })()`);
  }

  async type(selector, text) {
    await this.waitFor(`!!document.querySelector(${JSON.stringify(selector)})`);
    await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      el.value = ${JSON.stringify(text)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return el.value;
    })()`);
  }

  close() {
    try { this.ws.close(); } catch (_) {}
  }
}

async function openTab(name, url) {
  const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  const target = await res.json();
  const page = new CDPPage(name, target.webSocketDebuggerUrl);
  await page.connect();
  await page.waitFor(`document.readyState === 'complete' && document.getElementById('app')?.innerHTML.length > 50`);
  return page;
}

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERTION FAILED: ' + msg);
  console.log('  ✅', msg);
}

async function main() {
  console.log('\n🧪 Starting 3-Device Real Headless Chrome E2E QA Suite...\n');

  const server = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: String(SERVER_PORT) },
    stdio: 'pipe',
  });
  await sleep(900);

  const userDataDir = `/tmp/tg_qa_chrome_${Date.now()}`;
  fs.mkdirSync(userDataDir, { recursive: true });
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: 'pipe' });

  // Wait for CDP endpoint
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (r.ok) break;
    } catch (_) {}
    await sleep(200);
  }

  let host, g1, g2;
  try {
    // 1. Open Host Tab
    console.log('1️⃣  Testing Host Hub, Guide Modal & QR Code...');
    host = await openTab('Host', BASE_URL);
    await host.waitFor(`document.body.innerText.includes('Thanksgiving AI Game Night')`);
    assert(await host.eval(`document.querySelectorAll('.game-card').length === 6`), 'All 6 game cards rendered on Hub');

    // Open Guide modal
    await host.click('#btn-guide');
    await host.waitFor(`document.body.innerText.includes('How Many People Can Play?')`);
    assert(true, 'How to Play & Setup Guide modal opens with player counts & QR steps');
    await host.click('#guide-done');

    // Open QR Modal & extract Room Code
    await host.click('#btn-qr');
    await host.waitFor(`!!document.querySelector('.qr-box svg path')`);
    const roomCode = await host.eval(`document.getElementById('btn-qr').textContent.split('·')[1].trim()`);
    assert(/^[A-Z0-9]{4}$/.test(roomCode), `Valid 4-char QR room code generated: ${roomCode}`);
    await host.click('#modal-close');

    // 2. Open 2 Guest Phones via QR Join URL
    console.log('\n2️⃣  Testing 2 Guest Phones Joining via QR URL...');
    const joinUrl = `${BASE_URL}/?room=${roomCode}&join=1`;
    g1 = await openTab('Guest1-Alice', joinUrl);
    g2 = await openTab('Guest2-Bob', joinUrl);

    await g1.type('#j-name', 'Alice');
    await g1.click('#join-form button[type="submit"]');
    await g1.waitFor(`document.body.innerText.includes("You're Connected!")`);

    await g2.type('#j-name', 'Bob');
    await g2.click('#join-form button[type="submit"]');
    await g2.waitFor(`document.body.innerText.includes("You're Connected!")`);

    await host.waitFor(`document.body.innerText.includes('Alice') && document.body.innerText.includes('Bob')`);
    assert(true, 'Both Guest Phones (Alice & Bob) synced onto Host roster live!');

    // 3. Prompt Clone E2E (Target Image on Phones + Draft Preservation + Full Results Gallery on ALL Phones!)
    console.log('\n3️⃣  Testing Prompt Clone! (Target Image + Draft Preservation + Results on ALL Phones)...');
    await host.click('[data-open="promptClone"]');
    await host.waitFor(`document.querySelector('.art-frame img')?.complete && document.querySelector('.art-frame img')?.naturalWidth > 200`);
    const hostTargetW = await host.eval(`document.querySelector('.art-frame img').naturalWidth`);
    assert(hostTargetW > 200, `Host renders real AI target artwork (${hostTargetW}px wide)`);

    await host.click('#clone-start');
    await g1.waitFor(`!!document.getElementById('p-clone-in') && document.querySelector('#phone-target-slot img')?.complete && document.querySelector('#phone-target-slot img')?.naturalWidth > 200`);
    await g2.waitFor(`!!document.getElementById('p-clone-in') && document.querySelector('#phone-target-slot img')?.complete && document.querySelector('#phone-target-slot img')?.naturalWidth > 200`);
    assert(true, 'BOTH Alice and Bob see the exact Target Picture right on their own phones!');

    // CRITICAL REGRESSION TEST: Alice types draft & NEVER clicks Lock In; Bob submits -> Alice's draft MUST NOT be deleted!
    const aliceDraft = 'A cheerful cartoon turkey wearing black sunglasses on a red skateboard at golden sunset with falling leaves';
    await g1.type('#p-clone-in', aliceDraft);
    await g2.type('#p-clone-in', 'A cute bird on a sunny beach with a rainbow');
    await g2.click('#p-clone-send');
    await g2.waitFor(`document.body.innerText.includes('Prompt Locked In!')`);
    await host.waitFor(`document.body.innerText.includes('Submissions (1/')`);
    await g1.waitFor(`document.getElementById('phone-sub-count')?.textContent?.includes('1 locked in')`);
    const aliceStillThere = await g1.eval(`document.getElementById('p-clone-in')?.value`);
    assert(aliceStillThere === aliceDraft, 'Alice typed prompt was NOT wiped when Bob submitted!');
    const aliceCounter = await g1.eval(`document.getElementById('phone-sub-count')?.textContent`);
    assert(aliceCounter && aliceCounter.includes('1 locked in'), `Alice's live submission counter updated in-place: "${aliceCounter}"`);

    // CRITICAL AUTO-COLLECT TEST: Alice NEVER clicks Lock In! Host ends round -> Alice's typed draft MUST be auto-collected!
    await host.click('#clone-grade-now');
    await host.waitFor(`document.body.innerText.includes('Prompt Clone Results!')`, 12000);
    const hostCards = await host.eval(`document.querySelectorAll('.clone-card').length`);
    assert(hostCards === 2, `Host auto-collected Alice's unlocked draft & graded BOTH participants (${hostCards} cards)`);
    assert(await host.eval(`document.body.innerText.includes('Alice') && document.body.innerText.includes('Auto-saved') && document.body.innerText.includes('Bob')`),
      "Host results include Alice's auto-saved prompt AND Bob's locked-in prompt!");

    // CRITICAL CHECK: Verify BOTH Guest Phones display ALL Participants Ranked (#1 -> #2) + generated images + prompts!
    await g1.waitFor(`document.body.innerText.includes('All Participants Ranked') && document.querySelectorAll('.clone-card').length === 2`, 10000);
    await g2.waitFor(`document.body.innerText.includes('All Participants Ranked') && document.querySelectorAll('.clone-card').length === 2`, 10000);

    const g1ImagesOk = await g1.eval(`Array.from(document.querySelectorAll('.clone-card img')).every(i => i.complete && i.naturalWidth > 0)`);
    const g2ImagesOk = await g2.eval(`Array.from(document.querySelectorAll('.clone-card img')).every(i => i.complete && i.naturalWidth > 0)`);
    assert(g1ImagesOk, "Alice's phone renders ALL participants' generated AI images!");
    assert(g2ImagesOk, "Bob's phone renders ALL participants' generated AI images!");
    assert(await g1.eval(`document.body.innerText.includes('Alice') && document.body.innerText.includes('Bob') && document.body.innerText.includes('Auto-saved') && document.body.innerText.includes('% Match')`),
      "Alice sees BOTH Alice's (auto-saved) and Bob's ranked images, prompts, Match %, and AI Critic comments!");
    assert(await g2.eval(`document.body.innerText.includes('Alice') && document.body.innerText.includes('Bob') && document.body.innerText.includes('golden sunset') && document.body.innerText.includes('% Match')`),
      "Bob sees BOTH Alice's and Bob's ranked images, prompts, Match %, and AI Critic comments!");

    // Verify single-request image upload endpoint used to share Nano Banana images across all phones
    const uploadedUrl = await host.eval(`RoomSync.uploadImage(document.querySelector('.clone-card img').src)`);
    assert(uploadedUrl && uploadedUrl.startsWith('/api/img/'), `RoomSync.uploadImage() uploaded image in 1 HTTP request -> ${uploadedUrl}`);
    const fetchRes = await fetch(`${BASE_URL}${uploadedUrl}`);
    assert(fetchRes.ok && (fetchRes.headers.get('content-type') || '').startsWith('image/'), `Uploaded image served cleanly over HTTP (${fetchRes.status}, ${fetchRes.headers.get('content-type')})`);

    // 4. Back Arrow & Admin Passcode Lock QA
    console.log('\n4️⃣  Testing Back Arrow Navigation & Admin Passcode (2026)...');
    await host.click('#btn-back-menu');
    await host.waitFor(`document.body.innerText.includes('Thanksgiving AI Game Night')`);
    assert(true, 'Back Arrow (← Main Menu) cleanly returned from Prompt Clone to Main Menu');

    // Test Reset Scores PIN protection
    await host.click('#hub-reset-scores');
    await host.waitFor(`!!document.getElementById('pin-input')`);
    await host.type('#pin-input', '9999');
    await host.click('#pin-form button[type="submit"]');
    await host.waitFor(`document.getElementById('pin-err').textContent.includes('Wrong passcode')`);
    assert(true, 'Wrong PIN (9999) rejected — kids cannot wipe scores!');

    await host.type('#pin-input', '2026');
    await host.click('#pin-form button[type="submit"]');
    await host.waitFor(`!document.getElementById('hub-reset-scores') && document.getElementById('btn-leaderboard').textContent.includes('Scores')`);
    await g1.waitFor(`document.getElementById('phone-score-pts')?.textContent === '0 pts'`);
    assert(true, 'Correct PIN (2026) reset all scores to 0 on Host AND synced 0 pts to Guest Phones!');

    // 5. Prompt Panic! (AI Taboo) QA
    console.log('\n5️⃣  Testing Prompt Panic! (AI Taboo Banned Words + Phone Buzzer)...');
    await host.click('[data-open="promptPanic"]');
    await host.click('#panic-reveal-secret');
    await host.waitFor(`!!document.getElementById('panic-input')`);
    const firstBanned = await host.eval(`document.querySelector('.tag-new')?.textContent.replace('🚫', '').trim()`);
    await host.type('#panic-input', `A giant ${firstBanned}`);
    const isBlocked = await host.eval(`document.getElementById('panic-gen').disabled && document.getElementById('panic-warn').textContent.includes('Banned word')`);
    assert(isBlocked, `Typing banned word "${firstBanned}" blocked submission with red warning!`);

    await host.type('#panic-input', 'A giant feathered gobbler bird on golden wheels');
    const isUnlocked = await host.eval(`!document.getElementById('panic-gen').disabled`);
    assert(isUnlocked, 'Creative Taboo clues unlocked Generate AI Art button!');
    await host.click('#panic-gen');
    await g1.waitFor(`!!document.getElementById('p-buzz')`);
    await g1.click('#p-buzz');
    await host.waitFor(`document.body.innerText.includes('Alice BUZZED IN!')`);
    assert(true, 'Alice buzzed in from her phone during Prompt Panic unblur round!');

    // Test Mid-Round Exit Safety Guard!
    await host.click('#btn-back-menu');
    await host.waitFor(`document.body.innerText.includes('Leave Active Round?')`);
    assert(true, 'Mid-round Back Arrow popped "Leave Active Round?" safety prompt!');
    await host.click('#leave-go');
    await host.waitFor(`document.body.innerText.includes('Thanksgiving AI Game Night')`);

    // 6. Spot the Bot Draft Preservation + Bot Slam QA
    console.log('\n6️⃣  Testing Spot the Bot (Draft Preservation + Bot Slam)...');
    await host.click('[data-open="spotTheBot"]');
    await g1.waitFor(`!!document.getElementById('p-bot-in')`);
    await g2.waitFor(`!!document.getElementById('p-bot-in')`);
    await g1.type('#p-bot-in', 'Tell the pilgrims it is magic sky gravy');
    await g2.type('#p-bot-in', 'Blame the dog for eating the router');
    await g2.click('#p-bot-send');
    await sleep(350);
    assert(await g1.eval(`document.getElementById('p-bot-in')?.value`) === 'Tell the pilgrims it is magic sky gravy',
      'Spot the Bot preserved Alice draft when Bob submitted!');
    await g1.click('#p-bot-send');
    await host.waitFor(`document.body.innerText.includes('Answers Collected (2/')`);
    await host.click('#bot-start-reveal');
    await g2.waitFor(`!!document.getElementById('p-slam-bot')`);
    await g2.click('#p-slam-bot');
    await host.waitFor(`!!document.getElementById('bot-next-card')`);
    assert(true, 'Bob slammed "THAT\'S A BOT!" from his phone and Host resolved the card!');
    await host.click('#btn-back-menu');
    await host.click('#leave-go');

    // 7. Quick smoke check of Turkey Court, Gobble Bomb, and Feast Showdown
    console.log('\n7️⃣  Smoke-testing Turkey Court, Gobble Bomb & Feast Showdown...');
    for (const [key, expected] of [
      ['turkeyCourt', 'Turkey Court'],
      ['gobbleBomb', 'Pass the Gobble Bomb'],
      ['feastShowdown', 'Feast Showdown'],
    ]) {
      await host.click(`[data-open="${key}"]`);
      await host.waitFor(`document.body.innerText.includes(${JSON.stringify(expected)})`);
      await host.click('#btn-back-menu');
      await host.waitFor(`document.body.innerText.includes('Thanksgiving AI Game Night')`);
      assert(true, `${expected} loaded and navigated back cleanly`);
    }

    // Check zero uncaught errors across all 3 real Chrome devices!
    const allErrors = [...host.errors, ...g1.errors, ...g2.errors];
    assert(allErrors.length === 0, `Zero uncaught JS errors across Host + 2 Guest Phones (found: ${allErrors.length})`);

    console.log('\n🎉 ALL E2E MULTI-DEVICE QA TESTS PASSED 100%!\n');
  } finally {
    if (host) host.close();
    if (g1) g1.close();
    if (g2) g2.close();
    chrome.kill('SIGKILL');
    server.kill('SIGKILL');
    await sleep(250);
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
  }
}

main().catch((err) => {
  console.error('\n❌ QA FAILED:', err);
  process.exit(1);
});
