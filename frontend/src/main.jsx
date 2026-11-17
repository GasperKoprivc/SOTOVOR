import { createRoot } from 'react-dom/client';
import { useSyncExternalStore } from 'react';
import App from './App.jsx';
import { EmailVerificationPage, getVerificationToken } from './EmailVerification.jsx';
import { getLanguage, subscribe, t } from './i18n.js';
import './styles.css';

function updateDocumentLanguage() {
  document.documentElement.lang = getLanguage();
  document.title = t('Sotovor · Družinski prostor');
}

updateDocumentLanguage();
subscribe(updateDocumentLanguage);

function subscribeToHash(listener) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

function Root() {
  const token = useSyncExternalStore(subscribeToHash, getVerificationToken);
  return token === null ? <App /> : <EmailVerificationPage key={token} token={token} />;
}

createRoot(document.getElementById('root')).render(<Root />);
