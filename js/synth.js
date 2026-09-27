// SynthClear's shared parts: note maths, the harmonic series of the classic waveforms, the lowpass
// filter and ADSR maths, Bessel functions for FM, a real WebAudio subtractive + FM synth with an LFO,
// a TR-808-style drum kit and a 16-step sequencer/arpeggiator, plus a playable 3D keyboard,
// scope and spectrum boards.
//
// The same maths drives both the sound and the pictures. When a note is really sounding, the scope
// and spectrum boards read the live signal from an AnalyserNode; otherwise (muted, before the first
// click, or while the studio records a video) they draw the model, so the boxes always show something true.
import { THREE, M, box, clamp, canvasTexture } from './kit.js';
import { audio } from './ui.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';

const TAU = Math.PI * 2;
export const SR = 48000;                                   // sample rate assumed for the model (most devices run at 44.1 or 48 kHz)

// ---------------------------------------------------------------- notes
// Equal temperament: A4 (MIDI note 69) = 440 Hz, each semitone ×2^(1/12).
export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const midiFreq = (m) => 440 * 2 ** ((m - 69) / 12);
export const midiName = (m) => NOTE_NAMES[((Math.round(m) % 12) + 12) % 12] + (Math.floor(Math.round(m) / 12) - 1);
export const isBlack = (m) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
export const fmtHz = (f) => (f >= 1000 ? (f / 1000).toFixed(f >= 10000 ? 1 : 2) + ' kHz' : Math.round(f) + ' Hz');

// ---------------------------------------------------------------- waveforms
// Fourier series (sine terms) of the four classic waves with peak 1:
//   sawtooth  (2/π)·Σ (−1)^(k+1)·sin(kωt)/k            every harmonic, falling as 1/k
//   square    (4/π)·Σ sin(kωt)/k,  k odd               odd harmonics, 1/k
//   triangle  (8/π²)·Σ (−1)^((k−1)/2)·sin(kωt)/k², k odd  odd harmonics, 1/k²
// N limits how many (non-zero) harmonics are added.
export const WAVES = { sine: 'Sine', triangle: 'Triangle', square: 'Square', sawtooth: 'Sawtooth' };
export function series(wave, N = 64, K = 200) {
  const a = new Float32Array(K + 1);
  let n = 0;
  for (let k = 1; k <= K && n < N; k++) {
    let v = 0;
    if (wave === 'sine') v = k === 1 ? 1 : 0;
    else if (wave === 'sawtooth') v = ((k % 2 ? 1 : -1) * 2) / (Math.PI * k);
    else if (wave === 'square') v = k % 2 ? 4 / (Math.PI * k) : 0;
    else if (wave === 'triangle') v = k % 2 ? ((((k - 1) / 2) % 2 ? -1 : 1) * 8) / (Math.PI * Math.PI * k * k) : 0;
    if (v) { a[k] = v; n++; }
  }
  return a;
}
export const RULE = { sine: 'only the 1st harmonic', sawtooth: 'every harmonic, at 1/n', square: 'odd harmonics, at 1/n', triangle: 'odd harmonics, at 1/n²' };

// ---------------------------------------------------------------- filter
// Two WebAudio lowpass biquads in series make a 24 dB per octave slope, like Moog's four-pole ladder.
// The first is a flat Butterworth stage (Q = −3.01 dB); resonance lifts the second. WebAudio's
// lowpass Q is in decibels: α = sin(w0) / (2·10^(Q/20)) (Web Audio API spec, BiquadFilterNode).
const BUTTER = -3.0103;
function biquad(f, f0, qdB) {
  const w0 = (TAU * clamp(f0, 10, SR / 2 - 1)) / SR, cw = Math.cos(w0), al = Math.sin(w0) / (2 * 10 ** (qdB / 20));
  const b0 = (1 - cw) / 2, b1 = 1 - cw, b2 = b0, a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
  const w = (TAU * f) / SR, c1 = Math.cos(w), s1 = -Math.sin(w), c2 = Math.cos(2 * w), s2 = -Math.sin(2 * w);
  const nr = b0 + b1 * c1 + b2 * c2, ni = b1 * s1 + b2 * s2, dr = a0 + a1 * c1 + a2 * c2, di = a1 * s1 + a2 * s2;
  const d = dr * dr + di * di;
  return [(nr * dr + ni * di) / d, (ni * dr - nr * di) / d];
}
// Complex response of the whole filter at f: [magnitude, phase].
export function filterH(f, cutoff, res) {
  if (f >= SR / 2) return [0, 0];
  const [r1, i1] = biquad(f, cutoff, BUTTER), [r2, i2] = biquad(f, cutoff, res + BUTTER);
  const re = r1 * r2 - i1 * i2, im = r1 * i2 + i1 * r2;
  return [Math.hypot(re, im), Math.atan2(im, re)];
}
export const dB = (x) => 20 * Math.log10(Math.max(1e-9, x));

// ---------------------------------------------------------------- envelope
// ADSR: a straight rise over A seconds, an exponential fall towards S (time constant D/4, so it is 98%
// of the way there after D), then from the key's release an exponential fall to silence (R/4).
// The audio uses exactly the same curve (linearRamp + setTargetAtTime).
export const ENV_PRESETS = {
  pluck: { A: 0.003, D: 0.35, S: 0, R: 0.25, label: 'Pluck' },
  pad: { A: 1.2, D: 1.0, S: 0.8, R: 2.0, label: 'Pad' },
  organ: { A: 0.005, D: 0.05, S: 1, R: 0.03, label: 'Organ' },
  brass: { A: 0.08, D: 0.35, S: 0.7, R: 0.25, label: 'Brass' },
};
export function envAt(t, tOff, e) {
  const A = Math.max(0.002, e.A), tauD = Math.max(0.002, e.D / 4), tauR = Math.max(0.004, e.R / 4);
  const hold = (u) => (u <= 0 ? 0 : u < A ? u / A : e.S + (1 - e.S) * Math.exp(-(u - A) / tauD));
  if (tOff == null || t < tOff) return hold(t);
  return hold(tOff) * Math.exp(-(t - tOff) / tauR);
}
export const envStage = (t, tOff, e) => (tOff != null && t >= tOff ? 'release' : t < Math.max(0.002, e.A) ? 'attack' : t < e.A + e.D ? 'decay' : 'sustain');

// ---------------------------------------------------------------- FM
// Bessel function of the first kind, Jn(x), by its power series (fine for x up to about 15).
export function besselJ(n, x) {
  n = Math.abs(n);
  let sum = 0, term = (x / 2) ** n;
  for (let k = 1; k <= n; k++) term /= k;
  for (let m = 0; m < 60; m++) {
    sum += term;
    term *= -((x / 2) ** 2) / ((m + 1) * (m + 1 + n));
    if (Math.abs(term) < 1e-12 && m > x) break;
  }
  return sum;
}
// Sine carrier fc, sine modulator fm, index I: sidebands at fc + n·fm with amplitude Jn(I)
// (Chowning 1973). Sidebands that land below zero fold back with their sign flipped.
export function fmSpectrum(fc, ratio, I, nMax = 24) {
  const fm = fc * ratio, lines = new Map();
  for (let n = -nMax; n <= nMax; n++) {
    let f = fc + n * fm, a = besselJ(n, I) * (n < 0 && n % 2 ? -1 : 1);
    if (Math.abs(f) < 1e-6) continue;
    if (f < 0) { f = -f; a = -a; }
    const key = f.toFixed(3);
    lines.set(key, { f, a: (lines.get(key)?.a || 0) + a });
  }
  return [...lines.values()].sort((p, q) => p.f - q.f);
}
// Carson's rule: about 98% of the power sits within fc ± (I + 1)·fm.
export const carson = (fm, I) => 2 * (I + 1) * fm;

// ---------------------------------------------------------------- the patch
// Everything the sound engine needs. Chapters change it with synth.patch({...}).
export const PATCH0 = {
  mode: 'sub',               // 'sub' (oscillators → filter → amp) or 'fm' (two sine operators)
  wave: 'sawtooth', N: 0,    // N = 0: the browser's own band-limited wave; N > 0: only the first N harmonics
  osc2: 0, detune: 7,        // second oscillator level (0–1) and its detune in cents
  cutoff: 20000, res: 0,     // Hz, resonance in dB
  envAmt: 0,                 // how many octaves the envelope opens the filter at its peak
  A: 0.005, D: 0.3, S: 0.8, R: 0.3,
  lfoRate: 5, lfoDepth: 0, lfoTo: 'off',     // 'pitch' | 'filter' | 'amp' | 'off'
  ratio: 1, index: 2,        // FM
  vol: 0.8,
};
const P = { ...PATCH0 };

// Model of what the synth outputs for a note of frequency f at envelope level L: a list of sine
// partials [freq, amp, phase], after the filter. lfo is the LFO's current value (−1…1).
export function partials(p, f, L = 1, lfo = 0) {
  const out = [];
  if (p.mode === 'fm') {
    const I = p.index * L;
    for (const l of fmSpectrum(f, p.ratio, I)) out.push([l.f, l.a * L, 0]);
    return out;
  }
  const cut = effCutoff(p, L, lfo);
  const a = series(p.wave, p.N || 200, 200);
  for (let k = 1; k <= 200; k++) {
    if (!a[k]) continue;
    const fk = k * f;
    if (fk > SR / 2) break;
    if (!p.N && fk > 20000) break;
    const [m, ph] = filterH(fk, cut, p.res);
    out.push([fk, a[k] * m * L * (1 + p.osc2 * 0.9), ph]);
  }
  return out;
}
export const effCutoff = (p, L = 0, lfo = 0) => clamp(p.cutoff * 2 ** (p.envAmt * L + (p.lfoTo === 'filter' ? lfo * p.lfoDepth * 2 : 0)), 10, SR / 2 - 1);
// n samples of the waveform spanning `periods` periods of f.
export function modelWave(p, f, L, n = 400, periods = 2.5, lfo = 0) {
  const y = new Float32Array(n);
  if (p.mode === 'fm') {
    const I = p.index * L;
    for (let i = 0; i < n; i++) { const t = (i / n) * periods / f; y[i] = L * Math.sin(TAU * f * t + I * Math.sin(TAU * f * p.ratio * t)); }
    return y;
  }
  const parts = partials(p, f, L, lfo);
  for (const [fk, ak, ph] of parts) {
    const w = (TAU * fk / f) * periods / n;
    for (let i = 0; i < n; i++) y[i] += ak * Math.sin(w * i + ph);
  }
  return y;
}

// ---------------------------------------------------------------- the sound engine
// Sound starts only after a real click or key press, respects the mute button, and never plays while
// the studio is recording a video (body.gb-reel or ?reel=1).
let ctx = null, master = null, voiceBus = null, trem = null, analyser = null, noise = null;
let lfo = null, lfoPitch = null, lfoFilter = null, lfoAmp = null, gestured = false;
const voices = [];
const waves = new Map();
if (typeof window !== 'undefined') {
  const mark = () => { gestured = true; };
  ['pointerdown', 'keydown', 'touchstart'].forEach((t) => window.addEventListener(t, mark, { capture: true, passive: true }));
}
export const recording = () => document.body.classList.contains('gb-reel') || /[?&]reel=1/.test(location.search);

function ready() {
  if (audio.muted || recording()) return null;
  if (!gestured && !navigator.userActivation?.hasBeenActive) return null;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (!master) {
      master = ctx.createGain(); master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
      analyser = ctx.createAnalyser(); analyser.fftSize = 4096; analyser.smoothingTimeConstant = 0.55;
      master.connect(comp); comp.connect(ctx.destination); comp.connect(analyser);
      // A small room, so notes don't sound bone dry.
      const conv = ctx.createConvolver(), len = Math.floor(ctx.sampleRate * 1.8), ir = ctx.createBuffer(2, len, ctx.sampleRate);
      let seed = 11;
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) { seed = (seed * 16807) % 2147483647; d[i] = ((seed / 2147483647) * 2 - 1) * Math.exp((-5 * i) / len); } }
      conv.buffer = ir;
      const wet = ctx.createGain(); wet.gain.value = 0.1; wet.connect(conv).connect(master);
      voiceBus = ctx.createGain(); voiceBus.gain.value = 1;
      trem = ctx.createGain(); trem.gain.value = 1;
      voiceBus.connect(trem); trem.connect(master); trem.connect(wet);
      // The LFO: one slow oscillator shared by every voice, sent to pitch, filter or loudness.
      lfo = ctx.createOscillator(); lfo.type = 'triangle'; lfo.frequency.value = P.lfoRate;
      lfoPitch = ctx.createGain(); lfoFilter = ctx.createGain(); lfoAmp = ctx.createGain();
      [lfoPitch, lfoFilter, lfoAmp].forEach((g) => { g.gain.value = 0; lfo.connect(g); });
      lfoAmp.connect(trem.gain);
      lfo.start();
      noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
      const nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) { seed = (seed * 16807) % 2147483647; nd[i] = (seed / 2147483647) * 2 - 1; }
      applyLive();
    }
    return ctx;
  } catch { return null; }
}

function periodic(wave, N) {
  const key = wave + N;
  if (!waves.has(key)) {
    const a = series(wave, N, 256), real = new Float32Array(257), imag = new Float32Array(257);
    imag.set(a.subarray(0, 257));
    waves.set(key, ctx.createPeriodicWave(real, imag));
  }
  return waves.get(key);
}
function setWave(o, wave, N) { if (N) o.setPeriodicWave(periodic(wave, N)); else o.type = wave; }

// Push the patch's live settings (filter, LFO, waves) to the sounding voices.
function applyLive() {
  if (!ctx || !lfo) return;
  const t = ctx.currentTime;
  lfo.frequency.setTargetAtTime(P.lfoRate, t, 0.02);
  const d = P.lfoTo === 'off' ? 0 : P.lfoDepth;
  lfoPitch.gain.setTargetAtTime(P.lfoTo === 'pitch' ? d * 100 : 0, t, 0.02);        // up to ±1 semitone of vibrato
  lfoFilter.gain.setTargetAtTime(P.lfoTo === 'filter' ? d * 2400 : 0, t, 0.02);     // up to ±2 octaves of wah
  lfoAmp.gain.setTargetAtTime(P.lfoTo === 'amp' ? d * 0.5 : 0, t, 0.02);            // up to ±50% tremolo
  trem.gain.setTargetAtTime(P.lfoTo === 'amp' ? 1 - d * 0.5 : 1, t, 0.02);
  for (const v of voices) {
    if (v.off) continue;
    v.filters.forEach((fl, i) => { fl.frequency.setTargetAtTime(clamp(P.cutoff, 10, ctx.sampleRate / 2), t, 0.015); if (i) fl.Q.setTargetAtTime(P.res + BUTTER, t, 0.015); });
    if (v.mode === 'sub') {
      if (v.wave !== P.wave || v.N !== P.N) { v.oscs.forEach((o) => setWave(o, P.wave, P.N)); v.wave = P.wave; v.N = P.N; }
      if (v.oscs[1]) { v.oscs[1].detune.setTargetAtTime(P.detune, t, 0.02); v.mix2.gain.setTargetAtTime(P.osc2 * 0.9, t, 0.02); }
    } else if (v.mod) {
      v.mod.frequency.setTargetAtTime(v.f * P.ratio, t, 0.02);
      v.modDepth.gain.setTargetAtTime(P.index * v.f * P.ratio, t, 0.02);
    }
  }
}

function releaseVoice(v, t, tau) {
  if (v.off) return;
  v.off = true;
  const L = envAt(t - v.t0, null, v.env);
  const hold = (param, val) => { try { param.cancelScheduledValues(t); param.setValueAtTime(val, t); param.setTargetAtTime(0, t, tau); } catch { /* ignore */ } };
  hold(v.vca.gain, L * v.peak);
  v.filters.forEach((fl) => hold(fl.detune, P.envAmt * 1200 * L));
  if (v.env2) hold(v.env2.gain, L);
  v.stopAt = t + tau * 8 + 0.05;
  v.srcs.forEach((o) => { try { o.stop(v.stopAt); } catch { /* already stopped */ } });
}

// Start a note. when: ctx time (default now); dur: release it automatically after dur seconds.
function voiceOn(m, vel = 0.8, when = 0, dur = 0) {
  const ac = ready(); if (!ac) return null;
  const t = Math.max(ac.currentTime + 0.005, when || 0), f = midiFreq(m), env = { A: P.A, D: P.D, S: P.S, R: P.R };
  for (const v of voices) if (v.m === m && !v.off && !dur) releaseVoice(v, t, 0.01);
  const vca = ac.createGain(); vca.gain.value = 0;
  const f1 = ac.createBiquadFilter(), f2 = ac.createBiquadFilter();
  f1.type = f2.type = 'lowpass';
  f1.frequency.value = f2.frequency.value = clamp(P.cutoff, 10, ac.sampleRate / 2);
  f1.Q.value = BUTTER; f2.Q.value = P.res + BUTTER;
  lfoFilter.connect(f1.detune); lfoFilter.connect(f2.detune);
  f1.connect(f2).connect(vca).connect(voiceBus);
  const v = { m, f, t0: t, tOff: null, env, vca, filters: [f1, f2], oscs: [], srcs: [], off: false, peak: 0.22 * (0.4 + 0.6 * vel) * P.vol, mode: P.mode };
  if (P.mode === 'fm') {
    // Two operators: the modulator's output wobbles the carrier's frequency by up to index × fm hertz.
    const car = ac.createOscillator(), mod = ac.createOscillator(), depth = ac.createGain(), env2 = ac.createGain();
    car.frequency.value = f; mod.frequency.value = f * P.ratio;
    depth.gain.value = P.index * f * P.ratio;
    env2.gain.value = 0;                                  // the index follows the envelope: bright attack, mellow tail
    mod.connect(depth).connect(env2).connect(car.frequency);
    lfoPitch.connect(car.detune); lfoPitch.connect(mod.detune);
    car.connect(f1);
    v.oscs = [car]; v.mod = mod; v.modDepth = depth; v.env2 = env2; v.srcs = [car, mod];
    v.peak *= 0.9;
  } else {
    const o1 = ac.createOscillator(); setWave(o1, P.wave, P.N); o1.frequency.value = f; o1.connect(f1);
    lfoPitch.connect(o1.detune);
    const o2 = ac.createOscillator(); setWave(o2, P.wave, P.N); o2.frequency.value = f; o2.detune.value = P.detune;
    const mix2 = ac.createGain(); mix2.gain.value = P.osc2 * 0.9; o2.connect(mix2).connect(f1);
    lfoPitch.connect(o2.detune);
    v.oscs = [o1, o2]; v.mix2 = mix2; v.srcs = [o1, o2]; v.wave = P.wave; v.N = P.N;
    v.peak /= 1 + P.osc2 * 0.9;
    if (P.wave === 'sine' || P.wave === 'triangle') v.peak *= 1.3;
  }
  // Envelope: amp, filter (in cents on each filter's detune) and FM index share one ADSR.
  const A = Math.max(0.002, env.A), tauD = Math.max(0.002, env.D / 4);
  const sched = (param, top) => { param.setValueAtTime(0, t); param.linearRampToValueAtTime(top, t + A); param.setTargetAtTime(top * env.S, t + A, tauD); };
  sched(vca.gain, v.peak);
  if (P.envAmt) v.filters.forEach((fl) => sched(fl.detune, P.envAmt * 1200));
  if (v.env2) sched(v.env2.gain, 1);
  v.srcs.forEach((o) => o.start(t));
  voices.push(v);
  if (dur) { v.autoOff = t + dur; }
  while (voices.filter((x) => !x.off).length > 10) releaseVoice(voices.find((x) => !x.off), ac.currentTime, 0.02);
  return v;
}
function voiceOff(m, when = 0) {
  if (!ctx) return;
  const t = Math.max(ctx.currentTime, when || 0);
  for (const v of voices) if (v.m === m && !v.off && !v.autoOff) { v.tOff = t; releaseVoice(v, t, Math.max(0.004, v.env.R / 4)); }
}
// Housekeeping: release auto-timed notes, drop finished voices.
function sweep() {
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const v of voices) if (v.autoOff && !v.off && v.autoOff <= now + 0.05) { v.tOff = v.autoOff; releaseVoice(v, v.autoOff, Math.max(0.004, v.env.R / 4)); }
  for (let i = voices.length - 1; i >= 0; i--) if (voices[i].off && voices[i].stopAt < now) voices.splice(i, 1);
}

// TR-808-style drums, all synthesised. Kick: a sine whose pitch drops from about 150 to 50 Hz and rings
// out. Hi-hat: six square waves at clashing frequencies (the 808's metallic source, as usually measured
// from its circuit: 205.3, 304.4, 369.6, 522.7, 540 and 800 Hz), high-passed. Snare: a tone plus filtered noise.
const HAT_HZ = [205.3, 304.4, 369.6, 522.7, 540, 800];
function drum(kind, when, vel = 1) {
  const ac = ready(); if (!ac) return;
  const t = Math.max(ac.currentTime + 0.003, when || 0), g = ac.createGain(); g.connect(voiceBus);
  if (kind === 'kick') {
    const o = ac.createOscillator(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.12);
    g.gain.setValueAtTime(0.9 * vel, t); g.gain.setTargetAtTime(0, t + 0.02, 0.18);
    o.connect(g); o.start(t); o.stop(t + 1.2);
  } else if (kind === 'hat') {
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 10000; bp.Q.value = 0.7;
    bp.connect(hp).connect(g);
    for (const hz of HAT_HZ) { const o = ac.createOscillator(); o.type = 'square'; o.frequency.value = hz; o.connect(bp); o.start(t); o.stop(t + 0.2); }
    g.gain.setValueAtTime(0.35 * vel, t); g.gain.setTargetAtTime(0, t, 0.018);
  } else {
    const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = 185;
    const og = ac.createGain(); og.gain.setValueAtTime(0.5 * vel, t); og.gain.setTargetAtTime(0, t, 0.04); o.connect(og).connect(g); o.start(t); o.stop(t + 0.4);
    const src = ac.createBufferSource(); src.buffer = noise;
    const bp = ac.createBiquadFilter(); bp.type = 'highpass'; bp.frequency.value = 1500;
    const ng = ac.createGain(); ng.gain.setValueAtTime(0.45 * vel, t); ng.gain.setTargetAtTime(0, t, 0.06);
    src.connect(bp).connect(ng).connect(g); src.start(t); src.stop(t + 0.5);
    g.gain.value = 1;
  }
}

// A 16-step sequencer on the audio clock (look-ahead scheduling, so timing doesn't wobble with the frame rate).
// pattern: { kick: [16 × 0/1], snare, hat, note: [16 × MIDI or null] }. arp: notes to arpeggiate instead.
const seq = { running: false, bpm: 120, pattern: null, arp: null, gate: 0.6, timer: 0, next: 0, step: 0, queue: [], onStep: null };
function seqTick() {
  if (!ctx || !seq.running) return;
  sweep();
  const dur = 60 / seq.bpm / 4;
  while (seq.next < ctx.currentTime + 0.12) {
    const i = seq.step, t = seq.next, p = seq.pattern;
    if (p) { if (p.kick?.[i]) drum('kick', t); if (p.snare?.[i]) drum('snare', t); if (p.hat?.[i]) drum('hat', t, p.hat[i] > 1 ? 1 : 0.6); }
    const note = seq.arp?.length ? seq.arp[seq.count % seq.arp.length] : p?.note?.[i];
    if (note != null) voiceOn(note, p?.acc?.[i] ? 1 : 0.7, t, dur * seq.gate);
    seq.count++;
    seq.queue.push({ i, t, note });
    seq.next += dur; seq.step = (seq.step + 1) % 16;
  }
  while (seq.queue.length > 2 && seq.queue[1].t <= ctx.currentTime) seq.queue.shift();
}

export const synth = {
  get context() { return ctx; },
  get patchNow() { return P; },
  get voices() { return voices; },
  // Keep the master in step with the mute button (notes already ringing fall silent too).
  sync() {
    if (master && ctx) { const want = audio.muted || recording() ? 0 : 0.9; if (Math.abs(master.gain.value - want) > 0.01) master.gain.setTargetAtTime(want, ctx.currentTime, 0.02); }
    sweep();
  },
  patch(p) { Object.assign(P, p); applyLive(); },
  reset(p = {}) { Object.assign(P, PATCH0, p); applyLive(); },
  noteOn(m, vel = 0.8) { try { return voiceOn(m, vel); } catch { return null; } },
  noteOff(m) { try { voiceOff(m); } catch { /* ignore */ } },
  drum(kind) { try { drum(kind); } catch { /* ignore */ } },
  allOff() { if (ctx) voices.forEach((v) => releaseVoice(v, ctx.currentTime, 0.03)); this.seqStop(); },
  // True when real sound is coming out, so the boards can show the live signal.
  live() { return !!(ctx && analyser && ctx.state === 'running' && !audio.muted && !recording() && voices.some((v) => !v.off || v.stopAt > ctx.currentTime)); },
  scope(buf) { analyser.getFloatTimeDomainData(buf); return ctx.sampleRate; },
  spectrum(buf) { analyser.getFloatFrequencyData(buf); return ctx.sampleRate; },
  get fftSize() { return analyser ? analyser.fftSize : 4096; },
  seqStart(pattern, bpm) {
    const ac = ready(); if (!ac) return false;
    seq.pattern = pattern; seq.bpm = bpm; seq.running = true; seq.step = 0; seq.count = 0; seq.queue = [];
    seq.next = ac.currentTime + 0.06; clearInterval(seq.timer); seq.timer = setInterval(seqTick, 25); seqTick();
    return true;
  },
  seqSet(o) { Object.assign(seq, o); },
  seqStop() { seq.running = false; clearInterval(seq.timer); seq.queue = []; },
  get seqRunning() { return seq.running; },
  // The step you can hear right now.
  seqNow() { if (!seq.running || !ctx) return null; const q = seq.queue.filter((e) => e.t <= ctx.currentTime); return q.length ? q[q.length - 1] : null; },
};

// ---------------------------------------------------------------- notes as the pictures see them
// Player keeps the notes you are holding on its own clock (advanced by the chapter's update), so the
// pictures work with or without sound, and in recorded videos. It plays them through the synth too.
export class Player {
  constructor(env) { this.env = env; this.time = 0; this.notes = []; this.timers = []; this.onMsg = null; this.sound = true; }
  down(m, vel = 100, sound = this.sound) {
    this.up(m, true);
    const n = { m, vel, t0: this.time, tOff: null };
    this.notes.push(n); this.last = n;
    if (sound) synth.noteOn(m, vel / 127);
    this.onMsg?.([0x90, m, vel]);
    return n;
  }
  up(m, quiet = false) {
    for (const n of this.notes) if (n.m === m && n.tOff == null) { n.tOff = this.time; synth.noteOff(m); if (!quiet) this.onMsg?.([0x80, m, 0]); }
  }
  tap(m, hold = 0.4, vel = 100, sound = this.sound) { this.down(m, vel, sound); this.at(hold, () => this.up(m)); }
  // Run fn after `delay` seconds of this player's clock (so recorded videos come out the same every time).
  at(delay, fn) { this.timers.push({ t: this.time + delay, fn }); }
  allUp() { this.timers = []; this.notes.forEach((n) => { if (n.tOff == null) this.up(n.m); }); }
  clear() { this.notes = []; this.timers = []; this.last = null; }
  held() { return this.notes.filter((n) => n.tOff == null).map((n) => n.m); }
  isDown(m) { return this.notes.some((n) => n.m === m && n.tOff == null); }
  level(n = this.last) { return n ? envAt(this.time - n.t0, n.tOff == null ? null : n.tOff - n.t0, this.env()) : 0; }
  update(dt) {
    this.time += Math.max(0, dt);
    const due = this.timers.filter((e) => e.t <= this.time).sort((a, b) => a.t - b.t);
    if (due.length) { this.timers = this.timers.filter((e) => e.t > this.time); due.forEach((e) => e.fn()); }
    const e = this.env();
    this.notes = this.notes.filter((n) => n.tOff == null || n === this.last || this.time - n.tOff < Math.max(0.05, e.R) * 2);
  }
}

// ---------------------------------------------------------------- 3D keyboard
// White keys `w` wide, black keys 58% as wide and 62% as long, standing up. lo/hi are MIDI notes.
export function makeKeyboard(lo, hi, { w = 0.2, len = 1.0, h = 0.12 } = {}) {
  const g = new THREE.Group(), keys = [];
  let whites = 0;
  for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites++;
  const W = whites * w;
  let wi = 0;
  const whiteGeo = new THREE.BoxGeometry(w * 0.94, h, len), blackGeo = new THREE.BoxGeometry(w * 0.58, h * 0.9, len * 0.62);
  whiteGeo.translate(0, 0, len / 2); blackGeo.translate(0, 0, len * 0.31);
  for (let m = lo; m <= hi; m++) {
    const black = isBlack(m);
    const mat = black ? M.plastic(0x15171c, { roughness: 0.3, emissive: new THREE.Color(0), emissiveIntensity: 1 }) : M.plastic(0xf3f1ea, { roughness: 0.35, emissive: new THREE.Color(0), emissiveIntensity: 1 });
    const pivot = new THREE.Group();
    const k = new THREE.Mesh(black ? blackGeo : whiteGeo, mat); k.castShadow = k.receiveShadow = true;
    pivot.add(k);
    const x = black ? -W / 2 + wi * w : -W / 2 + (wi + 0.5) * w;
    pivot.position.set(x, black ? h * 0.75 : 0, -len / 2);
    k.userData.m = m;
    g.add(pivot);
    keys.push({ m, black, pivot, mesh: k, mat, down: 0 });
    if (!black) wi++;
  }
  g.userData.width = W;
  const glow = new THREE.Color(0x4fd1c5);
  return {
    group: g, keys, width: W,
    x: (m) => keys.find((k) => k.m === m)?.pivot.position.x ?? 0,
    // Show which keys are down: they dip and glow.
    show(isDown, dt) {
      for (const k of keys) {
        const want = isDown(k.m) ? 1 : 0;
        k.down += (want - k.down) * Math.min(1, dt * 30);
        k.pivot.rotation.x = k.down * 0.06;
        k.mat.emissive.copy(glow).multiplyScalar(k.down * (k.black ? 0.9 : 0.45));
      }
    },
  };
}

// Play a 3D keyboard with the mouse or a finger (press and hold), and the computer keys
// A W S E D F T G Y H U J K (C up to the next C). Z and X shift the octave. Returns an unbind function.
const KEYMAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12 };
export function bindPlay(stage, kbs, { down, up, octave = 60, onOctave } = {}) {
  const host = stage.host, el = stage.renderer.domElement, ray = new THREE.Raycaster(), v = new THREE.Vector2();
  let base = octave, ptr = null;
  const meshes = () => kbs.flatMap((kb) => (kb.group.visible !== false && isShown(kb.group) ? kb.keys.map((k) => k.mesh) : []));
  const isShown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const hit = (e) => {
    const b = el.getBoundingClientRect();
    v.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
    ray.setFromCamera(v, stage.camera);
    const h = ray.intersectObjects(meshes(), false);
    // Black keys stand above the white ones, so prefer them when both are hit.
    const bl = h.find((x) => isBlack(x.object.userData.m));
    return (bl || h[0])?.object.userData.m;
  };
  const pd = (e) => {
    if (e.button && e.button !== 0) return;
    const m = hit(e);
    if (m == null) return;
    stage.controls.enabled = false;
    ptr = { id: e.pointerId, m };
    down(m);
  };
  const pm = (e) => {
    if (!ptr) { if (!e.buttons) el.style.cursor = hit(e) != null ? 'pointer' : ''; return; }
    if (e.pointerId !== ptr.id) return;
    const m = hit(e);
    if (m != null && m !== ptr.m) { up(ptr.m); ptr.m = m; down(m); }
  };
  const pu = (e) => { if (!ptr || e.pointerId !== ptr.id) return; up(ptr.m); ptr = null; stage.controls.enabled = true; };
  const busy = () => { const a = document.activeElement; return /TEXTAREA|SELECT/.test(a?.tagName) || (a?.tagName === 'INPUT' && /text|search|email|number/.test(a.type)) || document.getElementById('modal')?.hidden === false; };
  const held = new Map();
  const kd = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || busy()) return;
    const k = e.key.toLowerCase();
    if ((k === 'z' || k === 'x') && !e.repeat) { base = clamp(base + (k === 'z' ? -12 : 12), 24, 96); onOctave?.(base); return; }
    if (!(k in KEYMAP) || e.repeat || held.has(k)) return;
    const m = base + KEYMAP[k];
    held.set(k, m); down(m); e.preventDefault();
  };
  const ku = (e) => { const k = e.key.toLowerCase(); if (held.has(k)) { up(held.get(k)); held.delete(k); } };
  host.addEventListener('pointerdown', pd, true);
  window.addEventListener('pointermove', pm);
  window.addEventListener('pointerup', pu); window.addEventListener('pointercancel', pu);
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  return {
    get octave() { return base; },
    dispose() {
      host.removeEventListener('pointerdown', pd, true);
      window.removeEventListener('pointermove', pm); window.removeEventListener('pointerup', pu); window.removeEventListener('pointercancel', pu);
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
      if (ptr) up(ptr.m);
      held.forEach((m) => up(m));
      stage.controls.enabled = true; el.style.cursor = '';
    },
  };
}

// A small 25-key controller keyboard (C3 to C5) in a case, wired to a Player. Used by most chapters.
export function keyDesk(stage, parent, player, { pos = [0, 0, 2], lo = 48, hi = 72, w = 0.2, octave = 60, label = true } = {}) {
  const g = new THREE.Group(); g.position.set(...pos); parent.add(g);
  const kb = makeKeyboard(lo, hi, { w, len: w * 5, h: w * 0.6 });
  kb.group.position.set(0, 0.2, 0); g.add(kb.group);
  const cse = box(kb.width + 0.3, 0.2, w * 5 + 0.35, M.matte(0x202228, { roughness: 0.6 })); cse.position.set(0, 0.1, -0.08); g.add(cse);
  const lbl = label ? stage.label('Play me: click, or type A W S E D F…', [kb.width / 2 + 0.25, 0.3, -w * 2.2], g) : null;
  const input = bindPlay(stage, [kb], { down: (m) => player.down(m), up: (m) => player.up(m), octave });
  return {
    group: g, kb, label: lbl,
    update(dt) { kb.show((m) => player.isDown(m), dt); },
    dispose() { input.dispose(); },
  };
}

// ---------------------------------------------------------------- boards
export function boardMesh(w, h, draw, width) {
  const b = canvasTexture(w, h, draw);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, (width * h) / w), new THREE.MeshBasicMaterial({ map: b.tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
  m.renderOrder = 2;
  return { mesh: m, redraw: b.redraw, canvas: b.canvas };
}
export function panel(g, w, h, title, tag) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(7,8,12,.88)'; g.beginPath(); if (g.roundRect) g.roundRect(0, 0, w, h, 18); else g.rect(0, 0, w, h); g.fill();
  g.strokeStyle = 'rgba(79,209,197,.35)'; g.lineWidth = 2; g.stroke();
  g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '600 26px sans-serif'; g.textAlign = 'left'; g.fillText(title, 24, 40);
  if (tag) { g.font = '600 18px sans-serif'; g.textAlign = 'right'; g.fillStyle = tag === 'LIVE' ? '#ff6b6b' : 'rgba(255,255,255,.45)'; g.fillText(tag === 'LIVE' ? '● LIVE' : tag, w - 24, 38); g.textAlign = 'left'; }
}

// Scope: y samples (−1…1 around 0) across the plot area.
export function drawTrace(g, x0, y0, w, h, y, color = '#4fd1c5', scale = 1) {
  g.strokeStyle = 'rgba(255,255,255,.1)'; g.lineWidth = 1;
  for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(x0 + (i / 8) * w, y0); g.lineTo(x0 + (i / 8) * w, y0 + h); g.stroke(); }
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(x0, y0 + (i / 4) * h); g.lineTo(x0 + w, y0 + (i / 4) * h); g.stroke(); }
  g.strokeStyle = color; g.lineWidth = 4; g.lineJoin = 'round'; g.shadowColor = color; g.shadowBlur = 10;
  g.beginPath();
  for (let i = 0; i < y.length; i++) { const px = x0 + (i / (y.length - 1)) * w, py = y0 + h / 2 - clamp(y[i] * scale, -1.05, 1.05) * (h / 2) * 0.9; if (i) g.lineTo(px, py); else g.moveTo(px, py); }
  g.stroke(); g.shadowBlur = 0;
}

// Live scope samples: trigger on a rising zero crossing, then take `periods` periods of f.
const tbuf = new Float32Array(8192);
export function liveWave(f, n = 400, periods = 2.5) {
  const size = synth.fftSize, buf = tbuf.subarray(0, size), sr = synth.scope(buf);
  const span = Math.min(size - 2, Math.round((periods * sr) / f));
  let i0 = 0;
  for (let i = 1; i < size - span - 1; i++) if (buf[i - 1] < 0 && buf[i] >= 0) { i0 = i; break; }
  let peak = 1e-4; for (let i = 0; i < span; i++) peak = Math.max(peak, Math.abs(buf[i0 + i]));
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) y[i] = buf[i0 + Math.floor((i / n) * span)] / Math.max(peak, 0.05);
  return y;
}
const fbuf = new Float32Array(4096);
export function liveSpectrum() { const n = synth.fftSize / 2, b = fbuf.subarray(0, n), sr = synth.spectrum(b); return { db: b, sr, n }; }

// Spectrum axes: log frequency fLo…fHi across, dB (dbLo…0) up.
export function specAxes(g, x0, y0, w, h, { fLo = 50, fHi = 12000, dbLo = -60 } = {}) {
  const X = (f) => x0 + (Math.log(f / fLo) / Math.log(fHi / fLo)) * w;
  const Y = (d) => y0 + (clamp(d, dbLo, 6) / dbLo) * h;
  g.strokeStyle = 'rgba(255,255,255,.1)'; g.lineWidth = 1; g.fillStyle = 'rgba(255,255,255,.5)'; g.font = '17px sans-serif'; g.textAlign = 'center';
  for (const f of [100, 200, 500, 1000, 2000, 5000, 10000]) { if (f < fLo || f > fHi) continue; g.beginPath(); g.moveTo(X(f), y0); g.lineTo(X(f), y0 + h); g.stroke(); g.fillText(fmtHz(f).replace('.00', ''), X(f), y0 + h + 20); }
  g.textAlign = 'right';
  for (let d = 0; d >= dbLo; d -= 20) { g.beginPath(); g.moveTo(x0, Y(d)); g.lineTo(x0 + w, Y(d)); g.stroke(); g.fillText(d + ' dB', x0 - 6, Y(d) + 6); }
  g.textAlign = 'left';
  return { X, Y };
}

// A scope board: the live output when sound is playing, the model otherwise.
export function scopeBoard(width = 3, { title = 'Oscilloscope: the wave', periods = 2.5, color = '#4fd1c5', px = [900, 380] } = {}) {
  let st = null, acc = 1;
  const b = boardMesh(px[0], px[1], (g, w, h) => {
    panel(g, w, h, title, st ? (st.live ? 'LIVE' : 'MODEL') : '');
    if (!st) return;
    drawTrace(g, 24, 62, w - 48, h - 104, st.y, color, st.live ? 0.9 : 0.85);
    g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '19px sans-serif'; g.fillText(st.text, 24, h - 16);
  }, width);
  return {
    mesh: b.mesh,
    update(dt, p, f, L, lfo = 0, text = '') {
      acc += Math.max(0, dt); if (acc < 1 / 30) return; acc = 0;
      const live = synth.live() && L > 0.001;
      const y = live ? liveWave(f, 400, periods) : modelWave(p, f, L, 400, periods, lfo);
      st = { live, y, text }; b.redraw();
    },
  };
}
// A spectrum board: harmonics as lines (model) or the live FFT, with an optional curve (dB at f) on top.
export function spectrumBoard(width = 3, { title = 'Spectrum: the harmonics', fLo = 50, fHi = 12000, dbLo = -60, px = [900, 420], curve = null, curveLabel = '' } = {}) {
  let st = null, acc = 1;
  const b = boardMesh(px[0], px[1], (g, w, h) => {
    panel(g, w, h, title, st ? (st.live ? 'LIVE' : 'MODEL') : '');
    if (!st) return;
    const x0 = 78, y0 = 66, pw = w - 100, ph = h - 120;
    const { X, Y } = specAxes(g, x0, y0, pw, ph, { fLo, fHi, dbLo });
    if (st.live) {
      const { db, sr, n } = st.fft;
      g.strokeStyle = '#ffb547'; g.lineWidth = 2.5; g.beginPath(); let first = true;
      for (let i = 1; i < n; i++) { const f = (i * sr) / (2 * n); if (f < fLo || f > fHi) continue; const x = X(f), y = Y(db[i] + 24); if (first) { g.moveTo(x, y); first = false; } else g.lineTo(x, y); }
      g.stroke();
    } else {
      for (const [f, a] of st.parts) {
        if (f < fLo || f > fHi) continue;
        const d = dB(Math.abs(a)); if (d < dbLo) continue;
        g.strokeStyle = '#ffb547'; g.lineWidth = 5; g.beginPath(); g.moveTo(X(f), Y(dbLo)); g.lineTo(X(f), Y(d)); g.stroke();
        g.fillStyle = '#ffd89a'; g.beginPath(); g.arc(X(f), Y(d), 5, 0, TAU); g.fill();
      }
    }
    if (st.curve) {
      g.strokeStyle = '#4fd1c5'; g.lineWidth = 4; g.shadowColor = '#4fd1c5'; g.shadowBlur = 8; g.beginPath();
      for (let i = 0; i <= 200; i++) { const f = fLo * (fHi / fLo) ** (i / 200), x = X(f), y = Y(st.curve(f)); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke(); g.shadowBlur = 0;
      if (curveLabel) { g.fillStyle = '#4fd1c5'; g.font = '600 19px sans-serif'; g.textAlign = 'right'; g.fillText(curveLabel, w - 24, h - 14); g.textAlign = 'left'; }
    }
    if (st.text) { g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '19px sans-serif'; g.fillText(st.text, 24, h - 14); }
  }, width);
  return {
    mesh: b.mesh,
    update(dt, p, f, L, lfo = 0, text = '', force = false) {
      acc += Math.max(0, dt); if (acc < 1 / 20 && !force) return; acc = 0;
      const live = synth.live() && L > 0.001;
      st = { live, parts: live ? null : partials(p, f, Math.max(L, 1e-6), lfo), fft: live ? liveSpectrum() : null, curve: curve ? (x) => curve(x, p, L, lfo) : null, text };
      b.redraw();
    },
  };
}

// A polyline drawn with fat lines (LineSegments2). set(points) takes an array of [x, y, z].
export function fatLine(stage, color, width, max = 256, opacity = 1) {
  const geo = new LineSegmentsGeometry();
  geo.setPositions(new Float32Array(max * 6));
  const mat = stage.lineMaterial({ color, linewidth: width, transparent: opacity < 1, opacity, depthTest: true });
  const line = new LineSegments2(geo, mat); line.frustumCulled = false;
  const arr = geo.attributes.instanceStart.data.array;
  line.set = (pts) => {
    const n = Math.min(max, pts.length - 1);
    for (let i = 0; i < max; i++) {
      const p = pts[Math.min(i, n)], q = pts[Math.min(i + 1, n)] || p, o = i * 6;
      if (i < n) { arr[o] = p[0]; arr[o + 1] = p[1]; arr[o + 2] = p[2]; arr[o + 3] = q[0]; arr[o + 4] = q[1]; arr[o + 5] = q[2]; }
      else { const z = pts[n]; arr[o] = arr[o + 3] = z[0]; arr[o + 1] = arr[o + 4] = z[1]; arr[o + 2] = arr[o + 5] = z[2]; }
    }
    geo.attributes.instanceStart.data.needsUpdate = true;
  };
  return line;
}

// On a phone the readout sits over the model, so keep its headline and first rows only.
export function compact(html, stage, rows = 2) {
  if (stage.host.clientWidth >= 560) return html;
  let k = 0;
  return html.replace(/<small>[\s\S]*?<\/small>/g, '').replace(/<div class="(row|no)">[\s\S]*?<\/div>/g, (m) => (++k <= rows ? m : ''));
}

// A knob: a short cylinder with a pointer line, turned by value 0…1 over 300°.
export function knob(r = 0.09, col = 0x1b1d22) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, r * 0.9, 24), M.plastic(col, { roughness: 0.4 }));
  body.position.y = r * 0.45; body.castShadow = true;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, 0.01, 24), M.metal(0xc9ced8, { roughness: 0.3 })); cap.position.y = r * 0.91;
  const tick = box(r * 0.14, 0.012, r * 0.75, M.glow(0xffffff)); tick.position.set(0, r * 0.93, -r * 0.4);
  const turn = new THREE.Group(); turn.add(body, cap, tick); g.add(turn);
  g.set = (k) => { turn.rotation.y = (0.5 - clamp(k, 0, 1)) * (300 / 180) * Math.PI; };
  g.set(0.5);
  return g;
}

export { TAU };
