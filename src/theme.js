const root = document.documentElement;
const saved = localStorage.getItem('ig_theme') || 'light';
root.dataset.theme = saved;
document.getElementById('theme').addEventListener('click', () => {
  const t = root.dataset.theme === 'light' ? 'dark' : 'light';
  root.dataset.theme = t; localStorage.setItem('ig_theme', t);
  window.dispatchEvent(new Event('themechange'));
});
