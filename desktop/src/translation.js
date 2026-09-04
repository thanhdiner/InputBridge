const TRANSLATION_TIMEOUT_MS = 20000;
const MAX_TEXT_CHARS = 20000;
const CHUNK_CHARS = 4000;
const CHUNK_WORKERS = 2;
const CACHE_LIMIT = 300;
const cache = new Map();

function codeFor(value, fallback = "en") {
  return globalThis.InputBridgeLanguageCatalog?.codeFor(value, fallback) || fallback;
}

function nameFor(value, fallback = "Auto") {
  return globalThis.InputBridgeLanguageCatalog?.nameFor(value, fallback) || fallback;
}

async function translateText(text, options = {}) {
  const sourceText = String(text || "").trim();
  if (!sourceText) throw new Error("OCR không nhận được chữ nào trong vùng đã chọn.");
  if (sourceText.length > MAX_TEXT_CHARS) {
    throw new Error(`Văn bản OCR dài hơn ${MAX_TEXT_CHARS.toLocaleString("vi-VN")} ký tự.`);
  }

  const sourceCode = codeFor(options.sourceLanguage || "auto", "auto");
  const targetCode = codeFor(options.targetLanguage || "Vietnamese", "vi");
  const translated = sourceText.length <= CHUNK_CHARS
    ? await translateDetailed(sourceText, sourceCode, targetCode)
    : await translateChunked(sourceText, sourceCode, targetCode);

  return {
    original: sourceText,
    result: translated.result,
    detectedSourceCode: translated.detectedSource || sourceCode,
    detectedSourceLanguage: nameFor(translated.detectedSource || sourceCode, "Auto"),
    targetCode,
    targetLanguage: nameFor(targetCode, options.targetLanguage || "Vietnamese"),
    chunkCount: translated.chunkCount || 1
  };
}

async function translateChunked(text, sourceCode, targetCode) {
  const chunks = splitChunks(text, CHUNK_CHARS);
  const results = new Array(chunks.length);
  const first = await translateDetailed(chunks[0].text, sourceCode, targetCode);
  results[0] = first.result;
  const stableSource = sourceCode === "auto" && first.detectedSource
    ? first.detectedSource
    : sourceCode;
  let cursor = 1;

  async function worker() {
    while (cursor < chunks.length) {
      const index = cursor++;
      const translated = await translateDetailed(chunks[index].text, stableSource || "auto", targetCode);
      results[index] = translated.result;
    }
  }

  await Promise.all(Array.from({ length: Math.min(CHUNK_WORKERS, chunks.length - 1) }, worker));
  return {
    result: chunks.map((chunk, index) => `${chunk.prefix}${results[index] || ""}${chunk.suffix}`).join(""),
    detectedSource: first.detectedSource || stableSource,
    chunkCount: chunks.length
  };
}

const BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

async function translateDetailed(text, sourceCode, targetCode) {
  const sourceText = String(text || "").trim();
  const cacheKey = `${sourceCode}\u0000${targetCode}\u0000${sourceText}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const endpoints = [
    `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${encodeURIComponent(sourceCode || "auto")}&tl=${encodeURIComponent(targetCode || "vi")}&q=${encodeURIComponent(sourceText)}`,
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceCode || "auto")}&tl=${encodeURIComponent(targetCode || "vi")}&dt=t&q=${encodeURIComponent(sourceText)}`
  ];
  const errors = [];

  for (const requestUrl of endpoints) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TRANSLATION_TIMEOUT_MS);
    try {
      const response = await fetch(requestUrl, {
        method: "GET",
        headers: {
          "User-Agent": BROWSER_USER_AGENT,
          "Accept": "*/*"
        },
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      const parsed = parseGoogleResponse(json);
      if (!parsed.result) throw new Error("Google trả về kết quả rỗng.");
      remember(cacheKey, parsed);
      return parsed;
    } catch (error) {
      errors.push(error?.name === "AbortError" ? "timeout" : error?.message || String(error));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`Google Translate lỗi: ${errors.join(" | ")}`);
}

function parseGoogleResponse(json) {
  if (Array.isArray(json?.[0]) && typeof json[0][0] === "string") {
    return {
      result: String(json[0][0] || "").trim(),
      detectedSource: String(json[0][1] || "").trim()
    };
  }
  let result = "";
  if (Array.isArray(json?.sentences)) {
    result = json.sentences.map((sentence) => String(sentence?.trans || "")).join("").trim();
  } else if (Array.isArray(json?.[0])) {
    result = json[0].map((part) => Array.isArray(part) ? String(part[0] || "") : "").join("").trim();
  }
  return {
    result,
    detectedSource: String(json?.src || json?.[2] || "").trim()
  };
}

function splitChunks(text, maxChars) {
  const source = String(text || "");
  const chunks = [];
  let cursor = 0;
  while (cursor < source.length) {
    const end = chooseChunkEnd(source, cursor, maxChars);
    const raw = source.slice(cursor, end);
    const prefix = raw.match(/^\s*/u)?.[0] || "";
    const suffix = raw.match(/\s*$/u)?.[0] || "";
    const bodyEnd = Math.max(prefix.length, raw.length - suffix.length);
    const body = raw.slice(prefix.length, bodyEnd);
    if (body) chunks.push({ text: body, prefix, suffix });
    else if (chunks.length) chunks[chunks.length - 1].suffix += raw;
    cursor = end > cursor ? end : Math.min(source.length, cursor + maxChars);
  }
  return chunks;
}

function chooseChunkEnd(text, start, maxChars) {
  const hardEnd = Math.min(text.length, start + maxChars);
  if (hardEnd >= text.length) return text.length;
  const windowText = text.slice(start, hardEnd);
  const minimumBoundary = Math.floor(maxChars * 0.55);
  const paragraph = windowText.lastIndexOf("\n\n");
  if (paragraph >= minimumBoundary) return start + paragraph + 2;
  const line = windowText.lastIndexOf("\n");
  if (line >= minimumBoundary) return start + line + 1;
  let sentence = -1;
  for (const match of windowText.matchAll(/[.!?。！？…](?:["'”’)}\]»]+)?\s+/gu)) {
    const candidate = Number(match.index || 0) + match[0].length;
    if (candidate >= minimumBoundary) sentence = candidate;
  }
  if (sentence >= minimumBoundary) return start + sentence;
  const word = Math.max(windowText.lastIndexOf(" "), windowText.lastIndexOf("\t"));
  if (word >= minimumBoundary) return start + word + 1;
  return hardEnd;
}

async function translateBlocks(blocks, options = {}) {
  const normalized = (Array.isArray(blocks) ? blocks : [])
    .map((block, index) => ({
      id: String(block?.id ?? index),
      text: String(block?.text || "").trim()
    }))
    .filter((block) => block.text);

  if (!normalized.length) {
    return {
      original: "",
      result: "",
      detectedSourceLanguage: "Auto",
      targetLanguage: options.targetLanguage || "Vietnamese",
      blocks: []
    };
  }

  const composite = normalized
    .map((block, index) => `[[[IB_BLOCK_${index}]]]\n${block.text}`)
    .join("\n\n");

  let translated;
  try {
    translated = await translateText(composite, options);
  } catch (err) {
    try {
      const plainComposite = normalized.map((b) => b.text).join("\n");
      translated = await translateText(plainComposite, options);
      const lines = translated.result.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      return {
        ...translated,
        blocks: normalized.map((block, index) => ({
          id: block.id,
          original: block.text,
          translation: lines[index] || block.text
        }))
      };
    } catch {
      return {
        original: normalized.map((b) => b.text).join("\n"),
        result: normalized.map((b) => b.text).join("\n"),
        detectedSourceLanguage: "Auto",
        targetLanguage: options.targetLanguage || "Vietnamese",
        blocks: normalized.map((block) => ({
          id: block.id,
          original: block.text,
          translation: block.text
        }))
      };
    }
  }

  const parsed = parseTranslatedBlocks(translated.result, normalized.length);
  if (parsed) {
    return {
      ...translated,
      blocks: normalized.map((block, index) => ({
        id: block.id,
        original: block.text,
        translation: parsed[index] || block.text
      }))
    };
  }

  const lines = translated.result
    .replace(/\[{1,3}\s*(?:IB[_\s-]*)?BLOCK[_\s-]*\d+\s*\]{1,3}/gi, "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    ...translated,
    blocks: normalized.map((block, index) => ({
      id: block.id,
      original: block.text,
      translation: lines[index] || block.text
    }))
  };
}

function parseTranslatedBlocks(text, expectedCount) {
  const source = String(text || "");
  const marker = /\[{1,3}\s*(?:IB[_\s-]*)?BLOCK[_\s-]*(\d+)\s*\]{1,3}/gi;
  const matches = Array.from(source.matchAll(marker));
  if (!matches.length) return null;

  const output = new Array(expectedCount).fill("");
  for (let index = 0; index < matches.length; index += 1) {
    const blockIndex = Number(matches[index][1]);
    if (!Number.isInteger(blockIndex) || blockIndex < 0 || blockIndex >= expectedCount) continue;
    const start = Number(matches[index].index || 0) + matches[index][0].length;
    const end = index + 1 < matches.length ? Number(matches[index + 1].index || source.length) : source.length;
    const chunk = source.slice(start, end).trim();
    if (chunk) output[blockIndex] = chunk;
  }

  const filledCount = output.filter(Boolean).length;
  if (filledCount >= Math.max(1, Math.floor(expectedCount * 0.4))) {
    return output;
  }
  return null;
}

function remember(key, value) {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

module.exports = {
  translateText,
  translateBlocks,
  MAX_TEXT_CHARS
};
