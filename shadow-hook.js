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
  const YT_CAPTION_CANCEL = "__inputbridge_cancel_youtube_captions__";
  const YT_CAPTION_RESPONSE = "__inputbridge_youtube_captions__";
  const YT_CAPTION_LOAD_BUDGET_MS = 5200;
  const YT_CAPTION_DIRECT_BUDGET_MS = 1550;
  const YT_CAPTION_FETCH_TIMEOUT_MS = 1150;
  const YT_TRANSCRIPT_PANEL_CLASS = "ib-youtube-transcript-preload";
  let youtubeCaptionLoadGeneration = 0;
  let activeYouTubeCaptionClientId = "";
  let activeYouTubeCaptionStateRestore = null;
  let activeYouTubeTranscriptPanelRestore = null;

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "inputbridge-content") return;
    if (data.type === YT_CAPTION_CANCEL) {
      const cancelClientId = normalizeYouTubeCaptionClientId(data.clientId);
      // Once a scoped client owns the active load, legacy/mismatched content
      // scripts left behind by an extension reload must not cancel it. Missing
      // ids remain compatible with an active legacy (unscoped) request.
      if (activeYouTubeCaptionClientId && cancelClientId !== activeYouTubeCaptionClientId) return;
      youtubeCaptionLoadGeneration += 1;
      try { activeYouTubeCaptionStateRestore?.(); } catch {}
      try { activeYouTubeTranscriptPanelRestore?.(); } catch {}
      activeYouTubeCaptionStateRestore = null;
      activeYouTubeTranscriptPanelRestore = null;
      return;
    }
    if (data.type !== YT_CAPTION_REQUEST) return;
    try { activeYouTubeCaptionStateRestore?.(); } catch {}
    try { activeYouTubeTranscriptPanelRestore?.(); } catch {}
    activeYouTubeCaptionStateRestore = null;
    activeYouTubeTranscriptPanelRestore = null;
    const clientId = normalizeYouTubeCaptionClientId(data.clientId);
    activeYouTubeCaptionClientId = clientId;
    const loadGeneration = ++youtubeCaptionLoadGeneration;
    void loadYouTubeCaptionTimeline(
      data.requestId,
      clientId,
      data.targetLanguageCode,
      data.sourceLanguageCode,
      Boolean(data.bilingual),
      data.customTranslation !== false,
      loadGeneration
    );
  });

  async function loadYouTubeCaptionTimeline(
    requestId,
    clientId,
    requestedTargetLanguageCode,
    requestedSourceLanguageCode,
    preferSourceTrack = false,
    customTranslation = true,
    loadGeneration = youtubeCaptionLoadGeneration
  ) {
    const loadStartedAt = performance.now();
    const isCancelled = () => loadGeneration !== youtubeCaptionLoadGeneration;
    const remainingLoadMs = () => Math.max(0, YT_CAPTION_LOAD_BUDGET_MS - (performance.now() - loadStartedAt));
    let player = null;
    let playerCaptionState = null;
    let restorePlayerCaptionState = null;
    try {
      throwIfYouTubeCaptionLoadCancelled(isCancelled);
      player = document.getElementById("movie_player");
      playerCaptionState = captureYouTubePlayerCaptionState(player);
      restorePlayerCaptionState = createYouTubePlayerCaptionStateRestore(player, playerCaptionState);
      activeYouTubeCaptionStateRestore = restorePlayerCaptionState;
      const playerResponse = player?.getPlayerResponse?.() || window.ytInitialPlayerResponse;
      const videoId = playerResponse?.videoDetails?.videoId || new URL(location.href).searchParams.get("v") || "";
      const renderer = playerResponse?.captions?.playerCaptionsTracklistRenderer || {};
      const trackList = getYouTubeCaptionTracks(player, renderer);
      const availableTracks = getCaptionTrackCatalog(player, trackList);
      const sourceTracks = rankCaptionTracks(player, trackList, requestedSourceLanguageCode, renderer)
        .filter(isCaptionTrackFetchCandidate)
        .slice(0, 8);
      let sourceTrack = sourceTracks[0] || null;

      const targetLanguageCode = resolveYouTubeLanguageCode(
        requestedTargetLanguageCode,
        renderer.translationLanguages || [],
        trackList
      );
      let sourceCues = [];
      let sourceError = null;
      const directDeadline = performance.now() + Math.min(YT_CAPTION_DIRECT_BUDGET_MS, remainingLoadMs());
      for (const candidate of sourceTracks) {
        throwIfYouTubeCaptionLoadCancelled(isCancelled);
        if (performance.now() >= directDeadline) break;

        // Let the real player select the track first. This gives YouTube a
        // chance to refresh its short-lived, video-bound subtitle token.
        activateYouTubeCaptionTrack(player, renderer, candidate, candidate.languageCode);
        await waitForYouTubeCaptionDelay(70, isCancelled);
        const refreshedTrack = findMatchingRuntimeCaptionTrack(player, renderer, candidate) || candidate;
        const urls = [...getCaptionTrackUrls(refreshedTrack), ...getCaptionTrackUrls(candidate)]
          .filter((url, index, items) => url && items.indexOf(url) === index);

        for (const url of urls) {
          throwIfYouTubeCaptionLoadCancelled(isCancelled);
          const remainingDirectMs = directDeadline - performance.now();
          if (remainingDirectMs <= 0) break;
          try {
            const cues = await fetchCaptionCues(url, {
              timeoutMs: Math.max(150, Math.min(YT_CAPTION_FETCH_TIMEOUT_MS, remainingDirectMs)),
              isCancelled
            });
            if (!cues.length) throw new Error("Caption response contained no cues");
            sourceTrack = refreshedTrack;
            sourceCues = cues;
            break;
          } catch (error) {
            if (isYouTubeCaptionLoadCancelledError(error)) throw error;
            sourceError = error;
          }
        }
        if (sourceCues.length) break;
      }

      if (!sourceCues.length && remainingLoadMs() > 180) {
        try {
          const transcript = await loadYouTubeTranscriptPanelTimeline({
            videoId,
            availableTracks,
            fallbackLanguageCode: sourceTrack?.languageCode || requestedSourceLanguageCode,
            timeoutMs: Math.max(180, remainingLoadMs()),
            isCancelled
          });
          if (transcript.cues.length) {
            sourceCues = transcript.cues;
            sourceTrack = sourceTrack || {
              languageCode: transcript.languageCode || requestedSourceLanguageCode || ""
            };
            if (transcript.languageCode) sourceTrack = { ...sourceTrack, languageCode: transcript.languageCode };
          }
        } catch (error) {
          if (isYouTubeCaptionLoadCancelledError(error)) throw error;
          sourceError = error;
        }
      }
      if (!sourceCues.length) throw sourceError || new Error("Empty caption track");

      const useCustomTranslation = customTranslation !== false;
      const sourceTrackActivated = activateYouTubeCaptionTrack(
        player,
        renderer,
        sourceTrack,
        useCustomTranslation || preferSourceTrack ? sourceTrack.languageCode : targetLanguageCode
      );
      const playerTrackShowsTranslation = Boolean(sourceTrackActivated && !useCustomTranslation && !preferSourceTrack);
      const directTrack = !useCustomTranslation && targetLanguageCode
        ? findCaptionTrackForLanguage(trackList.filter(isCaptionTrackFetchCandidate), targetLanguageCode)
        : null;
      const translatedBaseUrl = getCaptionTrackUrl(directTrack || sourceTrack);
      const translatedUrl = !useCustomTranslation && targetLanguageCode && translatedBaseUrl
        && !sameLanguageCode(sourceTrack.languageCode, targetLanguageCode)
        ? new URL(translatedBaseUrl, location.href)
        : null;
      if (translatedUrl && !directTrack) translatedUrl.searchParams.set("tlang", targetLanguageCode);

      let translatedCues = [];
      if (!useCustomTranslation && targetLanguageCode) {
        if (sameLanguageCode(sourceTrack.languageCode, targetLanguageCode)) {
          translatedCues = sourceCues;
        } else if (translatedUrl) {
          try {
            translatedCues = await fetchCaptionCues(translatedUrl.toString(), {
              timeoutMs: Math.max(150, Math.min(YT_CAPTION_FETCH_TIMEOUT_MS, remainingLoadMs())),
              isCancelled
            });
          } catch {}
        }
      }

      throwIfYouTubeCaptionLoadCancelled(isCancelled);
      postCaptionTimeline({
        requestId,
        clientId,
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
      if (isYouTubeCaptionLoadCancelledError(error) || isCancelled()) return;
      postCaptionTimeline({
        requestId,
        clientId,
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
    } finally {
      restorePlayerCaptionState?.();
      if (activeYouTubeCaptionStateRestore === restorePlayerCaptionState) {
        activeYouTubeCaptionStateRestore = null;
      }
    }
  }

  function normalizeYouTubeCaptionClientId(value) {
    return typeof value === "string" ? value.trim().slice(0, 160) : "";
  }

  async function fetchCaptionCues(baseUrl, { timeoutMs = YT_CAPTION_FETCH_TIMEOUT_MS, isCancelled } = {}) {
    throwIfYouTubeCaptionLoadCancelled(isCancelled);
    const url = new URL(baseUrl, location.href);
    url.searchParams.set("fmt", "json3");
    const config = globalThis.ytcfg?.data_ || {};
    const client = config.INNERTUBE_CONTEXT?.client || {};
    const captionClientParams = {
      xorb: "2",
      xobt: "3",
      xovt: "3",
      c: client.clientName || "WEB",
      cver: client.clientVersion || config.INNERTUBE_CLIENT_VERSION,
      cplayer: "UNIPLAYER",
      cos: client.osName || "Windows",
      cosver: client.osVersion || "10.0",
      cplatform: client.platform || "DESKTOP",
      cbr: client.browserName || "Chrome",
      cbrver: client.browserVersion || ""
    };
    for (const [key, value] of Object.entries(captionClientParams)) {
      if (value !== undefined && value !== null && String(value)) {
        url.searchParams.set(key, String(value));
      }
    }

    // Preserve the player identity metadata. A valid Subs PoToken, when the
    // player provides one, remains on the original runtime URL above.
    const headers = { Accept: "application/json" };
    const putHeader = (name, value) => {
      if (value !== undefined && value !== null && String(value)) headers[name] = String(value);
    };
    putHeader("x-youtube-client-name", config.INNERTUBE_CONTEXT_CLIENT_NAME || client.clientName);
    putHeader("x-youtube-client-version", config.INNERTUBE_CLIENT_VERSION || client.clientVersion);
    putHeader("x-goog-visitor-id", config.VISITOR_DATA);
    putHeader("x-youtube-identity-token", config.ID_TOKEN);
    putHeader("x-goog-authuser", config.SESSION_INDEX);
    putHeader("x-youtube-page-cl", config.PAGE_CL);
    putHeader("x-youtube-page-label", config.PAGE_BUILD_LABEL);
    putHeader("x-youtube-utc-offset", config.INNERTUBE_CONTEXT?.user?.utcOffsetMinutes);
    putHeader("x-youtube-time-zone", config.INNERTUBE_CONTEXT?.user?.timeZone);

    const controller = new AbortController();
    let timedOut = false;
    const abortTimer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, Math.max(1, Number(timeoutMs) || YT_CAPTION_FETCH_TIMEOUT_MS));
    const cancelPoll = typeof isCancelled === "function"
      ? window.setInterval(() => {
          if (isCancelled()) controller.abort();
        }, 50)
      : 0;

    try {
      const response = await fetch(url.toString(), {
        credentials: "include",
        headers,
        signal: controller.signal
      });
      throwIfYouTubeCaptionLoadCancelled(isCancelled);
      if (!response.ok) throw new Error(`Caption request failed: ${response.status}`);
      const body = await response.text();
      throwIfYouTubeCaptionLoadCancelled(isCancelled);
      if (!body.trim()) throw new Error("Caption response was empty");
      const payload = JSON.parse(body);
      return normalizeCaptionEvents(payload?.events || []);
    } catch (error) {
      throwIfYouTubeCaptionLoadCancelled(isCancelled);
      if (timedOut || error?.name === "AbortError") throw new Error("Caption request timed out");
      throw error;
    } finally {
      clearTimeout(abortTimer);
      if (cancelPoll) clearInterval(cancelPoll);
    }
  }

  function createYouTubeCaptionLoadCancelledError() {
    const error = new Error("Caption load cancelled");
    error.inputBridgeCaptionCancelled = true;
    return error;
  }

  function isYouTubeCaptionLoadCancelledError(error) {
    return Boolean(error?.inputBridgeCaptionCancelled);
  }

  function throwIfYouTubeCaptionLoadCancelled(isCancelled) {
    if (typeof isCancelled === "function" && isCancelled()) {
      throw createYouTubeCaptionLoadCancelledError();
    }
  }

  function waitForYouTubeCaptionDelay(delayMs, isCancelled) {
    return new Promise((resolve, reject) => {
      const startedAt = performance.now();
      const tick = () => {
        if (typeof isCancelled === "function" && isCancelled()) {
          reject(createYouTubeCaptionLoadCancelledError());
          return;
        }
        const remaining = Math.max(0, Number(delayMs) - (performance.now() - startedAt));
        if (!remaining) {
          resolve();
          return;
        }
        window.setTimeout(tick, Math.min(remaining, 50));
      };
      tick();
    });
  }

  async function loadYouTubeTranscriptPanelTimeline({
    videoId,
    availableTracks = [],
    fallbackLanguageCode = "",
    timeoutMs,
    isCancelled
  }) {
    throwIfYouTubeCaptionLoadCancelled(isCancelled);
    const watchFlexy = document.querySelector("ytd-watch-flexy[role='main']:not([hidden])")
      || document.querySelector("ytd-watch-flexy");
    const panelsRoot = watchFlexy?.querySelector("#panels");
    if (!watchFlexy || !panelsRoot) throw new Error("YouTube transcript panel is unavailable");

    ensureYouTubeTranscriptPreloadStyle();
    const initialPanel = findYouTubeTranscriptPanel(watchFlexy);
    const transcriptButton = watchFlexy.querySelector(
      "#panels ytd-video-description-transcript-section-renderer button, ytd-video-description-transcript-section-renderer button"
    );
    if (!initialPanel && !transcriptButton) throw new Error("YouTube transcript is unavailable");

    const capturePanelState = (panel) => {
      const visibilityAttribute = panel.getAttribute("visibility");
      let visibilityProperty;
      try { visibilityProperty = panel.visibility; } catch {}
      return {
        visibilityAttribute,
        visibilityProperty,
        wasExpanded: visibilityAttribute === "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"
          || visibilityProperty === "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"
      };
    };
    const surroundingPanelStates = new Map(
      [...panelsRoot.querySelectorAll("ytd-engagement-panel-section-list-renderer")]
        .map((panel) => [panel, capturePanelState(panel)])
    );
    const panelStates = new Map();
    const openedByUs = !initialPanel;
    const rememberPanel = (panel, forceOwned = openedByUs) => {
      if (!(panel instanceof Element)) return;
      if (!panelStates.has(panel)) {
        const state = capturePanelState(panel);
        panelStates.set(panel, {
          ...state,
          openedByUs: Boolean(forceOwned)
        });
      }
      const state = panelStates.get(panel);
      if (state.openedByUs || !state.wasExpanded) panel.classList.add(YT_TRANSCRIPT_PANEL_CLASS);
    };
    const rememberMatchingPanels = () => {
      for (const panel of panelsRoot.querySelectorAll("ytd-engagement-panel-section-list-renderer")) {
        if (isYouTubeTranscriptPanel(panel)) rememberPanel(panel, openedByUs);
      }
    };

    const panelObserver = new MutationObserver(rememberMatchingPanels);
    panelObserver.observe(panelsRoot, { childList: true, subtree: true });
    let panelsRestored = false;
    const restorePanels = () => {
      if (panelsRestored) return;
      panelsRestored = true;
      panelObserver.disconnect();
      for (const [panel, state] of panelStates) {
        panel.classList.remove(YT_TRANSCRIPT_PANEL_CLASS);
        if (!panel.isConnected) continue;

        if (state.openedByUs) {
          setYouTubeTranscriptPanelVisibility(panel, false);
          continue;
        }
        restoreYouTubeEngagementPanelVisibility(panel, state, !state.wasExpanded);
      }
      for (const [panel, state] of surroundingPanelStates) {
        if (!panel.isConnected || panelStates.has(panel)) continue;
        restoreYouTubeEngagementPanelVisibility(panel, state, false);
      }
    };
    activeYouTubeTranscriptPanelRestore = restorePanels;
    const deadline = performance.now() + Math.max(1, Number(timeoutMs) || 1);

    try {
      if (initialPanel) {
        rememberPanel(initialPanel, false);
        const state = panelStates.get(initialPanel);
        if (!state.wasExpanded) setYouTubeTranscriptPanelVisibility(initialPanel, true);
      } else {
        rememberMatchingPanels();
        transcriptButton.click();
      }

      while (performance.now() < deadline) {
        throwIfYouTubeCaptionLoadCancelled(isCancelled);
        const currentVideoId = document.getElementById("movie_player")?.getPlayerResponse?.()?.videoDetails?.videoId
          || new URL(location.href).searchParams.get("v")
          || "";
        if (videoId && currentVideoId && currentVideoId !== videoId) {
          throw createYouTubeCaptionLoadCancelledError();
        }
        rememberMatchingPanels();
        const transcript = readYouTubeTranscriptPanelTimeline(watchFlexy, videoId);
        if (transcript.cues.length) {
          rememberPanel(transcript.panel, openedByUs);
          return {
            cues: transcript.cues,
            languageCode: inferYouTubeTranscriptLanguageCode(
              transcript.panel,
              availableTracks,
              fallbackLanguageCode
            )
          };
        }
        await waitForYouTubeCaptionDelay(Math.min(90, Math.max(1, deadline - performance.now())), isCancelled);
      }
      throw new Error("YouTube transcript did not load in time");
    } finally {
      restorePanels();
      if (activeYouTubeTranscriptPanelRestore === restorePanels) {
        activeYouTubeTranscriptPanelRestore = null;
      }
    }
  }

  function ensureYouTubeTranscriptPreloadStyle() {
    const styleId = "inputbridge-youtube-transcript-preload-style";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .${YT_TRANSCRIPT_PANEL_CLASS} {
        position: fixed !important;
        top: var(--ytd-masthead-height, var(--ytd-toolbar-height, 56px)) !important;
        left: 50% !important;
        max-height: var(--ytd-watch-flexy-panel-max-height, 500px) !important;
        transform: translateX(-50%) !important;
        z-index: -2147483647 !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function setYouTubeTranscriptPanelVisibility(panel, expanded) {
    if (!panel) return;
    const value = expanded
      ? "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"
      : "ENGAGEMENT_PANEL_VISIBILITY_HIDDEN";
    try { panel.setAttribute("visibility", value); } catch {}
    try { panel.visibility = value; } catch {}
  }

  function restoreYouTubeEngagementPanelVisibility(panel, state, ensureHidden) {
    if (!panel || !state) return;
    if (ensureHidden && state.visibilityAttribute === null && state.visibilityProperty === undefined) {
      setYouTubeTranscriptPanelVisibility(panel, false);
      try { panel.removeAttribute("visibility"); } catch {}
      return;
    }
    try {
      if (state.visibilityAttribute === null) panel.removeAttribute("visibility");
      else panel.setAttribute("visibility", state.visibilityAttribute);
    } catch {}
    try {
      if (state.visibilityProperty !== undefined) panel.visibility = state.visibilityProperty;
    } catch {}
  }

  function isYouTubeTranscriptPanel(panel) {
    if (!(panel instanceof Element)) return false;
    const target = String(panel.getAttribute("target-id") || panel.getAttribute("data-target-id") || "");
    return target.includes("transcript")
      || target === "PAmodern_transcript_view"
      || Boolean(panel.querySelector(
        "ytd-transcript-segment-list-renderer, yt-section-list-renderer[data-target-id='PAmodern_transcript_view']"
      ));
  }

  function findYouTubeTranscriptPanel(root) {
    const searchable = root.querySelector(
      "#panels ytd-engagement-panel-section-list-renderer[target-id='engagement-panel-searchable-transcript']"
    );
    if (searchable) return searchable;
    const modernRoot = root.querySelector(
      "#panels yt-section-list-renderer[data-target-id='PAmodern_transcript_view']"
    );
    if (modernRoot) return modernRoot.closest("ytd-engagement-panel-section-list-renderer");
    return [...root.querySelectorAll("#panels ytd-engagement-panel-section-list-renderer")]
      .find(isYouTubeTranscriptPanel) || null;
  }

  function readYouTubeTranscriptPanelTimeline(root, expectedVideoId = "") {
    const modes = [];
    const searchablePanel = root.querySelector(
      "#panels ytd-engagement-panel-section-list-renderer[target-id='engagement-panel-searchable-transcript']"
    );
    const searchableRoot = searchablePanel?.querySelector(
      "ytd-transcript-segment-list-renderer #segments-container"
    );
    if (searchablePanel && searchableRoot) {
      modes.push({
        panel: searchablePanel,
        elements: [...searchableRoot.children],
        timestampSelector: ".segment-timestamp",
        textSelector: ".segment-text"
      });
    }

    const modernRoot = root.querySelector(
      "#panels yt-section-list-renderer[data-target-id='PAmodern_transcript_view']"
    );
    const modernPanel = modernRoot?.closest("ytd-engagement-panel-section-list-renderer");
    if (modernPanel && modernRoot) {
      modes.push({
        panel: modernPanel,
        elements: [...modernRoot.querySelectorAll("macro-markers-panel-item-view-model")],
        timestampSelector: ".ytwTranscriptSegmentViewModelTimestamp",
        textSelector: ".ytAttributedStringHost[role='text']"
      });
    }

    const duration = Number(document.querySelector("#movie_player video")?.duration || 0);
    for (const mode of modes) {
      const rawCues = [];
      for (const element of mode.elements) {
        const model = getYouTubeTranscriptSegmentModel(element);
        const modelVideoId = getYouTubeTranscriptModelVideoId(model);
        if (expectedVideoId && modelVideoId && modelVideoId !== expectedVideoId) continue;
        const modelTiming = getYouTubeTranscriptModelTiming(model);
        const timestampText = element.querySelector(mode.timestampSelector)?.textContent || "";
        const start = Number.isFinite(modelTiming.start)
          ? modelTiming.start
          : parseYouTubeTranscriptTimestamp(timestampText);
        const text = normalizeYouTubeTranscriptText(
          getYouTubeTranscriptModelText(model)
          || element.querySelector(mode.textSelector)?.textContent
          || ""
        );
        if (!Number.isFinite(start) || start < 0 || !text) continue;
        rawCues.push({ start, end: modelTiming.end, text });
      }
      const cues = normalizeYouTubeTranscriptDomCues(rawCues, duration);
      if (cues.length) return { panel: mode.panel, cues };
    }
    return { panel: findYouTubeTranscriptPanel(root), cues: [] };
  }

  function getYouTubeTranscriptModelVideoId(model) {
    const target = String(model?.targetId || model?.target_id || "");
    return target.match(/^([A-Za-z0-9_-]{11})\./)?.[1] || "";
  }

  function getYouTubeTranscriptSegmentModel(element) {
    const candidates = [
      element?.data?.transcriptSegmentRenderer,
      element?.data,
      element?.__data?.data?.transcriptSegmentRenderer,
      element?.__data?.data,
      element?.__data?.model,
      element?.model
    ];
    for (const candidate of candidates) {
      const model = findYouTubeTranscriptSegmentModel(candidate, 0, new Set());
      if (model) return model;
    }
    return null;
  }

  function findYouTubeTranscriptSegmentModel(value, depth, seen) {
    if (!value || typeof value !== "object" || depth > 3 || seen.has(value)) return null;
    seen.add(value);
    if (value.startMs !== undefined || value.endMs !== undefined || value.snippet || value.targetId) return value;
    const keys = [
      "transcriptSegmentRenderer",
      "transcriptSegmentViewModel",
      "segment",
      "content",
      "contents",
      "data",
      "model"
    ];
    for (const key of keys) {
      const child = value[key];
      if (Array.isArray(child)) {
        for (const item of child.slice(0, 4)) {
          const result = findYouTubeTranscriptSegmentModel(item, depth + 1, seen);
          if (result) return result;
        }
      } else {
        const result = findYouTubeTranscriptSegmentModel(child, depth + 1, seen);
        if (result) return result;
      }
    }
    return null;
  }

  function getYouTubeTranscriptModelTiming(model) {
    const toNumber = (value) => value === null || value === undefined || value === "" ? NaN : Number(value);
    let startMs = toNumber(model?.startMs);
    let endMs = toNumber(model?.endMs);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      const target = String(model?.targetId || model?.target_id || "");
      const match = target.match(/\.(\d+)\.(\d+)$/);
      if (match) {
        if (!Number.isFinite(startMs)) startMs = Number(match[1]);
        if (!Number.isFinite(endMs)) endMs = Number(match[2]);
      }
    }
    return {
      start: Number.isFinite(startMs) ? startMs / 1000 : NaN,
      end: Number.isFinite(endMs) && endMs > startMs ? endMs / 1000 : NaN
    };
  }

  function getYouTubeTranscriptModelText(model) {
    const snippet = model?.snippet;
    if (typeof snippet?.simpleText === "string") return snippet.simpleText;
    if (Array.isArray(snippet?.runs)) return snippet.runs.map((run) => run?.text || "").join("");
    if (typeof model?.text === "string") return model.text;
    if (typeof model?.text?.content === "string") return model.text.content;
    return "";
  }

  function parseYouTubeTranscriptTimestamp(value) {
    const match = String(value || "").match(/\d+(?::\d+){1,2}/)?.[0];
    if (!match) return NaN;
    const parts = match.split(":").map(Number);
    if (parts.some((part) => !Number.isFinite(part))) return NaN;
    return parts.reduce((total, part) => total * 60 + part, 0);
  }

  function normalizeYouTubeTranscriptText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeYouTubeTranscriptDomCues(items, duration) {
    const ordered = items
      .filter((cue) => Number.isFinite(cue?.start) && cue.start >= 0 && cue.text)
      .sort((left, right) => left.start - right.start);
    const merged = [];
    for (const cue of ordered) {
      const previous = merged.at(-1);
      if (previous && Math.abs(previous.start - cue.start) < 0.01) {
        if (cue.text !== previous.text && !previous.text.includes(cue.text)) {
          previous.text = normalizeYouTubeTranscriptText(`${previous.text} ${cue.text}`);
        }
        if (Number.isFinite(cue.end)) previous.end = Math.max(previous.end || 0, cue.end);
        continue;
      }
      if (previous && previous.text === cue.text && Math.abs(previous.start - cue.start) < 0.2) continue;
      merged.push({ ...cue });
    }

    return merged.map((cue, index) => {
      const nextStart = merged[index + 1]?.start;
      let end = Number(cue.end);
      if (!Number.isFinite(end) || end <= cue.start) {
        if (Number.isFinite(nextStart) && nextStart > cue.start) end = nextStart;
        else end = Math.min(Number.isFinite(duration) && duration > cue.start ? duration : cue.start + 4, cue.start + 4);
      }
      return {
        start: cue.start,
        end: Math.max(cue.start + 0.25, end),
        text: cue.text,
        segments: []
      };
    });
  }

  function inferYouTubeTranscriptLanguageCode(panel, availableTracks, fallbackLanguageCode) {
    const labels = [
      panel?.querySelector("#label-text")?.textContent,
      panel?.querySelector("tp-yt-paper-item[selected]")?.textContent,
      panel?.querySelector("[role='menuitemradio'][aria-checked='true']")?.textContent
    ].map(normalizeYouTubeTranscriptText).filter(Boolean);
    for (const label of labels) {
      const normalizedLabel = label.toLowerCase();
      const match = availableTracks.find((track) => {
        const trackLabel = normalizeYouTubeTranscriptText(track?.label).toLowerCase();
        return trackLabel && (normalizedLabel === trackLabel || normalizedLabel.startsWith(trackLabel));
      });
      if (match?.languageCode) return match.languageCode;
    }
    const fallback = String(fallbackLanguageCode || "").trim();
    if (fallback && !["auto", "audio", "original"].includes(fallback.toLowerCase())) return fallback;
    return availableTracks.length === 1 ? String(availableTracks[0]?.languageCode || "") : "";
  }

  function captureYouTubePlayerCaptionState(player) {
    if (!player) return null;
    let track;
    let visibility;
    let subtitlesOn;
    try { track = player.getOption?.("captions", "track"); } catch {}
    try { visibility = player.getOption?.("captions", "visibility"); } catch {}
    try { subtitlesOn = player.isSubtitlesOn?.(); } catch {}
    const button = player.querySelector?.(".ytp-subtitles-button") || null;
    const buttonPressed = button?.getAttribute("aria-pressed");
    return { track, visibility, subtitlesOn, button, buttonPressed };
  }

  function createYouTubePlayerCaptionStateRestore(player, state) {
    let restored = false;
    return () => {
      if (restored) return;
      restored = true;
      restoreYouTubePlayerCaptionState(player, state);
    };
  }

  function restoreYouTubePlayerCaptionState(player, state) {
    if (!player || !state) return;
    try { player.setOption?.("captions", "track", state.track || null); } catch {}
    try {
      if (state.visibility !== undefined) player.setOption?.("captions", "visibility", state.visibility);
    } catch {}

    const restoreButton = () => {
      const button = state.button?.isConnected
        ? state.button
        : player.querySelector?.(".ytp-subtitles-button");
      if (!button) return;
      const currentPressed = button.getAttribute("aria-pressed");
      const expectedPressed = state.buttonPressed === "true"
        || (state.buttonPressed === null && state.subtitlesOn === true)
        ? "true"
        : state.buttonPressed === "false" || state.subtitlesOn === false
          ? "false"
          : null;
      if (expectedPressed && currentPressed !== expectedPressed) {
        try { button.click(); } catch {}
      }
    };
    restoreButton();
    queueMicrotask(restoreButton);
  }

  function activateYouTubeCaptionTrack(player, renderer, requestedSourceTrack, targetLanguageCode) {
    if (!player || !requestedSourceTrack?.languageCode || !targetLanguageCode) return false;

    try {
      const playerTracks = player.getOption?.("captions", "tracklist") || [];
      const audioTrack = player.getAudioTrack?.() || null;
      const audioCaptionTracks = Array.isArray(audioTrack?.captionTracks) ? audioTrack.captionTracks : [];
      const rendererTracks = Array.isArray(renderer?.captionTracks) ? renderer.captionTracks : [];
      const allTracks = [...audioCaptionTracks, ...playerTracks, ...rendererTracks];
      const currentTrack = player.getOption?.("captions", "track") || null;
      const sourceLanguageCode = requestedSourceTrack.languageCode;
      const requestedVssId = requestedSourceTrack.vssId || requestedSourceTrack.vss_id || "";
      const sourceTrack = allTracks.find((track) => {
        const vssId = track?.vssId || track?.vss_id || "";
        return requestedVssId && vssId === requestedVssId;
      }) || allTracks.find((track) =>
        sameLanguageCode(track?.languageCode, sourceLanguageCode)
        && String(track?.kind || "") === String(requestedSourceTrack?.kind || "")
        && !track?.translationLanguage
      ) || allTracks.find((track) =>
        sameLanguageCode(track?.languageCode, sourceLanguageCode) && !track?.translationLanguage
      ) || allTracks.find((track) =>
        sameLanguageCode(track?.languageCode, currentTrack?.languageCode) && !track?.translationLanguage
      ) || allTracks.find((track) => track?.is_translateable !== false) || allTracks[0];
      if (!sourceTrack) return false;

      if (sameLanguageCode(sourceTrack.languageCode, targetLanguageCode)) {
        player.setOption?.("captions", "track", { ...sourceTrack, translationLanguage: null });
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

      const directTrack = allTracks.find((track) => sameLanguageCode(track?.languageCode, targetLanguageCode));
      if (!directTrack) return false;
      player.setOption?.("captions", "track", { ...directTrack, translationLanguage: null });
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
    const normalized = raw.split(".")[0].replace(/_/g, "-");
    return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(normalized) ? normalized : "";
  }

  function getCurrentYouTubeAudioLanguageCode(player) {
    try {
      const audioTrack = player?.getAudioTrack?.();
      const candidates = [
        audioTrack?.gV?.languageCode,
        audioTrack?.gV?.language_code,
        audioTrack?.gV?.audioTrackId,
        audioTrack?.gV?.audio_track_id,
        audioTrack?.gV?.id,
        audioTrack?.ib?.languageCode,
        audioTrack?.ib?.language_code,
        audioTrack?.ib?.audioTrackId,
        audioTrack?.ib?.audio_track_id,
        audioTrack?.ib?.id,
        audioTrack?.languageCode,
        audioTrack?.language_code,
        audioTrack?.audioTrackId,
        audioTrack?.audio_track_id,
        audioTrack?.id
      ];

      for (const value of Object.values(audioTrack || {})) {
        if (!value || typeof value !== "object" || Array.isArray(value)) continue;
        candidates.push(
          value.languageCode,
          value.language_code,
          value.audioTrackId,
          value.audio_track_id,
          value.id
        );
      }

      for (const candidate of candidates) {
        const languageCode = normalizeYouTubeAudioLanguageCode(candidate);
        if (languageCode) return languageCode;
      }
      return "";
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

  function getYouTubeCaptionTracks(player, renderer) {
    let playerTracks = [];
    let audioTrack = null;
    try {
      playerTracks = player?.getOption?.("captions", "tracklist") || [];
      audioTrack = player?.getAudioTrack?.() || null;
    } catch {}

    const audioCaptionTracks = Array.isArray(audioTrack?.captionTracks) ? audioTrack.captionTracks : [];
    const rendererTracks = Array.isArray(renderer?.captionTracks) ? renderer.captionTracks : [];
    const defaultTracks = [
      audioTrack?.defaultCaptionTrack,
      audioTrack?.captionTrack,
      audioTrack?.S
    ];

    return [...defaultTracks, ...audioCaptionTracks, ...playerTracks, ...rendererTracks]
      .filter((track) => track && typeof track === "object" && track.languageCode);
  }

  function findMatchingRuntimeCaptionTrack(player, renderer, referenceTrack) {
    const tracks = getYouTubeCaptionTracks(player, renderer);
    const referenceVssId = referenceTrack?.vssId || referenceTrack?.vss_id || "";
    const referenceLanguage = referenceTrack?.languageCode || referenceTrack?.language_code || "";
    const referenceKind = String(referenceTrack?.kind || "");
    const matches = tracks.filter((track) => {
      const vssId = track?.vssId || track?.vss_id || "";
      if (referenceVssId && vssId === referenceVssId) return true;
      return sameLanguageCode(track?.languageCode || track?.language_code, referenceLanguage)
        && (!referenceKind || String(track?.kind || "") === referenceKind);
    });
    return matches.sort((left, right) => captionTrackRuntimeScore(right) - captionTrackRuntimeScore(left))[0]
      || findCaptionTrackForLanguage(tracks, referenceLanguage)
      || null;
  }

  function captionTrackRuntimeScore(track) {
    const urls = getCaptionTrackUrls(track);
    if (!urls.length) return 0;
    let score = 1;
    try {
      const url = new URL(urls[0], location.href);
      if (url.searchParams.get("pot")) score += 100;
      const expire = Number(url.searchParams.get("expire"));
      if (Number.isFinite(expire) && expire * 1000 > Date.now() + 30000) score += 10;
    } catch {}
    if (track?.url || track?.captionUrl || track?.caption_url) score += 5;
    return score;
  }

  function getCaptionTrackUrls(track) {
    const values = [
      track?.url,
      track?.captionUrl,
      track?.caption_url,
      track?.baseUrl,
      track?.base_url
    ].map((value) => String(value || "").trim()).filter(Boolean);
    const unique = values.filter((value, index) => values.indexOf(value) === index);
    return unique.sort((left, right) => captionUrlScore(right) - captionUrlScore(left));
  }

  function captionUrlScore(value) {
    let score = 0;
    try {
      const url = new URL(value, location.href);
      if (url.searchParams.get("pot")) score += 100;
      if (url.searchParams.get("potc") === "1") score += 5;
      const expire = Number(url.searchParams.get("expire"));
      if (Number.isFinite(expire)) {
        score += expire * 1000 > Date.now() + 30000 ? 10 : -100;
      }
    } catch {}
    return score;
  }

  function getCaptionTrackUrl(track) {
    return getCaptionTrackUrls(track)[0] || "";
  }

  function isFalseYouTubeFlag(value) {
    return value === false || value === 0 || String(value).toLowerCase() === "false";
  }

  function isCaptionTrackExplicitlyUnservable(track) {
    return [
      track?.is_servable,
      track?.isServable,
      track?.is_serviable,
      track?.isServiable,
      track?.servable
    ].some(isFalseYouTubeFlag);
  }

  function isCaptionTrackFetchCandidate(track) {
    return Boolean(track?.languageCode && getCaptionTrackUrl(track) && !isCaptionTrackExplicitlyUnservable(track));
  }

  function getDefaultYouTubeCaptionTracks(player, renderer, tracks) {
    let audioTrack = null;
    try {
      audioTrack = player?.getAudioTrack?.() || null;
    } catch {}

    const defaultTracks = [
      audioTrack?.defaultCaptionTrack,
      audioTrack?.captionTrack,
      audioTrack?.S
    ];
    const rendererDefaultIndex = Number(renderer?.defaultCaptionTrackIndex);
    if (Number.isInteger(rendererDefaultIndex)) defaultTracks.push(renderer?.captionTracks?.[rendererDefaultIndex]);

    const audioDefaultIndex = Number(audioTrack?.defaultCaptionTrackIndex);
    if (Number.isInteger(audioDefaultIndex)) defaultTracks.push(audioTrack?.captionTracks?.[audioDefaultIndex]);

    defaultTracks.push(...tracks.filter((track) =>
      track?.isDefault === true
      || track?.is_default === true
      || track?.default === true
      || track?.isDefaultTrack === true
      || track?.is_default_track === true
    ));
    return defaultTracks.filter(Boolean);
  }

  function findCaptionTrackForLanguage(tracks, languageCode) {
    if (!languageCode) return null;
    const base = languageCode.toLowerCase().split("-")[0];
    const orderedTracks = [
      ...tracks.filter((track) => !isCaptionTrackExplicitlyUnservable(track)),
      ...tracks.filter(isCaptionTrackExplicitlyUnservable)
    ];
    return orderedTracks.find((track) => sameLanguageCode(track?.languageCode, languageCode) && track?.kind !== "asr")
      || orderedTracks.find((track) => sameLanguageCode(track?.languageCode, languageCode))
      || orderedTracks.find((track) => String(track?.languageCode || "").toLowerCase().split("-")[0] === base && track?.kind !== "asr")
      || orderedTracks.find((track) => String(track?.languageCode || "").toLowerCase().split("-")[0] === base)
      || null;
  }

  function rankCaptionTracks(player, tracks, requestedSourceLanguageCode, renderer) {
    if (!Array.isArray(tracks) || !tracks.length) return [];

    const requested = String(requestedSourceLanguageCode || "").trim();
    const requestedMode = requested.toLowerCase();
    const originalLanguage = getOriginalYouTubeAudioLanguageCode(renderer);
    const currentAudioLanguage = getCurrentYouTubeAudioLanguageCode(player);
    let active = null;
    try {
      active = player?.getOption?.("captions", "track") || player?.getOption?.("cc", "track");
    } catch {}

    const activeVssId = active?.translationLanguage ? "" : (active?.vss_id || active?.vssId || "");
    const activeLanguage = active?.translationLanguage ? "" : (active?.languageCode || active?.language_code || "");
    const usableTracks = tracks.filter(isCaptionTrackFetchCandidate);
    const ranked = [];
    const seen = new Set();
    const append = (track) => {
      if (!track || !isCaptionTrackFetchCandidate(track)) return false;
      const key = getCaptionTrackUrl(track);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      ranked.push(track);
      return true;
    };
    const appendLanguage = (languageCode) => {
      if (!languageCode) return;
      const base = String(languageCode).toLowerCase().split("-")[0];
      const matches = [
        ...usableTracks.filter((track) => sameLanguageCode(track?.languageCode, languageCode) && track?.kind !== "asr"),
        ...usableTracks.filter((track) => sameLanguageCode(track?.languageCode, languageCode)),
        ...usableTracks.filter((track) => String(track?.languageCode || "").toLowerCase().split("-")[0] === base && track?.kind !== "asr"),
        ...usableTracks.filter((track) => String(track?.languageCode || "").toLowerCase().split("-")[0] === base)
      ];
      let added = 0;
      for (const track of matches) {
        if (append(track)) added += 1;
        if (added >= 2) break;
      }
    };

    if (requested && !["auto", "audio", "original"].includes(requestedMode)) {
      appendLanguage(resolveYouTubeLanguageCode(requested, [], tracks));
    }

    if (requestedMode === "original") {
      appendLanguage(originalLanguage);
      appendLanguage(currentAudioLanguage);
    } else {
      appendLanguage(currentAudioLanguage);
      appendLanguage(originalLanguage);
    }

    getDefaultYouTubeCaptionTracks(player, renderer, tracks).forEach(append);
    appendLanguage("en");
    usableTracks
      .filter((track) => activeVssId && (track?.vssId || track?.vss_id || "") === activeVssId)
      .forEach(append);
    appendLanguage(activeLanguage);
    usableTracks.filter((track) => track?.kind !== "asr").forEach(append);
    usableTracks.forEach(append);
    return ranked;
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
