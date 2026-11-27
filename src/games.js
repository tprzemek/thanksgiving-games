// All 6 Complete Playable Thanksgiving AI Games
// Each game supports: (1) Single-Device Pass-and-Play AND (2) Multi-Device QR Phone Controllers!

const Games = (() => {
  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const fmtTime = (sec) => {
    const s = Math.max(0, Math.ceil(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r < 10 ? '0' : ''}${r}`;
  };

  // =========================================================================
  // GAME 1: PROMPT CLONE! (Reverse-Engineer the AI Image — 3 Min Challenge)
  // =========================================================================
  function createPromptClone(App) {
    let idx = Math.floor(Math.random() * GAME_DATA.promptClone.challenges.length); // All 12 rounds have real studio AI target artworks!
    let phase = 'lobby'; // lobby | writing | collecting | pass_input | grading | results
    let durationSec = 180; // 3 minutes default!
    let timeLeft = 180;
    let timer = null;
    let collectTimer = null;
    let target = GAME_DATA.promptClone.challenges[idx];
    let roundId = 0;
    let customTargetImg = null; // Optional uploaded/custom image dataURL
    let customTargetThumb = null; // Compressed thumbnail for phone sync
    let customTargetUrl = null; // Uploaded direct URL for phone sync
    let customTargetDesc = '';
    let targetArt = null; // { dataUrl, canvas, parsed }
    let submissions = {}; // playerId -> { text, playerName, avatar, ts }
    let drafts = {};      // playerId -> { text, playerName, avatar, ts } (auto-saved while typing!)
    let passIdx = 0;
    let gradedResults = [];
    let gradingStatus = '';

    function cleanup() {
      if (timer) { clearInterval(timer); timer = null; }
      if (collectTimer) { clearTimeout(collectTimer); collectTimer = null; }
      SoundFX.stopSpeech();
    }

    function buildTarget() {
      if (customTargetImg) {
        targetArt = { dataUrl: customTargetImg, canvas: null, parsed: AIArt.parsePrompt(customTargetDesc || target.secretPrompt) };
      } else {
        targetArt = AIArt.renderDataURL(target.secretPrompt, 440, 300);
      }
    }

    function makeThumb(dataUrl, maxW = 640, quality = 0.78) {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          const scale = Math.min(1, maxW / (img.width || maxW));
          c.width = Math.max(1, Math.round((img.width || maxW) * scale));
          c.height = Math.max(1, Math.round((img.height || Math.round(maxW * 0.72)) * scale));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(null);
        img.src = dataUrl;
      });
    }

    function getTargetImageHtml() {
      if (customTargetImg) {
        return `<img src="${customTargetImg}" alt="Target AI Image" />`;
      }
      if (target.asset) {
        return `<img src="${target.asset}" alt="Target AI Image" onerror="this.src='${targetArt.dataUrl}'" />`;
      }
      return `<img src="${targetArt.dataUrl}" alt="Target AI Image" />`;
    }

    function toCompactResult(r, i) {
      const item = {
        rk: i,
        id: r.player.id,
        n: String(r.player.name || 'Player').slice(0, 18),
        av: r.player.avatar || '🦃',
        p: String(r.prompt || '').slice(0, 140),
        s: r.score,
        pts: r.pointsAwarded,
        c: String(r.comment || '').slice(0, 80),
        src: r.imgSource || 'builtin',
      };
      const directUrl = r.sharedUrl || r.aiUrl || null;
      if (directUrl) item.url = directUrl;
      else if (r.aiDataUrl) item.k = `res_${roundId}_${r.player.id}`;
      if (r.autoCollected) item.auto = 1;
      return item;
    }

    let resultsUrl = null; // Atomic hosted JSON containing ALL ranked participants + direct image URLs

    function broadcastPhoneState() {
      // Embed results directly in HOST_STATE only if <= 3 players (keeps packet safely < 1.6KB for ntfy.sh!)
      const inlineResults = (phase === 'results' && gradedResults.length <= 3)
        ? gradedResults.map((r, i) => toCompactResult(r, i))
        : null;

      App.broadcastHostState('promptClone', phase, {
        roundId,
        challengeId: customTargetImg ? null : target.id,
        asset: customTargetImg ? (customTargetUrl || null) : (target.asset || null),
        hasCustomTarget: !!customTargetImg,
        title: customTargetImg ? 'Custom Target Image' : target.title,
        tips: customTargetImg ? 'Study every object, color, setting, and style in this image!' : target.tips,
        difficulty: customTargetImg ? 'Custom' : target.difficulty,
        timeLeft,
        submittedIds: Object.keys(submissions),
        gradingStatus,
        originalPrompt: phase === 'results' ? (customTargetImg ? (customTargetDesc || 'Custom Image') : target.secretPrompt) : null,
        totalResults: phase === 'results' ? gradedResults.length : 0,
        resultsUrl: phase === 'results' ? resultsUrl : null,
        results: inlineResults,
      });
    }

    async function broadcastResultsToPhones() {
      // If atomic resultsUrl upload succeeded, phones fetch ALL ranked results in 1 GET request from HOST_STATE!
      // Only fall back to CLONE_RESULTS_BATCH streaming if resultsUrl wasn't available (e.g. BroadcastChannel).
      if (!resultsUrl) {
        const BATCH = 3;
        const compactAll = gradedResults.map((r, i) => toCompactResult(r, i));
        for (let i = 0; i < compactAll.length; i += BATCH) {
          await RoomSync.send({
            type: 'CLONE_RESULTS_BATCH',
            roundId,
            items: compactAll.slice(i, i + BATCH),
          });
          if (RoomSync.getMode() === 'cloud' && i + BATCH < compactAll.length) {
            await new Promise(r => setTimeout(r, 320));
          }
        }
      }
      // Only chunk fallback images that didn't get a direct sharedUrl
      for (let i = 0; i < gradedResults.length; i++) {
        const r = gradedResults[i];
        if (r.aiDataUrl && !r.sharedUrl && !r.aiUrl) {
          const imgKey = `res_${roundId}_${r.player.id}`;
          const thumb = await makeThumb(r.aiDataUrl, 340, 0.62);
          if (thumb) await RoomSync.sendImage(imgKey, thumb);
        }
      }
    }

    function ensureGuestPlayer(msg) {
      let p = App.getPlayers().find(x => x.id === msg.playerId);
      if (!p) {
        p = App.addPlayer({
          id: msg.playerId,
          name: msg.playerName || 'Guest',
          ageGroup: msg.ageGroup || 'adult',
          avatar: msg.avatar || '🦃',
          remote: true,
        });
      }
      return p;
    }

    function onPhoneAction(msg) {
      if (phase !== 'writing' && phase !== 'collecting') return;
      if (msg.action === 'CLONE_DRAFT' && msg.playerId && typeof msg.value === 'string') {
        const clean = msg.value.trim();
        if (!clean) { delete drafts[msg.playerId]; return; }
        const p = ensureGuestPlayer(msg);
        drafts[msg.playerId] = {
          text: clean,
          playerName: p ? p.name : (msg.playerName || 'Guest'),
          avatar: p ? p.avatar : (msg.avatar || '🦃'),
          ts: Date.now(),
        };
        if (phase === 'writing') render();
        return;
      }
      if (msg.action === 'SUBMIT_CLONE_PROMPT' && msg.playerId && msg.value) {
        const clean = String(msg.value).trim();
        if (!clean) return;
        const p = ensureGuestPlayer(msg);
        submissions[msg.playerId] = {
          text: clean,
          playerName: p ? p.name : (msg.playerName || 'Guest'),
          avatar: p ? p.avatar : (msg.avatar || '🦃'),
          autoCollected: !!msg.autoCollected,
          ts: Date.now(),
        };
        delete drafts[msg.playerId];
        if (phase === 'writing') {
          SoundFX.pop();
          broadcastPhoneState();
          render();
        }
      }
    }

    async function startWriting() {
      buildTarget();
      roundId = Date.now();
      submissions = {};
      drafts = {};
      gradedResults = [];
      resultsUrl = null;
      timeLeft = durationSec;
      phase = 'writing';
      if (customTargetImg && customTargetThumb && !customTargetUrl) {
        customTargetUrl = await RoomSync.uploadImage(customTargetThumb);
      }
      SoundFX.ding();
      SoundFX.speak(`Prompt Clone! Study the image carefully. You have ${Math.round(durationSec / 60)} minutes to write an AI prompt that recreates it as closely as possible!`);
      broadcastPhoneState();
      if (customTargetImg && customTargetThumb && !customTargetUrl) {
        RoomSync.sendImage(`target_${roundId}`, customTargetThumb);
      }
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 10 && timeLeft > 0) SoundFX.tick(0.7);
        if (timeLeft <= 0) {
          clearInterval(timer); timer = null;
          beginCollectAndGrade();
          return;
        }
        const el = document.getElementById('clone-timer');
        if (el) {
          el.textContent = fmtTime(timeLeft);
          if (timeLeft <= 15) el.classList.add('urgent');
        }
      }, 1000);
      render();
    }

    // Auto-collect every participant's typed draft (even if they didn't press Lock In!) before grading
    function beginCollectAndGrade() {
      if (timer) { clearInterval(timer); timer = null; }
      if (collectTimer) { clearTimeout(collectTimer); collectTimer = null; }
      phase = 'collecting';
      gradingStatus = '⏱️ Time\'s up! Auto-collecting everyone\'s typed prompts (even if they didn\'t tap Lock In)...';
      SoundFX.buzzer();
      broadcastPhoneState();
      render();

      collectTimer = setTimeout(() => {
        collectTimer = null;
        // Merge any auto-saved drafts that weren't explicitly locked in!
        for (const [pid, d] of Object.entries(drafts)) {
          if (!submissions[pid] && d && d.text) {
            submissions[pid] = { ...d, autoCollected: true };
          }
        }
        const total = Object.values(submissions).filter(s => s && s.text).length;
        if (total === 0) {
          phase = 'writing';
          gradingStatus = 'No prompts typed yet — type at least one prompt to generate images!';
          broadcastPhoneState();
          render();
          return;
        }
        gradeAll();
      }, 2000);
    }

    async function assetToThumbDataUrl(assetPath) {
      if (!assetPath) return null;
      try {
        const res = await fetch(assetPath);
        if (!res.ok) return null;
        const blob = await res.blob();
        const raw = await new Promise((resolve) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result);
          fr.onerror = () => resolve(null);
          fr.readAsDataURL(blob);
        });
        return raw ? await makeThumb(raw, 420, 0.72) : null;
      } catch (_) {
        return null;
      }
    }

    async function gradeAll() {
      if (timer) { clearInterval(timer); timer = null; }
      phase = 'grading';
      gradingStatus = 'Preparing Google Nano Banana AI generation & visual grading...';
      broadcastPhoneState();
      render();

      const liveCfg = LiveAI.loadSettings();
      const refPrompt = customTargetImg ? (customTargetDesc || target.secretPrompt) : target.secretPrompt;
      const players = App.getPlayers();
      const entries = Object.entries(submissions).filter(([, sub]) => sub && sub.text);

      // Prepare target thumbnail for Gemini Vision side-by-side grading when Gemini key is set
      let targetVisionDataUrl = null;
      if (liveCfg.provider === 'gemini' && liveCfg.apiKey) {
        targetVisionDataUrl = customTargetImg
          ? await makeThumb(customTargetImg, 420, 0.72)
          : await assetToThumbDataUrl(target.asset);
      }

      const results = new Array(entries.length);
      let completedCount = 0;
      let aiWarning = '';

      async function processOne(i) {
        const [pid, sub] = entries[i];
        const p = players.find(x => x.id === pid) || {
          id: pid,
          name: sub.playerName || 'Player',
          avatar: sub.avatar || '🦃',
        };
        const gen = AIArt.renderDataURL(sub.text, 440, 300);

        // 1. Generate real AI image (Google Nano Banana / OpenAI DALL-E 3 / Pollinations)
        const aiImg = await LiveAI.generateImage(sub.text, idx * 31 + p.name.length + i);
        if (aiImg.error && !aiWarning) aiWarning = aiImg.error;

        // 2. Upload crisp JPEG of any generated AI image in 1 single HTTP request so ALL 10+ phones see EVERY player's real Nano Banana image!
        let sharedUrl = aiImg.url || null;
        if (!sharedUrl && aiImg.dataUrl) {
          const hiRes = await makeThumb(aiImg.dataUrl, 640, 0.78);
          if (hiRes) {
            sharedUrl = await RoomSync.uploadImage(hiRes);
          }
        }

        // 3. Grade resemblance (Gemini Vision side-by-side comparison if Nano Banana succeeded, else LLM/built-in)
        let grade = AIArt.gradeCloneSubmission(refPrompt, sub.text, targetArt?.canvas, gen.canvas);
        if (liveCfg.provider === 'gemini' && liveCfg.apiKey && targetVisionDataUrl && aiImg.dataUrl) {
          const playerThumb = await makeThumb(aiImg.dataUrl, 420, 0.72);
          const vis = await LiveAI.gradeImagesWithVision(targetVisionDataUrl, playerThumb, refPrompt, sub.text, p.name);
          if (vis && typeof vis.score === 'number') {
            grade.score = Math.max(5, Math.min(100, Math.round(vis.score)));
            if (vis.comment) grade.comment = vis.comment;
          }
        } else if (liveCfg.apiKey && liveCfg.provider !== 'builtin') {
          const llm = await LiveAI.askJSON(
            'You are a witty AI art judge for a family Thanksgiving Prompt Clone game. Compare the target image description to the player\'s prompt and grade resemblance 0-100.',
            `Original target image prompt: "${refPrompt}"\nPlayer "${p.name}" wrote: "${sub.text}"\nReturn JSON: {"score": number 0-100, "comment": "1 funny sentence of praise/roast"}`
          );
          if (llm && typeof llm.score === 'number') {
            grade.score = Math.max(5, Math.min(100, Math.round(llm.score)));
            if (llm.comment) grade.comment = llm.comment;
          }
        }

        results[i] = {
          player: p,
          prompt: sub.text,
          dataUrl: gen.dataUrl,
          aiUrl: aiImg.url,
          aiDataUrl: aiImg.dataUrl,
          sharedUrl,
          imgSource: aiImg.source,
          autoCollected: !!sub.autoCollected,
          ...grade,
        };

        completedCount++;
        gradingStatus = `🍌 Generated ${completedCount}/${entries.length} AI images (${p.name} done!)...`;
        broadcastPhoneState();
        const stEl = document.getElementById('clone-grading-status');
        if (stEl) stEl.textContent = gradingStatus;
      }

      // Run 3 in parallel so 10 Nano Banana images complete ~3x faster!
      const CONCURRENCY = 3;
      for (let start = 0; start < entries.length; start += CONCURRENCY) {
        const slice = [];
        for (let j = start; j < Math.min(entries.length, start + CONCURRENCY); j++) {
          slice.push(processOne(j));
        }
        await Promise.all(slice);
      }

      results.sort((a, b) => b.score - a.score);
      gradedResults = results;
      gradedResults._warning = aiWarning;

      results.forEach((r, rank) => {
        const bonus = rank === 0 ? 100 : rank === 1 ? 50 : 0;
        const pts = Math.round(r.score * 2) + bonus;
        r.pointsAwarded = pts;
        App.addScore(r.player.id, pts);
      });

      // Upload ONE atomic JSON containing ALL ranked participants + full prompts + direct Nano Banana image URLs!
      const fullPayload = {
        roundId,
        items: results.map((r, i) => ({
          ...toCompactResult(r, i),
          p: r.prompt || '',
          c: r.comment || '',
          bd: (r.breakdown || []).slice(0, 6),
        })),
      };
      resultsUrl = await RoomSync.uploadJSON(fullPayload, `results_${roundId}.json`);

      phase = 'results';
      gradingStatus = '';
      SoundFX.fanfare();
      if (results.length > 0) {
        SoundFX.speak(`Grading complete! ${results[0].player.name} wins with a ${results[0].score} percent match!`);
      }
      broadcastPhoneState();
      render();
      broadcastResultsToPhones();
    }

    function render() {
      const root = App.getStage();
      const players = App.getPlayers();
      if (!targetArt) buildTarget();
      const targetImgHtml = getTargetImageHtml();
      const aiImgLabel = LiveAI.getActiveImageLabel();

      if (phase === 'lobby') {
        root.innerHTML = `
          <div class="stack fade-in">
            <div class="row-between">
              <div>
                <div class="row"><span class="tag tag-new">NEW · REVERSE PROMPT</span><span class="tag">${esc(target.difficulty)}</span></div>
                <h2 style="margin-top:6px;">🔍 Prompt Clone!</h2>
                <p class="muted small" style="margin:0;">Every player sees the target image right on their phone, writes a prompt to recreate it, then everyone gets the AI-generated results gallery on their own screen!</p>
              </div>
              <button class="btn btn-sm" id="clone-next-scene">🎲 New Image</button>
            </div>

            <div class="card stack">
              <div class="row-between">
                <h3>Target Image: ${esc(target.title)}</h3>
                <span class="tag ${LiveAI.hasRealImageAI() ? 'tag-kid' : 'tag-gold'}">🤖 ${esc(aiImgLabel)}</span>
              </div>
              <div class="art-frame">${targetImgHtml}</div>
              <div class="row-between">
                <div class="row">
                  <label class="small"><strong>Timer:</strong></label>
                  <button class="btn btn-sm ${durationSec === 60 ? 'btn-primary' : ''}" data-dur="60">1 min</button>
                  <button class="btn btn-sm ${durationSec === 120 ? 'btn-primary' : ''}" data-dur="120">2 min</button>
                  <button class="btn btn-sm ${durationSec === 180 ? 'btn-primary' : ''}" data-dur="180">3 min</button>
                </div>
                <button class="btn btn-primary btn-lg" id="clone-start">🚀 Start Challenge!</button>
              </div>
              ${!LiveAI.hasRealImageAI() ? `
                <div class="card-warm row-between" style="padding:10px 12px;">
                  <span class="xs muted">✨ Want <strong>photorealistic AI images</strong> generated for every participant's prompt? Connect a free Gemini, OpenAI, or Pollinations key!</span>
                  <button class="btn btn-sm" id="clone-open-ai">⚙️ Connect AI</button>
                </div>
              ` : ''}
            </div>

            <div class="card-warm stack-sm">
              <div class="row-between">
                <strong class="small">Optional: Use Your Own AI Image / Photo</strong>
                <input type="file" id="clone-upload" accept="image/*" style="max-width:220px;font-size:0.82rem;" />
              </div>
              <input class="input" id="clone-custom-desc" placeholder="(Optional) Describe key elements in your uploaded image for AI grading..." value="${esc(customTargetDesc)}" />
            </div>
          </div>`;

        const aiBtn = document.getElementById('clone-open-ai');
        if (aiBtn) aiBtn.onclick = () => App.openSettingsModal && App.openSettingsModal();

        document.getElementById('clone-next-scene').onclick = () => {
          customTargetImg = null;
          customTargetThumb = null;
          customTargetUrl = null;
          idx = (idx + 1) % GAME_DATA.promptClone.challenges.length;
          target = GAME_DATA.promptClone.challenges[idx];
          buildTarget();
          SoundFX.pop();
          render();
        };
        root.querySelectorAll('[data-dur]').forEach(b => {
          b.onclick = () => { durationSec = Number(b.dataset.dur); render(); };
        });
        document.getElementById('clone-upload').onchange = (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const reader = new FileReader();
          reader.onload = async () => {
            customTargetImg = reader.result;
            customTargetUrl = null;
            buildTarget();
            customTargetThumb = await makeThumb(customTargetImg);
            render();
          };
          reader.readAsDataURL(f);
        };
        document.getElementById('clone-custom-desc').oninput = (e) => { customTargetDesc = e.target.value; };
        document.getElementById('clone-start').onclick = startWriting;
        return;
      }

      if (phase === 'writing') {
        const subCount = Object.keys(submissions).length;
        const draftOnlyCount = Object.keys(drafts).filter(pid => !submissions[pid] && drafts[pid]?.text).length;
        const readyCount = subCount + draftOnlyCount;
        const missing = players.filter(p => !submissions[p.id]);
        root.innerHTML = `
          <div class="stack fade-in">
            <div class="row-between">
              <div>
                <h2>🔍 Recreate This Image!</h2>
                <p class="muted small" style="margin:0;">Hint: ${esc(target.tips)} · <em>Typed drafts auto-submit when time runs out!</em></p>
              </div>
              <div class="timer-box ${timeLeft <= 15 ? 'urgent' : ''}" id="clone-timer">${fmtTime(timeLeft)}</div>
            </div>

            <div class="art-frame" style="max-width:560px;">${targetImgHtml}</div>

            ${gradingStatus ? `<div class="card-warm small center" style="color:var(--pumpkin);font-weight:600;">${esc(gradingStatus)}</div>` : ''}

            <div class="card stack">
              <div class="row-between">
                <h3>Submissions (${subCount}/${players.length}${draftOnlyCount ? ` · ${draftOnlyCount} typing` : ''})</h3>
                <button class="btn btn-sm" id="clone-qr-open">📱 Join via QR</button>
              </div>
              <div class="roster-bar">
                ${players.map(p => {
                  const done = !!submissions[p.id];
                  const typing = !done && !!drafts[p.id]?.text;
                  const style = done
                    ? 'background:var(--sage-soft);border-color:var(--sage);'
                    : typing
                    ? 'background:var(--gold-soft);border-color:var(--gold);'
                    : '';
                  return `<span class="player-chip" style="${style}">
                    ${p.avatar} ${esc(p.name)} <strong>${done ? '✓ Locked In' : typing ? '✍️ Typing…' : '…'}</strong>
                  </span>`;
                }).join('')}
              </div>

              <div class="divider"></div>
              <div class="stack-sm">
                <strong class="small">Pass-the-Phone / Single Device Entry:</strong>
                <div class="row">
                  <select class="select" id="clone-local-player" style="max-width:210px;">
                    ${players.map(p => `<option value="${p.id}">${p.avatar} ${esc(p.name)} ${submissions[p.id] ? '(Update)' : drafts[p.id]?.text ? '(Draft)' : ''}</option>`).join('')}
                  </select>
                  <button class="btn btn-primary" id="clone-pass-enter">✍️ Type Secret Prompt</button>
                </div>
              </div>
            </div>

            <div class="row-between">
              <button class="btn" id="clone-cancel">← Back</button>
              <button class="btn btn-success btn-lg" id="clone-grade-now">
                ✨ Collect All &amp; Generate Images (${readyCount || subCount})
              </button>
            </div>
          </div>`;

        // Auto-select first player who hasn't submitted yet
        if (missing.length > 0) {
          const sel = document.getElementById('clone-local-player');
          if (sel) sel.value = missing[0].id;
        }

        document.getElementById('clone-qr-open').onclick = () => App.openQRModal();
        document.getElementById('clone-cancel').onclick = () => { cleanup(); gradingStatus = ''; phase = 'lobby'; broadcastPhoneState(); render(); };
        document.getElementById('clone-grade-now').onclick = beginCollectAndGrade;
        document.getElementById('clone-pass-enter').onclick = () => {
          const pid = document.getElementById('clone-local-player').value;
          passIdx = Math.max(0, players.findIndex(p => p.id === pid));
          phase = 'pass_input';
          render();
        };
        return;
      }

      if (phase === 'pass_input') {
        const p = players[passIdx] || players[0];
        const existing = submissions[p.id]?.text || drafts[p.id]?.text || '';
        root.innerHTML = `
          <div class="stack fade-in">
            <div class="row-between">
              <h2>${p.avatar} ${esc(p.name)}'s Secret Prompt</h2>
              <div class="timer-box ${timeLeft <= 15 ? 'urgent' : ''}" id="clone-timer">${fmtTime(timeLeft)}</div>
            </div>
            <div class="art-frame" style="max-width:420px;">${targetImgHtml}</div>
            <div class="card stack">
              <label class="small"><strong>Describe everything you see</strong> (subjects, setting, props, colors, weather, art style!):</label>
              <textarea class="textarea" id="clone-prompt-box" placeholder="Example: A turkey wearing sunglasses riding a skateboard at sunset with falling leaves...">${esc(existing)}</textarea>
              <div class="chip-wrap">
                ${['pixel art', 'neon', 'vintage', 'watercolor', 'ink sketch', 'sunset', 'outer space', 'snowy mountains', 'sunglasses', 'crown', 'rainbow', 'fireworks'].map(c =>
                  `<button type="button" class="chip" data-chip="${c}">+ ${c}</button>`
                ).join('')}
              </div>
              <div class="row-between">
                <button class="btn" id="clone-back-writing">Cancel</button>
                <button class="btn btn-primary btn-lg" id="clone-lock-in">🔒 Lock In Prompt</button>
              </div>
            </div>
          </div>`;

        const box = document.getElementById('clone-prompt-box');
        const saveLocalDraft = () => {
          const v = box.value.trim();
          if (v) drafts[p.id] = { text: v, playerName: p.name, avatar: p.avatar, ts: Date.now() };
          else delete drafts[p.id];
        };
        box.oninput = saveLocalDraft;
        root.querySelectorAll('[data-chip]').forEach(ch => {
          ch.onclick = () => {
            box.value = (box.value.trim() ? box.value.trim() + ' ' : '') + ch.dataset.chip;
            saveLocalDraft();
            box.focus();
          };
        });
        document.getElementById('clone-back-writing').onclick = () => { phase = 'writing'; render(); };
        document.getElementById('clone-lock-in').onclick = () => {
          const val = box.value.trim();
          if (!val) return;
          submissions[p.id] = { text: val, playerName: p.name, avatar: p.avatar, ts: Date.now() };
          delete drafts[p.id];
          SoundFX.pop();
          phase = 'writing';
          broadcastPhoneState();
          render();
        };
        return;
      }

      if (phase === 'collecting') {
        root.innerHTML = `
          <div class="card center stack" style="padding:48px 20px;">
            <div style="font-size:3.2rem;">⏱️📥</div>
            <h2>Time's Up! Auto-Collecting All Prompts...</h2>
            <p class="muted">${esc(gradingStatus || 'Grabbing every participant\'s typed draft — even if they didn\'t press Lock In!')}</p>
          </div>`;
        return;
      }

      if (phase === 'grading') {
        root.innerHTML = `
          <div class="card center stack" style="padding:48px 20px;">
            <div style="font-size:3.2rem;">🤖🎨</div>
            <h2>AI is Regenerating Everyone's Images &amp; Grading...</h2>
            <p class="muted" id="clone-grading-status">${esc(gradingStatus || 'Comparing subjects, composition, palette, props, and art style!')}</p>
          </div>`;
        return;
      }

      if (phase === 'results') {
        root.innerHTML = `
          <div class="stack fade-in">
            <div class="row-between">
              <div>
                <h2>🏆 Prompt Clone Results!</h2>
                <p class="muted small" style="margin:0;">Original secret prompt: <strong>"${esc(customTargetImg ? (customTargetDesc || 'Custom Image') : target.secretPrompt)}"</strong></p>
              </div>
              <div class="row">
                <button class="btn btn-sm" id="clone-resend">📱 Resend to Phones</button>
                <button class="btn btn-primary" id="clone-play-again">Next Round →</button>
              </div>
            </div>

            <div class="card-warm stack-sm">
              <div class="row-between">
                <strong>🎯 Original Target Image</strong>
                <span class="tag tag-gold">All ${gradedResults.length} ranked results sent to every phone!</span>
              </div>
              <div class="art-frame" style="max-width:420px;">${targetImgHtml}</div>
            </div>

            ${gradedResults._warning ? `
              <div class="card small" style="border-color:var(--cranberry);color:var(--cranberry);">
                <strong>⚠️ AI Image Notice:</strong> ${esc(gradedResults._warning)} — fell back to Built-In Instant Artist for this round. Check your key &amp; billing in <strong>⚙️ Settings</strong>!
              </div>
            ` : ''}

            <div class="clone-gallery">
              ${gradedResults.map((r, i) => {
                const imgSrc = r.aiDataUrl || r.sharedUrl || r.aiUrl || r.dataUrl;
                const badge = r.imgSource === 'banana' ? '🍌 Nano Banana' : r.imgSource === 'openai' ? 'DALL-E 3' : r.imgSource === 'gemini' ? 'Gemini AI' : r.imgSource === 'pollinations' ? 'Pollinations AI' : 'Instant AI';
                return `
                <div class="clone-card ${i === 0 ? 'winner' : ''}">
                  <div class="art-frame" style="border:none;border-radius:0;">
                    <img src="${imgSrc}" alt="${esc(r.player.name)}'s AI image" onerror="this.src='${r.dataUrl}'" />
                  </div>
                  <div class="clone-card-body">
                    <div class="row-between">
                      <strong>${i === 0 ? '👑 ' : `#${i + 1} `}${r.player.avatar} ${esc(r.player.name)}</strong>
                      <span class="mono" style="font-weight:800;font-size:1.15rem;color:${r.score >= 70 ? 'var(--sage)' : 'var(--pumpkin)'};">${r.score}% Match</span>
                    </div>
                    <div class="meter-track"><div class="meter-fill" style="width:${r.score}%;background:${r.score >= 75 ? 'var(--sage)' : r.score >= 50 ? 'var(--gold)' : 'var(--cranberry)'};"></div></div>
                    <p class="small" style="margin:0;background:var(--surface-alt);padding:8px 10px;border-radius:8px;"><em>"${esc(r.prompt)}"</em></p>
                    <div class="chip-wrap">
                      <span class="tag tag-gold">🎨 ${badge}</span>
                      ${r.autoCollected ? `<span class="tag">⏱️ Auto-saved</span>` : ''}
                      ${r.breakdown.map(b => `<span class="tag" style="background:${b.hit ? 'var(--sage-soft)' : b.partial ? 'var(--gold-soft)' : '#F9E5E5'};color:${b.hit ? 'var(--sage)' : b.partial ? '#7C5006' : 'var(--cranberry)'};">${b.hit ? '✓' : b.partial ? '~' : '✗'} ${esc(b.label)}</span>`).join('')}
                    </div>
                    <p class="xs muted" style="margin:0;">🤖 <strong>AI Critic:</strong> ${esc(r.comment)} <strong style="color:var(--pumpkin);">+${r.pointsAwarded} pts</strong></p>
                  </div>
                </div>`;
              }).join('')}
            </div>
          </div>`;

        document.getElementById('clone-resend').onclick = () => {
          SoundFX.pop();
          broadcastPhoneState();
          broadcastResultsToPhones();
          document.getElementById('clone-resend').textContent = '✅ Sent to Phones!';
        };
        document.getElementById('clone-play-again').onclick = () => {
          customTargetImg = null;
          customTargetThumb = null;
          customTargetUrl = null;
          drafts = {};
          gradingStatus = '';
          idx = (idx + 1) % GAME_DATA.promptClone.challenges.length;
          target = GAME_DATA.promptClone.challenges[idx];
          buildTarget();
          phase = 'lobby';
          broadcastPhoneState();
          render();
        };
      }
    }

    buildTarget();
    return { render, cleanup, onPhoneAction };
  }

  // =========================================================================
  // GAME 2: TURKEY COURT (AI Judge & Live Plot-Twist Improv)
  // =========================================================================
  function createTurkeyCourt(App) {
    let phase = 'setup'; // setup | defend | verdict
    let caseItem = pick(GAME_DATA.turkeyCourt.cases);
    let contenders = [];
    let turnIdx = 0;
    let timeLeft = 25;
    let timer = null;
    let twistDropped = false;
    let currentTwist = '';
    let notes = ['', ''];
    let votes = {}; // voterId -> 0 | 1
    let verdicts = null;
    let micRec = null;

    function cleanup() {
      if (timer) { clearInterval(timer); timer = null; }
      if (micRec) { try { micRec.stop(); } catch (_) {} micRec = null; }
      SoundFX.stopSpeech();
    }

    function initContenders() {
      const ps = shuffle(App.getPlayers());
      contenders = ps.length >= 2 ? [ps[0], ps[1]] : [ps[0], ps[0]];
    }

    function broadcast() {
      App.broadcastHostState('turkeyCourt', phase, {
        caseTitle: caseItem.title,
        charge: caseItem.charge,
        contenders: contenders.map(c => ({ id: c.id, name: c.name, avatar: c.avatar })),
        activeIdx: turnIdx,
        twist: twistDropped ? currentTwist : null,
      });
    }

    function onPhoneAction(msg) {
      if (msg.action === 'COURT_VOTE' && (msg.value === 0 || msg.value === 1)) {
        votes[msg.playerId] = msg.value;
        SoundFX.pop();
        if (phase === 'defend') render();
      }
      if (msg.action === 'COURT_TWIST' && phase === 'defend' && !twistDropped) {
        dropTwist();
      }
    }

    function dropTwist() {
      if (twistDropped) return;
      twistDropped = true;
      currentTwist = pick(GAME_DATA.turkeyCourt.twists);
      SoundFX.gavel();
      SoundFX.speak(currentTwist);
      broadcast();
      render();
    }

    function startDefense(idxTurn) {
      cleanup();
      turnIdx = idxTurn;
      timeLeft = 25;
      twistDropped = false;
      currentTwist = '';
      phase = 'defend';
      SoundFX.gavel();
      SoundFX.speak(`${contenders[turnIdx].name}, approach the bench! ${caseItem.charge}`);
      broadcast();
      timer = setInterval(() => {
        timeLeft--;
        if (timeLeft === 12 && !twistDropped) dropTwist();
        if (timeLeft <= 5 && timeLeft > 0) SoundFX.tick(0.8);
        if (timeLeft <= 0) {
          clearInterval(timer); timer = null;
          SoundFX.buzzer();
          render();
          return;
        }
        const el = document.getElementById('court-timer');
        if (el) {
          el.textContent = fmtTime(timeLeft);
          if (timeLeft <= 6) el.classList.add('urgent');
        }
      }, 1000);
      render();
    }

    async function judgeCase() {
      cleanup();
      const voteCounts = [0, 0];
      Object.values(votes).forEach(v => { if (v === 0 || v === 1) voteCounts[v]++; });

      const scoreLocal = (text, vCount) => {
        const words = (text || '').trim().split(/\s+/).filter(Boolean).length;
        const base = words > 4 ? 7 : 6;
        const creativity = Math.min(10, base + Math.floor(Math.random() * 4));
        const logic = Math.min(10, 5 + Math.floor(Math.random() * 5) + (words > 8 ? 1 : 0));
        const recovery = Math.min(10, 6 + Math.floor(Math.random() * 4) + (vCount > 0 ? 1 : 0));
        return { creativity, logic, recovery, total: creativity + logic + recovery + vCount * 2 };
      };

      const s0 = scoreLocal(notes[0], voteCounts[0]);
      const s1 = scoreLocal(notes[1], voteCounts[1]);
      let ruling = s0.total >= s1.total
        ? `Order in the dining room! ${contenders[0].name}'s defense was gloriously unhinged and somehow convinced the Grand Turkey!`
        : `Case dismissed in favor of ${contenders[1].name}! That plot-twist recovery belongs in Thanksgiving law school!`;

      // Optional Live LLM Judge upgrade
      const live = await LiveAI.askJSON(
        'You are the dramatic, funny Grand Turkey Judge at a family Thanksgiving dinner.',
        `Case: ${caseItem.charge}\nTwist: ${currentTwist}\n${contenders[0].name} argued: "${notes[0] || '(Spoken aloud with passion!)'}"\n${contenders[1].name} argued: "${notes[1] || '(Spoken aloud with passion!)'}"\nReturn JSON: {"ruling":"2 funny sentences","winnerIndex":0 or 1}`
      );
      if (live && live.ruling) {
        ruling = live.ruling;
        if (live.winnerIndex === 0 && s0.total <= s1.total) s0.total = s1.total + 2;
        if (live.winnerIndex === 1 && s1.total <= s0.total) s1.total = s0.total + 2;
      }

      const winnerIdx = s0.total >= s1.total ? 0 : 1;
      App.addScore(contenders[winnerIdx].id, 250);
      if (contenders[0].id !== contenders[1].id) {
        App.addScore(contenders[1 - winnerIdx].id, 100);
      }

      verdicts = { scores: [s0, s1], voteCounts, winnerIdx, ruling };
      phase = 'verdict';
      SoundFX.fanfare();
      SoundFX.speak(ruling);
      broadcast();
      render();
    }

    function render() {
      const root = App.getStage();
      const players = App.getPlayers();
      if (!contenders.length) initContenders();

      if (phase === 'setup') {
        root.innerHTML = `
          <div class="stack fade-in">
            <div class="row-between">
              <div>
                <h2>⚖️ Turkey Court</h2>
                <p class="muted small" style="margin:0;">Two defendants get 25 seconds to argue their case—while the AI Judge slams a live mid-speech OBJECTION plot twist!</p>
              </div>
              <button class="btn btn-sm" id="court-new-case">🎲 New Case</button>
            </div>

            <div class="card stack">
              <span class="tag tag-gold">CASE ON THE DOCKET</span>
              <h3>${esc(caseItem.title)}</h3>
              <p style="font-size:1.1rem;margin:0;">${esc(caseItem.charge)}</p>
              <div class="divider"></div>
              <div class="grid-2">
                <div>
                  <label class="xs muted"><strong>Defendant #1</strong></label>
                  <select class="select" id="court-p0">
                    ${players.map(p => `<option value="${p.id}" ${p.id === contenders[0]?.id ? 'selected' : ''}>${p.avatar} ${esc(p.name)}</option>`).join('')}
                  </select>
                </div>
                <div>
                  <label class="xs muted"><strong>Defendant #2</strong></label>
                  <select class="select" id="court-p1">
                    ${players.map(p => `<option value="${p.id}" ${p.id === contenders[1]?.id ? 'selected' : ''}>${p.avatar} ${esc(p.name)}</option>`).join('')}
                  </select>
                </div>
              </div>
              <button class="btn btn-primary btn-lg" id="court-begin">⚖️ Bang the Gavel & Start!</button>
            </div>
          </div>`;

        document.getElementById('court-new-case').onclick = () => { caseItem = pick(GAME_DATA.turkeyCourt.cases); SoundFX.pop(); render(); };
        document.getElementById('court-begin').onclick = () => {
          const p0 = players.find(p => p.id === document.getElementById('court-p0').value) || players[0];
          const p1 = players.find(p => p.id === document.getElementById('court-p1').value) || players[1] || players[0];
          contenders = [p0, p1];
          notes = ['', ''];
          votes = {};
          startDefense(0);
        };
        return;
      }

      if (phase === 'defend') {
        const cur = contenders[turnIdx];
        root.innerHTML = `
          <div class="stack fade-in">
            <div class="row-between">
              <div>
                <span class="tag">DEFENDANT ${turnIdx + 1} OF 2</span>
                <h2 style="margin-top:4px;">${cur.avatar} ${esc(cur.name)} Takes the Stand!</h2>
              </div>
              <div class="timer-box ${timeLeft <= 6 ? 'urgent' : ''}" id="court-timer">${fmtTime(timeLeft)}</div>
            </div>

            <div class="card stack">
              <strong>Case: ${esc(caseItem.title)}</strong>
              <p style="margin:0;">${esc(caseItem.charge)}</p>
              ${twistDropped
                ? `<div class="twist-banner">⚖️ ${esc(currentTwist)}</div>`
                : `<button class="btn btn-danger" id="court-drop-twist">⚡ Drop Plot Twist Now!</button>`}
            </div>

            <div class="card-warm stack-sm">
              <div class="row-between">
                <strong class="small">Optional Defense Transcript (for smarter AI Judge)</strong>
                ${SoundFX.supportsMic() ? `<button class="btn btn-sm" id="court-mic">🎙️ Listen with Mic</button>` : ''}
              </div>
              <textarea class="textarea" id="court-notes" placeholder="Speak out loud to the table! (Optional: jot a funny quote or tap Mic)">${esc(notes[turnIdx])}</textarea>
            </div>

            <div class="row-between">
              <button class="btn" id="court-back">← Change Case</button>
              ${turnIdx === 0
                ? `<button class="btn btn-primary btn-lg" id="court-next-def">Next: ${contenders[1].avatar} ${esc(contenders[1].name)} →</button>`
                : `<button class="btn btn-success btn-lg" id="court-verdict">⚖️ Deliver AI Judge Verdict!</button>`}
            </div>
          </div>`;

        document.getElementById('court-notes').oninput = (e) => { notes[turnIdx] = e.target.value; };
        const twistBtn = document.getElementById('court-drop-twist');
        if (twistBtn) twistBtn.onclick = dropTwist;
        const micBtn = document.getElementById('court-mic');
        if (micBtn) {
          micBtn.onclick = () => {
            if (micRec) { micRec.stop(); micRec = null; micBtn.textContent = '🎙️ Listen with Mic'; return; }
            micBtn.textContent = '🔴 Listening...';
            micRec = SoundFX.listenOnce({
              onResult: (txt) => { notes[turnIdx] = txt; const b = document.getElementById('court-notes'); if (b) b.value = txt; },
              onEnd: () => { micRec = null; },
              onError: () => { micRec = null; },
            });
          };
        }
        document.getElementById('court-back').onclick = () => { cleanup(); phase = 'setup'; broadcast(); render(); };
        const nextBtn = document.getElementById('court-next-def');
        if (nextBtn) nextBtn.onclick = () => startDefense(1);
        const verdBtn = document.getElementById('court-verdict');
        if (verdBtn) verdBtn.onclick = judgeCase;
        return;
      }

      if (phase === 'verdict' && verdicts) {
        const w = contenders[verdicts.winnerIdx];
        root.innerHTML = `
          <div class="stack fade-in">
            <div class="card center stack" style="border:2px solid var(--gold);">
              <div style="font-size:2.8rem;">⚖️👑</div>
              <h2>${w.avatar} ${esc(w.name)} Wins the Case!</h2>
              <p style="font-size:1.08rem;margin:0;">"${esc(verdicts.ruling)}"</p>
              <div class="row" style="justify-content:center;">
                <span class="tag tag-gold">+250 pts to ${esc(w.name)}</span>
                <span class="tag">+100 pts Participation</span>
              </div>
            </div>

            <div class="grid-2">
              ${contenders.map((c, i) => {
                const s = verdicts.scores[i];
                return `<div class="card stack-sm">
                  <div class="row-between"><strong>${c.avatar} ${esc(c.name)}</strong><strong class="mono">${s.total} pts</strong></div>
                  <div class="small">🎨 Creativity: <strong>${s.creativity}/10</strong></div>
                  <div class="small">🧠 Logic: <strong>${s.logic}/10</strong></div>
                  <div class="small">⚡ Twist Recovery: <strong>${s.recovery}/10</strong></div>
                  <div class="xs muted">📱 Jury Phone Votes: ${verdicts.voteCounts[i]}</div>
                </div>`;
              }).join('')}
            </div>

            <button class="btn btn-primary btn-lg" id="court-again">⚖️ Call Next Case!</button>
          </div>`;

        document.getElementById('court-again').onclick = () => {
          caseItem = pick(GAME_DATA.turkeyCourt.cases);
          initContenders();
          phase = 'setup';
          broadcast();
          render();
        };
      }
    }

    return { render, cleanup, onPhoneAction };
  }

  // =========================================================================
  // GAME 3: PROMPT PANIC! (Speed AI Art Showdown + Unblur Buzzer)
  // =========================================================================
  function createPromptPanic(App) {
    let phase = 'pick'; // pick | cover | prompt | guess | reveal
    let artistIdx = 0;
    let target = pick(GAME_DATA.promptPanic.targets);
    let userPrompt = '';
    let artResult = null;
    let blurPx = 28;
    let timeLeft = 25;
    let timer = null;
    let buzzedPlayer = null;
    let guessWinner = null;

    function cleanup() {
      if (timer) { clearInterval(timer); timer = null; }
      SoundFX.stopSpeech();
    }

    function broadcast() {
      const players = App.getPlayers();
      const artist = players[artistIdx % players.length];
      App.broadcastHostState('promptPanic', phase, {
        artistId: artist?.id,
        artistName: artist?.name,
        buzzedName: buzzedPlayer?.name || null,
      });
    }

    function onPhoneAction(msg) {
      if (phase === 'guess' && !buzzedPlayer && msg.action === 'BUZZ') {
        const p = App.getPlayers().find(x => x.id === msg.playerId);
        if (p) triggerBuzz(p);
      }
    }

    function triggerBuzz(player) {
      if (buzzedPlayer) return;
      buzzedPlayer = player;
      if (timer) { clearInterval(timer); timer = null; }
      SoundFX.buzzer();
      SoundFX.speak(`${player.name} buzzed in! What is your guess?`);
      broadcast();
      render();
    }

    function getBannedHits(text) {
      const lower = (text || '').toLowerCase();
      const banned = target.banned || [];
      return banned.filter(w => {
        const stem = w.toLowerCase().replace(/ies$/, 'y').replace(/s$/, '');
        return lower.includes(w.toLowerCase()) || (stem.length >= 4 && lower.includes(stem));
      });
    }

    function stripBanned(text) {
      let clean = text || '';
      for (const w of (target.banned || [])) {
        const stem = w.replace(/ies$/, '(?:y|ies)').replace(/s$/, 's?');
        clean = clean.replace(new RegExp(stem, 'ig'), '');
      }
      return clean.replace(/\s+/g, ' ').trim();
    }

    function startPromptTimer() {
      cleanup();
      timeLeft = 35;
      phase = 'prompt';
      broadcast();
      timer = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 5 && timeLeft > 0) SoundFX.tick(0.75);
        if (timeLeft <= 0) {
          clearInterval(timer); timer = null;
          generateAndGuess(true);
          return;
        }
        const el = document.getElementById('panic-timer');
        if (el) {
          el.textContent = fmtTime(timeLeft);
          if (timeLeft <= 6) el.classList.add('urgent');
        }
      }, 1000);
      render();
    }

    function generateAndGuess(fromTimeout = false) {
      if (!fromTimeout && getBannedHits(userPrompt).length > 0) {
        SoundFX.wrong();
        return;
      }
      cleanup();
      const cleaned = stripBanned(userPrompt);
      const finalPrompt = cleaned || target.hints.join(' ');
      userPrompt = finalPrompt;
      artResult = AIArt.renderDataURL(finalPrompt, 440, 300);
      blurPx = 26;
      buzzedPlayer = null;
      guessWinner = null;
      phase = 'guess';
      SoundFX.ding();
      SoundFX.speak('Image generated! Race to buzz in as it unblurs!');
      broadcast();
      timer = setInterval(() => {
        blurPx = Math.max(0, blurPx - 1.3);
        const img = document.getElementById('panic-art-img');
        if (img) img.style.filter = `blur(${blurPx.toFixed(1)}px)`;
        const lbl = document.getElementById('panic-clarity');
        if (lbl) lbl.textContent = `${Math.round(((26 - blurPx) / 26) * 100)}% Clear`;
        if (blurPx <= 0) { clearInterval(timer); timer = null; }
      }, 850);
      render();
    }

    function render() {
      const root = App.getStage();
      const players = App.getPlayers();
      const artist = players[artistIdx % players.length];
      const guessers = players.filter(p => p.id !== artist.id);
      const liveCfg = LiveAI.loadSettings();

      if (phase === 'pick') {
        root.innerHTML = `
          <div class="stack fade-in">
            <h2>🎨 Prompt Panic! (AI Taboo)</h2>
            <p class="muted small" style="margin:0;">Think <strong>Taboo + Pictionary + AI</strong>! The artist gets a secret phrase and 35 seconds to describe it to the AI <strong>WITHOUT typing any of the Banned Words</strong>. Then everyone races to buzz in as the artwork unblurs!</p>
            <div class="card center stack">
              <div style="font-size:3rem;">${artist.avatar}</div>
              <h3>Up Next as AI Artist: ${esc(artist.name)}</h3>
              <p class="small muted" style="margin:0;">Hand the screen to <strong>${esc(artist.name)}</strong> (everyone else look away so you don't see the secret phrase!).</p>
              <button class="btn btn-primary btn-lg" id="panic-reveal-secret">👀 I'm ${esc(artist.name)} — Show Secret Phrase</button>
            </div>
          </div>`;
        document.getElementById('panic-reveal-secret').onclick = () => {
          userPrompt = '';
          startPromptTimer();
        };
        return;
      }

      if (phase === 'prompt') {
        const hits = getBannedHits(userPrompt);
        const safeChips = GAME_DATA.promptPanic.quickChips.filter(c => getBannedHits(c).length === 0);
        root.innerHTML = `
          <div class="stack fade-in">
            <div class="row-between">
              <div><span class="tag tag-gold">SECRET PHRASE (DON'T SAY ALOUD!)</span></div>
              <div class="timer-box ${timeLeft <= 6 ? 'urgent' : ''}" id="panic-timer">${fmtTime(timeLeft)}</div>
            </div>
            <div class="card-warm center stack-sm">
              <h2 style="margin:0;color:var(--pumpkin);">"${esc(target.phrase)}"</h2>
              <div class="row" style="justify-content:center;gap:6px;">
                <span class="xs" style="font-weight:800;color:var(--cranberry);">🚫 BANNED WORDS:</span>
                ${(target.banned || []).map(w => `<span class="tag tag-new">🚫 ${esc(w)}</span>`).join('')}
              </div>
              <p class="xs muted" style="margin:0;">Make the AI draw the secret phrase using <strong>synonyms, clues, or descriptions</strong>—you CANNOT type the red banned words!</p>
            </div>
            <div class="card stack">
              <label class="small"><strong>Describe it creatively without the banned words!</strong></label>
              <textarea class="textarea" id="panic-input" placeholder="Example: instead of 'turkey', type 'giant feathered gobbler bird'...">${esc(userPrompt)}</textarea>
              <div id="panic-warn" class="xs" style="color:var(--cranberry);font-weight:800;min-height:18px;">
                ${hits.length ? `🚫 Banned word spotted: ${hits.map(w => `"${w}"`).join(', ')} — swap it for a creative clue!` : ''}
              </div>
              <div class="xs muted"><strong>Kid-Friendly Clue Chips</strong> (tap to add!):</div>
              <div class="chip-wrap">
                ${safeChips.slice(0, 18).map(c => `<button type="button" class="chip" data-pc="${esc(c)}">+ ${esc(c)}</button>`).join('')}
              </div>
              <button class="btn btn-primary btn-lg" id="panic-gen" ${hits.length || !userPrompt.trim() ? 'disabled' : ''}>🎨 Generate AI Art Now!</button>
            </div>
          </div>`;

        const inp = document.getElementById('panic-input');
        const warn = document.getElementById('panic-warn');
        const genBtn = document.getElementById('panic-gen');
        const syncValidity = () => {
          const curHits = getBannedHits(userPrompt);
          if (curHits.length) {
            warn.textContent = `🚫 Banned word spotted: ${curHits.map(w => `"${w}"`).join(', ')} — describe it another way!`;
            genBtn.disabled = true;
          } else {
            warn.textContent = '';
            genBtn.disabled = !userPrompt.trim();
          }
        };
        inp.oninput = (e) => { userPrompt = e.target.value; syncValidity(); };
        root.querySelectorAll('[data-pc]').forEach(b => {
          b.onclick = () => {
            userPrompt = (userPrompt.trim() ? userPrompt.trim() + ' ' : '') + b.dataset.pc;
            inp.value = userPrompt;
            SoundFX.pop();
            syncValidity();
          };
        });
        genBtn.onclick = () => generateAndGuess(false);
        return;
      }

      if (phase === 'guess') {
        const imgUrl = liveCfg.liveImages ? LiveAI.getLiveImageUrl(userPrompt || target.hints.join(' '), artistIdx + 7) : artResult.dataUrl;
        root.innerHTML = `
          <div class="stack fade-in">
            <div class="row-between">
              <div>
                <h2>🎨 Guess ${esc(artist.name)}'s AI Art!</h2>
                <span class="small muted">First to buzz in & shout the secret phrase wins!</span>
              </div>
              <span class="tag tag-gold mono" id="panic-clarity">${Math.round(((26 - blurPx) / 26) * 100)}% Clear</span>
            </div>

            <div class="art-frame">
              <img id="panic-art-img" src="${imgUrl}" onerror="this.src='${artResult.dataUrl}'" style="filter:blur(${blurPx.toFixed(1)}px);" alt="AI Generated Art" />
            </div>

            ${buzzedPlayer ? `
              <div class="card stack center" style="border:2px solid var(--pumpkin);">
                <h3>🚨 ${buzzedPlayer.avatar} ${esc(buzzedPlayer.name)} BUZZED IN!</h3>
                <p class="small muted" style="margin:0;">Let ${esc(buzzedPlayer.name)} shout their guess! (Artist: check if they got close!)</p>
                <div class="row" style="justify-content:center;">
                  <button class="btn btn-success btn-lg" id="panic-correct">✅ Nailed It! (+${Math.round(120 + blurPx * 7)} pts)</button>
                  <button class="btn btn-danger" id="panic-wrong">❌ Nope — Keep Unblurring!</button>
                </div>
              </div>
            ` : `
              <div class="card stack-sm">
                <div class="row-between">
                  <strong class="small">Tap Your Name to BUZZ IN! (Or buzz from your QR phone!)</strong>
                  <button class="btn btn-sm" id="panic-giveup">Reveal Answer</button>
                </div>
                <div class="buzzer-grid">
                  ${(guessers.length ? guessers : players).map(p => `
                    <button class="buzzer-pad" data-buzz="${p.id}">
                      <span style="font-size:1.5rem;">${p.avatar}</span>
                      <span>${esc(p.name)}</span>
                    </button>
                  `).join('')}
                </div>
              </div>
            `}
          </div>`;

        root.querySelectorAll('[data-buzz]').forEach(b => {
          b.onclick = () => {
            const p = players.find(x => x.id === b.dataset.buzz);
            if (p) triggerBuzz(p);
          };
        });
        const corr = document.getElementById('panic-correct');
        if (corr) corr.onclick = () => {
          const pts = Math.round(120 + blurPx * 7);
          App.addScore(buzzedPlayer.id, pts);
          App.addScore(artist.id, 125);
          guessWinner = { player: buzzedPlayer, pts };
          phase = 'reveal';
          SoundFX.fanfare();
          broadcast();
          render();
        };
        const wrg = document.getElementById('panic-wrong');
        if (wrg) wrg.onclick = () => {
          SoundFX.wrong();
          buzzedPlayer = null;
          broadcast();
          timer = setInterval(() => {
            blurPx = Math.max(0, blurPx - 1.4);
            const img = document.getElementById('panic-art-img');
            if (img) img.style.filter = `blur(${blurPx.toFixed(1)}px)`;
            const lbl = document.getElementById('panic-clarity');
            if (lbl) lbl.textContent = `${Math.round(((26 - blurPx) / 26) * 100)}% Clear`;
            if (blurPx <= 0) { clearInterval(timer); timer = null; }
          }, 800);
          render();
        };
        const gu = document.getElementById('panic-giveup');
        if (gu) gu.onclick = () => { cleanup(); phase = 'reveal'; broadcast(); render(); };
        return;
      }

      if (phase === 'reveal') {
        root.innerHTML = `
          <div class="stack fade-in">
            <div class="card center stack">
              <h2>${guessWinner ? `🎉 ${guessWinner.player.avatar} ${esc(guessWinner.player.name)} Got It!` : '🎨 Full Reveal!'}</h2>
              <p class="small muted" style="margin:0;">Secret Phrase:</p>
              <h3 style="color:var(--pumpkin);font-size:1.3rem;">"${esc(target.phrase)}"</h3>
              <div class="art-frame"><img src="${artResult.dataUrl}" alt="Full AI Art" /></div>
              <p class="xs muted" style="margin:0;">${esc(artist.name)}'s prompt: <em>"${esc(userPrompt || '(auto)')}"</em></p>
              ${guessWinner ? `<div class="row" style="justify-content:center;"><span class="tag tag-gold">+${guessWinner.pts} pts to ${esc(guessWinner.player.name)}</span><span class="tag tag-kid">+125 pts Artist Bonus to ${esc(artist.name)}</span></div>` : ''}
              <button class="btn btn-primary btn-lg" id="panic-next">Next Artist →</button>
            </div>
          </div>`;

        document.getElementById('panic-next').onclick = () => {
          artistIdx = (artistIdx + 1) % players.length;
          target = pick(GAME_DATA.promptPanic.targets);
          phase = 'pick';
          broadcast();
          render();
        };
      }
    }

    return { render, cleanup, onPhoneAction };
  }

  // =========================================================================
  // GAME 4: PASS THE GOBBLE BOMB (Hot-Potato AI Story + Storybook Finale)
  // =========================================================================
  function createGobbleBomb(App) {
    let phase = 'setup'; // setup | live | boom
    let speed = 'normal'; // chill | normal | lightning
    let starter = pick(GAME_DATA.gobbleBomb.starters);
    let holderIdx = 0;
    let currentWord = '';
    let currentMod = GAME_DATA.gobbleBomb.modifiers[0];
    let storyLog = [];
    let passes = 0;
    let fuseEnd = 0;
    let totalFuse = 32000;
    let tickTimer = null;
    let usedWords = [];

    function cleanup() {
      if (tickTimer) { clearTimeout(tickTimer); tickTimer = null; }
      SoundFX.stopSpeech();
    }

    function broadcast() {
      const players = App.getPlayers();
      const holder = players[holderIdx % players.length];
      App.broadcastHostState('gobbleBomb', phase, {
        holderId: holder?.id,
        holderName: holder?.name,
        word: currentWord,
        modifier: currentMod.label,
      });
    }

    function onPhoneAction(msg) {
      if (phase === 'live' && msg.action === 'PASS_BOMB') {
        passTurn(msg.value || '');
      }
    }

    function scheduleTick() {
      const rem = fuseEnd - Date.now();
      if (rem <= 0) { detonate(); return; }
      const prog = Math.min(1, Math.max(0, 1 - rem / totalFuse));
      SoundFX.tick(prog);
      const stage = document.getElementById('bomb-stage');
      if (stage && prog > 0.65) stage.classList.add('hot');
      const nextDelay = Math.max(170, Math.round(950 - prog * 760));
      tickTimer = setTimeout(scheduleTick, nextDelay);
    }

    function nextPromptWord() {
      const avail = GAME_DATA.gobbleBomb.twistWords.filter(w => !usedWords.includes(w));
      currentWord = pick(avail.length ? avail : GAME_DATA.gobbleBomb.twistWords);
      usedWords.push(currentWord);
      currentMod = passes > 0 && Math.random() < 0.45
        ? pick(GAME_DATA.gobbleBomb.modifiers.slice(1))
        : GAME_DATA.gobbleBomb.modifiers[0];
    }

    function startBomb() {
      cleanup();
      starter = pick(GAME_DATA.gobbleBomb.starters);
      storyLog = [{ speaker: '🤖 AI Narrator', text: starter, word: '' }];
      usedWords = [];
      passes = 0;
      holderIdx = Math.floor(Math.random() * App.getPlayers().length);
      nextPromptWord();

      const ranges = { chill: [34000, 52000], normal: [22000, 38000], lightning: [14000, 24000] };
      const [lo, hi] = ranges[speed];
      totalFuse = lo + Math.random() * (hi - lo);
      fuseEnd = Date.now() + totalFuse;

      phase = 'live';
      SoundFX.speak(`${starter} First word: ${currentWord}!`);
      broadcast();
      scheduleTick();
      render();
    }

    function passTurn(optionalLine = '') {
      const players = App.getPlayers();
      const prev = players[holderIdx % players.length];
      storyLog.push({
        speaker: `${prev.avatar} ${prev.name}`,
        text: optionalLine.trim() || `...worked "${currentWord}" into the wild story (${currentMod.label})!`,
        word: currentWord,
      });
      passes++;
      holderIdx = (holderIdx + 1) % players.length;
      nextPromptWord();
      SoundFX.pop();
      if (currentMod.label !== 'NORMAL TURN') {
        SoundFX.speak(`${currentWord}! ${currentMod.label}`);
      }
      broadcast();
      render();
    }

    function detonate() {
      cleanup();
      phase = 'boom';
      SoundFX.boom();
      const players = App.getPlayers();
      const victim = players[holderIdx % players.length];
      players.forEach(p => {
        if (p.id !== victim.id) App.addScore(p.id, 100);
      });
      SoundFX.speak(`KA-BOOM! The Gobble Bomb exploded on ${victim.name}! Everyone else survives and earns 100 points!`);
      broadcast();
      render();
    }

    function render() {
      const root = App.getStage();
      const players = App.getPlayers();
      const holder = players[holderIdx % players.length];

      if (phase === 'setup') {
        root.innerHTML = `
          <div class="stack fade-in">
            <h2>💣 Pass the Gobble Bomb</h2>
            <p class="muted small" style="margin:0;">Pass ONE phone around the dinner table! Say the next sentence of the story using the flashing twist word, then smash PASS before the hidden timer explodes!</p>
            <div class="card stack">
              <strong class="small">Choose Fuse Chaos Level:</strong>
              <div class="grid-3">
                <button class="btn ${speed === 'chill' ? 'btn-primary' : ''}" data-sp="chill">🐢 Chill (35–52s)</button>
                <button class="btn ${speed === 'normal' ? 'btn-primary' : ''}" data-sp="normal">🔥 Chaos (22–38s)</button>
                <button class="btn ${speed === 'lightning' ? 'btn-primary' : ''}" data-sp="lightning">⚡ Lightning (14–24s)</button>
              </div>
              <button class="btn btn-danger btn-xl" id="bomb-light">🔥 Light the Turkey Fuse!</button>
            </div>
          </div>`;

        root.querySelectorAll('[data-sp]').forEach(b => { b.onclick = () => { speed = b.dataset.sp; render(); }; });
        document.getElementById('bomb-light').onclick = startBomb;
        return;
      }

      if (phase === 'live') {
        root.innerHTML = `
          <div class="stack fade-in">
            <div class="card-warm small">
              <strong>📖 Story Starter:</strong> ${esc(starter)}
            </div>

            <div class="bomb-stage" id="bomb-stage">
              <div class="bomb-emoji">🦃💣</div>
              <div style="margin-top:6px;"><span class="tag tag-gold">HOLDING THE BOMB</span></div>
              <h2 style="margin:6px 0 2px;">${holder.avatar} ${esc(holder.name)}</h2>
              <div class="xs muted">Use this mandatory twist word:</div>
              <div class="twist-word-big">"${esc(currentWord)}"</div>
              <div style="margin:8px 0 18px;">
                <span class="tag ${currentMod.label === 'NORMAL TURN' ? '' : 'tag-new'}">${esc(currentMod.label)}</span>
                <div class="xs muted" style="margin-top:4px;">${esc(currentMod.desc)}</div>
              </div>
              <button class="btn btn-primary btn-xl" id="bomb-pass-btn">
                👋 SAID IT — PASS THE TURKEY!
              </button>
              <div class="xs muted" style="margin-top:10px;">Passes survived: <strong>${passes}</strong></div>
            </div>
          </div>`;

        document.getElementById('bomb-pass-btn').onclick = () => passTurn();
        return;
      }

      if (phase === 'boom') {
        const coverPrompt = `turkey ${usedWords.slice(0, 4).join(' ')} fireworks autumn`;
        const cover = AIArt.renderDataURL(coverPrompt, 440, 300);
        const clutch = players[(holderIdx - 1 + players.length) % players.length];
        root.innerHTML = `
          <div class="stack fade-in">
            <div class="card center stack" style="border:2px solid var(--cranberry);">
              <div style="font-size:3.5rem;">💥🦃💥</div>
              <h2>GOBBLE KABOOM!</h2>
              <p style="font-size:1.1rem;margin:0;"><strong>${holder.avatar} ${esc(holder.name)}</strong> was left holding the exploding turkey!</p>
              <span class="tag tag-kid">+100 Survivor Points to everyone else!</span>
            </div>

            <div class="card stack">
              <div class="row-between">
                <h3>📖 Tonight's AI Illustrated Storybook</h3>
                <span class="tag tag-gold">${passes} Wild Turns</span>
              </div>
              <div class="art-frame"><img src="${cover.dataUrl}" alt="Storybook Cover" /></div>
              <div class="stack-sm">
                ${storyLog.slice(0, 8).map(l => `<div class="small"><strong>${esc(l.speaker)}:</strong> ${esc(l.text)}</div>`).join('')}
              </div>
              <div class="divider"></div>
              <div class="row">
                <span class="tag tag-gold">🏅 Clutch Survivor: ${esc(clutch.name)}</span>
                <span class="tag tag-new">💥 Grand Gobble Victim: ${esc(holder.name)}</span>
              </div>
              <button class="btn btn-danger btn-lg" id="bomb-again">🔥 Play Another Round!</button>
            </div>
          </div>`;

        document.getElementById('bomb-again').onclick = () => { phase = 'setup'; broadcast(); render(); };
      }
    }

    return { render, cleanup, onPhoneAction };
  }

  // =========================================================================
  // GAME 5: SPOT THE BOT: DINNER TABLE EDITION
  // =========================================================================
  function createSpotTheBot(App) {
    let phase = 'submit'; // submit | pass_write | reveal | summary
    let promptItem = pick(GAME_DATA.spotTheBot.prompts);
    let answers = {}; // playerId -> text
    let deck = []; // { id, text, isBot, authorId, authorName }
    let revealIdx = 0;
    let revealedResult = null;
    let roundPoints = {};
    let revealTimer = null;
    let revealStart = 0;
    let activePassPlayer = null;

    function cleanup() {
      if (revealTimer) { clearInterval(revealTimer); revealTimer = null; }
      SoundFX.stopSpeech();
    }

    function broadcast() {
      App.broadcastHostState('spotTheBot', phase, {
        question: promptItem.q,
        submittedIds: Object.keys(answers),
        cardIndex: revealIdx,
        cardText: deck[revealIdx]?.text || '',
        canSlam: phase === 'reveal' && !revealedResult,
      });
    }

    function onPhoneAction(msg) {
      if (phase === 'submit' && msg.action === 'SUBMIT_BOT_ANSWER' && msg.value) {
        answers[msg.playerId] = String(msg.value).trim();
        SoundFX.pop();
        broadcast();
        render();
      }
      if (phase === 'reveal' && !revealedResult && msg.action === 'SLAM_BOT') {
        const p = App.getPlayers().find(x => x.id === msg.playerId);
        if (p) handleSlam(p);
      }
    }

    async function buildDeckAndStartReveal() {
      const players = App.getPlayers();
      const entries = [];
      for (const p of players) {
        if (answers[p.id]) {
          entries.push({ id: p.id, text: answers[p.id], isBot: false, authorId: p.id, authorName: `${p.avatar} ${p.name}` });
        }
      }

      // Add 1 or 2 convincing AI Bot answers (live LLM if configured, else curated bank)
      let botLines = shuffle(promptItem.bots).slice(0, entries.length >= 3 ? 2 : 1);
      const live = await LiveAI.askJSON(
        'Write 1 hilarious, natural, human-sounding answer (max 18 words) to blend in with a family Thanksgiving dinner table game.',
        `Prompt: "${promptItem.q}"\nSample family style: "${entries[0]?.text || 'funny casual tone'}"\nReturn JSON: {"answer":"..."}`
      );
      if (live && live.answer) botLines[0] = live.answer;

      botLines.forEach((b, i) => {
        entries.push({ id: 'bot_' + i, text: b, isBot: true, authorId: null, authorName: '🤖 Sneaky AI Bot' });
      });

      deck = shuffle(entries);
      revealIdx = 0;
      roundPoints = {};
      startCardReveal();
    }

    function startCardReveal() {
      cleanup();
      revealedResult = null;
      phase = 'reveal';
      revealStart = Date.now();
      const card = deck[revealIdx];
      SoundFX.pop();
      SoundFX.speak(card.text);
      broadcast();
      render();
    }

    function handleSlam(slammer) {
      if (revealedResult) return;
      const card = deck[revealIdx];
      const elapsed = (Date.now() - revealStart) / 1000;
      if (card.isBot) {
        const pts = Math.max(100, Math.round(280 - elapsed * 20));
        App.addScore(slammer.id, pts);
        roundPoints[slammer.id] = (roundPoints[slammer.id] || 0) + pts;
        revealedResult = {
          ok: true,
          headline: `🎯 CAUGHT IT! ${slammer.avatar} ${slammer.name} spotted the AI Bot in ${elapsed.toFixed(1)}s!`,
          detail: `+${pts} pts to ${slammer.name}!`,
        };
        SoundFX.ding();
      } else {
        App.addScore(slammer.id, -50);
        if (card.authorId && card.authorId !== slammer.id) {
          App.addScore(card.authorId, 150);
          roundPoints[card.authorId] = (roundPoints[card.authorId] || 0) + 150;
        }
        revealedResult = {
          ok: false,
          headline: `😂 FALSE ALARM! That was actually ${card.authorName}!`,
          detail: `${slammer.name} loses 50 pts · ${card.authorName} gets +150 Fooler Bonus!`,
        };
        SoundFX.wrong();
      }
      broadcast();
      render();
    }

    function markHumanSafe() {
      const card = deck[revealIdx];
      if (card.isBot) {
        revealedResult = {
          ok: false,
          headline: `🤖 THE BOT FOOLED EVERYONE! That was an AI answer!`,
          detail: 'Nobody slammed BOT in time — the AI gets the last laugh!',
        };
        SoundFX.wrong();
      } else {
        revealedResult = {
          ok: true,
          headline: `✅ Correct — that was a real human: ${card.authorName}!`,
          detail: 'Good instincts, dinner table!',
        };
        SoundFX.ding();
      }
      broadcast();
      render();
    }

    function render() {
      const root = App.getStage();
      const players = App.getPlayers();

      if (phase === 'submit') {
        const count = Object.keys(answers).length;
        const missing = players.filter(p => !answers[p.id]);
        root.innerHTML = `
          <div class="stack fade-in">
            <div class="row-between">
              <div>
                <h2>🤖 Spot the Bot</h2>
                <p class="muted small" style="margin:0;">Everyone answers secretly. The AI slips in fake answers—then race to slam <strong>"THAT'S A BOT!"</strong></p>
              </div>
              <button class="btn btn-sm" id="bot-new-q">🎲 New Prompt</button>
            </div>

            <div class="card-warm">
              <span class="tag tag-gold">DINNER TABLE PROMPT</span>
              <h2 style="margin:8px 0 0;">"${esc(promptItem.q)}"</h2>
            </div>

            <div class="card stack">
              <div class="row-between">
                <h3>Answers Collected (${count}/${players.length})</h3>
                <button class="btn btn-sm" id="bot-qr">📱 Submit on Phones</button>
              </div>
              <div class="roster-bar">
                ${players.map(p => {
                  const ok = !!answers[p.id];
                  return `<span class="player-chip" style="${ok ? 'background:var(--sage-soft);border-color:var(--sage);' : ''}">
                    ${p.avatar} ${esc(p.name)} <strong>${ok ? '✓' : '…'}</strong>
                  </span>`;
                }).join('')}
              </div>
              <div class="divider"></div>
              <div class="row">
                <select class="select" id="bot-sel" style="max-width:210px;">
                  ${players.map(p => `<option value="${p.id}">${p.avatar} ${esc(p.name)}</option>`).join('')}
                </select>
                <button class="btn btn-primary" id="bot-pass-btn">✍️ Enter Secret Answer</button>
              </div>
            </div>

            <button class="btn btn-success btn-lg" id="bot-start-reveal" ${count === 0 ? 'disabled' : ''}>
              🤖 Mix In AI Bots & Start Reveal! (${count} human + AI)
            </button>
          </div>`;

        if (missing.length) document.getElementById('bot-sel').value = missing[0].id;
        document.getElementById('bot-new-q').onclick = () => { promptItem = pick(GAME_DATA.spotTheBot.prompts); answers = {}; SoundFX.pop(); broadcast(); render(); };
        document.getElementById('bot-qr').onclick = () => App.openQRModal();
        document.getElementById('bot-pass-btn').onclick = () => {
          const pid = document.getElementById('bot-sel').value;
          activePassPlayer = players.find(p => p.id === pid) || players[0];
          phase = 'pass_write';
          render();
        };
        document.getElementById('bot-start-reveal').onclick = buildDeckAndStartReveal;
        return;
      }

      if (phase === 'pass_write') {
        const p = activePassPlayer || players[0];
        root.innerHTML = `
          <div class="stack fade-in">
            <h2>${p.avatar} ${esc(p.name)}'s Secret Answer</h2>
            <div class="card-warm small"><strong>Prompt:</strong> ${esc(promptItem.q)}</div>
            <div class="card stack">
              <textarea class="textarea" id="bot-ans-box" placeholder="Write something funny, clever, or sneaky...">${esc(answers[p.id] || '')}</textarea>
              <div class="row-between">
                <button class="btn" id="bot-cancel-write">Back</button>
                <button class="btn btn-primary btn-lg" id="bot-save-ans">🔒 Lock In Answer</button>
              </div>
            </div>
          </div>`;
        document.getElementById('bot-cancel-write').onclick = () => { phase = 'submit'; render(); };
        document.getElementById('bot-save-ans').onclick = () => {
          const v = document.getElementById('bot-ans-box').value.trim();
          if (!v) return;
          answers[p.id] = v;
          SoundFX.pop();
          phase = 'submit';
          broadcast();
          render();
        };
        return;
      }

      if (phase === 'reveal') {
        const card = deck[revealIdx];
        root.innerHTML = `
          <div class="stack fade-in">
            <div class="row-between">
              <span class="tag tag-gold">ANSWER ${revealIdx + 1} OF ${deck.length}</span>
              <span class="small muted">${esc(promptItem.q)}</span>
            </div>

            <div class="bot-reveal-card">“${esc(card.text)}”</div>

            ${revealedResult ? `
              <div class="card center stack" style="border:2px solid ${revealedResult.ok ? 'var(--sage)' : 'var(--cranberry)'};">
                <h3>${esc(revealedResult.headline)}</h3>
                <p class="small muted" style="margin:0;">${esc(revealedResult.detail)}</p>
                <button class="btn btn-primary btn-lg" id="bot-next-card">
                  ${revealIdx + 1 < deck.length ? 'Next Answer →' : '🏁 Finish Round'}
                </button>
              </div>
            ` : `
              <div class="card stack">
                <div class="row-between">
                  <strong class="small">Think it's the AI? Tap your name to SLAM "BOT!" (or tap on your phone!)</strong>
                  <button class="btn btn-sm" id="bot-safe">🙅 Definitely Human →</button>
                </div>
                <div class="buzzer-grid">
                  ${players.map(p => `
                    <button class="buzzer-pad bot-slam" data-slam="${p.id}">
                      <span style="font-size:1.35rem;">🤖 ${p.avatar}</span>
                      <span>${esc(p.name)}: BOT!</span>
                    </button>
                  `).join('')}
                </div>
              </div>
            `}
          </div>`;

        root.querySelectorAll('[data-slam]').forEach(b => {
          b.onclick = () => {
            const p = players.find(x => x.id === b.dataset.slam);
            if (p) handleSlam(p);
          };
        });
        const safeBtn = document.getElementById('bot-safe');
        if (safeBtn) safeBtn.onclick = markHumanSafe;
        const nextBtn = document.getElementById('bot-next-card');
        if (nextBtn) nextBtn.onclick = () => {
          if (revealIdx + 1 < deck.length) { revealIdx++; startCardReveal(); }
          else {
            promptItem = pick(GAME_DATA.spotTheBot.prompts);
            answers = {};
            phase = 'submit';
            broadcast();
            render();
          }
        };
      }
    }

    broadcast();
    return { render, cleanup, onPhoneAction };
  }

  // =========================================================================
  // GAME 6: FEAST SHOWDOWN (Age-Balanced Family Game Show — 3 Mini-Modes!)
  // =========================================================================
  function createFeastShowdown(App) {
    let mode = 'menu'; // menu | trivia | pitch | chain
    // Trivia state
    let targetAge = 'kid';
    let qItem = null;
    let buzzed = null;
    let showAnswer = false;
    // Pitch state
    let pitchItem = null;
    let pitchTime = 20;
    let pitchVotes = {};
    // Chain state
    let chainCat = '';
    let chainPlayerIdx = 0;
    let chainTime = 5;
    let chainStreak = 0;
    let chainOut = null;

    let timer = null;

    function cleanup() {
      if (timer) { clearInterval(timer); timer = null; }
      SoundFX.stopSpeech();
    }

    function broadcast() {
      App.broadcastHostState('feastShowdown', mode, {
        canBuzz: mode === 'trivia' && !buzzed && !showAnswer,
        buzzedName: buzzed?.name || null,
        pitchDish: pitchItem?.dish || null,
        players: App.getPlayers().map(p => ({ id: p.id, name: p.name, avatar: p.avatar })),
      });
    }

    function onPhoneAction(msg) {
      if (mode === 'trivia' && !buzzed && !showAnswer && msg.action === 'BUZZ') {
        const p = App.getPlayers().find(x => x.id === msg.playerId);
        if (p) { buzzed = p; SoundFX.buzzer(); SoundFX.speak(`${p.name} buzzed in!`); broadcast(); render(); }
      }
      if (mode === 'pitch' && msg.action === 'PITCH_VOTE' && msg.value) {
        pitchVotes[msg.playerId] = msg.value;
        SoundFX.pop();
        render();
      }
    }

    function startTrivia(ageTier) {
      cleanup();
      mode = 'trivia';
      targetAge = ageTier;
      qItem = pick(GAME_DATA.feastShowdown.trivia[ageTier]);
      buzzed = null;
      showAnswer = false;
      SoundFX.pop();
      SoundFX.speak(qItem.q);
      broadcast();
      render();
    }

    function startPitch() {
      cleanup();
      mode = 'pitch';
      pitchItem = pick(GAME_DATA.feastShowdown.pitches);
      pitchTime = 20;
      pitchVotes = {};
      SoundFX.ding();
      SoundFX.speak(`Pitch Battle! Sell us ${pitchItem.dish}! ${pitchItem.taglineHint}`);
      broadcast();
      timer = setInterval(() => {
        pitchTime--;
        if (pitchTime <= 5 && pitchTime > 0) SoundFX.tick(0.75);
        if (pitchTime <= 0) { clearInterval(timer); timer = null; SoundFX.buzzer(); }
        const el = document.getElementById('pitch-timer');
        if (el) { el.textContent = fmtTime(pitchTime); if (pitchTime <= 5) el.classList.add('urgent'); }
      }, 1000);
      render();
    }

    function startChain() {
      cleanup();
      mode = 'chain';
      chainCat = pick(GAME_DATA.feastShowdown.categories);
      chainPlayerIdx = 0;
      chainStreak = 0;
      chainOut = null;
      startChainSeat();
    }

    function startChainSeat() {
      if (timer) clearInterval(timer);
      chainTime = 5;
      const ps = App.getPlayers();
      const cur = ps[chainPlayerIdx % ps.length];
      if (chainStreak === 0) SoundFX.speak(`Rapid-Fire Chain! Category: ${chainCat}! Starting with ${cur.name}!`);
      broadcast();
      timer = setInterval(() => {
        chainTime--;
        if (chainTime > 0 && chainTime <= 3) SoundFX.tick(0.8);
        if (chainTime <= 0) {
          clearInterval(timer); timer = null;
          SoundFX.boom();
          chainOut = cur;
          ps.forEach(p => { if (p.id !== cur.id) App.addScore(p.id, 75); });
          render();
          return;
        }
        const el = document.getElementById('chain-timer');
        if (el) { el.textContent = `${chainTime}s`; if (chainTime <= 2) el.classList.add('urgent'); }
      }, 1000);
      render();
    }

    function render() {
      const root = App.getStage();
      const players = App.getPlayers();

      if (mode === 'menu') {
        root.innerHTML = `
          <div class="stack fade-in">
            <h2>🏆 Feast Showdown</h2>
            <p class="muted small" style="margin:0;">Age-balanced family game show! Pick a fast 2-minute round — kids and adults compete fairly on the exact same scoreboard.</p>
            <div class="grid-3">
              <div class="card stack">
                <div style="font-size:2rem;">⚡</div>
                <h3>Lightning Buzz</h3>
                <p class="xs muted" style="margin:0;">Riddles & Thanksgiving trivia auto-scaled by Kid, Teen, or Adult difficulty.</p>
                <div class="stack-sm">
                  <button class="btn btn-success btn-sm" id="fs-kid">🧒 Kid Round</button>
                  <button class="btn btn-primary btn-sm" id="fs-teen">🧑 Teen Round</button>
                  <button class="btn btn-sm" id="fs-adult">🧑‍🦳 Adult Round</button>
                </div>
              </div>
              <div class="card stack">
                <div style="font-size:2rem;">📣</div>
                <h3>Pitch Battle</h3>
                <p class="xs muted" style="margin:0;">AI invents an absurd fusion dish—20 seconds to pitch the funniest commercial jingle!</p>
                <button class="btn btn-primary" id="fs-pitch" style="margin-top:auto;">Start Pitch Battle</button>
              </div>
              <div class="card stack">
                <div style="font-size:2rem;">🔥</div>
                <h3>Rapid-Fire Chain</h3>
                <p class="xs muted" style="margin:0;">5-second hot-seat around the table! Shout an answer in the category without repeating.</p>
                <button class="btn btn-danger" id="fs-chain" style="margin-top:auto;">Start Chain!</button>
              </div>
            </div>
          </div>`;

        document.getElementById('fs-kid').onclick = () => startTrivia('kid');
        document.getElementById('fs-teen').onclick = () => startTrivia('teen');
        document.getElementById('fs-adult').onclick = () => startTrivia('adult');
        document.getElementById('fs-pitch').onclick = startPitch;
        document.getElementById('fs-chain').onclick = startChain;
        return;
      }

      if (mode === 'trivia') {
        const tierLabel = targetAge === 'kid' ? '🧒 KID TIER' : targetAge === 'teen' ? '🧑 TEEN TIER' : '🧑‍🦳 ADULT TIER';
        root.innerHTML = `
          <div class="stack fade-in">
            <div class="row-between">
              <button class="btn btn-sm" id="fs-back">← All Showdown Modes</button>
              <span class="tag tag-kid">${tierLabel}</span>
            </div>

            <div class="card center stack">
              <h2 style="margin:0;">${esc(qItem.q)}</h2>
              ${showAnswer ? `<div class="card-warm"><strong style="color:var(--sage);font-size:1.15rem;">Answer: ${esc(qItem.a)}</strong></div>` : ''}
            </div>

            ${buzzed && !showAnswer ? `
              <div class="card center stack" style="border:2px solid var(--pumpkin);">
                <h3>🚨 ${buzzed.avatar} ${esc(buzzed.name)} Buzzed In!</h3>
                <p class="xs muted" style="margin:0;">Answer: <details style="display:inline;"><summary style="cursor:pointer;font-weight:700;">Host Peek</summary> ${esc(qItem.a)}</details></p>
                <div class="row" style="justify-content:center;">
                  <button class="btn btn-success btn-lg" id="fs-right">✅ Correct (+200)</button>
                  <button class="btn btn-danger" id="fs-wrong">❌ Wrong (-50 & Steal!)</button>
                </div>
              </div>
            ` : showAnswer ? `
              <div class="row-between">
                <button class="btn" id="fs-switch-kid">🧒 Kid Q</button>
                <button class="btn" id="fs-switch-teen">🧑 Teen Q</button>
                <button class="btn" id="fs-switch-adult">🧑‍🦳 Adult Q</button>
                <button class="btn btn-primary btn-lg" id="fs-next-q">Next Question →</button>
              </div>
            ` : `
              <div class="card stack">
                <div class="row-between">
                  <strong class="small">Tap Your Name to BUZZ IN! (Or use your QR phone!)</strong>
                  <button class="btn btn-sm" id="fs-show-ans">Reveal Answer</button>
                </div>
                <div class="buzzer-grid">
                  ${players.map(p => `<button class="buzzer-pad" data-tb="${p.id}"><span style="font-size:1.4rem;">${p.avatar}</span><span>${esc(p.name)}</span></button>`).join('')}
                </div>
              </div>
            `}
          </div>`;

        document.getElementById('fs-back').onclick = () => { cleanup(); mode = 'menu'; broadcast(); render(); };
        root.querySelectorAll('[data-tb]').forEach(b => {
          b.onclick = () => {
            buzzed = players.find(p => p.id === b.dataset.tb);
            SoundFX.buzzer();
            broadcast();
            render();
          };
        });
        const sa = document.getElementById('fs-show-ans');
        if (sa) sa.onclick = () => { showAnswer = true; broadcast(); render(); };
        const rt = document.getElementById('fs-right');
        if (rt) rt.onclick = () => { App.addScore(buzzed.id, 200); SoundFX.fanfare(); showAnswer = true; broadcast(); render(); };
        const wr = document.getElementById('fs-wrong');
        if (wr) wr.onclick = () => { App.addScore(buzzed.id, -50); SoundFX.wrong(); buzzed = null; broadcast(); render(); };
        const nq = document.getElementById('fs-next-q');
        if (nq) nq.onclick = () => startTrivia(targetAge);
        const sk = document.getElementById('fs-switch-kid'); if (sk) sk.onclick = () => startTrivia('kid');
        const st = document.getElementById('fs-switch-teen'); if (st) st.onclick = () => startTrivia('teen');
        const su = document.getElementById('fs-switch-adult'); if (su) su.onclick = () => startTrivia('adult');
        return;
      }

      if (mode === 'pitch') {
        const voteTally = {};
        Object.values(pitchVotes).forEach(pid => { voteTally[pid] = (voteTally[pid] || 0) + 1; });
        root.innerHTML = `
          <div class="stack fade-in">
            <div class="row-between">
              <button class="btn btn-sm" id="fs-back">← Modes</button>
              <div class="timer-box ${pitchTime <= 5 ? 'urgent' : ''}" id="pitch-timer">${fmtTime(pitchTime)}</div>
            </div>
            <div class="card center stack">
              <span class="tag tag-gold">AI FUSION DISH</span>
              <h1 style="margin:4px 0;color:var(--pumpkin);">${esc(pitchItem.dish)}</h1>
              <p class="muted" style="margin:0;">${esc(pitchItem.taglineHint)}</p>
            </div>
            <div class="card stack">
              <strong class="small">Tap who delivered the funniest pitch (+200 pts)!</strong>
              <div class="buzzer-grid">
                ${players.map(p => `
                  <button class="buzzer-pad" data-pw="${p.id}">
                    <span style="font-size:1.5rem;">${p.avatar}</span>
                    <span>${esc(p.name)} ${voteTally[p.id] ? `(${voteTally[p.id]} 📱)` : ''}</span>
                  </button>
                `).join('')}
              </div>
              <button class="btn" id="fs-new-pitch">🎲 Next Absurd Dish</button>
            </div>
          </div>`;

        document.getElementById('fs-back').onclick = () => { cleanup(); mode = 'menu'; broadcast(); render(); };
        document.getElementById('fs-new-pitch').onclick = startPitch;
        root.querySelectorAll('[data-pw]').forEach(b => {
          b.onclick = () => {
            const p = players.find(x => x.id === b.dataset.pw);
            if (!p) return;
            App.addScore(p.id, 200);
            SoundFX.fanfare();
            SoundFX.speak(`Sold! ${p.name} wins 200 points for that brilliant pitch!`);
            startPitch();
          };
        });
        return;
      }

      if (mode === 'chain') {
        const cur = players[chainPlayerIdx % players.length];
        root.innerHTML = `
          <div class="stack fade-in">
            <div class="row-between">
              <button class="btn btn-sm" id="fs-back">← Modes</button>
              <span class="tag tag-gold">STREAK: ${chainStreak}</span>
            </div>
            <div class="card-warm center">
              <div class="xs muted">RAPID-FIRE CATEGORY</div>
              <h2 style="margin:4px 0 0;color:var(--pumpkin);">${esc(chainCat)}</h2>
            </div>

            ${chainOut ? `
              <div class="card center stack" style="border:2px solid var(--cranberry);">
                <div style="font-size:3rem;">⏰🦃</div>
                <h2>Time's Up on ${chainOut.avatar} ${esc(chainOut.name)}!</h2>
                <p class="small muted" style="margin:0;">The table survived <strong>${chainStreak}</strong> rapid answers! Everyone else earns +75 pts!</p>
                <button class="btn btn-primary btn-lg" id="chain-again">🔥 Next Category!</button>
              </div>
            ` : `
              <div class="card center stack">
                <div class="timer-box ${chainTime <= 2 ? 'urgent' : ''}" id="chain-timer" style="margin:0 auto;font-size:2rem;">${chainTime}s</div>
                <h2 style="margin:4px 0;">${cur.avatar} ${esc(cur.name)}'s Turn!</h2>
                <button class="btn btn-success btn-xl" id="chain-next">✅ VALID — NEXT PLAYER! →</button>
              </div>
            `}
          </div>`;

        document.getElementById('fs-back').onclick = () => { cleanup(); mode = 'menu'; broadcast(); render(); };
        const cn = document.getElementById('chain-next');
        if (cn) cn.onclick = () => {
          SoundFX.pop();
          chainStreak++;
          chainPlayerIdx = (chainPlayerIdx + 1) % players.length;
          startChainSeat();
        };
        const ca = document.getElementById('chain-again');
        if (ca) ca.onclick = startChain;
      }
    }

    return { render, cleanup, onPhoneAction };
  }

  return {
    promptClone: createPromptClone,
    turkeyCourt: createTurkeyCourt,
    promptPanic: createPromptPanic,
    gobbleBomb: createGobbleBomb,
    spotTheBot: createSpotTheBot,
    feastShowdown: createFeastShowdown,
  };
})();

if (typeof module !== 'undefined') module.exports = Games;
