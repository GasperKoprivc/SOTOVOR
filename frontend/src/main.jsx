import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { EmailVerificationPage, verificationToken } from './EmailVerification.jsx';
import { getLanguage, subscribe, t } from './i18n.js';
import './styles.css';

function updateDocumentLanguage() {
  document.documentElement.lang = getLanguage();
  document.title = t('Sotovor · Družinski prostor');
}

updateDocumentLanguage();
subscribe(updateDocumentLanguage);
createRoot(document.getElementById('root')).render(verificationToken !== null ? <EmailVerificationPage /> : <App />);
