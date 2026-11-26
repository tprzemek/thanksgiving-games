#!/usr/bin/env node
// Zero-Dependency Thanksgiving Game Night LAN Party Server
// Run: node server.js   (then open the printed URL or scan the QR code on phones on the same Wi-Fi!)

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.PORT) || 3000;
const INDEX_PATH = path.join(__dirname, 'index.html');

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

// roomCode -> Set<http.ServerResponse>
const rooms = new Map();
// roomCode -> latest HOST_STATE message
const roomLatestState = new Map();

function getClients(code) {
  const k = code.toUpperCase();
  if (!rooms.has(k)) rooms.set(k, new Set());
  return rooms.get(k);
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = u.pathname;

  // API: server info with real LAN Wi-Fi URL for QR codes
  if (p === '/api/info') {
    const ip = getLanIp();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, lanIp: ip, port: PORT, lanUrl: `http://${ip}:${PORT}` }));
    return;
  }

  // API: SSE stream for a room
  const evMatch = p.match(/^\/api\/room\/([A-Za-z0-9_-]+)\/events$/);
  if (evMatch && req.method === 'GET') {
    const code = evMatch[1].toUpperCase();
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(': connected\n\n');
    const clients = getClients(code);
    clients.add(res);

    // Replay latest host state so newly joined phones sync instantly
    const last = roomLatestState.get(code);
    if (last) res.write(`data: ${JSON.stringify(last)}\n\n`);

    const keepalive = setInterval(() => {
      try { res.write(': ping\n\n'); } catch (_) {}
    }, 20000);

    req.on('close', () => {
      clearInterval(keepalive);
      clients.delete(res);
    });
    return;
  }

  // API: broadcast message to a room
  const sendMatch = p.match(/^\/api\/room\/([A-Za-z0-9_-]+)\/send$/);
  if (sendMatch && req.method === 'POST') {
    const code = sendMatch[1].toUpperCase();
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) req.destroy();
    });
    req.on('end', () => {
      try {
        const msg = JSON.parse(body);
        if (msg && msg.type === 'HOST_STATE') roomLatestState.set(code, msg);
        const line = `data: ${JSON.stringify(msg)}\n\n`;
        for (const client of getClients(code)) {
          try { client.write(line); } catch (_) {}
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (_) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end('{"ok":false}');
      }
    });
    return;
  }

  // Serve single-file app
  if (p === '/' || p === '/index.html') {
    fs.readFile(INDEX_PATH, (err, html) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Missing index.html — run node build.mjs first.');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(html);
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  const ip = getLanIp();
  console.log('\n🦃 Thanksgiving AI Game Night Server is LIVE!');
  console.log(`   Host Screen:  http://localhost:${PORT}`);
  console.log(`   Wi-Fi Phones: http://${ip}:${PORT}  (auto-embedded in the in-app QR code!)\n`);
});
