const DEFAULT_SETTINGS = {
  settingsVersion: 9,
  enabled: true,
  demoMode: false,
  engine: "google",
  aiEnhance: false,
  apiKey: "",
  model: "gpt-4o-mini",
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
  selectionMaxChars: 1000,
  selectionCardTheme: "light",
  siteOverrides: {}
};

const LANGUAGE_CATALOG = globalThis.InputBridgeLanguageCatalog;
const $ = (id) => document.getElementById(id);
const fields = [
  "enabled",
  "demoMode",
  "engine",
  "aiEnhance",
  "apiKey",
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
  "selectionMaxChars"
];
const quickFields = new Set(["enabled", "sourceLanguage", "targetLanguage"]);

let settings = null;
let activeOrigin = "";
let activeTool = "translate";
let activeWriteMode = "polish";
let popupRequestId = 0;
let popupDebounceTimer = null;
let lastPopupResult = "";
let lastDetectedSourceLanguage = "";
const customSelects = new Map();

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
    "backTranslationLanguage"
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

  // Tab-specific actions
  $("transRunTool").addEventListener("click", () => runPopupTool(true));
  $("writeRunTool").addEventListener("click", () => runPopupTool(true));

  $("transClearInput").addEventListener("click", clearPopupInput);
  $("writeClearInput").addEventListener("click", clearPopupInput);

  $("transCopyResult").addEventListener("click", copyPopupResult);
  $("writeCopyResult").addEventListener("click", copyPopupResult);

  $("transSwapLanguages").addEventListener("click", swapLanguages);
  $("writeSwapLanguages").addEventListener("click", swapLanguages);

  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => setActiveTool(button.dataset.tool));
  });

  document.querySelectorAll("[data-write-mode]").forEach((button) => {
    button.addEventListener("click", () => setWriteMode(button.dataset.writeMode));
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
      schedulePopupRun();
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
  $("writeSourceLanguage").addEventListener("change", () => handleLanguageChange("writeSourceLanguage", "writeSourceLanguage"));
  $("writeTargetLanguage").addEventListener("change", () => handleLanguageChange("writeTargetLanguage", "writeTargetLanguage"));
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
  if (!mode || mode === activeWriteMode) return;
  activeWriteMode = mode;
  updateToolUi();
  const inputVal = getActiveEl("input").value.trim();
  if (activeTool === "write" && inputVal) runPopupTool(false);
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
    button.setAttribute("aria-selected", String(active));
  });

  const translate = activeTool === "translate";
  $("translateTabContent").hidden = !translate;
  $("writeTabContent").hidden = translate;

  if (activeTool === "write") {
    $("writeInputLabel").textContent = getTranslation("write-input-label");
    $("writeInput").placeholder = activeWriteMode === "polish"
      ? getTranslation("write-input-placeholder-polish")
      : getTranslation("write-input-placeholder-clarify");
    $("writeRunTool").textContent = activeWriteMode === "polish"
      ? getTranslation("write-run-btn-polish")
      : getTranslation("write-run-btn-clarify");
  }

  render();

  const inputVal = getActiveEl("input").value.trim();
  if (!inputVal) clearPopupResult();
}

function render() {
  for (const id of fields) {
    const el = $(id);
    if (!el) continue;

    const value = settings[id];
    if (el.type === "checkbox") el.checked = Boolean(value);
    else el.value = value ?? "";
  }

  // Load quick languages
  if ($("transSourceLanguage")) $("transSourceLanguage").value = settings.sourceLanguage || "Auto detect";
  if ($("transTargetLanguage")) $("transTargetLanguage").value = settings.targetLanguage || "English";
  if ($("writeSourceLanguage")) $("writeSourceLanguage").value = settings.writeSourceLanguage || "Auto detect";
  if ($("writeTargetLanguage")) $("writeTargetLanguage").value = settings.writeTargetLanguage || "English";

  $("siteName").textContent = activeOrigin || getTranslation("site-unable-read");

  const siteEnabled = settings.siteOverrides?.[activeOrigin]?.enabled;
  const toggleSite = $("toggleSite");
  const disabled = siteEnabled === false;
  toggleSite.textContent = disabled ? getTranslation("site-btn-toggle-on") : getTranslation("site-btn-toggle-off");
  toggleSite.classList.toggle("is-disabled", disabled);

  localizeUI();
  syncCustomSelects();
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

  const requestId = ++popupRequestId;
  setResultLoading(true);

  try {
    const message = activeTool === "translate"
      ? {
          type: "IB_POPUP_TRANSLATE",
          text,
          sourceLanguage: $("transSourceLanguage").value,
          targetLanguage: $("transTargetLanguage").value,
          fallbackLanguage: settings.backTranslationLanguage,
          maxChars: 5000
        }
      : {
          type: "IB_TRANSFORM",
          text,
          mode: activeWriteMode,
          tone: settings.tone,
          targetLanguage: $("writeTargetLanguage").value,
          contextHint: "InputBridge popup writing tool"
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
    const modeName = activeWriteMode === "polish" ? "Polished" : "Clarified";
    $("writeResultMeta").textContent = `${modeName} · ${data.tone || settings.tone}`;
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
    : getTranslation("write-result-placeholder");
  getActiveEl("resultMeta").textContent = getTranslation("trans-result-meta");
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

  const inputVal = getActiveEl("input").value.trim();
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
  const next = collectSettings();
  await chrome.storage.sync.set(next);
  settings = { ...settings, ...next };
  render();
  await notifyTabs();
  setStatus(getTranslation("status-saved"));
}

async function reset() {
  await chrome.storage.sync.set(DEFAULT_SETTINGS);
  settings = { ...DEFAULT_SETTINGS, siteOverrides: {} };
  render();
  await notifyTabs();
  setStatus(getTranslation("status-reset"));
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

function collectSettings() {
  const next = {};

  for (const id of fields) {
    const el = $(id);
    if (!el) continue;
    next[id] = readFieldValue(el);
  }

  next.debounceMs = clamp(next.debounceMs || DEFAULT_SETTINGS.debounceMs, 300, 2500);
  next.minChars = clamp(next.minChars || DEFAULT_SETTINGS.minChars, 1, 200);
  next.selectionMinChars = clamp(next.selectionMinChars || DEFAULT_SETTINGS.selectionMinChars, 1, 20);
  next.selectionMaxChars = clamp(next.selectionMaxChars || DEFAULT_SETTINGS.selectionMaxChars, 20, 5000);
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
        selectionMaxChars: Number(stored.selectionMaxChars || 1000),
        selectionCardTheme: stored.selectionCardTheme || "light",
        writeSourceLanguage: stored.writeSourceLanguage || "Auto detect",
        writeTargetLanguage: stored.writeTargetLanguage || "English",
        uiLanguage: stored.uiLanguage || "vi"
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
  menu.style.left = `${left}px`;
  menu.style.width = `${width}px`;
  menu.style.maxHeight = `${maxHeight}px`;
  menu.style.right = "auto";

  const renderedHeight = Math.min(menu.scrollHeight, maxHeight);
  const top = openAbove
    ? Math.max(viewportPadding, rect.top - gap - renderedHeight)
    : Math.min(window.innerHeight - viewportPadding - renderedHeight, rect.bottom + gap);

  menu.style.top = `${top}px`;
  menu.style.visibility = "";
  menu.dataset.placement = openAbove ? "top" : "bottom";
}

function closeCustomSelect(wrapper) {
  const parts = [...customSelects.values()].find((entry) => entry.wrapper === wrapper);
  wrapper.classList.remove("is-open");
  wrapper.querySelector(".glass-select-trigger")?.setAttribute("aria-expanded", "false");

  if (!parts) return;
  const { menu } = parts;
  menu.classList.remove("is-portal-open");
  menu.removeAttribute("data-placement");
  menu.removeAttribute("style");
  if (menu.parentElement !== wrapper) wrapper.appendChild(menu);
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

    if (el.tagName === "INPUT" && el.hasAttribute("placeholder")) {
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
    writeInput.placeholder = activeWriteMode === "polish"
      ? dict["write-input-placeholder-polish"]
      : dict["write-input-placeholder-clarify"];
  }

  const writeRunBtn = $("writeRunTool");
  if (writeRunBtn) {
    writeRunBtn.textContent = activeWriteMode === "polish"
      ? dict["write-run-btn-polish"]
      : dict["write-run-btn-clarify"];
  }

  // Update clear result default texts if they are empty
  const transResultPanel = $("transResultPanel");
  if (transResultPanel && transResultPanel.classList.contains("is-empty")) {
    $("transResultText").textContent = dict["trans-result-placeholder"];
    $("transResultMeta").textContent = dict["trans-result-meta"];
  }

  const writeResultPanel = $("writeResultPanel");
  if (writeResultPanel && writeResultPanel.classList.contains("is-empty")) {
    $("writeResultText").textContent = dict["write-result-placeholder"];
    $("writeResultMeta").textContent = dict["trans-result-meta"];
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
    
    "site-label": "Site hiện tại",
    "site-btn-toggle-off": "Tắt site",
    "site-btn-toggle-on": "Bật site",
    "site-unable-read": "Không đọc được site",
    
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
    "status-error-failed": "Không xử lý được nội dung."
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
    
    "site-label": "Current site",
    "site-btn-toggle-off": "Disable site",
    "site-btn-toggle-on": "Enable site",
    "site-unable-read": "Unable to read site",
    
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
    "status-error-failed": "Failed to process content."
  }
};
