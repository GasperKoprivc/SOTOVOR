import { useSyncExternalStore } from 'react';
import { getTheme, setTheme, subscribeTheme } from './theme.js';
import { t } from './i18n.js';

export default function ThemeSelect({ onChange = setTheme }) {
  const theme = useSyncExternalStore(subscribeTheme, getTheme);
  return (
    <label className="theme-select">
      <select value={theme} aria-label={t('Videz')} onChange={(event) => onChange(event.target.value)}>
        <option value="dark">{t('Temni način')}</option>
        <option value="light">{t('Svetli način')}</option>
        <option value="system">{t('Sistemski videz')}</option>
      </select>
    </label>
  );
}
