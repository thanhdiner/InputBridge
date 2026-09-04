const http = require("node:http");
const crypto = require("node:crypto");
const WebSocket = require("ws");

const EDGE_TTS_PORT = 38765;
const EDGE_TTS_HOST = "127.0.0.1";
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const EDGE_EXTENSION_ORIGIN = "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold";
const EDGE_VERSION = "1-143.0.3650.75";
const VOICE_LIST_URL = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`;
const SYNTHESIS_URL = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const MAX_BODY_BYTES = 32 * 1024;
const MAX_TEXT_CHARS = 1200;
const REQUEST_TIMEOUT_MS = 15000;
const VOICE_REQUEST_TIMEOUT_MS = 8000;
const TRANSIENT_CLOSE_RETRY_LIMIT = 1;
const VOICE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let voiceCache = null;
let voiceCacheAt = 0;
let voiceRequest = null;

function json(res, statusCode, payload, origin = "") {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    ...corsHeaders(origin)
  });
  res.end(body);
}

function corsHeaders(origin = "") {
  const allowedOrigin = String(origin || "").startsWith("chrome-extension://")
    ? origin
    : "chrome-extension://*";
  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
    vary: "Origin"
  };
}

function normalizeLocale(value, fallback = "vi-VN") {
  const raw = String(value || "").trim();
  if (globalThis.InputBridgeLanguageCatalog?.codeFor) {
    const code = globalThis.InputBridgeLanguageCatalog.codeFor(raw, "");
    if (code) {
      if (code === "vi") return "vi-VN";
      if (code === "en") return "en-US";
      if (code === "zh-CN") return "zh-CN";
      if (code === "zh-TW") return "zh-TW";
      if (code === "ja") return "ja-JP";
      if (code === "ko") return "ko-KR";
      return code;
    }
  }
  const locale = raw.replace(/_/g, "-");
  if (/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/i.test(locale)) {
    if (locale.toLowerCase() === "vi") return "vi-VN";
    if (locale.toLowerCase() === "en") return "en-US";
    return locale;
  }
  if (/vietnamese|tiếng việt|việt/i.test(raw)) return "vi-VN";
  if (/english|tiếng anh|anh/i.test(raw)) return "en-US";
  if (/japanese|tiếng nhật|nhật/i.test(raw)) return "ja-JP";
  if (/chinese|tiếng trung|trung/i.test(raw)) return "zh-CN";
  if (/korean|tiếng hàn|hàn/i.test(raw)) return "ko-KR";
  return fallback;
}

function normalizeVoice(raw) {
  if (!raw?.ShortName || !raw?.Locale) return null;
  return {
    name: String(raw.ShortName),
    locale: String(raw.Locale),
    gender: String(raw.Gender || "Unknown"),
    friendlyName: String(raw.FriendlyName || raw.LocalName || raw.ShortName),
    localName: String(raw.LocalName || raw.FriendlyName || raw.ShortName),
    suggestedCodec: String(raw.SuggestedCodec || "audio-24khz-48kbitrate-mono-mp3")
  };
}

async function getVoices({ force = false } = {}) {
  if (!force && voiceCache && Date.now() - voiceCacheAt < VOICE_CACHE_TTL_MS) return voiceCache;
  if (voiceRequest) return voiceRequest;
  const request = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VOICE_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(VOICE_LIST_URL, {
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0"
        }
      });
      if (!response.ok) throw new Error(`Edge voice list HTTP ${response.status}`);
      const data = await response.json();
      voiceCache = Array.isArray(data) ? data.map(normalizeVoice).filter(Boolean) : [];
      voiceCacheAt = Date.now();
      return voiceCache;
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("Edge voice list timed out");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  })();
  voiceRequest = request;
  try {
    return await request;
  } finally {
    if (voiceRequest === request) voiceRequest = null;
  }
}

function voicesForLocale(voices, locale) {
  const wanted = normalizeLocale(locale).toLowerCase();
  const base = wanted.split("-")[0];
  return voices
    .filter((voice) => {
      const candidate = voice.locale.toLowerCase();
      return candidate === wanted || candidate.split("-")[0] === base;
    })
    .sort((left, right) => {
      const leftExact = left.locale.toLowerCase() === wanted ? 1 : 0;
      const rightExact = right.locale.toLowerCase() === wanted ? 1 : 0;
      if (leftExact !== rightExact) return rightExact - leftExact;
      const leftNeural = /neural$/i.test(left.name) ? 1 : 0;
      const rightNeural = /neural$/i.test(right.name) ? 1 : 0;
      if (leftNeural !== rightNeural) return rightNeural - leftNeural;
      return left.name.localeCompare(right.name);
    });
}

function selectVoice(voices, locale, requestedVoice = "") {
  const requested = String(requestedVoice || "").trim();
  if (requested) {
    const exact = voices.find((voice) => voice.name === requested);
    if (exact) return exact;
    throw new Error(`Edge TTS voice is unavailable: ${requested}`);
  }
  const candidates = voicesForLocale(voices, locale);
  if (!candidates.length) throw new Error(`Edge TTS has no voice for ${locale}`);
  return candidates.find((voice) => voice.gender.toLowerCase() === "female") || candidates[0];
}

function makeSecMsGec() {
  const windowsEpochSeconds = 11644473600;
  const roundedSeconds = Math.floor(((Date.now() / 1000) + windowsEpochSeconds) / 300) * 300;
  const ticks = String(Math.floor(roundedSeconds * 10_000_000));
  return crypto.createHash("sha256").update(ticks + TRUSTED_CLIENT_TOKEN).digest("hex").toUpperCase();
}

function requestId() {
  return crypto.randomUUID().replace(/-/g, "");
}

function edgeTimestamp() {
  return new Date().toString();
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function formatPercent(value) {
  const number = Math.round(clampNumber(value, -100, 100, 0));
  return `${number >= 0 ? "+" : ""}${number}%`;
}

function formatPitch(value) {
  const number = Math.round(clampNumber(value, -100, 100, 0));
  return `${number >= 0 ? "+" : ""}${number}Hz`;
}

function buildSpeechConfig(timestamp) {
  const payload = {
    context: {
      synthesis: {
        audio: {
          metadataoptions: {
            sentenceBoundaryEnabled: "false",
            wordBoundaryEnabled: "false"
          },
          outputFormat: "audio-24khz-48kbitrate-mono-mp3"
        }
      }
    }
  };
  return `X-Timestamp:${timestamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${JSON.stringify(payload)}`;
}

function buildSsmlMessage({ text, voice, locale, rate = 0, pitch = 0, volume = 0 }, timestamp) {
  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${escapeXml(locale)}'><voice name='${escapeXml(voice)}'><prosody pitch='${formatPitch(pitch)}' rate='${formatPercent(rate)}' volume='${formatPercent(volume)}'>${escapeXml(text)}</prosody></voice></speak>`;
  return `X-RequestId:${requestId()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${timestamp}\r\nPath:ssml\r\n\r\n${ssml}`;
}

function parsePath(message) {
  return /(?:^|\r?\n)Path:([^\r\n]+)/i.exec(String(message || ""))?.[1]?.trim().toLowerCase() || "";
}

function parseAudioFrame(data) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (buffer.length < 3) return null;
  const headerLength = buffer.readUInt16BE(0);
  const payloadStart = 2 + headerLength;
  if (payloadStart >= buffer.length) return null;
  const header = buffer.subarray(2, payloadStart).toString("utf8");
  if (!/Path:audio/i.test(header)) return null;
  return buffer.subarray(payloadStart);
}

function createEdgeTtsAbortError() {
  const error = new Error("Edge TTS request was cancelled");
  error.name = "AbortError";
  return error;
}

async function synthesizeEdgeTts({ text, locale, voice, rate = 0, pitch = 0, volume = 0 }, { signal } = {}) {
  const cleanText = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleanText) throw new Error("Empty Edge TTS text");
  if (cleanText.length > MAX_TEXT_CHARS) throw new Error(`Edge TTS text exceeds ${MAX_TEXT_CHARS} characters`);
  if (signal?.aborted) throw createEdgeTtsAbortError();

  const normalizedLocale = normalizeLocale(locale);
  const voices = await getVoices();
  if (signal?.aborted) throw createEdgeTtsAbortError();
  const selectedVoice = selectVoice(voices, normalizedLocale, voice);
  const deadline = Date.now() + REQUEST_TIMEOUT_MS;
  let audio = null;
  for (let attempt = 0; attempt <= TRANSIENT_CLOSE_RETRY_LIMIT; attempt += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new Error("Edge TTS timed out");
    const connectionId = requestId();
    const params = new URLSearchParams({
      TrustedClientToken: TRUSTED_CLIENT_TOKEN,
      "Sec-MS-GEC": makeSecMsGec(),
      "Sec-MS-GEC-Version": EDGE_VERSION,
      ConnectionId: connectionId
    });
    const url = `${SYNTHESIS_URL}?${params}`;
    const timestamp = edgeTimestamp();

    try {
      audio = await new Promise((resolve, reject) => {
        const chunks = [];
        let settled = false;
        let socket = null;
        let timeout = 0;
        const onAbort = () => finish(createEdgeTtsAbortError());
        const finish = (error, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          signal?.removeEventListener("abort", onAbort);
          try {
            if (error) socket?.terminate();
            else socket?.close();
          } catch {}
          if (error) reject(error);
          else resolve(value);
        };
        if (signal?.aborted) {
          finish(createEdgeTtsAbortError());
          return;
        }
        signal?.addEventListener("abort", onAbort, { once: true });
        timeout = setTimeout(() => finish(new Error("Edge TTS timed out")), remainingMs);
        socket = new WebSocket(url, {
          headers: {
            Origin: EDGE_EXTENSION_ORIGIN,
            Pragma: "no-cache",
            "Cache-Control": "no-cache",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0"
          },
          handshakeTimeout: Math.min(8000, remainingMs)
        });
        socket.binaryType = "arraybuffer";
        socket.on("open", () => {
          socket.send(buildSpeechConfig(timestamp));
          socket.send(buildSsmlMessage({ text: cleanText, voice: selectedVoice.name, locale: selectedVoice.locale, rate, pitch, volume }, timestamp));
        });
        socket.on("message", (data, isBinary) => {
          if (isBinary) {
            const chunk = parseAudioFrame(data);
            if (chunk?.length) chunks.push(chunk);
            return;
          }
          if (parsePath(data.toString()) === "turn.end") {
            if (!chunks.length) finish(new Error("Edge TTS returned no audio"));
            else finish(null, Buffer.concat(chunks));
          }
        });
        socket.on("unexpected-response", (_request, response) => {
          finish(new Error(`Edge TTS WebSocket HTTP ${response.statusCode || 0}`));
        });
        socket.on("error", (error) => finish(error));
        socket.on("close", (code, reason) => {
          if (settled) return;
          const error = new Error(`Edge TTS socket closed ${code} before turn.end: ${String(reason || "")}`);
          error.edgeSocketCloseCode = Number(code);
          finish(error);
        });
      });
      break;
    } catch (error) {
      const canRetry = error?.edgeSocketCloseCode === 1006
        && attempt < TRANSIENT_CLOSE_RETRY_LIMIT
        && !signal?.aborted
        && deadline - Date.now() >= 500;
      if (!canRetry) throw error;
    }
  }

  return {
    audio,
    voice: selectedVoice
  };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function startEdgeTtsGateway({ port = EDGE_TTS_PORT } = {}) {
  const server = http.createServer(async (req, res) => {
    const origin = String(req.headers.origin || "");
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders(origin));
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${EDGE_TTS_HOST}:${port}`);
    try {
      if (req.method === "GET" && url.pathname === "/health") {
        json(res, 200, { ok: true, service: "inputbridge-edge-tts", port }, origin);
        return;
      }
      if (req.method === "GET" && url.pathname === "/voices") {
        const locale = normalizeLocale(url.searchParams.get("locale") || "en-US");
        const voices = voicesForLocale(await getVoices(), locale);
        json(res, 200, { ok: true, locale, voices }, origin);
        return;
      }
      if (req.method === "POST" && url.pathname === "/tts") {
        const clientController = new AbortController();
        const abortForDisconnect = () => {
          if (!res.writableEnded) clientController.abort();
        };
        req.once("aborted", abortForDisconnect);
        res.once("close", abortForDisconnect);
        try {
          const payload = await readJsonBody(req);
          const result = await synthesizeEdgeTts(payload || {}, { signal: clientController.signal });
          if (clientController.signal.aborted || res.destroyed) return;
          res.writeHead(200, {
            "content-type": "audio/mpeg",
            "content-length": result.audio.length,
            "cache-control": "no-store",
            "x-inputbridge-voice": encodeURIComponent(result.voice.name),
            "x-inputbridge-locale": result.voice.locale,
            ...corsHeaders(origin)
          });
          res.end(result.audio);
        } finally {
          req.removeListener("aborted", abortForDisconnect);
          res.removeListener("close", abortForDisconnect);
        }
        return;
      }
      json(res, 404, { ok: false, error: "Not found" }, origin);
    } catch (error) {
      if (!res.destroyed && !res.writableEnded && !res.headersSent) {
        json(res, 502, { ok: false, error: error?.message || String(error) }, origin);
      }
    }
  });

  server.on("error", (error) => {
    console.error("[InputBridge Edge TTS] gateway error:", error);
  });
  server.listen(port, EDGE_TTS_HOST, () => {
    console.log(`[InputBridge Edge TTS] listening on http://${EDGE_TTS_HOST}:${port}`);
  });
  return server;
}

module.exports = {
  EDGE_TTS_HOST,
  EDGE_TTS_PORT,
  getVoices,
  startEdgeTtsGateway,
  synthesizeEdgeTts,
  voicesForLocale
};
