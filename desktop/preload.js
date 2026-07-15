const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("inputBridge", {
  getBootstrap: () => ipcRenderer.invoke("app:get-bootstrap"),
  saveSettings: (settings) => ipcRenderer.invoke("app:save-settings", settings),
  setHotkey: (accelerator) => ipcRenderer.invoke("app:set-hotkey", accelerator),
  setStartupEnabled: (enabled) => ipcRenderer.invoke("app:set-startup", enabled),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  startCapture: () => ipcRenderer.invoke("capture:start"),
  getSelectionContext: () => ipcRenderer.invoke("selection:get-context"),
  setSelectionMode: (mode) => ipcRenderer.invoke("selection:set-mode", mode),
  submitSelection: (payload) => ipcRenderer.invoke("selection:submit", payload),
  cancelSelection: () => ipcRenderer.invoke("selection:cancel"),
  getResultContext: () => ipcRenderer.invoke("result:get-context"),
  copyResult: (text) => ipcRenderer.invoke("result:copy", text),
  copyResultImage: (dataUrl) => ipcRenderer.invoke("result:copy-image", dataUrl),
  closeResult: () => ipcRenderer.invoke("result:close"),
  recapture: () => ipcRenderer.invoke("result:recapture"),
  showMain: () => ipcRenderer.invoke("app:show-main"),
  onSelectionModeUpdated: (callback) => {
    const listener = (_event, mode) => callback(mode);
    ipcRenderer.on("selection:mode-updated", listener);
    return () => ipcRenderer.removeListener("selection:mode-updated", listener);
  },
  onResultUpdate: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("result:update", listener);
    return () => ipcRenderer.removeListener("result:update", listener);
  },
  onWarning: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("app:warning", listener);
    return () => ipcRenderer.removeListener("app:warning", listener);
  }
});
