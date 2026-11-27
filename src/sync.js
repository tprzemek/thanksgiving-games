// 3-Tier Multi-Device QR Room Sync (LAN Server -> Unlimited Real-Time WSS MQTT Cloud Relay -> Local BroadcastChannel)
// + Real AI Image Generation & Vision/LLM Bridge (Gemini Nano Banana / OpenAI DALL-E 3 / Pollinations / Built-In)

const RoomSync = (() => {
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function genCode(len = 4) {
    let s = '';
    for (let i = 0; i < len; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
    return s;
  }

  // Pure-JS MQTT 3.1.1 binary packet helpers (zero external dependencies, works natively over browser WSS!)
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  function mqttRemLen(len) {
    const out = [];
    do {
      let d = len % 128;
      len = Math.floor(len / 128);
      if (len > 0) d |= 128;
      out.push(d);
    } while (len > 0);
    return out;
  }
  function mqttStr(s) {
    const b = enc.encode(s);
    const out = new Uint8Array(2 + b.length);
    out[0] = (b.length >> 8) & 0xff;
    out[1] = b.length & 0xff;
    out.set(b, 2);
    return out;
  }
  function concatU8(parts) {
    let total = 0;
    for (const p of parts) total += p.length;
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) { out.set(p, off); off += p.length; }
    return out;
  }
  function mqttConnectPkt(cid) {
    const vh = concatU8([mqttStr('MQTT'), new Uint8Array([4, 0x02, 0, 45])]);
    const pl = mqttStr(cid);
    const rem = new Uint8Array(mqttRemLen(vh.length + pl.length));
    return concatU8([new Uint8Array([0x10]), rem, vh, pl]);
  }
  function mqttSubPkt(pktId, topic) {
    const vh = new Uint8Array([(pktId >> 8) & 0xff, pktId & 0xff]);
    const pl = concatU8([mqttStr(topic), new Uint8Array([0])]);
    const rem = new Uint8Array(mqttRemLen(vh.length + pl.length));
    return concatU8([new Uint8Array([0x82]), rem, vh, pl]);
  }
  function mqttUnsubPkt(pktId, topic) {
    const vh = new Uint8Array([(pktId >> 8) & 0xff, pktId & 0xff]);
    const pl = mqttStr(topic);
    const rem = new Uint8Array(mqttRemLen(vh.length + pl.length));
    return concatU8([new Uint8Array([0xA2]), rem, vh, pl]);
  }
  function mqttPubPkt(topic, payloadStr, retain = false) {
    const tb = mqttStr(topic);
    const pb = payloadStr ? enc.encode(payloadStr) : new Uint8Array(0);
    const rem = new Uint8Array(mqttRemLen(tb.length + pb.length));
    return concatU8([new Uint8Array([retain ? 0x31 : 0x30]), rem, tb, pb]);
  }

  const MQTT_BROKERS = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://test.mosquitto.org:8081/mqtt',
    'wss://broker.hivemq.com:8884/mqtt',
  ];

  let mode = 'local'; // 'lan' | 'cloud' | 'local'
  let roomCode = '';
  let lanBaseUrl = '';
  let es = null;
  let bc = null;
  let ws = null;
  let mqttReady = false;
  let brokerIdx = 0;
  let consecutiveFails = 0;
  let pktCounter = 1;
  let pingTimer = null;
  let reconnectTimer = null;
  let wakeHandler = null;
  let shouldRun = false;
  let outbox = []; // { subTopic, bodyStr, retain }
  let flushRunning = false;
  let listeners = [];
  let statusListeners = [];
  let seenIds = new Set();
  const chunkBuffers = new Map();
  const clientId = 'tg_' + Math.random().toString(36).slice(2, 10);

  function notifyStatus() {
    const ok = mode === 'lan' || mode === 'local' || mqttReady;
    statusListeners.forEach(fn => { try { fn(ok, mode); } catch (_) {} });
  }

  function emit(msg) {
    if (!msg || !msg.id) return;
    if (seenIds.has(msg.id)) return;
    seenIds.add(msg.id);
    if (seenIds.size > 2000) {
      const first = seenIds.values().next().value;
      seenIds.delete(first);
    }

    if (msg.type === 'IMG_CHUNK' && msg.imgKey && typeof msg.idx === 'number' && msg.total) {
      let buf = chunkBuffers.get(msg.imgKey);
      if (!buf || buf.total !== msg.total) {
        buf = { total: msg.total, parts: new Array(msg.total).fill(null), got: 0 };
        chunkBuffers.set(msg.imgKey, buf);
      }
      if (buf.parts[msg.idx] === null) {
        buf.parts[msg.idx] = msg.data;
        buf.got++;
      }
      if (buf.got === buf.total) {
        const dataUrl = buf.parts.join('');
        chunkBuffers.delete(msg.imgKey);
        const readyMsg = { id: 'img_' + msg.imgKey + '_' + Date.now(), type: 'IMG_READY', imgKey: msg.imgKey, dataUrl };
        listeners.forEach(fn => { try { fn(readyMsg); } catch (e) { console.error(e); } });
      }
      return;
    }

    listeners.forEach(fn => {
      try { fn(msg); } catch (e) { console.error(e); }
    });
  }

  async function detectTransport() {
    if (typeof window === 'undefined') return 'local';
    const proto = window.location.protocol;
    if (proto === 'http:' || proto === 'https:') {
      try {
        const res = await fetch('/api/info', { cache: 'no-store' });
        if (res.ok) {
          const info = await res.json();
          if (info && info.lanUrl) {
            lanBaseUrl = info.lanUrl;
            mode = 'lan';
            return mode;
          }
        }
      } catch (_) {}

      if (proto === 'https:' || proto === 'http:') {
        mode = 'cloud';
        return mode;
      }
    }
    mode = 'local';
    return mode;
  }

  function roomPrefix() {
    return 'tgfeast26/' + (roomCode || 'DEMO').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  async function flushOutbox() {
    if (flushRunning || !mqttReady || !ws || ws.readyState !== 1) return;
    flushRunning = true;
    try {
      while (outbox.length > 0 && mqttReady && ws && ws.readyState === 1) {
        const item = outbox.shift();
        try {
          ws.send(mqttPubPkt(roomPrefix() + '/' + item.subTopic, item.bodyStr, item.retain));
        } catch (_) {
          outbox.unshift(item);
          break;
        }
        // Gently pace large image packets (~35KB) so 10 concurrent images stream smoothly to all 10+ phones!
        if (item.bodyStr.length > 8000) {
          await new Promise(r => setTimeout(r, 120));
        }
      }
    } finally {
      flushRunning = false;
    }
  }

  function openMqttSocket() {
    if (!shouldRun || mode !== 'cloud' || !roomCode) return;
    if (ws) { try { ws.close(); } catch (_) {} ws = null; }
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    mqttReady = false;
    notifyStatus();

    const url = MQTT_BROKERS[brokerIdx % MQTT_BROKERS.length];
    let sock;
    try {
      sock = new WebSocket(url, 'mqtt');
      sock.binaryType = 'arraybuffer';
    } catch (_) {
      scheduleReconnect();
      return;
    }
    ws = sock;
    let buf = new Uint8Array(0);

    const connectGuard = setTimeout(() => {
      if (!mqttReady && ws === sock) {
        consecutiveFails++;
        // Only rotate broker if primary fails 4+ times in a row (prevents 1 phone splitting onto a different broker!)
        if (consecutiveFails >= 4) {
          brokerIdx = (brokerIdx + 1) % MQTT_BROKERS.length;
          consecutiveFails = 0;
        }
        try { sock.close(); } catch (_) {}
      }
    }, 6000);

    sock.onopen = () => {
      if (ws !== sock) return;
      try {
        sock.send(mqttConnectPkt(clientId + '_' + Math.random().toString(36).slice(2, 6)));
      } catch (_) {}
    };

    sock.onmessage = (ev) => {
      if (ws !== sock) return;
      const chunk = new Uint8Array(ev.data);
      const merged = new Uint8Array(buf.length + chunk.length);
      merged.set(buf);
      merged.set(chunk, buf.length);
      buf = merged;

      while (buf.length >= 2) {
        let pos = 1, mult = 1, len = 0, b = 0, complete = false;
        while (pos < buf.length) {
          b = buf[pos++];
          len += (b & 127) * mult;
          mult *= 128;
          if (!(b & 128)) { complete = true; break; }
          if (pos > 5) { buf = new Uint8Array(0); return; }
        }
        if (!complete || buf.length < pos + len) break;
        const type = buf[0] >> 4;
        const body = buf.subarray(pos, pos + len);
        buf = buf.subarray(pos + len);

        if (type === 2) { // CONNACK
          clearTimeout(connectGuard);
          consecutiveFails = 0;
          mqttReady = true;
          notifyStatus();
          try {
            sock.send(mqttSubPkt(++pktCounter, roomPrefix() + '/#'));
          } catch (_) {}
          if (pingTimer) clearInterval(pingTimer);
          pingTimer = setInterval(() => {
            if (ws === sock && sock.readyState === 1) {
              try { sock.send(new Uint8Array([0xC0, 0x00])); } catch (_) {}
            }
          }, 24000);
          flushOutbox();
        } else if (type === 3) { // PUBLISH
          if (body.length < 2) continue;
          const tlen = (body[0] << 8) | body[1];
          if (2 + tlen > body.length) continue;
          const payloadStr = dec.decode(body.subarray(2 + tlen));
          if (!payloadStr) continue;
          try {
            const parsed = JSON.parse(payloadStr);
            emit(parsed);
          } catch (_) {}
        }
      }
    };

    sock.onclose = () => {
      clearTimeout(connectGuard);
      if (ws !== sock) return;
      ws = null;
      mqttReady = false;
      notifyStatus();
      if (shouldRun) scheduleReconnect(1200);
    };

    sock.onerror = () => {};
  }

  function scheduleReconnect(delayMs = 1200) {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (shouldRun && mode === 'cloud' && (!ws || ws.readyState > 1)) {
        openMqttSocket();
      }
    }, delayMs);
  }

  // Re-subscribe (or reconnect) to immediately pull all retained state, submissions, drafts, results & AI images!
  async function pollNow() {
    if (mode !== 'cloud' || !roomCode) return;
    if (ws && ws.readyState === 1 && mqttReady) {
      try {
        const sub = roomPrefix() + '/#';
        ws.send(mqttUnsubPkt(++pktCounter, sub));
        setTimeout(() => {
          if (ws && ws.readyState === 1 && mqttReady) {
            try { ws.send(mqttSubPkt(++pktCounter, sub)); } catch (_) {}
          }
        }, 120);
      } catch (_) {}
    } else {
      openMqttSocket();
    }
  }

  function connect(code) {
    disconnect();
    roomCode = (code || genCode(4)).toUpperCase();
    shouldRun = true;
    brokerIdx = 0;
    consecutiveFails = 0;

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        bc = new BroadcastChannel('tg_room_' + roomCode);
        bc.onmessage = (ev) => emit(ev.data);
      } catch (_) {}
    }

    if (mode === 'lan') {
      try {
        es = new EventSource(`/api/room/${encodeURIComponent(roomCode)}/events`);
        es.onmessage = (ev) => {
          try { emit(JSON.parse(ev.data)); } catch (_) {}
        };
      } catch (_) {}
      notifyStatus();
    } else if (mode === 'cloud') {
      openMqttSocket();
      if (typeof document !== 'undefined') {
        wakeHandler = () => {
          if (!document.hidden && shouldRun) {
            if (!ws || ws.readyState !== 1 || !mqttReady) openMqttSocket();
            else pollNow();
          }
        };
        document.addEventListener('visibilitychange', wakeHandler);
        window.addEventListener('focus', wakeHandler);
        window.addEventListener('online', wakeHandler);
      }
    }

    return roomCode;
  }

  function disconnect() {
    shouldRun = false;
    mqttReady = false;
    outbox = [];
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    if (ws) { try { ws.close(); } catch (_) {} ws = null; }
    if (es) { try { es.close(); } catch (_) {} es = null; }
    if (bc) { try { bc.close(); } catch (_) {} bc = null; }
    if (wakeHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', wakeHandler);
      window.removeEventListener('focus', wakeHandler);
      window.removeEventListener('online', wakeHandler);
      wakeHandler = null;
    }
  }

  function mqttSubTopicFor(msg) {
    if (msg.type === 'HOST_STATE') return { subTopic: 'state', retain: true };
    if (msg.type === 'CLONE_RESULTS_FULL') return { subTopic: 'results', retain: true };
    if (msg.type === 'IMG_READY' && msg.imgKey) return { subTopic: 'img/' + String(msg.imgKey).replace(/[^a-zA-Z0-9_-]/g, ''), retain: true };
    // Retain every participant's prompt submission & draft on their own topic so Host NEVER misses anyone!
    if (msg.type === 'ACTION' && msg.action === 'SUBMIT_CLONE_PROMPT' && msg.playerId && msg.roundId) {
      const pid = String(msg.playerId).replace(/[^a-zA-Z0-9_-]/g, '');
      const rid = String(msg.roundId).replace(/[^a-zA-Z0-9_-]/g, '');
      return { subTopic: `sub/${rid}/${pid}`, retain: true };
    }
    if (msg.type === 'ACTION' && msg.action === 'CLONE_DRAFT' && msg.playerId && msg.roundId) {
      const pid = String(msg.playerId).replace(/[^a-zA-Z0-9_-]/g, '');
      const rid = String(msg.roundId).replace(/[^a-zA-Z0-9_-]/g, '');
      return { subTopic: `draft/${rid}/${pid}`, retain: true };
    }
    return { subTopic: 'events', retain: false };
  }

  function clearRetained(subTopic) {
    if (mode !== 'cloud' || !roomCode) return;
    outbox.push({ subTopic, bodyStr: '', retain: true });
    flushOutbox();
  }

  async function send(payload) {
    const msg = {
      ...payload,
      id: clientId + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      sender: clientId,
      ts: Date.now(),
    };
    seenIds.add(msg.id);

    if (bc) {
      try { bc.postMessage(msg); } catch (_) {}
    }

    let ok = true;
    if (mode === 'lan' && roomCode) {
      try {
        const res = await fetch(`/api/room/${encodeURIComponent(roomCode)}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(msg),
        });
        ok = res.ok;
      } catch (_) { ok = false; }
    } else if (mode === 'cloud' && roomCode) {
      const { subTopic, retain } = mqttSubTopicFor(msg);
      const bodyStr = JSON.stringify(msg);
      // Replace any older queued HOST_STATE in outbox so only the newest state flushes!
      if (subTopic === 'state') {
        outbox = outbox.filter(x => x.subTopic !== 'state');
      }
      outbox.push({ subTopic, bodyStr, retain });
      flushOutbox();
      ok = mqttReady;
    }
    return { ...msg, ok };
  }

  function dataUrlToBlob(dataUrl) {
    const parts = String(dataUrl).split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const bstr = atob(parts[1] || '');
    const u8 = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
    return new Blob([u8], { type: mime });
  }

  // LAN mode: upload to local Node server; Cloud mode: return null so sendImage() streams over unlimited WSS MQTT!
  async function uploadImage(dataUrl) {
    if (!dataUrl || !roomCode) return null;
    if (mode === 'lan') {
      try {
        const blob = dataUrlToBlob(dataUrl);
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': blob.type },
          body: blob,
        });
        if (res.ok) {
          const j = await res.json();
          if (j && j.url) return j.url;
        }
      } catch (_) {}
    }
    return null;
  }

  async function uploadJSON(obj) {
    if (!obj || !roomCode) return null;
    if (mode === 'lan') {
      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(obj),
        });
        if (res.ok) {
          const j = await res.json();
          if (j && j.url) return j.url;
        }
      } catch (_) {}
    }
    return null;
  }

  // Send a full crisp image directly over WSS MQTT (retained!) or chunked fallback on local BroadcastChannel
  async function sendImage(imgKey, dataUrl) {
    if (!imgKey || !dataUrl) return;
    if (mode === 'cloud' || mode === 'lan') {
      await send({ type: 'IMG_READY', imgKey, dataUrl });
      return;
    }
    const CHUNK_SIZE = 2200;
    const total = Math.ceil(dataUrl.length / CHUNK_SIZE);
    for (let i = 0; i < total; i++) {
      await send({
        type: 'IMG_CHUNK',
        imgKey,
        idx: i,
        total,
        data: dataUrl.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
      });
    }
  }

  function onMessage(fn) {
    listeners.push(fn);
    return () => { listeners = listeners.filter(x => x !== fn); };
  }

  function onStatus(fn) {
    statusListeners.push(fn);
    return () => { statusListeners = statusListeners.filter(x => x !== fn); };
  }

  function getJoinUrl(customBase) {
    if (customBase && customBase.trim()) {
      const clean = customBase.trim().replace(/\/+$/, '');
      return `${clean}/?room=${roomCode}&join=1`;
    }
    if (lanBaseUrl) {
      return `${lanBaseUrl}/?room=${roomCode}&join=1`;
    }
    if (typeof window !== 'undefined' && /^https?:/.test(window.location.protocol)) {
      const u = new URL(window.location.href);
      u.search = `?room=${roomCode}&join=1`;
      u.hash = '';
      return u.toString();
    }
    return `https://thanksgiving-game-night.local/?room=${roomCode}&join=1`;
  }

  return {
    genCode,
    detectTransport,
    connect,
    disconnect,
    pollNow,
    send,
    clearRetained,
    uploadImage,
    uploadJSON,
    sendImage,
    onMessage,
    onStatus,
    isConnected: () => mode === 'lan' || mode === 'local' || mqttReady,
    getJoinUrl,
    getMode: () => mode,
    getRoomCode: () => roomCode,
    getClientId: () => clientId,
    setLanBaseUrl: (u) => { lanBaseUrl = u; },
  };
})();

// Optional Real AI Engine (Google Nano Banana / OpenAI DALL-E 3 / Pollinations + Built-In Fallback)
const LiveAI = (() => {
  const STORAGE_KEY = 'tg26_ai_settings';

  const BANANA_MODELS = [
    { id: 'auto', label: '🍌 Auto (Best Available Nano Banana)' },
    { id: 'gemini-nano-banana-2.1', label: '🍌 Nano Banana 2.1 (Latest Flagship)' },
    { id: 'gemini-3.1-flash-lite-image', label: '⚡ Nano Banana 2 Lite (Fastest & Cheapest)' },
    { id: 'gemini-3.1-flash-image', label: '🍌 Nano Banana 2 (Gemini 3.1 Flash Image)' },
    { id: 'gemini-2.5-flash-image', label: '🍌 Nano Banana 1 (Gemini 2.5 Flash Image)' },
    { id: 'gemini-3-pro-image', label: '👑 Nano Banana Pro (Highest Quality)' },
  ];

  const BANANA_AUTO_ORDER = [
    'gemini-3.1-flash-image',
    'gemini-nano-banana-2.1',
    'gemini-3.1-flash-lite-image',
    'gemini-2.5-flash-image',
    'gemini-3-pro-image',
  ];

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          provider: parsed.provider || 'builtin',
          apiKey: parsed.apiKey || '',
          bananaModel: parsed.bananaModel || 'auto',
          pollinationsKey: parsed.pollinationsKey || '',
          liveImages: parsed.liveImages !== undefined ? !!parsed.liveImages : false,
        };
      }
    } catch (_) {}
    return {
      provider: 'builtin', // 'builtin' | 'gemini' | 'openai'
      apiKey: '',
      bananaModel: 'auto',
      pollinationsKey: '',
      liveImages: false,
    };
  }

  function saveSettings(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (_) {}
  }

  function hasRealImageAI() {
    const cfg = loadSettings();
    return !!(
      (cfg.provider === 'gemini' && cfg.apiKey) ||
      (cfg.provider === 'openai' && cfg.apiKey) ||
      cfg.pollinationsKey ||
      cfg.liveImages
    );
  }

  function getActiveImageLabel() {
    const cfg = loadSettings();
    if (cfg.provider === 'gemini' && cfg.apiKey) return 'Google Nano Banana';
    if (cfg.provider === 'openai' && cfg.apiKey) return 'OpenAI DALL-E 3';
    if (cfg.pollinationsKey) return 'Pollinations AI';
    if (cfg.liveImages) return 'Pollinations (Free)';
    return 'Built-In Instant Artist';
  }

  async function askJSON(systemPrompt, userPrompt) {
    const cfg = loadSettings();
    if (!cfg.apiKey || cfg.provider === 'builtin') return null;
    try {
      if (cfg.provider === 'gemini') {
        for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash']) {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}\n\nRespond with valid JSON only.` }] }],
                generationConfig: { responseMimeType: 'application/json', temperature: 0.85 },
              }),
            }
          );
          if (!res.ok) continue;
          const data = await res.json();
          const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (txt) return JSON.parse(txt);
        }
        return null;
      }
      if (cfg.provider === 'openai') {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.85,
          }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const txt = data?.choices?.[0]?.message?.content;
        return txt ? JSON.parse(txt) : null;
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  // Strict 5-axis Vision resemblance judge (Subject 30 + Setting 20 + Props 20 + Style 15 + Layout/Color 15 = 100)
  // Eliminates LLM 70%-clustering by summing 5 independent visual rubric axes!
  async function gradeImagesWithVision(targetDataUrl, playerDataUrl, refPrompt, playerPrompt, playerName) {
    const cfg = loadSettings();
    if (!cfg.apiKey || cfg.provider !== 'gemini' || !targetDataUrl || !playerDataUrl) return null;
    const splitB64 = (du) => {
      const m = String(du).match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
      return m ? { mimeType: m[1], data: m[2] } : null;
    };
    const imgA = splitB64(targetDataUrl);
    const imgB = splitB64(playerDataUrl);
    if (!imgA || !imgB) return null;
    try {
      for (const model of ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']) {
        for (let retry = 0; retry < 2; retry++) {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { text: `You are a strict, fair, witty visual art judge for a competitive Prompt Clone game.
Image 1 is the ORIGINAL target artwork. Image 2 was AI-generated from ${playerName}'s prompt: "${playerPrompt}".
Grade Image 2 against Image 1 strictly across these 5 visual axes (use exact discriminating integers — NEVER default to 70 or cluster scores around 70/75!):
- subject (0-30): exact species/character, pose, expression, count (wrong main subject = 0-8)
- setting (0-20): exact environment, background, time of day, weather
- props (0-20): clothing, hats, held items, secondary characters/objects (deduct heavily for missing or invented props)
- style (0-15): exact art medium & rendering style (e.g. claymation vs photo vs watercolor vs origami vs comic vs stained glass; wrong style = 0-5)
- composition (0-15): color palette, lighting, camera angle, framing
Return ONLY valid JSON: {"subject": int, "setting": int, "props": int, "style": int, "composition": int, "comment": "1 sharp, specific sentence explaining what matched closely and what differed"}.` },
                    { inlineData: imgA },
                    { inlineData: imgB },
                  ],
                }],
                generationConfig: { responseMimeType: 'application/json', temperature: 0.35 },
              }),
            }
          );
          if (!res.ok) {
            if ((res.status === 429 || res.status === 503) && retry === 0) {
              await new Promise(r => setTimeout(r, 1500 + Math.floor(Math.random() * 600)));
              continue;
            }
            break;
          }
          const data = await res.json();
          const rawTxt = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const txt = rawTxt.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
          if (txt) {
            const j = JSON.parse(txt);
            const clamp = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
            if (typeof j.subject === 'number' || typeof j.setting === 'number') {
              const sub = clamp(j.subject, 30);
              const set = clamp(j.setting, 20);
              const prp = clamp(j.props, 20);
              const sty = clamp(j.style, 15);
              const cmp = clamp(j.composition, 15);
              const total = Math.max(5, Math.min(99, sub + set + prp + sty + cmp));
              const breakdown = [
                { label: `Subject ${sub}/30`, hit: sub >= 23, partial: sub >= 14 && sub < 23 },
                { label: `Setting ${set}/20`, hit: set >= 15, partial: set >= 9 && set < 15 },
                { label: `Props ${prp}/20`, hit: prp >= 15, partial: prp >= 9 && prp < 15 },
                { label: `Style ${sty}/15`, hit: sty >= 11, partial: sty >= 6 && sty < 11 },
                { label: `Palette ${cmp}/15`, hit: cmp >= 11, partial: cmp >= 6 && cmp < 11 },
              ];
              return { score: total, breakdown, comment: j.comment || '' };
            }
            if (typeof j.score === 'number') return j;
          }
          break;
        }
      }
    } catch (_) {}
    return null;
  }

  async function callNanoBanana(apiKey, modelId, prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const payloads = [
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['IMAGE'],
          imageConfig: { aspectRatio: '4:3' },
        },
      },
      {
        contents: [{ parts: [{ text: `Generate an illustration of: ${prompt}` }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      },
    ];

    let lastErr = '';
    for (const body of payloads) {
      for (let retry = 0; retry < 2; retry++) {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const errTxt = await res.text().catch(() => '');
            lastErr = `HTTP ${res.status}: ${errTxt.slice(0, 140)}`;
            if ((res.status === 429 || res.status === 503) && retry === 0) {
              await new Promise(r => setTimeout(r, 1800 + Math.floor(Math.random() * 800)));
              continue;
            }
            // If 400 invalid imageConfig, try simpler payload; otherwise stop trying this model
            if (res.status !== 400) return { ok: false, error: lastErr };
            break;
          }
          const j = await res.json();
          const parts = j?.candidates?.[0]?.content?.parts || [];
          const imgPart = parts.find(p => (p.inlineData && p.inlineData.data) || (p.inline_data && p.inline_data.data));
          if (imgPart) {
            const idata = imgPart.inlineData || imgPart.inline_data;
            const mime = idata.mimeType || idata.mime_type || 'image/png';
            return { ok: true, dataUrl: `data:${mime};base64,${idata.data}`, model: modelId };
          }
          lastErr = 'Model returned no image data';
          break;
        } catch (e) {
          lastErr = e.message || 'Network error';
          if (retry === 0) await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
    return { ok: false, error: lastErr };
  }

  async function testBananaKey(apiKey, chosenModel = 'auto') {
    const models = chosenModel && chosenModel !== 'auto'
      ? [chosenModel, ...BANANA_AUTO_ORDER.filter(m => m !== chosenModel)]
      : BANANA_AUTO_ORDER;
    let lastError = 'No model succeeded';
    for (const m of models) {
      const r = await callNanoBanana(apiKey, m, 'A cheerful cartoon turkey wearing sunglasses holding a tiny pie, vibrant storybook art');
      if (r.ok) return { ok: true, model: r.model, dataUrl: r.dataUrl };
      lastError = `${m}: ${r.error}`;
    }
    return { ok: false, error: lastError };
  }

  function getLiveImageUrl(prompt, seed = 42) {
    const cfg = loadSettings();
    const clean = encodeURIComponent(`${prompt}, vibrant illustration, clear composition`);
    const keyParam = cfg.pollinationsKey ? `&key=${encodeURIComponent(cfg.pollinationsKey)}` : '';
    return `https://image.pollinations.ai/prompt/${clean}?width=512&height=360&seed=${seed}&nologo=true${keyParam}`;
  }

  // Generate a real AI image using Google Nano Banana, OpenAI DALL-E 3, or Pollinations
  async function generateImage(prompt, seed = 42) {
    const cfg = loadSettings();
    const fullPrompt = `${prompt}. High-quality, vibrant, detailed illustration, clear composition, no text.`;

    // 1. Google Nano Banana (Gemini Image Generation)
    if (cfg.provider === 'gemini' && cfg.apiKey) {
      const models = cfg.bananaModel && cfg.bananaModel !== 'auto'
        ? [cfg.bananaModel, ...BANANA_AUTO_ORDER.filter(m => m !== cfg.bananaModel)]
        : BANANA_AUTO_ORDER;
      let lastErr = '';
      for (const m of models) {
        const r = await callNanoBanana(cfg.apiKey, m, fullPrompt);
        if (r.ok) {
          return { url: null, dataUrl: r.dataUrl, source: 'banana', model: r.model, error: null };
        }
        lastErr = r.error;
      }
      return { url: null, dataUrl: null, source: 'builtin', error: `Nano Banana failed (${lastErr})` };
    }

    // 2. OpenAI DALL-E 3
    if (cfg.provider === 'openai' && cfg.apiKey) {
      try {
        const res = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify({
            model: 'dall-e-3',
            prompt: fullPrompt,
            n: 1,
            size: '1024x1024',
            quality: 'standard',
          }),
        });
        if (res.ok) {
          const j = await res.json();
          const url = j?.data?.[0]?.url;
          const b64 = j?.data?.[0]?.b64_json;
          if (url) return { url, dataUrl: null, source: 'openai', error: null };
          if (b64) return { url: null, dataUrl: `data:image/png;base64,${b64}`, source: 'openai', error: null };
        }
      } catch (_) {}
    }

    // 3. Pollinations.ai (verified HTTP 200 image/*)
    if (cfg.pollinationsKey || cfg.liveImages) {
      try {
        const url = getLiveImageUrl(prompt, seed);
        const res = await fetch(url);
        const ct = res.headers.get('content-type') || '';
        if (res.ok && ct.startsWith('image/')) {
          const blob = await res.blob();
          const dataUrl = await new Promise((resolve) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.onerror = () => resolve(null);
            fr.readAsDataURL(blob);
          });
          return { url, dataUrl, source: 'pollinations', error: null };
        }
      } catch (_) {}
    }

    // 4. Built-in Instant AI Artist fallback
    return { url: null, dataUrl: null, source: 'builtin', error: null };
  }

  return {
    BANANA_MODELS,
    loadSettings, saveSettings, hasRealImageAI, getActiveImageLabel,
    askJSON, gradeImagesWithVision, testBananaKey, getLiveImageUrl, generateImage,
  };
})();

if (typeof module !== 'undefined') module.exports = { RoomSync, LiveAI };
