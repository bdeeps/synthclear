// Chapter 3: subtractive synthesis. Start with a bright sawtooth full of harmonics and carve it with a
// resonant lowpass filter (two WebAudio biquads = 24 dB per octave, like a Moog ladder).
import { THREE, M, clamp } from '../kit.js';
import { synth, Player, keyDesk, scopeBoard, spectrumBoard, series, filterH, effCutoff, dB, fatLine, midiFreq, midiName, fmtHz, compact } from '../synth.js';

const NOTE = 45;                                    // A2 = 110 Hz, so the harmonics are easy to count
const F_LO = 50, F_HI = 10000, XL = -3.6, XR = 2.6; // log-frequency axis on the floor
const DB_LO = -54, HMAX = 2.6;                      // 0 dB stands HMAX high; DB_LO is the floor
const X = (f) => XL + (Math.log(f / F_LO) / Math.log(F_HI / F_LO)) * (XR - XL);
const H = (d) => Math.max(0.001, ((clamp(d, DB_LO, 30) - DB_LO) / -DB_LO) * HMAX);
const KMAX = 90;
const patchFor = (s) => ({ mode: 'sub', wave: 'sawtooth', N: 0, osc2: 0, cutoff: s.cutoff, res: s.res, envAmt: s.env, A: 0.01, D: 0.8, S: 0.35, R: 0.35, lfoTo: s.wah ? 'filter' : 'off', lfoRate: 1.6, lfoDepth: 0.75, vol: 0.85 });

export default {
  id: 'filter',
  short: 'The filter',
  title: 'Carving the sound: the filter',
  subtitle: 'Start bright, then take harmonics away. That is subtractive synthesis.',
  view: { pos: [0.5, 4.1, 7.4], target: [0.1, 1.95, -1.0] },
  learn: `<p>Most classic synths use <b>subtractive synthesis</b>. The oscillator makes a bright wave with lots of harmonics, like a sawtooth. Then a <b>filter</b> takes some away, the way a sculptor carves stone.</p>
    <p>The usual filter is a <b>lowpass</b>: low frequencies pass, high ones are cut. The <b>cutoff</b> is where the cutting starts. Above it the harmonics fall away steeply: this filter loses <b>24 dB per octave</b>, so each doubling of frequency leaves only a sixteenth of the strength. Bob Moog's <b>ladder filter</b> of 1965 had this slope, and it is a big part of the famous Moog sound.</p>
    <p><b>Resonance</b> (Moog called it emphasis) feeds some of the output back in, so harmonics right at the cutoff get a boost. Turn it up and you hear a sharp, singing peak. Move the cutoff while a note plays and you get the <b>wah</b> of a filter sweep.</p>
    <p>An <b>envelope</b> can open the filter on every note and let it close again. That makes a note start bright and turn mellow, just like a plucked string: see <a href="/guitarclear/#strings">GuitarClear</a>.</p>
    <p class="tip"><b>Try it:</b> hold a key and drag the cutoff down slowly. Watch the tall bars on the right shrink. Then turn up the resonance and try the wah.</p>`,
  terms: [
    { t: 'Subtractive synthesis', d: 'Making a sound by starting with a bright wave and filtering harmonics away.' },
    { t: 'Lowpass filter', d: 'A filter that lets low frequencies through and cuts high ones.' },
    { t: 'Cutoff', d: 'The frequency where a filter starts to cut.' },
    { t: 'Resonance', d: 'A boost at the cutoff frequency, made by feeding the filter’s output back in.' },
    { t: 'Decibel (dB)', d: 'A scale for comparing strengths. Every −6 dB halves a wave’s height; −20 dB is a tenth.' },
    { t: 'Filter envelope', d: 'An envelope that moves the cutoff on every note, so the tone changes as the note plays.' },
  ],
  defaults: { cutoff: 900, res: 6, env: 0, wah: false },
  controls: [
    { key: 'cutoff', type: 'log', label: 'Cutoff', min: 60, max: 10000, fmt: (v) => fmtHz(v) },
    { key: 'res', type: 'range', label: 'Resonance', min: 0, max: 20, step: 0.5, ends: ['none', 'singing'], fmt: (v) => `+${v.toFixed(1)} dB` },
    { key: 'env', type: 'range', label: 'Envelope amount', min: 0, max: 4, step: 0.1, ends: ['none', '4 octaves'], fmt: (v) => (v ? `opens ${v.toFixed(1)} octaves` : 'off') },
    { key: 'wah', type: 'toggle', label: 'Wah: let the LFO sweep the cutoff', hint: 'A slow wave moves the cutoff up and down, 1.6 times a second.' },
    { key: 'play', type: 'buttons', label: 'Hear it', items: [{ label: '♪ Hold A2 for 3 s', act: (s, inst) => inst.tap(NOTE, 3) }, { label: '♪ Sweep while it plays', act: (s, inst) => inst.sweep(s) }] },
  ],
  quiz: [
    { q: 'What does a lowpass filter do to a sawtooth wave?', options: ['Adds new harmonics', 'Cuts the harmonics above the cutoff, making it duller', 'Makes it higher in pitch', 'Removes the fundamental'], answer: 1, why: 'Low frequencies pass and the high harmonics are cut, so the bright buzz turns soft and round.' },
    { q: 'This filter falls at 24 dB per octave. A harmonic two octaves above the cutoff is about how much weaker?', options: ['24 dB', '48 dB', '12 dB', 'Not weaker at all'], answer: 1, why: 'Two octaves × 24 dB per octave = 48 dB: less than a hundredth of its height.' },
    { q: 'What does turning up the resonance do?', options: ['Boosts the harmonics right at the cutoff', 'Makes every harmonic louder', 'Changes the note', 'Turns the filter off'], answer: 0, why: 'Feedback makes a peak at the cutoff frequency. Sweep it and you hear the classic squelchy “wah”.' },
  ],
  reel: [
    { ms: 5600, caption: 'A filter carves harmonics away. Sweep its cutoff down and the bright buzz turns dark: the classic wah.', set: { res: 10, env: 0, wah: false }, anim: { cutoff: [8000, 160, true] }, act: (s, inst) => inst.tap(NOTE, 5.4), view: { pos: [0.4, 4.4, 8.0], target: [-0.1, 1.9, -0.9] }, spin: 0.08 },
    { ms: 5000, caption: 'Resonance feeds the output back in, so harmonics near the cutoff sing out.', set: { cutoff: 700, env: 0, wah: false }, anim: { res: [0, 18] }, act: (s, inst) => inst.tap(NOTE, 4.8), view: { pos: [-1.0, 4.2, 7.6], target: [0, 1.9, -0.9] }, spin: 0.08 },
  ],

  onChange(s) { synth.patch(patchFor(s)); },

  build({ stage, s: s0 }) {
    synth.reset(patchFor(s0));
    const root = new THREE.Group(); stage.root.add(root);
    const player = new Player(() => synth.patchNow);
    const desk = keyDesk(stage, root, player, { pos: [-1.1, 0, 2.3], lo: 36, hi: 60, octave: 48 });

    // Floor axis with frequency ticks.
    const floor = new THREE.Mesh(new THREE.BoxGeometry(XR - XL + 0.4, 0.04, 0.9), M.matte(0x1a1d24)); floor.position.set((XL + XR) / 2, 0.02, -0.9); root.add(floor);
    for (const f of [100, 1000, 10000]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.9), M.glow(0x3a4150)); t.position.set(X(f), 0.05, -0.9); root.add(t); stage.label(fmtHz(f), [X(f), 0.05, -0.2], root); }
    // Harmonic bars: ghosts show the raw sawtooth, solid bars what the filter lets through.
    const saw = series('sawtooth', KMAX, KMAX);
    const barGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 10); barGeo.translate(0, 0.5, 0);
    const solidMat = M.plastic(0xffb547, { emissive: new THREE.Color(0x663a00), emissiveIntensity: 1 }), ghostMat = M.ghost(0xffffff, 0.12);
    const bars = [];
    for (let k = 1; k <= KMAX; k++) {
      const g = new THREE.Mesh(barGeo, ghostMat), b = new THREE.Mesh(barGeo, solidMat);
      g.position.set(0, 0.04, -0.9); b.position.set(0, 0.04, -0.9); b.castShadow = true;
      root.add(g, b); bars.push({ k, g, b });
    }
    // The filter's response curve, standing just behind the bars, and its 0 dB line.
    const curve = fatLine(stage, 0x4fd1c5, 5, 200); root.add(curve);
    const zero = fatLine(stage, 0x4fd1c5, 1.5, 2, 0.35); zero.set([[XL, HMAX + 0.04, -1.3], [XR, HMAX + 0.04, -1.3]]); root.add(zero);
    const curtainGeo = new THREE.PlaneGeometry(1, 1, 199, 1);
    const curtain = new THREE.Mesh(curtainGeo, M.ghost(0x4fd1c5, 0.1)); curtain.position.z = -1.3; root.add(curtain);
    const lCut = stage.label('Cutoff', [0, 0, -1.3], root, 'hot');
    stage.label('Harmonics of A2 (110 Hz): the raw saw in grey', [(XL + XR) / 2 - 0.3, -0.05, 0.45], root);

    const scope = scopeBoard(2.7, { title: 'Scope: the shape' });
    scope.mesh.position.set(2.75, 4.0, -2.3); scope.mesh.rotation.x = -0.1; root.add(scope.mesh);
    const spec = spectrumBoard(2.7, { title: 'Spectrum + filter', fLo: 50, fHi: 10000, dbLo: -60, curve: (f, p, L, lfo) => dB(filterH(f, effCutoff(p, L, lfo), p.res)[0]), curveLabel: 'filter' });
    spec.mesh.position.set(-0.15, 4.0, -2.3); spec.mesh.rotation.x = -0.1; root.add(spec.mesh);

    let lfoPh = 0, sweepT = -1, now = { cut: s0.cutoff, L: 0 };
    const api = {
      tap(m, hold) { player.tap(m, hold); },
      sweep(s) { player.tap(NOTE, 3.2); sweepT = 0; s.wah = false; synth.patch(patchFor(s)); },
    };
    return {
      ...api,
      update(dt, s) {
        dt = Math.max(0, dt);
        synth.sync(); player.update(dt); desk.update(dt);
        // The "sweep" button glides the cutoff from 150 Hz up to 6 kHz and back over 3 s.
        if (sweepT >= 0) {
          sweepT += dt;
          const u = Math.min(1, sweepT / 3), k = u < 0.5 ? u * 2 : 2 - u * 2;
          s.cutoff = 150 * (6000 / 150) ** k; synth.patch(patchFor(s));
          if (u >= 1) sweepT = -1;
        }
        lfoPh += dt * 1.6 * Math.PI * 2;
        const lfo = s.wah ? (2 / Math.PI) * Math.asin(Math.sin(lfoPh)) : 0;      // triangle, like the audio LFO
        const n = player.last, L = n ? player.level(n) : 0;
        const f0 = n && L > 0.001 ? midiFreq(n.m) : midiFreq(NOTE);
        const p = synth.patchNow, cut = effCutoff(p, L, lfo);
        now = { cut, L };
        const Lshow = L > 0.001 ? L : 1;           // with no note held, show the steady tone
        for (const { k, g, b } of bars) {
          const f = k * f0, vis = f >= F_LO && f <= F_HI;
          g.visible = b.visible = vis; if (!vis) continue;
          const raw = dB(Math.abs(saw[k]) / Math.abs(saw[1]) * Lshow), out = raw + dB(filterH(f, cut, p.res)[0]);
          g.position.x = b.position.x = X(f);
          g.scale.y = H(raw); b.scale.y = H(out);
        }
        const pts = [], pos = curtainGeo.attributes.position;
        for (let i = 0; i < 200; i++) {
          const f = F_LO * (F_HI / F_LO) ** (i / 199), y = H(dB(filterH(f, cut, p.res)[0])) + 0.04;
          pts.push([X(f), y, -1.3]);
          pos.setXYZ(i, X(f), y, 0); pos.setXYZ(i + 200, X(f), 0.04, 0);
        }
        pos.needsUpdate = true; curtain.geometry.computeBoundingSphere();
        curve.set(pts);
        lCut.position.set(X(clamp(cut, F_LO, F_HI)), H(dB(filterH(cut, cut, p.res)[0])) + 0.45, -1.3);
        lCut.element.textContent = `Cutoff ${fmtHz(cut)}`;
        const txt = `A2 sawtooth through the filter, cutoff ${fmtHz(cut)}`;
        scope.update(dt, p, f0, Lshow, lfo, txt);
        spec.update(dt, p, f0, Lshow, lfo, '');
      },
      readout: (s) => {
        const p = synth.patchNow, cut = now.cut, f0 = midiFreq(NOTE);
        const peak = Math.round(dB(filterH(cut, cut, p.res)[0]) * 10) / 10 || 0;
        const oct = dB(filterH(Math.min(cut * 2, 23000), cut, p.res)[0]);
        let pass = 0; for (let k = 1; k * f0 < 20000; k++) if (filterH(k * f0, cut, p.res)[0] > 0.5) pass++;
        return compact(`<div class="big">Cutoff ${fmtHz(cut)}</div>
          <div class="row"><span>At the cutoff</span><b>${peak >= 0 ? '+' : ''}${peak.toFixed(1)} dB</b></div>
          <div class="row"><span>One octave above</span><b>${oct.toFixed(0)} dB</b></div>
          <div class="row"><span>Harmonics of A2 passed</span><b>${pass} of ${Math.floor(20000 / f0)}</b></div>
          <div class="row"><span>Slope</span><b>24 dB per octave</b></div>
          <small>${s.env ? `The envelope opens it by up to ${s.env.toFixed(1)} octaves on each note.` : 'Passed = weakened by less than half (−6 dB).'}</small>`, stage);
      },
      dispose() { desk.dispose(); synth.allOff(); },
    };
  },
};
