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
  let lastServerTime = 0;
  const chunkBuffers = new Map(); // imgKey -> { total, parts: [] }
  const clientId = 'c_' + Math.random().toString(36).slice(2, 9);

  function emit(msg) {
    if (!msg || !msg.id) return;
    if (seenIds.has(msg.id)) return;
    seenIds.add(msg.id);
    if (seenIds.size > 1500) {
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

  async function pollNow(fullHistory = false) {
    if (mode !== 'cloud' || !roomCode) return;
    try {
      const topic = topicName(roomCode);
      const since = (!fullHistory && lastServerTime > 0) ? String(Math.max(0, lastServerTime - 8)) : '5m';
      const res = await fetch(`https://ntfy.sh/${topic}/json?poll=1&since=${since}`, { cache: 'no-store' });
      if (!res.ok) return;
      const text = await res.text();
      const lines = text.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const outer = JSON.parse(line);
          if (outer && typeof outer.time === 'number' && outer.time > lastServerTime) {
            lastServerTime = outer.time;
          }
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
    lastServerTime = 0;

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
            if (outer && typeof outer.time === 'number' && outer.time > lastServerTime) {
              lastServerTime = outer.time;
            }
            if (outer && outer.message) {
              emit(JSON.parse(outer.message));
            }
          } catch (_) {}
        };
        es.onerror = () => {};
      } catch (_) {}

      // Gentle safety poll + instant wake poll for mobile Safari/Chrome sleeping tabs
      pollNow(true);
      pollTimer = setInterval(() => {
        if (typeof document === 'undefined' || !document.hidden) pollNow(false);
      }, 4500);
      if (typeof document !== 'undefined') {
        wakeHandler = () => { if (!document.hidden) pollNow(true); };
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
      ok = false;
      const topic = topicName(roomCode);
      const bodyStr = JSON.stringify(msg);
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const res = await fetch(`https://ntfy.sh/${topic}`, {
            method: 'POST',
            body: bodyStr,
          });
          if (res.ok) { ok = true; break; }
          if (res.status === 429 || res.status >= 500) {
            await new Promise(r => setTimeout(r, 850 * (attempt + 1) + Math.floor(Math.random() * 450)));
          } else {
            break;
          }
        } catch (_) {
          await new Promise(r => setTimeout(r, 700 * (attempt + 1)));
        }
      }
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

  // Upload a high-res JPEG in ONE single HTTP request and return a direct HTTPS/LAN URL shareable with all 10+ phones!
  async function uploadImage(dataUrl) {
    if (!dataUrl || !roomCode) return null;
    try {
      const blob = dataUrlToBlob(dataUrl);
      if (mode === 'lan') {
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': blob.type },
          body: blob,
        });
        if (res.ok) {
          const j = await res.json();
          if (j && j.url) return j.url;
        }
      } else if (mode === 'cloud') {
        const mediaTopic = topicName(roomCode) + '_media';
        for (let attempt = 0; attempt < 5; attempt++) {
          const res = await fetch(`https://ntfy.sh/${mediaTopic}?filename=art.jpg`, {
            method: 'POST',
            headers: { 'Content-Type': blob.type },
            body: blob,
          });
          if (res.ok) {
            const j = await res.json();
            if (j?.attachment?.url) return j.attachment.url;
            break;
          }
          if (res.status === 429 || res.status >= 500) {
            await new Promise(r => setTimeout(r, 950 * (attempt + 1) + Math.floor(Math.random() * 450)));
          } else {
            break;
          }
        }
      }
    } catch (_) {}
    return null;
  }

  // Upload an atomic JSON payload (e.g., all 10+ ranked Prompt Clone results + Nano Banana image URLs) in ONE request!
  async function uploadJSON(obj, filename = 'results.json') {
    if (!obj || !roomCode) return null;
    try {
      const bodyStr = JSON.stringify(obj);
      if (mode === 'lan') {
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: bodyStr,
        });
        if (res.ok) {
          const j = await res.json();
          if (j && j.url) return j.url;
        }
      } else if (mode === 'cloud') {
        const mediaTopic = topicName(roomCode) + '_media';
        for (let attempt = 0; attempt < 5; attempt++) {
          const res = await fetch(`https://ntfy.sh/${mediaTopic}?filename=${encodeURIComponent(filename)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: bodyStr,
          });
          if (res.ok) {
            const j = await res.json();
            if (j?.attachment?.url) return j.attachment.url;
            break;
          }
          if (res.status === 429 || res.status >= 500) {
            await new Promise(r => setTimeout(r, 950 * (attempt + 1) + Math.floor(Math.random() * 450)));
          } else {
            break;
          }
        }
      }
    } catch (_) {}
    return null;
  }

  // Fallback chunked transfer if direct upload unavailable
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
    uploadImage,
    uploadJSON,
    sendImage,
    onMessage,
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

  // Vision-powered visual resemblance grader comparing Original Target vs Regenerated AI image!
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
      for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash']) {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: `You are the witty AI art judge for a family Thanksgiving Prompt Clone game. Image 1 is the ORIGINAL target image. Image 2 was AI-generated from ${playerName}'s prompt: "${playerPrompt}". Compare Image 2's visual resemblance to Image 1 (subject, setting, props, colors, composition, art style). Return ONLY valid JSON: {"score": integer 0-100, "comment": "1 funny, specific sentence praising what matched or roasting what went hilariously different"}.` },
                  { inlineData: imgA },
                  { inlineData: imgB },
                ],
              }],
              generationConfig: { responseMimeType: 'application/json', temperature: 0.6 },
            }),
          }
        );
        if (!res.ok) continue;
        const data = await res.json();
        const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (txt) return JSON.parse(txt);
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
