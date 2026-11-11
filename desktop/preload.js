// The overlay page tells the program when the pointer is over the companion, so only it takes clicks.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('helperDesktop', {
  setInteractive: (on) => ipcRenderer.send('interactive', !!on),
});
