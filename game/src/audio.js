// Solara Cay — synthesized WebAudio: radio stations, engine hum, effects.
// No audio files: every sound is an oscillator/noise recipe, so the game
// stays fully offline and self-contained.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.radioGain = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.station = 0;
    this.radioTimer = 0;
    this.noteIdx = 0;
    this.muted = false;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.radioGain = this.ctx.createGain();
    this.radioGain.gain.value = 0.0;
    this.radioGain.connect(this.master);
    // Engine: two detuned saws through a lowpass, gain follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    const sub = this.ctx.createOscillator();
    sub.type = 'square';
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 500;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filt); sub.connect(filt);
    filt.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start(); sub.start();
    this.engineSub = sub; this.engineFilter = filt;
  }

  setEngine(speedRatio, driving) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 55 + speedRatio * 165;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.08);
    this.engineSub.frequency.setTargetAtTime(f / 2, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(300 + speedRatio * 1400, t, 0.1);
    this.engineGain.gain.setTargetAtTime(driving ? 0.05 + speedRatio * 0.06 : 0, t, 0.12);
  }

  setRadio(on, station) {
    this.station = station;
    if (!this.ctx) return;
    this.radioGain.gain.setTargetAtTime(on ? 0.16 : 0.0, this.ctx.currentTime, 0.2);
  }

  // A tiny generative loop per station: pentatonic plucks + soft bass.
  updateRadio(dt) {
    if (!this.ctx || !this.radioGain || this.radioGain.gain.value < 0.01) return;
    this.radioTimer -= dt;
    if (this.radioTimer > 0) return;
    const scales = [
      [0, 3, 5, 7, 10, 12, 15],
      [0, 2, 4, 7, 9, 12, 14],
      [0, 0, 7, 0, 5, 0, 3, 0],
    ];
    const bases = [110, 98, 82];
    const base = bases[this.station] || 110;
    const scale = scales[this.station] || scales[0];
    this.radioTimer = this.station === 2 ? 0.42 : 0.27;
    const step = this.noteIdx++;
    const semis = scale[step % scale.length];
    const freq = base * 2 * Math.pow(2, semis / 12);
    this.pluck(freq, this.station === 2 ? 'square' : 'triangle', 0.16, this.radioGain);
    if (step % 4 === 0) this.pluck(base, 'sine', 0.4, this.radioGain);
  }

  pluck(freq, type, dur, dest) {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest || this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  blip(freq = 880, dur = 0.08, type = 'sine', vol = 0.2) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  shot(kind) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = kind === 'shotgun' ? 0.22 : kind === 'rifle' ? 0.14 : 0.1;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.value = kind === 'pistol' ? 2600 : 1500;
    const g = this.ctx.createGain(); g.gain.value = 0.25;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
    if (kind === 'fists') this.blip(140, 0.06, 'square', 0.12);
  }

  sirenStep(phase) {
    if (!this.ctx) return;
    this.blip(phase ? 960 : 720, 0.16, 'triangle', 0.045);
  }

  pickup() { this.blip(1320, 0.12, 'sine', 0.22); setTimeout(() => this.blip(1760, 0.16, 'sine', 0.2), 70); }
  cash() { this.blip(990, 0.07, 'square', 0.14); setTimeout(() => this.blip(1480, 0.1, 'square', 0.12), 60); }
  complete() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.2), i * 110)); }
  busted() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => this.blip(f, 0.3, 'sawtooth', 0.14), i * 160)); }
}
