(() => {
  const FLAG = "__inputBridgeShadowHookLoaded";
  const EVENT_NAME = "__inputbridge_shadow_attached__";

  if (window[FLAG]) return;
  window[FLAG] = true;

  const originalAttachShadow = Element.prototype.attachShadow;
  if (typeof originalAttachShadow !== "function") return;

  function attachShadowWithInputBridge(init) {
    const root = originalAttachShadow.call(this, init);

    try {
      this.dispatchEvent(new CustomEvent(EVENT_NAME, {
        bubbles: true,
        composed: true,
        detail: { mode: init?.mode || "open" }
      }));
    } catch {}

    return root;
  }

  try {
    Object.defineProperty(attachShadowWithInputBridge, "name", {
      value: originalAttachShadow.name,
      configurable: true
    });
  } catch {}

  try {
    attachShadowWithInputBridge.toString = () => originalAttachShadow.toString();
  } catch {}

  Object.defineProperty(Element.prototype, "attachShadow", {
    configurable: true,
    enumerable: false,
    writable: true,
    value: attachShadowWithInputBridge
  });

  const YT_CAPTION_REQUEST = "__inputbridge_request_youtube_captions__";
  const YT_CAPTION_RESPONSE = "__inputbridge_youtube_captions__";

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "inputbridge-content" || data.type !== YT_CAPTION_REQUEST) return;
    void loadYouTubeCaptionTimeline(
      data.requestId,
      data.targetLanguageCode,
      data.sourceLanguageCode,
      Boolean(data.bilingual),
      data.customTranslation !== false
    );
  });

  async function loadYouTubeCaptionTimeline(
    requestId,
    requestedTargetLanguageCode,
    requestedSourceLanguageCode,
    preferSourceTrack = false,
    customTranslation = true
  ) {
    try {
      const player = document.getElementById("movie_player");
      const playerResponse = player?.getPlayerResponse?.() || window.ytInitialPlayerResponse;
      const videoId = playerResponse?.videoDetails?.videoId || new URL(location.href).searchParams.get("v") || "";
      const renderer = playerResponse?.captions?.playerCaptionsTracklistRenderer || {};
      const trackList = renderer.captionTracks || [];
      const availableTracks = getCaptionTrackCatalog(player, trackList);
      const sourceTrack = pickCaptionTrack(player, trackList, requestedSourceLanguageCode, renderer);

      if (!sourceTrack?.baseUrl) {
        postCaptionTimeline({ requestId, videoId, cues: [], translatedCues: [], availableTracks, languageCode: "", error: "No caption track" });
        return;
      }

      const targetLanguageCode = resolveYouTubeLanguageCode(
        requestedTargetLanguageCode,
        renderer.translationLanguages || [],
        trackList
      );
      const useCustomTranslation = customTranslation !== false;
      const sourceTrackActivated = activateYouTubeCaptionTrack(
        player,
        renderer,
        sourceTrack.languageCode,
        useCustomTranslation || preferSourceTrack ? sourceTrack.languageCode : targetLanguageCode
      );
      const playerTrackShowsTranslation = Boolean(sourceTrackActivated && !useCustomTranslation && !preferSourceTrack);
      const directTrack = !useCustomTranslation && targetLanguageCode
        ? trackList.find((track) => sameLanguageCode(track?.languageCode, targetLanguageCode))
        : null;
      const translatedUrl = !useCustomTranslation && targetLanguageCode && !sameLanguageCode(sourceTrack.languageCode, targetLanguageCode)
        ? new URL(directTrack?.baseUrl || sourceTrack.baseUrl, location.href)
        : null;
      if (translatedUrl && !directTrack) translatedUrl.searchParams.set("tlang", targetLanguageCode);

      const sourcePromise = fetchCaptionCues(sourceTrack.baseUrl);
      const translatedPromise = useCustomTranslation || !targetLanguageCode
        ? Promise.resolve([])
        : sameLanguageCode(sourceTrack.languageCode, targetLanguageCode)
          ? sourcePromise
          : fetchCaptionCues(translatedUrl.toString());
      const [sourceResult, translatedResult] = await Promise.allSettled([sourcePromise, translatedPromise]);

      let sourceCues = sourceResult.status === "fulfilled" ? sourceResult.value : [];
      const translatedCues = translatedResult.status === "fulfilled" ? translatedResult.value : [];
      if (!sourceCues.length && translatedCues.length) sourceCues = translatedCues;
      if (!sourceCues.length && !translatedCues.length && !sourceTrackActivated) {
        const sourceError = sourceResult.status === "rejected" ? sourceResult.reason : null;
        const translatedError = translatedResult.status === "rejected" ? translatedResult.reason : null;
        throw sourceError || translatedError || new Error("Empty caption track");
      }

      postCaptionTimeline({
        requestId,
        videoId,
        languageCode: sourceTrack.languageCode || "",
        targetLanguageCode: translatedCues.length || playerTrackShowsTranslation
          ? (directTrack?.languageCode || targetLanguageCode)
          : "",
        translationEngine: translatedCues.length
          ? (directTrack || sameLanguageCode(sourceTrack.languageCode, targetLanguageCode) ? "youtube-track" : "youtube-auto-translate")
          : (playerTrackShowsTranslation ? "youtube-player-track" : ""),
        playerTrackActivated: playerTrackShowsTranslation,
        activeSourceLanguageCode: sourceTrack.languageCode || "",
        availableTracks,
        isAsr: sourceTrack.kind === "asr",
        cues: sourceCues,
        translatedCues
      });
    } catch (error) {
      postCaptionTimeline({
        requestId,
        videoId: new URL(location.href).searchParams.get("v") || "",
        languageCode: "",
        targetLanguageCode: "",
        playerTrackActivated: false,
        activeSourceLanguageCode: "",
        availableTracks: [],
        cues: [],
        translatedCues: [],
        error: error?.message || String(error)
      });
    }
  }

  async function fetchCaptionCues(baseUrl) {
    const url = new URL(baseUrl, location.href);
    url.searchParams.set("fmt", "json3");
    const response = await fetch(url.toString(), { credentials: "include" });
    if (!response.ok) throw new Error(`Caption request failed: ${response.status}`);
    const body = await response.text();
    if (!body.trim()) throw new Error("Caption response was empty");
    const payload = JSON.parse(body);
    return normalizeCaptionEvents(payload?.events || []);
  }

  function activateYouTubeCaptionTrack(player, renderer, sourceLanguageCode, targetLanguageCode) {
    if (!player || !targetLanguageCode) return false;

    try {
      const playerTracks = player.getOption?.("captions", "tracklist") || [];
      const currentTrack = player.getOption?.("captions", "track") || null;
      const sourceTrack = playerTracks.find((track) =>
        sameLanguageCode(track?.languageCode, sourceLanguageCode) && !track?.translationLanguage
      ) || playerTracks.find((track) =>
        sameLanguageCode(track?.languageCode, currentTrack?.languageCode) && !track?.translationLanguage
      ) || playerTracks.find((track) => track?.is_translateable !== false) || playerTracks[0];
      if (!sourceTrack) return false;

      if (sameLanguageCode(sourceTrack.languageCode, targetLanguageCode)) {
        player.setOption?.("captions", "track", sourceTrack);
        return true;
      }

      const translationLanguages = player.getOption?.("captions", "translationLanguages")
        || renderer.translationLanguages
        || [];
      const translationLanguage = translationLanguages.find((item) =>
        sameLanguageCode(item?.languageCode, targetLanguageCode)
      );
      if (translationLanguage) {
        player.setOption?.("captions", "track", {
          ...sourceTrack,
          translationLanguage: {
            languageCode: translationLanguage.languageCode,
            languageName: translationLanguage.languageName
              || translationLanguage.languageName?.simpleText
              || targetLanguageCode
          }
        });
        return true;
      }

      const directTrack = playerTracks.find((track) => sameLanguageCode(track?.languageCode, targetLanguageCode));
      if (!directTrack) return false;
      player.setOption?.("captions", "track", directTrack);
      return true;
    } catch {
      return false;
    }
  }

  function resolveYouTubeLanguageCode(value, translationLanguages, tracks) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    const aliases = {
      "zh-cn": "zh-Hans",
      "zh-sg": "zh-Hans",
      "zh-tw": "zh-Hant",
      "zh-hk": "zh-Hant"
    };
    const candidate = aliases[raw.toLowerCase()] || raw;
    const available = [
      ...translationLanguages.map((item) => item?.languageCode),
      ...tracks.map((track) => track?.languageCode)
    ].filter(Boolean);

    return available.find((code) => sameLanguageCode(code, candidate))
      || available.find((code) => code.toLowerCase().split("-")[0] === candidate.toLowerCase().split("-")[0])
      || candidate;
  }

  function sameLanguageCode(left, right) {
    return String(left || "").toLowerCase().replace(/_/g, "-")
      === String(right || "").toLowerCase().replace(/_/g, "-");
  }

  function normalizeYouTubeAudioLanguageCode(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    return raw.split(".")[0].replace(/_/g, "-");
  }

  function getCurrentYouTubeAudioLanguageCode(player) {
    try {
      const audioTrack = player?.getAudioTrack?.();
      return normalizeYouTubeAudioLanguageCode(
        audioTrack?.ib?.languageCode
        || audioTrack?.ib?.id
        || audioTrack?.languageCode
        || audioTrack?.language_code
      );
    } catch {
      return "";
    }
  }

  function getOriginalYouTubeAudioLanguageCode(renderer) {
    const audioTracks = Array.isArray(renderer?.audioTracks) ? renderer.audioTracks : [];
    const defaultIndex = Number(renderer?.defaultAudioTrackIndex);
    const defaultTrack = Number.isInteger(defaultIndex) ? audioTracks[defaultIndex] : null;
    return normalizeYouTubeAudioLanguageCode(defaultTrack?.audioTrackId);
  }

  function findCaptionTrackForLanguage(tracks, languageCode) {
    if (!languageCode) return null;
    const base = languageCode.toLowerCase().split("-")[0];
    return tracks.find((track) => sameLanguageCode(track?.languageCode, languageCode) && track?.kind !== "asr")
      || tracks.find((track) => sameLanguageCode(track?.languageCode, languageCode))
      || tracks.find((track) => String(track?.languageCode || "").toLowerCase().split("-")[0] === base && track?.kind !== "asr")
      || tracks.find((track) => String(track?.languageCode || "").toLowerCase().split("-")[0] === base)
      || null;
  }

  function pickCaptionTrack(player, tracks, requestedSourceLanguageCode, renderer) {
    if (!Array.isArray(tracks) || !tracks.length) return null;

    const requested = String(requestedSourceLanguageCode || "").trim();
    const requestedMode = requested.toLowerCase();
    if (requested && !["auto", "audio", "original"].includes(requestedMode)) {
      const resolved = resolveYouTubeLanguageCode(requested, [], tracks);
      const requestedTrack = findCaptionTrackForLanguage(tracks, resolved);
      if (requestedTrack) return requestedTrack;
    }

    const originalLanguage = getOriginalYouTubeAudioLanguageCode(renderer);
    const currentAudioLanguage = getCurrentYouTubeAudioLanguageCode(player);
    const preferredAudioLanguage = requestedMode === "original"
      ? originalLanguage || currentAudioLanguage
      : currentAudioLanguage || originalLanguage;
    const audioTrack = findCaptionTrackForLanguage(tracks, preferredAudioLanguage);
    if (audioTrack) return audioTrack;

    let active = null;
    try {
      active = player?.getOption?.("captions", "track") || player?.getOption?.("cc", "track");
    } catch {}

    const activeVssId = active?.translationLanguage ? "" : (active?.vss_id || active?.vssId || "");
    const activeLanguage = active?.translationLanguage ? "" : (active?.languageCode || active?.language_code || "");
    return tracks.find((track) => activeVssId && track.vssId === activeVssId)
      || findCaptionTrackForLanguage(tracks, activeLanguage)
      || tracks.find((track) => track.kind !== "asr")
      || tracks[0];
  }

  function getCaptionTrackCatalog(player, tracks) {
    let playerTracks = [];
    try {
      playerTracks = player?.getOption?.("captions", "tracklist") || [];
    } catch {}

    const seen = new Set();
    return [...playerTracks, ...(Array.isArray(tracks) ? tracks : [])]
      .filter((track) => track?.languageCode)
      .filter((track) => {
        const key = String(track.languageCode).toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((track) => ({
        languageCode: track.languageCode,
        label: captionTrackLabel(track),
        kind: track.kind || "",
        isAsr: track.kind === "asr"
      }));
  }

  function captionTrackLabel(track) {
    const name = track?.displayName
      || track?.languageName
      || track?.name?.simpleText
      || track?.name?.runs?.map((item) => item?.text || "").join("")
      || track?.languageCode
      || "";
    return String(name).trim();
  }

  function normalizeCaptionEvents(events) {
    const cues = [];
    for (const event of events) {
      if (!Array.isArray(event?.segs)) continue;
      const text = event.segs
        .map((segment) => segment?.utf8 || "")
        .join("")
        .replace(/\n+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) continue;

      const start = Math.max(0, Number(event.tStartMs || 0) / 1000);
      const duration = Math.max(0.25, Number(event.dDurationMs || 2500) / 1000);
      const previous = cues.at(-1);
      if (previous && previous.text === text && Math.abs(previous.start - start) < 0.15) continue;

      const segments = event.segs.map((seg) => ({
        text: seg?.utf8 || "",
        offset: Number(seg?.tOffsetMs || 0) / 1000
      }));

      cues.push({ start, end: start + duration, text, segments });
    }
    return cues;
  }

  function postCaptionTimeline(payload) {
    window.postMessage({
      source: "inputbridge-main",
      type: YT_CAPTION_RESPONSE,
      ...payload
    }, "*");
  }
})();
