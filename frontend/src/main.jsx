import { createRoot } from 'react-dom/client';
import { useSyncExternalStore } from 'react';
import App from './App.jsx';
import { EmailVerificationPage, getVerificationToken } from './EmailVerification.jsx';
import PasswordReset from './PasswordReset.jsx';
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
  const fragment = useSyncExternalStore(subscribeToHash, () => location.hash);
  const passwordToken = new URLSearchParams(fragment.slice(1)).get('reset-password');
  if (passwordToken !== null) return <PasswordReset key={passwordToken} token={passwordToken} />;
  const token = getVerificationToken();
  return token === null ? <App /> : <EmailVerificationPage key={token} token={token} />;
}

createRoot(document.getElementById('root')).render(<Root />);
