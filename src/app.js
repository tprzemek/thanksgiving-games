// Main Host Hub + Persistent Roster/Leaderboard + QR Room Modal + Dedicated Phone Controller Mode

const App = (() => {
  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const STORAGE_PLAYERS = 'tg26_players_v1';
  const STORAGE_ROOM = 'tg26_room_v1';

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

  function openGame(key) {
    if (currentGame && currentGame.cleanup) currentGame.cleanup();
    currentGameKey = key;
    if (!key) {
      currentGame = null;
      broadcastHostState(null, 'hub', {});
      renderHub();
      return;
    }
    const factory = Games[key];
    if (!factory) return;
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
      desc: 'Everyone studies the same AI image and writes a prompt to recreate it. AI regenerates every player\'s image and grades resemblance %!',
      meta: 'Thinking · Creativity · All Ages',
    },
    {
      key: 'turkeyCourt',
      icon: '⚖️',
      title: 'Turkey Court',
      tag: 'AI JUDGE + TWISTS',
      tagClass: 'tag-gold',
      desc: 'Defend yourself against hilarious Thanksgiving charges while the AI Judge slams live mid-speech OBJECTION plot twists!',
      meta: 'Improv · Quick Reaction · Laughs',
    },
    {
      key: 'promptPanic',
      icon: '🎨',
      title: 'Prompt Panic!',
      tag: 'SPEED ART BUZZER',
      tagClass: 'tag-kid',
      desc: '25 seconds to prompt the AI from a wacky secret phrase—then everyone races to buzz in as the artwork slowly unblurs!',
      meta: 'Creativity · Reflexes · Teams',
    },
    {
      key: 'gobbleBomb',
      icon: '💣',
      title: 'Pass the Gobble Bomb',
      tag: 'ONE-PHONE HOT POTATO',
      tagClass: 'tag-new',
      desc: 'Pass one phone around the table, shout a story sentence using the twist word, and pass before the hidden turkey fuse blows!',
      meta: 'Fast · Loud · Illustrated Finale',
    },
    {
      key: 'spotTheBot',
      icon: '🤖',
      title: 'Spot the Bot',
      tag: 'DINNER TABLE EDITION',
      tagClass: 'tag-gold',
      desc: 'Everyone submits a witty answer and AI sneaks in fake ones. Race to slam "THAT\'S A BOT!"—or score points for fooling the table!',
      meta: 'Bluffing · Quick Reaction · Phones',
    },
    {
      key: 'feastShowdown',
      icon: '🏆',
      title: 'Feast Showdown',
      tag: 'AGE-BALANCED QUIZ',
      tagClass: 'tag-kid',
      desc: '3 fast mini-modes: Lightning Buzz (auto-scaled Kid/Teen/Adult trivia), Absurd Dish Pitch Battle, and 5-second Rapid-Fire Chain!',
      meta: 'Trivia · Creativity · Fair for Kids',
    },
  ];

  function renderHub() {
    const root = getStage();
    const sorted = [...players].sort((a, b) => b.score - a.score);
    root.innerHTML = `
      <div class="stack fade-in">
        <div class="hub-header">
          <div>
            <h1>Thanksgiving AI Game Night</h1>
            <p class="hub-sub">Six fast, laugh-out-loud table games built for kids & adults. Play right on this device or let everyone join on their phones by scanning the QR code.</p>
          </div>
          <button class="btn btn-primary" id="hub-open-qr">📱 Invite Phones via QR</button>
        </div>

        <div class="card stack-sm">
          <div class="row-between">
            <h3>👨‍👩‍👧‍👦 Players at the Table (${players.length})</h3>
            <span class="xs muted">Scores carry across all 6 games!</span>
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
                <span class="xs muted">${g.meta}</span>
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
            <button class="btn btn-sm" id="hub-view-lb">Full Standings</button>
          </div>
        ` : ''}
      </div>`;

    document.getElementById('hub-open-qr').onclick = openQRModal;
    const lb = document.getElementById('hub-view-lb');
    if (lb) lb.onclick = openLeaderboardModal;

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

  // ---- Modals (QR Code Room, Leaderboard, AI Settings) ----
  function closeModal() {
    const m = document.getElementById('modal-root');
    if (m) m.innerHTML = '';
  }

  function openQRModal() {
    const m = document.getElementById('modal-root');
    const code = RoomSync.getRoomCode();
    const joinUrl = RoomSync.getJoinUrl(customShareBase);
    const mode = RoomSync.getMode();
    const modeLabel = mode === 'lan'
      ? '🟢 Local Wi-Fi Server Active (Fastest!)'
      : mode === 'cloud'
      ? '🟢 Live Cloud Room Active (Works on Wi-Fi & 5G!)'
      : '🟡 Preview / Local Mode (Host on Wi-Fi or GitHub Pages for phones to scan)';

    let qrSvg = '';
    try { qrSvg = QR.toSVG(joinUrl, { fg: '#2B1E16', bg: '#FFFFFF', quiet: 3 }); }
    catch (_) { qrSvg = '<p class="small">URL too long for QR</p>'; }

    m.innerHTML = `
      <div class="modal-backdrop" id="modal-bg">
        <div class="modal stack">
          <div class="row-between">
            <h2>📱 Join on Your Phone!</h2>
            <button class="btn btn-sm" id="modal-close">✕</button>
          </div>
          <div class="center stack-sm">
            <div class="qr-box">${qrSvg}</div>
            <div class="mono" style="font-size:1.5rem;font-weight:900;letter-spacing:0.14em;color:var(--pumpkin);">ROOM: ${esc(code)}</div>
            <div class="xs muted">${modeLabel}</div>
            <div class="xs mono muted" style="word-break:break-all;background:var(--surface-alt);padding:6px 10px;border-radius:8px;">${esc(joinUrl)}</div>
          </div>

          <div class="row">
            <button class="btn btn-primary" style="flex:1;" id="qr-copy">📋 Copy Join Link</button>
            <button class="btn" id="qr-new-room">🔄 New Code</button>
          </div>

          <div class="card-warm stack-sm">
            <strong class="xs">Custom Hosted URL (optional — updates QR immediately):</strong>
            <div class="row">
              <input class="input" id="qr-custom-base" placeholder="https://your-site.github.io/thanksgiving-games" value="${esc(customShareBase)}" style="font-size:0.85rem;padding:8px 10px;" />
              <button class="btn btn-sm" id="qr-apply-base">Update QR</button>
            </div>
          </div>

          <div class="row-between">
            <span class="xs muted">Want to test what guests see on their phone?</span>
            <button class="btn btn-sm" id="qr-test-phone">📱 Open Phone View</button>
          </div>
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

  function openLeaderboardModal() {
    const m = document.getElementById('modal-root');
    const sorted = [...players].sort((a, b) => b.score - a.score);
    m.innerHTML = `
      <div class="modal-backdrop" id="modal-bg">
        <div class="modal stack">
          <div class="row-between">
            <h2>🏆 Family Leaderboard</h2>
            <button class="btn btn-sm" id="modal-close">✕</button>
          </div>
          <div class="stack-sm">
            ${sorted.map((p, i) => `
              <div class="card-warm row-between" style="padding:12px 14px;">
                <div class="row">
                  <strong class="mono" style="width:26px;">${i === 0 ? '👑' : `#${i + 1}`}</strong>
                  <span style="font-size:1.35rem;">${p.avatar}</span>
                  <div>
                    <strong>${esc(p.name)}</strong>
                    <div class="xs muted">${p.ageGroup === 'kid' ? 'Kid' : p.ageGroup === 'teen' ? 'Teen' : 'Adult'}</div>
                  </div>
                </div>
                <strong class="mono" style="font-size:1.2rem;color:var(--pumpkin);">${p.score} pts</strong>
              </div>
            `).join('')}
          </div>
          <div class="row-between">
            <button class="btn btn-sm" id="lb-reset">Reset Scores</button>
            <button class="btn btn-primary" id="lb-done">Done</button>
          </div>
        </div>
      </div>`;

    document.getElementById('modal-close').onclick = closeModal;
    document.getElementById('lb-done').onclick = closeModal;
    document.getElementById('modal-bg').onclick = (e) => { if (e.target.id === 'modal-bg') closeModal(); };
    document.getElementById('lb-reset').onclick = () => {
      resetScores();
      openLeaderboardModal();
      if (!currentGameKey) renderHub();
    };
  }

  function openSettingsModal() {
    const m = document.getElementById('modal-root');
    const cfg = LiveAI.loadSettings();
    m.innerHTML = `
      <div class="modal-backdrop" id="modal-bg">
        <div class="modal stack">
          <div class="row-between">
            <h2>⚙️ AI Engine Settings</h2>
            <button class="btn btn-sm" id="modal-close">✕</button>
          </div>
          <p class="small muted" style="margin:0;">All 6 games work <strong>100% out of the box</strong> with our Built-In Instant AI. Optionally connect a live AI key or live image generator below:</p>

          <div class="stack-sm">
            <label class="small"><strong>AI Judge & Bot Provider</strong></label>
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
              <div class="xs muted">When online on phones/laptops, generates real AI images for Prompt Clone & Prompt Panic (falls back to built-in Canvas Artist automatically if offline).</div>
            </div>
          </label>

          <button class="btn btn-primary btn-lg" id="ai-save">Save AI Settings</button>
        </div>
      </div>`;

    document.getElementById('modal-close').onclick = closeModal;
    document.getElementById('modal-bg').onclick = (e) => { if (e.target.id === 'modal-bg') closeModal(); };
    document.getElementById('ai-save').onclick = () => {
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
          SoundFX.ding();
          RoomSync.send({ type: 'JOIN', ...me });
          renderPhone();
        };
        return;
      }

      const myScore = (hostState.leaderboard || []).find(x => x.id === me.id)?.score ?? 0;
      const { game, phase, payload = {} } = hostState;
      let body = '';

      if (game === 'promptClone' && phase === 'writing') {
        const already = (payload.submittedIds || []).includes(me.id) || submittedKey === `clone_${payload.title}`;
        body = already ? `
          <div class="card center stack">
            <div style="font-size:3rem;">🔒✨</div>
            <h2>Prompt Locked In!</h2>
            <p class="small muted">Waiting for everyone else—get ready to see what the AI paints from your prompt!</p>
          </div>` : `
          <div class="card stack">
            <span class="tag tag-new">PROMPT CLONE · ${esc(payload.difficulty || '')}</span>
            <h2>🔍 Recreate the Target Image!</h2>
            <p class="small muted" style="margin:0;">Look at the Host screen! Hint: ${esc(payload.tips || '')}</p>
            ${payload.liveImageUrl ? `<div class="art-frame"><img src="${payload.liveImageUrl}" alt="Target" /></div>` : ''}
            <textarea class="textarea" id="p-clone-in" placeholder="Describe the subjects, setting, props, colors, weather, and art style..."></textarea>
            <div class="chip-wrap">
              ${['pixel art', 'neon', 'vintage', 'watercolor', 'ink sketch', 'sunset', 'outer space', 'sunglasses', 'crown', 'rainbow'].map(c =>
                `<button type="button" class="chip" data-pchip="${c}">+ ${c}</button>`).join('')}
            </div>
            <button class="btn btn-primary btn-lg" id="p-clone-send">🔒 Lock In My Prompt!</button>
          </div>`;
      } else if (game === 'spotTheBot' && phase === 'submit') {
        const already = (payload.submittedIds || []).includes(me.id) || submittedKey === `bot_${payload.question}`;
        body = already ? `
          <div class="card center stack">
            <div style="font-size:3rem;">🤖🔒</div>
            <h2>Answer Submitted!</h2>
            <p class="small muted">Get your finger ready—next up, race to spot the AI Bot!</p>
          </div>` : `
          <div class="card stack">
            <span class="tag tag-gold">SPOT THE BOT</span>
            <h3>"${esc(payload.question || '')}"</h3>
            <textarea class="textarea" id="p-bot-in" placeholder="Write your funniest or sneakiest answer..."></textarea>
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
            <span class="player-chip">${me.avatar} ${esc(me.name)} <span class="pts">${myScore} pts</span></span>
            <span class="tag mono">ROOM ${esc(roomCode)}</span>
          </div>
          ${body}
        </div>`;

      // Bind dynamic phone controller actions
      const pCloneIn = document.getElementById('p-clone-in');
      if (pCloneIn) {
        app.querySelectorAll('[data-pchip]').forEach(ch => {
          ch.onclick = () => { pCloneIn.value = (pCloneIn.value.trim() ? pCloneIn.value.trim() + ' ' : '') + ch.dataset.pchip; };
        });
        document.getElementById('p-clone-send').onclick = () => {
          const val = pCloneIn.value.trim();
          if (!val) return;
          submittedKey = `clone_${payload.title}`;
          SoundFX.ding();
          RoomSync.send({ type: 'ACTION', playerId: me.id, action: 'SUBMIT_CLONE_PROMPT', value: val });
          renderPhone();
        };
      }
      const pBotSend = document.getElementById('p-bot-send');
      if (pBotSend) {
        pBotSend.onclick = () => {
          const val = document.getElementById('p-bot-in').value.trim();
          if (!val) return;
          submittedKey = `bot_${payload.question}`;
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
            <button class="icon-pill" id="btn-leaderboard">🏆 Scores</button>
            <button class="icon-pill" id="btn-voice" title="Toggle AI Voice Host">🗣️ Voice</button>
            <button class="icon-pill" id="btn-sound" title="Mute Sound Effects">🔊</button>
            <button class="icon-pill" id="btn-ai" title="AI Settings">⚙️</button>
          </div>
        </header>
        <main id="stage"></main>
      </div>
      <div id="modal-root"></div>`;

    document.getElementById('btn-home').onclick = () => { SoundFX.pop(); openGame(null); };
    document.getElementById('btn-qr').onclick = openQRModal;
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

    updateTopbar();
    renderHub();
  }

  const publicApi = {
    getPlayers, addPlayer, removePlayer, addScore,
    getStage, broadcastHostState, openQRModal, openGame,
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  return publicApi;
})();
