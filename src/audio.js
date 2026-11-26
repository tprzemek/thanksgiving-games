// Sound Effects (Web Audio API) + AI Voice Host (Web Speech API) + Mic Helper
// 100% self-contained, zero external audio assets.

const SoundFX = (() => {
  let ctx = null;
  let muted = false;
  let voiceEnabled = true;

  function ensureCtx() {
    if (muted) return null;
    if (!ctx && typeof window !== 'undefined') {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function tone(freq, duration, type = 'sine', gainVal = 0.18, delay = 0) {
    const c = ensureCtx();
    if (!c) return;
    const now = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(gainVal, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function noiseBurst(duration, gainVal = 0.25, delay = 0, filterFreq = 900) {
    const c = ensureCtx();
    if (!c) return;
    const now = c.currentTime + delay;
    const len = Math.floor(c.sampleRate * duration);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.35));
    const src = c.createBufferSource();
    src.buffer = buf;
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(filterFreq, now);
    const g = c.createGain();
    g.gain.setValueAtTime(gainVal, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    src.connect(filt);
    filt.connect(g);
    g.connect(c.destination);
    src.start(now);
  }

  return {
    isMuted: () => muted,
    isVoiceOn: () => voiceEnabled,
    toggleMute() { muted = !muted; if (muted) this.stopSpeech(); return muted; },
    toggleVoice() { voiceEnabled = !voiceEnabled; if (!voiceEnabled) this.stopSpeech(); return voiceEnabled; },

    pop() { tone(540, 0.08, 'triangle', 0.14); tone(760, 0.07, 'sine', 0.1, 0.04); },
    ding() { tone(784, 0.14, 'sine', 0.16); tone(1046.5, 0.28, 'sine', 0.18, 0.09); },
    wrong() { tone(240, 0.2, 'sawtooth', 0.12); tone(175, 0.32, 'sawtooth', 0.14, 0.14); },
    buzzer() {
      tone(310, 0.12, 'square', 0.14);
      tone(465, 0.22, 'sawtooth', 0.16, 0.06);
    },
    gavel() {
      tone(130, 0.11, 'triangle', 0.3);
      noiseBurst(0.09, 0.3, 0, 500);
      tone(125, 0.12, 'triangle', 0.3, 0.18);
      noiseBurst(0.1, 0.32, 0.18, 480);
    },
    tick(urgency = 0.2) {
      const pitch = 420 + urgency * 500;
      tone(pitch, 0.055, 'triangle', 0.1 + urgency * 0.1);
    },
    boom() {
      noiseBurst(0.75, 0.45, 0, 380);
      tone(95, 0.55, 'sawtooth', 0.28);
      tone(58, 0.65, 'sine', 0.3, 0.1);
    },
    fanfare() {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((n, i) => tone(n, 0.26, 'triangle', 0.17, i * 0.09));
    },

    speak(text) {
      if (muted || !voiceEnabled || typeof window === 'undefined' || !window.speechSynthesis) return;
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.06;
        u.pitch = 1.04;
        u.volume = 0.95;
        window.speechSynthesis.speak(u);
      } catch (_) {}
    },
    stopSpeech() {
      try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (_) {}
    },

    supportsMic() {
      return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    },
    listenOnce({ onResult, onEnd, onError }) {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) { onError && onError('Speech recognition not supported on this browser.'); return null; }
      const rec = new SR();
      rec.lang = 'en-US';
      rec.interimResults = true;
      rec.continuous = true;
      let finalText = '';
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) finalText += e.results[i][0].transcript + ' ';
          else interim += e.results[i][0].transcript;
        }
        onResult && onResult((finalText + interim).trim());
      };
      rec.onerror = (e) => onError && onError(e.error);
      rec.onend = () => onEnd && onEnd(finalText.trim());
      try { rec.start(); } catch (err) { onError && onError(err.message); }
      return rec;
    }
  };
})();

if (typeof module !== 'undefined') module.exports = SoundFX;
