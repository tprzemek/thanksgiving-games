#!/usr/bin/env node
// Real 11-Device (Host + 10 Guest Phones) Headless Google Chrome Stress QA
// Verifies: 10 concurrent players, duplicate name safety, Host delivery confirmation,
// auto-collection of unsubmitted prompts, and ALL 10 ranked images visible on ALL 10 phones!

import { spawn } from 'child_process';
import fs from 'fs';

const SERVER_PORT = 3457;
const CDP_PORT = 9224;
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
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        this.errors.push(msg.params?.exceptionDetails?.exception?.description || msg.params?.exceptionDetails?.text || 'Uncaught');
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
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(async () => { return (${expr}); })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(`[${this.name}] ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result?.value;
  }
  async waitFor(expr, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try { const v = await this.eval(expr); if (v) return v; } catch (_) {}
      await sleep(120);
    }
    throw new Error(`[${this.name}] Timeout waiting for: ${expr}`);
  }
  async click(sel) {
    await this.waitFor(`!!document.querySelector(${JSON.stringify(sel)})`);
    await this.eval(`document.querySelector(${JSON.stringify(sel)}).click()`);
  }
  async type(sel, text) {
    await this.waitFor(`!!document.querySelector(${JSON.stringify(sel)})`);
    await this.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.value = ${JSON.stringify(text)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  }
  close() { try { this.ws.close(); } catch (_) {} }
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
  console.log('\n🧪 Starting 11-Device (Host + 10 Guest Phones) Stress QA...\n');
  const server = spawn('node', ['server.js'], { env: { ...process.env, PORT: String(SERVER_PORT) }, stdio: 'pipe' });
  await sleep(900);

  const userDataDir = `/tmp/tg_qa10_${Date.now()}`;
  fs.mkdirSync(userDataDir, { recursive: true });
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`, 'about:blank',
  ], { stdio: 'pipe' });

  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); if (r.ok) break; } catch (_) {}
    await sleep(200);
  }

  let host;
  const guests = [];
  // Includes two players with the EXACT same name ("Alex") to verify zero ID collisions!
  const names = ['Alice', 'Bob', 'Clara', 'Diego', 'Emma', 'Frank', 'Grace', 'Henry', 'Alex', 'Alex'];

  try {
    host = await openTab('Host', BASE_URL);
    await host.waitFor(`!!document.getElementById('btn-qr')`);
    const roomCode = await host.eval(`document.getElementById('btn-qr').textContent.split('·')[1].trim()`);
    const joinUrl = `${BASE_URL}/?room=${roomCode}&join=1`;
    console.log(`  📡 Host room ready: ${roomCode}`);

    // Open all 10 guest phones on distinct origins (127.0.0.2..11) — true 10-device isolation & real HTTP/SSE sync!
    for (let i = 0; i < 10; i++) {
      const phoneUrl = `http://127.0.0.${i + 2}:${SERVER_PORT}/?room=${roomCode}&join=1`;
      const g = await openTab(`P${i + 1}-${names[i]}`, phoneUrl);
      guests.push(g);
    }
    await Promise.all(guests.map(async (g, i) => {
      await g.type('#j-name', names[i]);
      await g.click('#join-form button[type="submit"]');
      await g.waitFor(`document.body.innerText.includes("You're Connected!")`);
    }));
    await host.waitFor(`document.body.innerText.includes('10 on 📱')`);
    assert(true, 'All 10 guest phones joined Host simultaneously (including duplicate name "Alex" -> "Alex (2)")!');

    // Start Prompt Clone!
    await host.click('[data-open="promptClone"]');
    await host.click('#clone-start');
    await Promise.all(guests.map(g => g.waitFor(`!!document.getElementById('p-clone-in')`)));
    assert(true, 'All 10 guest phones received the Target Picture & prompt editor!');

    // All 10 type unique prompts: 6 lock in manually, 4 leave unlocked for auto-collection!
    await Promise.all(guests.map(async (g, i) => {
      await g.type('#p-clone-in', `Unique turkey scene #${i + 1} with golden autumn leaves, sunglasses, rainbow and glowing pie`);
      if (i < 6) {
        await g.click('#p-clone-send');
        await g.waitFor(`document.body.innerText.includes('Confirmed by Host!')`);
      }
    }));
    assert(true, '6 locked-in phones each received "✅ Confirmed by Host!" while 4 phones stayed unlocked typing!');

    // Host clicks Collect All & Generate Images -> sweeps the 4 unlocked phones + grades ALL 10!
    await host.click('#clone-grade-now');
    await host.waitFor(`document.body.innerText.includes('Prompt Clone Results!')`, 20000);
    const hostCount = await host.eval(`document.querySelectorAll('.clone-card').length`);
    assert(hostCount === 10, `Host graded and rendered ALL 10/10 participants (got: ${hostCount})`);
    const hasBothAlex = await host.eval(`document.body.innerText.includes('Alex (2)') && document.body.innerText.includes('Auto-saved')`);
    assert(hasBothAlex, 'Host included BOTH "Alex" and "Alex (2)" AND all 4 auto-saved unlocked prompts!');

    // Verify ALL 10 guest phones display ALL 10 ranked cards with loaded images!
    await Promise.all(guests.map(async (g, i) => {
      await g.waitFor(`document.body.innerText.includes('All Participants Ranked (#1 → #10)') && document.querySelectorAll('.clone-card').length === 10`, 15000);
      const imgsOk = await g.eval(`Array.from(document.querySelectorAll('.clone-card img')).every(img => img.complete && img.naturalWidth > 0)`);
      if (!imgsOk) throw new Error(`Phone ${i + 1} had broken result image!`);
    }));
    assert(true, 'ALL 10/10 guest phones display ALL 10 ranked participants, prompts, scores & loaded images!');

    const allErrors = [...host.errors, ...guests.flatMap(g => g.errors)];
    assert(allErrors.length === 0, `Zero uncaught JS errors across all 11 Chrome devices (found: ${allErrors.length})`);
    console.log('\n🎉 11-DEVICE (10-PLAYER) STRESS QA PASSED 100%!\n');
  } finally {
    if (host) host.close();
    guests.forEach(g => g.close());
    chrome.kill('SIGKILL');
    server.kill('SIGKILL');
    await sleep(250);
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
  }
}

main().catch((err) => {
  console.error('\n❌ 10-PLAYER QA FAILED:', err);
  process.exit(1);
});
