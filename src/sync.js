// 3-Tier Multi-Device QR Room Sync (LAN Server -> Cloud Relay -> Local BroadcastChannel)
// + Optional Live AI Engine (Gemini / OpenAI + Live Image Generation)

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
  let listeners = [];
  let seenIds = new Set();
  const clientId = 'c_' + Math.random().toString(36).slice(2, 9);

  function emit(msg) {
    if (!msg || !msg.id) return;
    if (seenIds.has(msg.id)) return;
    seenIds.add(msg.id);
    if (seenIds.size > 400) {
      const first = seenIds.values().next().value;
      seenIds.delete(first);
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

      // If hosted on a public HTTPS/HTTP origin (e.g., GitHub Pages), use ntfy.sh SSE relay
      if (proto === 'https:' && !window.location.hostname.includes('localhost')) {
        mode = 'cloud';
        return mode;
      }
      // Allow cloud relay on http non-file hosts if reachable
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

  function connect(code) {
    disconnect();
    roomCode = (code || genCode(4)).toUpperCase();

    // Always attach BroadcastChannel for instant same-browser multi-tab sync
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
        es = new EventSource(`https://ntfy.sh/${topic}/sse`);
        es.onmessage = (ev) => {
          try {
            const outer = JSON.parse(ev.data);
            if (outer && outer.message) {
              emit(JSON.parse(outer.message));
            }
          } catch (_) {}
        };
        es.onerror = () => {
          // Silently keep local BroadcastChannel working if blocked by CSP/offline
        };
      } catch (_) {}
    }

    return roomCode;
  }

  function disconnect() {
    if (es) { try { es.close(); } catch (_) {} es = null; }
    if (bc) { try { bc.close(); } catch (_) {} bc = null; }
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
      try {
        const topic = topicName(roomCode);
        await fetch(`https://ntfy.sh/${topic}`, {
          method: 'POST',
          body: JSON.stringify(msg),
        });
      } catch (_) {}
    }
    return msg;
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
    send,
    onMessage,
    getJoinUrl,
    getMode: () => mode,
    getRoomCode: () => roomCode,
    getClientId: () => clientId,
    setLanBaseUrl: (u) => { lanBaseUrl = u; },
  };
})();

// Optional Live AI Client (Works 100% offline without keys; upgrades seamlessly if user adds a key)
const LiveAI = (() => {
  const STORAGE_KEY = 'tg26_ai_settings';

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return {
      provider: 'builtin', // 'builtin' | 'gemini' | 'openai'
      apiKey: '',
      liveImages: false,   // Use Pollinations.ai free live AI images when online
    };
  }

  function saveSettings(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (_) {}
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
    const clean = encodeURIComponent(`${prompt}, vibrant storybook illustration, clear composition`);
    return `https://image.pollinations.ai/prompt/${clean}?width=512&height=360&seed=${seed}&nologo=true`;
  }

  return { loadSettings, saveSettings, askJSON, getLiveImageUrl };
})();

if (typeof module !== 'undefined') module.exports = { RoomSync, LiveAI };
