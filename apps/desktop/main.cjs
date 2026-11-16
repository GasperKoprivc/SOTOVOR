const { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } = require('electron');
const { createHash, randomBytes } = require('node:crypto');
const { join } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

function serverOrigin() {
  const url = new URL(process.env.SOTOVOR_URL || 'http://127.0.0.1:3000');
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) {
    throw new Error('SOTOVOR_URL mora biti HTTPS naslov ali lokalni HTTP naslov.');
  }
  return url.origin;
}

const digest = value => createHash('sha256').update(value).digest('hex');
let mainWindow;
let activeLink;

async function openApp() {
  const origin = serverOrigin();
  const desktopUrl = origin + '/?app=desktop';
  const profile = session.fromPartition('persist:sotovor-' + digest(origin).slice(0, 24));
  const trusted = value => {
    try { return new URL(value).origin === origin; } catch { return false; }
  };

  profile.setPermissionCheckHandler((_contents, permission, requestingOrigin, details) =>
    permission === 'media' && trusted(requestingOrigin) && details.mediaType === 'audio');
  profile.setPermissionRequestHandler((contents, permission, callback, details) =>
    callback(contents === mainWindow?.webContents && trusted(details.requestingUrl) &&
      permission === 'media' && details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'audio'));
  profile.on('will-download', event => event.preventDefault());

  async function api(path, body) {
    const response = await fetch(origin + '/api/desktop/' + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      redirect: 'error', signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || 'Povezovanje s Sotovorom ni uspelo.');
    }
    return response.json();
  }

  function requireApp(event) {
    const sender = event.senderFrame;
    if (!sender || event.sender !== mainWindow?.webContents || sender !== event.sender.mainFrame || sender.url !== desktopUrl) {
      throw new Error('Zahteva ni prišla iz namiznega okna Sotovora.');
    }
  }

  ipcMain.handle('desktop:begin', async (event, mode) => {
    requireApp(event);
    if (mode !== 'login' && mode !== 'register') throw new Error('Neveljaven način prijave.');
    if (activeLink) throw new Error('Povezovanje je že v teku.');
    const link = { verifier: randomBytes(32).toString('hex') };
    activeLink = link;
    try {
      const { id, expiresIn } = await api('start', { challenge: digest(link.verifier) });
      if (!/^[0-9a-f]{32}$/.test(id) || expiresIn !== 300) throw new Error('Strežnik je vrnil neveljavno povezavo.');
      link.id = id;
      link.expiresAt = Date.now() + expiresIn * 1000;
      await shell.openExternal(origin + '/?' + new URLSearchParams({ desktop_link: id, mode }));
      return id.slice(-6).toUpperCase();
    } catch (error) {
      if (activeLink === link) activeLink = undefined;
      throw error;
    }
  });

  ipcMain.handle('desktop:finish', async event => {
    requireApp(event);
    const link = activeLink;
    if (!link?.id || link.waiting) throw new Error('Začni novo povezavo.');
    link.waiting = true;
    try {
      while (Date.now() < link.expiresAt && activeLink === link) {
        const result = await api('exchange', { id: link.id, verifier: link.verifier });
        if (activeLink !== link) break;
        if (!result.pending) {
          const expirationDate = Date.parse(result.expiresAt) / 1000;
          if (!/^[0-9a-f]{64}$/.test(result.token) || !(expirationDate > Date.now() / 1000)) {
            throw new Error('Strežnik je vrnil neveljavno sejo.');
          }
          await profile.cookies.set({
            url: origin, name: 'sotovor_session', value: result.token, path: '/',
            httpOnly: true, secure: origin.startsWith('https:'), sameSite: 'strict', expirationDate,
          });
          await profile.cookies.flushStore();
          return;
        }
        await delay(1500);
      }
      throw new Error('Povezava je potekla ali je bila preklicana.');
    } finally {
      if (activeLink === link) activeLink = undefined;
    }
  });

  function guard(contents) {
    function blockForeign(event, url) {
      if (!trusted(event.url ?? url)) event.preventDefault();
    }
    contents.on('will-navigate', blockForeign);
    contents.on('will-redirect', blockForeign);
    contents.setWindowOpenHandler(({ url }) => {
      if (contents !== mainWindow?.webContents || !trusted(url) ||
          !/^\/api\/entries\/[0-9a-f]{24}\/voice$/.test(new URL(url).pathname)) return { action: 'deny' };
      return {
        action: 'allow', overrideBrowserWindowOptions: {
          title: 'Glasovna beležka · Sotovor',
          webPreferences: { session: profile, sandbox: true, contextIsolation: true, nodeIntegration: false },
        },
      };
    });
    contents.on('did-create-window', child => guard(child.webContents));
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Sotovor', submenu: [{ label: 'Osveži', role: 'reload' }, { type: 'separator' }, { label: 'Zapri', role: 'quit' }] },
    { label: 'Pogled', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
    { label: 'Urejanje', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
  ]));

  mainWindow = new BrowserWindow({
    title: 'Sotovor', width: 1280, height: 850, minWidth: 400, minHeight: 580,
    backgroundColor: '#101d20', show: false,
    webPreferences: {
      session: profile, preload: join(__dirname, 'preload.cjs'),
      sandbox: true, contextIsolation: true, nodeIntegration: false,
    },
  });
  const window = mainWindow;
  guard(window.webContents);
  window.webContents.on('did-start-navigation', (_event, _url, inPage, mainFrame) => {
    if (mainFrame && !inPage) activeLink = undefined;
  });
  window.once('ready-to-show', () => window.show());

  for (;;) {
    const attempts = origin.startsWith('http:') ? 30 : 1;
    for (let i = 0; i < attempts; i++) {
      const health = await fetch(origin + '/api/health', {
        redirect: 'error', signal: AbortSignal.timeout(2000),
      }).then(response => response.ok && response.json()).catch(() => null);
      if (health?.desktopAuth === true && health.service === 'sotovor') {
        await window.loadURL(desktopUrl);
        return;
      }
      if (health?.service === 'sotovor') break;
      if (i + 1 < attempts) await delay(1000);
    }
    const { response } = await dialog.showMessageBox({
      type: 'warning', title: 'Sotovor', message: 'Strežnik Sotovora ni pripravljen.',
      detail: `Preveri ${origin} in za lokalno uporabo ponovno zaženi start.bat. Strežnik mora podpirati namizno prijavo.`,
      buttons: ['Poskusi znova', 'Zapri'], cancelId: 1,
    });
    if (response !== 0) { app.quit(); return; }
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(openApp).catch(error => {
    dialog.showErrorBox('Sotovor', error.message);
    app.quit();
  });
}
