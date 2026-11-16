const { contextBridge, ipcRenderer } = require('electron');

if (location.pathname === '/' && new URLSearchParams(location.search).get('app') === 'desktop') {
  contextBridge.exposeInMainWorld('sotovorDesktop', {
    begin: mode => ipcRenderer.invoke('desktop:begin', mode),
    finish: () => ipcRenderer.invoke('desktop:finish'),
  });
}
