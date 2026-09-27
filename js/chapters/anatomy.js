// Chapter 1: take a classic analog synth apart (a Minimoog-style monosynth), then see the same
// signal path as a modular synth patched with cables.
import { THREE, M, box, tube, exploder, clamp, canvasTexture } from '../kit.js';
import { synth, Player, makeKeyboard, bindPlay, scopeBoard, knob, midiFreq, midiName, compact } from '../synth.js';

// The sound: two sawtooth oscillators a few cents apart, a resonant 24 dB/octave lowpass that the
// envelope opens on every note, and a punchy amp envelope. A classic "Moog bass".
const PATCH = { mode: 'sub', wave: 'sawtooth', N: 0, osc2: 0.8, detune: 8, cutoff: 700, res: 9, envAmt: 2.6, A: 0.004, D: 0.45, S: 0.45, R: 0.18, lfoTo: 'off', lfoDepth: 0, vol: 0.9 };
const LO = 41, HI = 84;                         // 44 keys, F to C, like the Minimoog Model D
const RIFF = [36, 48, 43, 46, 48, 51, 48, 43];  // C2 C3 G2 B♭2 C3 E♭3 C3 G2 (a funk bassline, played an octave up on the keys)

export default {
  id: 'anatomy',
  short: 'Inside a synth',
  title: 'Inside a synthesizer',
  subtitle: 'Oscillators make a tone, a filter shapes it, an amplifier opens and closes. Keys tell them when.',
  view: { pos: [-0.7, 5.6, 8.7], target: [-1.05, 2.0, -0.5] },
  learn: `<p>A synthesizer makes sound from electricity alone. Nothing vibrates until the very end, when a loudspeaker turns the voltage into moving air (see <a href="/faradayclear/">Faraday's law</a> for how a speaker works).</p>
    <p>This is a classic <b>analog</b> synth, laid out like the <b>Minimoog</b> of 1970. Read its front panel from left to right and you follow the sound. The <b>oscillators</b> (VCOs) make a buzzing tone. The <b>mixer</b> blends them. The <b>filter</b> (VCF) takes away the bright parts. The <b>amplifier</b> (VCA) makes it louder and softer, steered by an <b>envelope</b>. Then it goes out of the <b>output jack</b>.</p>
    <p>The <b>keyboard</b> only sends two signals: which note (a control voltage) and when a key is down (a gate). The <b>pitch wheel</b> bends the note and the <b>mod wheel</b> adds wobble from an <b>LFO</b>. Under the panel are the <b>circuit boards</b> that do the real work.</p>
    <p>Early synths were <b>modular</b>: separate boxes joined by <b>patch cables</b>, so you could wire them any way you liked. The Minimoog wired the most useful path inside, so musicians could take it on stage.</p>
    <p class="tip"><b>Try it:</b> click the keys, or type <b>A W S E D F T G Y H U J K</b> on your keyboard. Then take the synth apart, and switch to the modular view to see the cables. Real instruments make sound very differently: compare <a href="/pianoclear/">PianoClear</a>, <a href="/guitarclear/">GuitarClear</a> and <a href="/fluteclear/">FluteClear</a>.</p>`,
  terms: [
    { t: 'Oscillator (VCO)', d: 'A circuit that makes a repeating wave. Its voltage sets its pitch.' },
    { t: 'Filter (VCF)', d: 'A circuit that lets some frequencies through and blocks others. It shapes the tone.' },
    { t: 'Amplifier (VCA)', d: 'A circuit whose loudness is set by a control voltage, usually from an envelope.' },
    { t: 'Envelope', d: 'A shape in time, started by a key, that steers loudness or brightness.' },
    { t: 'LFO', d: 'Low-frequency oscillator: a slow wave, too low to hear, used to wobble other settings.' },
    { t: 'Patch cable', d: 'A short cable that joins the output of one module to the input of another.' },
    { t: 'Control voltage', d: 'A voltage that sets something, such as pitch. Moog used one volt per octave.' },
  ],
  defaults: { explode: 0, xray: false, modular: false, oct: 48 },
  controls: [
    { key: 'explode', type: 'range', label: 'Take it apart', min: 0, max: 1, step: 0.01, ends: ['together', 'exploded'], fmt: (v) => Math.round(v * 100) + '%' },
    { key: 'xray', type: 'toggle', label: 'See-through case' },
    { key: 'modular', type: 'toggle', label: 'Show it as a modular synth', hint: 'The same path, as separate modules joined by patch cables.' },
    { key: 'play', type: 'buttons', label: 'Hear it', items: [{ label: '♪ Play a bassline', act: (s, inst) => inst.riff() }, { label: '♪ One note', act: (s, inst) => inst.tap(48, 0.6) }] },
  ],
  quiz: [
    { q: 'In a classic synth, which part takes away the bright, buzzy harmonics?', options: ['The oscillator', 'The filter', 'The keyboard', 'The output jack'], answer: 1, why: 'The oscillator makes a bright wave full of harmonics. The filter removes the high ones, which is why this is called subtractive synthesis.' },
    { q: 'What does a synth keyboard send to the rest of the synth?', options: ['Sound', 'Which note (a control voltage) and when a key is down (a gate)', 'Electricity for the speaker', 'Nothing, it is decoration'], answer: 1, why: 'The keys make no sound. They set the oscillators’ pitch with a voltage and start the envelopes with a gate.' },
    { q: 'Why was the Minimoog such a big step after modular synths?', options: ['It was the first synth ever', 'It wired the most useful path inside one small box, so it could go on stage', 'It had more cables', 'It used samples'], answer: 1, why: 'Modulars needed cables and a lot of space. The Minimoog fixed the path inside, so a player could just switch it on and play.' },
  ],
  reel: [
    { ms: 5400, caption: 'A synthesizer makes sound from electricity: oscillators, a filter, an amplifier, and keys to play them.', set: { xray: false, modular: false }, anim: { explode: [0, 1] }, act: (s, inst) => inst.riff(), view: { pos: [1.2, 5.4, 8.6], target: [0.1, 1.5, -0.3] }, spin: 0.35 },
    { ms: 5000, caption: 'Early synths were modular: separate boxes joined by patch cables in any order you like.', set: { explode: 0, xray: false, modular: true }, act: (s, inst) => inst.riff(), view: { pos: [0.4, 4.4, 8.0], target: [0.1, 1.5, -0.3] }, spin: 0.25 },
  ],

  onChange() { synth.patch(PATCH); },

  build({ stage }) {
    synth.reset(PATCH);
    const root = new THREE.Group(); stage.root.add(root);
    const player = new Player(() => synth.patchNow);

    // ------------------------------------------------ Minimoog-style synth
    const mini = new THREE.Group(); root.add(mini);
    const wood = M.matte(0x7a4a26, { roughness: 0.55 }), woodMats = [wood];
    const panelMat = M.matte(0x0b0c0f, { roughness: 0.7 });
    const W = 6.6;
    const base = new THREE.Group(); mini.add(base);
    const bottom = box(W, 0.12, 2.9, wood); bottom.position.set(0, 0.06, -0.25); base.add(bottom);
    [-1, 1].forEach((k) => { const cheek = box(0.14, 0.62, 2.9, wood); cheek.position.set(k * (W / 2 - 0.07), 0.31, -0.25); base.add(cheek); });
    const front = box(W, 0.3, 0.12, wood); front.position.set(0, 0.15, 1.14); base.add(front);
    const back = box(W, 0.55, 0.1, wood); back.position.set(0, 0.28, -1.65); base.add(back);
    const bed = box(W - 0.3, 0.06, 1.25, M.matte(0x222328)); bed.position.set(0, 0.3, 0.5); base.add(bed);
    const rail = box(W - 0.3, 0.3, 0.14, wood); rail.position.set(0, 0.5, -0.05); base.add(rail);

    // Keyboard: 44 keys.
    const kb = makeKeyboard(LO, HI, { w: 0.205, len: 1.0, h: 0.12 });
    const kbHolder = new THREE.Group(); kbHolder.position.set(0.42, 0.39, 0.52); kbHolder.add(kb.group); mini.add(kbHolder);
    // Pitch and mod wheels, to the left of the keys.
    const wheels = new THREE.Group(); wheels.position.set(-2.95, 0.42, 0.5); mini.add(wheels);
    const wheelBox = box(0.5, 0.1, 0.9, M.matte(0x222328)); wheels.add(wheelBox);
    const wheelMeshes = [-0.11, 0.11].map((x) => { const wm = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 32), M.plastic(0x2a2c33, { roughness: 0.6 })); wm.rotation.z = Math.PI / 2; wm.position.set(x, 0.1, 0); wheels.add(wm); return wm; });

    // Circuit boards inside, under the panel.
    const boards = new THREE.Group(); mini.add(boards);
    const pcbMat = M.plastic(0x1f6f4a, { roughness: 0.5 }), chipMat = M.plastic(0x16181f), capMat = M.plastic(0x3b6fd6), resMat = M.plastic(0xd9b27a);
    const makePcb = (x, z, w, d, n, ladder = false) => {
      const g = new THREE.Group(); g.position.set(x, 0.2, z);
      const pcb = box(w, 0.04, d, pcbMat); g.add(pcb);
      for (let i = 0; i < n; i++) { const c = box(0.2, 0.06, 0.1, chipMat); c.position.set(-w / 2 + 0.2 + (i % 4) * ((w - 0.4) / 3), 0.05, -d / 2 + 0.2 + Math.floor(i / 4) * 0.3); g.add(c); }
      for (let i = 0; i < 6; i++) { const cp = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 12), capMat); cp.position.set(-w / 2 + 0.15 + i * ((w - 0.3) / 5), 0.08, d / 2 - 0.12); g.add(cp); }
      if (ladder) for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) { const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 10), M.metal(0x9aa0aa)); tr.position.set(sx * 0.12, 0.06, -d / 2 + 0.2 + i * 0.16); g.add(tr); const r = box(0.12, 0.03, 0.03, resMat); r.position.set(sx * 0.3, 0.04, -d / 2 + 0.2 + i * 0.16); g.add(r); }
      boards.add(g); return g;
    };
    const bPower = makePcb(-2.6, -0.9, 0.8, 1.1, 0);
    const transformer = box(0.45, 0.35, 0.4, M.metal(0x6c7280, { roughness: 0.5 })); transformer.position.set(0, 0.2, -0.1); bPower.add(transformer);
    const bOsc = makePcb(-1.3, -0.9, 1.5, 1.1, 8);
    const bFilter = makePcb(0.4, -0.9, 1.5, 1.1, 4, true);
    const bEnv = makePcb(2.1, -0.9, 1.4, 1.1, 6);

    // The front panel, hinged at its bottom edge and tilted back. Local x across, y up the face, z out of it.
    const hinge = new THREE.Group(); hinge.position.set(0, 0.62, -0.08); hinge.rotation.x = -0.62; mini.add(hinge);
    const pnl = new THREE.Group(); hinge.add(pnl);
    const face = box(W - 0.3, 2.0, 0.1, panelMat); face.position.set(0, 1.0, -0.05); pnl.add(face);
    [-1, 1].forEach((k) => { const c = box(0.14, 2.1, 0.5, wood); c.position.set(k * (W / 2 - 0.07), 1.0, -0.2); pnl.add(c); });
    const topRail = box(W, 0.14, 0.5, wood); topRail.position.set(0, 2.05, -0.2); pnl.add(topRail);
    // Printed section names and dividing lines, drawn on a canvas.
    const SECTIONS = [['CONTROLLERS', -3.0, -2.15], ['OSCILLATOR BANK', -2.1, -0.55], ['MIXER', -0.5, 0.45], ['MODIFIERS', 0.5, 2.35], ['OUTPUT', 2.4, 3.0]];
    const print = canvasTexture(1600, 480, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, w, h);
      const X = (x) => ((x + 3.15) / 6.3) * w;
      g.strokeStyle = 'rgba(230,230,230,.5)'; g.lineWidth = 3; g.fillStyle = 'rgba(240,240,240,.9)'; g.font = '600 26px sans-serif'; g.textAlign = 'center';
      for (const [name, a, b] of SECTIONS) { g.fillText(name, (X(a) + X(b)) / 2, 40); g.beginPath(); g.moveTo(X(a) + 6, 52); g.lineTo(X(b) - 6, 52); g.stroke(); }
      g.font = '18px sans-serif'; g.fillStyle = 'rgba(220,220,220,.7)';
      const sub = [['FILTER', 0.5, 2.35, 150], ['FILTER CONTOUR', 0.5, 2.35, 290], ['LOUDNESS CONTOUR', 0.5, 2.35, 420]];
      for (const [n, a, b, y] of sub) g.fillText(n, (X(a) + X(b)) / 2, y);
      g.fillText('OSC 1', X(-1.33), 150); g.fillText('OSC 2', X(-1.33), 290); g.fillText('OSC 3', X(-1.33), 420);
    });
    const printMesh = new THREE.Mesh(new THREE.PlaneGeometry(6.3, 1.89), new THREE.MeshBasicMaterial({ map: print.tex, transparent: true, depthWrite: false }));
    printMesh.position.set(0, 1.0, 0.004); pnl.add(printMesh);
    const knobs = {};
    const addKnob = (name, x, y, r = 0.1) => { const k = knob(r); k.rotation.x = Math.PI / 2; k.position.set(x, y, 0); pnl.add(k); knobs[name] = k; return k; };
    // y rows on the face (face runs 0…2.0 up): 1.55, 1.05, 0.55.
    ['tune', 'glide', 'modmix'].forEach((n, i) => addKnob(n, -2.6, 1.55 - i * 0.5));
    for (let r = 0; r < 3; r++) ['range', 'wave', 'freq'].forEach((n, i) => addKnob(`o${r}${n}`, -1.85 + i * 0.5, 1.55 - r * 0.5));
    ['v1', 'v2', 'v3', 'noise'].forEach((n, i) => addKnob(n, -0.05, 1.65 - i * 0.38, 0.085));
    ['cutoff', 'emph', 'amt'].forEach((n, i) => addKnob(n, 0.9 + i * 0.6, 1.55));
    ['fa', 'fd', 'fs'].forEach((n, i) => addKnob(n, 0.9 + i * 0.6, 1.05));
    ['la', 'ld', 'ls'].forEach((n, i) => addKnob(n, 0.9 + i * 0.6, 0.55));
    addKnob('vol', 2.7, 1.55);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 10), M.glow(0x552222)); lamp.position.set(2.7, 0.9, 0.03); pnl.add(lamp);
    const jack = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.14, 20), M.metal(0xd0d4dc)); jack.rotation.x = Math.PI / 2; jack.position.set(2.7, 0.45, 0.02); pnl.add(jack);
    // Set the knobs to match the patch.
    const k01 = { tune: 0.5, glide: 0.1, modmix: 0.3, o0range: 0.4, o0wave: 0.8, o0freq: 0.5, o1range: 0.4, o1wave: 0.8, o1freq: 0.53, o2range: 0.2, o2wave: 0.3, o2freq: 0.5, v1: 0.9, v2: 0.75, v3: 0, noise: 0, cutoff: Math.log(PATCH.cutoff / 20) / Math.log(1000), emph: PATCH.res / 20, amt: PATCH.envAmt / 4, fa: 0.05, fd: 0.4, fs: PATCH.S, la: 0.05, ld: 0.4, ls: PATCH.S, vol: 0.7 };
    Object.entries(k01).forEach(([n, v]) => knobs[n]?.set(v));
    // Pulses running along the top of the panel in the order the signal flows.
    const dots = Array.from({ length: 14 }, () => { const d = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), M.glow(0x4fd1c5)); d.position.set(0, 1.83, 0.03); pnl.add(d); return d; });

    const setExplode = exploder([
      { obj: hinge, off: [0, 1.75, -1.4] },
      { obj: kbHolder, off: [0, 0, 1.5] },
      { obj: wheels, off: [-0.9, 0, 1.3] },
      { obj: bPower, off: [-0.35, 1.0, -0.2] },
      { obj: bOsc, off: [-0.2, 1.25, -0.1] },
      { obj: bFilter, off: [0.1, 1.25, -0.1] },
      { obj: bEnv, off: [0.35, 1.0, -0.2] },
    ]);
    const lab = (text, parent, pos, cls) => stage.label(text, pos, parent, cls);
    const miniLabels = [
      lab('Keyboard: 44 keys', kbHolder, [1.9, 0.25, 1.15]),
      lab('Pitch and mod wheels', wheels, [0, 0.35, 0.65]),
      lab('Oscillators (VCOs)', pnl, [-1.35, 2.35, 0.1], 'hot'),
      lab('Filter + envelopes', pnl, [1.45, 2.35, 0.1], 'hot'),
      lab('Output jack', pnl, [2.7, 0.2, 0.1]),
    ];
    const innerLabels = [
      lab('Oscillator board', bOsc, [0, 0.35, 0.3]),
      lab('Ladder filter + VCA', bFilter, [0.1, 0.35, 0.3], 'hot'),
      lab('Envelope board', bEnv, [0.1, 0.35, 0.3]),
      lab('Power supply', bPower, [0, 0.55, 0]),
    ];

    // ------------------------------------------------ the same path as a modular synth
    const mod = new THREE.Group(); mod.visible = false; root.add(mod);
    const MODS = [
      { id: 'vco1', name: 'VCO 1', knobs: 2, jacks: { cv: 'CV IN', out: 'OUT' } },
      { id: 'vco2', name: 'VCO 2', knobs: 2, jacks: { cv: 'CV IN', out: 'OUT' } },
      { id: 'lfo', name: 'LFO', knobs: 1, jacks: { out: 'OUT' } },
      { id: 'mix', name: 'MIXER', knobs: 2, jacks: { in1: 'IN 1', in2: 'IN 2', out: 'OUT' } },
      { id: 'vcf', name: 'VCF', knobs: 2, jacks: { in: 'IN', cv: 'CV IN', out: 'OUT' } },
      { id: 'env', name: 'ENVELOPE', knobs: 4, jacks: { gate: 'GATE', out: 'OUT' } },
      { id: 'vca', name: 'VCA', knobs: 1, jacks: { in: 'IN', cv: 'CV IN', out: 'OUT' } },
      { id: 'out', name: 'OUTPUT', knobs: 1, jacks: { in: 'IN' } },
    ];
    const MW = 0.78, MH = 2.1, RX0 = -((MODS.length * MW) / 2);
    const rack = new THREE.Group(); rack.position.set(0, 0.62, -0.9); rack.rotation.x = -0.28; mod.add(rack);
    const cab = box(MODS.length * MW + 0.3, MH + 0.25, 0.45, wood); cab.position.set(0, MH / 2, -0.28); rack.add(cab); woodMats.push(cab.material);
    const jackPos = {};
    const faceTex = canvasTexture(2048, 560, (g, w, h) => {
      g.fillStyle = '#1b1c21'; g.fillRect(0, 0, w, h);
      const cw = w / MODS.length;
      MODS.forEach((m, i) => {
        g.strokeStyle = '#3a3c44'; g.lineWidth = 4; g.strokeRect(i * cw + 4, 4, cw - 8, h - 8);
        g.fillStyle = '#e9e9ee'; g.font = '600 30px sans-serif'; g.textAlign = 'center'; g.fillText(m.name, i * cw + cw / 2, 46);
        const js = Object.entries(m.jacks);
        g.font = '17px sans-serif'; g.fillStyle = '#b9bcc6';
        js.forEach(([, lbl], j) => g.fillText(lbl, i * cw + cw / 2, h - 150 + j * 52 - (js.length - 1) * 26 + 34));
      });
    });
    const faceM = new THREE.Mesh(new THREE.PlaneGeometry(MODS.length * MW, MH), new THREE.MeshStandardMaterial({ map: faceTex.tex, roughness: 0.6 }));
    faceM.position.set(0, MH / 2, 0); rack.add(faceM);
    MODS.forEach((m, i) => {
      const cx = RX0 + (i + 0.5) * MW;
      for (let k = 0; k < m.knobs; k++) { const kn = knob(0.085); kn.rotation.x = Math.PI / 2; kn.position.set(cx + (m.knobs > 2 ? (k % 2 - 0.5) * 0.34 : 0), MH - 0.42 - (m.knobs > 2 ? Math.floor(k / 2) : k) * 0.34, 0); kn.set(0.3 + 0.13 * ((i + k) % 5)); rack.add(kn); }
      const js = Object.keys(m.jacks);
      js.forEach((j, n) => {
        const y = (150 - n * 52 + (js.length - 1) * 26 - 34 + 0) / 560 * MH + 0.26;
        const jk = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 18), M.metal(0xd0d4dc)); jk.rotation.x = Math.PI / 2; jk.position.set(cx, y, 0.02); rack.add(jk);
        const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.06, 12), M.matte(0x050505)); hole.rotation.x = Math.PI / 2; hole.position.set(cx, y, 0.03); rack.add(hole);
        jackPos[`${m.id}.${j}`] = new THREE.Vector3(cx, y, 0.05);
      });
    });
    const kb2 = makeKeyboard(48, 72, { w: 0.24, len: 1.05, h: 0.13 });
    const kb2Holder = new THREE.Group(); kb2Holder.position.set(0.35, 0.3, 0.75); kb2Holder.add(kb2.group); mod.add(kb2Holder);
    const kbCase = box(kb2.width + 1.3, 0.28, 1.3, wood); kbCase.position.set(-0.2, 0.14, 0.72); mod.add(kbCase);
    const kbPanel = box(0.9, 0.05, 1.0, panelMat); kbPanel.position.set(-kb2.width / 2 - 0.3, 0.3, 0.72); mod.add(kbPanel);
    const kbJacks = { 'kb.cv': [-kb2.width / 2 - 0.5, 0.36, 0.55], 'kb.gate': [-kb2.width / 2 - 0.1, 0.36, 0.55] };
    for (const [k, p] of Object.entries(kbJacks)) { const jk = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 18), M.metal(0xd0d4dc)); jk.position.set(...p); mod.add(jk); }
    // Jack positions in the modular group's space.
    rack.updateMatrix();
    const W3 = (key) => (kbJacks[key] ? new THREE.Vector3(...kbJacks[key]) : jackPos[key].clone().applyMatrix4(rack.matrix));
    const CABLES = [
      ['kb.cv', 'vco1.cv', 0x5b8cff, 'cv'], ['kb.cv', 'vco2.cv', 0x5b8cff, 'cv'], ['kb.gate', 'env.gate', 0xffd84a, 'cv'],
      ['vco1.out', 'mix.in1', 0xff7a3c, 'audio'], ['vco2.out', 'mix.in2', 0xff7a3c, 'audio'], ['mix.out', 'vcf.in', 0xff7a3c, 'audio'],
      ['vcf.out', 'vca.in', 0xff7a3c, 'audio'], ['env.out', 'vca.cv', 0x5b8cff, 'cv'], ['lfo.out', 'vcf.cv', 0x9b7bff, 'cv'], ['vca.out', 'out.in', 0xff7a3c, 'audio'],
    ];
    const audioCurves = [];
    CABLES.forEach(([a, b, col, kind], i) => {
      const A = W3(a), B = W3(b), d = A.distanceTo(B);
      const out = new THREE.Vector3(0, 0, 0.35 + d * 0.08);
      const mid = A.clone().add(B).multiplyScalar(0.5).add(new THREE.Vector3(0, -0.25 - d * 0.18, 0.3 + (i % 3) * 0.08));
      const pts = [A, A.clone().add(out.clone().multiplyScalar(0.6)), mid, B.clone().add(out.clone().multiplyScalar(0.6)), B];
      const t = tube(pts, 0.03, M.plastic(col, { roughness: 0.4 }), false, 60); mod.add(t);
      [A, B].forEach((p) => { const plug = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 12), M.metal(0xb9bec8)); plug.position.copy(p).add(new THREE.Vector3(0, 0, 0.06)); plug.rotation.x = Math.PI / 2; if (kbJacks[a] && p === A) { plug.rotation.x = 0; plug.position.y += 0.06; plug.position.z -= 0.06; } mod.add(plug); });
      if (kind === 'audio') audioCurves.push(new THREE.CatmullRomCurve3(pts));
    });
    const modLabels = [
      lab('Patch cables: orange = sound, blue = control', mod, [1.9, 0.1, 1.5]),
      lab('Keyboard sends pitch (CV) and gate', mod, [-2.3, 0.75, 1.4]),
    ];
    const pulses = Array.from({ length: audioCurves.length * 3 }, () => { const d = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), M.glow(0xffd27a)); mod.add(d); return d; });

    // ------------------------------------------------ scope
    const scope = scopeBoard(3.3, { title: 'What comes out of the output jack' });
    scope.mesh.position.set(2.5, 4.95, -2.9); scope.mesh.rotation.x = -0.25; root.add(scope.mesh);

    const input = bindPlay(stage, [kb, kb2], { down: (m) => player.down(m), up: (m) => player.up(m), octave: 48 });
    const api = {
      riff() { player.allUp(); RIFF.forEach((m, i) => player.at(i * 0.25, () => player.tap(m + 12, 0.17))); },
      tap(m, hold) { player.tap(m, hold); },
    };

    let flow = 0;
    return {
      ...api,
      update(dt, s) {
        dt = Math.max(0, dt);
        synth.sync();
        player.update(dt);
        mini.visible = !s.modular; mod.visible = s.modular;
        setExplode(s.explode);
        miniLabels.forEach((l) => { l.visible = !s.modular; });
        innerLabels.forEach((l) => { l.visible = !s.modular && s.explode > 0.4; });
        modLabels.forEach((l) => { l.visible = s.modular; });
        const see = s.xray && !s.modular;
        woodMats.forEach((m) => { m.transparent = see; m.opacity = see ? 0.18 : 1; m.depthWrite = !see; });
        panelMat.transparent = see; panelMat.opacity = see ? 0.35 : 1; panelMat.depthWrite = !see;
        const isDown = (m) => player.isDown(m);
        kb.show(isDown, dt); kb2.show(isDown, dt);
        const L = player.level(), n = player.last;
        lamp.material.color.setHex(L > 0.01 ? 0xff4a3a : 0x552222);
        // Flow pulses brighten with the envelope.
        flow += dt * 0.5;
        dots.forEach((d, i) => { const u = (flow + i / dots.length) % 1; d.position.x = -2.9 + u * 5.6; d.scale.setScalar(0.4 + 1.4 * L); d.visible = L > 0.02; });
        pulses.forEach((d, i) => { const c = audioCurves[i % audioCurves.length], u = (flow * 1.6 + Math.floor(i / audioCurves.length) / 3) % 1; c.getPoint(u, d.position); d.visible = L > 0.02; d.scale.setScalar(0.5 + L); });
        wheelMeshes[1].rotation.x = 0.3;
        const f = n ? midiFreq(n.m) : 110;
        scope.update(dt, synth.patchNow, f, L, 0, n ? `${midiName(n.m)}: ${f.toFixed(1)} Hz, two sawtooth oscillators through the filter` : 'Press a key to play a note');
      },
      readout: (s) => {
        const n = player.last, L = player.level();
        const now = n && L > 0.01 ? `${midiName(n.m)}, ${midiFreq(n.m).toFixed(1)} Hz` : 'Press a key';
        return compact(s.modular
          ? `<div class="big">A modular patch</div>
            <div class="row"><span>Now playing</span><b>${now}</b></div>
            <div class="row"><span>Modules</span><b>8, plus the keyboard</b></div>
            <div class="row"><span>Cables</span><b>10: 5 sound, 5 control</b></div>
            <small>Moog's modules used 1 volt per octave for pitch.</small>`
          : `<div class="big">Now playing: ${now}</div>
            <div class="row"><span>Oscillators</span><b>3 VCOs (2 used here)</b></div>
            <div class="row"><span>Filter</span><b>24 dB per octave lowpass</b></div>
            <div class="row"><span>Keys</span><b>44, F to C</b></div>
            <small>Laid out like the Minimoog Model D (1970), which played one note at a time.</small>`, stage);
      },
      dispose() { input.dispose(); synth.allOff(); },
    };
  },
};
void clamp;
