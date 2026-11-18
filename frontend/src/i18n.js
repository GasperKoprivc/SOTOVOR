import messages from './messages.json';

export const languages = { en: 'English', sl: 'Slovenščina', de: 'Deutsch' };
const locales = { en: 'en-GB', sl: 'sl-SI', de: 'de-DE' };
const storageKey = 'sotovor-language';
const listeners = new Set();
let language = 'sl';

try {
  const saved = localStorage.getItem(storageKey);
  if (Object.hasOwn(languages, saved)) language = saved;
} catch {
  // The current page still supports changing language when storage is unavailable.
}

export const getLanguage = () => language;
export const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function setLanguage(next) {
  if (!Object.hasOwn(languages, next) || next === language) return;
  language = next;
  try {
    localStorage.setItem(storageKey, next);
  } catch {
    // Keep the selection for this page.
  }
  listeners.forEach((listener) => listener());
}

export function t(message, ...values) {
  if (typeof message !== 'string') return '';
  const translated = language === 'sl' ? message : messages[message]?.[language];
  return (translated ?? message).replace(/%(\d+)/g, (placeholder, index) => values[index] ?? placeholder);
}

export function errorText(message) {
  const length =
    /^(Ime|Priimek|E-pošta|Telefon|Koda povabila|Ime prostora|Naslov) mora imeti od 1 do (\d+) znakov\.$/.exec(
      message,
    );
  if (length)
    return t(
      '%0 mora imeti od 1 do %1 znakov.',
      t(length[1] === 'Telefon' ? 'Telefonska številka' : length[1]),
      length[2],
    );
  return Object.hasOwn(messages, message) ? t(message) : t('Prišlo je do napake. Poskusi znova.');
}

export function localizedDate(options) {
  const formats = new Map();
  return {
    format(date) {
      if (!formats.has(language)) formats.set(language, new Intl.DateTimeFormat(locales[language], options));
      return formats.get(language).format(date);
    },
  };
}
