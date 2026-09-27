// Chapter 6: MIDI and sequencing. Keys send short digital messages down a 5-pin cable at 31,250 bits a
// second; a 16-step sequencer (laid out like a TR-808's row of coloured step keys) plays drums and a
// bassline, and an arpeggiator turns held chords into patterns. A DAW does the same thing in software.
import { THREE, M, box, tube, clamp, canvasTexture } from '../kit.js';
import { synth, Player, keyDesk, boardMesh, panel, knob, midiName, compact } from '../synth.js';

// General MIDI drum notes (channel 10): 36 bass drum, 38 snare, 42 closed hi-hat.
const DRUM = { kick: 36, snare: 38, hat: 42 };
const ROWS = ['kick', 'snare', 'hat', 'note'];
const ROW_NAME = { kick: 'Bass drum', snare: 'Snare', hat: 'Hi-hat', note: 'Bassline' };
const _ = null;
const PATTERNS = {
  house: { label: 'Four on the floor', kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0], note: [36, _, 48, _, 36, _, 48, _, 34, _, 46, _, 34, _, 46, 48] },
  electro: { label: '808 electro', kick: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0], snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], hat: [2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1], note: [33, _, _, 33, _, _, 45, _, 33, _, 43, _, _, 40, _, 43] },
  acid: { label: 'Acid bassline', kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], hat: [0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 1], note: [36, 36, 48, 36, 39, 36, 51, 36, 36, 48, 36, 46, 36, 43, 48, 36], acc: [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0] },
};
const copy = (p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Array.isArray(v) ? v.slice() : v]));
// A squelchy mono bass: saw through a resonant filter that snaps open and shut (TB-303 style).
const patchFor = (s) => ({ mode: 'sub', wave: 'sawtooth', N: 0, osc2: 0, cutoff: s.pat === 'acid' ? 320 : 480, res: s.pat === 'acid' ? 16 : 10, envAmt: s.pat === 'acid' ? 3.4 : 2.4, A: 0.003, D: 0.22, S: 0.08, R: 0.07, lfoTo: 'off', vol: 0.95 });
const STEP_COLORS = [0xe8392e, 0xf08a24, 0xf2d33b, 0xf1efe8];   // red, orange, yellow, white, four steps each (as on the TR-808)
const BAUD = 31250, BITS = 10;                                   // MIDI 1.0: 31.25 kbaud, 1 start + 8 data + 1 stop bit
const hex = (b) => b.toString(16).toUpperCase().padStart(2, '0');

let pats = null;             // this visit's editable copy of the patterns

export default {
  id: 'midi',
  short: 'MIDI and sequencers',
  title: 'MIDI, sequencers and drum machines',
  subtitle: 'Three bytes say “play this note”. A sequencer sends them on time, over and over.',
  view: { pos: [0.4, 5.7, 5.6], target: [0.35, 0.95, -0.3] },
  learn: `<p>In 1983 synth makers agreed on a common language: <b>MIDI</b>, the Musical Instrument Digital Interface. It was pushed by Dave Smith of Sequential Circuits and Ikutaro Kakehashi of Roland, and it still works today. MIDI sends no sound at all, only <b>messages</b>, as a stream of bits down a 5-pin cable.</p>
    <p>Press a key and the keyboard sends three bytes: <b>Note on</b> plus the channel (<b>90</b> in hex for channel 1), <b>which note</b> (60 is middle C) and <b>velocity</b>, how hard you hit it (0 to 127). Let go and it sends <b>Note off</b> (<b>80</b>). The cable runs at <b>31,250 bits a second</b>. Each byte takes 10 bits, so a note-on takes under a millisecond.</p>
    <p>A <b>sequencer</b> sends those messages for you, on time. This one has 16 steps, each a sixteenth of a bar, with a row for each drum and one for the bass. Its coloured step keys copy the <b>Roland TR-808</b> drum machine of 1980, whose booming synthesized bass drum is all over hip-hop and pop. Roland's TB-303 bass machine, with its squelchy resonant filter, started <b>acid house</b>.</p>
    <p>An <b>arpeggiator</b> takes the keys you hold and plays them one at a time in a pattern. Today a <b>DAW</b> (a music program on a laptop or phone) does all of this in software: its software synths do the same maths as the oscillators, filters and envelopes in this box.</p>
    <p class="tip"><b>Try it:</b> press Play, then click the step keys to change the beat. Play the keyboard and watch the bytes travel down the cable. Turn on the arpeggiator and hold a chord.</p>`,
  terms: [
    { t: 'MIDI', d: 'A standard language (1983) for instruments and computers to send notes and settings to each other.' },
    { t: 'Note on / note off', d: 'MIDI messages that start and stop a note. Each is three bytes: type and channel, note number, velocity.' },
    { t: 'Velocity', d: 'How hard a key was struck, from 0 to 127.' },
    { t: 'Step sequencer', d: 'A device that plays a repeating pattern of steps, each on or off.' },
    { t: 'BPM', d: 'Beats per minute: the tempo. Each beat here is split into four steps.' },
    { t: 'Arpeggiator', d: 'A feature that plays the notes of a held chord one after another.' },
    { t: 'DAW', d: 'Digital audio workstation: software for recording, sequencing and mixing music.' },
  ],
  defaults: { play: true, bpm: 120, pat: 'house', arp: false },
  controls: [
    { key: 'play', type: 'toggle', label: 'Play the sequencer' },
    { key: 'bpm', type: 'range', label: 'Tempo', min: 60, max: 180, step: 1, fmt: (v) => `${Math.round(v)} BPM` },
    { key: 'pat', type: 'seg', label: 'Pattern', options: Object.entries(PATTERNS).map(([v, p]) => ({ v, label: p.label })) },
    { key: 'arp', type: 'toggle', label: 'Arpeggiator', hint: 'While it plays, hold two or three keys: they replace the bassline, one note per step.' },
  ],
  quiz: [
    { q: 'What travels down a MIDI cable?', options: ['The sound itself', 'Messages such as “note on, middle C, velocity 100”', 'Electricity to power the synth', 'Light'], answer: 1, why: 'MIDI carries instructions, not sound. The receiving synth makes the sound.' },
    { q: 'MIDI runs at 31,250 bits per second and uses 10 bits per byte. About how long does a 3-byte note-on take?', options: ['About 1 millisecond', 'About 1 second', 'About 1 minute', 'It is instant'], answer: 0, why: '3 bytes × 10 bits = 30 bits. 30 ÷ 31,250 = 0.00096 s, just under a millisecond.' },
    { q: 'At 120 BPM with four steps per beat, how long is each step?', options: ['0.5 s', '0.125 s', '1 s', '0.25 s'], answer: 1, why: '120 beats a minute is one beat every 0.5 s. A quarter of that is 0.125 s.' },
  ],
  reel: [
    { ms: 5400, caption: 'MIDI sends messages, not sound. A sequencer fires them on time: the drum machine idea behind the Roland TR-808.', set: { play: true, bpm: 120, pat: 'electro', arp: false }, view: { pos: [0.6, 5.9, 6.0], target: [0.2, 0.9, -0.1] }, spin: 0.1 },
  ],

  onChange(s, key) {
    synth.patch(patchFor(s));
    pats ||= Object.fromEntries(Object.entries(PATTERNS).map(([k, p]) => [k, copy(p)]));
    if (!s.play) synth.seqStop();
    if (key === 'bpm' || key === 'pat') synth.seqSet({ bpm: s.bpm, pattern: pats[s.pat] });
  },

  build({ stage, s: s0 }) {
    synth.reset(patchFor(s0));
    pats = Object.fromEntries(Object.entries(PATTERNS).map(([k, p]) => [k, copy(p)]));
    const root = new THREE.Group(); stage.root.add(root);
    const player = new Player(() => synth.patchNow);
    const desk = keyDesk(stage, root, player, { pos: [-0.6, 0, 2.2], label: false });

    // ------------------------------------------------ the drum machine / sequencer
    const DM = new THREE.Group(); DM.position.set(0, 0, -0.55); root.add(DM);
    const body = box(5.0, 0.36, 1.9, M.matte(0x2b2c30, { roughness: 0.6 })); body.position.y = 0.18; DM.add(body);
    const top = box(4.9, 0.02, 1.8, M.matte(0x3a3b40)); top.position.y = 0.37; DM.add(top);
    const PX0 = -2.05, PDX = 0.265, PZ0 = -0.45, PDZ = 0.3;
    const pads = [];
    // Row names printed on the panel, left of the pads.
    const names = canvasTexture(256, 320, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#e9e9ee'; g.font = '600 34px sans-serif'; g.textAlign = 'right'; ROWS.forEach((row, r) => g.fillText(ROW_NAME[row].toUpperCase(), w - 10, 52 + r * 76)); });
    const namePlate = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.0), new THREE.MeshBasicMaterial({ map: names.tex, transparent: true, depthWrite: false }));
    namePlate.rotation.x = -Math.PI / 2; namePlate.position.set(PX0 - 0.42, 0.385, PZ0 + 1.5 * PDZ - 0.03); DM.add(namePlate);
    ROWS.forEach((row, r) => {
      for (let i = 0; i < 16; i++) {
        const col = STEP_COLORS[Math.floor(i / 4)];
        const mat = M.plastic(col, { roughness: 0.4, emissive: new THREE.Color(col), emissiveIntensity: 0 }); mat.userData.col = new THREE.Color(col);
        const p = box(0.2, 0.07, 0.2, mat); p.position.set(PX0 + i * PDX + 0.13, 0.41, PZ0 + r * PDZ); DM.add(p);
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), M.glow(0x330000)); led.position.set(PX0 + i * PDX + 0.13, 0.45, PZ0 + r * PDZ - 0.13); DM.add(led);
        p.userData = { row, i }; stage.pickables.push(p);
        pads.push({ p, mat, led, row, i });
      }
    });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, PDZ * 4), M.glow(0x4fd1c5, { transparent: true, opacity: 0.35 })); head.position.set(0, 0.46, PZ0 + PDZ * 1.5); DM.add(head);
    const knobs = [0, 1, 2, 3, 4].map((i) => { const k = knob(0.08); k.position.set(-1.6 + i * 0.45, 0.37, 0.72); k.set(0.3 + i * 0.1); DM.add(k); return k; });
    const lDM = stage.label('Step sequencer and drum machine: 16 steps', [0.3, 0.45, -0.95], DM, 'hot');

    // ------------------------------------------------ the synth module that plays the bass
    const MOD = new THREE.Group(); MOD.position.set(3.6, 0, -1.2); root.add(MOD);
    const mBody = box(1.4, 0.55, 1.1, M.matte(0x1b1c21)); mBody.position.y = 0.275; MOD.add(mBody);
    const mFace = box(1.3, 0.02, 1.0, M.matte(0x0e0f12)); mFace.position.y = 0.56; MOD.add(mFace);
    for (let i = 0; i < 3; i++) { const k = knob(0.09); k.position.set(-0.4 + i * 0.4, 0.57, 0.15); k.set(0.4 + i * 0.15); MOD.add(k); }
    const mLamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 10), M.glow(0x113333)); mLamp.position.set(0.45, 0.6, -0.3); MOD.add(mLamp);
    stage.label('Synth module: plays the bass', [0, 0.75, -0.3], MOD);

    // ------------------------------------------------ MIDI cables with bytes running along them
    const cab = (pts) => { const t = tube(pts, 0.035, M.plastic(0x15161a, { roughness: 0.5 }), false, 80); root.add(t); return new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))); };
    const c1 = cab([[-2.2, 0.25, 1.75], [-2.8, 0.1, 1.2], [-3.0, 0.1, 0.2], [-2.7, 0.25, -0.55], [-2.5, 0.25, -0.55]]);
    const c2 = cab([[2.5, 0.25, -0.55], [2.75, 0.1, -0.6], [2.8, 0.1, -1.2], [2.9, 0.25, -1.2]]);
    [[-2.5, 0.25, -0.55], [2.5, 0.25, -0.55], [2.9, 0.25, -1.2], [-2.2, 0.25, 1.75]].forEach((p) => { const plug = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.18, 16), M.metal(0xb9bec8)); plug.position.set(...p); plug.rotation.z = Math.PI / 2; root.add(plug); });
    stage.label('MIDI cable', [-2.75, 0.2, 0.6], root);
    stage.label('MIDI out', [2.75, 0.35, -0.35], root);
    const BYTE_COL = [0xff6b6b, 0xffb547, 0xffffff];
    const bytes = Array.from({ length: 36 }, () => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), M.glow(0xffffff)); m.visible = false; root.add(m); return { m, curve: null, u: 0, live: false }; });
    const send = (curve, n = 3) => { for (let j = 0; j < n; j++) { const b = bytes.find((x) => !x.live); if (!b) return; b.live = true; b.curve = curve; b.u = -j * 0.06; b.m.material.color.setHex(BYTE_COL[j]); } };

    // ------------------------------------------------ message log
    const log = [];
    const logBoard = boardMesh(900, 380, (g, w, h) => {
      panel(g, w, h, 'MIDI messages (newest at the top)');
      g.font = '600 24px ui-monospace, monospace';
      log.slice(0, 7).forEach((e, i) => {
        const y = 86 + i * 40;
        g.globalAlpha = 1 - i * 0.11;
        [0, 1, 2].forEach((j) => { g.fillStyle = ['#ff8a8a', '#ffc46b', '#ffffff'][j]; g.fillText(hex(e.b[j]), 26 + j * 48, y); });
        g.fillStyle = 'rgba(255,255,255,.8)'; g.font = '22px sans-serif'; g.fillText(e.text, 190, y); g.font = '600 24px ui-monospace, monospace';
      });
      g.globalAlpha = 1;
    }, 3.2);
    logBoard.mesh.position.set(2.5, 2.75, -2.1); logBoard.mesh.rotation.x = -0.35; root.add(logBoard.mesh);
    const pushMsg = (b) => {
      const on = (b[0] & 0xf0) === 0x90 && b[2] > 0, ch = (b[0] & 0x0f) + 1;
      const drumName = ch === 10 ? { 36: 'bass drum', 38: 'snare', 42: 'hi-hat' }[b[1]] : null;
      log.unshift({ b, text: `${on ? 'Note on ' : 'Note off'}  ch ${ch}  ${drumName || midiName(b[1])}${on ? `  vel ${b[2]}` : ''}` });
      if (log.length > 12) log.length = 12;
      logDirty = true;
    };
    let logDirty = true;

    // Keys: straight to the synth (through the sequencer), or into the arpeggiator.
    player.onMsg = (b) => { pushMsg(b); send(c1); if (!arpOn) send(c2); };
    let arpOn = s0.arp;

    let clock = 0, step = -1, flash = new Float32Array(64), lastArp = 0, noteLamp = 0;
    const api = {
      pick(o) {
        const { row, i } = o.userData || {};
        if (row == null) return;
        const s = this._s, p = pats[s.pat];
        if (row === 'note') p.note[i] = p.note[i] == null ? 36 : null;
        else p[row][i] = p[row][i] ? 0 : 1;
        synth.seqSet({ pattern: p });
      },
    };
    return {
      ...api,
      update(dt, s) {
        dt = Math.max(0, dt);
        this._s = s;
        synth.sync(); desk.update(dt);
        arpOn = s.arp;
        player.sound = !s.arp || !s.play;
        player.update(dt);
        const held = player.held().sort((a, b) => a - b);
        synth.seqSet({ arp: s.arp && held.length ? held : null });
        const p = pats[s.pat];
        // Start the sound as soon as the page may play it (after a click or key press, not muted, not recording).
        if (s.play && !synth.seqRunning && synth.seqStart(p, s.bpm)) { clock = 0; step = -1; }
        // Which step is sounding: the audio clock when sound is on, our own clock otherwise.
        let cur = step;
        const q = synth.seqNow();
        if (synth.seqRunning && q) cur = q.i;
        else if (s.play) { clock += dt * (s.bpm / 60) * 4; cur = Math.floor(clock) % 16; }
        if (cur !== step && s.play) {
          step = cur;
          // The messages this step sends.
          if (p.kick[step]) pushMsg([0x99, DRUM.kick, 110]);
          if (p.snare[step]) pushMsg([0x99, DRUM.snare, 100]);
          if (p.hat[step]) pushMsg([0x99, DRUM.hat, p.hat[step] > 1 ? 100 : 60]);
          const note = s.arp && held.length ? held[lastArp++ % held.length] : p.note[step];
          if (note != null) { pushMsg([0x90, note, p.acc?.[step] ? 127 : 90]); send(c2); noteLamp = 1; }
          ROWS.forEach((row, r) => { const on = row === 'note' ? note != null : p[row][step]; if (on) flash[r * 16 + step] = 1; });
        }
        if (!s.play) step = -1;
        // Pads: lit when set, brighter when they fire.
        for (const pd of pads) {
          const on = pd.row === 'note' ? p.note[pd.i] != null : !!p[pd.row][pd.i];
          const k = pd.row === 'note' ? ROWS.length - 1 : ROWS.indexOf(pd.row), fi = k * 16 + pd.i;
          flash[fi] = Math.max(0, flash[fi] - dt * 5);
          pd.mat.emissiveIntensity = (on ? 0.45 : 0) + flash[fi] * 1.2;
          if (on) pd.mat.color.copy(pd.mat.userData.col); else pd.mat.color.setHex(0x26272c);
          pd.p.scale.y = on ? 1 : 0.45;
          pd.led.material.color.setHex(on ? 0xff3b30 : 0x331111);
        }
        head.visible = step >= 0; head.position.x = PX0 + Math.max(0, step) * PDX + 0.13;
        // Bytes along the cables (drawn far slower than real: a note-on really takes under a millisecond).
        for (const b of bytes) {
          if (!b.live) continue;
          b.u += dt * 1.1;
          b.m.visible = b.u >= 0 && b.u <= 1;
          if (b.u > 1) { b.live = false; b.m.visible = false; continue; }
          if (b.u >= 0) b.curve.getPoint(b.u, b.m.position);
        }
        noteLamp = Math.max(0, noteLamp - dt * 4);
        mLamp.material.color.setRGB(0.07 + noteLamp * 0.24, 0.2 + noteLamp * 0.62, 0.2 + noteLamp * 0.57);
        if (logDirty) { logBoard.redraw(); logDirty = false; }
        void knobs; void lDM;
      },
      readout: (s) => {
        const stepMs = 60000 / s.bpm / 4, msg = (3 * BITS * 1000) / BAUD;
        return compact(`<div class="big">${Math.round(s.bpm)} BPM${s.play ? `, step ${Math.max(1, step + 1)} of 16` : ', stopped'}</div>
          <div class="row"><span>One step</span><b>${Math.round(stepMs)} ms</b></div>
          <div class="row"><span>MIDI speed</span><b>31,250 bits/s</b></div>
          <div class="row"><span>One note-on (3 bytes)</span><b>${msg.toFixed(2)} ms</b></div>
          <div class="row"><span>Notes a step could fit</span><b>about ${Math.floor(stepMs / msg)}</b></div>
          <small>Drums: channel 10, notes 36, 38 and 42 (General MIDI).</small>`, stage);
      },
      dispose() { desk.dispose(); synth.allOff(); player.onMsg = null; },
    };
  },
};
void clamp;
