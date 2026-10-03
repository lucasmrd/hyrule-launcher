const { contextBridge, ipcRenderer } = require('electron');

const on = (ch) => (cb) => ipcRenderer.on(ch, (_e, data) => cb(data));

contextBridge.exposeInMainWorld('hyrule', {
  prefs: ipcRenderer.sendSync('prefs:get'),
  cemuRunningAtStart: ipcRenderer.sendSync('cemu:running'),
  setPrefs: (patch) => ipcRenderer.invoke('prefs:set', patch),
  info: () => ipcRenderer.invoke('game:info'),
  pickCemu: () => ipcRenderer.invoke('setup:pickCemu'),
  pickGame: () => ipcRenderer.invoke('setup:pickGame'),
  finishSetup: (paths) => ipcRenderer.invoke('setup:finish', paths),
  launch: () => ipcRenderer.invoke('game:launch'),
  focusCemu: () => ipcRenderer.invoke('cemu:focus'),
  openCemu: () => ipcRenderer.invoke('cemu:open'),
  openPath: (which) => ipcRenderer.invoke('open:path', which),
  onInfo: on('game:info'),
  onCemuState: on('cemu:state'),
  onCemuError: on('cemu:error'),
  onVisible: on('window:visible'),
  onMaximized: on('window:maximized'),
});
