// Chapter 2: waveforms and harmonics. Any repeating wave is a sum of sine waves at whole-number
// multiples of its frequency (Fourier). Build a wave harmonic by harmonic, see it and hear it.
import { THREE, clamp } from '../kit.js';
import { synth, Player, keyDesk, scopeBoard, spectrumBoard, series, fatLine, midiFreq, midiName, fmtHz, compact, WAVES, RULE } from '../synth.js';

const NOTE = 57;                                   // A3 = 220 Hz
const X0 = -3.4, X1 = 1.6;                         // two periods drawn from X0 to X1
const Y = 1.25, AMP = 1.15, DZ = 0.32, DY = 0.36, Y1 = 2.45, SHOW = 12;   // sum's baseline, height of amplitude 1, layer steps back and up, layers drawn
const COLORS = [0x4fd1c5, 0xffb547, 0xff7a59, 0x9b7bff, 0x5ce1a9, 0x7aa2ff];
const ordinal = (k) => k + (k % 10 === 1 && k !== 11 ? 'st' : k % 10 === 2 && k !== 12 ? 'nd' : k % 10 === 3 && k !== 13 ? 'rd' : 'th');
const patchFor = (s) => ({ mode: 'sub', wave: s.wave, N: Math.round(s.N), osc2: 0, cutoff: 20000, res: 0, envAmt: 0, A: 0.02, D: 0.1, S: 1, R: 0.2, lfoTo: 'off', vol: 0.8 });

export default {
  id: 'waves',
  short: 'Waves and harmonics',
  title: 'Waves and harmonics',
  subtitle: 'Every tone is a stack of pure sine waves. The stack sets the sound.',
  view: { pos: [3.0, 4.6, 8.4], target: [0.05, 2.3, -1.2] },
  learn: `<p>An oscillator makes a wave that repeats, and how many times a second it repeats is the note's <b>frequency</b>. A3 repeats <b>220 times a second</b>: 220 hertz (Hz). But the <b>shape</b> of the wave matters too. That is why a flute and a violin playing the same note sound different.</p>
    <p>In 1807 Joseph Fourier showed that any repeating wave can be built by adding up plain <b>sine waves</b>, at 1, 2, 3, 4… times the main frequency. These are the <b>harmonics</b>. Each wave shape is just a recipe:</p>
    <p>A <b>sine</b> wave is one harmonic alone: a pure, soft tone. A <b>sawtooth</b> has every harmonic, the nth one 1/n as strong: bright and buzzy, like brass or strings. A <b>square</b> has only the odd harmonics (1, 3, 5…) at 1/n: hollow, like a clarinet. A <b>triangle</b> has the odd ones too, but they fade as 1/n², so it is much softer.</p>
    <p>The layers behind show each harmonic. The glowing line in front is their sum: the wave the speaker plays. The boards show the live signal when you play: a <b>scope</b> for the shape, a <b>spectrum</b> for the harmonics.</p>
    <p class="tip"><b>Try it:</b> pick sawtooth and set the harmonics to 1. Play a note, then add harmonics one at a time and hear the tone get brighter as the sine turns into a saw.</p>`,
  terms: [
    { t: 'Frequency', d: 'How many times a second a wave repeats, in hertz (Hz). It sets the pitch.' },
    { t: 'Sine wave', d: 'The smoothest possible wave, with one frequency only. It sounds pure, like a tuning fork.' },
    { t: 'Harmonic', d: 'A sine wave at a whole-number multiple (2×, 3×, 4×…) of the main frequency.' },
    { t: 'Timbre', d: 'The colour of a sound, set by the mix of harmonics. Say “tam-ber”.' },
    { t: 'Fourier series', d: 'Writing a repeating wave as a sum of sine waves at whole-number multiples of its frequency.' },
    { t: 'Spectrum', d: 'A picture of how strong each frequency in a sound is.' },
  ],
  defaults: { wave: 'sawtooth', N: 6 },
  controls: [
    { key: 'wave', type: 'seg', label: 'Wave shape', options: Object.entries(WAVES).map(([v, label]) => ({ v, label })), fmt: (v) => RULE[v] },
    { key: 'N', type: 'range', label: 'Harmonics added', min: 1, max: 40, step: 1, fmt: (v, s) => (s.wave === 'sine' ? '1 (a sine has only one)' : `${Math.round(v)}`) },
    { key: 'play', type: 'buttons', label: 'Hear it', items: [{ label: '♪ Play A3 (220 Hz)', act: (s, inst) => inst.tap(NOTE, 1.6) }, { label: '♪ Build a saw, one harmonic at a time', act: (s, inst) => inst.build(s) }] },
  ],
  quiz: [
    { q: 'Which wave contains every harmonic, the nth one at 1/n of the strength?', options: ['Sine', 'Square', 'Triangle', 'Sawtooth'], answer: 3, why: 'The sawtooth has them all: 1, 1/2, 1/3, 1/4… That is why it sounds so bright and buzzy.' },
    { q: 'A note has a frequency of 220 Hz. What is the frequency of its 3rd harmonic?', options: ['73 Hz', '223 Hz', '660 Hz', '880 Hz'], answer: 2, why: 'Harmonics sit at whole-number multiples: 3 × 220 Hz = 660 Hz.' },
    { q: 'Why does a triangle wave sound so much softer than a square wave?', options: ['It is quieter overall', 'Its odd harmonics fade as 1/n² instead of 1/n, so the high ones are tiny', 'It has no fundamental', 'It uses even harmonics'], answer: 1, why: 'Both use odd harmonics only, but the triangle’s 3rd is 1/9 and its 5th 1/25 as strong, against 1/3 and 1/5 for a square.' },
  ],
  reel: [
    { ms: 5600, caption: 'Every tone is a stack of sine waves. Add harmonics one by one and a sine turns into a sawtooth.', set: { wave: 'sawtooth' }, anim: { N: [1, 30] }, view: { pos: [2.8, 4.5, 8.0], target: [0.05, 2.3, -1.2] }, spin: 0.1 },
    { ms: 5000, caption: 'A square wave uses only odd harmonics. A triangle’s fade much faster, so it sounds soft.', set: { wave: 'square', N: 12 }, anim: { wave: ['square', 'triangle'] }, view: { pos: [2.2, 4.5, 8.4], target: [0.05, 2.3, -1.2] }, spin: 0.1 },
  ],

  onChange(s) { synth.patch(patchFor(s)); },

  build({ stage, s: s0 }) {
    synth.reset(patchFor(s0));
    const root = new THREE.Group(); stage.root.add(root);
    const player = new Player(() => synth.patchNow);
    const desk = keyDesk(stage, root, player, { pos: [1.5, 0, 2.2] });

    // One fat line per harmonic, layered backwards; the sum in front.
    const layers = Array.from({ length: SHOW }, (_, i) => { const l = fatLine(stage, COLORS[i % COLORS.length], 2.5, 160, 0.9); root.add(l); return l; });
    const sum = fatLine(stage, 0xffffff, 6, 240); root.add(sum);
    const axis = fatLine(stage, 0x3a4150, 1.5, 2); axis.set([[X0, Y, 0.9], [X1, Y, 0.9]]); root.add(axis);
    const layerLabels = [0, 1, 2, 3].map((i) => stage.label('', [X1 + 0.15, Y, -(i + 1) * DZ], root));
    const lSum = stage.label('The sum: what you hear', [X1 - 0.6, Y + 1.35, 0.9], root, 'hot');
    const lMore = stage.label('', [X0 + 0.9, Y1 + SHOW * DY + 0.1, -SHOW * DZ - 0.2], root);

    const scope = scopeBoard(2.9, { title: 'Scope: the shape' });
    scope.mesh.position.set(3.45, 1.75, -1.1); scope.mesh.rotation.y = -0.1; root.add(scope.mesh);
    const spec = spectrumBoard(2.9, { title: 'Spectrum: the harmonics', fLo: 100, fHi: 12000, dbLo: -50 });
    spec.mesh.position.set(3.45, 3.6, -1.1); spec.mesh.rotation.y = -0.1; root.add(spec.mesh);

    let phase = 0, last = null;
    const api = {
      tap(m, hold) { player.tap(m, hold); },
      // Hold A3 and add a harmonic every 0.45 s, up to 12.
      build(s) {
        s.wave = 'sawtooth'; s.N = 1; synth.patch(patchFor(s));
        player.down(NOTE);
        for (let k = 2; k <= 12; k++) player.at((k - 1) * 0.45, () => { s.N = k; synth.patch(patchFor(s)); api.sync?.(); });
        player.at(12 * 0.45 + 0.4, () => player.up(NOTE));
      },
    };
    return {
      ...api,
      update(dt, s) {
        dt = Math.max(0, dt);
        synth.sync(); player.update(dt); desk.update(dt);
        const N = s.wave === 'sine' ? 1 : Math.round(clamp(s.N, 1, 40));
        const a = series(s.wave, N, 200);
        phase += dt * 0.35 * Math.PI * 2 * 0.25;
        const note = player.last && player.level() > 0.001 ? player.last.m : NOTE;
        const f = midiFreq(note);
        // Layers: the non-zero harmonics in order.
        const ks = []; for (let k = 1; k <= 200 && ks.length < N; k++) if (a[k]) ks.push(k);
        const P = 160;
        layers.forEach((l, i) => {
          const k = ks[i]; l.visible = k != null;
          if (!l.visible) return;
          const z = -(i + 1) * DZ, yb = Y1 + i * DY, pts = [];
          for (let j = 0; j <= P; j++) { const u = j / P, th = u * 2 * Math.PI * 2 - phase; pts.push([X0 + u * (X1 - X0), yb + AMP * 0.8 * a[k] * Math.sin(k * th), z]); }
          l.set(pts);
        });
        const pts = [];
        for (let j = 0; j <= 239; j++) { const u = j / 239, th = u * 2 * Math.PI * 2 - phase; let y = 0; for (const k of ks) y += a[k] * Math.sin(k * th); pts.push([X0 + u * (X1 - X0), Y + AMP * y, 0.9]); }
        sum.set(pts);
        layerLabels.forEach((l, i) => { const k = ks[i]; l.visible = k != null; if (k) { l.element.textContent = `${ordinal(k)}: ${fmtHz(k * f)}${i === 0 ? ' (fundamental)' : ''}`; l.position.set(X1 + 0.2, Y1 + i * DY, -(i + 1) * DZ); } });
        lMore.visible = ks.length > SHOW; lMore.element.textContent = `+${ks.length - SHOW} more behind`;
        lSum.position.set(X0 + 0.5, Y - 0.95, 0.9);
        const L = player.level() > 0.001 ? player.level() : 1;
        const txt = `${midiName(note)}, ${fmtHz(f)}: ${WAVES[s.wave].toLowerCase()}, ${N} harmonic${N > 1 ? 's' : ''}`;
        scope.update(dt, synth.patchNow, f, L, 0, txt);
        spec.update(dt, synth.patchNow, f, L, 0, '', last !== s.wave + N);
        last = s.wave + N;
      },
      readout: (s) => {
        const N = s.wave === 'sine' ? 1 : Math.round(s.N), a = series(s.wave, N, 200);
        let top = 1; for (let k = 1; k <= 200; k++) if (a[k]) top = k;
        const note = player.last && player.level() > 0.001 ? player.last.m : NOTE, f = midiFreq(note);
        return compact(`<div class="big">${WAVES[s.wave]}: ${N} harmonic${N > 1 ? 's' : ''}</div>
          <div class="row"><span>Recipe</span><b>${RULE[s.wave]}</b></div>
          <div class="row"><span>Note</span><b>${midiName(note)}, ${fmtHz(f)}</b></div>
          <div class="row"><span>Highest harmonic</span><b>${ordinal(top)}, ${fmtHz(top * f)}</b></div>
          <div class="row"><span>2nd and 3rd</span><b>${(Math.abs(a[2]) / a[1] * 100).toFixed(0)}% and ${(Math.abs(a[3]) / a[1] * 100).toFixed(0)}% of the 1st</b></div>`, stage);
      },
      dispose() { desk.dispose(); synth.allOff(); },
    };
  },
};
