// Procedural WebAudio sound effects (no audio files).
let ctx = null, master = null, drone = null, muted = false;
try { muted = localStorage.getItem('db_mute') === '1'; } catch (_) {}
export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.55; master.connect(ctx.destination);
}
export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m; try { localStorage.setItem('db_mute', m ? '1' : '0'); } catch (_) {}
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.05);
}
let noiseBuf = null;
function noise() {
  if (noiseBuf) return noiseBuf;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
function tone(type, f0, f1, dur, vol, delay = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function burst(freq, q, dur, vol, type = 'bandpass', delay = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
export const sfx = {
  swing() { burst(1800, 1.2, 0.12, 0.25, 'highpass'); },
  hit() { tone('square', 220, 80, 0.09, 0.18); burst(900, 2, 0.08, 0.3); },
  shoot() { tone('sawtooth', 900, 300, 0.14, 0.09); },
  dash() { burst(600, 0.7, 0.2, 0.25); },
  hurt() { tone('sawtooth', 160, 60, 0.25, 0.25); },
  heal() { tone('sine', 440, 880, 0.35, 0.18); tone('sine', 660, 1320, 0.35, 0.1, 0.08); },
  slam() { tone('sine', 90, 30, 0.6, 0.6); burst(300, 0.8, 0.5, 0.5, 'lowpass'); },
  tele() { tone('triangle', 300, 520, 0.18, 0.06); },
  roar() { burst(220, 1.5, 1.2, 0.5, 'bandpass'); tone('sawtooth', 110, 55, 1.1, 0.2); },
  bolt() { tone('square', 520, 260, 0.12, 0.05); },
  thunder() { burst(120, 0.6, 1.6, 0.6, 'lowpass'); },
  win() { [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.5, 0.15, i * 0.14)); },
  lose() { [392, 311, 262, 196].forEach((f, i) => tone('sawtooth', f, f * 0.98, 0.5, 0.1, i * 0.18)); },
  click() { tone('sine', 700, 500, 0.06, 0.08); },
};
export function setDrone(baseFreq) {
  if (!ctx) return;
  if (drone) { const d = drone; d.g.gain.setTargetAtTime(0, ctx.currentTime, 0.4); setTimeout(() => d.o.forEach(o => o.stop()), 2000); drone = null; }
  if (!baseFreq) return;
  const g = ctx.createGain(); g.gain.value = 0; g.connect(master);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; lp.connect(g);
  const o = [1, 1.5, 2.01].map(m => { const x = ctx.createOscillator(); x.type = 'sawtooth'; x.frequency.value = baseFreq * m; x.connect(lp); x.start(); return x; });
  g.gain.setTargetAtTime(0.035, ctx.currentTime, 1.5);
  drone = { g, o };
}
