(() => {
  if (window.top !== window || !['/', '/pro', '/pogoji', '/zasebnost', '/pogoji-narocnine'].includes(location.pathname)) return;
  let link;
  const toHex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

  async function api(action, body) {
    const response = await fetch('/api/desktop/' + action, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      redirect: 'error', signal: AbortSignal.timeout(5000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Povezava s Sotovorom ni uspela.');
    return result;
  }

  Object.defineProperty(window, 'sotovorDesktop', { value: Object.freeze({
    openExternal(url) { location.assign(url); },
    async begin(mode) {
      if (!['login', 'register'].includes(mode)) throw new Error('Neveljaven način prijave.');
      const verifier = toHex(crypto.getRandomValues(new Uint8Array(32)));
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
      const { id, expiresIn } = await api('start', { challenge: toHex(new Uint8Array(digest)) });
      if (!/^[0-9a-f]{32}$/.test(id) || !Number.isInteger(expiresIn) || expiresIn < 1) {
        throw new Error('Strežnik je vrnil neveljavno povezavo.');
      }
      link = { id, verifier, deadline: Date.now() + expiresIn * 1000 };
      location.assign('/?' + new URLSearchParams({ desktop_link: id, mode }));
      return id.slice(-6).toUpperCase();
    },
    async finish() {
      if (!link) throw new Error('Začni novo povezavo.');
      const { id, verifier, deadline } = link;
      try {
        while (Date.now() < deadline) {
          const result = await api('exchange', { id, verifier });
          if (result.ok) return;
          if (!result.pending) throw new Error('Strežnik ni potrdil seje.');
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
        throw new Error('Povezava je potekla.');
      } finally {
        link = undefined;
      }
    },
  }) });
})();
