import "./languages.js";

const LANGUAGE_CATALOG = globalThis.InputBridgeLanguageCatalog;

const DEFAULT_SETTINGS = {
  settingsVersion: 7,
  enabled: true,
  demoMode: false,
  engine: "google",
  aiEnhance: false,
  apiKey: "",
  model: "gpt-4o-mini",
  sourceLanguage: "Auto detect",
  targetLanguage: "English",
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

const TRANSLATION_CACHE = new Map();
const TRANSLATION_CACHE_LIMIT = 300;
const TRANSLATION_TIMEOUT_MS = 8000;

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

  if (message.type === "IB_EXPLAIN_SELECTION") {
    const settings = withSiteSettings(await getSettings(), message.origin || sender?.tab?.url);
    if (!settings.enabled || !settings.selectionTranslation) {
      return { ok: false, error: "Selection translation is disabled here." };
    }
    if (!settings.apiKey) {
      return { ok: false, error: "Add an OpenAI API key in InputBridge settings to use AI explanation." };
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
      return { ok: true, data: demoTransform(payload, settings), demo: true };
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
    selectionCardTheme: stored.selectionCardTheme || "light"
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
  if (out.selectionTrigger && !["icon", "instant"].includes(out.selectionTrigger)) out.selectionTrigger = "icon";
  if (!out.engine) out.engine = "google";
  return out;
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

  if (settings.aiEnhance && settings.apiKey) {
    return callOpenAI(payload, settings);
  }

  return demoTransform(payload, {
    ...settings,
    demoReason: "Mode này cần LLM. Bật AI enhance và nhập API key để dùng thật."
  });
}

async function translateThenMaybeEnhance(payload, settings) {
  const targetCode = languageToCode(payload.targetLanguage);
  const result = await callGoogleTranslate(payload.text, "auto", targetCode);
  const warnings = ["Google Translate mặc định: nhanh, rẻ, ít delay."];
  let finalResult = result;
  let finalTone = "machine-translation";

  if (settings.aiEnhance && settings.apiKey) {
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
  } else if (settings.aiEnhance && !settings.apiKey) {
    warnings.push("AI enhance đang bật nhưng chưa có API key, nên chỉ dùng Google Translate.");
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

function demoTransform(payload, settings) {
  const modeLabel = {
    translate: `Send as ${payload.targetLanguage}`,
    polish: "Polish",
    clarify: "Clarify",
    enhanceTranslation: "AI enhance"
  }[payload.mode] || "Transform";

  let result = payload.text;
  if (payload.mode === "translate") {
    result = `[Demo ${payload.targetLanguage}] ${payload.text}`;
  } else if (payload.mode === "polish") {
    result = payload.text
      .replace(/\s+/g, " ")
      .replace(/^./, (c) => c.toUpperCase());
  } else if (payload.mode === "clarify") {
    result = `Ý chính: ${payload.text.replace(/\s+/g, " ")}`;
  } else if (payload.mode === "enhanceTranslation") {
    result = payload.text.replace(/\s+/g, " ");
  }

  return {
    result,
    backTranslation: settings.showBackTranslation ? `[Demo nghĩa ngược] ${payload.originalText || payload.text}` : "",
    warnings: [settings.demoReason || `Demo mode đang bật.`, `${modeLabel} · tone: ${payload.tone}`],
    tone: payload.tone
  };
}

async function callOpenAI(payload, settings) {
  const isEnhance = payload.mode === "enhanceTranslation";
  const isExplain = payload.mode === "explainSelection";
  const systemPrompt = isExplain
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

  const userPrompt = isExplain
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
${payload.text}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model || DEFAULT_SETTINGS.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenAI error ${response.status}: ${text.slice(0, 300)}`);
  }

  const json = await response.json();
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
