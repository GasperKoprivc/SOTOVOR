import { Languages } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { getLanguage, languages, setLanguage, subscribe, t } from './i18n.js';

export default function LanguageSelect({ onChange = setLanguage }) {
  const language = useSyncExternalStore(subscribe, getLanguage);
  return (
    <label className="language-select">
      <Languages size={17} aria-hidden="true" />
      <select aria-label={t('Jezik')} value={language} onChange={(event) => onChange(event.target.value)}>
        {Object.entries(languages).map(([code, name]) => (
          <option key={code} value={code} lang={code}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
