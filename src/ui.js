export const soundOn = () => localStorage.getItem('ig_sound') === '1';
let ctx;
function audio() {
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export function beep(f = 880, ms = 200) {
  if (!soundOn()) return;
  try {
    const c = audio(), o = c.createOscillator(), g = c.createGain();
    o.frequency.value = f; g.gain.value = 0.15; o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + ms / 1000);
  } catch { /* audio unavailable */ }
}
export const chime = () => { beep(660, 150); setTimeout(() => beep(990, 220), 180); };

const paint = () => { const b = document.getElementById('snd'); if (b) b.textContent = soundOn() ? '🔔' : '🔕'; };
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
const sb = document.getElementById('snd');
if (sb) {
  sb.onclick = () => { localStorage.setItem('ig_sound', soundOn() ? '0' : '1'); paint(); if (soundOn()) { audio(); beep(880, 120); } };
  paint();
}
setTimeout(() => { import('./fx.js').catch((e) => console.error('fx module', e)); }, 0);
setTimeout(() => { import('./calendar.js').catch((e) => console.error('calendar module', e)); }, 0);
