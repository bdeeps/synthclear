// Chapter 5: FM synthesis. A modulator sine wobbles a carrier sine's frequency. The ratio of their
// frequencies places the sidebands (fc ± n·fm) and the index sets how strong they are (Bessel
// functions Jn(I), Chowning 1973). Plus a word on sampling and wavetables.
import { THREE, M, torus, clamp } from '../kit.js';
import { synth, Player, keyDesk, spectrumBoard, fmSpectrum, besselJ, carson, fatLine, midiFreq, midiName, fmtHz, compact } from '../synth.js';

const NOTE = 57;                                    // A3 = 220 Hz
const FMAX = 4400, BX0 = 0.5, BX1 = 4.3, BH = 1.7; // sideband bars: 0…4.4 kHz across, height of amplitude 1
const BX = (f) => BX0 + (f / FMAX) * (BX1 - BX0);
const PRESETS = {
  epiano: { label: 'Electric piano', ratio: 1, index: 2.2, A: 0.003, D: 1.6, S: 0.12, R: 0.5 },
  bell: { label: 'Bell', ratio: 1.4, index: 10, A: 0.002, D: 4, S: 0, R: 3 },          // Chowning's bell: fm/fc = 1.4, index 10 dying away
  brass: { label: 'Brass', ratio: 1, index: 4, A: 0.08, D: 0.4, S: 0.7, R: 0.25 },
  bass: { label: 'Bass', ratio: 0.5, index: 3, A: 0.003, D: 0.5, S: 0.2, R: 0.15 },
};
const patchFor = (s) => ({ mode: 'fm', ratio: s.ratio, index: s.index, cutoff: 20000, res: 0, envAmt: 0, A: s.A, D: s.D, S: s.S, R: s.R, lfoTo: 'off', vol: 0.9 });
const isWhole = (r) => Math.abs(r - Math.round(r)) < 1e-6 || Math.abs(1 / r - Math.round(1 / r)) < 1e-6;

export default {
  id: 'fm',
  short: 'FM synthesis',
  title: 'FM: one wave wobbles another',
  subtitle: 'Two plain sine waves can make bells, brass and electric pianos.',
  view: { pos: [0.9, 4.0, 8.4], target: [0.5, 2.05, -0.6] },
  learn: `<p>In 1967 a composer at Stanford, <b>John Chowning</b>, found another way to make rich sounds. Take a plain sine wave, the <b>carrier</b>, and wobble its frequency very fast with a second sine wave, the <b>modulator</b>. This is <b>frequency modulation</b> (FM), the same idea FM radio uses, but at audio speed.</p>
    <p>When the wobble is fast enough, you stop hearing a wobble. You hear new frequencies, called <b>sidebands</b>, spaced evenly on both sides of the carrier: <b>fc ± fm, fc ± 2fm</b> and so on. Two numbers control them. The <b>ratio</b> of modulator to carrier sets where the sidebands land. Whole-number ratios give harmonics, like an instrument. Other ratios give clanging, <b>bell-like</b> sounds. The <b>index</b> (how hard it wobbles) sets how many sidebands are strong. Their heights follow maths called <b>Bessel functions</b>.</p>
    <p>Chowning published this in 1973, and Stanford licensed the patent to <b>Yamaha</b>. In 1983 Yamaha's <b>DX7</b> put FM in a keyboard musicians could afford, and its electric piano and bell sounds are all over 1980s pop. It was digital: its six "operators" are sine waves computed by chips.</p>
    <p>Two other ideas followed. A <b>sampler</b>, like the Fairlight CMI of 1979, records real sounds and plays them back at any pitch. A <b>wavetable</b> synth, from the early 1980s, steps through a list of stored wave shapes as a note plays.</p>
    <p class="tip"><b>Try it:</b> play a note with the index at 0: a pure sine. Raise the index slowly and watch sidebands grow. Then try a ratio that is not a whole number, like 1.4, for a bell.</p>`,
  terms: [
    { t: 'Carrier', d: 'In FM, the wave you hear, whose frequency is being wobbled.' },
    { t: 'Modulator', d: 'In FM, the wave that wobbles the carrier. You don’t hear it directly.' },
    { t: 'Sidebands', d: 'New frequencies at the carrier plus and minus whole multiples of the modulator frequency.' },
    { t: 'Modulation index', d: 'How far the carrier’s frequency swings, divided by the modulator frequency. More index, more sidebands.' },
    { t: 'Operator', d: 'Yamaha’s name for one sine-wave oscillator with its own envelope. The DX7 has six.' },
    { t: 'Sampler', d: 'An instrument that records real sounds and plays them back at different pitches.' },
  ],
  defaults: { ...(({ ratio, index, A, D, S, R }) => ({ ratio, index, A, D, S, R }))(PRESETS.epiano) },
  controls: [
    { key: 'ratio', type: 'range', label: 'Ratio (modulator ÷ carrier)', min: 0.5, max: 8, step: 0.1, fmt: (v) => `${v.toFixed(1)} : 1${isWhole(v) ? '' : ' (bell-like)'}` },
    { key: 'index', type: 'range', label: 'Index (how hard it wobbles)', min: 0, max: 10, step: 0.1, fmt: (v) => v.toFixed(1) },
    { key: 'pre', type: 'buttons', label: 'Presets', items: Object.entries(PRESETS).map(([k, p]) => ({ label: p.label, act: (s, inst) => { Object.assign(s, (({ ratio, index, A, D, S, R }) => ({ ratio, index, A, D, S, R }))(p)); synth.patch(patchFor(s)); inst.tap(NOTE, k === 'bell' ? 0.3 : 0.9); } })) },
    { key: 'play', type: 'buttons', label: 'Hear it', items: [{ label: '♪ Play A3 (220 Hz)', act: (s, inst) => inst.tap(NOTE, 1) }] },
  ],
  quiz: [
    { q: 'In FM synthesis, what does the modulator do?', options: ['It filters the carrier', 'It wobbles the carrier’s frequency', 'It adds an echo', 'It sets the loudness only'], answer: 1, why: 'The modulator pushes the carrier’s frequency up and down. When that happens fast, you hear sidebands instead of a wobble.' },
    { q: 'A 220 Hz carrier is modulated at 440 Hz (ratio 2). Where are the first sidebands?', options: ['220 and 440 Hz', '660 Hz and 220 Hz (folded back from −220)', '221 and 219 Hz', 'Only at 880 Hz'], answer: 1, why: 'fc ± fm = 220 ± 440: 660 Hz, and −220 Hz, which folds back to 220 Hz. All the partials stay on multiples of 220 Hz: a harmonic tone.' },
    { q: 'Which famous 1983 keyboard made FM synthesis popular?', options: ['Minimoog', 'Yamaha DX7', 'Roland TR-808', 'Fairlight CMI'], answer: 1, why: 'Yamaha licensed Chowning’s FM patent from Stanford. The DX7’s electric piano and bells were everywhere in 1980s music.' },
  ],
  reel: [
    { ms: 5200, caption: 'FM: one sine wave wobbles another so fast that new frequencies appear, called sidebands.', set: { ratio: 1, A: 0.02, D: 3, S: 1, R: 0.5 }, anim: { index: [0, 6] }, act: (s, inst) => inst.tap(NOTE, 5), view: { pos: [0.9, 3.9, 8.0], target: [0.5, 2.05, -0.6] }, spin: 0.08 },
    { ms: 4800, caption: 'Chowning found it at Stanford. Yamaha’s DX7 made FM famous in 1983, with its bells and electric pianos.', set: { ...PRESETS.bell }, act: (s, inst) => { inst.tap(NOTE, 0.3); }, view: { pos: [-0.1, 3.9, 7.9], target: [0.6, 2.05, -0.6] }, spin: 0.08 },
  ],

  onChange(s) { synth.patch(patchFor(s)); },

  build({ stage, s: s0 }) {
    synth.reset(patchFor(s0));
    const root = new THREE.Group(); stage.root.add(root);
    const player = new Player(() => synth.patchNow);
    const desk = keyDesk(stage, root, player, { pos: [-1.6, 0, 2.2] });

    // Two operators: dials with a spinning arm (a phasor). The modulator feeds the carrier.
    const op = (x, y, col, name) => {
      const g = new THREE.Group(); g.position.set(x, y, -0.6); root.add(g);
      const face = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.12, 48), M.matte(0x15171c)); face.rotation.x = Math.PI / 2; g.add(face);
      const ring = torus(0.62, 0.035, M.glow(col), 64); g.add(ring);
      const arm = new THREE.Group(); g.add(arm);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.56, 0.05), M.glow(col)); bar.position.set(0, 0.28, 0.09); arm.add(bar);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 10), M.glow(0xffffff)); tip.position.set(0, 0.56, 0.09); arm.add(tip);
      const l = stage.label(name, [0, -0.95, 0], g, col === 0x4fd1c5 ? 'hot' : '');
      return { g, arm, l };
    };
    const mod = op(-3.1, 1.7, 0xffb547, 'Modulator'), car = op(-1.35, 1.7, 0x4fd1c5, 'Carrier');
    const link = fatLine(stage, 0xffb547, 3, 2); link.set([[-2.45, 1.7, -0.6], [-2.0, 1.7, -0.6]]); root.add(link);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 16), M.glow(0xffb547)); head.rotation.z = -Math.PI / 2; head.position.set(-2.0, 1.7, -0.6); root.add(head);
    stage.label('wobbles its frequency', [-2.22, 2.55, -0.6], root);

    // The output wave: a sine squeezed and stretched in time, over a faint unmodulated sine.
    const wave = fatLine(stage, 0xffffff, 4, 300); root.add(wave);
    const ref = fatLine(stage, 0x4fd1c5, 1.5, 150, 0.35); root.add(ref);
    const WX0 = 0.5, WX1 = 4.3, WY = 2.75;
    stage.label('Output: 3 cycles of the carrier', [WX0 + 1.9, WY + 0.75, -0.6], root);

    // Sideband bars on a straight (linear) frequency axis: they come out evenly spaced.
    const axis = fatLine(stage, 0x3a4150, 2, 2); axis.set([[BX0, 0.12, -0.3], [BX1, 0.12, -0.3]]); root.add(axis);
    for (const f of [0, 1100, 2200, 3300, 4400]) stage.label(f ? fmtHz(f) : '0 Hz', [BX(f), 0.0, 0.2], root);
    const barGeo = new THREE.BoxGeometry(0.07, 1, 0.07); barGeo.translate(0, 0.5, 0);
    const bars = Array.from({ length: 60 }, () => { const m = new THREE.Mesh(barGeo, M.plastic(0xffb547, { emissive: new THREE.Color(0x553300), emissiveIntensity: 1 })); m.position.set(0, 0.12, -0.3); root.add(m); return m; });
    const lCar = stage.label('Carrier', [0, 0, -0.3], root, 'hot');

    const spec = spectrumBoard(2.8, { title: 'Spectrum (log scale)', fLo: 50, fHi: 12000, dbLo: -60 });
    spec.mesh.position.set(3.4, 4.85, -2.6); spec.mesh.rotation.x = -0.1; root.add(spec.mesh);

    let pm = 0, pc = 0, ph = 0;
    return {
      tap(m, hold) { player.tap(m, hold); },
      update(dt, s) {
        dt = Math.max(0, dt);
        synth.sync(); player.update(dt); desk.update(dt);
        const n = player.last, Lnote = n ? player.level(n) : 0;
        const playing = Lnote > 0.002;
        const L = playing ? Lnote : 1;                       // with no note, show the patch at full strength
        const I = s.index * L, r = s.ratio;
        const f0 = playing ? midiFreq(n.m) : midiFreq(NOTE);
        // Phasors, slowed right down: the carrier turns 0.25 times a second on average.
        const w = 0.25 * Math.PI * 2;
        pm += dt * w * r;
        pc += dt * w * (1 + clamp(I * r, 0, 12) * Math.cos(pm) * 0.9);
        mod.arm.rotation.z = -pm; car.arm.rotation.z = -pc;
        mod.l.element.textContent = `Modulator: ${fmtHz(f0 * r)}`;
        car.l.element.textContent = `Carrier: ${fmtHz(f0)}`;
        // Output wave.
        ph += dt * 0.5;
        const pts = [], rp = [];
        for (let i = 0; i < 300; i++) { const u = i / 299, t = u * 3 + ph; pts.push([WX0 + u * (WX1 - WX0), WY + 0.55 * Math.sin(2 * Math.PI * t + I * Math.sin(2 * Math.PI * r * t)), -0.6]); }
        for (let i = 0; i < 150; i++) { const u = i / 149, t = u * 3 + ph; rp.push([WX0 + u * (WX1 - WX0), WY + 0.55 * Math.sin(2 * Math.PI * t), -0.62]); }
        wave.set(pts); ref.set(rp);
        // Sideband bars at 220 Hz carrier (the axis is fixed so you can compare ratios).
        const lines = fmSpectrum(220, r, I, 40);
        bars.forEach((b, i) => {
          const l = lines[i];
          b.visible = !!l && l.f <= FMAX && Math.abs(l.a) > 0.004;
          if (!b.visible) return;
          b.position.x = BX(l.f); b.scale.y = Math.max(0.001, Math.abs(l.a) * BH * L);
          b.material.color.setHex(Math.abs(l.f - 220) < 0.5 ? 0x4fd1c5 : 0xffb547);
        });
        lCar.position.set(BX(220), Math.abs(besselJ(0, I)) * BH * L + 0.45, -0.3);
        spec.update(dt, synth.patchNow, f0, L, 0, playing ? `${midiName(n.m)}: index now ${I.toFixed(1)}` : `A3, index ${I.toFixed(1)}`);
        this._now = { I, f0, playing };
      },
      readout(s) {
        const st = this._now || { I: s.index, f0: 220 };
        const fm = st.f0 * s.ratio, lines = fmSpectrum(st.f0, s.ratio, st.I, 40).filter((l) => Math.abs(l.a) > 0.05);
        return compact(`<div class="big">Ratio ${s.ratio.toFixed(1)} : 1, index ${st.I.toFixed(1)}</div>
          <div class="row"><span>Carrier</span><b>${fmtHz(st.f0)}</b></div>
          <div class="row"><span>Modulator</span><b>${fmtHz(fm)}</b></div>
          <div class="row"><span>Strong partials (&gt; 5%)</span><b>${lines.length}</b></div>
          <div class="row"><span>Bandwidth (Carson)</span><b>about ${fmtHz(carson(fm, st.I))}</b></div>
          <small>${isWhole(s.ratio) ? 'A simple ratio: the partials line up as harmonics, one clear note.' : 'An awkward ratio: the partials miss the note’s harmonics, so it clangs like a bell.'}</small>`, stage);
      },
      dispose() { desk.dispose(); synth.allOff(); },
    };
  },
};
