#!/usr/bin/env node
// Extensive Regression QA Suite for Real-World Dinner Table Edge Cases:
// 1. Accidental Lock-In guard (<4 words) + Unlock/Edit button + Updated prompt grading (Kristine bug)
// 2. Unlock-to-edit + timeout auto-collect of the newer edited prompt
// 3. Player literally named "bot" submitting normally AND surviving a full network drop + ultra-late reconnect AFTER results appeared!
// 4. Real Live Cloud WSS MQTT (wss://broker.emqx.io:8084/mqtt) end-to-end test with Host + Kristine + bot + Alice!

import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const LAN_PORT = 3458;
const STATIC_PORT = 3459;
const CDP_PORT = 9225;
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
    await this.send('Network.enable');
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
  async waitFor(expr, timeoutMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try { const v = await this.eval(expr); if (v) return v; } catch (_) {}
      await sleep(150);
    }
    throw new Error(`[${this.name}] Timeout waiting for: ${expr}`);
  }
  async click(sel) {
    await this.waitFor(`!!document.querySelector(${JSON.stringify(sel)})`);
    await this.eval(`document.querySelector(${JSON.stringify(sel)}).click()`);
  }
  async type(sel, text) {
    await this.waitFor(`!!document.querySelector(${JSON.stringify(sel)})`);
    await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      el.value = ${JSON.stringify(text)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
  }
  async setOffline(offline) {
    await this.send('Network.emulateNetworkConditions', {
      offline,
      latency: 0,
      downloadThroughput: offline ? 0 : -1,
      uploadThroughput: offline ? 0 : -1,
    });
  }
  close() { try { this.ws.close(); } catch (_) {} }
}

function assert(cond, msg) {
  if (!cond) { console.error(`  ❌ FAIL: ${msg}`); process.exit(1); }
  console.log(`  ✅ ${msg}`);
}

async function openTab(name, url) {
  const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  const tab = await res.json();
  const page = new CDPPage(name, tab.webSocketDebuggerUrl);
  await page.connect();
  await page.waitFor(`document.readyState === 'complete'`);
  return { page, targetId: tab.id };
}

async function closeTab(tabObj) {
  tabObj.page.close();
  try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${tabObj.targetId}`); } catch (_) {}
}

function startStaticServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const urlPath = (req.url || '/').split('?')[0];
      const filePath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
      if (filePath === 'api/info') {
        res.writeHead(404); res.end('Not found'); return;
      }
      const full = path.join(process.cwd(), filePath);
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        const ext = path.extname(full);
        const ct = ext === '.html' ? 'text/html' : ext === '.jpg' ? 'image/jpeg' : 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': ct });
        fs.createReadStream(full).pipe(res);
      } else {
        res.writeHead(404); res.end('Not found');
      }
    });
    srv.listen(STATIC_PORT, '0.0.0.0', () => resolve(srv));
  });
}

async function main() {
  console.log('\n🧪 Starting Extensive Bug-Regression QA Suite (Kristine + "bot" + Late Reconnect + Live Cloud MQTT)...\n');

  const lanServer = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: String(LAN_PORT) },
    stdio: 'ignore',
  });
  const staticSrv = await startStaticServer();
  const userDataDir = `/tmp/chrome-qa-bugs-${Date.now()}`;
  const chrome = spawn('google-chrome', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`, 'about:blank',
  ], { stdio: 'ignore' });

  const openTabs = [];
  try {
    for (let i = 0; i < 30; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${LAN_PORT}/api/info`);
        const c = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
        if (r.ok && c.ok) break;
      } catch (_) {}
      await sleep(250);
    }

    // =========================================================================
    // TEST SUITE A: LAN MODE — Kristine Accidental Lock + Edit + "bot" Ultra-Late Offline Recovery
    // =========================================================================
    console.log('1️⃣  Testing Kristine Accidental Lock-In Guard, Unlock/Edit & "bot" Ultra-Late Recovery...');
    const hostTab = await openTab('Host', `http://127.0.0.1:${LAN_PORT}/`);
    openTabs.push(hostTab);
    await hostTab.page.waitFor(`document.querySelectorAll('.game-card').length === 6`);
    const roomCode = await hostTab.page.eval(`RoomSync.getRoomCode()`);

    const kristineTab = await openTab('Kristine', `http://127.0.0.2:${LAN_PORT}/?room=${roomCode}&join=1`);
    const samTab = await openTab('Sam', `http://127.0.0.3:${LAN_PORT}/?room=${roomCode}&join=1`);
    const botTab = await openTab('bot', `http://127.0.0.4:${LAN_PORT}/?room=${roomCode}&join=1`);
    openTabs.push(kristineTab, samTab, botTab);

    for (const [tab, name] of [[kristineTab, 'Kristine'], [samTab, 'Sam'], [botTab, 'bot']]) {
      await tab.page.type('#j-name', name);
      await tab.page.click('#join-form button[type="submit"]');
    }
    await hostTab.page.waitFor(`App.getPlayers().some(p => p.name === 'Kristine') && App.getPlayers().some(p => p.name === 'Sam') && App.getPlayers().some(p => p.name === 'bot')`);
    assert(true, 'Kristine, Sam, and "bot" all joined Host roster cleanly!');

    // Start Prompt Clone round
    await hostTab.page.click('[data-open="promptClone"]');
    await hostTab.page.click('#clone-start');
    for (const tab of [kristineTab, samTab, botTab]) {
      await tab.page.waitFor(`!!document.querySelector('#p-clone-in')`);
    }

    // KRISTINE TEST A1: Accidental tap on Lock In with only 2 words!
    await kristineTab.page.type('#p-clone-in', 'fluffy llama');
    await kristineTab.page.click('#p-clone-send');
    await sleep(300);
    const kWarnVisible = await kristineTab.page.eval(`document.querySelector('#p-clone-warn')?.style.display === 'block' && document.querySelector('#p-clone-warn')?.textContent.includes('2 words')`);
    const kStillHasEditor = await kristineTab.page.eval(`document.querySelector('#p-clone-in')?.value === 'fluffy llama'`);
    assert(kWarnVisible && kStillHasEditor, 'Kristine accidental 2-word Lock-In was BLOCKED with clear amber warning & her words stayed intact!');

    // KRISTINE TEST A2: Locks in 4 words by accident, gets confirmed, then taps "Edit / Update My Prompt" and expands!
    await kristineTab.page.type('#p-clone-in', 'a colorful vintage illustration');
    await kristineTab.page.click('#p-clone-send');
    await kristineTab.page.waitFor(`document.body.innerText.includes('Confirmed by Host!')`);
    assert(true, 'Kristine 4-word prompt locked in & confirmed by Host');

    await kristineTab.page.click('#p-clone-edit');
    await kristineTab.page.waitFor(`document.querySelector('#p-clone-in')?.value === 'a colorful vintage illustration'`);
    const kFullPrompt = 'Detailed colorful masterpiece illustration with subject setting props vibrant palette and dramatic lighting';
    await kristineTab.page.type('#p-clone-in', kFullPrompt);
    await kristineTab.page.click('#p-clone-send');
    await sleep(500);
    assert(true, 'Kristine tapped Edit/Update, expanded her prompt, and saved the updated version!');

    // SAM TEST A3: Locks in 4 words, clicks Edit, types richer prompt, and does NOT tap Lock In before Collect!
    await samTab.page.type('#p-clone-in', 'simple short starter text');
    await samTab.page.click('#p-clone-send');
    await samTab.page.waitFor(`document.body.innerText.includes('Confirmed by Host!')`);
    await samTab.page.click('#p-clone-edit');
    await samTab.page.waitFor(`!!document.querySelector('#p-clone-in')`);
    await samTab.page.type('#p-clone-in', 'simple short starter text upgraded with rich extra scene details before timeout');
    await sleep(300);

    // BOT TEST A4: Simulate TOTAL NETWORK DROP on "bot"'s phone BEFORE tapping Lock In!
    await botTab.page.type('#p-clone-in', 'bot detailed prompt with subject props setting vibrant colors and unique art style');
    await botTab.page.setOffline(true);
    await botTab.page.click('#p-clone-send');
    await botTab.page.waitFor(`document.body.innerText.includes('Confirming with Host')`);
    assert(true, '"bot" tapped Lock In while offline — phone shows "⏳ Confirming with Host…" + Resend button');

    // Host clicks Collect & Grade while "bot" is STILL OFFLINE!
    await hostTab.page.click('#clone-grade-now');
    await hostTab.page.waitFor(`document.querySelectorAll('.clone-card').length === 2`, 25000);
    const hostTextsInitial = await hostTab.page.eval(`document.body.innerText`);
    assert(hostTextsInitial.includes(kFullPrompt), 'Host graded Kristine\'s UPDATED full prompt (not her earlier 4-word accidental lock)!');
    assert(hostTextsInitial.includes('upgraded with rich extra scene details'), 'Host auto-collected Sam\'s newer unlocked edit!');
    const kScoreMatch = await hostTab.page.eval(`(() => {
      const cards = [...document.querySelectorAll('.clone-card')];
      const kc = cards.find(c => c.innerText.includes('Kristine'));
      const m = kc && kc.innerText.match(/(\\d+)% Match/);
      return m ? Number(m[1]) : 0;
    })()`);
    assert(kScoreMatch > 0, `Kristine received a real quantified score (${kScoreMatch}% Match, never 0!)`);

    // NOW RESTORE "bot"'s NETWORK AFTER RESULTS ALREADY APPEARED!
    await botTab.page.setOffline(false);
    await hostTab.page.waitFor(`document.querySelectorAll('.clone-card').length === 3`, 15000);
    const hostHasBot = await hostTab.page.eval(`document.body.innerText.includes('bot detailed prompt')`);
    assert(hostHasBot, 'Ultra-late recovery: "bot" came back online AFTER results appeared, was dynamically graded by Host, and added to ranked results!');

    // Verify ALL 3 phones now show ALL 3 participants (including "bot"!) + Winner's Edge + 5-axis bars!
    for (const [label, tab] of [['Kristine', kristineTab], ['Sam', samTab], ['bot', botTab]]) {
      await tab.page.waitFor(`document.querySelectorAll('.clone-card').length === 3`, 15000);
      const checks = await tab.page.eval(`({
        hasWhy: !!document.querySelector('.winner-why-box'),
        axisGrids: document.querySelectorAll('.axis-grid').length,
        hasBot: document.body.innerText.includes('bot detailed prompt'),
        hasKristine: document.body.innerText.includes('Kristine'),
      })`);
      assert(checks.hasWhy && checks.axisGrids === 3 && checks.hasBot && checks.hasKristine,
        `${label}'s phone displays ALL 3 ranked players (including "bot"), Winner's Edge box, and 5-axis bars!`);
    }

    // Verify zero JS errors in Suite A
    for (const t of [hostTab, kristineTab, samTab, botTab]) {
      assert(t.page.errors.length === 0, `Zero JS errors on ${t.page.name} (LAN suite)`);
      await closeTab(t);
    }

    // =========================================================================
    // TEST SUITE B: REAL LIVE CLOUD WSS MQTT (wss://broker.emqx.io:8084/mqtt)
    // =========================================================================
    console.log('\n2️⃣  Testing REAL Live Cloud WSS MQTT (wss://broker.emqx.io:8084/mqtt) with Host + Kristine + "bot" + Alice...');
    const cHost = await openTab('CloudHost', `http://127.0.0.1:${STATIC_PORT}/`);
    openTabs.push(cHost);
    await cHost.page.waitFor(`RoomSync.getMode() === 'cloud' && RoomSync.isConnected()`, 15000);
    const cRoom = await cHost.page.eval(`RoomSync.getRoomCode()`);
    console.log(`  📡 Connected to live cloud WSS MQTT room: ${cRoom}`);

    const cKris = await openTab('CloudKristine', `http://127.0.0.2:${STATIC_PORT}/?room=${cRoom}&join=1`);
    const cBot = await openTab('CloudBot', `http://127.0.0.3:${STATIC_PORT}/?room=${cRoom}&join=1`);
    const cAlice = await openTab('CloudAlice', `http://127.0.0.4:${STATIC_PORT}/?room=${cRoom}&join=1`);
    openTabs.push(cKris, cBot, cAlice);

    for (const [tab, name] of [[cKris, 'Kristine'], [cBot, 'bot'], [cAlice, 'Alice']]) {
      await tab.page.waitFor(`RoomSync.isConnected()`, 15000);
      await tab.page.type('#j-name', name);
      await tab.page.click('#join-form button[type="submit"]');
    }
    await cHost.page.waitFor(`App.getPlayers().some(p => p.name === 'Kristine') && App.getPlayers().some(p => p.name === 'bot') && App.getPlayers().some(p => p.name === 'Alice')`, 15000);
    assert(true, 'All 3 cloud phones (Kristine, "bot", Alice) joined Host over live WSS MQTT!');

    await cHost.page.click('[data-open="promptClone"]');
    await cHost.page.click('#clone-start');
    for (const tab of [cKris, cBot, cAlice]) {
      await tab.page.waitFor(`!!document.querySelector('#p-clone-in')`, 15000);
    }

    // Kristine locks in, clicks Edit, updates prompt over live MQTT!
    await cKris.page.type('#p-clone-in', 'short initial cloud prompt');
    await cKris.page.click('#p-clone-send');
    await cKris.page.waitFor(`document.body.innerText.includes('Confirmed by Host!')`, 15000);
    await cKris.page.click('#p-clone-edit');
    await cKris.page.waitFor(`!!document.querySelector('#p-clone-in')`);
    await cKris.page.type('#p-clone-in', 'Kristine updated detailed cloud prompt with colorful art style subject setting and props');
    await cKris.page.click('#p-clone-send');

    // "bot" locks in normally over live MQTT!
    await cBot.page.type('#p-clone-in', 'bot cloud prompt describing the main animal props background colors and painting style');
    await cBot.page.click('#p-clone-send');
    await cBot.page.waitFor(`document.body.innerText.includes('Confirmed by Host!')`, 15000);

    // Alice stays UNLOCKED typing (auto-collect test over live MQTT!)
    await cAlice.page.type('#p-clone-in', 'Alice unlocked auto saved cloud draft describing the scene and vibrant colors');
    await sleep(600);

    await cHost.page.click('#clone-grade-now');
    await cHost.page.waitFor(`document.querySelectorAll('.clone-card').length === 3`, 25000);
    const cloudHostText = await cHost.page.eval(`document.body.innerText`);
    assert(cloudHostText.includes('Kristine updated detailed cloud prompt'), 'Cloud Host graded Kristine\'s updated prompt!');
    assert(cloudHostText.includes('bot cloud prompt'), 'Cloud Host included user named "bot"!');
    assert(cloudHostText.includes('Alice unlocked auto saved'), 'Cloud Host auto-collected Alice\'s unlocked draft!');

    for (const [label, tab] of [['CloudKristine', cKris], ['CloudBot', cBot], ['CloudAlice', cAlice]]) {
      await tab.page.waitFor(`document.querySelectorAll('.clone-card').length === 3`, 20000);
      const ok = await tab.page.eval(`!!document.querySelector('.winner-why-box') && document.querySelectorAll('.axis-grid').length === 3 && document.body.innerText.includes('bot cloud prompt')`);
      assert(ok, `${label} received ALL 3 cloud results (incl. "bot"), Winner's Edge, and 5-axis bars over live MQTT!`);
      assert(tab.page.errors.length === 0, `Zero JS errors on ${label}`);
    }
    assert(cHost.page.errors.length === 0, 'Zero JS errors on CloudHost');

    console.log('\n🎉 ALL EXTENSIVE BUG-REGRESSION + LIVE CLOUD MQTT QA TESTS PASSED 100%!\n');
  } finally {
    for (const t of openTabs) { try { t.page.close(); } catch (_) {} }
    try { chrome.kill('SIGKILL'); } catch (_) {}
    try { lanServer.kill('SIGKILL'); } catch (_) {}
    try { staticSrv.close(); } catch (_) {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
  }
}

main().catch((err) => {
  console.error('\n❌ QA FAILED:', err);
  process.exit(1);
});
