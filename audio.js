// audio.js — every sound is generated with the Web Audio API: no audio files.
// Engine hum, police siren, gunshots, chimes, a jingle and a slow synthwave music loop.
export function createAudio() {
  const A = {
    ctx: null, master: null, musicGain: null, engineOsc: null, engineOsc2: null,
    engineFilter: null, engineGain: null, sirenOsc: null, sirenGain: null,
    sirenTimer: 0, sirenHigh: false, musicTimer: 0, musicStep: 0, muted: false, started: false,
  };

  function ensure() {
    if (A.ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      A.ctx = new AC();
      A.master = A.ctx.createGain();
      A.master.gain.value = A.muted ? 0 : 0.55;
      A.master.connect(A.ctx.destination);
      A.musicGain = A.ctx.createGain();
      A.musicGain.gain.value = 0.16;
      A.musicGain.connect(A.master);
      // Engine: two detuned saws through a low-pass, pitch follows speed.
      A.engineFilter = A.ctx.createBiquadFilter();
      A.engineFilter.type = 'lowpass';
      A.engineFilter.frequency.value = 420;
      A.engineGain = A.ctx.createGain();
      A.engineGain.gain.value = 0;
      A.engineOsc = A.ctx.createOscillator();
      A.engineOsc.type = 'sawtooth';
      A.engineOsc.frequency.value = 55;
      A.engineOsc2 = A.ctx.createOscillator();
      A.engineOsc2.type = 'square';
      A.engineOsc2.frequency.value = 28;
      A.engineOsc.connect(A.engineFilter);
      A.engineOsc2.connect(A.engineFilter);
      A.engineFilter.connect(A.engineGain);
      A.engineGain.connect(A.master);
      A.engineOsc.start();
      A.engineOsc2.start();
      // Siren: a triangle wave that alternates two notes.
      A.sirenOsc = A.ctx.createOscillator();
      A.sirenOsc.type = 'triangle';
      A.sirenOsc.frequency.value = 660;
      A.sirenGain = A.ctx.createGain();
      A.sirenGain.gain.value = 0;
      A.sirenOsc.connect(A.sirenGain);
      A.sirenGain.connect(A.master);
      A.sirenOsc.start();
      return true;
    } catch (e) { return false; }
  }

  function tone(freq, dur, type, vol, when, slideTo) {
    if (!A.ctx) return;
    const t0 = A.ctx.currentTime + (when || 0);
    const o = A.ctx.createOscillator();
    const g = A.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.25, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(A.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noiseBurst(dur, vol, filterFreq) {
    if (!A.ctx) return;
    const len = Math.max(1, Math.floor(A.ctx.sampleRate * dur));
    const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = A.ctx.createBufferSource();
    src.buffer = buf;
    const f = A.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq || 1800;
    const g = A.ctx.createGain();
    g.gain.value = vol || 0.5;
    src.connect(f); f.connect(g); g.connect(A.master);
    src.start();
  }

  // Am F C G, slow pads + a bass note per bar, looped forever.
  const CHORDS = [
    [220.00, 261.63, 329.63], [174.61, 220.00, 261.63],
    [196.00, 246.94, 293.66], [164.81, 196.00, 246.94],
  ];
  const BASS = [110.00, 87.31, 98.00, 82.41];

  return {
    init() { if (ensure()) { A.started = true; if (A.ctx.state === 'suspended') A.ctx.resume(); } },
    get started() { return A.started; },
    toggleMute() {
      A.muted = !A.muted;
      if (A.master) A.master.gain.value = A.muted ? 0 : 0.55;
      return A.muted;
    },
    setEngine(speed01, driving) {
      if (!A.ctx) return;
      const target = driving ? 0.05 + speed01 * 0.11 : 0;
      A.engineGain.gain.setTargetAtTime(target, A.ctx.currentTime, 0.08);
      const f = 55 + speed01 * 165;
      A.engineOsc.frequency.setTargetAtTime(f, A.ctx.currentTime, 0.08);
      A.engineOsc2.frequency.setTargetAtTime(f * 0.5, A.ctx.currentTime, 0.08);
      A.engineFilter.frequency.setTargetAtTime(380 + speed01 * 1400, A.ctx.currentTime, 0.1);
    },
    siren(on) {
      if (!A.ctx) return;
      A.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, A.ctx.currentTime, 0.1);
    },
    gunshot() { noiseBurst(0.16, 0.6, 2600); tone(160, 0.12, 'square', 0.18, 0, 60); },
    honk() { tone(370, 0.28, 'square', 0.12); tone(466, 0.28, 'square', 0.10); },
    chime() { tone(880, 0.18, 'sine', 0.22); tone(1318, 0.3, 'sine', 0.2, 0.09); },
    jingle() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.32, 'triangle', 0.22, i * 0.13));
    },
    thud() { noiseBurst(0.22, 0.4, 500); },
    update(dt) {
      if (!A.ctx) return;
      // Siren wail: alternate 660 / 880 Hz every 0.35 s while audible.
      if (A.sirenGain && A.sirenGain.gain.value > 0.005) {
        A.sirenTimer += dt;
        if (A.sirenTimer > 0.35) {
          A.sirenTimer = 0;
          A.sirenHigh = !A.sirenHigh;
          A.sirenOsc.frequency.setTargetAtTime(A.sirenHigh ? 880 : 660, A.ctx.currentTime, 0.05);
        }
      }
      // Music: one soft pad chord per 2.4 s bar.
      A.musicTimer += dt;
      if (A.musicTimer > 2.4) {
        A.musicTimer = 0;
        const chord = CHORDS[A.musicStep % CHORDS.length];
        const bass = BASS[A.musicStep % BASS.length];
        A.musicStep++;
        chord.forEach((f) => tone(f, 2.6, 'sawtooth', 0.028));
        tone(bass, 2.4, 'sine', 0.10);
      }
    },
  };
}
