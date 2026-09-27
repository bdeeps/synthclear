// Chapter 4: the ADSR envelope. A key starts it (attack, decay, sustain) and letting go ends it
// (release). The same curve steers the amplifier and, here, opens the filter a little too.
import { THREE, M, clamp } from '../kit.js';
import { synth, Player, keyDesk, boardMesh, panel, fatLine, envAt, envStage, ENV_PRESETS, midiFreq, midiName, compact } from '../synth.js';

const NOTE = 57;
const XS = -2.0, XE = 2.7, Y0 = 0.55, YH = 2.3, Z = -0.9;       // the drawn curve: time runs XS→XE, level 0→1 is Y0→Y0+YH
const HOLD = 0.9;                                              // seconds of sustain drawn in the picture
const COL = { attack: 0x4fd1c5, decay: 0xffb547, sustain: 0x5ce1a9, release: 0xff7a59 };
const patchFor = (s) => ({ mode: 'sub', wave: 'sawtooth', N: 0, osc2: 0.6, detune: 10, cutoff: 1300, res: 3, envAmt: 1.6, A: s.A, D: s.D, S: s.S, R: s.R, lfoTo: 'off', vol: 0.85 });
const fmtS = (v) => (v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`);
const preset = (name) => (s) => { const p = ENV_PRESETS[name]; s.A = p.A; s.D = p.D; s.S = p.S; s.R = p.R; };

export default {
  id: 'envelope',
  short: 'The envelope',
  title: 'Attack, decay, sustain, release',
  subtitle: 'Every note has a shape in time. Four numbers set it.',
  view: { pos: [0.3, 3.7, 7.6], target: [-0.25, 2.1, -0.6] },
  learn: `<p>A real instrument's note has a shape in time. A piano note starts with a bang and fades. A violin can swell slowly and hold. A synth copies this with an <b>envelope generator</b>, and the most common kind has four settings, <b>ADSR</b>:</p>
    <p><b>Attack</b>: how long the sound takes to rise to full strength after you press a key. <b>Decay</b>: how long it takes to fall to the sustain level. <b>Sustain</b>: the level it holds for as long as the key is down (a level, not a time). <b>Release</b>: how long it takes to die away after you let go.</p>
    <p>The key sends a <b>gate</b> signal: on while held, off when released. The envelope turns that simple on/off into a smooth curve, which drives the <b>amplifier</b> (VCA). Here it also opens the filter a little, so the note is brightest when it is loudest, as in real instruments.</p>
    <p>Short attack and no sustain gives a <b>pluck</b>. A slow attack and long release gives a soft <b>pad</b>. Everything at full gives an <b>organ</b>, which is on or off. A quick swell with a bit of decay sounds like <b>brass</b>.</p>
    <p>Decay and release fall fast at first, then slower and slower. The times here are how long they take to get 98% of the way.</p>
    <p class="tip"><b>Try it:</b> press and hold a key, watch the dot climb and settle, then let go. Try the four presets, and a very long attack.</p>`,
  terms: [
    { t: 'Envelope', d: 'A control signal with a shape in time, started by each note.' },
    { t: 'Attack', d: 'The time for the sound to rise to its peak after the key goes down.' },
    { t: 'Decay', d: 'The time to fall from the peak to the sustain level.' },
    { t: 'Sustain', d: 'The level held while the key stays down. It is a level, not a time.' },
    { t: 'Release', d: 'The time for the sound to fade away after the key comes up.' },
    { t: 'Gate', d: 'An on/off signal from the keyboard: on while a key is held.' },
  ],
  defaults: { ...(({ A, D, S, R }) => ({ A, D, S, R }))(ENV_PRESETS.brass) },
  controls: [
    { key: 'A', type: 'log', label: 'Attack', min: 0.003, max: 3, fmt: fmtS },
    { key: 'D', type: 'log', label: 'Decay', min: 0.02, max: 3, fmt: fmtS },
    { key: 'S', type: 'range', label: 'Sustain level', min: 0, max: 1, step: 0.01, fmt: (v) => Math.round(v * 100) + '%' },
    { key: 'R', type: 'log', label: 'Release', min: 0.02, max: 4, fmt: fmtS },
    { key: 'pre', type: 'buttons', label: 'Presets', items: Object.keys(ENV_PRESETS).map((k) => ({ label: ENV_PRESETS[k].label, act: (s, inst) => { preset(k)(s); synth.patch(patchFor(s)); inst.tap(NOTE, 1.2); } })) },
    { key: 'play', type: 'buttons', label: 'Hear it', items: [{ label: '♪ Hold a note for 1.2 s', act: (s, inst) => inst.tap(NOTE, 1.2) }] },
  ],
  quiz: [
    { q: 'Which ADSR setting is a level, not a time?', options: ['Attack', 'Decay', 'Sustain', 'Release'], answer: 2, why: 'Sustain is how loud the note stays while the key is held. The other three are times.' },
    { q: 'You want a soft string pad that swells in and fades out slowly. What do you turn up?', options: ['Attack and release', 'Only decay', 'Nothing: sustain at zero', 'The cutoff'], answer: 0, why: 'A long attack makes it swell in, and a long release lets it fade after you let go.' },
    { q: 'With sustain at zero, what happens if you hold a key down?', options: ['The note keeps sounding at full', 'The note fades away after the decay, even though the key is held', 'Nothing plays at all', 'It gets louder'], answer: 1, why: 'The envelope rises, then decays towards the sustain level. If that level is zero, the note dies away like a plucked string.' },
  ],
  reel: [
    { ms: 5400, caption: 'An envelope shapes every note: attack, decay, sustain while the key is held, then release.', set: { ...ENV_PRESETS.brass, A: 0.25, D: 0.5, S: 0.6, R: 0.9 }, act: (s, inst) => inst.tap(NOTE, 2.2), view: { pos: [0.3, 3.6, 7.3], target: [-0.25, 2.1, -0.6] }, spin: 0.06 },
  ],

  onChange(s) { synth.patch(patchFor(s)); },

  build({ stage, s: s0 }) {
    synth.reset(patchFor(s0));
    const root = new THREE.Group(); stage.root.add(root);
    const player = new Player(() => synth.patchNow);
    const desk = keyDesk(stage, root, player, { pos: [-0.2, 0, 2.2] });

    // Axes, the template curve in four coloured parts, the trace of the note you are playing, and the dot.
    const axes = fatLine(stage, 0x3a4150, 2, 3); axes.set([[XS, Y0 + YH + 0.2, Z], [XS, Y0, Z], [XE + 0.2, Y0, Z]]); root.add(axes);
    const parts = Object.fromEntries(Object.entries(COL).map(([k, c]) => { const l = fatLine(stage, c, 4, 80, 0.55); root.add(l); return [k, l]; }));
    const trace = fatLine(stage, 0xffffff, 6, 400); root.add(trace);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), M.glow(0xffffff)); root.add(dot);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), M.ghost(0x4fd1c5, 0.25)); dot.add(halo);
    const gateMat = M.glow(0x2a2f3a);
    const gate = new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 0.12), gateMat); root.add(gate);
    const lGate = stage.label('Gate: key down', [0, 0, Z], root);
    const lab = Object.fromEntries(Object.keys(COL).map((k) => [k, stage.label(k[0].toUpperCase() + k.slice(1), [0, 0, Z], root, k === 'attack' ? 'hot' : '')]));
    stage.label('Level', [XS - 0.35, Y0 + YH * 0.5, Z], root);
    stage.label('Time →', [XE, Y0 - 0.3, Z], root);

    // A loudness meter: the VCA's gain.
    const meterBack = new THREE.Mesh(new THREE.BoxGeometry(0.34, YH, 0.1), M.matte(0x16181d)); meterBack.position.set(XE + 0.9, Y0 + YH / 2, Z); root.add(meterBack);
    const meterMat = M.glow(0x4fd1c5);
    const meter = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1, 0.12), meterMat); meter.position.set(XE + 0.9, Y0, Z + 0.02); root.add(meter);
    stage.label('Amp (VCA)', [XE + 0.9, Y0 + YH + 0.3, Z], root);

    // A slow scope: the sound's wave over the last 3 seconds, so you can see the envelope around it.
    const hist = new Float32Array(180); let histT = 0;
    const scope = boardMesh(900, 300, (g, w, h) => {
      panel(g, w, h, 'Slow scope: the last 3 seconds');
      const x0 = 24, y0 = 58, pw = w - 48, ph = h - 82, mid = y0 + ph / 2;
      g.strokeStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(x0, mid); g.lineTo(x0 + pw, mid); g.stroke();
      g.strokeStyle = '#4fd1c5'; g.lineWidth = 2; g.beginPath();
      for (let i = 0; i < 900; i++) { const u = i / 900, L = hist[Math.floor(u * hist.length)], y = mid - Math.sin(i * 1.3) * L * ph * 0.46; if (i) g.lineTo(x0 + u * pw, y); else g.moveTo(x0 + u * pw, y); }
      g.stroke();
      g.strokeStyle = '#ffffff'; g.lineWidth = 2.5; g.beginPath();
      for (let i = 0; i < hist.length; i++) { const x = x0 + (i / (hist.length - 1)) * pw, y = mid - hist[i] * ph * 0.46; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
    }, 3.1);
    scope.mesh.position.set(2.3, 4.1, -1.9); root.add(scope.mesh);

    const tl = [];        // live trace points
    let noteRef = null;
    const xOf = (t, e) => { const span = e.A + e.D + HOLD + e.R; return XS + (t / span) * (XE - XS); };
    return {
      tap(m, hold) { player.tap(m, hold); },
      update(dt, s) {
        dt = Math.max(0, dt);
        synth.sync(); player.update(dt); desk.update(dt);
        const e = { A: s.A, D: s.D, S: s.S, R: s.R }, A = Math.max(0.002, e.A);
        // Template curve.
        const seg = (t0, t1, f) => { const pts = []; for (let i = 0; i <= 60; i++) { const t = t0 + ((t1 - t0) * i) / 60; pts.push([xOf(t, e), Y0 + YH * f(t), Z]); } return pts; };
        const tRel = A + e.D + HOLD;
        parts.attack.set(seg(0, A, (t) => t / A));
        parts.decay.set(seg(A, A + e.D, (t) => envAt(t, null, e)));
        parts.sustain.set(seg(A + e.D, tRel, (t) => envAt(t, null, e)));
        parts.release.set(seg(tRel, tRel + e.R, (t) => envAt(t, tRel, e)));
        lab.attack.position.set(xOf(A / 2, e) - 0.25, Y0 + YH * 0.55, Z);
        lab.decay.position.set(xOf(A + e.D / 2, e) + 0.1, Y0 + YH * (1 + e.S) / 2 + 0.3, Z);
        lab.sustain.position.set(xOf(A + e.D + HOLD / 2, e), Y0 + YH * e.S + 0.3, Z);
        lab.release.position.set(xOf(tRel + e.R * 0.35, e) + 0.3, Y0 + YH * e.S * 0.5 + 0.25, Z);
        // The note being played: map its time onto the picture. A long hold waits at the end of the sustain.
        const n = player.last;
        if (n !== noteRef) { noteRef = n; tl.length = 0; }
        let L = 0, stage_ = 'idle';
        if (n) {
          const t = player.time - n.t0, off = n.tOff == null ? null : n.tOff - n.t0; L = player.level(n); stage_ = envStage(t, off, e);
          const xRelStart = off != null ? Math.min(xOf(off, e), xOf(tRel, e)) : 0;
          const x = off == null ? Math.min(xOf(t, e), xOf(tRel, e)) : xRelStart + (xOf(t - off, e) - xOf(0, e));
          const done = off != null && t - off > e.R * 1.5;
          if (!done && x <= XE + 0.3) { tl.push([x, Y0 + YH * L, Z]); if (tl.length > 400) tl.splice(0, tl.length - 400); }
          dot.position.set(Math.min(x, XE + 0.3), Y0 + YH * L, Z + 0.02);
          dot.visible = !done;
          gate.visible = true;
          const gx1 = n.tOff == null ? Math.min(xOf(t, e), xOf(tRel, e)) : xRelStart;
          gate.scale.x = Math.max(0.01, gx1 - XS); gate.position.set(XS + (gx1 - XS) / 2, Y0 - 0.32, Z);
          gateMat.color.setHex(n.tOff == null ? 0x4fd1c5 : 0x2a2f3a);
          lGate.position.set(XS + 0.6, Y0 - 0.3, Z + 0.1); lGate.element.textContent = n.tOff == null ? 'Gate: key down' : 'Gate: key up';
        } else { dot.visible = false; gate.visible = false; lGate.element.textContent = 'Press a key'; lGate.position.set(XS + 0.6, Y0 - 0.3, Z + 0.1); }
        trace.visible = tl.length > 1; if (tl.length > 1) trace.set(tl);
        halo.material.color.setHex(COL[stage_] || 0x4fd1c5);
        meter.scale.y = Math.max(0.001, YH * L); meter.position.y = Y0 + (YH * L) / 2;
        meterMat.color.setHex(COL[stage_] || 0x4fd1c5);
        histT += dt;
        while (histT > 3 / hist.length) { histT -= 3 / hist.length; hist.copyWithin(0, 1); hist[hist.length - 1] = L; }
        scope.redraw();
        this._now = { L, stage: stage_, n };
      },
      readout(s) {
        const st = this._now || { L: 0, stage: 'idle' };
        const n = st.n;
        return compact(`<div class="big">${st.stage === 'idle' ? 'Press a key' : st.stage[0].toUpperCase() + st.stage.slice(1)}: ${Math.round(st.L * 100)}%</div>
          <div class="row"><span>Attack</span><b>${fmtS(s.A)}</b></div>
          <div class="row"><span>Decay</span><b>${fmtS(s.D)}</b></div>
          <div class="row"><span>Sustain</span><b>${Math.round(s.S * 100)}% of full</b></div>
          <div class="row"><span>Release</span><b>${fmtS(s.R)}</b></div>
          <small>${n ? `${midiName(n.m)}, ${midiFreq(n.m).toFixed(1)} Hz` : 'Hold a key, then let go'}</small>`, stage);
      },
      dispose() { desk.dispose(); synth.allOff(); },
    };
  },
};
void clamp;
