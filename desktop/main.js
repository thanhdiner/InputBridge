const {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  session,
  shell,
  Tray
} = require("electron");
const { execFile, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");
const { translateBlocks, translateText } = require("./src/translation");
const { startEdgeTtsGateway, synthesizeEdgeTts } = require("./src/edgeTtsGateway");
const { recognizeVietnamese, terminateTesseractOcr } = require("./src/tesseractOcr");

const execFileAsync = promisify(execFile);
const DEFAULT_HOTKEY = "CommandOrControl+Shift+X";
const DEFAULT_VOICE_HOTKEY = "Super+Shift+F";
const PUSH_TO_TALK_HOLD_MS = 180;
const START_HIDDEN_ARG = "--hidden";
const DEFAULT_SETTINGS = Object.freeze({
  sourceLanguage: "Auto detect",
  targetLanguage: "Vietnamese",
  showOriginal: true,
  hotkey: DEFAULT_HOTKEY,
  voiceHotkey: DEFAULT_VOICE_HOTKEY,
  pushToTalkEnabled: true,
  captureMode: "layout",
  startupEnabled: true
});

let mainWindow = null;
let resultWindow = null;
let tray = null;
let captureInProgress = false;
let restoreMainAfterCapture = false;
let isQuitting = false;
let settings = { ...DEFAULT_SETTINGS };
let latestResult = null;
let activeHotkey = null;
let activeVoiceHotkey = null;
let pushToTalkProcess = null;
let pushToTalkRestartTimer = null;
let pushToTalkHeld = false;
let pushToTalkStartPromise = null;
let voiceRecordingSession = null;
let voiceRecorderStartTimer = null;
let voiceOverlayWindow = null;
let voiceOverlayReady = false;
let voiceOverlayHideTimer = null;
let lastVoiceStatus = null;
let speechSettingsOpenedAt = 0;
let edgeTtsGateway = null;
const selectionWindows = new Set();
const selectionContexts = new Map();
const resultContexts = new Map();
let activeCaptures = new Map();
const WINDOWS_APP_ID = "com.inputbridge.desktop";

if (process.platform === "win32") {
  app.setAppUserModelId(WINDOWS_APP_ID);
}

function loadLanguageCatalog() {
  const catalogPath = app.isPackaged
    ? path.join(process.resourcesPath, "languages.js")
    : path.join(__dirname, "..", "languages.js");
  delete require.cache[require.resolve(catalogPath)];
  require(catalogPath);
}

function getIconPath() {
  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, "icon128.png"),
        path.join(process.resourcesPath, "app.asar", "assets", "icon128.png")
      ]
    : [
        path.join(__dirname, "assets", "icon128.png"),
        path.join(__dirname, "..", "icons", "icon128.png")
      ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

async function loadSettings() {
  try {
    const stored = JSON.parse(await fsp.readFile(getSettingsPath(), "utf8"));
    settings = sanitizeSettings(stored);
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
}

async function saveSettings(next) {
  const previousPushToTalkEnabled = settings.pushToTalkEnabled;
  settings = sanitizeSettings({ ...settings, ...next, hotkey: settings.hotkey, voiceHotkey: settings.voiceHotkey });
  await persistSettings();
  if (settings.pushToTalkEnabled !== previousPushToTalkEnabled) {
    if (settings.pushToTalkEnabled) startPushToTalkHook();
    else stopPushToTalkHook();
  }
  return settings;
}

async function persistSettings() {
  await fsp.mkdir(path.dirname(getSettingsPath()), { recursive: true });
  await fsp.writeFile(getSettingsPath(), JSON.stringify(settings, null, 2), "utf8");
}

function sanitizeSettings(input = {}) {
  const catalog = globalThis.InputBridgeLanguageCatalog;
  const languageNames = new Set((catalog?.languages || []).map((item) => item.name));
  const sourceLanguage = input.sourceLanguage === "Auto detect" || languageNames.has(input.sourceLanguage)
    ? input.sourceLanguage
    : DEFAULT_SETTINGS.sourceLanguage;
  const targetLanguage = languageNames.has(input.targetLanguage)
    ? input.targetLanguage
    : DEFAULT_SETTINGS.targetLanguage;
  return {
    sourceLanguage,
    targetLanguage,
    showOriginal: input.showOriginal !== false,
    hotkey: normalizeHotkey(input.hotkey) || DEFAULT_HOTKEY,
    voiceHotkey: normalizeHotkey(input.voiceHotkey) || DEFAULT_VOICE_HOTKEY,
    pushToTalkEnabled: input.pushToTalkEnabled !== false,
    captureMode: input.captureMode === "layout" ? "layout" : "text",
    startupEnabled: input.startupEnabled !== false
  };
}

const WINDOWS_RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const STARTUP_VALUE_NAME = "InputBridge Desktop";

function getLoginItemOptions() {
  const executablePath = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  return {
    path: executablePath,
    args: [START_HIDDEN_ARG],
    name: STARTUP_VALUE_NAME
  };
}

function getStartupCommand(options = getLoginItemOptions()) {
  return `"${options.path}" ${options.args.join(" ")}`.trim();
}

function readStartupCommand() {
  try {
    const output = execFileSync(
      "reg.exe",
      ["QUERY", WINDOWS_RUN_KEY, "/v", STARTUP_VALUE_NAME],
      { windowsHide: true, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    return String(output || "").match(/REG_SZ\s+(.+)$/m)?.[1]?.trim() || "";
  } catch {
    return "";
  }
}

function syncStartupRegistration() {
  if (process.platform !== "win32" || !app.isPackaged) {
    return { ok: true, enabled: settings.startupEnabled, skipped: true };
  }

  const options = getLoginItemOptions();
  const expectedCommand = getStartupCommand(options);
  if (settings.startupEnabled) {
    execFileSync(
      "reg.exe",
      ["ADD", WINDOWS_RUN_KEY, "/v", STARTUP_VALUE_NAME, "/t", "REG_SZ", "/d", expectedCommand, "/f"],
      { windowsHide: true, stdio: "ignore" }
    );
  } else if (readStartupCommand()) {
    execFileSync(
      "reg.exe",
      ["DELETE", WINDOWS_RUN_KEY, "/v", STARTUP_VALUE_NAME, "/f"],
      { windowsHide: true, stdio: "ignore" }
    );
  }

  const currentCommand = readStartupCommand();
  const enabled = Boolean(currentCommand);
  if (enabled !== settings.startupEnabled || (enabled && currentCommand.toLowerCase() !== expectedCommand.toLowerCase())) {
    throw new Error("Windows không cập nhật được thiết lập khởi động cùng hệ thống.");
  }

  return {
    ok: true,
    enabled,
    executableWillLaunchAtLogin: enabled,
    path: options.path
  };
}

async function updateStartupEnabled(enabled) {
  const previous = settings.startupEnabled;
  settings = { ...settings, startupEnabled: Boolean(enabled) };
  try {
    const result = syncStartupRegistration();
    await persistSettings();
    return result;
  } catch (error) {
    settings = { ...settings, startupEnabled: previous };
    await persistSettings();
    return { ok: false, enabled: previous, error: error?.message || String(error) };
  }
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  if (tray) return;
  const iconPath = getIconPath();
  const trayIcon = iconPath
    ? nativeImage.createFromPath(iconPath).resize({ width: 20, height: 20 })
    : nativeImage.createEmpty();
  tray = new Tray(trayIcon);
  tray.setToolTip("InputBridge Desktop");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Mở InputBridge", click: showMainWindow },
    { label: "Chụp vùng để dịch", click: () => void beginCapture() },
    { type: "separator" },
    {
      label: "Thoát hẳn",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));
  tray.on("click", showMainWindow);
  tray.on("double-click", showMainWindow);
}

function createMainWindow({ showOnReady = true } = {}) {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 500,
    minWidth: 390,
    minHeight: 460,
    show: false,
    frame: false,
    transparent: false,
    hasShadow: true,
    roundedCorners: true,
    title: "InputBridge Desktop",
    icon: getIconPath(),
    backgroundColor: "#f1f6fb",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.once("ready-to-show", () => {
    if (showOnReady) mainWindow?.show();
  });
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow?.hide();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function normalizeHotkey(value) {
  const accelerator = String(value || "").trim();
  if (!accelerator || accelerator.length > 100 || /[\r\n]/.test(accelerator)) return "";
  return accelerator;
}

function formatHotkey(accelerator) {
  return String(accelerator || DEFAULT_HOTKEY)
    .split("+")
    .map((part) => ({
      CommandOrControl: "Ctrl",
      Command: "Cmd",
      Control: "Ctrl",
      Super: "Win",
      Alt: "Alt",
      Option: "Alt",
      Shift: "Shift",
      Return: "Enter",
      Space: "Space"
    })[part] || part)
    .join(" + ");
}

function applyHotkey(accelerator) {
  const candidate = normalizeHotkey(accelerator);
  if (!candidate) return { ok: false, error: "Phím tắt không hợp lệ." };
  if (activeHotkey === candidate && globalShortcut.isRegistered(candidate)) {
    return { ok: true, accelerator: candidate, label: formatHotkey(candidate) };
  }

  let registered = false;
  try {
    registered = globalShortcut.register(candidate, () => void beginCapture());
  } catch {
    registered = false;
  }
  if (!registered) {
    return {
      ok: false,
      error: `Không dùng được ${formatHotkey(candidate)}. Phím này có thể đang bị Windows hoặc app khác chiếm.`
    };
  }

  const previous = activeHotkey;
  activeHotkey = candidate;
  if (previous && previous !== candidate) globalShortcut.unregister(previous);
  return { ok: true, accelerator: candidate, label: formatHotkey(candidate) };
}

async function updateHotkey(accelerator) {
  const result = applyHotkey(accelerator);
  if (!result.ok) return result;
  settings = { ...settings, hotkey: result.accelerator };
  await persistSettings();
  return result;
}

function getSpeechHelperPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "speech", "SpeechHelper.exe")
    : path.join(__dirname, "native", "SpeechHelper", "publish", "SpeechHelper.exe");
}

function startPushToTalkHook() {
  clearTimeout(pushToTalkRestartTimer);
  pushToTalkRestartTimer = null;
  if (process.platform !== "win32" || isQuitting || !settings.pushToTalkEnabled) return;
  if (pushToTalkProcess && !pushToTalkProcess.killed) return;

  const helperPath = getSpeechHelperPath();
  if (!fs.existsSync(helperPath)) {
    mainWindow?.webContents.send("app:warning", "Thiếu SpeechHelper nên Right Ctrl push-to-talk chưa chạy.");
    return;
  }

  const child = execFile(helperPath, ["hook", String(PUSH_TO_TALK_HOLD_MS)], { windowsHide: true });
  pushToTalkProcess = child;
  let stdoutBuffer = "";
  let stderr = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk) => { stderr += chunk; });
  child.stdout?.on("data", (chunk) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const payload = JSON.parse(line);
        if (payload.type === "ptt-start") handlePushToTalkStart();
        else if (payload.type === "ptt-stop") handlePushToTalkStop();
      } catch {}
    }
  });
  child.on("error", (error) => {
    if (pushToTalkProcess === child) pushToTalkProcess = null;
    console.warn("[InputBridge push-to-talk]", error?.message || error);
  });
  child.on("exit", (code) => {
    if (pushToTalkProcess !== child) return;
    pushToTalkProcess = null;
    pushToTalkHeld = false;
    if (voiceRecordingSession?.trigger === "ptt") stopVoiceInput();
    if (!isQuitting && settings.pushToTalkEnabled) {
      if (code) console.warn("[InputBridge push-to-talk]", stderr.trim() || `Hook thoát với mã ${code}.`);
      pushToTalkRestartTimer = setTimeout(startPushToTalkHook, 1500);
    }
  });
}

function stopPushToTalkHook() {
  clearTimeout(pushToTalkRestartTimer);
  pushToTalkRestartTimer = null;
  pushToTalkHeld = false;
  if (voiceRecordingSession?.trigger === "ptt") stopVoiceInput();
  const child = pushToTalkProcess;
  pushToTalkProcess = null;
  child?.kill();
}

function handlePushToTalkStart() {
  if (!settings.pushToTalkEnabled || pushToTalkHeld) return;
  pushToTalkHeld = true;
  if (voiceRecordingSession) return;
  const startPromise = startVoiceInput("ptt");
  pushToTalkStartPromise = startPromise;
  void startPromise.finally(() => {
    if (pushToTalkStartPromise === startPromise) pushToTalkStartPromise = null;
    if (!pushToTalkHeld && voiceRecordingSession?.trigger === "ptt") stopVoiceInput();
  });
}

function handlePushToTalkStop() {
  pushToTalkHeld = false;
  if (voiceRecordingSession?.trigger === "ptt") stopVoiceInput();
}

function getWhisperScriptPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "whisper", "transcribe.py")
    : path.join(__dirname, "native", "WhisperHelper", "transcribe.py");
}

function getWhisperPythonPath() {
  const candidates = [
    process.env.INPUTBRIDGE_WHISPER_PYTHON,
    path.join(__dirname, "..", "..", "VoxShift", ".venv", "Scripts", "python.exe"),
    path.join(__dirname, "..", "..", "TimeScript", ".venv", "Scripts", "python.exe")
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function parseJsonLine(output) {
  const lines = String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(lines[index]); } catch {}
  }
  return null;
}

async function captureForegroundWindow() {
  const helperPath = getSpeechHelperPath();
  if (!fs.existsSync(helperPath)) return 0;
  try {
    const { stdout } = await execFileAsync(helperPath, ["foreground"], {
      windowsHide: true,
      timeout: 5000,
      maxBuffer: 64 * 1024
    });
    const payload = parseJsonLine(stdout);
    return Number(payload?.targetWindow || 0);
  } catch {
    return 0;
  }
}

function voiceAudioExtension(mimeType) {
  const value = String(mimeType || "").toLowerCase();
  if (value.includes("ogg")) return ".ogg";
  if (value.includes("wav")) return ".wav";
  return ".webm";
}

function normalizeVoiceAudioBytes(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(new Uint8Array(value));
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (Array.isArray(value)) return Buffer.from(value);
  return Buffer.alloc(0);
}

async function transcribeVoiceAudio(audioPath, sourceCode) {
  const pythonPath = getWhisperPythonPath();
  const scriptPath = getWhisperScriptPath();
  if (!pythonPath) {
    throw new Error("Chưa tìm thấy faster-whisper runtime. Đặt INPUTBRIDGE_WHISPER_PYTHON hoặc cài runtime cho InputBridge.");
  }
  if (!fs.existsSync(scriptPath)) throw new Error("Thiếu WhisperHelper/transcribe.py.");

  const language = sourceCode && sourceCode !== "auto"
    ? String(sourceCode).split("-", 1)[0]
    : "auto";
  try {
    const { stdout, stderr } = await execFileAsync(pythonPath, [scriptPath, audioPath, language], {
      windowsHide: true,
      timeout: 90000,
      maxBuffer: 2 * 1024 * 1024,
      env: {
        ...process.env,
        HF_HUB_OFFLINE: "1",
        TRANSFORMERS_OFFLINE: "1"
      }
    });
    const payload = parseJsonLine(stdout);
    if (!payload?.ok) throw new Error(payload?.error || String(stderr || "Whisper không trả kết quả.").trim());
    return payload;
  } catch (error) {
    const payload = parseJsonLine(error?.stdout);
    throw new Error(payload?.error || error?.message || String(error));
  }
}

function getVoiceOverlayBounds() {
  const width = 344;
  const height = 92;
  const gap = 18;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const work = display.workArea;
  return {
    x: Math.round(work.x + work.width - width - gap),
    y: Math.round(work.y + work.height - height - gap),
    width,
    height
  };
}

function configureVoiceMediaPermissions() {
  const allowedPermissions = new Set(["media", "audioCapture", "microphone"]);
  const isVoiceOverlay = (webContents) =>
    Boolean(voiceOverlayWindow && !voiceOverlayWindow.isDestroyed() && voiceOverlayWindow.webContents === webContents);

  session.defaultSession.setPermissionCheckHandler((webContents, permission) =>
    allowedPermissions.has(permission) && isVoiceOverlay(webContents)
  );
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(allowedPermissions.has(permission) && isVoiceOverlay(webContents));
  });
}

function createVoiceOverlayWindow() {
  if (voiceOverlayWindow && !voiceOverlayWindow.isDestroyed()) return voiceOverlayWindow;
  const bounds = getVoiceOverlayBounds();
  const win = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    movable: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  voiceOverlayWindow = win;
  voiceOverlayReady = false;
  win.removeMenu();
  win.setIgnoreMouseEvents(true);
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, "voice-overlay", "index.html"));
  win.webContents.once("did-finish-load", () => {
    if (win.isDestroyed()) return;
    voiceOverlayReady = true;
    if (lastVoiceStatus) {
      win.webContents.send("voice:status", lastVoiceStatus);
      win.showInactive();
      win.moveTop();
    }
  });
  win.on("closed", () => {
    if (voiceOverlayWindow === win) voiceOverlayWindow = null;
    voiceOverlayReady = false;
  });
  return win;
}

function positionVoiceOverlay() {
  if (!voiceOverlayWindow || voiceOverlayWindow.isDestroyed()) return;
  const bounds = getVoiceOverlayBounds();
  voiceOverlayWindow.setBounds(bounds, false);
}

function normalizeSpeechError(message) {
  const error = String(message || "Voice input lỗi.").trim();
  if (/speech privacy policy|online speech recognition/i.test(error)) {
    return "Windows đang tắt Online speech recognition. Bật tại Settings > Privacy & security > Speech rồi thử lại.";
  }
  if (/access is denied|unauthorizedaccess|chặn quyền micro|microphone access/i.test(error)) {
    return "Windows đang chặn quyền micro cho ứng dụng desktop. Bật Microphone access và Let desktop apps access your microphone trong Settings > Privacy & security > Microphone.";
  }
  return error;
}

function maybeOpenSpeechPrivacySettings(error) {
  let settingsUri = "";
  if (/online speech recognition|speech privacy policy/i.test(error)) {
    settingsUri = "ms-settings:privacy-speech";
  } else if (/quyền micro|microphone access|desktop apps access your microphone/i.test(error)) {
    settingsUri = "ms-settings:privacy-microphone";
  }
  if (!settingsUri) return;
  const now = Date.now();
  if (now - speechSettingsOpenedAt < 15000) return;
  speechSettingsOpenedAt = now;
  void shell.openExternal(settingsUri).catch(() => {});
}

function reportSpeechError(message) {
  const error = normalizeSpeechError(message);
  sendVoiceStatus("error", { error });
  maybeOpenSpeechPrivacySettings(error);
}

function sendVoiceStatus(status, extra = {}) {
  const payload = { status, ...extra };
  lastVoiceStatus = payload;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("voice:status", payload);
  }

  clearTimeout(voiceOverlayHideTimer);
  const win = createVoiceOverlayWindow();
  positionVoiceOverlay();
  if (voiceOverlayReady && !win.isDestroyed()) {
    win.webContents.send("voice:status", payload);
    win.showInactive();
    win.moveTop();
  }

  if (status === "done" || status === "error") {
    const delayMs = status === "error" ? 6500 : 2200;
    voiceOverlayHideTimer = setTimeout(() => {
      lastVoiceStatus = null;
      if (voiceOverlayWindow && !voiceOverlayWindow.isDestroyed()) voiceOverlayWindow.hide();
    }, delayMs);
  }
}

async function waitForVoiceOverlayReady() {
  const win = createVoiceOverlayWindow();
  if (voiceOverlayReady && !win.isDestroyed()) return win;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Voice overlay khởi động quá lâu.")), 8000);
    const finish = () => {
      clearTimeout(timeout);
      if (win.isDestroyed()) reject(new Error("Voice overlay đã đóng."));
      else resolve();
    };
    if (voiceOverlayReady) finish();
    else win.webContents.once("did-finish-load", finish);
  });
  return win;
}

function sendVoiceRecorderCommand(action) {
  if (!voiceOverlayWindow || voiceOverlayWindow.isDestroyed() || !voiceOverlayReady) return false;
  voiceOverlayWindow.webContents.send("voice:recorder-command", { action });
  return true;
}

async function toggleVoiceInput() {
  if (voiceRecordingSession) return stopVoiceInput();
  return startVoiceInput("toggle");
}

async function startVoiceInput(trigger = "toggle") {
  if (voiceRecordingSession) return { ok: false, error: "Voice input đang chạy." };
  if (!getWhisperPythonPath()) {
    const error = "Chưa tìm thấy faster-whisper runtime trên máy.";
    sendVoiceStatus("error", { error });
    return { ok: false, error };
  }

  const sourceCode = settings.sourceLanguage === "Auto detect"
    ? "auto"
    : (globalThis.InputBridgeLanguageCatalog?.codeFor(settings.sourceLanguage, "auto") || "auto");
  const targetWindow = await captureForegroundWindow();
  voiceRecordingSession = {
    targetWindow,
    sourceCode,
    trigger,
    state: "starting",
    startedAt: Date.now()
  };
  sendVoiceStatus("starting", { trigger });

  try {
    await waitForVoiceOverlayReady();
    if (!voiceRecordingSession) return { ok: false, error: "Lượt ghi âm đã bị hủy." };
    if (!sendVoiceRecorderCommand("start")) throw new Error("Không gửi được lệnh mở micro.");
    clearTimeout(voiceRecorderStartTimer);
    voiceRecorderStartTimer = setTimeout(() => {
      if (voiceRecordingSession?.state === "starting") {
        voiceRecordingSession = null;
        reportSpeechError("Micro không phản hồi sau 8 giây.");
      }
    }, 8000);
    return { ok: true, recording: true };
  } catch (error) {
    voiceRecordingSession = null;
    reportSpeechError(error?.message || String(error));
    return { ok: false, error: error?.message || String(error) };
  }
}

function stopVoiceInput() {
  if (!voiceRecordingSession) return { ok: false, error: "Chưa ghi âm." };
  if (["processing", "transcribing", "translating"].includes(voiceRecordingSession.state)) {
    return { ok: true, recording: false, processing: true };
  }
  voiceRecordingSession.state = "processing";
  clearTimeout(voiceRecorderStartTimer);
  sendVoiceStatus("processing", { trigger: voiceRecordingSession.trigger });
  if (!sendVoiceRecorderCommand("stop")) {
    const error = "Voice recorder chưa sẵn sàng để dừng.";
    voiceRecordingSession = null;
    reportSpeechError(error);
    return { ok: false, error };
  }
  return { ok: true, recording: false };
}

async function handleVoiceAudio(payload = {}) {
  if (!voiceRecordingSession) return { ok: false, error: "Lượt ghi âm đã hết hạn." };
  const currentSession = voiceRecordingSession;
  const audioBytes = normalizeVoiceAudioBytes(payload.bytes);
  if (audioBytes.length < 800) {
    voiceRecordingSession = null;
    const error = "Micro không thu được dữ liệu âm thanh.";
    sendVoiceStatus("error", { error });
    return { ok: false, error };
  }
  if (audioBytes.length > 25 * 1024 * 1024) {
    voiceRecordingSession = null;
    const error = "Đoạn ghi âm quá lớn. Hãy nói ngắn hơn.";
    sendVoiceStatus("error", { error });
    return { ok: false, error };
  }

  currentSession.state = "transcribing";
  sendVoiceStatus("transcribing", { durationMs: Number(payload.durationMs || 0) });
  const tempDirectory = path.join(app.getPath("temp"), "InputBridge", "voice");
  const audioPath = path.join(
    tempDirectory,
    `voice-${Date.now()}-${Math.random().toString(36).slice(2, 9)}${voiceAudioExtension(payload.mimeType)}`
  );

  try {
    await fsp.mkdir(tempDirectory, { recursive: true });
    await fsp.writeFile(audioPath, audioBytes);
    const transcription = await transcribeVoiceAudio(audioPath, currentSession.sourceCode);
    const original = String(transcription.text || "").trim();
    if (!original) throw new Error("Không nghe rõ nội dung nào. Hãy nói gần micro hơn rồi thử lại.");
    await finishVoiceInput(original, currentSession.targetWindow, transcription);
    return { ok: true, text: original };
  } catch (error) {
    voiceRecordingSession = null;
    const message = error?.message || String(error);
    sendVoiceStatus("error", { error: message });
    return { ok: false, error: message };
  } finally {
    void fsp.unlink(audioPath).catch(() => {});
  }
}

async function finishVoiceInput(original, targetWindow, transcription = {}) {
  if (!original) throw new Error("Không nghe rõ nội dung nào.");
  voiceRecordingSession = voiceRecordingSession
    ? { ...voiceRecordingSession, state: "translating" }
    : { state: "translating", targetWindow };
  sendVoiceStatus("translating", {
    original,
    detectedLanguage: transcription.language || "",
    elapsedMs: transcription.elapsedMs || 0
  });

  const translated = await translateText(original, settings);
  clipboard.writeText(translated.result);
  if (targetWindow) {
    await execFileAsync(getSpeechHelperPath(), ["paste", String(targetWindow)], {
      windowsHide: true,
      timeout: 10000,
      maxBuffer: 64 * 1024
    });
  }
  voiceRecordingSession = null;
  sendVoiceStatus("done", {
    original,
    translation: translated.result,
    detectedLanguage: transcription.language || ""
  });
}

function applyVoiceHotkey(accelerator) {
  const candidate = normalizeHotkey(accelerator);
  if (!candidate) return { ok: false, error: "Phím tắt voice không hợp lệ." };
  if (candidate === activeHotkey || candidate === settings.hotkey) return { ok: false, error: "Phím voice đang trùng phím chụp." };
  if (activeVoiceHotkey === candidate && globalShortcut.isRegistered(candidate)) {
    return { ok: true, accelerator: candidate, label: formatHotkey(candidate) };
  }
  let registered = false;
  try { registered = globalShortcut.register(candidate, () => void toggleVoiceInput()); } catch {}
  if (!registered) return { ok: false, error: `Không dùng được ${formatHotkey(candidate)}. Phím có thể đang bị app khác chiếm.` };
  const previous = activeVoiceHotkey;
  activeVoiceHotkey = candidate;
  if (previous && previous !== candidate) globalShortcut.unregister(previous);
  return { ok: true, accelerator: candidate, label: formatHotkey(candidate) };
}

async function updateVoiceHotkey(accelerator) {
  const result = applyVoiceHotkey(accelerator);
  if (!result.ok) return result;
  settings = { ...settings, voiceHotkey: result.accelerator };
  await persistSettings();
  return result;
}

async function updateCaptureMode(mode) {
  const nextMode = mode === "layout" ? "layout" : "text";
  settings = { ...settings, captureMode: nextMode };
  await persistSettings();

  for (const [webContentsId, context] of selectionContexts.entries()) {
    selectionContexts.set(webContentsId, { ...context, captureMode: nextMode });
  }
  for (const win of selectionWindows) {
    if (!win.isDestroyed()) win.webContents.send("selection:mode-updated", nextMode);
  }
  return { ok: true, mode: nextMode };
}

async function beginCapture() {
  if (captureInProgress) return { ok: false, error: "Đang có một lượt chọn vùng khác." };
  captureInProgress = true;
  restoreMainAfterCapture = Boolean(mainWindow?.isVisible());
  closeSelectionWindows();
  resultWindow?.hide();
  mainWindow?.hide();

  try {
    await delay(160);
    const displays = screen.getAllDisplays();
    const captures = await captureAllDisplays(displays);
    activeCaptures = new Map(captures.map((item) => [String(item.display.id), item]));
    if (!captures.length) throw new Error("Không chụp được màn hình.");

    for (const capture of captures) {
      createSelectionWindow(capture);
    }
    return { ok: true };
  } catch (error) {
    captureInProgress = false;
    if (restoreMainAfterCapture) showMainWindow();
    restoreMainAfterCapture = false;
    return { ok: false, error: error?.message || String(error) };
  }
}

async function captureAllDisplays(displays) {
  const captures = [];
  for (let index = 0; index < displays.length; index += 1) {
    const display = displays[index];
    const width = Math.max(1, Math.round(display.size.width * display.scaleFactor));
    const height = Math.max(1, Math.round(display.size.height * display.scaleFactor));
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width, height },
      fetchWindowIcons: false
    });
    const source = sources.find((item) => String(item.display_id) === String(display.id)) || sources[index];
    if (!source || source.thumbnail.isEmpty()) continue;
    captures.push({ display, image: source.thumbnail });
  }
  return captures;
}

function createSelectionWindow(capture) {
  const { display, image } = capture;
  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: false,
    backgroundColor: "#000000",
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const context = {
    displayId: String(display.id),
    imageDataUrl: image.toDataURL(),
    width: display.bounds.width,
    height: display.bounds.height,
    primary: display.id === screen.getPrimaryDisplay().id,
    captureMode: settings.captureMode
  };
  const webContentsId = win.webContents.id;
  selectionContexts.set(webContentsId, context);
  selectionWindows.add(win);
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.removeMenu();
  win.loadFile(path.join(__dirname, "selection", "index.html"));
  win.once("ready-to-show", () => win.show());
  win.on("closed", () => {
    selectionContexts.delete(webContentsId);
    selectionWindows.delete(win);
  });
}

function closeSelectionWindows() {
  for (const win of selectionWindows) {
    if (!win.isDestroyed()) win.close();
  }
  selectionWindows.clear();
  selectionContexts.clear();
}

function cancelCapture() {
  closeSelectionWindows();
  captureInProgress = false;
  activeCaptures.clear();
  if (restoreMainAfterCapture) showMainWindow();
  restoreMainAfterCapture = false;
  return { ok: true };
}

async function acceptSelection(payload) {
  const displayId = String(payload?.displayId || "");
  const capture = activeCaptures.get(displayId);
  if (!capture) throw new Error("Không tìm thấy ảnh chụp của màn hình đã chọn.");

  // Windows may constrain the overlay to the work area, so renderer coordinates
  // must be mapped from its real viewport instead of the requested display bounds.
  const viewport = normalizeSelectionViewport(payload?.viewport, capture.display.bounds);
  const rect = normalizeRect(payload?.rect, viewport);
  const mode = payload?.mode === "layout" ? "layout" : "text";
  settings = { ...settings, captureMode: mode };
  closeSelectionWindows();
  captureInProgress = false;
  restoreMainAfterCapture = false;
  activeCaptures.clear();

  const cropped = cropCapture(capture, rect, viewport);
  if (cropped.isEmpty()) throw new Error("Vùng chọn không hợp lệ.");

  const imagePath = path.join(app.getPath("temp"), `inputbridge-${Date.now()}-${process.pid}.png`);
  const ocrInput = prepareOcrInputImage(cropped);
  await fsp.writeFile(imagePath, ocrInput.toPNG());
  createResultWindow(capture.display, rect, {
    mode,
    status: "loading",
    previewDataUrl: cropped.resize({ width: Math.min(520, cropped.getSize().width) }).toDataURL(),
    layoutImageDataUrl: mode === "layout" ? cropped.toDataURL() : "",
    original: "",
    translation: "",
    layoutBlocks: [],
    meta: mode === "layout" ? "Đang phân tích bố cục…" : "Đang nhận dạng chữ…"
  });

  if (mode === "layout") {
    void processCaptureLayout(imagePath, cropped);
  } else {
    void processCaptureText(imagePath, cropped);
  }
  return { ok: true };
}

function normalizeRect(input, bounds) {
  const x1 = clamp(Math.round(Number(input?.x || 0)), 0, bounds.width - 1);
  const y1 = clamp(Math.round(Number(input?.y || 0)), 0, bounds.height - 1);
  const width = clamp(Math.round(Number(input?.width || 0)), 1, bounds.width - x1);
  const height = clamp(Math.round(Number(input?.height || 0)), 1, bounds.height - y1);
  if (width < 8 || height < 8) throw new Error("Vùng chọn quá nhỏ.");
  return { x: x1, y: y1, width, height };
}

function normalizeSelectionViewport(input, fallbackBounds) {
  const fallbackWidth = Math.max(1, Math.round(Number(fallbackBounds?.width) || 1));
  const fallbackHeight = Math.max(1, Math.round(Number(fallbackBounds?.height) || 1));
  const inputWidth = Math.round(Number(input?.width));
  const inputHeight = Math.round(Number(input?.height));
  return {
    width: Number.isFinite(inputWidth) && inputWidth > 0 ? inputWidth : fallbackWidth,
    height: Number.isFinite(inputHeight) && inputHeight > 0 ? inputHeight : fallbackHeight
  };
}

function cropCapture(capture, rect, viewport) {
  const imageSize = capture.image.getSize();
  const scaleX = imageSize.width / viewport.width;
  const scaleY = imageSize.height / viewport.height;
  const left = clamp(Math.floor(rect.x * scaleX), 0, imageSize.width - 1);
  const top = clamp(Math.floor(rect.y * scaleY), 0, imageSize.height - 1);
  const right = clamp(Math.ceil((rect.x + rect.width) * scaleX), left + 1, imageSize.width);
  const bottom = clamp(Math.ceil((rect.y + rect.height) * scaleY), top + 1, imageSize.height);
  const cropRect = {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
  return capture.image.crop(cropRect);
}

function prepareOcrInputImage(image) {
  const size = image.getSize();
  const targetHeight = 120;
  const maxDimension = 2000;
  const maxScale = 3;
  const scale = Math.min(
    maxScale,
    maxDimension / Math.max(1, size.width, size.height),
    Math.max(1, targetHeight / Math.max(1, size.height))
  );
  if (!Number.isFinite(scale) || Math.abs(scale - 1) < 0.05) return image;
  const targetW = clamp(Math.round(size.width * scale), 1, maxDimension);
  const targetH = clamp(Math.round(size.height * scale), 1, maxDimension);
  return image.resize({
    width: targetW,
    height: targetH,
    quality: "best"
  });
}

async function processCaptureText(imagePath, cropped) {
  let original = "";
  try {
    sendResultUpdate({ mode: "text", status: "loading", meta: "Đang nhận dạng chữ…" });
    const ocr = await runOcr(imagePath, getOcrLanguageTag());
    original = String(ocr.text || "").trim();
    if (!original) throw new Error("OCR không nhận được chữ. Chọn sát phần chữ hơn hoặc tăng kích thước hiển thị.");

    sendResultUpdate({
      status: "loading",
      original,
      meta: `${formatOcrDetection(ocr)} · đang dịch…`
    });
    const translated = await translateText(original, settings);
    latestResult = {
      mode: "text",
      status: "done",
      previewDataUrl: cropped.resize({ width: Math.min(520, cropped.getSize().width) }).toDataURL(),
      original,
      translation: translated.result,
      sourceLanguage: translated.detectedSourceLanguage,
      targetLanguage: translated.targetLanguage,
      ocrDetection: ocr.detection,
      meta: `${translated.detectedSourceLanguage} → ${translated.targetLanguage}${translated.chunkCount > 1 ? ` · ${translated.chunkCount} phần` : ""} · ${formatOcrDetection(ocr)}`,
      showOriginal: settings.showOriginal
    };
    sendResultUpdate(latestResult);
  } catch (error) {
    latestResult = {
      mode: "text",
      status: "error",
      original,
      translation: "",
      meta: "Không xử lý được",
      error: error?.message || String(error),
      showOriginal: settings.showOriginal
    };
    sendResultUpdate(latestResult);
  } finally {
    setTimeout(() => fsp.unlink(imagePath).catch(() => {}), 1000);
  }
}

async function processCaptureLayout(imagePath, cropped) {
  let original = "";
  const layoutImageDataUrl = cropped.toDataURL();
  try {
    sendResultUpdate({
      mode: "layout",
      status: "loading",
      layoutImageDataUrl,
      meta: "Đang nhận dạng từng vùng chữ…"
    });
    const ocr = await runOcr(imagePath, getOcrLanguageTag());
    original = String(ocr.text || "").trim();
    const blocks = buildLayoutBlocks(ocr, cropped.getSize());
    if (!original) {
      throw new Error("OCR chưa nhận được chữ trong vùng chọn.");
    }
    if (!blocks.length) {
      throw new Error("OCR không tìm được vùng chữ có tọa độ. Hãy chọn sát phần chữ hơn.");
    }

    sendResultUpdate({
      status: "loading",
      original,
      layoutBlocks: blocks,
      meta: `${formatOcrDetection(ocr)} · đang dịch ${blocks.length} vùng…`
    });

    const translated = await translateBlocks(blocks, settings);
    const translationsById = new Map(translated.blocks.map((block) => [String(block.id), block.translation]));
    const layoutBlocks = blocks.map((block) => ({
      ...block,
      translation: translationsById.get(String(block.id)) || block.text
    }));

    latestResult = {
      mode: "layout",
      status: "done",
      layoutImageDataUrl,
      previewDataUrl: cropped.resize({ width: Math.min(520, cropped.getSize().width) }).toDataURL(),
      original,
      translation: layoutBlocks.map((block) => block.translation).join("\n"),
      layoutBlocks,
      sourceLanguage: translated.detectedSourceLanguage,
      targetLanguage: translated.targetLanguage,
      ocrDetection: ocr.detection,
      meta: `${translated.detectedSourceLanguage} → ${translated.targetLanguage} · ${layoutBlocks.length} vùng · ${formatOcrDetection(ocr)}`,
      showOriginal: false
    };
    sendResultUpdate(latestResult);
  } catch (error) {
    latestResult = {
      mode: "layout",
      status: "error",
      layoutImageDataUrl,
      original,
      translation: "",
      layoutBlocks: [],
      meta: "Không xử lý được bố cục",
      error: error?.message || String(error),
      showOriginal: false
    };
    sendResultUpdate(latestResult);
  } finally {
    setTimeout(() => fsp.unlink(imagePath).catch(() => {}), 1000);
  }
}

async function retranslateCapture(targetLanguage) {
  if (!latestResult) return { ok: false, error: "Không có kết quả để dịch lại." };
  const target = String(targetLanguage || "Vietnamese").trim();
  const sessionSettings = { ...settings, targetLanguage: target };

  if (latestResult.mode === "layout") {
    const rawBlocks = latestResult.layoutBlocks || [];
    if (!rawBlocks.length) return { ok: false, error: "Không có khối chữ để dịch." };

    sendResultUpdate({
      status: "loading",
      meta: `Đang dịch lại sang ${target}…`
    });

    try {
      const translated = await translateBlocks(rawBlocks, sessionSettings);
      const translationsById = new Map(translated.blocks.map((b) => [String(b.id), b.translation]));
      const layoutBlocks = rawBlocks.map((b) => ({
        ...b,
        translation: translationsById.get(String(b.id)) || b.text
      }));

      latestResult = {
        ...latestResult,
        status: "done",
        translation: layoutBlocks.map((b) => b.translation).join("\n"),
        layoutBlocks,
        sourceLanguage: translated.detectedSourceLanguage || latestResult.sourceLanguage,
        targetLanguage: translated.targetLanguage || target,
        meta: `${translated.detectedSourceLanguage || latestResult.sourceLanguage} → ${translated.targetLanguage || target} · ${layoutBlocks.length} vùng`
      };
      sendResultUpdate(latestResult);
      return { ok: true, result: latestResult };
    } catch (error) {
      sendResultUpdate({
        status: "done",
        meta: `Dịch lại thất bại: ${error?.message || error}`
      });
      return { ok: false, error: error?.message || String(error) };
    }
  } else {
    if (!latestResult.original) return { ok: false, error: "Không có văn bản để dịch." };
    sendResultUpdate({
      status: "loading",
      meta: `Đang dịch lại sang ${target}…`
    });
    try {
      const translated = await translateText(latestResult.original, sessionSettings);
      latestResult = {
        ...latestResult,
        status: "done",
        translation: translated.result,
        sourceLanguage: translated.detectedSourceLanguage || latestResult.sourceLanguage,
        targetLanguage: translated.targetLanguage || target,
        meta: `${translated.detectedSourceLanguage || latestResult.sourceLanguage} → ${translated.targetLanguage || target}`
      };
      sendResultUpdate(latestResult);
      return { ok: true, result: latestResult };
    } catch (error) {
      sendResultUpdate({
        status: "done",
        meta: `Dịch lại thất bại: ${error?.message || error}`
      });
      return { ok: false, error: error?.message || String(error) };
    }
  }
}

async function cropAndProcessCapture(payload) {
  const dataUrl = payload?.dataUrl;
  let cropped;
  if (dataUrl) {
    cropped = nativeImage.createFromDataURL(dataUrl);
  } else if (payload?.cropRect && latestResult?.layoutImageDataUrl) {
    const baseImg = nativeImage.createFromDataURL(latestResult.layoutImageDataUrl);
    const { x, y, width, height } = payload.cropRect;
    cropped = baseImg.crop({
      x: Math.max(0, Math.round(x)),
      y: Math.max(0, Math.round(y)),
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height))
    });
  }
  if (!cropped || cropped.isEmpty()) {
    return { ok: false, error: "Ảnh vùng chọn không hợp lệ." };
  }

  const croppedSize = cropped.getSize();
  adjustResultWindowSize(croppedSize);

  const tempPath = path.join(app.getPath("temp"), `ib_crop_${Date.now()}.png`);
  await fsp.writeFile(tempPath, cropped.toPNG());
  processCaptureLayout(tempPath, cropped);
  return { ok: true };
}

async function translateSelectedText(payload) {
  const text = typeof payload === "string" ? payload : payload?.text;
  const str = String(text || "").trim();
  if (!str) return { ok: false, error: "Không có văn bản để dịch." };
  const targetLang = (typeof payload === "object" && payload?.targetLanguage)
    ? payload.targetLanguage
    : (latestResult?.targetLanguage || settings.targetLanguage || "Vietnamese");
  const sessionSettings = { ...settings, targetLanguage: targetLang };
  const result = await translateText(str, sessionSettings);
  return {
    ok: true,
    translation: result.result,
    sourceLanguage: result.detectedSourceLanguage,
    targetLanguage: result.targetLanguage
  };
}

function cleanOcrText(text) {
  return String(text || "")
    .replace(/^[\s>|•*~—–\-_/\\()[\]{}:;=+,.]+/u, "")
    .replace(/^([A-Za-z0-9])\)\s*/gu, "")
    .replace(/^[A-Za-z]\s+(?=[A-Za-z0-9_.-]{2,})/u, "")
    .trim();
}

function buildLayoutBlocks(ocr, imageSize) {
  const processedWidth = Math.max(1, Number(ocr?.processedWidth || ocr?.sourceWidth || imageSize.width));
  const processedHeight = Math.max(1, Number(ocr?.processedHeight || ocr?.sourceHeight || imageSize.height));
  const scaleX = imageSize.width / processedWidth;
  const scaleY = imageSize.height / processedHeight;

  let blocks = (Array.isArray(ocr?.lines) ? ocr.lines : [])
    .map((line, index) => {
      const words = Array.isArray(line?.words) ? line.words : [];
      if (!words.length) return null;
      const left = Math.min(...words.map((word) => Number(word.x || 0)));
      const top = Math.min(...words.map((word) => Number(word.y || 0)));
      const rawRight = Math.max(...words.map((word) => Number(word.x || 0) + Number(word.width || 0)));
      const rawBottom = Math.max(...words.map((word) => Number(word.y || 0) + Number(word.height || 0)));
      const lineH = Math.max(12, rawBottom - top);

      const rawText = String(line?.text || words.map((word) => word.text).join(" ")).trim();
      const text = cleanOcrText(rawText) || rawText;
      if (!text || text.length < 1) return null;

      const scaledLineH = lineH * scaleY;
      const padX = Math.max(4, Math.round(scaledLineH * 0.2));
      const padY = Math.max(2, Math.round(scaledLineH * 0.12));
      const charEstimatedW = Math.round(rawText.length * scaledLineH * 0.65);
      const measuredW = Math.round((rawRight - left) * scaleX);
      const contentW = Math.max(measuredW, charEstimatedW);
      const extraRight = Math.max(8, Math.round(scaledLineH * 0.4));

      const x = clamp(Math.round(left * scaleX) - padX, 0, imageSize.width - 1);
      const y = clamp(Math.round(top * scaleY) - padY, 0, imageSize.height - 1);
      const width = clamp(contentW + padX * 2 + extraRight, 1, imageSize.width - x);
      const height = clamp(Math.round(scaledLineH) + padY * 2, 1, imageSize.height - y);

      return {
        id: `line-${index}`,
        text,
        x,
        y,
        width,
        height,
        lineCount: 1,
        avgLineHeight: height
      };
    })
    .filter(Boolean);

  if (!blocks.length && ocr?.text) {
    const rawLines = String(ocr.text).split(/\r?\n+/).map((s) => s.trim()).filter(Boolean);
    const lineH = Math.max(16, Math.floor(imageSize.height / Math.max(1, rawLines.length)));
    blocks = rawLines.map((lineText, idx) => ({
      id: `line-fallback-${idx}`,
      text: cleanOcrText(lineText) || lineText,
      x: 0,
      y: idx * lineH,
      width: imageSize.width,
      height: lineH,
      lineCount: 1,
      avgLineHeight: lineH
    }));
  }

  return blocks;
}

function getOcrLanguageTag() {
  if (settings.sourceLanguage === "Auto detect") return "auto";
  return globalThis.InputBridgeLanguageCatalog?.codeFor(settings.sourceLanguage, "auto") || "auto";
}

function formatOcrDetection(ocr = {}) {
  const languageTag = String(ocr.language || "").trim();
  const languageName = globalThis.InputBridgeLanguageCatalog?.nameFor(languageTag, languageTag) ||
    languageTag ||
    "Windows OCR";
  if (ocr.detection?.mode !== "auto") return `OCR ${languageName}`;

  const candidatesChecked = Number(ocr.detection.candidatesChecked);
  if (!Number.isFinite(candidatesChecked) || candidatesChecked <= 1) {
    return `OCR auto giới hạn: ${languageName} · chỉ có 1 gói`;
  }

  const confidence = Number(ocr.detection.confidence);
  const confidenceLabel = Number.isFinite(confidence) && confidence > 0
    ? ` ${Math.round(clamp(confidence, 0, 1) * 100)}%`
    : "";
  return `OCR auto: ${languageName}${confidenceLabel} · ${candidatesChecked} gói`;
}

async function runOcr(imagePath, languageTag) {
  const requestedLanguage = String(languageTag || "auto").trim();
  if (requestedLanguage.toLowerCase().split("-")[0] === "vi") {
    return runVietnameseOcr(imagePath, "manual");
  }
  if (requestedLanguage !== "auto") {
    return runWindowsOcr(imagePath, requestedLanguage);
  }

  const [windowsResult, vietnameseResult] = await Promise.allSettled([
    runWindowsOcr(imagePath, "auto"),
    runVietnameseOcr(imagePath, "auto")
  ]);
  const windowsOcr = windowsResult.status === "fulfilled" ? windowsResult.value : null;
  const vietnameseOcr = vietnameseResult.status === "fulfilled" ? vietnameseResult.value : null;
  if (!windowsOcr && !vietnameseOcr) {
    const errors = [windowsResult.reason, vietnameseResult.reason]
      .map((error) => error?.message || String(error || ""))
      .filter(Boolean);
    throw new Error(`OCR thất bại: ${errors.join(" | ")}`);
  }

  const selected = shouldPreferVietnameseOcr(vietnameseOcr, windowsOcr)
    ? vietnameseOcr
    : (windowsOcr || vietnameseOcr);
  return mergeAutoOcrDetection(selected, [windowsOcr, vietnameseOcr].filter(Boolean));
}

async function runVietnameseOcr(imagePath, mode) {
  const langPath = app.isPackaged
    ? path.join(process.resourcesPath, "tessdata")
    : path.join(__dirname, "assets", "tessdata");
  const modelPath = path.join(langPath, "vie.traineddata.gz");
  if (!fs.existsSync(modelPath)) {
    throw new Error("Thiếu model OCR tiếng Việt vie.traineddata.gz.");
  }
  const cachePath = path.join(app.getPath("userData"), "tessdata-cache");
  await fsp.mkdir(cachePath, { recursive: true });
  const imageSize = nativeImage.createFromPath(imagePath).getSize();
  return recognizeVietnamese(imagePath, {
    mode,
    langPath,
    cachePath,
    imageSize
  });
}

function vietnameseEvidence(value) {
  const text = String(value || "").normalize("NFC").toLowerCase();
  const tokens = new Set(text.match(/[\p{L}\p{M}]+/gu) || []);
  const commonWords = [
    "anh", "app", "bạn", "bị", "có", "của", "cửa", "đã", "đang", "đây", "được",
    "gửi", "hay", "không", "khi", "là", "lệnh", "lỗi", "mình", "một", "nhận",
    "này", "sẽ", "sổ", "thật", "thời", "thoát", "trong", "tôi", "tự", "và", "vì"
  ];
  const commonHits = commonWords.filter((word) => tokens.has(word)).length;
  const exclusiveHits = (text.match(/[ăđơư]/gu) || []).length;
  const markedHits = (text.match(/[àáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/gu) || []).length;
  return {
    commonHits,
    exclusiveHits,
    markedHits,
    strong: commonHits >= 2 || exclusiveHits >= 1 || (commonHits >= 1 && markedHits >= 2),
    score: commonHits * 3 + exclusiveHits * 2 + markedHits * 0.25
  };
}

function shouldPreferVietnameseOcr(vietnameseOcr, windowsOcr) {
  if (!vietnameseOcr?.text) return false;
  if (!windowsOcr?.text) return true;
  const vietnamese = vietnameseEvidence(vietnameseOcr.text);
  const windows = vietnameseEvidence(windowsOcr.text);
  const confidence = Number(vietnameseOcr.detection?.confidence || 0);
  return confidence >= 0.35 &&
    vietnamese.strong &&
    (vietnamese.score >= windows.score || !String(windowsOcr.language || "").toLowerCase().startsWith("vi"));
}

function mergeAutoOcrDetection(selected, results) {
  const candidates = results.flatMap((result) =>
    Array.isArray(result?.detection?.candidates) ? result.detection.candidates : []
  );
  const candidatesChecked = results.reduce((total, result) =>
    total + Math.max(1, Number(result?.detection?.candidatesChecked) || 1), 0
  );
  return {
    ...selected,
    detection: {
      ...selected.detection,
      mode: "auto",
      candidatesChecked,
      candidates
    }
  };
}

async function runWindowsOcr(imagePath, languageTag) {
  const helperPath = app.isPackaged
    ? path.join(process.resourcesPath, "ocr", "OcrHelper.exe")
    : path.join(__dirname, "native", "OcrHelper", "publish", "OcrHelper.exe");
  if (!fs.existsSync(helperPath)) {
    throw new Error("Thiếu OCR helper. Chạy npm run build:ocr trong thư mục desktop.");
  }

  try {
    const { stdout } = await execFileAsync(helperPath, [imagePath, languageTag || "auto"], {
      windowsHide: true,
      timeout: languageTag === "auto" ? 90000 : 30000,
      maxBuffer: 10 * 1024 * 1024,
      encoding: "utf8"
    });
    const payload = JSON.parse(String(stdout || "").trim());
    if (!payload?.ok) throw new Error(payload?.error || "Windows OCR thất bại.");
    return payload;
  } catch (error) {
    const stderr = String(error?.stderr || "").trim();
    if (stderr) {
      try {
        const payload = JSON.parse(stderr.split(/\r?\n/).filter(Boolean).at(-1));
        throw new Error(payload?.error || stderr);
      } catch (parseError) {
        if (parseError?.message && parseError.message !== stderr) throw parseError;
      }
    }
    throw new Error(error?.killed ? "OCR quá thời gian cho phép." : error?.message || String(error));
  }
}

function getCenteredResultPosition(display, width, height) {
  const bounds = display.bounds;
  const work = display.workArea;
  const centeredX = Math.round(bounds.x + (bounds.width - width) / 2);
  const centeredY = Math.round(bounds.y + (bounds.height - height) / 2);
  return {
    x: clamp(centeredX, work.x, Math.max(work.x, work.x + work.width - width)),
    y: clamp(centeredY, work.y, Math.max(work.y, work.y + work.height - height))
  };
}

function calculateAdaptiveResultSize(display, rect, layoutMode) {
  const work = display.workArea;
  const maxAvailW = Math.min(680, work.width - 80);
  const maxAvailH = Math.min(560, work.height - 80);

  if (!layoutMode) {
    return {
      width: 440,
      height: settings.showOriginal ? 400 : 320
    };
  }

  const cropW = Number(rect?.width) || 460;
  const cropH = Number(rect?.height) || 300;
  const aspectRatio = cropW / Math.max(1, cropH);

  let width = 580;
  let height = 460;

  if (aspectRatio < 0.75) {
    // Tall / vertical capture (e.g. document, chat, manhwa, long page)
    height = Math.min(maxAvailH, Math.max(460, Math.round(work.height * 0.7)));
    width = clamp(Math.round(height * aspectRatio) + 100, 480, Math.min(620, maxAvailW));
  } else if (aspectRatio > 1.6) {
    // Wide / horizontal capture (e.g. subtitle, wide banner, widescreen)
    width = clamp(Math.round(cropW * 0.88) + 60, 540, Math.min(680, maxAvailW));
    const contentH = Math.round(width / aspectRatio);
    height = clamp(contentH + 110, 360, Math.min(520, maxAvailH));
  } else {
    width = clamp(Math.round(cropW * 0.92) + 60, 520, Math.min(660, maxAvailW));
    height = clamp(Math.round(cropH * 0.92) + 100, 400, Math.min(540, maxAvailH));
  }

  return { width, height };
}

function adjustResultWindowSize(croppedSize) {
  if (!resultWindow || resultWindow.isDestroyed()) return;
  const currentBounds = resultWindow.getBounds();
  const display = screen.getDisplayMatching(currentBounds);
  const { width, height } = calculateAdaptiveResultSize(display, croppedSize, true);
  resultWindow.setSize(width, height, true);
}

function getAdaptiveResultPosition(display, rect, width, height) {
  const work = display.workArea;
  if (!rect || !Number.isFinite(rect.x)) {
    return getCenteredResultPosition(display, width, height);
  }
  const absoluteRectX = display.bounds.x + Number(rect.x || 0);
  const absoluteRectY = display.bounds.y + Number(rect.y || 0);

  let targetX = absoluteRectX + Number(rect.width || 0) + 16;
  let targetY = absoluteRectY;

  if (targetX + width > work.x + work.width) {
    const leftX = absoluteRectX - width - 16;
    if (leftX >= work.x) {
      targetX = leftX;
    } else {
      return getCenteredResultPosition(display, width, height);
    }
  }

  targetY = clamp(targetY, work.y, Math.max(work.y, work.y + work.height - height));
  targetX = clamp(targetX, work.x, Math.max(work.x, work.x + work.width - width));
  return { x: targetX, y: targetY };
}

function createResultWindow(display, rect, initialData) {
  if (resultWindow && !resultWindow.isDestroyed()) resultWindow.close();
  const layoutMode = initialData?.mode === "layout";
  const { width, height } = calculateAdaptiveResultSize(display, rect, layoutMode);
  const { x, y } = getAdaptiveResultPosition(display, rect, width, height);

  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    minWidth: layoutMode ? 460 : 360,
    minHeight: layoutMode ? 320 : 260,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: true,
    show: false,
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  resultWindow = win;
  const webContentsId = win.webContents.id;
  resultContexts.set(webContentsId, initialData);
  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.removeMenu();
  win.loadFile(path.join(__dirname, "result", "index.html"));
  win.once("ready-to-show", () => {
    if (win.isDestroyed()) return;
    const [actualWidth, actualHeight] = win.getSize();
    const position = getAdaptiveResultPosition(display, rect, actualWidth, actualHeight);
    win.setPosition(position.x, position.y, false);
    win.show();
  });
  win.on("focus", () => {
    if (!win.isDestroyed()) win.setAlwaysOnTop(true, "floating");
  });
  win.on("blur", () => {
    if (!win.isDestroyed()) win.setAlwaysOnTop(false);
  });
  win.on("show", () => {
    if (!win.isDestroyed()) win.moveTop();
  });
  win.on("closed", () => {
    resultContexts.delete(webContentsId);
    if (resultWindow === win) resultWindow = null;
  });
}

function sendResultUpdate(patch) {
  if (!resultWindow || resultWindow.isDestroyed()) return;
  const id = resultWindow.webContents.id;
  const current = resultContexts.get(id) || {};
  const next = { ...current, ...patch };
  resultContexts.set(id, next);
  resultWindow.webContents.send("result:update", next);
}

function getBootstrapData() {
  const catalog = globalThis.InputBridgeLanguageCatalog;
  return {
    settings,
    hotkey: {
      accelerator: settings.hotkey,
      label: formatHotkey(settings.hotkey)
    },
    voiceHotkey: {
      accelerator: settings.voiceHotkey,
      label: formatHotkey(settings.voiceHotkey)
    },
    pushToTalk: {
      enabled: settings.pushToTalkEnabled,
      key: "Right Ctrl",
      holdMs: PUSH_TO_TALK_HOLD_MS
    },
    languages: (catalog?.ordered || []).map((item) => ({ name: item.name, code: item.code })),
    ocrEngine: "Windows.Media.Ocr",
    latestResult
  };
}

function installIpcHandlers() {
  ipcMain.handle("app:get-bootstrap", () => getBootstrapData());
  ipcMain.handle("app:save-settings", (_event, next) => saveSettings(next));
  ipcMain.handle("app:set-hotkey", (_event, accelerator) => updateHotkey(accelerator));
  ipcMain.handle("app:set-voice-hotkey", (_event, accelerator) => updateVoiceHotkey(accelerator));
  ipcMain.handle("voice:toggle", () => toggleVoiceInput());
  ipcMain.handle("voice:audio-ready", (event, payload) => {
    if (!voiceOverlayWindow || voiceOverlayWindow.isDestroyed() || event.sender !== voiceOverlayWindow.webContents) {
      return { ok: false, error: "Nguồn audio không hợp lệ." };
    }
    return handleVoiceAudio(payload);
  });
  ipcMain.on("voice:recorder-status", (event, payload = {}) => {
    if (!voiceOverlayWindow || voiceOverlayWindow.isDestroyed() || event.sender !== voiceOverlayWindow.webContents) return;
    if (payload.status === "recording") {
      clearTimeout(voiceRecorderStartTimer);
      if (!voiceRecordingSession) return;
      if (voiceRecordingSession.state === "processing") {
        sendVoiceRecorderCommand("stop");
        return;
      }
      voiceRecordingSession.state = "recording";
      sendVoiceStatus("recording", {
        language: voiceRecordingSession.sourceCode,
        trigger: voiceRecordingSession.trigger
      });
      return;
    }
    if (payload.status === "error") {
      clearTimeout(voiceRecorderStartTimer);
      voiceRecordingSession = null;
      reportSpeechError(payload.error || "Không ghi được âm thanh từ micro.");
    }
  });
  ipcMain.handle("app:set-startup", (_event, enabled) => updateStartupEnabled(enabled));
  ipcMain.handle("window:minimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
    return { ok: true };
  });
  ipcMain.handle("window:close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
    return { ok: true };
  });
  ipcMain.handle("capture:start", () => beginCapture());
  ipcMain.handle("selection:get-context", (event) => selectionContexts.get(event.sender.id) || null);
  ipcMain.handle("selection:set-mode", (_event, mode) => updateCaptureMode(mode));
  ipcMain.handle("selection:submit", (_event, payload) => acceptSelection(payload));
  ipcMain.handle("selection:cancel", () => cancelCapture());
  ipcMain.handle("result:get-context", (event) => resultContexts.get(event.sender.id) || latestResult || null);
  ipcMain.handle("result:copy", (_event, text) => {
    clipboard.writeText(String(text || ""));
    return { ok: true };
  });
  ipcMain.handle("result:copy-image", (_event, dataUrl) => {
    const image = nativeImage.createFromDataURL(String(dataUrl || ""));
    if (image.isEmpty()) return { ok: false, error: "Ảnh kết quả không hợp lệ." };
    clipboard.writeImage(image);
    return { ok: true };
  });
  ipcMain.handle("result:close", () => {
    resultWindow?.close();
    return { ok: true };
  });
  ipcMain.handle("result:recapture", async () => {
    resultWindow?.close();
    return beginCapture();
  });
  ipcMain.handle("result:retranslate", (_event, targetLanguage) => retranslateCapture(targetLanguage));
  ipcMain.handle("result:crop-and-process", (_event, payload) => cropAndProcessCapture(payload));
  ipcMain.handle("result:translate-text", (_event, text) => translateSelectedText(text));
  ipcMain.handle("result:speak", async (_event, payload) => {
    const text = String(payload?.text || "").trim();
    if (!text) throw new Error("Không có văn bản để đọc.");
    const locale = payload?.locale || "vi-VN";
    const result = await synthesizeEdgeTts({ text, locale });
    return {
      ok: true,
      audioBase64: result.audio.toString("base64"),
      contentType: "audio/mpeg"
    };
  });
  ipcMain.handle("app:show-main", () => {
    showMainWindow();
    return { ok: true };
  });
}

app.whenReady().then(async () => {
  loadLanguageCatalog();
  await loadSettings();
  const launchedHidden = process.argv.includes(START_HIDDEN_ARG);
  let startupWarning = "";
  try {
    syncStartupRegistration();
  } catch (error) {
    startupWarning = error?.message || String(error);
    settings = { ...settings, startupEnabled: false };
    console.warn("[InputBridge startup]", startupWarning);
  }
  await persistSettings();
  installIpcHandlers();
  configureVoiceMediaPermissions();
  edgeTtsGateway = startEdgeTtsGateway();
  createMainWindow({ showOnReady: !launchedHidden });
  createVoiceOverlayWindow();
  createTray();
  startPushToTalkHook();
  let hotkeyResult = applyHotkey(settings.hotkey);
  if (!hotkeyResult.ok && settings.hotkey !== DEFAULT_HOTKEY) {
    settings = { ...settings, hotkey: DEFAULT_HOTKEY };
    hotkeyResult = applyHotkey(DEFAULT_HOTKEY);
    await persistSettings();
  }
  let voiceHotkeyResult = applyVoiceHotkey(settings.voiceHotkey);
  if (!voiceHotkeyResult.ok && settings.voiceHotkey !== DEFAULT_VOICE_HOTKEY) {
    settings = { ...settings, voiceHotkey: DEFAULT_VOICE_HOTKEY };
    voiceHotkeyResult = applyVoiceHotkey(DEFAULT_VOICE_HOTKEY);
    await persistSettings();
  }
  if (!voiceHotkeyResult.ok) {
    mainWindow?.webContents.once("did-finish-load", () => {
      mainWindow?.webContents.send("app:warning", voiceHotkeyResult.error);
    });
  }
  if (!hotkeyResult.ok) {
    mainWindow?.webContents.once("did-finish-load", () => {
      mainWindow?.webContents.send("app:warning", hotkeyResult.error);
    });
  }
  if (startupWarning) {
    mainWindow?.webContents.once("did-finish-load", () => {
      mainWindow?.webContents.send("app:warning", startupWarning);
    });
  }

  app.on("activate", showMainWindow);
});

app.on("before-quit", () => {
  isQuitting = true;
});
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  stopPushToTalkHook();
  clearTimeout(voiceOverlayHideTimer);
  voiceOverlayWindow?.destroy();
  voiceOverlayWindow = null;
  tray?.destroy();
  tray = null;
  edgeTtsGateway?.close();
  edgeTtsGateway = null;
  void terminateTesseractOcr();
});
app.on("window-all-closed", () => {});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
