export const languageOf = (value) => (['sl', 'en', 'de'].includes(value) ? value : 'en');
export const consent = {
  sl: 'Izrecno zahtevam takojšen začetek digitalne storitve in potrjujem, da sem seznanjen/a s pravili odstopa od pogodbe, opisanimi v pogojih.',
  en: 'I expressly request the immediate start of the digital service and acknowledge the withdrawal-right rules described in the terms.',
  de: 'Ich verlange ausdrücklich den sofortigen Beginn der digitalen Dienstleistung und bestätige, die in den Bedingungen beschriebenen Widerrufsregeln zur Kenntnis genommen zu haben.',
};
export const labels = {
  sl: {
    test: 'Samo test — brez plačila',
    complete: 'Potrdi testni nakup',
    title: 'Sotovor Pro',
    terms: 'Pogoji uporabe',
    cancel: 'Prekliči',
    portal: 'Testni portal',
    monthly: '3 EUR/mesec z DDV',
    yearly: '30 EUR/leto z DDV',
    back: 'Nazaj v Sotovor',
    openPortal: 'Odpri portal naročnine',
    unavailable: 'Testna seja ni več na voljo.',
  },
  en: {
    test: 'Test only — no payment',
    complete: 'Complete test checkout',
    title: 'Sotovor Pro',
    terms: 'Terms of service',
    cancel: 'Cancel',
    portal: 'Test portal',
    monthly: 'EUR 3/month including VAT',
    yearly: 'EUR 30/year including VAT',
    back: 'Return to Sotovor',
    openPortal: 'Open subscription portal',
    unavailable: 'The test session is no longer available.',
  },
  de: {
    test: 'Nur Test — keine Zahlung',
    complete: 'Testkauf bestätigen',
    title: 'Sotovor Pro',
    terms: 'Nutzungsbedingungen',
    cancel: 'Abbrechen',
    portal: 'Testportal',
    monthly: '3 EUR/Monat einschließlich MwSt.',
    yearly: '30 EUR/Jahr einschließlich MwSt.',
    back: 'Zurück zu Sotovor',
    openPortal: 'Abonnementportal öffnen',
    unavailable: 'Die Testsitzung ist nicht mehr verfügbar.',
  },
};
export function billingEmail(kind, language, link) {
  const texts = {
    sl: {
      welcome: [
        'Dobrodošli v Sotovor Pro',
        'Sotovor Pro je vključen za vaš družinski prostor. Funkcije Pro so na voljo vsem članom.',
      ],
      payment_failed: [
        'Plačilo za Sotovor Pro ni uspelo',
        'Preverite plačilno sredstvo v portalu. Ob prvem neuspelem plačilu velja sedemdnevno prehodno obdobje. Prijavite se v Sotovor in odprite spodnjo povezavo.',
      ],
      ends_soon: [
        'Sotovor Pro se kmalu izteče',
        'Plačano obdobje odpovedane naročnine se konča v največ treh dneh. Vaši podatki se ohranijo. Naročnino lahko uredite v portalu. Prijavite se v Sotovor in odprite povezavo.',
      ],
    },
    en: {
      welcome: [
        'Welcome to Sotovor Pro',
        'Sotovor Pro is enabled for your family space. Every member can use Pro features.',
      ],
      payment_failed: [
        'Sotovor Pro payment failed',
        'Check your payment method in the portal. The first failed payment starts a seven-day grace period. Sign in to Sotovor, then open the link below.',
      ],
      ends_soon: [
        'Sotovor Pro ends soon',
        'Your canceled subscription ends within three days. Your data stays available. You can manage the subscription in the portal. Sign in to Sotovor, then open the link.',
      ],
    },
    de: {
      welcome: [
        'Willkommen bei Sotovor Pro',
        'Sotovor Pro ist für euren Familienbereich aktiviert. Alle Mitglieder können die Pro-Funktionen nutzen.',
      ],
      payment_failed: [
        'Zahlung für Sotovor Pro fehlgeschlagen',
        'Prüfe dein Zahlungsmittel im Portal. Nach der ersten fehlgeschlagenen Zahlung gilt eine siebentägige Übergangsfrist. Melde dich bei Sotovor an und öffne dann den Link.',
      ],
      ends_soon: [
        'Sotovor Pro läuft bald ab',
        'Dein gekündigtes Abonnement endet innerhalb von drei Tagen. Eure Daten bleiben erhalten. Du kannst das Abonnement im Portal verwalten. Melde dich bei Sotovor an und öffne dann den Link.',
      ],
    },
  };
  const [subject, text] = texts[languageOf(language)][kind];
  return { subject, text: text + '\n\n' + link };
}
