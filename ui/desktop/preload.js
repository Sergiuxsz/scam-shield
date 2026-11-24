/* The only bridge between the windows and the main process. Exposes a small, fixed API. */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shield', {
  onState: (cb) => { ipcRenderer.on('shield:state', (_e, s) => cb(s)); },
  pillHover: (over) => ipcRenderer.send('shield:pill-hover', !!over),
  pillSize: (height) => ipcRenderer.send('shield:pill-size', Number(height)),
  openPane: (id) => ipcRenderer.send('shield:open-pane', id || null),
  togglePane: () => ipcRenderer.send('shield:toggle-pane'),
  hidePane: () => ipcRenderer.send('shield:hide-pane'),
  openFull: (id) => ipcRenderer.send('shield:open-full', id || null),
  restorePane: () => ipcRenderer.send('shield:restore-pane'),
  select: (id) => ipcRenderer.send('shield:select', id),
  dismissAll: () => ipcRenderer.send('shield:dismiss-all'),
  dismiss: (id) => ipcRenderer.send('shield:dismiss', id),
  clearHistory: () => ipcRenderer.send('shield:clear-history'),
  quit: () => ipcRenderer.send('shield:quit'),
  integration: () => ipcRenderer.invoke('shield:integration'),
  copy: (text) => ipcRenderer.send('shield:copy', text),
  tts: (text) => ipcRenderer.invoke('shield:tts', text),
  call: (number) => ipcRenderer.send('shield:call', number),
  share: (text) => ipcRenderer.send('shield:share', text)
});
