/* Mimi's voice.

   The meows, chirp and purr are real waveforms in ../assets, made by
   tools/make-sounds.py (a source-filter model: harmonic source + moving formants).
   Swap in your own recordings with the same file names and nothing else changes.
   If a file is missing we fall back to a synthesised meow so the app never breaks. */
(function () {
  'use strict';

  const FILES = {
    meow: ['meow-1.wav', 'meow-2.wav', 'meow-3.wav', 'meow-4.wav', 'meow-5.wav'],
    chirp: ['chirp.wav'],
    purr: ['purr.wav']
  };

  let ctx = null;
  let cfg = { sound: true, volume: 0.5 };
  let lastSoundAt = 0;
  const buffers = {};      // filename -> AudioBuffer
  let loading = null;

  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      ctx = new C();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function loadAll() {
    if (loading) return loading;
    const a = ac();
    const names = [].concat(FILES.meow, FILES.chirp, FILES.purr);
    loading = Promise.all(names.map((name) =>
      fetch('../assets/' + name)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
        .then((buf) => new Promise((res, rej) => a.decodeAudioData(buf, res, rej)))
        .then((decoded) => { buffers[name] = decoded; })
        .catch((err) => { console.warn('[mimi] no ' + name + ':', err.message); })
    ));
    return loading;
  }

  function allowed(minGapMs) {
    if (!cfg.sound || cfg.volume <= 0) return false;
    const now = performance.now();
    if (now - lastSoundAt < (minGapMs || 0)) return false;
    lastSoundAt = now;
    return true;
  }

  function playBuffer(name, opts) {
    const buf = buffers[name];
    if (!buf) return false;
    const a = ac();
    const src = a.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate || 1;

    const gain = a.createGain();
    gain.gain.value = (opts.gain === undefined ? 1 : opts.gain) * cfg.volume;

    let node = src;
    if (opts.muffle) {
      const lp = a.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = opts.muffle;
      node.connect(lp);
      node = lp;
    }
    if (opts.pan !== undefined && a.createStereoPanner) {
      const pan = a.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, opts.pan));
      node.connect(pan);
      node = pan;
    }
    node.connect(gain).connect(a.destination);
    src.start();
    return true;
  }

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  /* ---- fallback synth, only used if the wavs are missing --------------- */
  function synthMeow(pitch, urgency) {
    const a = ac();
    const t = a.currentTime;
    const base = 420 * (pitch || 1) * (1 + (urgency || 0) * 0.25);
    const dur = 0.42;
    const osc = a.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base * 0.85, t);
    osc.frequency.linearRampToValueAtTime(base * 1.22, t + dur * 0.28);
    osc.frequency.linearRampToValueAtTime(base * 0.72, t + dur);
    const band = a.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 5;
    band.frequency.setValueAtTime(700, t);
    band.frequency.linearRampToValueAtTime(1500, t + dur * 0.3);
    band.frequency.linearRampToValueAtTime(900, t + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22 * cfg.volume, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(band).connect(g).connect(a.destination);
    osc.start(t);
    osc.stop(t + dur + 0.1);
  }

  /* ---- the voice ------------------------------------------------------- */
  function meow(pitch, urgency, pan) {
    if (!allowed(200)) return;
    loadAll();
    const u = urgency || 0;
    // when they're late they use the longer, more insistent calls
    // const name = u > 0.5 ? pick(['meow-2.wav', 'meow-4.wav', 'meow-1.wav']) : pick(FILES.meow);
    const name = u > 0.5 ? pick(['meow-5.wav']) : pick(FILES.meow);
    const ok = playBuffer(name, {
      rate: (pitch || 1) * (0.94 + Math.random() * 0.12) * (1 + u * 0.06),
      gain: 0.55 + u * 0.25,
      pan: pan
    });
    if (!ok) synthMeow(pitch, u);
  }

  function purr(pitch, pan) {
    if (!allowed(150)) return;
    loadAll();
    playBuffer('purr.wav', { rate: (pitch || 1) * 0.98, gain: 0.5, pan: pan });
  }

  function yay(pitch, pan) {
    if (!allowed(0)) return;
    loadAll();
    const ok = playBuffer('chirp.wav', { rate: (pitch || 1) * (0.97 + Math.random() * 0.1), gain: 0.6, pan: pan });
    if (!ok) synthMeow((pitch || 1) * 1.4, 0);
  }

  function grumble(pitch, pan) {
    if (!allowed(250)) return;
    loadAll();
    const ok = playBuffer('meow-2.wav', { rate: (pitch || 1) * 0.68, gain: 0.5, muffle: 900, pan: pan });
    if (!ok) synthMeow((pitch || 1) * 0.6, 0);
  }

  window.PetAudio = {
    setConfig(c) {
      cfg = Object.assign(cfg, c || {});
      if (cfg.sound && cfg.volume > 0) loadAll();
    },
    preload: loadAll,
    meow, purr, yay, grumble
  };
})();
