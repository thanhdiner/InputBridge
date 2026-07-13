import "./languages.js";

const LANGUAGE_CATALOG = globalThis.InputBridgeLanguageCatalog;

const DEFAULT_SETTINGS = {
  settingsVersion: 19,
  enabled: true,
  demoMode: false,
  engine: "google",
  // Google Translate must remain usable without a local LLM service or API key.
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
  selectionMaxChars: 1000,
  selectionCardTheme: "light",
  videoSubtitleEnabled: false,
  videoSubtitleBilingual: false,
  videoSubtitleKeepOriginal: false,
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

const TRANSLATION_CACHE = new Map();
const TRANSLATION_CACHE_LIMIT = 300;
const VIDEO_CAPTION_CACHE = new Map();
const VIDEO_CAPTION_CACHE_LIMIT = 600;
const TRANSLATION_TIMEOUT_MS = 8000;
const LLM_TIMEOUT_MS = 15000;
const GEMINI_OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
const LLM_API_KEY_LIMIT = 5;
const LLM_KEY_CURSOR_STORAGE_KEY = "llmApiKeyCursor";
let llmKeyCursorCache = null;
let llmKeyCursorLock = Promise.resolve();

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get(null);
  const migrated = migrateSettings(current);
  await chrome.storage.sync.set({ ...DEFAULT_SETTINGS, ...migrated });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync" || !Object.keys(changes || {}).length) return;
  void broadcastSettingsUpdated();
});

async function broadcastSettingsUpdated() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => {
    if (!tab.id || !tab.url?.startsWith("http")) return null;
    return chrome.tabs.sendMessage(tab.id, { type: "IB_SETTINGS_UPDATED" }).catch(() => null);
  }));
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-site") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) return;

  const origin = safeOrigin(tab.url);
  if (!origin) return;

  const settings = await getSettings();
  const current = settings.siteOverrides?.[origin]?.enabled;
  const nextEnabled = current === false ? true : false;
  const siteOverrides = {
    ...settings.siteOverrides,
    [origin]: { ...(settings.siteOverrides?.[origin] || {}), enabled: nextEnabled }
  };

  await chrome.storage.sync.set({ siteOverrides });
  chrome.tabs.sendMessage(tab.id, { type: "IB_SETTINGS_UPDATED" }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch((error) => {
    sendResponse({ ok: false, error: error?.message || String(error) });
  });
  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "ib-transform-stream") return;

  let disconnected = false;

  port.onDisconnect.addListener(() => {
    disconnected = true;
  });

  const postToPort = (payload) => {
    if (disconnected) return false;

    try {
      port.postMessage(payload);
      return true;
    } catch (error) {
      if (/disconnected port/i.test(error?.message || String(error))) {
        disconnected = true;
        return false;
      }
      throw error;
    }
  };

  const disconnectPort = () => {
    if (disconnected) return;

    try {
      port.disconnect();
    } catch {
      // The popup/content script may already have closed the port.
    } finally {
      disconnected = true;
    }
  };

  port.onMessage.addListener(async (message) => {
    try {
      const settings = withSiteSettings(await getSettings(), message.origin || port.sender?.tab?.url);
      if (!settings.enabled) {
        postToPort({ ok: false, error: "InputBridge is disabled here." });
        disconnectPort();
        return;
      }

      const text = String(message.text || "").trim();
      if (!text) {
        postToPort({ ok: false, error: "Empty text" });
        disconnectPort();
        return;
      }

      const payload = {
        text,
        mode: message.mode || settings.mode,
        tone: message.tone || settings.tone,
        targetLanguage: message.targetLanguage || settings.targetLanguage,
        contextHint: message.contextHint || "web input"
      };

      if (settings.demoMode) {
        const demoData = await demoTransform(payload, settings);
        postToPort({ ok: true, data: { ...demoData, done: true } });
        return;
      }

      await streamTransform(payload, settings, (data) => {
        postToPort({ ok: true, data });
      });
    } catch (error) {
      postToPort({ ok: false, error: error?.message || String(error) });
    }
  });
});

async function handleMessage(message, sender) {
  if (!message?.type) return { ok: false, error: "Missing message type" };

  if (message.type === "IB_GET_SETTINGS") {
    const settings = await getSettings();
    return { ok: true, settings: withSiteSettings(settings, message.origin || sender?.tab?.url) };
  }

  if (message.type === "IB_SAVE_SETTINGS") {
    const next = sanitizeSettings(message.settings || {});
    await chrome.storage.sync.set(next);
    return { ok: true, settings: await getSettings() };
  }

  if (message.type === "IB_POPUP_TRANSLATE") {
    const settings = withSiteSettings(await getSettings(), message.origin || sender?.tab?.url);
    if (!settings.enabled) {
      return { ok: false, error: "InputBridge is disabled here." };
    }
    return translateDictionaryPayload(message, settings);
  }

  if (message.type === "IB_TRANSLATE_SELECTION") {
    const settings = withSiteSettings(await getSettings(), message.origin || sender?.tab?.url);
    if (!settings.enabled || !settings.selectionTranslation) {
      return { ok: false, error: "Selection translation is disabled here." };
    }
    return translateDictionaryPayload(message, settings);
  }

  if (message.type === 'IB_TRANSLATE_SUBTITLE_WORD') {
    const settings = withSiteSettings(await getSettings(), message.origin || sender?.tab?.url);
    if (!settings.enabled || !settings.videoSubtitleEnabled) return { ok: false, error: 'Video subtitle translation is disabled here.' };
    const text = String(message.text || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    const context = String(message.context || '').replace(/\s+/g, ' ').trim().slice(0, 800);
    const mode = ['word', 'phrase', 'selection'].includes(message.mode) ? message.mode : 'word';
    if (!text) return { ok: false, error: 'Empty subtitle term' };

    const sourceCode = languageToCode(message.sourceLanguage || 'auto');
    let targetCode = languageToCode(message.targetLanguage || settings.videoSubtitleTargetLanguage || 'Vietnamese');
    if (!targetCode || targetCode === 'auto') targetCode = languageToCode(settings.backTranslationLanguage || 'Vietnamese');

    let result = '';
    let engine = 'google';
    let fallbackReason = '';
    if (settings.videoSubtitleEngine === 'gemini' && canUseLlm(settings)) {
      try {
        result = await callContextualSubtitleTermTranslation({ text, context, mode, sourceCode, targetCode }, settings);
        engine = settings.llmProvider === 'gemini' ? 'gemini-3.1-flash-lite' : settings.llmProvider;
      } catch (error) {
        fallbackReason = error?.message || String(error);
      }
    }

    let detectedSourceCode = sourceCode || 'auto';
    if (!result && context) {
      try {
        const contextual = await callGoogleContextualSubtitleTermTranslation(text, context, sourceCode || 'auto', targetCode);
        if (contextual?.result) {
          result = contextual.result;
          detectedSourceCode = contextual.detectedSource || detectedSourceCode;
          engine = 'google-context';
        }
      } catch (error) {
        fallbackReason = fallbackReason || error?.message || String(error);
      }
    }
    if (!result) {
      const translated = await callGoogleTranslateDetailed(text, sourceCode || 'auto', targetCode, { includeDictionary: false });
      result = translated.result;
      detectedSourceCode = translated.detectedSource || detectedSourceCode;
    }

    return {
      ok: true,
      data: { result, detectedSourceCode, engine, mode, original: text, fallbackReason }
    };
  }

  if (message.type === "IB_TRANSLATE_VIDEO_CAPTION") {
    const settings = withSiteSettings(await getSettings(), message.origin || sender?.tab?.url);
    if (!settings.enabled || !settings.videoSubtitleEnabled) {
      return { ok: false, error: "Video subtitle translation is disabled here." };
    }
    return translateVideoCaptionPayload(message, settings);
  }

  if (message.type === "IB_TRANSLATE_VIDEO_CAPTION_BATCH") {
    const settings = withSiteSettings(await getSettings(), message.origin || sender?.tab?.url);
    if (!settings.enabled || !settings.videoSubtitleEnabled) {
      return { ok: false, error: "Video subtitle translation is disabled here." };
    }
    return translateVideoCaptionBatchPayload(message, settings);
  }

  if (message.type === "IB_EXPLAIN_SELECTION") {
    const settings = withSiteSettings(await getSettings(), message.origin || sender?.tab?.url);
    if (!settings.enabled || !settings.selectionTranslation) {
      return { ok: false, error: "Selection translation is disabled here." };
    }
    if (!canUseLlm(settings)) {
      return { ok: false, error: "Start 9Router or add an API key for the selected AI provider to use AI explanation." };
    }

    const text = String(message.text || "").trim();
    if (!text) return { ok: false, error: "Empty selection" };

    const data = await callOpenAI({
      mode: "explainSelection",
      text,
      translation: String(message.translation || "").trim(),
      targetLanguage: message.explainLanguage || settings.backTranslationLanguage || "Vietnamese",
      tone: "clear",
      contextHint: message.contextHint || "selected web text"
    }, settings);

    return { ok: true, data };
  }

  if (message.type === "IB_TRANSFORM") {
    const settings = withSiteSettings(await getSettings(), message.origin || sender?.tab?.url);
    if (!settings.enabled) return { ok: false, error: "InputBridge is disabled here." };

    const text = String(message.text || "").trim();
    if (!text) return { ok: false, error: "Empty text" };

    const payload = {
      text,
      mode: message.mode || settings.mode,
      tone: message.tone || settings.tone,
      targetLanguage: message.targetLanguage || settings.targetLanguage,
      contextHint: message.contextHint || "web input"
    };

    if (settings.demoMode) {
      return { ok: true, data: await demoTransform(payload, settings), demo: true };
    }

    const data = await transformText(payload, settings);
    return { ok: true, data, demo: false };
  }

  return { ok: false, error: `Unknown message type: ${message.type}` };
}

async function translateDictionaryPayload(message, settings) {
  const text = String(message.text || "").trim();
  const maxChars = clamp(Number(message.maxChars || settings.selectionMaxChars || 1000), 20, 5000);
  if (!text) return { ok: false, error: "Empty text" };
  if (text.length > maxChars) return { ok: false, error: `Text is longer than ${maxChars} characters.` };

  const preferredSourceLanguage = message.sourceLanguage || "Auto detect";
  const preferredSourceCode = /^auto(?: detect)?$/i.test(preferredSourceLanguage)
    ? "auto"
    : languageToCode(preferredSourceLanguage);
  const preferredTargetLanguage = message.targetLanguage || settings.targetLanguage || "English";
  const preferredTargetCode = languageToCode(preferredTargetLanguage);
  const dictionaryCandidate = isDictionaryCandidate(text);
  let actualTargetLanguage = preferredTargetLanguage;
  let actualTargetCode = preferredTargetCode;
  let translation = await callGoogleTranslateDetailed(text, preferredSourceCode, preferredTargetCode, {
    dictionary: dictionaryCandidate
  });

  if (sameLanguageCode(translation.detectedSource, preferredTargetCode)) {
    let fallbackLanguage = message.fallbackLanguage || settings.backTranslationLanguage || "Vietnamese";
    let fallbackCode = languageToCode(fallbackLanguage);

    if (sameLanguageCode(fallbackCode, preferredTargetCode)) {
      fallbackLanguage = sameLanguageCode(preferredTargetCode, "vi") ? "English" : "Vietnamese";
      fallbackCode = languageToCode(fallbackLanguage);
    }

    translation = await callGoogleTranslateDetailed(
      text,
      translation.detectedSource || preferredSourceCode || "auto",
      fallbackCode,
      { dictionary: dictionaryCandidate }
    );
    actualTargetLanguage = fallbackLanguage;
    actualTargetCode = fallbackCode;
  }

  return {
    ok: true,
    data: {
      original: text,
      result: translation.result,
      targetLanguage: actualTargetLanguage,
      targetCode: actualTargetCode,
      detectedSourceLanguage: languageNameFromCode(translation.detectedSource, "Auto"),
      detectedSourceCode: translation.detectedSource || "auto",
      dictionaryMode: dictionaryCandidate && Array.isArray(translation.dictionary) && translation.dictionary.length > 0,
      dictionary: Array.isArray(translation.dictionary) ? translation.dictionary : [],
      phonetic: translation.phonetic || "",
      headword: translation.headword || text,
      tone: "machine-translation"
    }
  };
}

async function translateVideoCaptionBatchPayload(message, settings) {
  const items = Array.isArray(message.items)
    ? message.items
        .slice(0, 20)
        .map((item) => ({
          id: String(item?.id || ""),
          text: String(item?.text || "").trim(),
          contextBefore: String(item?.contextBefore || "").trim(),
          contextAfter: String(item?.contextAfter || "").trim(),
          sourceLanguage: String(item?.sourceLanguage || "auto").trim()
        }))
        .filter((item) => item.id && item.text)
    : [];
  if (!items.length) return { ok: true, data: { items: [] } };

  const results = new Array(items.length);
  const workerCount = settings.videoSubtitleEngine === "gemini" ? 2 : 4;
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      try {
        const response = await translateVideoCaptionPayload({
          text: item.text,
          contextBefore: item.contextBefore,
          contextAfter: item.contextAfter,
          sourceLanguage: item.sourceLanguage,
          targetLanguage: message.targetLanguage
        }, settings);
        results[index] = response?.ok
          ? { id: item.id, ...response.data }
          : { id: item.id, error: response?.error || "Translation failed" };
      } catch (error) {
        results[index] = { id: item.id, error: error?.message || String(error) };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(workerCount, items.length) }, worker));
  return { ok: true, data: { items: results.filter(Boolean) } };
}

async function translateVideoCaptionPayload(message, settings) {
  const text = String(message.text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
  if (!text) return { ok: false, error: "Empty caption" };

  const contextBefore = String(message.contextBefore || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
  const contextAfter = String(message.contextAfter || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
  const sourceCode = languageToCode(message.sourceLanguage || "auto") || "auto";
  const targetLanguage = message.targetLanguage || settings.videoSubtitleTargetLanguage || settings.targetLanguage || "Vietnamese";
  const targetCode = languageToCode(targetLanguage);
  const subtitleEngine = settings.videoSubtitleEngine === "gemini" ? "gemini" : "google";
  const cacheKey = `${subtitleEngine}\u0000${sourceCode}\u0000${targetCode}\u0000${contextBefore}\u0000${text}\u0000${contextAfter}`;
  const cached = VIDEO_CAPTION_CACHE.get(cacheKey);
  if (cached) return { ok: true, data: cached };

  if (sourceCode !== "auto" && sameLanguageCode(sourceCode, targetCode)) {
    const data = {
      original: text,
      result: text,
      targetLanguage,
      targetCode,
      engine: "source-track",
      fallbackReason: ""
    };
    rememberBoundedCache(VIDEO_CAPTION_CACHE, VIDEO_CAPTION_CACHE_LIMIT, cacheKey, data);
    return { ok: true, data };
  }

  let result = "";
  let engine = "google";
  let fallbackReason = "";

  const configuredKeys = getApiKeys(settings);
  const geminiKeys = settings.llmProvider === "gemini"
    ? configuredKeys
    : configuredKeys.filter((key) => /^AIza/i.test(key));

  if (subtitleEngine === "gemini" && geminiKeys.length) {
    try {
      result = await callGeminiCaptionTranslation(text, targetLanguage, {
        contextBefore,
        contextAfter,
        sourceCode,
        settings: {
          ...settings,
          apiKey: geminiKeys.join("\n"),
          llmProvider: "gemini",
          model: "gemini-3.1-flash-lite"
        }
      });
      engine = "gemini-3.1-flash-lite";
    } catch (error) {
      fallbackReason = error?.message || String(error);
    }
  }

  if (!result && (contextBefore || contextAfter)) {
    try {
      const contextual = await callGoogleContextualCaptionTranslation(
        text,
        contextBefore,
        contextAfter,
        sourceCode,
        targetCode
      );
      if (contextual?.result) {
        result = contextual.result;
        engine = "google-context";
      }
    } catch (error) {
      fallbackReason = fallbackReason || error?.message || String(error);
    }
  }

  if (!result) {
    const translated = await callGoogleTranslateDetailed(text, sourceCode || "auto", targetCode);
    result = translated.result;
    engine = "google";
  }

  const data = {
    original: text,
    result,
    targetLanguage,
    targetCode,
    engine,
    fallbackReason
  };
  rememberBoundedCache(VIDEO_CAPTION_CACHE, VIDEO_CAPTION_CACHE_LIMIT, cacheKey, data);
  return { ok: true, data };
}

async function callGeminiCaptionTranslation(text, targetLanguage, {
  contextBefore = "",
  contextAfter = "",
  sourceCode = "auto",
  settings
} = {}) {
  const sourceLanguage = languageNameFromCode(sourceCode, sourceCode || "Auto");
  const { responseText } = await requestLlmCompletion(settings, {
    model: "gemini-3.1-flash-lite",
    temperature: 0,
    max_tokens: 320,
    messages: [
      {
        role: "system",
        content: "Translate only the CURRENT video subtitle into natural spoken target-language subtitle text. Preserve the intended meaning, names, numbers, tone, and continuity with surrounding lines. Prefer concise native phrasing over literal source-language word order. Do not merge in information from PREVIOUS or NEXT. Return only the translated CURRENT line, with no labels, quotes, alternatives, or explanation."
      },
      {
        role: "user",
        content: `Source language: ${sourceLanguage}\nTarget language: ${targetLanguage}\nPREVIOUS: ${contextBefore || "(none)"}\nCURRENT: ${text}\nNEXT: ${contextAfter || "(none)"}`
      }
    ]
  });

  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new Error("Gemini returned an invalid caption response.");
  }

  const content = payload?.choices?.[0]?.message?.content;
  const result = cleanCaptionTranslation(content);
  if (!result) throw new Error("Gemini returned an empty caption.");
  return result;
}

async function callGoogleContextualCaptionTranslation(text, contextBefore, contextAfter, sourceCode, targetCode) {
  const marked = [
    contextBefore,
    `⟪⟪${text}⟫⟫`,
    contextAfter
  ].filter(Boolean).join("\n");
  const translated = await callGoogleTranslateDetailed(marked, sourceCode || "auto", targetCode, { includeDictionary: false });
  const match = String(translated.result || "").match(/⟪\s*⟪\s*([\s\S]*?)\s*⟫\s*⟫/u);
  const result = cleanCaptionTranslation(match?.[1] || "");
  if (!result) return null;
  return { result, detectedSource: translated.detectedSource || sourceCode || "auto" };
}

async function callGoogleContextualSubtitleTermTranslation(text, context, sourceCode, targetCode) {
  const focusIndex = context.indexOf(text);
  if (focusIndex < 0) return null;

  const markedContext = `${context.slice(0, focusIndex)}⟦${context.slice(focusIndex, focusIndex + text.length)}⟧${context.slice(focusIndex + text.length)}`;
  const translated = await callGoogleTranslateDetailed(markedContext, sourceCode || 'auto', targetCode, { includeDictionary: false });
  const match = String(translated.result || '').match(/⟦\s*([\s\S]*?)\s*⟧/u);
  const result = cleanCaptionTranslation(match?.[1] || '');
  if (!result) return null;
  return { result, detectedSource: translated.detectedSource || sourceCode || 'auto' };
}

async function callContextualSubtitleTermTranslation({ text, context, mode, sourceCode, targetCode }, settings) {
  const targetLanguage = languageNameFromCode(targetCode, targetCode || 'Vietnamese');
  const sourceLanguage = languageNameFromCode(sourceCode, sourceCode || 'Auto');
  const model = settings.llmProvider === 'gemini'
    ? 'gemini-3.1-flash-lite'
    : settings.model || DEFAULT_SETTINGS.model;
  const { responseText } = await requestLlmCompletion(settings, {
    model,
    temperature: 0,
    max_tokens: 120,
    messages: [
      {
        role: 'system',
        content: 'Translate only the focused subtitle text into the target language. Use the full subtitle sentence only to choose the correct contextual meaning. For a word, return its meaning in this sentence, not the whole sentence. For a phrase or selection, translate exactly that span without expanding it. Return only the translation, with no labels, quotes, alternatives, romanization, or explanation.'
      },
      {
        role: 'user',
        content: `Source language: ${sourceLanguage}\nTarget language: ${targetLanguage}\nMode: ${mode}\nFull subtitle: ${context || text}\nFocus text: ${text}`
      }
    ]
  });

  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new Error('The subtitle term translator returned an invalid response.');
  }
  const content = payload?.choices?.[0]?.message?.content;
  const result = cleanCaptionTranslation(content);
  if (!result) throw new Error('The subtitle term translator returned an empty response.');
  return result;
}

function cleanCaptionTranslation(value) {
  let result = String(value || "").trim();
  result = result
    .replace(/^```(?:text|markdown)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  if ((result.startsWith('"') && result.endsWith('"')) || (result.startsWith("'") && result.endsWith("'"))) {
    try {
      result = JSON.parse(result);
    } catch {
      result = result.slice(1, -1);
    }
  }
  return String(result || "").trim();
}

function rememberBoundedCache(cache, limit, key, value) {
  if (cache.size >= limit) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, value);
}

async function getSettings() {
  const stored = await chrome.storage.sync.get(null);
  const migrated = migrateSettings(stored);
  if (migrated !== stored) {
    await chrome.storage.sync.set(migrated);
  }
  return { ...DEFAULT_SETTINGS, ...migrated };
}

function migrateSettings(stored = {}) {
  if (Number(stored.settingsVersion || 0) >= DEFAULT_SETTINGS.settingsVersion) {
    return stored;
  }

  // Version 10 accidentally enabled enhancement for every existing profile.
  // If no remote key is configured, return those profiles to the normal
  // Google-only path. A user who uses 9Router can enable this option again.
  const enabledByV10Default =
    Number(stored.settingsVersion || 0) === 10 &&
    stored.aiEnhance === true &&
    !getApiKeys(stored).length;
  const upgradeVideoSubtitleStyle = Number(stored.settingsVersion || 0) < 19;

  return {
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
    llmProvider: stored.llmProvider || "9router",
    llmBaseUrl: stored.llmBaseUrl || "http://localhost:20128/v1",
    model: stored.model || "mmf/mimo-auto",
    aiEnhance: enabledByV10Default ? false : (stored.aiEnhance ?? false),
    writeSourceLanguage: stored.writeSourceLanguage || "Auto detect",
    writeTargetLanguage: stored.writeTargetLanguage || "English",
    uiLanguage: stored.uiLanguage || "vi",
    videoSubtitleEnabled: stored.videoSubtitleEnabled ?? false,
    videoSubtitleBilingual: stored.videoSubtitleBilingual ?? false,
    videoSubtitleKeepOriginal: false,
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
  };
}

function sanitizeSettings(input) {
  const out = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (Object.prototype.hasOwnProperty.call(input, key)) out[key] = input[key];
  }
  if (typeof out.debounceMs === "number") out.debounceMs = clamp(out.debounceMs, 300, 2500);
  if (typeof out.minChars === "number") out.minChars = clamp(out.minChars, 1, 200);
  if (typeof out.selectionMinChars === "number") out.selectionMinChars = clamp(out.selectionMinChars, 1, 20);
  if (typeof out.selectionMaxChars === "number") out.selectionMaxChars = clamp(out.selectionMaxChars, 20, 5000);
  if (typeof out.videoSubtitleSyncOffsetMs === "number") out.videoSubtitleSyncOffsetMs = clamp(out.videoSubtitleSyncOffsetMs, -2000, 2000);
  if (typeof out.videoSubtitleFontSize === "number") out.videoSubtitleFontSize = clamp(out.videoSubtitleFontSize, 16, 36);
  if (typeof out.videoSubtitleSourceFontSize === "number") out.videoSubtitleSourceFontSize = clamp(out.videoSubtitleSourceFontSize, 14, 42);
  if (typeof out.videoSubtitleTranslationFontSize === "number") out.videoSubtitleTranslationFontSize = clamp(out.videoSubtitleTranslationFontSize, 14, 42);
  if (typeof out.videoSubtitleSourceFontWeight === "number") out.videoSubtitleSourceFontWeight = clamp(out.videoSubtitleSourceFontWeight, 400, 800);
  if (typeof out.videoSubtitleTranslationFontWeight === "number") out.videoSubtitleTranslationFontWeight = clamp(out.videoSubtitleTranslationFontWeight, 400, 800);
  if (typeof out.videoSubtitleSourceBackgroundOpacity === "number") out.videoSubtitleSourceBackgroundOpacity = clamp(out.videoSubtitleSourceBackgroundOpacity, 0, 100);
  if (typeof out.videoSubtitleTranslationBackgroundOpacity === "number") out.videoSubtitleTranslationBackgroundOpacity = clamp(out.videoSubtitleTranslationBackgroundOpacity, 0, 100);
  if (typeof out.videoSubtitleSourceRadius === "number") out.videoSubtitleSourceRadius = clamp(out.videoSubtitleSourceRadius, 0, 24);
  if (typeof out.videoSubtitleTranslationRadius === "number") out.videoSubtitleTranslationRadius = clamp(out.videoSubtitleTranslationRadius, 0, 24);
  if (typeof out.videoSubtitleSourceOutline === "number") out.videoSubtitleSourceOutline = clamp(out.videoSubtitleSourceOutline, 0, 3);
  if (typeof out.videoSubtitleTranslationOutline === "number") out.videoSubtitleTranslationOutline = clamp(out.videoSubtitleTranslationOutline, 0, 3);
  for (const key of [
    "videoSubtitleSourceColor",
    "videoSubtitleTranslationColor",
    "videoSubtitleSourceBackground",
    "videoSubtitleTranslationBackground"
  ]) {
    if (Object.prototype.hasOwnProperty.call(out, key) && !/^#[0-9a-f]{6}$/i.test(String(out[key] || ""))) {
      out[key] = DEFAULT_SETTINGS[key];
    }
  }
  if (out.videoSubtitleSourceLanguage && typeof out.videoSubtitleSourceLanguage !== "string") out.videoSubtitleSourceLanguage = "auto";
  for (const key of ["videoSubtitleSourceFontFamily", "videoSubtitleTranslationFontFamily"]) {
    if (out[key] && !["system", "sans", "serif", "mono"].includes(out[key])) out[key] = "system";
  }
  if (out.videoSubtitleEngine && !["google", "gemini"].includes(out.videoSubtitleEngine)) out.videoSubtitleEngine = "google";
  if (out.videoSubtitlePosition && !["top", "bottom"].includes(out.videoSubtitlePosition)) out.videoSubtitlePosition = "bottom";
  if (out.selectionTrigger && !["icon", "instant"].includes(out.selectionTrigger)) out.selectionTrigger = "icon";
  if (Object.prototype.hasOwnProperty.call(out, "apiKey")) {
    out.apiKey = getApiKeys({ apiKey: out.apiKey }).join("\n");
  }
  if (!out.engine) out.engine = "google";
  return out;
}

function canUseLlm(settings) {
  return settings.llmProvider === "9router" || getApiKeys(settings).length > 0;
}

function getApiKeys(settings = {}) {
  return [...new Set(
    String(settings.apiKey || "")
      .split(/[\r\n,;]+/)
      .map((value) => value.trim())
      .filter(Boolean)
  )].slice(0, LLM_API_KEY_LIMIT);
}

async function getLlmKeyAttemptOrder(settings) {
  const keys = getApiKeys(settings);
  if (!keys.length) return [""];
  if (keys.length === 1) return keys;

  let releaseLock;
  const previousLock = llmKeyCursorLock;
  llmKeyCursorLock = new Promise((resolve) => {
    releaseLock = resolve;
  });

  await previousLock;
  try {
    if (!llmKeyCursorCache) {
      const stored = await chrome.storage.local.get(LLM_KEY_CURSOR_STORAGE_KEY);
      const saved = stored?.[LLM_KEY_CURSOR_STORAGE_KEY];
      llmKeyCursorCache = saved && typeof saved === "object" ? saved : {};
    }

    const provider = settings.llmProvider || "openai";
    const startIndex = Math.abs(Number(llmKeyCursorCache[provider] || 0)) % keys.length;
    llmKeyCursorCache[provider] = (startIndex + 1) % keys.length;
    await chrome.storage.local.set({ [LLM_KEY_CURSOR_STORAGE_KEY]: llmKeyCursorCache });

    return [...keys.slice(startIndex), ...keys.slice(0, startIndex)];
  } finally {
    releaseLock();
  }
}

function isRetryableLlmFailure(status, responseText = "") {
  if ([401, 403, 429, 500, 502, 503, 504].includes(Number(status))) return true;
  return /quota|rate.?limit|resource_exhausted|temporar(?:y|ily)|overloaded/i.test(responseText);
}

async function requestLlmCompletion(settings, requestBody, { stream = false } = {}) {
  const baseUrl = getLlmBaseUrl(settings);
  const providerName = getLlmProviderName(settings);
  const attemptKeys = await getLlmKeyAttemptOrder(settings);
  const failures = [];

  for (let index = 0; index < attemptKeys.length; index += 1) {
    const apiKey = attemptKeys[index];
    const hasNextKey = index < attemptKeys.length - 1;
    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({ ...requestBody, stream })
      });

      if (stream && response.ok) {
        return { response, responseText: "", baseUrl, keyAttempt: index + 1 };
      }

      const responseText = await response.text();
      if (response.ok) {
        return { response, responseText, baseUrl, keyAttempt: index + 1 };
      }

      const failure = `${providerName} error ${response.status}: ${responseText.slice(0, 300)}`;
      failures.push(failure);

      if (isRetryableLlmFailure(response.status, responseText)) {
        if (hasNextKey) continue;
        break;
      }

      throw new Error(failure);
    } catch (error) {
      const message = String(error?.message || "");
      if (message.startsWith(`${providerName} error `)) throw error;

      const failure = error?.name === "AbortError"
        ? `LLM request timed out after ${Math.round(LLM_TIMEOUT_MS / 1000)} seconds.`
        : message || getLlmConnectionError(settings, baseUrl);

      if (!failures.includes(failure)) failures.push(failure);
      if (hasNextKey) continue;
      break;
    } finally {
      clearTimeout(timeout);
    }
  }

  const lastFailure = failures.at(-1) || getLlmConnectionError(settings, baseUrl);
  if (attemptKeys.length > 1) {
    throw new Error(`All ${attemptKeys.length} ${providerName} API keys failed. ${lastFailure}`);
  }
  throw new Error(lastFailure);
}

function getLlmBaseUrl(settings) {
  if (settings.llmProvider === "9router") {
    return String(settings.llmBaseUrl || DEFAULT_SETTINGS.llmBaseUrl).replace(/\/+$/, "");
  }
  if (settings.llmProvider === "gemini") {
    return GEMINI_OPENAI_BASE_URL;
  }
  return "https://api.openai.com/v1";
}

function getLlmProviderName(settings) {
  if (settings.llmProvider === "9router") return "9Router";
  if (settings.llmProvider === "gemini") return "Gemini";
  return "OpenAI";
}

function getLlmConnectionError(settings, baseUrl) {
  if (settings.llmProvider === "9router") {
    return `Cannot reach 9Router at ${baseUrl}. Start 9Router and check its local endpoint.`;
  }
  return `Cannot reach ${getLlmProviderName(settings)} API.`;
}

function withSiteSettings(settings, urlOrOrigin) {
  const origin = safeOrigin(urlOrOrigin);
  if (!origin) return settings;
  const site = settings.siteOverrides?.[origin];
  return site ? { ...settings, ...site, origin } : { ...settings, origin };
}

function safeOrigin(value) {
  try {
    if (!value) return "";
    if (String(value).startsWith("http")) return new URL(value).origin;
    return new URL(String(value)).origin;
  } catch {
    return "";
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function transformText(payload, settings) {
  if (payload.mode === "translate") {
    return translateThenMaybeEnhance(payload, settings);
  }

  if (settings.aiEnhance && canUseLlm(settings)) {
    return callOpenAI(payload, settings);
  }

  return await demoTransform(payload, {
    ...settings,
    demoReason: "Mode này cần LLM. Bật AI enhance và khởi động 9Router để dùng thật."
  });
}

async function translateThenMaybeEnhance(payload, settings) {
  const targetCode = languageToCode(payload.targetLanguage);
  const result = await callGoogleTranslate(payload.text, "auto", targetCode);
  const warnings = ["Google Translate mặc định: nhanh, rẻ, ít delay."];
  let finalResult = result;
  let finalTone = "machine-translation";

  if (settings.aiEnhance && canUseLlm(settings)) {
    try {
      const enhanced = await callOpenAI({
        ...payload,
        mode: "enhanceTranslation",
        text: result,
        originalText: payload.text
      }, settings);
      if (enhanced?.result) {
        finalResult = enhanced.result;
        finalTone = enhanced.tone || payload.tone;
        warnings.push("AI enhance đã bật: câu được làm tự nhiên hơn sau bước dịch.");
        if (Array.isArray(enhanced.warnings)) warnings.push(...enhanced.warnings);
      }
    } catch (error) {
      warnings.push(`AI enhance không phản hồi, đang dùng bản Google Translate. ${error?.message || ""}`.trim());
    }
  } else if (settings.aiEnhance && !canUseLlm(settings)) {
    warnings.push("AI enhance đang bật nhưng nhà cung cấp AI chưa sẵn sàng hoặc chưa có API key, nên chỉ dùng Google Translate.");
  }

  let backTranslation = "";
  if (settings.showBackTranslation && finalResult) {
    try {
      backTranslation = await callGoogleTranslate(finalResult, targetCode, languageToCode(settings.backTranslationLanguage || "Vietnamese"));
    } catch {
      backTranslation = "";
    }
  }

  return {
    result: finalResult,
    backTranslation,
    warnings: warnings.slice(0, 4),
    tone: finalTone
  };
}

async function callGoogleTranslate(text, sourceCode, targetCode) {
  const translated = await callGoogleTranslateDetailed(text, sourceCode, targetCode);
  return translated.result;
}

async function callGoogleTranslateDetailed(text, sourceCode, targetCode, options = {}) {
  const sourceText = String(text || "").trim();
  if (!sourceText) return { result: "", detectedSource: "", dictionary: [], phonetic: "" };

  const source = sourceCode || "auto";
  const target = targetCode || "en";
  const dictionary = Boolean(options.dictionary);
  const cacheKey = `${dictionary ? "dict" : "text"}\u0000${source}\u0000${target}\u0000${sourceText}`;
  const cached = TRANSLATION_CACHE.get(cacheKey);
  if (cached) {
    return typeof cached === "string"
      ? { result: cached, detectedSource: source === "auto" ? "" : source }
      : cached;
  }

  const requests = [
    buildGoogleTranslateRequest(
      "https://translate.google.com/translate_a/single",
      "it",
      sourceText,
      source,
      target,
      true,
      dictionary
    ),
    buildGoogleTranslateRequest(
      "https://translate.googleapis.com/translate_a/single",
      "gtx",
      sourceText,
      source,
      target,
      false,
      dictionary
    )
  ];

  const errors = [];
  for (const requestUrl of requests) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TRANSLATION_TIMEOUT_MS);

    try {
      const response = await fetch(requestUrl, {
        method: "GET",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json = await response.json();
      const translated = parseGoogleTranslation(json);
      if (!translated.result) throw new Error("Empty translation");

      rememberTranslation(cacheKey, translated);
      return translated;
    } catch (error) {
      errors.push(error?.name === "AbortError" ? "timeout" : error?.message || String(error));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`Google Translate failed: ${errors.join(" | ")}`);
}

function buildGoogleTranslateRequest(endpoint, client, text, source, target, dictionaryJson, includeDictionary = false) {
  const url = new URL(endpoint);
  url.searchParams.set("client", client);
  url.searchParams.set("sl", source);
  url.searchParams.set("tl", target);
  url.searchParams.set("hl", target);
  url.searchParams.append("dt", "t");
  if (includeDictionary) {
    url.searchParams.append("dt", "bd");
    url.searchParams.append("dt", "rm");
  }
  if (dictionaryJson) {
    url.searchParams.set("dj", "1");
    url.searchParams.set("source", "inputbridge");
  }
  url.searchParams.set("q", text);
  return url.toString();
}

function parseGoogleTranslation(json) {
  let result = "";

  if (Array.isArray(json?.sentences)) {
    result = json.sentences
      .map((sentence) => String(sentence?.trans || ""))
      .join("")
      .trim();
  } else if (Array.isArray(json?.[0])) {
    result = json[0]
      .map((part) => Array.isArray(part) ? String(part[0] || "") : "")
      .join("")
      .trim();
  }

  return {
    result,
    detectedSource: String(json?.src || json?.[2] || "").trim(),
    dictionary: parseGoogleDictionary(json),
    phonetic: parseGooglePhonetic(json),
    headword: parseGoogleHeadword(json)
  };
}

function parseGoogleDictionary(json) {
  const groups = [];

  if (Array.isArray(json?.dict)) {
    for (const group of json.dict) {
      const entries = Array.isArray(group?.entry) ? group.entry : [];
      const meanings = uniqueStrings([
        ...entries.map((entry) => entry?.word),
        ...(Array.isArray(group?.terms) ? group.terms : [])
      ]).slice(0, 8);
      if (!meanings.length) continue;
      groups.push({
        partOfSpeech: String(group?.pos || "other").trim(),
        meanings,
        baseForm: String(group?.base_form || "").trim()
      });
    }
  } else if (Array.isArray(json?.[1])) {
    for (const group of json[1]) {
      if (!Array.isArray(group)) continue;
      const entries = Array.isArray(group[2]) ? group[2] : [];
      const meanings = uniqueStrings([
        ...(Array.isArray(group[1]) ? group[1] : []),
        ...entries.map((entry) => Array.isArray(entry) ? entry[0] : entry?.word)
      ]).slice(0, 8);
      if (!meanings.length) continue;
      groups.push({
        partOfSpeech: String(group[0] || "other").trim(),
        meanings,
        baseForm: String(group[3] || "").trim()
      });
    }
  }

  return groups.slice(0, 6);
}

function parseGooglePhonetic(json) {
  const candidates = [];
  if (Array.isArray(json?.sentences)) {
    for (const sentence of json.sentences) {
      candidates.push(sentence?.src_translit, sentence?.translit);
    }
  }
  if (Array.isArray(json?.[0])) {
    for (const part of json[0]) {
      if (!Array.isArray(part)) continue;
      candidates.push(part[3], part[2]);
    }
  }
  candidates.push(json?.src_translit, json?.spell?.spell_res);
  return uniqueStrings(candidates)[0] || "";
}

function parseGoogleHeadword(json) {
  if (Array.isArray(json?.dict)) {
    const base = json.dict.find((group) => group?.base_form)?.base_form;
    if (base) return String(base).trim();
  }
  if (Array.isArray(json?.[1])) {
    const base = json[1].find((group) => Array.isArray(group) && group[3])?.[3];
    if (base) return String(base).trim();
  }
  return "";
}

function uniqueStrings(values) {
  return [...new Set((values || [])
    .map((value) => String(value || "").trim())
    .filter(Boolean))];
}

function isDictionaryCandidate(text) {
  const value = String(text || "").trim();
  if (!value || value.length > 64 || /\s/u.test(value)) return false;
  return /^[\p{L}\p{M}]+(?:['’.-][\p{L}\p{M}]+)*$/u.test(value);
}

function rememberTranslation(key, value) {
  if (TRANSLATION_CACHE.size >= TRANSLATION_CACHE_LIMIT) {
    const oldestKey = TRANSLATION_CACHE.keys().next().value;
    if (oldestKey !== undefined) TRANSLATION_CACHE.delete(oldestKey);
  }
  TRANSLATION_CACHE.set(key, value);
}

function languageToCode(language) {
  return LANGUAGE_CATALOG?.codeFor(language, "en") || "en";
}

function sameLanguageCode(first, second) {
  const left = String(first || "").trim().toLowerCase().replace(/_/g, "-");
  const right = String(second || "").trim().toLowerCase().replace(/_/g, "-");
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.startsWith("zh") || right.startsWith("zh")) return false;
  return left.split("-")[0] === right.split("-")[0];
}

function languageNameFromCode(code, fallback = "Auto") {
  return LANGUAGE_CATALOG?.nameFor(code, fallback) || fallback;
}

async function demoTransform(payload, settings) {
  const modeLabel = {
    translate: `Send as ${payload.targetLanguage}`,
    check: "Check",
    polish: "Polish",
    academic: "Academic",
    friendly: "Friendly",
    simplify: "Simplify",
    detailed: "More detailed",
    enhanceTranslation: "AI enhance"
  }[payload.mode] || "Transform";

  const targetCode = languageToCode(payload.targetLanguage);
  let translatedText = payload.text;
  const preserveInputLanguage = /^same language/i.test(String(payload.targetLanguage || ""));
  if (!preserveInputLanguage && ["check", "polish", "academic", "friendly", "simplify", "detailed", "enhanceTranslation"].includes(payload.mode)) {
    try {
      translatedText = await callGoogleTranslate(payload.text, "auto", targetCode);
    } catch (e) {
      console.error("Demo translation failed", e);
    }
  }

  let result = translatedText;
  if (payload.mode === "translate") {
    result = `[Demo ${payload.targetLanguage}] ${payload.text}`;
  } else if (payload.mode === "polish") {
    result = translatedText
      .replace(/\s+/g, " ")
      .replace(/^./, (c) => c.toUpperCase());
  } else if (payload.mode === "check" || payload.mode === "academic" || payload.mode === "friendly") {
    result = translatedText.replace(/\s+/g, " ").replace(/^./, (c) => c.toUpperCase());
  } else if (payload.mode === "simplify") {
    result = translatedText.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/)[0];
  } else if (payload.mode === "detailed") {
    result = translatedText.replace(/\s+/g, " ");
  } else if (payload.mode === "enhanceTranslation") {
    result = translatedText.replace(/\s+/g, " ");
  }

  return {
    result,
    backTranslation: settings.showBackTranslation ? `[Demo nghĩa ngược] ${payload.originalText || payload.text}` : "",
    warnings: [settings.demoReason || `Demo mode đang bật.`, `${modeLabel} · tone: ${payload.tone}`],
    tone: payload.tone
  };
}

async function callOpenAI(payload, settings) {
  const systemPrompt = getLlmSystemPrompt(payload.mode);
  const userPrompt = getLlmUserPrompt(payload);

  const { responseText } = await requestLlmCompletion(settings, {
    model: settings.model || DEFAULT_SETTINGS.model,
    temperature: 0.2,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  });

  let json;
  try {
    json = JSON.parse(responseText);
  } catch {
    throw new Error("LLM returned an invalid JSON response.");
  }
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI response is empty");

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = { result: content, backTranslation: "", warnings: ["AI returned non-JSON content."], tone: payload.tone };
  }

  return {
    result: String(parsed.result || "").trim(),
    backTranslation: String(parsed.backTranslation || "").trim(),
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String).slice(0, 3) : [],
    tone: String(parsed.tone || payload.tone)
  };
}

function getLlmSystemPrompt(mode) {
  const isExplain = mode === "explainSelection";
  return isExplain
    ? `You are InputBridge's language tutor. Explain selected text clearly and briefly.
Return JSON only with this exact shape:
{
  "result": "...",
  "backTranslation": "",
  "warnings": [],
  "tone": "clear"
}

Rules:
- Explain meaning, tone, idioms, and important grammar only when useful.
- Use the requested explanation language.
- Do not invent context or facts.
- Keep the explanation compact and easy to scan.`
    : `You are InputBridge, an AI writing layer for live web input.
Return JSON only with this exact shape:
{
  "result": "...",
  "backTranslation": "",
  "warnings": [],
  "tone": "..."
}

Rules:
- Preserve the user's meaning.
- Do not add facts, promises, dates, names, or claims not present in the source.
- Keep names, links, code, product names, emails, and numbers unchanged.
- Make the result natural for a native speaker.
- If the text is ambiguous or could sound rude, add a short warning.
- Keep the result concise unless clarity requires more detail.`;
}

function getLlmUserPrompt(payload) {
  const isEnhance = payload.mode === "enhanceTranslation";
  const isExplain = payload.mode === "explainSelection";
  return isExplain
    ? `Explain this selected text in ${payload.targetLanguage}.

Selected text:
${payload.text}

Machine translation:
${payload.translation || ""}

Page context: ${payload.contextHint}`
    : isEnhance
      ? `Task: Improve this machine translation so it sounds natural.
Original user intent:
${payload.originalText || ""}

Machine translation:
${payload.text}

Output language: ${payload.targetLanguage}
Tone: ${payload.tone}
Context: ${payload.contextHint}
Meaning lock: ON`
      : `Mode: ${payload.mode}
Output language: ${payload.targetLanguage}
Tone: ${payload.tone}
Context: ${payload.contextHint}
Source text:
${payload.text}

Mode guidance:
- check: correct grammar, spelling, and punctuation only; preserve phrasing where possible.
- polish: improve fluency and clarity while preserving meaning.
- academic: use clear, formal academic language without adding claims or facts.
- friendly: use warm, approachable conversational language.
- simplify: make it easier to read without losing essential information.
- detailed: add useful explanatory detail without inventing facts.`;
}

function extractPartialString(json, key) {
  const keyPattern = new RegExp(`"${key}"\\s*:\\s*"`);
  const match = json.match(keyPattern);
  if (!match) return "";

  const startIdx = match.index + match[0].length;
  let result = "";
  let escaped = false;
  for (let i = startIdx; i < json.length; i++) {
    const char = json[i];
    if (escaped) {
      if (char === "n") result += "\n";
      else if (char === "t") result += "\t";
      else if (char === "r") result += "\r";
      else result += char;
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === '"') {
      return result;
    } else {
      result += char;
    }
  }
  return result;
}

async function streamOpenAI(payload, settings, onData) {
  const systemPrompt = getLlmSystemPrompt(payload.mode);
  const userPrompt = getLlmUserPrompt(payload);

  const { response } = await requestLlmCompletion(settings, {
    model: settings.model || DEFAULT_SETTINGS.model,
    temperature: 0.2,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  }, { stream: true });

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const dataStr = trimmed.slice(6).trim();
      if (dataStr === "[DONE]") continue;

      try {
        const parsed = JSON.parse(dataStr);
        const delta = parsed.choices?.[0]?.delta?.content || "";
        if (delta) {
          fullContent += delta;
          const partialResult = extractPartialString(fullContent, "result");
          onData({
            result: partialResult || fullContent,
            backTranslation: "",
            warnings: [],
            tone: payload.tone,
            done: false
          });
        }
      } catch (err) {
        // Ignore chunk JSON parse errors
      }
    }
  }

  let finalResult = "";
  let finalBackTranslation = "";
  let finalWarnings = [];
  let finalTone = payload.tone;

  try {
    const finalJson = JSON.parse(fullContent.trim());
    finalResult = String(finalJson.result || "");
    finalBackTranslation = String(finalJson.backTranslation || "");
    if (Array.isArray(finalJson.warnings)) finalWarnings = finalJson.warnings;
    if (finalJson.tone) finalTone = finalJson.tone;
  } catch {
    finalResult = extractPartialString(fullContent, "result") || fullContent.trim();
    finalBackTranslation = extractPartialString(fullContent, "backTranslation");
    if (finalResult.startsWith("{") || finalResult.endsWith("}")) {
      finalResult = finalResult.replace(/^\{|^\s*|^\s*"result"\s*:\s*"/, "").replace(/"\s*\}$/, "");
    }
  }

  if (settings.showBackTranslation && finalResult && !finalBackTranslation) {
    const targetCode = languageToCode(payload.targetLanguage || settings.targetLanguage);
    try {
      finalBackTranslation = await callGoogleTranslate(
        finalResult,
        targetCode,
        languageToCode(settings.backTranslationLanguage || "Vietnamese")
      );
    } catch {
      finalBackTranslation = "";
    }
  }

  onData({
    result: finalResult,
    backTranslation: finalBackTranslation,
    warnings: finalWarnings,
    tone: finalTone,
    done: true
  });
}

async function streamTranslateThenEnhance(payload, settings, onData) {
  const targetCode = languageToCode(payload.targetLanguage);
  const result = await callGoogleTranslate(payload.text, "auto", targetCode);
  const warnings = ["Google Translate mặc định: nhanh, rẻ, ít delay."];
  let finalResult = result;
  let finalTone = "machine-translation";

  onData({
    result: finalResult,
    backTranslation: "",
    warnings: [...warnings],
    tone: finalTone,
    done: !(settings.aiEnhance && canUseLlm(settings))
  });

  if (settings.aiEnhance && canUseLlm(settings)) {
    const enhancePayload = {
      ...payload,
      mode: "enhanceTranslation",
      text: result,
      originalText: payload.text
    };
    const publishEnhanced = (enhanced) => {
      onData({
        result: enhanced.result,
        backTranslation: enhanced.backTranslation,
        warnings: [...warnings, "AI enhance đã bật: câu được làm tự nhiên hơn sau bước dịch.", ...(enhanced.warnings || [])],
        tone: enhanced.tone || payload.tone,
        done: enhanced.done
      });
    };

    if (settings.llmProvider === "9router") {
      try {
        const enhanced = await callOpenAI(enhancePayload, settings);
        publishEnhanced({ ...enhanced, done: true });
      } catch (error) {
        onData({
          result: finalResult,
          backTranslation: "",
          warnings: [...warnings, `9Router không phản hồi; đang giữ kết quả Google Translate. ${error?.message || ""}`.trim()],
          tone: finalTone,
          done: true
        });
      }
    } else {
      await streamOpenAI(enhancePayload, settings, publishEnhanced);
    }
  } else if (settings.aiEnhance && !canUseLlm(settings)) {
    onData({
      result: finalResult,
      backTranslation: "",
      warnings: [...warnings, "AI enhance đang bật nhưng nhà cung cấp AI chưa sẵn sàng hoặc chưa có API key, nên chỉ dùng Google Translate."],
      tone: finalTone,
      done: true
    });
  }
}

async function streamTransform(payload, settings, onData) {
  if (payload.mode === "translate") {
    return streamTranslateThenEnhance(payload, settings, onData);
  }

  if (settings.aiEnhance && canUseLlm(settings)) {
    // MiMo via 9Router may return a single SSE event even with stream=true,
    // leaving the content-script preview waiting for a final delta. Use the
    // regular OpenAI-compatible JSON response for this provider instead.
    if (settings.llmProvider === "9router") {
      const data = await callOpenAI(payload, settings);
      onData({ ...data, done: true });
      return;
    }
    return streamOpenAI(payload, settings, onData);
  }

  const demoData = await demoTransform(payload, {
    ...settings,
    demoReason: "Mode này cần LLM. Bật AI enhance và khởi động 9Router để dùng thật."
  });
  onData({ ...demoData, done: true });
}
