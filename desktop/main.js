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
  Tray
} = require("electron");
const { execFile, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");
const { translateBlocks, translateText } = require("./src/translation");
const { startEdgeTtsGateway } = require("./src/edgeTtsGateway");

const execFileAsync = promisify(execFile);
const DEFAULT_HOTKEY = "CommandOrControl+Shift+X";
const START_HIDDEN_ARG = "--hidden";
const DEFAULT_SETTINGS = Object.freeze({
  sourceLanguage: "Auto detect",
  targetLanguage: "Vietnamese",
  showOriginal: true,
  hotkey: DEFAULT_HOTKEY,
  captureMode: "text",
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
let edgeTtsGateway = null;
const selectionWindows = new Set();
const selectionContexts = new Map();
const resultContexts = new Map();
let activeCaptures = new Map();

function loadLanguageCatalog() {
  const catalogPath = app.isPackaged
    ? path.join(process.resourcesPath, "languages.js")
    : path.join(__dirname, "..", "languages.js");
  delete require.cache[require.resolve(catalogPath)];
  require(catalogPath);
}

function getIconPath() {
  const candidate = app.isPackaged
    ? path.join(process.resourcesPath, "icon128.png")
    : path.join(__dirname, "..", "icons", "icon128.png");
  return fs.existsSync(candidate) ? candidate : undefined;
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
  settings = sanitizeSettings({ ...settings, ...next, hotkey: settings.hotkey });
  await persistSettings();
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

  const rect = normalizeRect(payload?.rect, capture.display.bounds);
  const mode = payload?.mode === "layout" ? "layout" : "text";
  settings = { ...settings, captureMode: mode };
  closeSelectionWindows();
  captureInProgress = false;
  restoreMainAfterCapture = false;
  activeCaptures.clear();

  const cropped = cropCapture(capture, rect);
  if (cropped.isEmpty()) throw new Error("Vùng chọn không hợp lệ.");

  const imagePath = path.join(app.getPath("temp"), `inputbridge-${Date.now()}-${process.pid}.png`);
  await fsp.writeFile(imagePath, cropped.toPNG());
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

function cropCapture(capture, rect) {
  const imageSize = capture.image.getSize();
  const displayBounds = capture.display.bounds;
  const scaleX = imageSize.width / displayBounds.width;
  const scaleY = imageSize.height / displayBounds.height;
  const cropRect = {
    x: clamp(Math.floor(rect.x * scaleX), 0, imageSize.width - 1),
    y: clamp(Math.floor(rect.y * scaleY), 0, imageSize.height - 1),
    width: Math.max(1, Math.min(imageSize.width, Math.ceil(rect.width * scaleX))),
    height: Math.max(1, Math.min(imageSize.height, Math.ceil(rect.height * scaleY)))
  };
  cropRect.width = Math.min(cropRect.width, imageSize.width - cropRect.x);
  cropRect.height = Math.min(cropRect.height, imageSize.height - cropRect.y);
  return capture.image.crop(cropRect);
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
      meta: `${ocr.language || "Windows OCR"} · đang dịch…`
    });
    const translated = await translateText(original, settings);
    latestResult = {
      mode: "text",
      status: "done",
      previewDataUrl: cropped.resize({ width: Math.min(520, cropped.getSize().width) }).toDataURL(),
      original,
      translation: translated.result,
      meta: `${translated.detectedSourceLanguage} → ${translated.targetLanguage}${translated.chunkCount > 1 ? ` · ${translated.chunkCount} phần` : ""}`,
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
    if (!original || !blocks.length) {
      throw new Error("OCR không tìm được vùng chữ có tọa độ. Hãy chọn sát phần chữ hơn.");
    }

    sendResultUpdate({
      status: "loading",
      original,
      layoutBlocks: blocks,
      meta: `${ocr.language || "Windows OCR"} · đang dịch ${blocks.length} vùng…`
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
      meta: `${translated.detectedSourceLanguage} → ${translated.targetLanguage} · ${layoutBlocks.length} vùng`,
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

function buildLayoutBlocks(ocr, imageSize) {
  const processedWidth = Math.max(1, Number(ocr?.processedWidth || ocr?.sourceWidth || imageSize.width));
  const processedHeight = Math.max(1, Number(ocr?.processedHeight || ocr?.sourceHeight || imageSize.height));
  const scaleX = imageSize.width / processedWidth;
  const scaleY = imageSize.height / processedHeight;

  return (Array.isArray(ocr?.lines) ? ocr.lines : [])
    .map((line, index) => {
      const words = Array.isArray(line?.words) ? line.words : [];
      if (!words.length) return null;
      const left = Math.min(...words.map((word) => Number(word.x || 0)));
      const top = Math.min(...words.map((word) => Number(word.y || 0)));
      const right = Math.max(...words.map((word) => Number(word.x || 0) + Number(word.width || 0)));
      const bottom = Math.max(...words.map((word) => Number(word.y || 0) + Number(word.height || 0)));
      const paddingX = Math.max(3, Math.round((bottom - top) * scaleY * 0.18));
      const paddingY = Math.max(2, Math.round((bottom - top) * scaleY * 0.12));
      const x = clamp(Math.round(left * scaleX) - paddingX, 0, imageSize.width - 1);
      const y = clamp(Math.round(top * scaleY) - paddingY, 0, imageSize.height - 1);
      const width = clamp(Math.round((right - left) * scaleX) + paddingX * 2, 1, imageSize.width - x);
      const height = clamp(Math.round((bottom - top) * scaleY) + paddingY * 2, 1, imageSize.height - y);
      const text = String(line?.text || words.map((word) => word.text).join(" ")).trim();
      if (!text) return null;
      return { id: `line-${index}`, text, x, y, width, height };
    })
    .filter(Boolean);
}

function getOcrLanguageTag() {
  if (settings.sourceLanguage === "Auto detect") return "auto";
  return globalThis.InputBridgeLanguageCatalog?.codeFor(settings.sourceLanguage, "auto") || "auto";
}

async function runOcr(imagePath, languageTag) {
  const helperPath = app.isPackaged
    ? path.join(process.resourcesPath, "ocr", "OcrHelper.exe")
    : path.join(__dirname, "native", "OcrHelper", "publish", "OcrHelper.exe");
  if (!fs.existsSync(helperPath)) {
    throw new Error("Thiếu OCR helper. Chạy npm run build:ocr trong thư mục desktop.");
  }

  try {
    const { stdout } = await execFileAsync(helperPath, [imagePath, languageTag || "auto"], {
      windowsHide: true,
      timeout: 30000,
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
    throw new Error(error?.killed ? "OCR quá thời gian 30 giây." : error?.message || String(error));
  }
}

function createResultWindow(display, _rect, initialData) {
  if (resultWindow && !resultWindow.isDestroyed()) resultWindow.close();
  const layoutMode = initialData?.mode === "layout";
  const width = layoutMode ? Math.min(780, Math.max(560, display.workArea.width - 80)) : 500;
  const height = layoutMode ? Math.min(680, Math.max(460, display.workArea.height - 80)) : (settings.showOriginal ? 480 : 360);
  const work = display.workArea;
  const x = Math.round(work.x + (work.width - width) / 2);
  const y = Math.round(work.y + (work.height - height) / 2);

  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    minWidth: layoutMode ? 520 : 390,
    minHeight: layoutMode ? 420 : 300,
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
    win.setPosition(
      Math.round(work.x + (work.width - actualWidth) / 2),
      Math.round(work.y + (work.height - actualHeight) / 2),
      false
    );
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
    languages: (catalog?.ordered || []).map((item) => ({ name: item.name, code: item.code })),
    ocrEngine: "Windows.Media.Ocr",
    latestResult
  };
}

function installIpcHandlers() {
  ipcMain.handle("app:get-bootstrap", () => getBootstrapData());
  ipcMain.handle("app:save-settings", (_event, next) => saveSettings(next));
  ipcMain.handle("app:set-hotkey", (_event, accelerator) => updateHotkey(accelerator));
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
  edgeTtsGateway = startEdgeTtsGateway();
  createMainWindow({ showOnReady: !launchedHidden });
  createTray();
  let hotkeyResult = applyHotkey(settings.hotkey);
  if (!hotkeyResult.ok && settings.hotkey !== DEFAULT_HOTKEY) {
    settings = { ...settings, hotkey: DEFAULT_HOTKEY };
    hotkeyResult = applyHotkey(DEFAULT_HOTKEY);
    await persistSettings();
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
  tray?.destroy();
  tray = null;
  edgeTtsGateway?.close();
  edgeTtsGateway = null;
});
app.on("window-all-closed", () => {});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
