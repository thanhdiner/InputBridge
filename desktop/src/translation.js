const TRANSLATION_TIMEOUT_MS = 9000;
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

async function translateDetailed(text, sourceCode, targetCode) {
  const sourceText = String(text || "").trim();
  const cacheKey = `${sourceCode}\u0000${targetCode}\u0000${sourceText}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const requests = [
    buildRequest("https://translate.google.com/translate_a/single", "it", sourceText, sourceCode, targetCode, true),
    buildRequest("https://translate.googleapis.com/translate_a/single", "gtx", sourceText, sourceCode, targetCode, false)
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

function buildRequest(endpoint, client, text, source, target, jsonMode) {
  const url = new URL(endpoint);
  url.searchParams.set("client", client);
  url.searchParams.set("sl", source || "auto");
  url.searchParams.set("tl", target || "vi");
  url.searchParams.set("hl", target || "vi");
  url.searchParams.append("dt", "t");
  if (jsonMode) {
    url.searchParams.set("dj", "1");
    url.searchParams.set("source", "inputbridge-desktop");
  }
  url.searchParams.set("q", text);
  return url.toString();
}

function parseGoogleResponse(json) {
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
    throw new Error("OCR không nhận được block chữ nào trong vùng đã chọn.");
  }

  const composite = normalized
    .map((block, index) => `[[[IB_BLOCK_${index}]]]\n${block.text}`)
    .join("\n");
  const translated = await translateText(composite, options);
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

  const fallback = await translateBlocksIndividually(normalized, options);
  return {
    ...translated,
    blocks: fallback
  };
}

function parseTranslatedBlocks(text, expectedCount) {
  const source = String(text || "");
  const marker = /\[\s*\[\s*\[\s*IB[_\s-]*BLOCK[_\s-]*(\d+)\s*\]\s*\]\s*\]/gi;
  const matches = Array.from(source.matchAll(marker));
  if (matches.length < expectedCount) return null;

  const output = new Array(expectedCount).fill("");
  for (let index = 0; index < matches.length; index += 1) {
    const blockIndex = Number(matches[index][1]);
    if (!Number.isInteger(blockIndex) || blockIndex < 0 || blockIndex >= expectedCount) continue;
    const start = Number(matches[index].index || 0) + matches[index][0].length;
    const end = index + 1 < matches.length ? Number(matches[index + 1].index || source.length) : source.length;
    output[blockIndex] = source.slice(start, end).trim();
  }
  return output.every(Boolean) ? output : null;
}

async function translateBlocksIndividually(blocks, options) {
  const output = new Array(blocks.length);
  let cursor = 0;
  const workers = Math.min(4, blocks.length);

  async function worker() {
    while (cursor < blocks.length) {
      const index = cursor++;
      const translated = await translateText(blocks[index].text, options);
      output[index] = {
        id: blocks[index].id,
        original: blocks[index].text,
        translation: translated.result
      };
    }
  }

  await Promise.all(Array.from({ length: workers }, worker));
  return output;
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
