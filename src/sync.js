// 3-Tier Multi-Device QR Room Sync (LAN Server -> Cloud Relay -> Local BroadcastChannel)
// + Chunked Image Sync (stays safely under ntfy.sh 4KB message limit)
// + Real AI Image Generation & Vision/LLM Bridge (Gemini / OpenAI / Pollinations / Built-In)

const RoomSync = (() => {
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function genCode(len = 4) {
    let s = '';
    for (let i = 0; i < len; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
    return s;
  }

  let mode = 'local'; // 'lan' | 'cloud' | 'local'
  let roomCode = '';
  let lanBaseUrl = '';
  let es = null;
  let bc = null;
  let pollTimer = null;
  let wakeHandler = null;
  let listeners = [];
  let seenIds = new Set();
  const chunkBuffers = new Map(); // imgKey -> { total, parts: [] }
  const clientId = 'c_' + Math.random().toString(36).slice(2, 9);

  function emit(msg) {
    if (!msg || !msg.id) return;
    if (seenIds.has(msg.id)) return;
    seenIds.add(msg.id);
    if (seenIds.size > 800) {
      const first = seenIds.values().next().value;
      seenIds.delete(first);
    }

    // Automatically reassemble chunked images into IMG_READY events
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

  function topicName(code) {
    return 'tgfeast26_' + (code || 'DEMO').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  async function pollNow() {
    if (mode !== 'cloud' || !roomCode) return;
    try {
      const topic = topicName(roomCode);
      const res = await fetch(`https://ntfy.sh/${topic}/json?poll=1&since=5m`, { cache: 'no-store' });
      if (!res.ok) return;
      const text = await res.text();
      const lines = text.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const outer = JSON.parse(line);
          if (outer && outer.message) {
            emit(JSON.parse(outer.message));
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  function connect(code) {
    disconnect();
    roomCode = (code || genCode(4)).toUpperCase();

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
    } else if (mode === 'cloud') {
      try {
        const topic = topicName(roomCode);
        es = new EventSource(`https://ntfy.sh/${topic}/sse?since=5m`);
        es.onmessage = (ev) => {
          try {
            const outer = JSON.parse(ev.data);
            if (outer && outer.message) {
              emit(JSON.parse(outer.message));
            }
          } catch (_) {}
        };
        es.onerror = () => {};
      } catch (_) {}

      // Gentle safety poll + instant wake poll for mobile Safari/Chrome sleeping tabs
      pollNow();
      pollTimer = setInterval(() => {
        if (typeof document === 'undefined' || !document.hidden) pollNow();
      }, 4000);
      if (typeof document !== 'undefined') {
        wakeHandler = () => { if (!document.hidden) pollNow(); };
        document.addEventListener('visibilitychange', wakeHandler);
        window.addEventListener('focus', wakeHandler);
      }
    }

    return roomCode;
  }

  function disconnect() {
    if (es) { try { es.close(); } catch (_) {} es = null; }
    if (bc) { try { bc.close(); } catch (_) {} bc = null; }
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (wakeHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', wakeHandler);
      window.removeEventListener('focus', wakeHandler);
      wakeHandler = null;
    }
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

    if (mode === 'lan' && roomCode) {
      try {
        await fetch(`/api/room/${encodeURIComponent(roomCode)}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(msg),
        });
      } catch (_) {}
    } else if (mode === 'cloud' && roomCode) {
      const topic = topicName(roomCode);
      const bodyStr = JSON.stringify(msg);
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(`https://ntfy.sh/${topic}`, {
            method: 'POST',
            body: bodyStr,
          });
          if (res.ok) break;
          if (res.status === 429) await new Promise(r => setTimeout(r, 850));
          else break;
        } catch (_) { break; }
      }
    }
    return msg;
  }

  // Safely send a compressed JPEG dataUrl across 4KB-limited relays by chunking
  async function sendImage(imgKey, dataUrl) {
    if (!imgKey || !dataUrl) return;
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
      if (mode === 'cloud' && total > 1) {
        await new Promise(r => setTimeout(r, 220));
      }
    }
  }

  function onMessage(fn) {
    listeners.push(fn);
    return () => { listeners = listeners.filter(x => x !== fn); };
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
    sendImage,
    onMessage,
    getJoinUrl,
    getMode: () => mode,
    getRoomCode: () => roomCode,
    getClientId: () => clientId,
    setLanBaseUrl: (u) => { lanBaseUrl = u; },
  };
})();

// Optional Real AI Engine (Gemini / OpenAI / Pollinations + Built-In Instant Fallback)
const LiveAI = (() => {
  const STORAGE_KEY = 'tg26_ai_settings';

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          provider: parsed.provider || 'builtin',
          apiKey: parsed.apiKey || '',
          pollinationsKey: parsed.pollinationsKey || '',
          liveImages: parsed.liveImages !== undefined ? !!parsed.liveImages : false,
        };
      }
    } catch (_) {}
    return {
      provider: 'builtin', // 'builtin' | 'gemini' | 'openai'
      apiKey: '',
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
      (cfg.provider === 'openai' && cfg.apiKey) ||
      (cfg.provider === 'gemini' && cfg.apiKey) ||
      cfg.pollinationsKey ||
      cfg.liveImages
    );
  }

  function getActiveImageLabel() {
    const cfg = loadSettings();
    if (cfg.provider === 'openai' && cfg.apiKey) return 'OpenAI DALL-E 3';
    if (cfg.provider === 'gemini' && cfg.apiKey) return 'Google Gemini AI Art';
    if (cfg.pollinationsKey) return 'Pollinations AI (Key)';
    if (cfg.liveImages) return 'Pollinations AI (Free)';
    return 'Built-In Instant AI Artist';
  }

  async function askJSON(systemPrompt, userPrompt) {
    const cfg = loadSettings();
    if (!cfg.apiKey || cfg.provider === 'builtin') return null;
    try {
      if (cfg.provider === 'gemini') {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(cfg.apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}\n\nRespond with valid JSON only.` }] }],
              generationConfig: { responseMimeType: 'application/json', temperature: 0.85 },
            }),
          }
        );
        if (!res.ok) return null;
        const data = await res.json();
        const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        return txt ? JSON.parse(txt) : null;
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

  function getLiveImageUrl(prompt, seed = 42) {
    const cfg = loadSettings();
    const clean = encodeURIComponent(`${prompt}, vibrant illustration, clear composition`);
    const keyParam = cfg.pollinationsKey ? `&key=${encodeURIComponent(cfg.pollinationsKey)}` : '';
    return `https://image.pollinations.ai/prompt/${clean}?width=512&height=360&seed=${seed}&nologo=true${keyParam}`;
  }

  // Generate a real AI image using the configured provider, with safe error handling & built-in fallback
  async function generateImage(prompt, seed = 42) {
    const cfg = loadSettings();
    const fullPrompt = `${prompt}. Vibrant, clear, expressive illustration, no text.`;

    // 1. OpenAI DALL-E 3
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
          if (url) return { url, dataUrl: null, source: 'openai' };
          if (b64) return { url: null, dataUrl: `data:image/png;base64,${b64}`, source: 'openai' };
        }
      } catch (_) {}
    }

    // 2. Google Gemini Image Generation
    if (cfg.provider === 'gemini' && cfg.apiKey) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${encodeURIComponent(cfg.apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `Generate an image of: ${fullPrompt}` }] }],
              generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
            }),
          }
        );
        if (res.ok) {
          const j = await res.json();
          const parts = j?.candidates?.[0]?.content?.parts || [];
          const imgPart = parts.find(p => p.inlineData && p.inlineData.data);
          if (imgPart) {
            const mime = imgPart.inlineData.mimeType || 'image/png';
            return { url: null, dataUrl: `data:${mime};base64,${imgPart.inlineData.data}`, source: 'gemini' };
          }
        }
      } catch (_) {}
    }

    // 3. Pollinations.ai (verified HTTP 200 image/* so 402 rate limits never render broken images!)
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
          return { url, dataUrl, source: 'pollinations' };
        }
      } catch (_) {}
    }

    // 4. Always-works instant built-in AI Artist fallback
    return { url: null, dataUrl: null, source: 'builtin' };
  }

  return {
    loadSettings, saveSettings, hasRealImageAI, getActiveImageLabel,
    askJSON, getLiveImageUrl, generateImage,
  };
})();

if (typeof module !== 'undefined') module.exports = { RoomSync, LiveAI };
