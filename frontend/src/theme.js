const listeners = new Set();
let theme = 'dark';
try {
  const saved = localStorage.getItem('sotovor-theme');
  if (['dark', 'light', 'system'].includes(saved)) theme = saved;
} catch {
  // Keep in-memory preferences when storage is unavailable.
}
const system = window.matchMedia('(prefers-color-scheme: dark)');
const paint = () => {
  document.documentElement.dataset.theme = theme === 'system' ? (system.matches ? 'dark' : 'light') : theme;
};
paint();
system.addEventListener('change', paint);

export const getTheme = () => theme;
export function subscribeTheme(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setTheme(value) {
  if (!['dark', 'light', 'system'].includes(value) || value === theme) return;
  theme = value;
  try {
    localStorage.setItem('sotovor-theme', value);
  } catch {
    /* In-memory fallback. */
  }
  paint();
  listeners.forEach((listener) => listener());
}
