const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("inputBridge", {
  getBootstrap: () => ipcRenderer.invoke("app:get-bootstrap"),
  saveSettings: (settings) => ipcRenderer.invoke("app:save-settings", settings),
  setHotkey: (accelerator) => ipcRenderer.invoke("app:set-hotkey", accelerator),
  setVoiceHotkey: (accelerator) => ipcRenderer.invoke("app:set-voice-hotkey", accelerator),
  toggleVoice: () => ipcRenderer.invoke("voice:toggle"),
  submitVoiceAudio: (payload) => ipcRenderer.invoke("voice:audio-ready", payload),
  reportVoiceRecorderStatus: (payload) => ipcRenderer.send("voice:recorder-status", payload),
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
  retranslateResult: (targetLanguage) => ipcRenderer.invoke("result:retranslate", targetLanguage),
  cropAndProcess: (payload) => ipcRenderer.invoke("result:crop-and-process", payload),
  translateText: (text) => ipcRenderer.invoke("result:translate-text", text),
  speakResult: (payload) => ipcRenderer.invoke("result:speak", payload),
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
  onVoiceStatus: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("voice:status", listener);
    return () => ipcRenderer.removeListener("voice:status", listener);
  },
  onVoiceRecorderCommand: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("voice:recorder-command", listener);
    return () => ipcRenderer.removeListener("voice:recorder-command", listener);
  },
  onWarning: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("app:warning", listener);
    return () => ipcRenderer.removeListener("app:warning", listener);
  }
});
