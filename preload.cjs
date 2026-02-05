const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  printDeliverySlip: (data) => ipcRenderer.send('PRINT_DELIVERY_SLIP', data)
});

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    send: (channel, data) => ipcRenderer.send(channel, data),
    on: (channel, func) => {
      const subscription = (_event, ...args) => func(...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    },
    once: (channel, func) => ipcRenderer.once(channel, (_event, ...args) => func(...args)),
    invoke: (channel, data) => ipcRenderer.invoke(channel, data),
  },
  store: {
    get: (key) => ipcRenderer.sendSync('store-get', key),
    set: (key, val) => ipcRenderer.send('store-set', key, val),
    delete: (key) => ipcRenderer.send('store-delete', key),
  }
});