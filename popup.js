const DEFAULT_SETTINGS = {
  settingsVersion: 24,
  enabled: true,
  demoMode: false,
  engine: "google",
  aiEnhance: false,
  apiKey: "",
  llmProvider: "9router",
  llmBaseUrl: "http://localhost:20128/v1",
  model: "mmf/mimo-auto",
  sourceLanguage: "Auto detect",
  targetLanguage: "English",
  writeSourceLanguage: "Auto detect",
  writeTargetLanguage: "English",
  uiLanguage: "vi",
  mode: "translate",
  tone: "natural",
  autoMode: "autoOnSend",
  livePreview: true,
  debounceMs: 700,
  minChars: 1,
  acceptWithTab: true,
  showBackTranslation: true,
  backTranslationLanguage: "Vietnamese",
  selectionTranslation: true,
  selectionTrigger: "icon",
  selectionShiftTranslate: true,
  selectionAllowEditable: false,
  selectionMinChars: 2,
  selectionMaxChars: 20000,
  selectionCardTheme: "light",
  videoSubtitleEnabled: false,
  videoSubtitleBilingual: false,
  videoSubtitleShowSource: false,
  videoSubtitleShowTranslation: true,
  videoSubtitleKeepOriginal: false,
  videoDubbingEnabled: false,
  videoDubbingOriginalVolume: 0.2,
  videoDubbingVoiceByLanguage: {},
  videoSubtitleSourceLanguage: "auto",
  videoSubtitleTargetLanguage: "Vietnamese",
  videoSubtitleEngine: "google",
  videoSubtitlePosition: "bottom",
  videoSubtitleSyncOffsetMs: -450,
  videoSubtitleFontSize: 22,
  videoSubtitleSourceFontSize: 30,
  videoSubtitleTranslationFontSize: 28,
  videoSubtitleSourceColor: "#ffffff",
  videoSubtitleTranslationColor: "#ffe37a",
  videoSubtitleSourceBackground: "#000000",
  videoSubtitleTranslationBackground: "#000000",
  videoSubtitleSourceFontFamily: "sans",
  videoSubtitleTranslationFontFamily: "sans",
  videoSubtitleSourceFontWeight: 800,
  videoSubtitleTranslationFontWeight: 800,
  videoSubtitleSourceBackgroundOpacity: 0,
  videoSubtitleTranslationBackgroundOpacity: 0,
  videoSubtitleSourceRadius: 0,
  videoSubtitleTranslationRadius: 0,
  videoSubtitleSourceOutline: 2.5,
  videoSubtitleTranslationOutline: 2.5,
  siteOverrides: {}
};

const GEMINI_MODEL_PRESETS = [
  { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash · recommended" },
  { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite · fastest" },
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview · highest quality" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" }
];

const PROVIDER_DEFAULT_MODELS = {
  "9router": "mmf/mimo-auto",
  openai: "gpt-4.1-mini",
  gemini: "gemini-3.5-flash"
};

const LLM_API_KEY_LIMIT = 5;

const LANGUAGE_CATALOG = globalThis.InputBridgeLanguageCatalog;
const $ = (id) => document.getElementById(id);
const fields = [
  "enabled",
  "demoMode",
  "engine",
  "aiEnhance",
  "apiKey",
  "llmProvider",
  "llmBaseUrl",
  "model",
  "sourceLanguage",
  "targetLanguage",
  "uiLanguage",
  "mode",
  "tone",
  "autoMode",
  "livePreview",
  "debounceMs",
  "minChars",
  "acceptWithTab",
  "showBackTranslation",
  "backTranslationLanguage",
  "selectionTranslation",
  "selectionTrigger",
  "selectionShiftTranslate",
  "selectionAllowEditable",
  "selectionMinChars",
  "selectionMaxChars",
  "videoSubtitleEnabled",
  "videoSubtitleShowSource",
  "videoSubtitleShowTranslation",
  "videoDubbingEnabled",
  "videoDubbingOriginalVolume",
  "videoSubtitleTargetLanguage",
  "videoSubtitleEngine",
  "videoSubtitlePosition",
  "videoSubtitleSyncOffsetMs",
  "videoSubtitleSourceFontSize",
  "videoSubtitleTranslationFontSize",
  "videoSubtitleSourceColor",
  "videoSubtitleTranslationColor",
  "videoSubtitleSourceBackground",
  "videoSubtitleTranslationBackground",
  "videoSubtitleSourceFontFamily",
  "videoSubtitleTranslationFontFamily",
  "videoSubtitleSourceFontWeight",
  "videoSubtitleTranslationFontWeight",
  "videoSubtitleSourceBackgroundOpacity",
  "videoSubtitleTranslationBackgroundOpacity",
  "videoSubtitleSourceRadius",
  "videoSubtitleTranslationRadius",
  "videoSubtitleSourceOutline",
  "videoSubtitleTranslationOutline"
];
const quickFields = new Set(["enabled", "sourceLanguage", "targetLanguage"]);
const videoDubbingVoicesByLanguage = new Map();
const videoDubbingVoiceRequests = new Map();
const VIDEO_SUBTITLE_POSITION_STORAGE_KEY = "videoSubtitlePositionsByOrigin";
const VIDEO_SUBTITLE_STYLE_FIELD_IDS = Object.freeze([
  "videoSubtitleSourceFontSize",
  "videoSubtitleTranslationFontSize",
  "videoSubtitleSourceColor",
  "videoSubtitleTranslationColor",
  "videoSubtitleSourceBackground",
  "videoSubtitleTranslationBackground",
  "videoSubtitleSourceFontFamily",
  "videoSubtitleTranslationFontFamily",
  "videoSubtitleSourceFontWeight",
  "videoSubtitleTranslationFontWeight",
  "videoSubtitleSourceBackgroundOpacity",
  "videoSubtitleTranslationBackgroundOpacity",
  "videoSubtitleSourceRadius",
  "videoSubtitleTranslationRadius",
  "videoSubtitleSourceOutline",
  "videoSubtitleTranslationOutline"
]);
const VIDEO_SUBTITLE_STYLE_PRESETS = Object.freeze({
  anime: Object.freeze({
    label: "Anime",
    values: Object.freeze({
      videoSubtitleSourceFontSize: 30,
      videoSubtitleTranslationFontSize: 28,
      videoSubtitleSourceColor: "#ffffff",
      videoSubtitleTranslationColor: "#ffe37a",
      videoSubtitleSourceBackground: "#000000",
      videoSubtitleTranslationBackground: "#000000",
      videoSubtitleSourceFontFamily: "sans",
      videoSubtitleTranslationFontFamily: "sans",
      videoSubtitleSourceFontWeight: 800,
      videoSubtitleTranslationFontWeight: 800,
      videoSubtitleSourceBackgroundOpacity: 0,
      videoSubtitleTranslationBackgroundOpacity: 0,
      videoSubtitleSourceRadius: 0,
      videoSubtitleTranslationRadius: 0,
      videoSubtitleSourceOutline: 2.5,
      videoSubtitleTranslationOutline: 2.5
    })
  }),
  clean: Object.freeze({
    label: "Tối giản",
    values: Object.freeze({
      videoSubtitleSourceFontSize: 26,
      videoSubtitleTranslationFontSize: 22,
      videoSubtitleSourceColor: "#ffffff",
      videoSubtitleTranslationColor: "#cfeeff",
      videoSubtitleSourceBackground: "#000000",
      videoSubtitleTranslationBackground: "#000000",
      videoSubtitleSourceFontFamily: "system",
      videoSubtitleTranslationFontFamily: "system",
      videoSubtitleSourceFontWeight: 700,
      videoSubtitleTranslationFontWeight: 600,
      videoSubtitleSourceBackgroundOpacity: 0,
      videoSubtitleTranslationBackgroundOpacity: 0,
      videoSubtitleSourceRadius: 0,
      videoSubtitleTranslationRadius: 0,
      videoSubtitleSourceOutline: 1.5,
      videoSubtitleTranslationOutline: 1.5
    })
  }),
  glass: Object.freeze({
    label: "Khung kính",
    values: Object.freeze({
      videoSubtitleSourceFontSize: 24,
      videoSubtitleTranslationFontSize: 20,
      videoSubtitleSourceColor: "#ffffff",
      videoSubtitleTranslationColor: "#8fd3ff",
      videoSubtitleSourceBackground: "#111827",
      videoSubtitleTranslationBackground: "#0b2538",
      videoSubtitleSourceFontFamily: "system",
      videoSubtitleTranslationFontFamily: "system",
      videoSubtitleSourceFontWeight: 700,
      videoSubtitleTranslationFontWeight: 600,
      videoSubtitleSourceBackgroundOpacity: 78,
      videoSubtitleTranslationBackgroundOpacity: 82,
      videoSubtitleSourceRadius: 10,
      videoSubtitleTranslationRadius: 10,
      videoSubtitleSourceOutline: 1,
      videoSubtitleTranslationOutline: 1
    })
  })
});

let settings = null;
let activeOrigin = "";
let activeTool = "translate";
let activeWriteMode = "polish";
let popupRequestId = 0;
let popupDebounceTimer = null;
let lastPopupResult = "";
let lastDetectedSourceLanguage = "";
const customSelects = new Map();

function parseApiKeys(value) {
  return [...new Set(
    String(value || "")
      .split(/[\r\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  )].slice(0, LLM_API_KEY_LIMIT);
}

function syncApiKeySlotsFromSettings() {
  const keys = parseApiKeys(settings?.apiKey || $("apiKey")?.value || "");
  document.querySelectorAll(".api-key-slot").forEach((input, index) => {
    input.value = keys[index] || "";
  });
  if ($("apiKey")) $("apiKey").value = keys.join("\n");
  updateApiKeyHint();
}

function syncApiKeyFieldFromSlots() {
  const keys = parseApiKeys(
    [...document.querySelectorAll(".api-key-slot")]
      .map((input) => input.value)
      .join("\n")
  );
  if ($("apiKey")) $("apiKey").value = keys.join("\n");
  updateApiKeyHint();
  return keys;
}

function updateApiKeyHint() {
  const count = parseApiKeys($("apiKey")?.value || "").length;
  const provider = $("llmProvider")?.value || settings?.llmProvider || DEFAULT_SETTINGS.llmProvider;
  const suffix = provider === "9router"
    ? "optional gateway keys"
    : "round-robin + automatic quota failover";
  if ($("apiKeyHint")) $("apiKeyHint").textContent = `${count}/${LLM_API_KEY_LIMIT} configured · ${suffix}`;
}

init();

async function init() {
  settings = await loadSettings();
  activeOrigin = await getActiveOrigin();
  populateLanguageSelects();
  render();
  upgradeSelects();
  bindEvents();
  updateToolUi();
}

function getActiveEl(baseId) {
  const prefix = activeTool === "translate" ? "trans" : "write";
  const key = prefix + baseId.charAt(0).toUpperCase() + baseId.slice(1);
  return $(key);
}

function populateLanguageSelects() {
  const selectIds = [
    "transSourceLanguage", "transTargetLanguage",
    "writeSourceLanguage", "writeTargetLanguage",
    "targetLanguage",
    "backTranslationLanguage",
    "videoSubtitleTargetLanguage",
    "videoSubtitleQuickLanguage"
  ];
  for (const id of selectIds) {
    const select = $(id);
    if (!select) continue;

    const fragment = document.createDocumentFragment();
    if (id.includes("SourceLanguage")) {
      const autoOption = document.createElement("option");
      autoOption.value = "Auto detect";
      autoOption.textContent = "Auto detect";
      fragment.appendChild(autoOption);
    }

    for (const language of LANGUAGE_CATALOG?.ordered || []) {
      const option = document.createElement("option");
      option.value = language.name;
      option.textContent = language.name;
      fragment.appendChild(option);
    }
    select.replaceChildren(fragment);
  }
}

function bindEvents() {
  $("openSettings").addEventListener("click", openSettings);
  $("backToMain").addEventListener("click", openMain);
  $("homeButton").addEventListener("click", openMain);
  $("save").addEventListener("click", saveAdvanced);
  $("reset").addEventListener("click", reset);
  $("toggleSite").addEventListener("click", toggleCurrentSite);
  $("toggleVideoSubtitles").addEventListener("click", toggleVideoSubtitles);
  $("resetVideoSubtitlePositions")?.addEventListener("click", resetVideoSubtitlePositions);

  // Tab-specific actions
  $("transRunTool").addEventListener("click", () => runPopupTool(true));
  $("writeRunTool").addEventListener("click", () => runPopupTool(true));
  $("writeRunToolSplit").addEventListener("click", () => runPopupTool(true));

  $("transClearInput").addEventListener("click", clearPopupInput);

  $("transCopyResult").addEventListener("click", copyPopupResult);
  $("writeCopyResult").addEventListener("click", copyPopupResult);

  $("transSwapLanguages").addEventListener("click", swapLanguages);

  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => setActiveTool(button.dataset.tool));
  });

  document.querySelectorAll("[data-write-mode]").forEach((button) => {
    button.addEventListener("click", () => setWriteMode(button.dataset.writeMode));
  });

  $("writeModeMenu").addEventListener("click", toggleWriteModeMenu);
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".write-action-picker")) closeWriteModeMenu();
  });

  const setupInputListeners = (inputId) => {
    const el = $(inputId);
    if (!el) return;
    el.addEventListener("input", () => {
      updateCharacterCount();
      if (!el.value.trim()) {
        clearPopupResult();
        return;
      }
      if (inputId === "transInput") schedulePopupRun();
      else clearPopupResult();
    });

    el.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        runPopupTool(true);
      }
    });
  };

  setupInputListeners("transInput");
  setupInputListeners("writeInput");

  // Advanced settings change listeners
  for (const id of fields) {
    const el = $(id);
    if (!el) continue;

    el.addEventListener("change", async () => {
      if (!quickFields.has(id)) return;
      await persistQuickField(id);
      const activeInputVal = getActiveEl("input").value.trim();
      if (activeInputVal) {
        runPopupTool(false);
      }
    });
  }

  for (const id of VIDEO_SUBTITLE_STYLE_FIELD_IDS) {
    const el = $(id);
    if (!el) continue;
    el.addEventListener("input", updateVideoSubtitleStylePreview);
    el.addEventListener("change", updateVideoSubtitleStylePreview);
  }

  document.querySelectorAll("[data-subtitle-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      void applyVideoSubtitleStylePreset(button.dataset.subtitlePreset || "");
    });
  });

  // Quick languages change listeners
  const handleLanguageChange = async (settingsKey, selectId) => {
    const el = $(selectId);
    if (!el) return;
    const value = el.value;
    settings[settingsKey] = value;
    await chrome.storage.sync.set({ [settingsKey]: value });
    await notifyTabs();
    setStatus("Đã cập nhật.");

    const inputVal = getActiveEl("input").value.trim();
    if (inputVal) {
      runPopupTool(false);
    }
  };

  $("transSourceLanguage").addEventListener("change", () => handleLanguageChange("sourceLanguage", "transSourceLanguage"));
  $("transTargetLanguage").addEventListener("change", () => handleLanguageChange("targetLanguage", "transTargetLanguage"));
  $("videoSubtitleQuickLanguage").addEventListener("change", async () => {
    const value = $("videoSubtitleQuickLanguage").value;
    settings.videoSubtitleTargetLanguage = value;
    $("videoSubtitleTargetLanguage").value = value;
    await chrome.storage.sync.set({ videoSubtitleTargetLanguage: value });
    await notifyTabs();
    render();
  });
  $("videoSubtitleTargetLanguage")?.addEventListener("change", () => {
    settings.videoSubtitleTargetLanguage = $("videoSubtitleTargetLanguage").value || "Vietnamese";
    renderPopupVideoDubbingVoiceSelect();
  });
  $("videoDubbingEnabled")?.addEventListener("change", () => {
    settings.videoDubbingEnabled = Boolean($("videoDubbingEnabled").checked);
    renderPopupVideoDubbingVoiceSelect();
  });
  $("videoDubbingVoice")?.addEventListener("change", async () => {
    const languageKey = getPopupVideoDubbingLanguageKey();
    const nextMap = {
      ...(settings.videoDubbingVoiceByLanguage && typeof settings.videoDubbingVoiceByLanguage === "object"
        ? settings.videoDubbingVoiceByLanguage
        : {})
    };
    const voice = String($("videoDubbingVoice").value || "").trim();
    if (voice) nextMap[languageKey] = voice;
    else delete nextMap[languageKey];
    settings.videoDubbingVoiceByLanguage = nextMap;
    await chrome.storage.sync.set({ videoDubbingVoiceByLanguage: nextMap });
    await notifyTabs();
    setStatus(voice ? `Đã chọn giọng ${voice}.` : "Đã dùng giọng tự động.");
  });
  $("llmProvider").addEventListener("change", () => updateLlmProviderUi(true));
  document.querySelectorAll(".api-key-slot").forEach((input) => {
    input.addEventListener("input", syncApiKeyFieldFromSlots);
    input.addEventListener("change", syncApiKeyFieldFromSlots);
  });
}

function openSettings() {
  showView("settingsView");
}

function openMain() {
  showView("mainView");
}

function showView(viewId) {
  closeAllCustomSelects();
  for (const view of document.querySelectorAll(".view")) {
    const active = view.id === viewId;
    view.hidden = !active;
    view.classList.toggle("is-active", active);
    if (active) view.scrollTop = 0;
  }
}

function setActiveTool(tool) {
  if (!tool || tool === activeTool) return;
  activeTool = tool;
  updateToolUi();
  const inputVal = getActiveEl("input").value.trim();
  if (inputVal) runPopupTool(false);
}

function setWriteMode(mode) {
  if (!mode) return;
  if (mode === activeWriteMode) {
    closeWriteModeMenu();
    return;
  }
  activeWriteMode = mode;
  closeWriteModeMenu();
  updateToolUi();
}

function toggleWriteModeMenu() {
  const menu = $("writeModeMenuList");
  const opening = menu.hidden;
  menu.hidden = !opening;
  $("writeModeMenu").setAttribute("aria-expanded", String(opening));
}

function closeWriteModeMenu() {
  const menu = $("writeModeMenuList");
  if (!menu) return;
  menu.hidden = true;
  $("writeModeMenu").setAttribute("aria-expanded", "false");
}

function getWriteModeLabel(mode = activeWriteMode) {
  const lang = settings?.uiLanguage || "vi";
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.vi;
  const keys = {
    check: "write-mode-check",
    polish: "write-mode-polish",
    academic: "write-mode-academic",
    friendly: "write-mode-friendly",
    simplify: "write-mode-simplify",
    detailed: "write-mode-detailed"
  };
  const key = keys[mode] || keys.polish;
  return dict[key] || key;
}

function updateToolUi() {
  document.querySelectorAll("[data-tool]").forEach((button) => {
    const active = button.dataset.tool === activeTool;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });

  document.querySelectorAll("[data-write-mode]").forEach((button) => {
    const active = button.dataset.writeMode === activeWriteMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-checked", String(active));
  });

  const translate = activeTool === "translate";
  $("translateTabContent").hidden = !translate;
  $("writeTabContent").hidden = translate;
  $("siteStrip").hidden = !translate;
  $("videoSubtitleStrip").hidden = !translate;

  if (activeTool === "write") {
    $("writeModeLabel").textContent = getWriteModeLabel();
    const prefix = getTranslation("write-input-placeholder-prefix");
    $("writeInput").placeholder = `${prefix} ${getWriteModeLabel().toLowerCase()}`;
  }

  render();

  const inputVal = getActiveEl("input").value.trim();
  if (!inputVal) clearPopupResult();
}

function getPopupVideoDubbingLanguageKey() {
  const code = LANGUAGE_CATALOG?.codeFor(settings.videoSubtitleTargetLanguage || "Vietnamese", "en") || "en";
  return String(code).trim().toLowerCase().replace(/_/g, "-");
}

function getPopupSelectedVideoDubbingVoice() {
  const map = settings.videoDubbingVoiceByLanguage;
  if (!map || typeof map !== "object" || Array.isArray(map)) return "";
  const languageKey = getPopupVideoDubbingLanguageKey();
  return String(map[languageKey] || map[languageKey.split("-")[0]] || "").trim();
}

function getPopupVideoDubbingVoiceLabel(voice) {
  const name = String(voice?.localName || voice?.friendlyName || voice?.name || "").trim();
  const gender = String(voice?.gender || "").toLowerCase();
  const genderLabel = gender === "female" ? "Nữ" : gender === "male" ? "Nam" : "";
  return genderLabel ? `${name} · ${genderLabel}` : name;
}

async function ensurePopupVideoDubbingVoices(languageKey = getPopupVideoDubbingLanguageKey()) {
  const key = String(languageKey || "en").toLowerCase().replace(/_/g, "-");
  if (videoDubbingVoicesByLanguage.has(key)) return videoDubbingVoicesByLanguage.get(key);
  const pending = videoDubbingVoiceRequests.get(key);
  if (pending) return pending;
  const request = chrome.runtime.sendMessage({
    type: "IB_VIDEO_DUBBING_VOICES",
    language: key,
    origin: activeOrigin || ""
  }).then((response) => {
    const voices = Array.isArray(response?.data?.voices) ? response.data.voices : [];
    videoDubbingVoicesByLanguage.set(key, voices);
    return voices;
  }).catch(() => {
    videoDubbingVoicesByLanguage.set(key, []);
    return [];
  }).finally(() => {
    videoDubbingVoiceRequests.delete(key);
    renderPopupVideoDubbingVoiceSelect();
  });
  videoDubbingVoiceRequests.set(key, request);
  return request;
}

function renderPopupVideoDubbingVoiceSelect() {
  const select = $("videoDubbingVoice");
  if (!select) return;
  const languageKey = getPopupVideoDubbingLanguageKey();
  const selectedVoice = getPopupSelectedVideoDubbingVoice();
  const voices = videoDubbingVoicesByLanguage.get(languageKey);
  const fragment = document.createDocumentFragment();
  const autoOption = document.createElement("option");
  autoOption.value = "";
  autoOption.textContent = voices ? "Tự động · Edge/System" : "Đang tải giọng Edge...";
  fragment.appendChild(autoOption);
  for (const voice of voices || []) {
    const option = document.createElement("option");
    option.value = voice.name;
    option.textContent = getPopupVideoDubbingVoiceLabel(voice);
    fragment.appendChild(option);
  }
  if (selectedVoice && !(voices || []).some((voice) => voice.name === selectedVoice)) {
    const option = document.createElement("option");
    option.value = selectedVoice;
    option.textContent = selectedVoice;
    fragment.appendChild(option);
  }
  select.replaceChildren(fragment);
  select.value = selectedVoice;
  select.disabled = !Boolean(settings.videoDubbingEnabled);
  if (!voices) void ensurePopupVideoDubbingVoices(languageKey);
}

function render() {
  for (const id of fields) {
    const el = $(id);
    if (!el) continue;

    const value = settings[id];
    if (el.type === "checkbox") el.checked = Boolean(value);
    else el.value = value ?? "";
  }

  syncApiKeySlotsFromSettings();

  // Load quick languages
  if ($("transSourceLanguage")) $("transSourceLanguage").value = settings.sourceLanguage || "Auto detect";
  if ($("transTargetLanguage")) $("transTargetLanguage").value = settings.targetLanguage || "English";

  $("siteName").textContent = activeOrigin || getTranslation("site-unable-read");

  const siteEnabled = settings.siteOverrides?.[activeOrigin]?.enabled;
  const toggleSite = $("toggleSite");
  const disabled = siteEnabled === false;
  toggleSite.textContent = disabled ? getTranslation("site-btn-toggle-on") : getTranslation("site-btn-toggle-off");
  toggleSite.classList.toggle("is-disabled", disabled);

  const videoEnabled = Boolean(settings.videoSubtitleEnabled);
  const videoTarget = settings.videoSubtitleTargetLanguage || "Vietnamese";
  if ($("videoSubtitleQuickLanguage")) $("videoSubtitleQuickLanguage").value = videoTarget;
  const videoEngine = settings.videoSubtitleEngine === "gemini" ? "Gemini Flash-Lite" : "Google · fast";
  $("videoSubtitleStatus").textContent = videoEnabled
    ? `${videoTarget} · YouTube/Google`
    : getTranslation("video-subtitle-status-off");
  $("toggleVideoSubtitles").textContent = getTranslation(videoEnabled
    ? "video-subtitle-btn-off"
    : "video-subtitle-btn-on");
  $("toggleVideoSubtitles").classList.toggle("is-disabled", videoEnabled);

  renderPopupVideoDubbingVoiceSelect();
  localizeUI();
  updateVideoSubtitleStylePreview();
  updateLlmProviderUi();
  syncCustomSelects();
}

async function applyVideoSubtitleStylePreset(name) {
  const preset = VIDEO_SUBTITLE_STYLE_PRESETS[name];
  if (!preset) return;

  for (const [id, value] of Object.entries(preset.values)) {
    const element = $(id);
    if (element) element.value = String(value);
  }
  settings = { ...(settings || DEFAULT_SETTINGS), ...preset.values };
  updateVideoSubtitleStylePreview();
  syncCustomSelects();

  await chrome.storage.sync.set({ ...preset.values });
  await notifyTabs();
  setStatus(`Đã áp dụng kiểu ${preset.label}.`);
}

function updateVideoSubtitlePresetState() {
  for (const button of document.querySelectorAll("[data-subtitle-preset]")) {
    const preset = VIDEO_SUBTITLE_STYLE_PRESETS[button.dataset.subtitlePreset || ""];
    const active = Boolean(preset && Object.entries(preset.values).every(([id, value]) => {
      const current = $(id)?.value ?? settings?.[id];
      return String(current) === String(value);
    }));
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

function updateVideoSubtitleStylePreview() {
  const preview = $("videoSubtitleStylePreview");
  if (!preview) return;

  const source = preview.querySelector('[data-role="source"]');
  const translation = preview.querySelector('[data-role="translation"]');
  const read = (id, fallback) => $(id)?.value || settings?.[id] || fallback;
  const rgba = (hex, alpha, fallback) => {
    const color = /^#[0-9a-f]{6}$/i.test(String(hex || "")) ? hex : fallback;
    const raw = color.slice(1);
    return `rgba(${Number.parseInt(raw.slice(0, 2), 16)}, ${Number.parseInt(raw.slice(2, 4), 16)}, ${Number.parseInt(raw.slice(4, 6), 16)}, ${alpha})`;
  };
  const fontFamily = (value) => ({
    system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
    sans: 'Arial, Helvetica, sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    mono: 'ui-monospace, "SFMono-Regular", Consolas, monospace'
  }[value] || '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif');
  const apply = (element, prefix, defaults) => {
    if (!element) return;
    const opacity = clamp(Number(read(`${prefix}BackgroundOpacity`, defaults.opacity)), 0, 100) / 100;
    const outline = clamp(Number(read(`${prefix}Outline`, defaults.outline)), 0, 3);
    element.style.fontSize = `${clamp(Number(read(`${prefix}FontSize`, defaults.size)), 14, 42)}px`;
    element.style.fontFamily = fontFamily(read(`${prefix}FontFamily`, "system"));
    element.style.fontWeight = String(clamp(Number(read(`${prefix}FontWeight`, defaults.weight)), 400, 800));
    element.style.color = read(`${prefix}Color`, defaults.color);
    const transparent = opacity <= 0.02;
    element.style.background = rgba(read(`${prefix}Background`, defaults.background), opacity, defaults.background);
    element.style.borderRadius = `${clamp(Number(read(`${prefix}Radius`, 10)), 0, 24)}px`;
    element.style.webkitTextStroke = `${outline}px rgba(0, 0, 0, 0.92)`;
    element.style.paintOrder = "stroke fill";
    element.style.padding = transparent ? "3px 8px 4px" : "5px 10px 6px";
    element.style.borderColor = transparent ? "transparent" : "rgba(255, 255, 255, 0.16)";
    element.style.boxShadow = transparent ? "none" : "0 8px 24px rgba(0, 0, 0, 0.28)";
    element.style.backdropFilter = transparent ? "none" : "blur(8px)";
    element.style.webkitBackdropFilter = transparent ? "none" : "blur(8px)";
    element.style.lineHeight = transparent ? "1.22" : "1.3";
    element.style.textShadow = transparent
      ? "0 2px 0 rgba(0,0,0,.98), 2px 0 0 rgba(0,0,0,.92), -2px 0 0 rgba(0,0,0,.92), 0 -1px 0 rgba(0,0,0,.92), 0 4px 7px rgba(0,0,0,.72)"
      : "0 1px 3px rgba(0, 0, 0, 0.9)";
  };

  apply(source, "videoSubtitleSource", {
    size: 24,
    weight: 700,
    opacity: 78,
    outline: 1,
    color: "#ffffff",
    background: "#111827"
  });
  apply(translation, "videoSubtitleTranslation", {
    size: 20,
    weight: 600,
    opacity: 82,
    outline: 1,
    color: "#8fd3ff",
    background: "#0b2538"
  });
  updateVideoSubtitlePresetState();
}

function updateLlmProviderUi(providerChanged = false) {
  const provider = $("llmProvider").value || DEFAULT_SETTINGS.llmProvider;
  const using9Router = provider === "9router";
  const usingGemini = provider === "gemini";
  const endpointField = $("llmBaseUrlField");
  const modelInput = $("model");
  const previousProvider = modelInput.dataset.provider || settings?.llmProvider || DEFAULT_SETTINGS.llmProvider;
  const currentModel = modelInput.value.trim();

  if (endpointField) endpointField.hidden = !using9Router;
  $("llmBaseUrl").disabled = !using9Router;

  const apiKeySlots = [...document.querySelectorAll(".api-key-slot")];
  if (using9Router) {
    $("apiKeyLabel").textContent = "9Router gateway keys (optional)";
    apiKeySlots.forEach((input, index) => {
      input.placeholder = index === 0 ? "Optional gateway key" : `Optional key ${index + 1}`;
    });
  } else if (usingGemini) {
    $("apiKeyLabel").textContent = "Gemini API keys (max 5)";
    apiKeySlots.forEach((input, index) => {
      input.placeholder = `Gemini key ${index + 1} · AIza...`;
    });
  } else {
    $("apiKeyLabel").textContent = "OpenAI API keys (max 5)";
    apiKeySlots.forEach((input, index) => {
      input.placeholder = `OpenAI key ${index + 1} · sk-...`;
    });
  }
  updateApiKeyHint();

  if (providerChanged) {
    const previousModels = previousProvider === "gemini"
      ? GEMINI_MODEL_PRESETS.map((item) => item.value)
      : [PROVIDER_DEFAULT_MODELS[previousProvider]].filter(Boolean);
    if (!currentModel || previousModels.includes(currentModel)) {
      modelInput.value = PROVIDER_DEFAULT_MODELS[provider] || "";
    }
  }

  modelInput.dataset.provider = provider;
  modelInput.placeholder = PROVIDER_DEFAULT_MODELS[provider] || "Enter model ID";
  populateModelOptions(provider);
}

function populateModelOptions(provider) {
  const datalist = $("modelOptions");
  if (!datalist) return;

  const presets = provider === "gemini"
    ? GEMINI_MODEL_PRESETS
    : [{
        value: PROVIDER_DEFAULT_MODELS[provider] || "",
        label: provider === "9router" ? "9Router default" : "OpenAI default"
      }];

  const fragment = document.createDocumentFragment();
  for (const preset of presets) {
    if (!preset.value) continue;
    const option = document.createElement("option");
    option.value = preset.value;
    option.label = preset.label;
    fragment.appendChild(option);
  }
  datalist.replaceChildren(fragment);
}

function schedulePopupRun() {
  clearTimeout(popupDebounceTimer);
  popupDebounceTimer = setTimeout(() => runPopupTool(false), 520);
}

async function runPopupTool(manual = false) {
  clearTimeout(popupDebounceTimer);
  const text = getActiveEl("input").value.trim();
  if (!text) {
    clearPopupResult();
    return;
  }

  if (!settings.enabled) {
    renderPopupError("InputBridge đang tắt.");
    return;
  }

  if (activeTool === "write" && text.length < 4) {
    if (manual) renderPopupError("Enter at least 4 characters to use Write.");
    else clearPopupResult();
    return;
  }

  const requestId = ++popupRequestId;
  setResultLoading(true);

  if (activeTool === "write") {
    streamPopupTransform({
      text,
      mode: activeWriteMode,
      tone: settings.tone,
      targetLanguage: "Same language as the source text",
      contextHint: "InputBridge popup writing tool"
    }, (chunk) => {
      if (requestId !== popupRequestId) return;
      renderPopupResult(chunk);
    }, (finalData) => {
      if (requestId !== popupRequestId) return;
      renderPopupResult(finalData);
      setResultLoading(false);
      if (manual) setStatus(getTranslation("status-done"));
    }, (error) => {
      if (requestId !== popupRequestId) return;
      renderPopupError(error);
      setResultLoading(false);
    });
    return;
  }

  try {
    const message = {
      type: "IB_POPUP_TRANSLATE",
      text,
      sourceLanguage: $("transSourceLanguage").value,
      targetLanguage: $("transTargetLanguage").value,
      fallbackLanguage: settings.backTranslationLanguage,
      maxChars: 5000
    };

    const response = await chrome.runtime.sendMessage(message);
    if (requestId !== popupRequestId) return;

    if (!response?.ok) {
      renderPopupError(response?.error || getTranslation("status-error-failed"));
      return;
    }

    renderPopupResult(response.data || {});
    if (manual) setStatus(getTranslation("status-done"));
  } catch (error) {
    if (requestId !== popupRequestId) return;
    renderPopupError(error?.message || String(error));
  } finally {
    if (requestId === popupRequestId) setResultLoading(false);
  }
}

let popupStreamPort = null;

function streamPopupTransform(message, onChunk, onDone, onError) {
  if (popupStreamPort) {
    try { popupStreamPort.disconnect(); } catch {}
  }

  try {
    popupStreamPort = chrome.runtime.connect({ name: "ib-transform-stream" });
    let hasFinished = false;
    
    popupStreamPort.onMessage.addListener((response) => {
      if (!response.ok) {
        hasFinished = true;
        onError(response.error || "Streaming error");
        if (popupStreamPort) {
          popupStreamPort.disconnect();
          popupStreamPort = null;
        }
        return;
      }

      const data = response.data || {};
      if (data.done) {
        hasFinished = true;
        onDone(data);
        if (popupStreamPort) {
          popupStreamPort.disconnect();
          popupStreamPort = null;
        }
      } else {
        onChunk(data);
      }
    });

    popupStreamPort.onDisconnect.addListener(() => {
      popupStreamPort = null;
      if (!hasFinished) {
        onError("Kết nối với background page bị đóng.");
      }
    });

    popupStreamPort.postMessage(message);
  } catch (error) {
    onError(error?.message || String(error));
    popupStreamPort = null;
  }
}

function renderPopupResult(data) {
  const result = String(data.result || "").trim();
  getActiveEl("resultText").textContent = result || getTranslation("result-empty");
  getActiveEl("resultPanel").classList.toggle("is-empty", !result);
  getActiveEl("copyResult").disabled = !result;

  if (activeTool === "translate") {
    const source = data.detectedSourceLanguage || $("transSourceLanguage").value || "Auto";
    const target = data.targetLanguage || $("transTargetLanguage").value;
    lastDetectedSourceLanguage = source === "Auto" ? "" : source;
    $("transResultMeta").textContent = `${source} → ${target}`;
    $("transResultPhonetic").textContent = data.phonetic || "";
    renderDictionary(data);
  } else {
    $("writeResultMeta").textContent = getWriteModeLabel();
    hideDictionary();
  }
}

function renderPopupError(message) {
  getActiveEl("resultText").textContent = message;
  getActiveEl("resultMeta").textContent = "Error";
  if (activeTool === "translate") {
    $("transResultPhonetic").textContent = "";
  }
  getActiveEl("resultPanel").classList.remove("is-empty");
  getActiveEl("copyResult").disabled = true;
  hideDictionary();
}

function renderDictionary(data) {
  const groups = Array.isArray(data.dictionary) ? data.dictionary : [];
  if (!data.dictionaryMode || !groups.length) {
    hideDictionary();
    return;
  }

  $("transDictionaryHeadword").textContent = data.headword || data.original || "";
  const list = $("transDictionaryList");
  list.replaceChildren();

  for (const group of groups) {
    const wrapper = document.createElement("div");
    wrapper.className = "dictionary-group";

    const pos = document.createElement("div");
    pos.className = "dictionary-pos";
    pos.textContent = group.partOfSpeech || "other";

    const meanings = document.createElement("div");
    meanings.className = "dictionary-meanings";

    for (const meaning of group.meanings || []) {
      const chip = document.createElement("span");
      chip.className = "dictionary-meaning";
      chip.textContent = meaning;
      meanings.appendChild(chip);
    }

    wrapper.append(pos, meanings);
    list.appendChild(wrapper);
  }

  $("transDictionaryBlock").hidden = false;
}

function hideDictionary() {
  $("transDictionaryBlock").hidden = true;
  $("transDictionaryList").replaceChildren();
}

function setResultLoading(loading) {
  getActiveEl("resultPanel").classList.toggle("is-loading", loading);
  getActiveEl("resultLoading").hidden = !loading;
  getActiveEl("runTool").disabled = loading;
}

function clearPopupInput() {
  clearTimeout(popupDebounceTimer);
  popupRequestId += 1;
  getActiveEl("input").value = "";
  updateCharacterCount();
  clearPopupResult();
  getActiveEl("input").focus();
}

function clearPopupResult() {
  getActiveEl("resultText").textContent = activeTool === "translate"
    ? getTranslation("trans-result-placeholder")
    : "";
  getActiveEl("resultMeta").textContent = activeTool === "translate"
    ? getTranslation("trans-result-meta")
    : "Result";
  if (activeTool === "translate") {
    $("transResultPhonetic").textContent = "";
  }
  getActiveEl("resultPanel").classList.add("is-empty");
  getActiveEl("resultPanel").classList.remove("is-loading");
  getActiveEl("resultLoading").hidden = true;
  getActiveEl("copyResult").disabled = true;
  lastDetectedSourceLanguage = "";
  hideDictionary();
}

function updateCharacterCount() {
  const length = getActiveEl("input").value.length;
  getActiveEl("charCount").textContent = `${length} / 5000`;
}

async function copyPopupResult() {
  const text = getActiveEl("resultText").textContent;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    setStatus(getTranslation("status-copied"));
  } catch {
    setStatus(getTranslation("status-copy-failed"));
  }
}

async function swapLanguages() {
  closeAllCustomSelects();

  const sourceSelect = getActiveEl("sourceLanguage");
  const targetSelect = getActiveEl("targetLanguage");
  const source = sourceSelect.value || "Auto detect";
  const target = targetSelect.value || (activeTool === "write" ? settings.writeTargetLanguage : settings.targetLanguage) || "English";

  // Swap input text and result text if a valid translation result exists
  const inputEl = getActiveEl("input");
  const resultEl = getActiveEl("resultText");
  const resultPanel = getActiveEl("resultPanel");
  
  const currentInput = inputEl.value.trim();
  const currentResult = resultEl.textContent.trim();
  const hasResult = !resultPanel.classList.contains("is-empty") && 
                    currentResult && 
                    currentResult !== getTranslation("trans-result-placeholder") && 
                    currentResult !== getTranslation("write-result-placeholder") &&
                    currentResult !== getTranslation("result-empty");

  if (hasResult) {
    inputEl.value = currentResult;
    updateCharacterCount();
  }

  let nextSource = target;
  let nextTarget;

  if (source === "Auto detect") {
    const detected = lastDetectedSourceLanguage;
    nextTarget = detected && detected !== target
      ? detected
      : getFallbackLanguage(target);
  } else {
    nextTarget = source;
  }

  if (nextSource === nextTarget) {
    nextTarget = getFallbackLanguage(nextSource);
  }

  sourceSelect.value = nextSource;
  targetSelect.value = nextTarget;
  
  const sourceKey = activeTool === "write" ? "writeSourceLanguage" : "sourceLanguage";
  const targetKey = activeTool === "write" ? "writeTargetLanguage" : "targetLanguage";
  settings[sourceKey] = nextSource;
  settings[targetKey] = nextTarget;
  syncCustomSelects();

  const button = getActiveEl("swapLanguages");
  button.classList.remove("is-swapping");
  void button.offsetWidth;
  button.classList.add("is-swapping");
  setTimeout(() => button.classList.remove("is-swapping"), 240);

  await chrome.storage.sync.set({
    [sourceKey]: nextSource,
    [targetKey]: nextTarget
  });

  const inputVal = inputEl.value.trim();
  if (inputVal) runPopupTool(false);
}

function getFallbackLanguage(language) {
  const preferred = settings.backTranslationLanguage || "Vietnamese";
  if (preferred !== language) return preferred;
  return language === "English" ? "Vietnamese" : "English";
}

async function persistQuickField(id) {
  const el = $(id);
  if (!el) return;

  const value = readFieldValue(el);
  const key = (activeTool === "write" && (id === "sourceLanguage" || id === "targetLanguage"))
    ? (id === "sourceLanguage" ? "writeSourceLanguage" : "writeTargetLanguage")
    : id;
  settings[key] = value;
  await chrome.storage.sync.set({ [key]: value });
  await notifyTabs();
  setStatus(getTranslation("status-updated"));
}

async function saveAdvanced() {
  syncApiKeyFieldFromSlots();
  const next = collectSettings();
  await chrome.storage.sync.set(next);
  settings = { ...settings, ...next };
  render();
  await notifyTabs();
  setStatus(getTranslation("status-saved"));
}

async function reset() {
  await chrome.storage.sync.set(DEFAULT_SETTINGS);
  await chrome.storage.local.remove(VIDEO_SUBTITLE_POSITION_STORAGE_KEY);
  settings = { ...DEFAULT_SETTINGS, siteOverrides: {} };
  render();
  await notifyTabs();
  await notifySubtitlePositionReset();
  setStatus(getTranslation("status-reset"));
}

async function resetVideoSubtitlePositions() {
  try {
    const stored = await chrome.storage.local.get(VIDEO_SUBTITLE_POSITION_STORAGE_KEY);
    const positionsByOrigin = { ...(stored?.[VIDEO_SUBTITLE_POSITION_STORAGE_KEY] || {}) };
    if (activeOrigin) delete positionsByOrigin[activeOrigin];
    else Object.keys(positionsByOrigin).forEach((origin) => delete positionsByOrigin[origin]);
    await chrome.storage.local.set({ [VIDEO_SUBTITLE_POSITION_STORAGE_KEY]: positionsByOrigin });
    await notifySubtitlePositionReset(activeOrigin);
    setStatus(getTranslation("status-video-position-reset"));
  } catch (error) {
    setStatus(error?.message || "Không đặt lại được vị trí.");
  }
}

async function notifySubtitlePositionReset(origin = "") {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => {
    if (!tab.id || !tab.url?.startsWith("http")) return null;
    if (origin) {
      try {
        if (new URL(tab.url).origin !== origin) return null;
      } catch {
        return null;
      }
    }
    return chrome.tabs.sendMessage(tab.id, { type: "IB_RESET_VIDEO_SUBTITLE_POSITIONS" }).catch(() => null);
  }));
}

async function toggleCurrentSite() {
  if (!activeOrigin) return;

  const current = settings.siteOverrides?.[activeOrigin]?.enabled;
  const nextEnabled = current === false;
  const siteOverrides = {
    ...(settings.siteOverrides || {}),
    [activeOrigin]: {
      ...(settings.siteOverrides?.[activeOrigin] || {}),
      enabled: nextEnabled
    }
  };

  settings.siteOverrides = siteOverrides;
  await chrome.storage.sync.set({ siteOverrides });
  render();
  await notifyTabs();
  setStatus(getTranslation(nextEnabled ? "status-site-on" : "status-site-off"));
}

async function toggleVideoSubtitles() {
  const nextEnabled = !settings.videoSubtitleEnabled;
  settings.videoSubtitleEnabled = nextEnabled;
  await chrome.storage.sync.set({ videoSubtitleEnabled: nextEnabled });
  render();
  await notifyTabs();
  setStatus(getTranslation(nextEnabled ? "status-video-on" : "status-video-off"));
}

function collectSettings() {
  syncApiKeyFieldFromSlots();
  const next = {};

  for (const id of fields) {
    const el = $(id);
    if (!el) continue;
    next[id] = readFieldValue(el);
  }

  next.apiKey = parseApiKeys(next.apiKey).join("\n");
  next.debounceMs = clamp(next.debounceMs || DEFAULT_SETTINGS.debounceMs, 300, 2500);
  next.minChars = clamp(next.minChars || DEFAULT_SETTINGS.minChars, 1, 200);
  next.selectionMinChars = clamp(next.selectionMinChars || DEFAULT_SETTINGS.selectionMinChars, 1, 20);
  next.selectionMaxChars = clamp(next.selectionMaxChars || DEFAULT_SETTINGS.selectionMaxChars, 20, 20000);
  next.videoDubbingOriginalVolume = clamp(Number(next.videoDubbingOriginalVolume ?? DEFAULT_SETTINGS.videoDubbingOriginalVolume), 0, 1);
  next.videoSubtitleSourceFontSize = clamp(Number(next.videoSubtitleSourceFontSize || DEFAULT_SETTINGS.videoSubtitleSourceFontSize), 14, 42);
  next.videoSubtitleTranslationFontSize = clamp(Number(next.videoSubtitleTranslationFontSize || DEFAULT_SETTINGS.videoSubtitleTranslationFontSize), 14, 42);
  next.videoSubtitleSourceFontWeight = clamp(Number(next.videoSubtitleSourceFontWeight || DEFAULT_SETTINGS.videoSubtitleSourceFontWeight), 400, 800);
  next.videoSubtitleTranslationFontWeight = clamp(Number(next.videoSubtitleTranslationFontWeight || DEFAULT_SETTINGS.videoSubtitleTranslationFontWeight), 400, 800);
  next.videoSubtitleSourceBackgroundOpacity = clamp(Number(next.videoSubtitleSourceBackgroundOpacity ?? DEFAULT_SETTINGS.videoSubtitleSourceBackgroundOpacity), 0, 100);
  next.videoSubtitleTranslationBackgroundOpacity = clamp(Number(next.videoSubtitleTranslationBackgroundOpacity ?? DEFAULT_SETTINGS.videoSubtitleTranslationBackgroundOpacity), 0, 100);
  next.videoSubtitleSourceRadius = clamp(Number(next.videoSubtitleSourceRadius ?? DEFAULT_SETTINGS.videoSubtitleSourceRadius), 0, 24);
  next.videoSubtitleTranslationRadius = clamp(Number(next.videoSubtitleTranslationRadius ?? DEFAULT_SETTINGS.videoSubtitleTranslationRadius), 0, 24);
  next.videoSubtitleSourceOutline = clamp(Number(next.videoSubtitleSourceOutline ?? DEFAULT_SETTINGS.videoSubtitleSourceOutline), 0, 3);
  next.videoSubtitleTranslationOutline = clamp(Number(next.videoSubtitleTranslationOutline ?? DEFAULT_SETTINGS.videoSubtitleTranslationOutline), 0, 3);
  for (const key of ["videoSubtitleSourceFontFamily", "videoSubtitleTranslationFontFamily"]) {
    if (!["system", "sans", "serif", "mono"].includes(next[key])) next[key] = DEFAULT_SETTINGS[key];
  }
  for (const key of [
    "videoSubtitleSourceColor",
    "videoSubtitleTranslationColor",
    "videoSubtitleSourceBackground",
    "videoSubtitleTranslationBackground"
  ]) {
    if (!/^#[0-9a-f]{6}$/i.test(String(next[key] || ""))) next[key] = DEFAULT_SETTINGS[key];
  }
  next.videoSubtitleBilingual = Boolean(
    next.videoSubtitleShowSource && next.videoSubtitleShowTranslation
  );
  next.videoSubtitleEngine = ["google", "gemini"].includes(next.videoSubtitleEngine)
    ? next.videoSubtitleEngine
    : DEFAULT_SETTINGS.videoSubtitleEngine;
  next.videoSubtitlePosition = ["top", "bottom"].includes(next.videoSubtitlePosition)
    ? next.videoSubtitlePosition
    : DEFAULT_SETTINGS.videoSubtitlePosition;
  next.siteOverrides = settings.siteOverrides || {};
  return next;
}

function readFieldValue(el) {
  if (el.type === "checkbox") return el.checked;
  if (el.type === "number") return Number(el.value);
  return el.value.trim();
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get(null);
  const needsMigration = Number(stored.settingsVersion || 0) < DEFAULT_SETTINGS.settingsVersion;
  const enabledByV10Default =
    Number(stored.settingsVersion || 0) === 10 &&
    stored.aiEnhance === true &&
    !parseApiKeys(stored.apiKey).length;
  const upgradeVideoSubtitleStyle = Number(stored.settingsVersion || 0) < 19;
  const upgradeSelectionMaxChars =
    Number(stored.settingsVersion || 0) < 22 &&
    [1000, 5000].includes(Number(stored.selectionMaxChars || 5000));
  const videoSubtitleShowSource = Boolean(
    stored.videoSubtitleShowSource ?? stored.videoSubtitleBilingual ?? false
  );
  const videoSubtitleShowTranslation = Boolean(
    stored.videoSubtitleShowTranslation ?? true
  );
  const migrated = needsMigration
    ? {
        ...stored,
        settingsVersion: DEFAULT_SETTINGS.settingsVersion,
        minChars: 1,
        demoMode: false,
        autoMode: "autoOnSend",
        selectionTranslation: stored.selectionTranslation ?? true,
        selectionTrigger: stored.selectionTrigger || "icon",
        selectionShiftTranslate: stored.selectionShiftTranslate ?? true,
        selectionAllowEditable: stored.selectionAllowEditable ?? false,
        selectionMinChars: Number(stored.selectionMinChars || 2),
        selectionMaxChars: upgradeSelectionMaxChars ? 20000 : Number(stored.selectionMaxChars || 20000),
        selectionCardTheme: stored.selectionCardTheme || "light",
        llmProvider: stored.llmProvider || "9router",
        llmBaseUrl: stored.llmBaseUrl || "http://localhost:20128/v1",
        model: stored.model || "mmf/mimo-auto",
        aiEnhance: enabledByV10Default ? false : (stored.aiEnhance ?? false),
        writeSourceLanguage: stored.writeSourceLanguage || "Auto detect",
        writeTargetLanguage: stored.writeTargetLanguage || "English",
        uiLanguage: stored.uiLanguage || "vi",
        videoSubtitleEnabled: stored.videoSubtitleEnabled ?? false,
        videoSubtitleBilingual: videoSubtitleShowSource && videoSubtitleShowTranslation,
        videoSubtitleShowSource,
        videoSubtitleShowTranslation,
        videoSubtitleKeepOriginal: false,
        videoDubbingEnabled: stored.videoDubbingEnabled ?? false,
        videoDubbingOriginalVolume: Number(stored.videoDubbingOriginalVolume ?? 0.2),
        videoDubbingVoiceByLanguage: stored.videoDubbingVoiceByLanguage && typeof stored.videoDubbingVoiceByLanguage === "object"
          ? stored.videoDubbingVoiceByLanguage
          : {},
        videoSubtitleSourceLanguage: stored.videoSubtitleSourceLanguage || "auto",
        videoSubtitleTargetLanguage: stored.videoSubtitleTargetLanguage || "Vietnamese",
        videoSubtitleEngine: stored.videoSubtitleEngine === "gemini" ? "gemini" : "google",
        videoSubtitlePosition: stored.videoSubtitlePosition || "bottom",
        videoSubtitleSyncOffsetMs: Number(stored.videoSubtitleSyncOffsetMs ?? -450),
        videoSubtitleFontSize: Number(stored.videoSubtitleFontSize || 22),
        videoSubtitleSourceFontSize: upgradeVideoSubtitleStyle ? 30 : Number(stored.videoSubtitleSourceFontSize || 30),
        videoSubtitleTranslationFontSize: upgradeVideoSubtitleStyle ? 28 : Number(stored.videoSubtitleTranslationFontSize || 28),
        videoSubtitleSourceColor: upgradeVideoSubtitleStyle ? "#ffffff" : (/^#[0-9a-f]{6}$/i.test(stored.videoSubtitleSourceColor || "") ? stored.videoSubtitleSourceColor : "#ffffff"),
        videoSubtitleTranslationColor: upgradeVideoSubtitleStyle ? "#ffe37a" : (/^#[0-9a-f]{6}$/i.test(stored.videoSubtitleTranslationColor || "") ? stored.videoSubtitleTranslationColor : "#ffe37a"),
        videoSubtitleSourceBackground: upgradeVideoSubtitleStyle ? "#000000" : (/^#[0-9a-f]{6}$/i.test(stored.videoSubtitleSourceBackground || "") ? stored.videoSubtitleSourceBackground : "#000000"),
        videoSubtitleTranslationBackground: upgradeVideoSubtitleStyle ? "#000000" : (/^#[0-9a-f]{6}$/i.test(stored.videoSubtitleTranslationBackground || "") ? stored.videoSubtitleTranslationBackground : "#000000"),
        videoSubtitleSourceFontFamily: upgradeVideoSubtitleStyle ? "sans" : (["system", "sans", "serif", "mono"].includes(stored.videoSubtitleSourceFontFamily) ? stored.videoSubtitleSourceFontFamily : "sans"),
        videoSubtitleTranslationFontFamily: upgradeVideoSubtitleStyle ? "sans" : (["system", "sans", "serif", "mono"].includes(stored.videoSubtitleTranslationFontFamily) ? stored.videoSubtitleTranslationFontFamily : "sans"),
        videoSubtitleSourceFontWeight: upgradeVideoSubtitleStyle ? 800 : Number(stored.videoSubtitleSourceFontWeight || 800),
        videoSubtitleTranslationFontWeight: upgradeVideoSubtitleStyle ? 800 : Number(stored.videoSubtitleTranslationFontWeight || 800),
        videoSubtitleSourceBackgroundOpacity: upgradeVideoSubtitleStyle ? 0 : Number(stored.videoSubtitleSourceBackgroundOpacity ?? 0),
        videoSubtitleTranslationBackgroundOpacity: upgradeVideoSubtitleStyle ? 0 : Number(stored.videoSubtitleTranslationBackgroundOpacity ?? 0),
        videoSubtitleSourceRadius: upgradeVideoSubtitleStyle ? 0 : Number(stored.videoSubtitleSourceRadius ?? 0),
        videoSubtitleTranslationRadius: upgradeVideoSubtitleStyle ? 0 : Number(stored.videoSubtitleTranslationRadius ?? 0),
        videoSubtitleSourceOutline: upgradeVideoSubtitleStyle ? 2.5 : Number(stored.videoSubtitleSourceOutline ?? 2.5),
        videoSubtitleTranslationOutline: upgradeVideoSubtitleStyle ? 2.5 : Number(stored.videoSubtitleTranslationOutline ?? 2.5)
      }
    : stored;

  if (needsMigration) {
    await chrome.storage.sync.set(migrated);
  }

  return { ...DEFAULT_SETTINGS, ...migrated };
}

async function getActiveOrigin() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    return tab?.url ? new URL(tab.url).origin : "";
  } catch {
    return "";
  }
}

async function notifyTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map((tab) => {
      if (!tab.id || !tab.url?.startsWith("http")) return null;
      return chrome.tabs.sendMessage(tab.id, { type: "IB_SETTINGS_UPDATED" }).catch(() => null);
    })
  );
}

function upgradeSelects() {
  document.querySelectorAll("select").forEach((select) => {
    if (customSelects.has(select)) return;

    select.classList.add("native-select-source");
    select.hidden = true;
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");

    const wrapper = document.createElement("div");
    wrapper.className = "glass-select";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "glass-select-trigger";
    trigger.setAttribute("role", "combobox");
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");

    const value = document.createElement("span");
    value.className = "glass-select-value";

    const chevron = document.createElement("span");
    chevron.className = "glass-select-chevron";
    chevron.setAttribute("aria-hidden", "true");

    const menu = document.createElement("div");
    menu.className = "glass-select-menu";
    menu.setAttribute("role", "listbox");
    menu.addEventListener("click", (event) => event.stopPropagation());

    const searchable = select.options.length > 24;
    let searchInput = null;

    if (searchable) {
      wrapper.classList.add("is-searchable");
      const searchWrap = document.createElement("div");
      searchWrap.className = "glass-select-search-wrap";
      searchInput = document.createElement("input");
      searchInput.type = "search";
      searchInput.className = "glass-select-search";
      searchInput.placeholder = "Search language...";
      searchInput.setAttribute("aria-label", "Search languages");
      searchInput.addEventListener("click", (event) => event.stopPropagation());
      searchWrap.appendChild(searchInput);
      menu.appendChild(searchWrap);
    }

    for (const option of select.options) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "glass-select-option";
      item.dataset.value = option.value;
      item.dataset.search = normalizeLanguageSearch(`${option.textContent} ${option.value}`);
      item.textContent = option.textContent;
      item.setAttribute("role", "option");
      item.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        updateCustomSelect(select);

        if (searchInput) {
          searchInput.value = "";
          filterGlassSelectOptions(menu, "");
        }

        closeCustomSelect(wrapper);
      });
      menu.appendChild(item);
    }

    if (searchInput) {
      searchInput.addEventListener("input", () => {
        filterGlassSelectOptions(menu, searchInput.value);
        menu.scrollTop = 0;
      });
    }

    trigger.append(value, chevron);
    wrapper.append(trigger, menu);
    select.insertAdjacentElement("afterend", wrapper);
    customSelects.set(select, { wrapper, trigger, value, menu });

    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const willOpen = !wrapper.classList.contains("is-open");
      closeAllCustomSelects(wrapper);

      if (!willOpen) {
        closeCustomSelect(wrapper);
        return;
      }

      openCustomSelect(wrapper, trigger, menu);

      if (searchInput) {
        searchInput.value = "";
        filterGlassSelectOptions(menu, "");
        requestAnimationFrame(() => searchInput.focus({ preventScroll: true }));
      }
    });
  });

  if (!document.body.dataset.glassSelectBound) {
    document.body.dataset.glassSelectBound = "true";
    document.addEventListener("click", () => closeAllCustomSelects());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeAllCustomSelects();
    });
    document.querySelectorAll(".view").forEach((view) => {
      view.addEventListener("scroll", () => closeAllCustomSelects(), { passive: true });
    });
    window.addEventListener("resize", () => closeAllCustomSelects(), { passive: true });
  }

  syncCustomSelects();
}

function normalizeLanguageSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function filterGlassSelectOptions(menu, query) {
  const normalized = normalizeLanguageSearch(query);
  menu.querySelectorAll(".glass-select-option").forEach((item) => {
    item.classList.toggle(
      "is-filtered-out",
      Boolean(normalized) && !item.dataset.search.includes(normalized)
    );
  });
}

function syncCustomSelects() {
  for (const select of customSelects.keys()) updateCustomSelect(select);
}

function updateCustomSelect(select) {
  const parts = customSelects.get(select);
  if (!parts) return;

  const selected = select.selectedOptions?.[0];
  parts.value.textContent = selected?.textContent || "";
  parts.menu.querySelectorAll(".glass-select-option").forEach((item) => {
    const isSelected = item.dataset.value === select.value;
    item.classList.toggle("is-selected", isSelected);
    item.setAttribute("aria-selected", String(isSelected));
  });
}

function openCustomSelect(wrapper, trigger, menu) {
  menu.classList.remove("is-closing");
  wrapper.classList.add("is-open");
  trigger.setAttribute("aria-expanded", "true");
  menu.classList.add("is-portal-open");
  document.body.appendChild(menu);
  positionPortalMenu(trigger, menu);
}

function positionPortalMenu(trigger, menu) {
  const rect = trigger.getBoundingClientRect();
  const viewportPadding = 8;
  const gap = 6;
  const width = Math.min(
    Math.max(rect.width, 140),
    Math.max(120, window.innerWidth - viewportPadding * 2)
  );
  const spaceBelow = window.innerHeight - rect.bottom - gap - viewportPadding;
  const spaceAbove = rect.top - gap - viewportPadding;
  const openAbove = spaceBelow < 150 && spaceAbove > spaceBelow;
  const available = Math.max(openAbove ? spaceAbove : spaceBelow, 120);
  const maxHeight = Math.min(260, available);
  const left = Math.min(
    Math.max(viewportPadding, rect.left),
    Math.max(viewportPadding, window.innerWidth - width - viewportPadding)
  );

  menu.style.visibility = "hidden";
  menu.style.left = `${Math.round(left)}px`;
  menu.style.width = `${width}px`;
  menu.style.maxHeight = `${maxHeight}px`;
  menu.style.right = "auto";

  const renderedHeight = Math.min(menu.scrollHeight, maxHeight);
  const top = openAbove
    ? Math.max(viewportPadding, rect.top - gap - renderedHeight)
    : Math.min(window.innerHeight - viewportPadding - renderedHeight, rect.bottom + gap);

  menu.style.top = `${Math.round(top)}px`;
  menu.style.visibility = "";
  menu.dataset.placement = openAbove ? "top" : "bottom";
}

function closeCustomSelect(wrapper) {
  const parts = [...customSelects.values()].find((entry) => entry.wrapper === wrapper);
  wrapper.classList.remove("is-open");
  wrapper.querySelector(".glass-select-trigger")?.setAttribute("aria-expanded", "false");

  if (!parts) return;
  const { menu } = parts;

  if (!menu.classList.contains("is-portal-open") || menu.classList.contains("is-closing")) {
    return;
  }

  menu.classList.add("is-closing");

  const cleanup = () => {
    menu.removeEventListener("animationend", cleanup);
    menu.removeEventListener("animationcancel", cleanup);
    if (!menu.classList.contains("is-closing")) return;

    menu.classList.remove("is-portal-open", "is-closing");
    menu.removeAttribute("data-placement");
    menu.removeAttribute("style");
    if (menu.parentElement !== wrapper) wrapper.appendChild(menu);
  };

  menu.addEventListener("animationend", cleanup);
  menu.addEventListener("animationcancel", cleanup);
}

function closeAllCustomSelects(except = null) {
  document.querySelectorAll(".glass-select.is-open").forEach((wrapper) => {
    if (wrapper !== except) closeCustomSelect(wrapper);
  });
}

function setStatus(text) {
  const status = $("status");
  status.textContent = text;
  status.classList.add("is-visible");
  clearTimeout(setStatus._timer);
  setStatus._timer = setTimeout(() => {
    status.classList.remove("is-visible");
  }, 1700);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getTranslation(key) {
  const lang = settings.uiLanguage || "vi";
  return (TRANSLATIONS[lang] || TRANSLATIONS.vi)[key] || key;
}

function localizeUI() {
  const lang = settings.uiLanguage || "vi";
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.vi;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    const value = dict[key];
    if (!value) return;

    if ((el.tagName === "INPUT" || el.tagName === "TEXTAREA") && el.hasAttribute("placeholder")) {
      el.placeholder = value;
    } else {
      el.textContent = value;
    }
  });

  // Dynamic placeholders and inputs
  const transInput = $("transInput");
  if (transInput) {
    transInput.placeholder = dict["trans-input-placeholder"];
  }

  const writeInput = $("writeInput");
  if (writeInput) {
    const prefix = dict["write-input-placeholder-prefix"] || "Min 4 characters. Ctrl+Enter to";
    writeInput.placeholder = `${prefix} ${getWriteModeLabel().toLowerCase()}`;
  }

  // Update clear result default texts if they are empty
  const transResultPanel = $("transResultPanel");
  if (transResultPanel && transResultPanel.classList.contains("is-empty")) {
    $("transResultText").textContent = dict["trans-result-placeholder"];
    $("transResultMeta").textContent = dict["trans-result-meta"];
  }

  const writeResultPanel = $("writeResultPanel");
  if (writeResultPanel && writeResultPanel.classList.contains("is-empty")) {
    $("writeResultText").textContent = "";
    $("writeResultMeta").textContent = "Result";
  }
}

const TRANSLATIONS = {
  vi: {
    "tool-tabs-translate": "Dịch",
    "tool-tabs-write": "Viết",
    "label-source": "Nguồn",
    "label-target": "Đích",
    "trans-input-label": "Văn bản cần dịch",
    "trans-clear-btn": "Xóa",
    "trans-input-placeholder": "Nhập hoặc dán văn bản tại đây...",
    "trans-run-btn": "Dịch",
    "trans-result-meta": "Kết quả",
    "trans-copy-btn": "Sao chép",
    "trans-result-placeholder": "Kết quả dịch sẽ xuất hiện tại đây.",
    "trans-dict-title": "Từ điển",
    
    "write-input-label": "Văn bản cần viết lại",
    "write-clear-btn": "Xóa",
    "write-input-placeholder-polish": "Dán câu cần làm trơn tru hơn...",
    "write-input-placeholder-clarify": "Dán câu cần làm rõ nghĩa hơn...",
    "write-run-btn-polish": "Làm mượt",
    "write-run-btn-clarify": "Làm rõ nghĩa",
    "write-result-meta": "Kết quả",
    "write-copy-btn": "Sao chép",
    "write-result-placeholder": "Kết quả viết lại sẽ xuất hiện tại đây.",
    "write-controls-label": "Chế độ viết",
    "write-mode-check": "Kiểm tra",
    "write-mode-polish": "Cải thiện",
    "write-mode-academic": "Học thuật",
    "write-mode-friendly": "Thân thiện",
    "write-mode-simplify": "Đơn giản hóa",
    "write-mode-detailed": "Chi tiết hơn",
    "write-input-placeholder-prefix": "Tối thiểu 4 ký tự. Ctrl+Enter để",
    
    "site-label": "Site hiện tại",
    "site-btn-toggle-off": "Tắt site",
    "site-btn-toggle-on": "Bật site",
    "site-unable-read": "Không đọc được site",
    "video-subtitle-label": "Phụ đề video",
    "video-subtitle-status-off": "Đang tắt",
    "video-subtitle-btn-on": "Bật phụ đề",
    "video-subtitle-btn-off": "Tắt phụ đề",
    
    "settings-eyebrow": "Nâng cao",
    "settings-title": "Cài đặt",
    
    "settings-group-default": "Xử lý mặc định",
    "settings-desc-default": "Thiết lập cách InputBridge xử lý nội dung trong ô nhập trên web.",
    "settings-mode-label": "Chế độ",
    "settings-engine-label": "Engine mặc định",
    "settings-ui-lang-label": "Ngôn ngữ hiển thị (UI)",
    "settings-tone-label": "Tone khi bật LLM",
    "settings-auto-label": "Auto behavior",
    "settings-mode-trans": "Gửi dạng ngôn ngữ",
    "settings-mode-polish": "Polish bằng LLM",
    "settings-mode-clarify": "Clarify bằng LLM",
    "settings-auto-preview": "Chỉ xem trước",
    "settings-auto-replace": "Tự động thay thế sau khi ngừng gõ",
    "settings-auto-onsend": "Tự động khi gửi (Thử nghiệm)",
    
    "settings-group-preview": "Xem trước và gửi",
    "settings-live-label": "Xem trước trực tiếp",
    "settings-live-desc": "Xem nội dung xử lý ngay khi đang gõ",
    "settings-tab-accept": "Nhấn Tab để nhận kết quả",
    "settings-show-back": "Hiển thị dịch ngược",
    "settings-ai-enhance": "Cải thiện bằng AI sau khi Google dịch",
    "settings-demo-mode": "Chế độ demo",
    
    "settings-group-select": "Dịch văn bản được chọn",
    "settings-group-select-desc": "Điều khiển icon dịch khi bôi đen văn bản.",
    "settings-select-enable": "Bật dịch văn bản được chọn",
    "settings-trigger-label": "Kích hoạt",
    "settings-trigger-icon": "Nhấp vào biểu tượng",
    "settings-trigger-instant": "Ngay sau khi bôi đen",
    "settings-min-chars-label": "Ký tự tối thiểu",
    "settings-max-chars-label": "Ký tự tối đa",
    "settings-shift-label": "Giữ Shift để dịch ngay",
    "settings-editable-label": "Cho phép trong ô nhập liệu",

    "settings-group-video": "Phụ đề video trực tiếp",
    "settings-group-video-desc": "Dịch phụ đề đang hiển thị trên YouTube và video HTML5 theo thời gian thực.",
    "settings-video-enable": "Bật dịch phụ đề video",
    "settings-video-enable-desc": "Tự bắt câu phụ đề mới và hiển thị bản dịch trên video.",
    "settings-video-bilingual": "Hiển thị song ngữ",
    "settings-video-bilingual-desc": "Hiện câu gốc phía trên bản dịch.",
    "settings-video-keep-original": "Giữ phụ đề gốc của trình phát",
    "settings-video-target": "Ngôn ngữ đích",
    "settings-video-engine": "Chế độ dịch",
    "settings-video-engine-fast": "Nhanh nhất · Google Translate",
    "settings-video-engine-smart": "Tự nhiên hơn · Gemini Flash-Lite",
    "settings-video-position": "Vị trí",
    "settings-video-position-bottom": "Phía dưới",
    "settings-video-position-top": "Phía trên",
    "settings-video-font-size": "Cỡ chữ",
    "settings-video-style-title": "Kiểu hiển thị phụ đề",
    "settings-video-style-desc": "Chỉnh riêng font, độ đậm, màu, nền, độ trong, bo góc và viền chữ cho từng dòng. Hai dòng có thể kéo độc lập trên video.",
    "settings-video-source-size": "Cỡ chữ gốc",
    "settings-video-translation-size": "Cỡ chữ dịch",
    "settings-video-source-color": "Màu chữ gốc",
    "settings-video-translation-color": "Màu chữ dịch",
    "settings-video-source-background": "Nền câu gốc",
    "settings-video-translation-background": "Nền bản dịch",
    "settings-video-source-font": "Font câu gốc",
    "settings-video-translation-font": "Font bản dịch",
    "settings-video-source-weight": "Độ đậm câu gốc",
    "settings-video-translation-weight": "Độ đậm bản dịch",
    "settings-video-source-opacity": "Độ trong nền gốc (%)",
    "settings-video-translation-opacity": "Độ trong nền dịch (%)",
    "settings-video-source-radius": "Bo góc câu gốc",
    "settings-video-translation-radius": "Bo góc bản dịch",
    "settings-video-source-outline": "Viền chữ câu gốc",
    "settings-video-translation-outline": "Viền chữ bản dịch",
    "settings-video-drag-hint": "Rê vào phụ đề rồi kéo tay nắm chấm ở bên trái. Hai dòng kéo độc lập; nhấp đúp tay nắm để đặt lại riêng dòng đó.",
    "settings-video-reset-position": "Đặt lại vị trí",
    "settings-video-note": "Chế độ Google cho phụ đề gần realtime. Gemini tự nhiên hơn nhưng thường chậm thêm một nhịp và vẫn tự rơi về Google khi lỗi.",
    
    "settings-group-timing": "Thời gian & Dịch ngược",
    "settings-debounce-label": "Thời gian trễ (ms)",
    "settings-min-chars-input-label": "Ký tự tối thiểu",
    "settings-back-lang-label": "Ngôn ngữ dịch ngược",
    
    "settings-group-ai": "Cấu hình AI",
    "settings-group-ai-desc": "Không nhập key vẫn dùng Google Translate bình thường.",
    "settings-api-label": "OpenAI API key",
    "settings-model-label": "Model",
    
    "settings-btn-reset": "Khôi phục mặc định",
    "settings-btn-save": "Lưu cài đặt",
    
    "status-updated": "Đã cập nhật.",
    "status-done": "Xong.",
    "status-copied": "Đã copy.",
    "status-copy-failed": "Không copy được.",
    "status-saved": "Đã lưu cài đặt.",
    "status-reset": "Đã reset về mặc định.",
    "status-site-on": "Đã bật site này.",
    "status-site-off": "Đã tắt site này.",
    "status-video-on": "Đã bật dịch phụ đề video.",
    "status-video-off": "Đã tắt dịch phụ đề video.",
    "status-video-position-reset": "Đã đặt lại vị trí phụ đề.",
    "status-error-failed": "Không xử lý được nội dung.",

    "mode-polished": "Đã làm mượt",
    "mode-clarified": "Đã làm rõ nghĩa",
    "tone-natural": "tự nhiên",
    "tone-casual": "thân mật",
    "tone-neutral": "trung lập",
    "tone-professional": "chuyên nghiệp",
    "tone-polite": "lịch sự",
    "tone-direct": "thẳng thắn"
  },
  en: {
    "tool-tabs-translate": "Translate",
    "tool-tabs-write": "Write",
    "label-source": "Source",
    "label-target": "Target",
    "trans-input-label": "Text to translate",
    "trans-clear-btn": "Clear",
    "trans-input-placeholder": "Type or paste text here...",
    "trans-run-btn": "Translate",
    "trans-result-meta": "Result",
    "trans-copy-btn": "Copy",
    "trans-result-placeholder": "Translation will appear here.",
    "trans-dict-title": "Dictionary",
    
    "write-input-label": "Text to rewrite",
    "write-clear-btn": "Clear",
    "write-input-placeholder-polish": "Paste a rough sentence to make it cleaner...",
    "write-input-placeholder-clarify": "Paste a sentence that needs to be clearer...",
    "write-run-btn-polish": "Polish",
    "write-run-btn-clarify": "Clarify",
    "write-result-meta": "Result",
    "write-copy-btn": "Copy",
    "write-result-placeholder": "Rewritten text will appear here.",
    "write-controls-label": "Writing mode",
    "write-mode-check": "Check",
    "write-mode-polish": "Improve",
    "write-mode-academic": "Academy",
    "write-mode-friendly": "Friendly",
    "write-mode-simplify": "Simplify",
    "write-mode-detailed": "More detailed",
    "write-input-placeholder-prefix": "Min 4 characters. Ctrl+Enter to",
    
    "site-label": "Current site",
    "site-btn-toggle-off": "Disable site",
    "site-btn-toggle-on": "Enable site",
    "site-unable-read": "Unable to read site",
    "video-subtitle-label": "Video subtitles",
    "video-subtitle-status-off": "Off",
    "video-subtitle-btn-on": "Enable",
    "video-subtitle-btn-off": "Disable",
    
    "settings-eyebrow": "Advanced",
    "settings-title": "Settings",
    
    "settings-group-default": "Default Behavior",
    "settings-desc-default": "Configure how InputBridge processes input on web pages.",
    "settings-mode-label": "Mode",
    "settings-engine-label": "Default Engine",
    "settings-ui-lang-label": "Display Language (UI)",
    "settings-tone-label": "Tone when LLM is active",
    "settings-auto-label": "Auto behavior",
    "settings-mode-trans": "Send as language",
    "settings-mode-polish": "Polish with LLM",
    "settings-mode-clarify": "Clarify with LLM",
    "settings-auto-preview": "Preview only",
    "settings-auto-replace": "Auto replace after typing stops",
    "settings-auto-onsend": "Auto on Send (Experimental)",
    
    "settings-group-preview": "Preview & Send",
    "settings-live-label": "Live preview",
    "settings-live-desc": "See processed text in real time while typing",
    "settings-tab-accept": "Tab key to accept preview",
    "settings-show-back": "Show back-translation",
    "settings-ai-enhance": "AI enhance after Google Translate",
    "settings-demo-mode": "Demo mode",
    
    "settings-group-select": "Selection Translation",
    "settings-group-select-desc": "Control translation icon when text is selected.",
    "settings-select-enable": "Enable selection translation",
    "settings-trigger-label": "Trigger",
    "settings-trigger-icon": "Click icon",
    "settings-trigger-instant": "Instant after selection",
    "settings-min-chars-label": "Minimum characters",
    "settings-max-chars-label": "Maximum characters",
    "settings-shift-label": "Hold Shift to translate instantly",
    "settings-editable-label": "Allow inside input fields",

    "settings-group-video": "Live video subtitles",
    "settings-group-video-desc": "Translate visible YouTube and HTML5 video captions in real time.",
    "settings-video-enable": "Enable video subtitle translation",
    "settings-video-enable-desc": "Watch for new caption lines and render a translation over the video.",
    "settings-video-bilingual": "Show bilingual subtitles",
    "settings-video-bilingual-desc": "Show the original line above the translation.",
    "settings-video-keep-original": "Keep the player's original captions",
    "settings-video-target": "Target language",
    "settings-video-engine": "Translation mode",
    "settings-video-engine-fast": "Fastest · Google Translate",
    "settings-video-engine-smart": "More natural · Gemini Flash-Lite",
    "settings-video-position": "Position",
    "settings-video-position-bottom": "Bottom",
    "settings-video-position-top": "Top",
    "settings-video-font-size": "Font size",
    "settings-video-style-title": "Subtitle appearance",
    "settings-video-style-desc": "Customize font, weight, colors, opacity, radius, and text outline for each line. Drag the two lines independently over the video.",
    "settings-video-source-size": "Original font size",
    "settings-video-translation-size": "Translation font size",
    "settings-video-source-color": "Original text color",
    "settings-video-translation-color": "Translation text color",
    "settings-video-source-background": "Original background",
    "settings-video-translation-background": "Translation background",
    "settings-video-source-font": "Original font",
    "settings-video-translation-font": "Translation font",
    "settings-video-source-weight": "Original weight",
    "settings-video-translation-weight": "Translation weight",
    "settings-video-source-opacity": "Original background opacity (%)",
    "settings-video-translation-opacity": "Translation background opacity (%)",
    "settings-video-source-radius": "Original corner radius",
    "settings-video-translation-radius": "Translation corner radius",
    "settings-video-source-outline": "Original text outline",
    "settings-video-translation-outline": "Translation text outline",
    "settings-video-drag-hint": "Hover a subtitle and drag the dotted handle on its left. Each line moves independently; double-click a handle to reset that line.",
    "settings-video-reset-position": "Reset positions",
    "settings-video-note": "Google mode is tuned for near-realtime captions. Gemini is more natural but usually adds latency and still falls back to Google on failure.",
    
    "settings-group-timing": "Timing & Back-translation",
    "settings-debounce-label": "Debounce ms",
    "settings-min-chars-input-label": "Min chars",
    "settings-back-lang-label": "Back-translation language",
    
    "settings-group-ai": "AI Enhance",
    "settings-group-ai-desc": "Standard Google Translate works without an API key.",
    "settings-api-label": "OpenAI API key",
    "settings-model-label": "Model",
    
    "settings-btn-reset": "Reset",
    "settings-btn-save": "Save changes",
    
    "status-updated": "Updated.",
    "status-done": "Done.",
    "status-copied": "Copied.",
    "status-copy-failed": "Copy failed.",
    "status-saved": "Settings saved.",
    "status-reset": "Reset to defaults.",
    "status-site-on": "Site enabled.",
    "status-site-off": "Site disabled.",
    "status-video-on": "Video subtitle translation enabled.",
    "status-video-off": "Video subtitle translation disabled.",
    "status-video-position-reset": "Subtitle positions reset.",
    "status-error-failed": "Failed to process content.",

    "mode-polished": "Polished",
    "mode-clarified": "Clarified",
    "tone-natural": "natural",
    "tone-casual": "casual",
    "tone-neutral": "neutral",
    "tone-professional": "professional",
    "tone-polite": "polite",
    "tone-direct": "direct"
  }
};
