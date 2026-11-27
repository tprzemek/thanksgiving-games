// Main Host Hub + Persistent Roster/Leaderboard + QR Room Modal + Dedicated Phone Controller Mode

const App = (() => {
  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const STORAGE_PLAYERS = 'tg26_players_v1';
  const STORAGE_ROOM = 'tg26_room_v1';
  const STORAGE_ADMIN_PIN = 'tg26_admin_pin_v1';
  const DEFAULT_ADMIN_PIN = '2026';

  function getAdminPin() {
    try {
      const saved = localStorage.getItem(STORAGE_ADMIN_PIN);
      if (saved && saved.trim()) return saved.trim();
    } catch (_) {}
    return DEFAULT_ADMIN_PIN;
  }

  function setAdminPin(pin) {
    const clean = String(pin || '').trim();
    if (!clean) return;
    try { localStorage.setItem(STORAGE_ADMIN_PIN, clean); } catch (_) {}
  }

  let players = loadPlayers();
  let currentGameKey = null; // null = Hub
  let currentGame = null;
  let lastHostBroadcast = { game: null, phase: 'hub', payload: {} };
  let customShareBase = '';

  function loadPlayers() {
    try {
      const raw = localStorage.getItem(STORAGE_PLAYERS);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length) return arr;
      }
    } catch (_) {}
    return [
      { id: 'p_1', name: 'Maya', ageGroup: 'kid', avatar: '🦊', score: 0, remote: false },
      { id: 'p_2', name: 'Leo', ageGroup: 'kid', avatar: '🐸', score: 0, remote: false },
      { id: 'p_3', name: 'Mom', ageGroup: 'adult', avatar: '🦉', score: 0, remote: false },
      { id: 'p_4', name: 'Dad', ageGroup: 'adult', avatar: '🐻', score: 0, remote: false },
    ];
  }

  function savePlayers() {
    try { localStorage.setItem(STORAGE_PLAYERS, JSON.stringify(players)); } catch (_) {}
  }

  function getPlayers() { return players; }

  function addPlayer({ id, name, ageGroup = 'adult', avatar, remote = false }) {
    const clean = String(name || '').trim();
    if (!clean) return null;
    const existing = id ? players.find(p => p.id === id) : players.find(p => p.name.toLowerCase() === clean.toLowerCase());
    if (existing) {
      existing.name = clean;
      existing.ageGroup = ageGroup;
      if (avatar) existing.avatar = avatar;
      if (remote) existing.remote = true;
      savePlayers();
      updateTopbar();
      return existing;
    }
    const p = {
      id: id || ('p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5)),
      name: clean,
      ageGroup,
      avatar: avatar || GAME_DATA.avatars[players.length % GAME_DATA.avatars.length],
      score: 0,
      remote,
    };
    players.push(p);
    savePlayers();
    updateTopbar();
    return p;
  }

  function removePlayer(id) {
    if (players.length <= 1) return;
    players = players.filter(p => p.id !== id);
    savePlayers();
    updateTopbar();
  }

  function addScore(playerId, delta) {
    const p = players.find(x => x.id === playerId);
    if (!p) return;
    p.score = Math.max(0, (p.score || 0) + delta);
    savePlayers();
    updateTopbar();
  }

  function resetScores() {
    players.forEach(p => { p.score = 0; });
    savePlayers();
    updateTopbar();
    broadcastHostState(lastHostBroadcast.game, lastHostBroadcast.phase, lastHostBroadcast.payload);
    SoundFX.pop();
  }

  function resetPlayerScore(playerId) {
    const p = players.find(x => x.id === playerId);
    if (!p) return;
    p.score = 0;
    savePlayers();
    updateTopbar();
    broadcastHostState(lastHostBroadcast.game, lastHostBroadcast.phase, lastHostBroadcast.payload);
    SoundFX.pop();
  }

  function getStage() {
    return document.getElementById('stage');
  }

  function broadcastHostState(game, phase, payload = {}) {
    lastHostBroadcast = { game, phase, payload };
    RoomSync.send({
      type: 'HOST_STATE',
      game,
      phase,
      payload,
      leaderboard: players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, score: p.score })),
    });
  }

  function updateTopbar() {
    const leader = [...players].sort((a, b) => b.score - a.score)[0];
    const lbBtn = document.getElementById('btn-leaderboard');
    if (lbBtn && leader) {
      lbBtn.textContent = leader.score > 0 ? `🏆 ${leader.name} (${leader.score})` : `🏆 Scores`;
    }
    const qrBtn = document.getElementById('btn-qr');
    if (qrBtn) {
      const code = RoomSync.getRoomCode();
      qrBtn.textContent = `📱 QR · ${code}`;
    }
  }

  function isMidRound() {
    if (!currentGameKey) return false;
    const p = lastHostBroadcast.phase;
    return ['writing', 'pass_input', 'defend', 'prompt', 'guess', 'live', 'reveal', 'trivia', 'pitch', 'chain'].includes(p);
  }

  function updateGameNav() {
    const bar = document.getElementById('game-nav');
    if (!bar) return;
    if (!currentGameKey) {
      bar.style.display = 'none';
      bar.innerHTML = '';
      return;
    }
    const meta = GAMES_META.find(g => g.key === currentGameKey);
    bar.style.display = 'flex';
    bar.innerHTML = `
      <button class="btn btn-sm" id="btn-back-menu" style="gap:6px;padding:7px 13px;">
        <span style="font-size:1.1rem;line-height:1;">←</span>
        <span>Main Menu</span>
      </button>
      <div class="row" style="gap:6px;">
        <span class="xs muted" style="font-weight:700;">${meta ? `${meta.icon} ${esc(meta.title)}` : ''}</span>
        <button class="btn btn-sm" id="btn-this-rules">📖 Rules</button>
      </div>`;

    document.getElementById('btn-back-menu').onclick = () => {
      SoundFX.pop();
      requestReturnHome();
    };
    document.getElementById('btn-this-rules').onclick = () => {
      SoundFX.pop();
      openGameRulesModal(currentGameKey);
    };
  }

  function openGameRulesModal(key) {
    const g = GAMES_META.find(x => x.key === key);
    if (!g) { openGuideModal(); return; }
    const m = document.getElementById('modal-root');
    m.innerHTML = `
      <div class="modal-backdrop" id="modal-bg">
        <div class="modal stack" style="max-width:480px;">
          <div class="row-between">
            <h2>${g.icon} ${esc(g.title)} Rules</h2>
            <button class="btn btn-sm" id="modal-close">✕</button>
          </div>
          <div class="row">
            <span class="tag tag-gold">👥 ${esc(g.players)}</span>
            <span class="tag">⏱️ ${esc(g.time)}</span>
          </div>
          <div class="xs muted">📱 ${esc(g.devices)}</div>
          <ol class="small" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;">
            ${g.rules.map(r => `<li>${esc(r)}</li>`).join('')}
          </ol>
          <div class="row-between">
            <button class="btn btn-sm" id="rules-all">All Games Guide</button>
            <button class="btn btn-primary" id="rules-ok">Back to Game</button>
          </div>
        </div>
      </div>`;
    document.getElementById('modal-close').onclick = closeModal;
    document.getElementById('rules-ok').onclick = closeModal;
    document.getElementById('modal-bg').onclick = (e) => { if (e.target.id === 'modal-bg') closeModal(); };
    document.getElementById('rules-all').onclick = () => { closeModal(); openGuideModal(); };
  }

  function requestReturnHome(fromPopState = false) {
    if (!currentGameKey) return;
    if (isMidRound()) {
      if (fromPopState) {
        try { window.history.pushState({ view: 'game', key: currentGameKey }, '', `#${currentGameKey}`); } catch (_) {}
      }
      const m = document.getElementById('modal-root');
      m.innerHTML = `
        <div class="modal-backdrop" id="modal-bg">
          <div class="modal stack" style="max-width:410px;">
            <div class="row-between">
              <h2>← Leave Active Round?</h2>
              <button class="btn btn-sm" id="leave-stay-x">✕</button>
            </div>
            <p class="small muted" style="margin:0;">A round is currently in progress. Returning to the Main Menu will end this round, <strong>but all leaderboard scores stay saved!</strong></p>
            <div class="row">
              <button class="btn btn-primary" style="flex:1;" id="leave-stay">Keep Playing</button>
              <button class="btn" style="flex:1;" id="leave-go">← Main Menu</button>
            </div>
          </div>
        </div>`;
      document.getElementById('leave-stay-x').onclick = closeModal;
      document.getElementById('leave-stay').onclick = closeModal;
      document.getElementById('modal-bg').onclick = (e) => { if (e.target.id === 'modal-bg') closeModal(); };
      document.getElementById('leave-go').onclick = () => {
        closeModal();
        openGame(null, { skipPush: true });
      };
      return;
    }
    openGame(null, { skipPush: fromPopState });
  }

  function openGame(key, opts = {}) {
    if (currentGame && currentGame.cleanup) currentGame.cleanup();
    currentGameKey = key;
    if (!key) {
      currentGame = null;
      broadcastHostState(null, 'hub', {});
      updateGameNav();
      if (!opts.skipPush) {
        try { window.history.pushState({ view: 'hub' }, '', window.location.pathname + window.location.search); } catch (_) {}
      }
      renderHub();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const factory = Games[key];
    if (!factory) return;
    if (!opts.skipPush) {
      try { window.history.pushState({ view: 'game', key }, '', `#${key}`); } catch (_) {}
    }
    lastHostBroadcast = { game: key, phase: 'lobby', payload: {} };
    updateGameNav();
    currentGame = factory(publicApi);
    currentGame.render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const GAMES_META = [
    {
      key: 'promptClone',
      icon: '🔍',
      title: 'Prompt Clone!',
      tag: 'NEW · 3-MIN CHALLENGE',
      tagClass: 'tag-new',
      players: '2–12+ players',
      time: '3–5 min/round',
      devices: 'Best with phones (QR) or pass-and-play',
      desc: 'Everyone studies the same AI image and writes a prompt to recreate it. AI regenerates every player\'s image and grades resemblance %!',
      meta: '2–12+ players · 3–5 min · All Ages',
      rules: [
        'Host shows the Target AI Image (or uploads any custom photo) and starts the 1, 2, or 3-minute timer.',
        'Every player scans the QR code on their phone (or passes the Host device) to type an AI prompt describing every detail they see—subject, setting, props, colors, and art style.',
        'When time is up, tap "Generate Images & Grade All": the AI paints each player\'s prompt side-by-side with the original and awards 0–100% resemblance scores + points!',
      ],
    },
    {
      key: 'turkeyCourt',
      icon: '⚖️',
      title: 'Turkey Court',
      tag: 'AI JUDGE + TWISTS',
      tagClass: 'tag-gold',
      players: '2–12 players',
      time: '2–3 min/case',
      devices: '1 Host screen (+ optional phone jury)',
      desc: 'Defend yourself against hilarious Thanksgiving charges while the AI Judge slams live mid-speech OBJECTION plot twists!',
      meta: '2–12 players · 2–3 min · Improv',
      rules: [
        'Pick 2 defendants (or adult-kid teams) to face a funny Thanksgiving charge.',
        'Each side gets 25 seconds to argue out loud—halfway through, the AI Judge slams a surprise OBJECTION plot twist you must react to on the spot!',
        'Other players can vote or drop twists from their QR phones. The AI Judge scores Creativity, Logic, and Quick Recovery.',
      ],
    },
    {
      key: 'promptPanic',
      icon: '🎨',
      title: 'Prompt Panic!',
      tag: 'AI TABOO + BUZZER',
      tagClass: 'tag-kid',
      players: '3–10 players',
      time: '2–3 min/round',
      devices: 'Host screen + QR buzzers (or table buzzers)',
      desc: 'Taboo meets Pictionary! You have 35 seconds to get the AI to draw a secret phrase WITHOUT typing the banned words—then everyone races to buzz in as it unblurs!',
      meta: '3–10 players · 2–3 min · AI Taboo',
      rules: [
        'One player/team peeks at the secret phrase and its red 🚫 Banned Words (like "turkey", "skateboard", "sunset").',
        'You have 35 seconds to make the AI draw the scene WITHOUT typing any banned word—use synonyms, clues, or kid-friendly clue chips (e.g., "gobbler bird on a wooden board with wheels at golden dusk")!',
        'The AI image appears heavily blurred and slowly sharpens—everyone else races to BUZZ IN and guess the secret phrase! Faster guesses win bigger points.',
      ],
    },
    {
      key: 'gobbleBomb',
      icon: '💣',
      title: 'Pass the Gobble Bomb',
      tag: 'ONE-PHONE HOT POTATO',
      tagClass: 'tag-new',
      players: '3–12 players',
      time: '1–2 min/round',
      devices: '1 phone passed around the table',
      desc: 'Pass one phone around the table, shout a story sentence using the twist word, and pass before the hidden turkey fuse blows!',
      meta: '3–12 players · 1–2 min · 1 Phone',
      rules: [
        'Choose Chill, Chaos, or Lightning fuse speed and tap "Light the Turkey Fuse!" (nobody knows the exact timer!).',
        'Whoever holds the phone says the next sentence of the story using the flashing Twist Word (plus any surprise Modifier like Rhyme or Whisper!) and smashes PASS.',
        'When the Gobble Bomb explodes, everyone else scores +100 Survivor Points and the AI builds an illustrated Storybook of what you created!',
      ],
    },
    {
      key: 'spotTheBot',
      icon: '🤖',
      title: 'Spot the Bot',
      tag: 'DINNER TABLE EDITION',
      tagClass: 'tag-gold',
      players: '3–10 players',
      time: '3–4 min/round',
      devices: 'Best with phones (QR) or pass-and-play',
      desc: 'Everyone submits a witty answer and AI sneaks in fake ones. Race to slam "THAT\'S A BOT!"—or score points for fooling the table!',
      meta: '3–10 players · 3–4 min · Bluffing',
      rules: [
        'Read the dinner-table prompt aloud. Every player secretly submits a funny 1-sentence answer via their QR phone or pass-and-play.',
        'The AI mixes 1–2 convincing fake Bot answers into the shuffled pile and reveals them one by one.',
        'Race to slam "THAT\'S A BOT!" if you think it\'s AI! Fast correct catches score big; false alarms give the human author a +150 Fooler Bonus!',
      ],
    },
    {
      key: 'feastShowdown',
      icon: '🏆',
      title: 'Feast Showdown',
      tag: 'AGE-BALANCED QUIZ',
      tagClass: 'tag-kid',
      players: '2–12+ players',
      time: '2–5 min',
      devices: 'Host screen + QR buzzers (or table buzzers)',
      desc: '3 fast mini-modes: Lightning Buzz (auto-scaled Kid/Teen/Adult trivia), Absurd Dish Pitch Battle, and 5-second Rapid-Fire Chain!',
      meta: '2–12+ players · 2–5 min · Fair for Kids',
      rules: [
        'Lightning Buzz: Pick Kid, Teen, or Adult difficulty so everyone competes fairly—first to buzz in gets to answer (+200 pts).',
        'Pitch Battle: AI invents a wild fusion dish (like Pumpkin Pie Sushi)—20 seconds to pitch a commercial jingle, then vote for the funniest!',
        'Rapid-Fire Chain: 5 seconds per player around the table to shout an item in the category without repeating!',
      ],
    },
  ];

  function renderHub() {
    const root = getStage();
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const remoteCount = players.filter(p => p.remote).length;
    root.innerHTML = `
      <div class="stack fade-in">
        <div class="hub-header">
          <div>
            <h1>Thanksgiving AI Game Night</h1>
            <p class="hub-sub">Six interactive table games for <strong>2–12+ players</strong> (kids & adults). Play on one shared device or have everyone join on their own phone by scanning the QR barcode.</p>
          </div>
          <div class="row">
            <button class="btn" id="hub-open-guide">📖 How to Play</button>
            <button class="btn btn-primary" id="hub-open-qr">📱 Scan QR to Join</button>
          </div>
        </div>

        <details class="card-warm" open>
          <summary style="cursor:pointer;font-weight:800;font-size:0.98rem;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <span>📋 Quick Start: How Many Can Play &amp; How to Join (30-Second Setup)</span>
            <span class="xs muted">Tap to hide/show</span>
          </summary>
          <div class="stack-sm" style="margin-top:12px;">
            <div class="grid-3">
              <div class="card" style="padding:12px;">
                <strong class="small">👥 2 to 12+ Players</strong>
                <p class="xs muted" style="margin:4px 0 0;">Built for kids (6+) and adults together. Best with <strong>3–8 players</strong>; for bigger tables (9+), pair <strong>1 Kid + 1 Adult</strong> on the same team!</p>
              </div>
              <div class="card" style="padding:12px;">
                <strong class="small">📺 Step 1: Pick 1 Host Screen</strong>
                <p class="xs muted" style="margin:4px 0 0;">Keep this page open on one phone, iPad, laptop, or TV that everyone can see. Turn up volume for the AI Voice Host &amp; sound effects.</p>
              </div>
              <div class="card" style="padding:12px;">
                <strong class="small">📱 Step 2: Scan QR (or Pass 1 Phone)</strong>
                <p class="xs muted" style="margin:4px 0 0;">Tap <strong>📱 QR</strong> above. Guests point their phone's <strong>Camera app</strong> at the QR barcode, tap the link, and enter their name. No app or login needed!</p>
              </div>
            </div>
            <div class="row-between">
              <span class="xs muted">💡 <strong>No extra phones?</strong> Just add names below and play 100% Pass-and-Play on this single screen.</span>
              <button class="btn btn-sm" id="qs-full-guide">📖 Full Rules &amp; Setup Guide</button>
            </div>
          </div>
        </details>

        <div class="card stack-sm">
          <div class="row-between">
            <h3>👨‍👩‍👧‍👦 Players at the Table (${players.length}${remoteCount ? ` · ${remoteCount} on 📱` : ''})</h3>
            <div class="row">
              ${sorted[0]?.score > 0 ? `<button class="btn btn-sm" id="hub-reset-scores" style="color:var(--cranberry);border-color:var(--cranberry);">🔒 Reset Scores</button>` : `<span class="xs muted">Replace demo names or let guests scan QR to auto-add!</span>`}
            </div>
          </div>
          <div class="roster-bar">
            ${players.map(p => `
              <span class="player-chip">
                <span>${p.avatar}</span>
                <span>${esc(p.name)}</span>
                <span class="xs muted">(${p.ageGroup === 'kid' ? 'Kid' : p.ageGroup === 'teen' ? 'Teen' : 'Adult'})</span>
                ${p.remote ? '<span title="Connected via phone">📱</span>' : ''}
                ${p.score > 0 ? `<span class="pts">${p.score}</span>` : ''}
                ${players.length > 1 ? `<button class="rm" data-rm="${p.id}" title="Remove">×</button>` : ''}
              </span>
            `).join('')}
          </div>
          <form class="row" id="add-player-form" style="margin-top:4px;">
            <input class="input" id="new-p-name" placeholder="Add player name (e.g. Grandma, Sam)..." style="flex:1;min-width:170px;" maxlength="18" />
            <select class="select" id="new-p-age" style="width:auto;min-width:110px;">
              <option value="kid">🧒 Kid</option>
              <option value="teen">🧑 Teen</option>
              <option value="adult" selected>🧑‍🦳 Adult</option>
            </select>
            <button type="submit" class="btn btn-primary">+ Add</button>
          </form>
        </div>

        <div class="game-grid">
          ${GAMES_META.map(g => `
            <button class="game-card" data-open="${g.key}">
              <div class="stack-sm">
                <div class="game-card-top">
                  <div class="game-icon">${g.icon}</div>
                  <span class="tag ${g.tagClass}">${g.tag}</span>
                </div>
                <h3 style="font-family:var(--font-display);font-size:1.25rem;margin-top:4px;">${g.title}</h3>
                <p class="small muted" style="margin:0;">${g.desc}</p>
              </div>
              <div class="row-between" style="margin-top:6px;">
                <span class="xs muted">👥 ${g.meta}</span>
                <strong style="color:var(--pumpkin);font-size:0.9rem;">Play →</strong>
              </div>
            </button>
          `).join('')}
        </div>

        ${sorted[0]?.score > 0 ? `
          <div class="card-warm row-between">
            <div>
              <strong>👑 Current Thanksgiving Leader: ${sorted[0].avatar} ${esc(sorted[0].name)}</strong>
              <span class="muted small"> with ${sorted[0].score} pts</span>
            </div>
            <div class="row">
              <button class="btn btn-sm" id="hub-reset-scores-2">🔒 Reset Scores</button>
              <button class="btn btn-sm" id="hub-view-lb">Full Standings</button>
            </div>
          </div>
        ` : ''}
      </div>`;

    document.getElementById('hub-open-qr').onclick = openQRModal;
    document.getElementById('hub-open-guide').onclick = openGuideModal;
    document.getElementById('qs-full-guide').onclick = openGuideModal;
    const lb = document.getElementById('hub-view-lb');
    if (lb) lb.onclick = openLeaderboardModal;
    const doHubReset = () => {
      requireAdminPin('Reset ALL player scores to 0', () => {
        resetScores();
        renderHub();
      });
    };
    const r1 = document.getElementById('hub-reset-scores');
    if (r1) r1.onclick = doHubReset;
    const r2 = document.getElementById('hub-reset-scores-2');
    if (r2) r2.onclick = doHubReset;

    root.querySelectorAll('[data-rm]').forEach(btn => {
      btn.onclick = () => { removePlayer(btn.dataset.rm); renderHub(); };
    });
    document.getElementById('add-player-form').onsubmit = (e) => {
      e.preventDefault();
      const inp = document.getElementById('new-p-name');
      const age = document.getElementById('new-p-age').value;
      if (!inp.value.trim()) return;
      addPlayer({ name: inp.value.trim(), ageGroup: age });
      SoundFX.pop();
      inp.value = '';
      renderHub();
    };
    root.querySelectorAll('[data-open]').forEach(card => {
      card.onclick = () => { SoundFX.pop(); openGame(card.dataset.open); };
    });
  }

  // ---- Modals (How to Play Guide, QR Code Room, Leaderboard, AI Settings) ----
  function closeModal() {
    const m = document.getElementById('modal-root');
    if (m) m.innerHTML = '';
  }

  function openGuideModal() {
    const m = document.getElementById('modal-root');
    m.innerHTML = `
      <div class="modal-backdrop" id="modal-bg">
        <div class="modal stack" style="max-width:620px;">
          <div class="row-between">
            <h2>📖 How to Play &amp; Setup Guide</h2>
            <button class="btn btn-sm" id="modal-close">✕</button>
          </div>

          <div class="card-warm stack-sm">
            <h3>👥 How Many People Can Play?</h3>
            <ul class="small" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px;">
              <li><strong>Any group from 2 to 12+ players</strong> (ages 6 to 99!).</li>
              <li><strong>Sweet spot:</strong> 3–8 individual players.</li>
              <li><strong>Big Thanksgiving table (9+ people)?</strong> Pair up as <strong>1 Kid + 1 Adult</strong> teams (1 phone per pair!)—kids' wild creativity + adults' typing speed is hilarious!</li>
              <li><strong>Age tags:</strong> Mark players as <em>Kid</em>, <em>Teen</em>, or <em>Adult</em> so Feast Showdown trivia scales fairly.</li>
            </ul>
          </div>

          <div class="card stack-sm">
            <h3>⚙️ 3-Step Setup (Zero App Downloads)</h3>
            <ol class="small" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:5px;">
              <li><strong>Choose 1 Host Screen:</strong> Open this page on an iPad, laptop, TV, or your own phone where everyone can glance at the prompts &amp; images.</li>
              <li><strong>Remove demo names or keep/edit them:</strong> Tap <strong>×</strong> next to any starter player name you don't need, or add players right in the roster box.</li>
              <li><strong>Optional AI Boost (⚙️ icon):</strong> Everything works <strong>100% free out of the box</strong>. Want photorealistic regenerated AI art in <em>Prompt Clone!</em> &amp; <em>Prompt Panic!</em>? Tap <strong>⚙️</strong> and check <strong>Enable Live Photorealistic AI Images</strong>.</li>
            </ol>
          </div>

          <div class="card stack-sm">
            <h3>📱 How Guests Participate (Scanning the QR Barcode)</h3>
            <ol class="small" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:5px;">
              <li>On the Host screen, tap <strong>📱 QR</strong> in the top bar.</li>
              <li>Each guest opens their phone's normal <strong>Camera app</strong> (iPhone or Android) and points it at the square QR barcode.</li>
              <li>Tap the link banner that pops up on screen (works over home Wi-Fi <em>or</em> cellular 5G—no same-Wi-Fi requirement!).</li>
              <li>Type your <strong>Name</strong>, choose <strong>Kid / Teen / Adult</strong>, pick an emoji avatar, and tap <strong>Join Game Night!</strong> You'll automatically appear on the Host roster.</li>
              <li><strong>Keep your browser tab open:</strong> Your phone automatically turns into your live controller—a secret prompt box in <em>Prompt Clone!</em>, a giant red <strong>BUZZ IN</strong> button in trivia &amp; <em>Prompt Panic!</em>, a <strong>"🤖 THAT'S A BOT!"</strong> slammer in <em>Spot the Bot</em>, or Jury Vote buttons in <em>Turkey Court</em>.</li>
            </ol>
            <p class="xs muted" style="margin:4px 0 0;">💡 <strong>Prefer 1 phone only?</strong> Skip the QR code—every single game has built-in Pass-the-Phone privacy screens and split-screen buzzers on the Host device!</p>
          </div>

          <div class="stack-sm">
            <h3>🎲 Game-by-Game Rules</h3>
            ${GAMES_META.map(g => `
              <details class="card" style="padding:12px;">
                <summary style="cursor:pointer;font-weight:700;display:flex;align-items:center;justify-content:space-between;gap:8px;">
                  <span>${g.icon} ${g.title}</span>
                  <span class="xs muted">${g.players} · ${g.time}</span>
                </summary>
                <div class="xs muted" style="margin:6px 0;">📱 ${g.devices}</div>
                <ol class="small" style="margin:4px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:4px;">
                  ${g.rules.map(r => `<li>${esc(r)}</li>`).join('')}
                </ol>
              </details>
            `).join('')}
          </div>

          <div class="row-between">
            <button class="btn" id="guide-open-qr">📱 Open QR Barcode</button>
            <button class="btn btn-primary" id="guide-done">Got It — Let's Play!</button>
          </div>
        </div>
      </div>`;

    document.getElementById('modal-close').onclick = closeModal;
    document.getElementById('guide-done').onclick = closeModal;
    document.getElementById('modal-bg').onclick = (e) => { if (e.target.id === 'modal-bg') closeModal(); };
    document.getElementById('guide-open-qr').onclick = () => { closeModal(); openQRModal(); };
  }

  function openQRModal() {
    const m = document.getElementById('modal-root');
    const code = RoomSync.getRoomCode();
    const joinUrl = RoomSync.getJoinUrl(customShareBase);
    const mode = RoomSync.getMode();
    const remotePlayers = players.filter(p => p.remote);
    const modeLabel = mode === 'lan'
      ? '🟢 Local Wi-Fi Server Active (Fastest!)'
      : mode === 'cloud'
      ? '🟢 Live Cloud Room Active (Works on Wi-Fi & 5G!)'
      : '🟡 Preview / Local Mode (Open the live GitHub Pages link for phones to scan)';

    let qrSvg = '';
    try { qrSvg = QR.toSVG(joinUrl, { fg: '#2B1E16', bg: '#FFFFFF', quiet: 3 }); }
    catch (_) { qrSvg = '<p class="small">URL too long for QR</p>'; }

    m.innerHTML = `
      <div class="modal-backdrop" id="modal-bg">
        <div class="modal stack">
          <div class="row-between">
            <h2>📱 Scan QR Barcode to Join!</h2>
            <button class="btn btn-sm" id="modal-close">✕</button>
          </div>
          <div class="center stack-sm">
            <div class="qr-box">${qrSvg}</div>
            <div class="mono" style="font-size:1.5rem;font-weight:900;letter-spacing:0.14em;color:var(--pumpkin);">ROOM: ${esc(code)}</div>
            <div class="xs muted">${modeLabel}</div>
            ${remotePlayers.length
              ? `<div class="xs" style="color:var(--sage);font-weight:700;">✅ Joined on phones (${remotePlayers.length}): ${remotePlayers.map(p => `${p.avatar} ${esc(p.name)}`).join(', ')}</div>`
              : `<div class="xs muted">Waiting for phones to scan in… (2–12+ players supported!)</div>`}
          </div>

          <div class="card-warm stack-sm">
            <strong class="small">How Guests Join in 10 Seconds:</strong>
            <ol class="xs" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:3px;">
              <li>Open your phone's <strong>Camera app</strong> (iPhone or Android).</li>
              <li>Point at the QR barcode above &amp; tap the pop-up link (no app download!).</li>
              <li>Type your name, pick <strong>Kid / Teen / Adult</strong>, and tap <strong>Join</strong>.</li>
            </ol>
          </div>

          <div class="row">
            <button class="btn btn-primary" style="flex:1;" id="qr-copy">📋 Copy Join Link</button>
            <button class="btn" id="qr-new-room">🔄 New Code</button>
          </div>

          <details class="xs muted">
            <summary style="cursor:pointer;font-weight:600;">Advanced: Direct URL, Custom Host, or Test Phone View</summary>
            <div class="stack-sm" style="margin-top:8px;">
              <div class="xs mono muted" style="word-break:break-all;background:var(--surface-alt);padding:6px 10px;border-radius:8px;">${esc(joinUrl)}</div>
              <div class="row">
                <input class="input" id="qr-custom-base" placeholder="Custom hosted URL (optional)" value="${esc(customShareBase)}" style="font-size:0.85rem;padding:8px 10px;" />
                <button class="btn btn-sm" id="qr-apply-base">Update QR</button>
              </div>
              <button class="btn btn-sm" id="qr-test-phone">📱 Preview Guest Phone Controller</button>
            </div>
          </details>
        </div>
      </div>`;

    document.getElementById('modal-close').onclick = closeModal;
    document.getElementById('modal-bg').onclick = (e) => { if (e.target.id === 'modal-bg') closeModal(); };
    document.getElementById('qr-copy').onclick = () => {
      if (navigator.clipboard) navigator.clipboard.writeText(joinUrl).catch(() => {});
      document.getElementById('qr-copy').textContent = '✅ Link Copied!';
      SoundFX.pop();
    };
    document.getElementById('qr-new-room').onclick = () => {
      const next = RoomSync.genCode(4);
      try { localStorage.setItem(STORAGE_ROOM, next); } catch (_) {}
      RoomSync.connect(next);
      updateTopbar();
      openQRModal();
    };
    document.getElementById('qr-apply-base').onclick = () => {
      customShareBase = document.getElementById('qr-custom-base').value.trim();
      openQRModal();
    };
    document.getElementById('qr-test-phone').onclick = () => {
      closeModal();
      openSimulatedPhoneModal();
    };
  }

  // Inline test drawer so user can immediately experience the Phone Controller even on 1 device!
  function openSimulatedPhoneModal() {
    const m = document.getElementById('modal-root');
    const code = RoomSync.getRoomCode();
    const p = players[0];
    m.innerHTML = `
      <div class="modal-backdrop" id="modal-bg">
        <div class="modal stack">
          <div class="row-between">
            <h3>📱 Guest Phone Controller Preview</h3>
            <button class="btn btn-sm" id="modal-close">✕</button>
          </div>
          <p class="xs muted" style="margin:0;">When family members scan the QR code, their phone shows live game controls for Room <strong>${esc(code)}</strong>:</p>
          <div class="card-warm stack-sm">
            <label class="xs"><strong>Acting as Player:</strong></label>
            <select class="select" id="sim-player">
              ${players.map(pl => `<option value="${pl.id}">${pl.avatar} ${esc(pl.name)}</option>`).join('')}
            </select>
          </div>
          <div id="sim-controls" class="stack"></div>
        </div>
      </div>`;

    document.getElementById('modal-close').onclick = closeModal;
    document.getElementById('modal-bg').onclick = (e) => { if (e.target.id === 'modal-bg') closeModal(); };

    const renderSim = () => {
      const pid = document.getElementById('sim-player').value;
      const box = document.getElementById('sim-controls');
      const { game, phase } = lastHostBroadcast;
      if (game === 'promptClone' && phase === 'writing') {
        box.innerHTML = `
          <textarea class="textarea" id="sim-txt" placeholder="Type your Prompt Clone guess from this guest phone..."></textarea>
          <button class="btn btn-primary btn-lg" id="sim-send">🔒 Submit to Host!</button>`;
        document.getElementById('sim-send').onclick = () => {
          const val = document.getElementById('sim-txt').value.trim();
          if (!val) return;
          if (currentGame && currentGame.onPhoneAction) currentGame.onPhoneAction({ playerId: pid, action: 'SUBMIT_CLONE_PROMPT', value: val });
          closeModal();
        };
      } else if (game === 'spotTheBot' && phase === 'submit') {
        box.innerHTML = `
          <textarea class="textarea" id="sim-txt" placeholder="Type your secret dinner-table answer..."></textarea>
          <button class="btn btn-primary btn-lg" id="sim-send">🔒 Lock In Answer!</button>`;
        document.getElementById('sim-send').onclick = () => {
          const val = document.getElementById('sim-txt').value.trim();
          if (!val) return;
          if (currentGame && currentGame.onPhoneAction) currentGame.onPhoneAction({ playerId: pid, action: 'SUBMIT_BOT_ANSWER', value: val });
          closeModal();
        };
      } else if (game === 'spotTheBot' && phase === 'reveal') {
        box.innerHTML = `<button class="controller-buzzer" id="sim-buzz">🤖 THAT'S A BOT!</button>`;
        document.getElementById('sim-buzz').onclick = () => {
          if (currentGame && currentGame.onPhoneAction) currentGame.onPhoneAction({ playerId: pid, action: 'SLAM_BOT', value: true });
          closeModal();
        };
      } else if ((game === 'promptPanic' && phase === 'guess') || (game === 'feastShowdown' && phase === 'trivia')) {
        box.innerHTML = `<button class="controller-buzzer" id="sim-buzz">🚨 BUZZ IN!</button>`;
        document.getElementById('sim-buzz').onclick = () => {
          if (currentGame && currentGame.onPhoneAction) currentGame.onPhoneAction({ playerId: pid, action: 'BUZZ', value: true });
          closeModal();
        };
      } else {
        box.innerHTML = `<p class="small muted center">Start a round in any game (like Prompt Clone, Spot the Bot, or Feast Showdown) and open this preview to send live guest actions!</p>`;
      }
    };
    document.getElementById('sim-player').onchange = renderSim;
    renderSim();
  }

  function requireAdminPin(actionLabel, onSuccess, onCancel) {
    const m = document.getElementById('modal-root');
    m.innerHTML = `
      <div class="modal-backdrop" id="modal-bg">
        <div class="modal stack" style="max-width:400px;">
          <div class="row-between">
            <h2>🔒 Host Admin Passcode</h2>
            <button class="btn btn-sm" id="pin-close">✕</button>
          </div>
          <p class="small muted" style="margin:0;">Enter the Host passcode to confirm: <strong>${esc(actionLabel)}</strong></p>
          <form class="stack" id="pin-form">
            <input type="password" inputmode="numeric" autocomplete="off" class="input mono center" id="pin-input" placeholder="••••" style="font-size:1.6rem;letter-spacing:0.35em;" maxlength="12" required />
            <div id="pin-err" class="xs center" style="color:var(--cranberry);font-weight:700;min-height:18px;"></div>
            <div class="row">
              <button type="button" class="btn" style="flex:1;" id="pin-cancel">Cancel</button>
              <button type="submit" class="btn btn-danger" style="flex:1;">🔓 Unlock &amp; Confirm</button>
            </div>
          </form>
        </div>
      </div>`;

    const inp = document.getElementById('pin-input');
    const err = document.getElementById('pin-err');
    setTimeout(() => { try { inp.focus(); } catch (_) {} }, 30);

    const cancel = () => {
      closeModal();
      if (onCancel) onCancel();
    };
    document.getElementById('pin-close').onclick = cancel;
    document.getElementById('pin-cancel').onclick = cancel;
    document.getElementById('modal-bg').onclick = (e) => { if (e.target.id === 'modal-bg') cancel(); };

    document.getElementById('pin-form').onsubmit = (e) => {
      e.preventDefault();
      if (inp.value.trim() === getAdminPin()) {
        SoundFX.ding();
        closeModal();
        onSuccess();
      } else {
        SoundFX.wrong();
        err.textContent = '❌ Wrong passcode — nice try! 🦃';
        inp.value = '';
        inp.focus();
      }
    };
  }

  function openLeaderboardModal(justReset) {
    const showResetNotice = justReset === true;
    const m = document.getElementById('modal-root');
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const anyScore = sorted.some(p => p.score > 0);
    m.innerHTML = `
      <div class="modal-backdrop" id="modal-bg">
        <div class="modal stack">
          <div class="row-between">
            <h2>🏆 Family Leaderboard</h2>
            <button class="btn btn-sm" id="modal-close">✕</button>
          </div>
          ${showResetNotice ? `<div class="card-warm small center" style="color:var(--sage);font-weight:700;">✅ All scores reset to 0 — ready for a fresh game!</div>` : ''}
          <div class="stack-sm">
            ${sorted.map((p, i) => `
              <div class="card-warm row-between" style="padding:12px 14px;">
                <div class="row">
                  <strong class="mono" style="width:26px;">${i === 0 && p.score > 0 ? '👑' : `#${i + 1}`}</strong>
                  <span style="font-size:1.35rem;">${p.avatar}</span>
                  <div>
                    <strong>${esc(p.name)}</strong>
                    <div class="xs muted">${p.ageGroup === 'kid' ? 'Kid' : p.ageGroup === 'teen' ? 'Teen' : 'Adult'}</div>
                  </div>
                </div>
                <div class="row" style="gap:8px;">
                  <strong class="mono" style="font-size:1.2rem;color:var(--pumpkin);">${p.score} pts</strong>
                  ${p.score > 0 ? `<button class="btn btn-sm" data-zero="${p.id}" title="Zero out ${esc(p.name)}'s score (PIN required)">🔒 0</button>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
          <div class="row-between">
            <button class="btn btn-danger" id="lb-reset" ${!anyScore ? 'disabled' : ''}>🔒 Reset All Scores to 0</button>
            <button class="btn btn-primary" id="lb-done">Done</button>
          </div>
        </div>
      </div>`;

    document.getElementById('modal-close').onclick = closeModal;
    document.getElementById('lb-done').onclick = closeModal;
    document.getElementById('modal-bg').onclick = (e) => { if (e.target.id === 'modal-bg') closeModal(); };
    m.querySelectorAll('[data-zero]').forEach(btn => {
      btn.onclick = () => {
        const target = players.find(x => x.id === btn.dataset.zero);
        requireAdminPin(`Reset ${target ? target.name + "'s" : 'this'} score to 0`, () => {
          resetPlayerScore(btn.dataset.zero);
          openLeaderboardModal(false);
          if (!currentGameKey) renderHub();
        }, () => openLeaderboardModal(false));
      };
    });
    document.getElementById('lb-reset').onclick = () => {
      requireAdminPin('Reset ALL player scores to 0', () => {
        resetScores();
        openLeaderboardModal(true);
        if (!currentGameKey) renderHub();
      }, () => openLeaderboardModal(false));
    };
  }

  function openSettingsModal() {
    const m = document.getElementById('modal-root');
    const cfg = LiveAI.loadSettings();
    m.innerHTML = `
      <div class="modal-backdrop" id="modal-bg">
        <div class="modal stack">
          <div class="row-between">
            <h2>⚙️ Host &amp; AI Settings</h2>
            <button class="btn btn-sm" id="modal-close">✕</button>
          </div>
          <p class="small muted" style="margin:0;">All 6 games work <strong>100% out of the box</strong> with our Built-In Instant AI. Optionally connect a live AI key or live image generator below:</p>

          <div class="stack-sm">
            <label class="small"><strong>AI Judge &amp; Bot Provider</strong></label>
            <select class="select" id="ai-provider">
              <option value="builtin" ${cfg.provider === 'builtin' ? 'selected' : ''}>⚡ Built-In Instant AI (No Key Needed · Works Offline)</option>
              <option value="gemini" ${cfg.provider === 'gemini' ? 'selected' : ''}>✨ Google Gemini (gemini-2.0-flash)</option>
              <option value="openai" ${cfg.provider === 'openai' ? 'selected' : ''}>🤖 OpenAI (gpt-4o-mini)</option>
            </select>
          </div>

          <div class="stack-sm">
            <label class="small"><strong>API Key (stored only in your browser)</strong></label>
            <input type="password" class="input" id="ai-key" placeholder="Optional API key..." value="${esc(cfg.apiKey)}" />
          </div>

          <label class="card-warm row" style="cursor:pointer;">
            <input type="checkbox" id="ai-live-imgs" ${cfg.liveImages ? 'checked' : ''} style="width:20px;height:20px;" />
            <div>
              <strong class="small">Enable Live Photorealistic AI Images (Pollinations.ai)</strong>
              <div class="xs muted">When online on phones/laptops, generates real AI images for Prompt Clone &amp; Prompt Panic (falls back to built-in Canvas Artist automatically if offline).</div>
            </div>
          </label>

          <div class="card stack-sm">
            <strong class="small">🔒 Change Host Admin Passcode (Protects Score Resets)</strong>
            <div class="grid-2">
              <input type="password" inputmode="numeric" class="input" id="pin-cur" placeholder="Current PIN" maxlength="12" />
              <input type="password" inputmode="numeric" class="input" id="pin-new" placeholder="New PIN (e.g. 4 digits)" maxlength="12" />
            </div>
            <div id="pin-save-msg" class="xs muted">Leave blank to keep your current passcode.</div>
          </div>

          <button class="btn btn-primary btn-lg" id="ai-save">Save Settings</button>
        </div>
      </div>`;

    document.getElementById('modal-close').onclick = closeModal;
    document.getElementById('modal-bg').onclick = (e) => { if (e.target.id === 'modal-bg') closeModal(); };
    document.getElementById('ai-save').onclick = () => {
      const curPin = document.getElementById('pin-cur').value.trim();
      const newPin = document.getElementById('pin-new').value.trim();
      const msgEl = document.getElementById('pin-save-msg');
      if (newPin) {
        if (curPin !== getAdminPin()) {
          SoundFX.wrong();
          msgEl.style.color = 'var(--cranberry)';
          msgEl.textContent = '❌ Current PIN is incorrect — passcode not changed.';
          return;
        }
        setAdminPin(newPin);
      }

      LiveAI.saveSettings({
        provider: document.getElementById('ai-provider').value,
        apiKey: document.getElementById('ai-key').value.trim(),
        liveImages: document.getElementById('ai-live-imgs').checked,
      });
      SoundFX.ding();
      closeModal();
      if (currentGame && currentGame.render) currentGame.render();
    };
  }

  // =========================================================================
  // DEDICATED PHONE CONTROLLER MODE (?room=XXXX&join=1)
  // =========================================================================
  function runPhoneController(roomCode) {
    let me = null;
    let hostState = { game: null, phase: 'hub', payload: {}, leaderboard: [] };
    let submittedKey = '';
    let lastViewKey = '';
    let activeCloneRound = '';
    let cloneDraft = '';
    let activeBotRound = '';
    let botDraft = '';
    let cachedTargetKey = '';
    let cachedTargetDataUrl = '';

    function getPhoneCloneImageHtml(payload) {
      if (payload.customImageThumb) {
        return `<div class="art-frame"><img src="${payload.customImageThumb}" alt="Target Image" /></div>`;
      }
      const ch = GAME_DATA.promptClone.challenges.find(
        c => (payload.challengeId && c.id === payload.challengeId) || (payload.title && c.title === payload.title)
      );
      if (ch) {
        if (cachedTargetKey !== ch.id) {
          cachedTargetKey = ch.id;
          cachedTargetDataUrl = AIArt.renderDataURL(ch.secretPrompt, 440, 300).dataUrl;
        }
        if (payload.liveImageUrl) {
          return `<div class="art-frame"><img src="${payload.liveImageUrl}" onerror="this.src='${cachedTargetDataUrl}'" alt="Target Image" /></div>`;
        }
        return `<div class="art-frame"><img src="${cachedTargetDataUrl}" alt="Target Image" /></div>`;
      }
      if (payload.liveImageUrl) {
        return `<div class="art-frame"><img src="${payload.liveImageUrl}" alt="Target Image" /></div>`;
      }
      return '';
    }

    RoomSync.connect(roomCode);
    RoomSync.onMessage((msg) => {
      if (msg.type === 'HOST_STATE') {
        hostState = msg;
        renderPhone();
      }
    });

    function renderPhone() {
      const app = document.getElementById('app');
      if (!me) {
        // Never wipe the Join form if a HOST_STATE arrives while guest is typing their name!
        if (lastViewKey === 'join') return;
        lastViewKey = 'join';
        app.innerHTML = `
          <div class="controller-shell stack fade-in">
            <div class="center stack-sm" style="margin-top:12px;">
              <div style="font-size:3rem;">🦃📱</div>
              <h1>Join the Table!</h1>
              <span class="tag tag-gold mono">ROOM CODE: ${esc(roomCode)}</span>
            </div>
            <form class="card stack" id="join-form">
              <div class="stack-sm">
                <label class="small"><strong>Your Name</strong></label>
                <input class="input" id="j-name" placeholder="e.g. Aunt Clara, Leo..." required maxlength="18" />
              </div>
              <div class="stack-sm">
                <label class="small"><strong>Age Group (for fair trivia!)</strong></label>
                <select class="select" id="j-age">
                  <option value="kid">🧒 Kid</option>
                  <option value="teen">🧑 Teen</option>
                  <option value="adult" selected>🧑‍🦳 Adult</option>
                </select>
              </div>
              <div class="stack-sm">
                <label class="small"><strong>Pick Your Avatar</strong></label>
                <div class="chip-wrap" id="j-avatars">
                  ${GAME_DATA.avatars.map((av, i) => `<button type="button" class="btn btn-sm ${i === 0 ? 'btn-primary' : ''}" data-av="${av}" style="font-size:1.3rem;">${av}</button>`).join('')}
                </div>
              </div>
              <button type="submit" class="btn btn-primary btn-lg">🚀 Join Game Night!</button>
            </form>
          </div>`;

        let chosenAvatar = GAME_DATA.avatars[0];
        app.querySelectorAll('[data-av]').forEach(b => {
          b.onclick = () => {
            chosenAvatar = b.dataset.av;
            app.querySelectorAll('[data-av]').forEach(x => x.classList.remove('btn-primary'));
            b.classList.add('btn-primary');
          };
        });
        document.getElementById('join-form').onsubmit = (e) => {
          e.preventDefault();
          const name = document.getElementById('j-name').value.trim();
          if (!name) return;
          me = {
            id: 'r_' + Math.random().toString(36).slice(2, 9),
            name,
            ageGroup: document.getElementById('j-age').value,
            avatar: chosenAvatar,
          };
          lastViewKey = '';
          SoundFX.ding();
          RoomSync.send({ type: 'JOIN', ...me });
          renderPhone();
        };
        return;
      }

      const myScore = (hostState.leaderboard || []).find(x => x.id === me.id)?.score ?? 0;
      const { game, phase, payload = {} } = hostState;

      // Keep top score pill updated in-place even when we skip tearing down an active typing screen
      const scorePill = document.getElementById('phone-score-pts');
      if (scorePill) scorePill.textContent = `${myScore} pts`;

      const cloneRoundKey = `clone_${payload.roundId || payload.title || ''}`;
      const botRoundKey = `bot_${payload.question || ''}`;

      // Reset draft cleanly only when a genuinely new round begins
      if (game === 'promptClone' && phase === 'writing' && activeCloneRound !== cloneRoundKey) {
        activeCloneRound = cloneRoundKey;
        cloneDraft = '';
      }
      if (game === 'spotTheBot' && phase === 'submit' && activeBotRound !== botRoundKey) {
        activeBotRound = botRoundKey;
        botDraft = '';
      }

      const cloneAlready = (payload.submittedIds || []).includes(me.id) || submittedKey === cloneRoundKey;
      const botAlready = (payload.submittedIds || []).includes(me.id) || submittedKey === botRoundKey;

      // Compute stable view key so another player's submission NEVER wipes this player's active textarea or dismisses their keyboard!
      let viewKey = `${game || 'hub'}:${phase || 'hub'}`;
      if (game === 'promptClone' && phase === 'writing') {
        viewKey = `promptClone:writing:${cloneRoundKey}:${cloneAlready ? 'done' : 'edit'}`;
      } else if (game === 'spotTheBot' && phase === 'submit') {
        viewKey = `spotTheBot:submit:${botRoundKey}:${botAlready ? 'done' : 'edit'}`;
      }

      if (viewKey === lastViewKey && (viewKey.endsWith(':edit'))) {
        const subEl = document.getElementById('phone-sub-count');
        if (subEl && Array.isArray(payload.submittedIds)) {
          subEl.textContent = `${payload.submittedIds.length} locked in so far`;
        }
        return;
      }
      lastViewKey = viewKey;

      let body = '';

      if (game === 'promptClone' && phase === 'writing') {
        const imgHtml = getPhoneCloneImageHtml(payload);
        body = cloneAlready ? `
          <div class="card center stack">
            <div style="font-size:3rem;">🔒✨</div>
            <h2>Prompt Locked In!</h2>
            <p class="small muted">Waiting for everyone else—get ready to see what the AI paints from your prompt!</p>
            ${imgHtml}
          </div>` : `
          <div class="card stack">
            <div class="row-between">
              <span class="tag tag-new">PROMPT CLONE · ${esc(payload.difficulty || '')}</span>
              <span class="xs muted" id="phone-sub-count">${(payload.submittedIds || []).length} locked in so far</span>
            </div>
            <h2 style="margin:0;">🔍 Recreate This Image!</h2>
            ${imgHtml}
            <p class="xs muted" style="margin:0;">💡 Hint: ${esc(payload.tips || 'Describe subjects, setting, props, colors, and art style!')}</p>
            <textarea class="textarea" id="p-clone-in" placeholder="Describe the subjects, setting, props, colors, weather, and art style...">${esc(cloneDraft)}</textarea>
            <div class="chip-wrap">
              ${['pixel art', 'neon', 'vintage', 'watercolor', 'ink sketch', 'sunset', 'outer space', 'sunglasses', 'crown', 'rainbow'].map(c =>
                `<button type="button" class="chip" data-pchip="${c}">+ ${c}</button>`).join('')}
            </div>
            <button class="btn btn-primary btn-lg" id="p-clone-send">🔒 Lock In My Prompt!</button>
          </div>`;
      } else if (game === 'spotTheBot' && phase === 'submit') {
        body = botAlready ? `
          <div class="card center stack">
            <div style="font-size:3rem;">🤖🔒</div>
            <h2>Answer Submitted!</h2>
            <p class="small muted">Get your finger ready—next up, race to spot the AI Bot!</p>
          </div>` : `
          <div class="card stack">
            <div class="row-between">
              <span class="tag tag-gold">SPOT THE BOT</span>
              <span class="xs muted" id="phone-sub-count">${(payload.submittedIds || []).length} locked in so far</span>
            </div>
            <h3>"${esc(payload.question || '')}"</h3>
            <textarea class="textarea" id="p-bot-in" placeholder="Write your funniest or sneakiest answer...">${esc(botDraft)}</textarea>
            <button class="btn btn-primary btn-lg" id="p-bot-send">🔒 Send Secret Answer</button>
          </div>`;
      } else if (game === 'spotTheBot' && phase === 'reveal') {
        body = `
          <div class="stack">
            <div class="card-warm center small">“${esc(payload.cardText || '')}”</div>
            <button class="controller-buzzer" id="p-slam-bot" ${!payload.canSlam ? 'disabled' : ''}>
              🤖 THAT'S A BOT!
            </button>
          </div>`;
      } else if ((game === 'promptPanic' && phase === 'guess') || (game === 'feastShowdown' && phase === 'trivia')) {
        body = `
          <div class="stack center">
            <p class="small muted">${payload.buzzedName ? `🚨 ${esc(payload.buzzedName)} buzzed in!` : 'Ready? Smash the buzzer as soon as you know!'}</p>
            <button class="controller-buzzer" id="p-buzz" ${payload.buzzedName ? 'disabled' : ''}>
              🚨 BUZZ IN!
            </button>
          </div>`;
      } else if (game === 'turkeyCourt' && phase === 'defend') {
        const cs = payload.contenders || [];
        body = `
          <div class="card stack">
            <span class="tag tag-gold">⚖️ TURKEY COURT JURY</span>
            <h3>${esc(payload.caseTitle || '')}</h3>
            ${!payload.twist ? `<button class="btn btn-danger btn-lg" id="p-twist">⚡ Drop Plot Twist!</button>` : `<div class="twist-banner small">${esc(payload.twist)}</div>`}
            <strong class="small">Vote for Best Defense:</strong>
            <div class="grid-2">
              ${cs.map((c, i) => `<button class="btn btn-primary" data-cvote="${i}">👏 Vote ${c.avatar} ${esc(c.name)}</button>`).join('')}
            </div>
          </div>`;
      } else if (game === 'gobbleBomb' && phase === 'live') {
        const isMe = payload.holderId === me.id;
        body = `
          <div class="card center stack">
            <div style="font-size:3rem;">🦃💣</div>
            <h3>${isMe ? 'YOU HAVE THE BOMB!' : `${esc(payload.holderName || 'Someone')} has the bomb!`}</h3>
            ${payload.word ? `<div class="twist-word-big">"${esc(payload.word)}"</div>` : ''}
            <button class="btn btn-danger btn-xl" id="p-pass-bomb">👋 PASS THE TURKEY!</button>
          </div>`;
      } else if (game === 'feastShowdown' && phase === 'pitch') {
        body = `
          <div class="card stack">
            <span class="tag tag-gold">📣 PITCH BATTLE VOTE</span>
            <h3>Dish: ${esc(payload.pitchDish || '')}</h3>
            <p class="small muted" style="margin:0;">Tap who made the funniest commercial!</p>
            <div class="buzzer-grid">
              ${(payload.players || []).map(pl => `<button class="buzzer-pad" data-pvote="${pl.id}"><span>${pl.avatar}</span><span>${esc(pl.name)}</span></button>`).join('')}
            </div>
          </div>`;
      } else {
        body = `
          <div class="card center stack" style="padding:36px 18px;">
            <div style="font-size:3rem;">${me.avatar}</div>
            <h2>You're Connected!</h2>
            <p class="small muted" style="margin:0;">Look at the main screen—your phone controller will update automatically as soon as the Host starts a game!</p>
          </div>`;
      }

      app.innerHTML = `
        <div class="controller-shell stack">
          <div class="row-between">
            <span class="player-chip">${me.avatar} ${esc(me.name)} <span class="pts" id="phone-score-pts">${myScore} pts</span></span>
            <span class="tag mono">ROOM ${esc(roomCode)}</span>
          </div>
          ${body}
        </div>`;

      // Bind dynamic phone controller actions
      const pCloneIn = document.getElementById('p-clone-in');
      if (pCloneIn) {
        pCloneIn.oninput = (e) => { cloneDraft = e.target.value; };
        app.querySelectorAll('[data-pchip]').forEach(ch => {
          ch.onclick = () => {
            pCloneIn.value = (pCloneIn.value.trim() ? pCloneIn.value.trim() + ' ' : '') + ch.dataset.pchip;
            cloneDraft = pCloneIn.value;
          };
        });
        document.getElementById('p-clone-send').onclick = () => {
          const val = pCloneIn.value.trim();
          if (!val) return;
          submittedKey = cloneRoundKey;
          cloneDraft = '';
          SoundFX.ding();
          RoomSync.send({ type: 'ACTION', playerId: me.id, action: 'SUBMIT_CLONE_PROMPT', value: val });
          renderPhone();
        };
      }
      const pBotIn = document.getElementById('p-bot-in');
      if (pBotIn) {
        pBotIn.oninput = (e) => { botDraft = e.target.value; };
      }
      const pBotSend = document.getElementById('p-bot-send');
      if (pBotSend) {
        pBotSend.onclick = () => {
          const val = document.getElementById('p-bot-in').value.trim();
          if (!val) return;
          submittedKey = botRoundKey;
          botDraft = '';
          SoundFX.ding();
          RoomSync.send({ type: 'ACTION', playerId: me.id, action: 'SUBMIT_BOT_ANSWER', value: val });
          renderPhone();
        };
      }
      const pSlam = document.getElementById('p-slam-bot');
      if (pSlam) pSlam.onclick = () => {
        SoundFX.buzzer();
        RoomSync.send({ type: 'ACTION', playerId: me.id, action: 'SLAM_BOT', value: true });
      };
      const pBuzz = document.getElementById('p-buzz');
      if (pBuzz) pBuzz.onclick = () => {
        SoundFX.buzzer();
        RoomSync.send({ type: 'ACTION', playerId: me.id, action: 'BUZZ', value: true });
      };
      const pTwist = document.getElementById('p-twist');
      if (pTwist) pTwist.onclick = () => {
        SoundFX.gavel();
        RoomSync.send({ type: 'ACTION', playerId: me.id, action: 'COURT_TWIST', value: true });
      };
      app.querySelectorAll('[data-cvote]').forEach(b => {
        b.onclick = () => {
          SoundFX.pop();
          RoomSync.send({ type: 'ACTION', playerId: me.id, action: 'COURT_VOTE', value: Number(b.dataset.cvote) });
          b.textContent = '✅ Voted!';
        };
      });
      const pPass = document.getElementById('p-pass-bomb');
      if (pPass) pPass.onclick = () => {
        SoundFX.pop();
        RoomSync.send({ type: 'ACTION', playerId: me.id, action: 'PASS_BOMB', value: '' });
      };
      app.querySelectorAll('[data-pvote]').forEach(b => {
        b.onclick = () => {
          SoundFX.pop();
          RoomSync.send({ type: 'ACTION', playerId: me.id, action: 'PITCH_VOTE', value: b.dataset.pvote });
          b.classList.add('buzzed');
        };
      });
    }

    renderPhone();
  }

  // ---- Boot Host or Phone Controller ----
  async function init() {
    await RoomSync.detectTransport();
    const params = new URLSearchParams(window.location.search);
    if (params.get('join') === '1' && params.get('room')) {
      runPhoneController(params.get('room').toUpperCase());
      return;
    }

    let savedRoom = '';
    try { savedRoom = localStorage.getItem(STORAGE_ROOM) || ''; } catch (_) {}
    const code = savedRoom || RoomSync.genCode(4);
    try { localStorage.setItem(STORAGE_ROOM, code); } catch (_) {}
    RoomSync.connect(code);

    RoomSync.onMessage((msg) => {
      if (msg.type === 'JOIN' && msg.name) {
        addPlayer({ id: msg.id || msg.playerId, name: msg.name, ageGroup: msg.ageGroup || 'adult', avatar: msg.avatar, remote: true });
        SoundFX.ding();
        // Send current game state to the newly joined phone
        broadcastHostState(lastHostBroadcast.game, lastHostBroadcast.phase, lastHostBroadcast.payload);
        if (!currentGameKey) renderHub();
        else if (currentGame && currentGame.render) currentGame.render();
        // Live-refresh QR modal if currently open so Host sees guests pop in immediately
        if (document.getElementById('qr-copy')) openQRModal();
      } else if (msg.type === 'ACTION' && currentGame && currentGame.onPhoneAction) {
        currentGame.onPhoneAction(msg);
      }
    });

    // Render Host Shell
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="app-shell">
        <header class="topbar">
          <button class="brand-btn" id="btn-home" title="All Games">
            <span style="font-size:1.35rem;">🦃</span>
            <span class="brand-title">Feast Night AI</span>
          </button>
          <div class="topbar-actions">
            <button class="icon-pill qr-pill" id="btn-qr">📱 QR · ${esc(code)}</button>
            <button class="icon-pill" id="btn-guide" title="How to Play & Setup">📖 Guide</button>
            <button class="icon-pill" id="btn-leaderboard">🏆 Scores</button>
            <button class="icon-pill" id="btn-voice" title="Toggle AI Voice Host">🗣️ Voice</button>
            <button class="icon-pill" id="btn-sound" title="Mute Sound Effects">🔊</button>
            <button class="icon-pill" id="btn-ai" title="AI Settings">⚙️</button>
          </div>
        </header>
        <nav id="game-nav" class="row-between" style="display:none;margin-bottom:14px;padding:8px 12px;background:var(--surface);border:1px solid var(--border);border-radius:12px;"></nav>
        <main id="stage"></main>
      </div>
      <div id="modal-root"></div>`;

    document.getElementById('btn-home').onclick = () => { SoundFX.pop(); requestReturnHome(); };
    document.getElementById('btn-qr').onclick = openQRModal;
    document.getElementById('btn-guide').onclick = openGuideModal;
    document.getElementById('btn-leaderboard').onclick = openLeaderboardModal;
    document.getElementById('btn-ai').onclick = openSettingsModal;
    document.getElementById('btn-voice').onclick = () => {
      const on = SoundFX.toggleVoice();
      document.getElementById('btn-voice').textContent = on ? '🗣️ Voice' : '🤫 Voice Off';
    };
    document.getElementById('btn-sound').onclick = () => {
      const muted = SoundFX.toggleMute();
      document.getElementById('btn-sound').textContent = muted ? '🔇' : '🔊';
    };

    try { window.history.replaceState({ view: 'hub' }, '', window.location.pathname + window.location.search); } catch (_) {}
    window.addEventListener('popstate', (ev) => {
      if (currentGameKey) {
        requestReturnHome(true);
      } else if (ev.state && ev.state.view === 'game' && ev.state.key) {
        openGame(ev.state.key, { skipPush: true });
      }
    });

    updateTopbar();
    renderHub();
  }

  const publicApi = {
    getPlayers, addPlayer, removePlayer, addScore,
    getStage, broadcastHostState, openQRModal, openGuideModal, openGame,
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  return publicApi;
})();
