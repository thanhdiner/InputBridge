(() => {
  const INPUTBRIDGE_FLAG = "__inputBridgeLoaded";
  if (window[INPUTBRIDGE_FLAG]) return;
  window[INPUTBRIDGE_FLAG] = true;

  const LANGUAGE_CATALOG = globalThis.InputBridgeLanguageCatalog;
  const IS_TOP_FRAME = window === window.top;
  const videoTrackBindings = new WeakSet();
  const videoElementBindings = new WeakSet();

  const SKIP_INPUT_TYPES = new Set([
    "password",
    "email",
    "tel",
    "number",
    "url",
    "date",
    "datetime-local",
    "month",
    "week",
    "time",
    "color",
    "file",
    "range",
    "checkbox",
    "radio",
    "submit",
    "button",
    "hidden"
  ]);

  const SHADOW_ATTACHED_EVENT = "__inputbridge_shadow_attached__";
  const YT_CAPTION_REQUEST = "__inputbridge_request_youtube_captions__";
  const YT_CAPTION_CANCEL = "__inputbridge_cancel_youtube_captions__";
  const YT_CAPTION_RESPONSE = "__inputbridge_youtube_captions__";
  const VIDEO_CAPTION_CLIENT_ID = globalThis.crypto?.randomUUID?.()
    || `ib_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const VIDEO_SUBTITLE_PREFETCH_SECONDS = 28;
  const VIDEO_SUBTITLE_PREFETCH_BATCH = 8;
  const observedRoots = new WeakSet();
  const rootObservers = new WeakMap();
  const inlineSelectOwners = new WeakSet();

  const BOOT_SETTINGS = {
    enabled: true,
    targetLanguage: "English",
    mode: "translate",
    tone: "natural",
    autoMode: "preview",
    livePreview: true,
    debounceMs: 700,
    minChars: 1,
    acceptWithTab: true,
    showBackTranslation: true,
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
    videoSubtitleTranslationFontSize: 26,
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
  };

  const VIDEO_SUBTITLE_STYLE_PRESETS = Object.freeze({
    anime: Object.freeze({
      videoSubtitleSourceFontSize: 30,
      videoSubtitleTranslationFontSize: 26,
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
    }),
    clean: Object.freeze({
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
    }),
    glass: Object.freeze({
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
  });

  let settings = { ...BOOT_SETTINGS };
  let activeEl = null;
  let previewEl = null;
  let toastEl = null;
  let debounceTimer = null;
  let typingDelayTimer = null;
  let autoReplaceTimer = null;
  let isComposing = false;
  let requestSeq = 0;
  let currentPreview = null;
  let lastOriginal = "";
  let lastApplied = null;
  let lastAppliedTimer = null;
  let suppressNextInput = false;
  let showSettingsPanel = false;
  let sendInProgress = false;
  let bypassNextSendClick = false;
  let previewInteractionUntil = 0;
  let suppressTransformUntil = 0;
  let selectionIconEl = null;
  let selectionCardEl = null;
  let selectionState = null;
  let selectionTimer = null;
  let selectionValidationTimer = null;
  let selectionRequestSeq = 0;
  let selectionInteractionUntil = 0;
  let selectionSettingsOpen = false;
  let selectionExplanation = "";
  let selectionExplanationLoading = false;
  let selectionExplanationError = "";
  let selectionIsFavorite = false;
  let selectionCardPlacement = "";
  let videoSubtitleObserver = null;
  let videoSubtitleEl = null;
  let videoSubtitleTimer = null;
  let videoSubtitleTimerDueAt = 0;
  let videoSubtitleEmptyTimer = null;
  let videoSubtitleKaraokeFrame = 0;
  let videoSubtitleKaraokeLoopRunning = false;
  let videoSubtitleKaraokeLastTick = 0;
  let videoSubtitleKaraokeActiveIndex = -1;
  let videoSubtitleLastCurrentTime = 0;
  let currentVideoSubtitleCueId = "";
  let videoSubtitleLiveKaraokeCandidate = "";
  let videoSubtitleLiveKaraokeDisplayText = "";
  let videoSubtitleLiveKaraokeCandidateWordCount = 0;
  let videoSubtitleLiveKaraokeLastArrivalAt = 0;
  let videoSubtitleLiveKaraokeMsPerWord = 245;
  let videoSubtitleLiveKaraokeNextStepAt = 0;
  let videoSubtitleLiveKaraokeTargetIndex = -1;
  let videoSubtitleVadAudioContext = null;
  let videoSubtitleVadStream = null;
  let videoSubtitleVadSource = null;
  let videoSubtitleVadHighpass = null;
  let videoSubtitleVadLowpass = null;
  let videoSubtitleVadAnalyser = null;
  let videoSubtitleVadBuffer = null;
  let videoSubtitleVadVideo = null;
  let videoSubtitleVadRetryAfter = 0;
  let videoSubtitleVadAvailable = false;
  let videoSubtitleVadSpeaking = true;
  let videoSubtitleVadNoiseFloor = 0.012;
  let videoSubtitleVadPeak = 0.06;
  let videoSubtitleVadRms = 0;
  let videoSubtitleVadThreshold = 0.025;
  let videoSubtitleVadSilenceSince = 0;
  let videoSubtitleVadLastSampleAt = 0;
  let videoSubtitleSpeechClockMs = 0;
  let videoSubtitleSpeechClockLastAt = 0;
  let videoPlayerCaptionCandidateText = "";
  let videoPlayerCaptionCandidateChangedAt = 0;
  let videoPlayerCaptionCandidateStartedAt = 0;
  let videoPlayerCaptionCandidateSpeechClockStartedAt = 0;
  let videoPlayerCaptionCommittedText = "";
  let videoPlayerCaptionLastCommittedAt = 0;
  let videoPlayerCaptionExpiredText = "";
  let videoSubtitleRequestSeq = 0;
  let lastVideoCaptionText = "";
  let videoSubtitleEventsBound = false;
  let videoSubtitleWordHoverTimer = null;
  let videoSubtitleWordHoverSeq = 0;
  let videoSubtitleWordHoverEl = null;
  let videoSubtitleWordHoverEls = [];
  let videoSubtitleWordHoverUsesPhrase = false;
  let videoSubtitleSelectionActive = false;
  let videoSubtitleDragPositions = null;
  let videoSubtitlePositionLoadPromise = null;
  let videoSubtitlePositionSaveTimer = null;
  let videoSubtitleDragState = null;
  let videoSubtitleHoverPauseState = null;
  let videoSubtitleHoverResumeTimer = null;
  const videoSubtitleWordCache = new Map();
  let videoCaptionTimeline = [];
  let videoCaptionTranslatedTimeline = [];
  let videoCaptionTranslationEngine = "";
  let videoCaptionUsesPlayerTrack = false;
  let videoCaptionTimelineKey = "";
  let videoCaptionTimelineRequestId = 0;
  let videoCaptionTimelineRequestKey = "";
  let videoCaptionTimelineLoading = false;
  let videoCaptionTimelineRetryCount = 0;
  let videoCaptionTimelineNextRetryAt = 0;
  let videoCaptionTimelineError = "";
  let lastVideoCaptionTimelineIndex = -1;
  let videoCaptionAvailableTracks = [];
  let videoCaptionActiveSourceLanguageCode = "";
  let youtubeVideoControlObserver = null;
  let youtubeVideoControlSyncFrame = 0;
  let youtubeNativeCaptionStateObserver = null;
  let youtubeNativeCaptionStateButton = null;
  let youtubeNativeCaptionStateSyncFrame = 0;
  let youtubeVideoControlButtonEl = null;
  let youtubeVideoDubbingButtonEl = null;
  let youtubeVideoControlPanelEl = null;
  const videoCaptionTranslations = new Map();
  const videoCaptionPending = new Set();
  const videoSubtitleElementSessionIds = new WeakMap();
  const videoSubtitleTemporarilyDisabledSessions = new Set();
  let videoSubtitleElementSessionId = 0;
  let videoDubbingTimer = null;
  let videoDubbingLiveTimer = null;
  let videoDubbingLivePendingCue = null;
  let videoDubbingLiveQueuedCues = [];
  let videoDubbingUtterance = null;
  let videoDubbingAudio = null;
  let videoDubbingAudioPendingKey = "";
  let videoDubbingAudioPendingCue = null;
  let videoDubbingAudioPendingStartedAt = 0;
  let videoDubbingAudioPendingTimer = null;
  let videoDubbingActiveCueKey = "";
  let videoDubbingLastLiveCueKey = "";
  let videoDubbingLastLiveSourceText = "";
  let videoDubbingLastLiveSpokenText = "";
  let videoDubbingScheduledCueKey = "";
  let videoDubbingToken = 0;
  let videoDubbingVideo = null;
  let videoDubbingSavedVolume = null;
  let videoDubbingResumeAfterSeekVideo = null;
  let videoDubbingSessionId = 0;
  let videoDubbingSessionState = "idle";
  let videoDubbingSessionVideo = null;
  let videoDubbingSessionWasPlaying = false;
  let videoDubbingSessionStatus = "";
  let extensionTornDown = false;
  let videoDubbingSessionStartIndex = -1;
  let videoDubbingBackgroundBufferPromise = null;
  let videoDubbingBackgroundBufferTimer = null;
  let videoDubbingBackgroundBufferNextCheckAt = 0;
  const videoDubbingConsumedCueKeys = new Set();
  const videoDubbingAudioCache = new Map();
  const videoDubbingAudioRequests = new Map();
  const videoDubbingAudioReadyWaiters = new Map();
  const videoDubbingAudioFailures = new Map();
  const videoDubbingTranslationFailures = new Map();
  const videoDubbingVoicesByLanguage = new Map();
  const videoDubbingVoiceRequests = new Map();
  const VIDEO_DUBBING_AUDIO_CACHE_LIMIT = 48;
  const VIDEO_DUBBING_INITIAL_BUFFER_SECONDS = 24;
  const VIDEO_DUBBING_BACKGROUND_BUFFER_SECONDS = 42;
  const VIDEO_DUBBING_INITIAL_BUFFER_MAX_CUES = 16;
  const VIDEO_DUBBING_BACKGROUND_BUFFER_MAX_CUES = 20;
  const VIDEO_DUBBING_MAX_PLAYBACK_RATE = 4;
  const VIDEO_DUBBING_TIMELINE_TIMEOUT_MS = 6000;
  const VIDEO_DUBBING_TRANSLATION_TIMEOUT_MS = 25000;
  const VIDEO_DUBBING_AUDIO_BUFFER_TIMEOUT_MS = 60000;
  const VIDEO_DUBBING_LIVE_MAX_WAIT_MS = 1400;
  const VIDEO_DUBBING_LIVE_QUEUE_LIMIT = 3;
  const VIDEO_PLAYER_CAPTION_INITIAL_COMMIT_MS = 70;
  const VIDEO_PLAYER_CAPTION_REFRESH_MS = 240;
  const VIDEO_SUBTITLE_KARAOKE_FRAME_MS = 48;
  const VIDEO_SUBTITLE_SYNC_OFFSET = -0.08;
  const VIDEO_SUBTITLE_VAD_SILENCE_HOLD_MS = 170;
  const VIDEO_SUBTITLE_VAD_MIN_ENERGY = 0.004;
  const VIDEO_SUBTITLE_LIVE_SYNC_LEAD_WORDS = 2.4;
  const VIDEO_SUBTITLE_POSITION_STORAGE_KEY = "videoSubtitlePositionsByOrigin";
  const VIDEO_SUBTITLE_POSITION_LAYOUT_VERSION_KEY = "videoSubtitlePositionLayoutVersion";
  const VIDEO_SUBTITLE_POSITION_LAYOUT_VERSION = 2;

  init();

  function init() {
    attachGlobalListeners();
    observeEventRoot(document);
    scanForOpenShadowRoots(document);
    primeActiveElement("boot");

    getSettings().then((next) => {
      settings = { ...BOOT_SETTINGS, ...(next || {}) };
      primeActiveElement("settings-loaded");
      syncVideoSubtitleFeature();
    }).catch(() => {
      primeActiveElement("settings-fallback");
      stopVideoSubtitleFeature();
    });
  }

  function primeActiveElement(reason) {
    const el = findEditable(getDeepActiveElement());
    if (!el) return;

    activeEl = el;
    lastOriginal = getEditableText(el);
    currentPreview = null;

    const text = lastOriginal.trim();
    if (shouldProcess(text)) scheduleTransform(reason);
  }

  function attachGlobalListeners() {
    window.addEventListener("scroll", onViewportScroll, true);
    window.addEventListener("resize", repositionAll, true);
    window.addEventListener("resize", () => applyVideoSubtitleItemPositions(), true);
    window.addEventListener("message", onVideoCaptionBridgeMessage);
    document.addEventListener("pointerdown", onYouTubeControlDocumentPointerDown, true);
    document.addEventListener("keydown", onYouTubeControlDocumentKeyDown, true);
    document.addEventListener("loadedmetadata", onAnyVideoMetadataLoaded, true);
    document.addEventListener("yt-navigate-start", onYouTubeVideoControlNavigation, true);
    document.addEventListener("yt-navigate-finish", onYouTubeVideoControlNavigation, true);

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "IB_SETTINGS_UPDATED") refreshSettings("settings-updated");
      if (message?.type === "IB_RESET_VIDEO_SUBTITLE_POSITIONS") {
        videoSubtitleDragPositions = null;
        applyVideoSubtitleItemPositions();
      }
      if (message?.type === "IB_GET_CURRENT_VIDEO_SUBTITLE_SESSION") {
        sendResponse?.({ ok: true, data: getCurrentVideoSubtitleSessionState() });
      }
      if (message?.type === "IB_TOGGLE_CURRENT_VIDEO_SUBTITLES") {
        sendResponse?.({ ok: true, data: toggleCurrentVideoSubtitleTemporaryDisabled() });
      }
    });

    chrome.storage?.onChanged?.addListener((changes, areaName) => {
      if (areaName === "sync" && Object.keys(changes || {}).length) {
        refreshSettings("storage-updated");
      }
    });
  }

  function refreshSettings(reason) {
    if (extensionTornDown) return;
    getSettings().then((next) => {
      if (extensionTornDown) return;
      const previousVideoTarget = settings.videoSubtitleTargetLanguage;
      const previousVideoSource = settings.videoSubtitleSourceLanguage;
      const previousVideoShowSource = Boolean(settings.videoSubtitleShowSource);
      const previousVideoShowTranslation = settings.videoSubtitleShowTranslation !== false;
      const previousVideoEngine = settings.videoSubtitleEngine;
      const previousVideoDubbingEnabled = Boolean(settings.videoDubbingEnabled);
      const previousVideoDubbingOriginalVolume = Number(settings.videoDubbingOriginalVolume ?? 0.2);
      const previousVideoDubbingVoiceMap = JSON.stringify(settings.videoDubbingVoiceByLanguage || {});
      settings = { ...BOOT_SETTINGS, ...(next || {}) };
      const videoDubbingWasDisabled = previousVideoDubbingEnabled && !Boolean(settings.videoDubbingEnabled);
      const videoDubbingVoiceChanged = previousVideoDubbingVoiceMap !== JSON.stringify(settings.videoDubbingVoiceByLanguage || {});
      const videoDubbingOriginalVolumeChanged = Math.abs(
        previousVideoDubbingOriginalVolume - Number(settings.videoDubbingOriginalVolume ?? 0.2)
      ) > 0.001;
      const videoDubbingSessionInvalidated = Boolean(
        videoDubbingWasDisabled
        || videoDubbingVoiceChanged
        || (previousVideoTarget && previousVideoTarget !== settings.videoSubtitleTargetLanguage)
        || (previousVideoSource && previousVideoSource !== settings.videoSubtitleSourceLanguage)
        || (previousVideoEngine && previousVideoEngine !== settings.videoSubtitleEngine)
        || !settings.enabled
      );
      if (videoDubbingWasDisabled || videoDubbingVoiceChanged) resetVideoDubbingLiveState();
      if (videoDubbingSessionInvalidated && isVideoDubbingSessionRequested()) {
        stopVideoDubbingSession({ resumeOriginal: true });
      } else if (videoDubbingOriginalVolumeChanged && isVideoDubbingSessionRequested()) {
        // Volume is safe to update in place. Stopping here would strand a video
        // that is temporarily paused by the alignment hold.
        const video = videoDubbingSessionVideo || getPrimaryVideo();
        restoreVideoDubbingOriginalVolume();
        if (video && isVideoDubbingSessionArmed()) applyVideoDubbingOriginalVolume(video);
      } else if (
        previousVideoDubbingEnabled !== Boolean(settings.videoDubbingEnabled)
        || videoDubbingOriginalVolumeChanged
        || previousVideoTarget !== settings.videoSubtitleTargetLanguage
        || videoDubbingVoiceChanged
      ) {
        stopVideoDubbing(true);
      }
      if (
        (previousVideoTarget && previousVideoTarget !== settings.videoSubtitleTargetLanguage)
        || (previousVideoSource && previousVideoSource !== settings.videoSubtitleSourceLanguage)
        || previousVideoShowSource !== Boolean(settings.videoSubtitleShowSource)
        || previousVideoShowTranslation !== (settings.videoSubtitleShowTranslation !== false)
        || (previousVideoEngine && previousVideoEngine !== settings.videoSubtitleEngine)
      ) {
        videoDubbingConsumedCueKeys.clear();
        resetVideoDubbingLiveState();
        videoCaptionTimeline = [];
        videoCaptionTranslatedTimeline = [];
        videoCaptionTranslationEngine = "";
        videoCaptionUsesPlayerTrack = false;
        videoCaptionTimelineKey = "";
        videoCaptionTimelineRequestKey = "";
        videoCaptionTimelineLoading = false;
        videoCaptionTimelineRetryCount = 0;
        videoCaptionTimelineNextRetryAt = 0;
        videoCaptionTimelineError = "";
        resetYouTubeCaptionReader();
        videoPlayerCaptionExpiredText = "";
        videoCaptionTranslations.clear();
        videoCaptionPending.clear();
        hideVideoSubtitleOverlay();
      }
      hidePreview();
      if (!settings.enabled || !settings.selectionTranslation) hideSelectionUi();
      primeActiveElement(reason);
      syncVideoSubtitleFeature();
    }).catch(() => {});
  }

  function isVideoDubbingSessionPreparing() {
    return ["timeline", "translating", "buffering"].includes(videoDubbingSessionState);
  }

  function isVideoDubbingSessionArmed() {
    return ["ready", "running"].includes(videoDubbingSessionState);
  }

  function isVideoDubbingSessionRequested() {
    return isVideoDubbingSessionPreparing() || isVideoDubbingSessionArmed();
  }

  function shouldRunVideoSubtitleFeature() {
    return Boolean(
      !extensionTornDown
      &&
      IS_TOP_FRAME
      && settings.enabled
      && (
        shouldDisplayCurrentVideoSubtitles()
        || isVideoDubbingSessionRequested()
      )
    );
  }

  function syncVideoSubtitleFeature() {
    if (extensionTornDown) return;
    syncYouTubeVideoControl();
    const active = shouldRunVideoSubtitleFeature();
    setNativeVideoCaptionsHidden(Boolean(
      shouldDisplayCurrentVideoSubtitles()
      || isVideoDubbingSessionRequested()
    ));
    if (active) startVideoSubtitleFeature();
    else stopVideoSubtitleFeature();
  }

  function startVideoSubtitleFeature() {
    if (!IS_TOP_FRAME) return;
    setNativeVideoCaptionsHidden(Boolean(
      shouldDisplayCurrentVideoSubtitles()
      || isVideoDubbingSessionRequested()
    ));

    if (!videoSubtitleObserver && document.documentElement) {
      videoSubtitleObserver = new MutationObserver(() => {
        bindVideoCaptionSources();
        // Caption DOM already changed, so read it in the next task without an artificial wait.
        scheduleVideoCaptionRead(0);
      });
      videoSubtitleObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    if (!videoSubtitleEventsBound) {
      videoSubtitleEventsBound = true;
      document.addEventListener("yt-navigate-finish", onVideoSubtitleNavigation, true);
      document.addEventListener("fullscreenchange", onVideoSubtitleFullscreen, true);
      window.addEventListener("resize", onVideoSubtitleViewportChange, true);
    }

    bindVideoCaptionSources();
    ensureYouTubeVideoControl();
    ensureVideoSubtitleOverlay();
    requestYouTubeCaptionTimeline();
    scheduleVideoCaptionRead(0);
    syncVideoDubbing("feature-start");
  }

  function stopVideoSubtitleFeature() {
    videoDubbingResumeAfterSeekVideo = null;
    cancelYouTubeCaptionTimelineRequest();
    videoSubtitleObserver?.disconnect();
    videoSubtitleObserver = null;
    clearTimeout(videoSubtitleTimer);
    clearTimeout(videoSubtitleEmptyTimer);
    videoSubtitleTimer = null;
    videoSubtitleTimerDueAt = 0;
    videoSubtitleEmptyTimer = null;
    resetYouTubeCaptionReader();
    videoPlayerCaptionExpiredText = "";
    videoSubtitleRequestSeq += 1;
    lastVideoCaptionText = "";
    lastVideoCaptionTimelineIndex = -1;
    videoCaptionTimeline = [];
    videoCaptionTranslatedTimeline = [];
    videoCaptionTranslationEngine = "";
    videoCaptionUsesPlayerTrack = false;
    videoCaptionTimelineKey = "";
    videoCaptionTimelineRequestKey = "";
    videoCaptionTimelineLoading = false;
    videoCaptionTimelineRetryCount = 0;
    videoCaptionTimelineNextRetryAt = 0;
    videoCaptionTimelineError = "";
    videoCaptionTranslations.clear();
    videoCaptionPending.clear();
    videoDubbingConsumedCueKeys.clear();
    resetVideoDubbingLiveState();
    stopVideoDubbing(true);
    setNativeVideoCaptionsHidden(false);
    stopVideoSubtitleKaraokeLoop();
    teardownVideoSubtitleAudioVad();
    releaseVideoSubtitleHoverPause();
    videoSubtitleEl?.remove();
    videoSubtitleEl = null;
  }

  function onVideoSubtitleNavigation() {
    videoDubbingResumeAfterSeekVideo = null;
    if (!shouldRunVideoSubtitleFeature()) return;
    const needsFeatureRestart = !videoSubtitleObserver;
    videoDubbingConsumedCueKeys.clear();
    resetVideoDubbingLiveState();
    stopVideoDubbing(true);
    lastVideoCaptionText = "";
    lastVideoCaptionTimelineIndex = -1;
    videoCaptionTimeline = [];
    videoCaptionTranslatedTimeline = [];
    videoCaptionTranslationEngine = "";
    videoCaptionUsesPlayerTrack = false;
    videoCaptionTimelineKey = "";
    videoCaptionTimelineRequestKey = "";
    videoCaptionTimelineLoading = false;
    videoCaptionTimelineRetryCount = 0;
    videoCaptionTimelineNextRetryAt = 0;
    videoCaptionTimelineError = "";
    resetYouTubeCaptionReader();
    videoPlayerCaptionExpiredText = "";
    videoCaptionTranslations.clear();
    videoCaptionPending.clear();
    setNativeVideoCaptionsHidden(Boolean(
      shouldDisplayCurrentVideoSubtitles()
      || isVideoDubbingSessionRequested()
    ));
    if (needsFeatureRestart) {
      startVideoSubtitleFeature();
      return;
    }
    bindVideoCaptionSources();
    ensureYouTubeVideoControl();
    ensureVideoSubtitleOverlay();
    window.setTimeout(requestYouTubeCaptionTimeline, 40);
    scheduleVideoCaptionRead(0);
  }

  function onVideoSubtitleFullscreen() {
    if (!shouldRunVideoSubtitleFeature()) return;
    ensureVideoSubtitleOverlay(true);
    scheduleVideoCaptionRead(0);
  }

  function onVideoSubtitleViewportChange() {
    if (!shouldRunVideoSubtitleFeature()) return;
    ensureVideoSubtitleOverlay(true);
  }

  function onAnyVideoMetadataLoaded(event) {
    if (!(event.target instanceof HTMLVideoElement)) return;
    syncVideoSubtitleFeature();
  }

  function bindVideoCaptionSources() {
    document.querySelectorAll("video").forEach((video) => {
      if (!videoElementBindings.has(video)) {
        videoElementBindings.add(video);
        video.addEventListener("seeking", () => {
          if (video !== getPrimaryVideo() && video !== videoDubbingVideo) return;
          const dubbingSessionWasRequested = isVideoDubbingSessionRequested();
          const shouldResumeAfterSeek = Boolean(
            videoDubbingResumeAfterSeekVideo === video
            || (
              dubbingSessionWasRequested
              && (
                videoDubbingSessionWasPlaying
                || !video.paused
                || videoDubbingSessionState === "running"
              )
            )
          );
          if (dubbingSessionWasRequested) {
            stopVideoDubbingSession({ resumeOriginal: false });
          }
          videoDubbingConsumedCueKeys.clear();
          resetVideoDubbingLiveState();
          stopVideoDubbing(true);
          videoPlayerCaptionExpiredText = readYouTubeCaptionCandidate()
            || videoPlayerCaptionCommittedText
            || lastVideoCaptionText;
          resetYouTubeCaptionReader();
          lastVideoCaptionText = "";
          hideVideoSubtitleOverlay();
          // stopVideoDubbingSession clears terminal resume intents. Set this
          // one afterwards, and preserve it across repeated seeking events.
          videoDubbingResumeAfterSeekVideo = shouldResumeAfterSeek ? video : null;
        });
        video.addEventListener("seeked", () => {
          const shouldResumeAfterSeek = video === videoDubbingResumeAfterSeekVideo;
          if (shouldResumeAfterSeek) videoDubbingResumeAfterSeekVideo = null;
          resetYouTubeCaptionReader();
          lastVideoCaptionText = "";
          hideVideoSubtitleOverlay();
          scheduleVideoCaptionRead(0);
          syncVideoDubbing("seeked");
          if (shouldResumeAfterSeek) {
            void startVideoDubbingSession({ resumePlayback: true });
          }
        });
        video.addEventListener("loadedmetadata", () => {
          requestYouTubeCaptionTimeline();
          scheduleVideoCaptionRead(0);
          syncVideoDubbing("metadata");
        });
        video.addEventListener("timeupdate", () => {
          scheduleVideoCaptionRead(0);
          scheduleVideoDubbingBackgroundBuffer();
          syncVideoDubbing("timeupdate");
        });
        video.addEventListener("playing", () => {
          if (video === videoDubbingSessionVideo && isVideoDubbingSessionPreparing()) {
            try { video.pause(); } catch {}
            return;
          }
          if (video === videoDubbingSessionVideo && videoDubbingSessionState === "ready") {
            setVideoDubbingSessionState("running", "Đang lồng tiếng");
          }
          requestYouTubeCaptionTimeline();
          scheduleVideoCaptionRead(0);
          scheduleVideoDubbingBackgroundBuffer(0, { force: true });
          if (hasPendingVideoDubbingLiveCue()) schedulePendingLiveVideoDubbing(0);
          syncVideoDubbing("playing");
        });
        video.addEventListener("pause", () => {
          if (video === videoDubbingResumeAfterSeekVideo) {
            if (video.seeking) return;
            videoDubbingResumeAfterSeekVideo = null;
          }
          if (video !== getPrimaryVideo() && video !== videoDubbingVideo) return;
          stopVideoDubbing(true);
          if (video === videoDubbingSessionVideo && videoDubbingSessionState === "running") {
            videoDubbingSessionWasPlaying = false;
            setVideoDubbingSessionState("ready", "Đã chuẩn bị · bấm Play để tiếp tục");
          }
        });
        video.addEventListener("ratechange", () => {
          if (video !== getPrimaryVideo() && video !== videoDubbingVideo) return;
          stopVideoDubbing(false);
          syncVideoDubbing("ratechange");
        });
        video.addEventListener("ended", () => {
          if (video === videoDubbingResumeAfterSeekVideo) videoDubbingResumeAfterSeekVideo = null;
          if (video !== getPrimaryVideo() && video !== videoDubbingVideo) return;
          if (isVideoDubbingSessionRequested()) stopVideoDubbingSession({ resumeOriginal: false });
          else stopVideoDubbing(true);
        });
      }

      for (const track of video.textTracks || []) {
        if (videoTrackBindings.has(track)) continue;
        videoTrackBindings.add(track);
        track.addEventListener?.("cuechange", () => scheduleVideoCaptionRead(0));
      }
    });
  }

  function onVideoCaptionBridgeMessage(event) {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "inputbridge-main" || data.type !== YT_CAPTION_RESPONSE) return;
    if (data.clientId && data.clientId !== VIDEO_CAPTION_CLIENT_ID) return;
    if (data.requestId !== videoCaptionTimelineRequestId) return;
    videoCaptionTimelineLoading = false;

    const normalizeTimeline = (items) => Array.isArray(items)
      ? items
          .map((cue) => ({
            start: Number(cue?.start || 0),
            end: Number(cue?.end || 0),
            text: normalizeVideoCaptionText(cue?.text),
            segments: Array.isArray(cue?.segments)
              ? cue.segments.map((seg) => ({
                  text: String(seg?.text || ""),
                  offset: Number(seg?.offset || 0)
                }))
              : []
          }))
          .filter((cue) => cue.text && cue.end > cue.start)
      : [];
    const cues = normalizeTimeline(data.cues);
    const translatedCues = normalizeTimeline(data.translatedCues);
    const nextKey = `${data.videoId || location.href}\u0000${data.languageCode || ""}\u0000${data.targetLanguageCode || ""}`;
    const sameTimelineKey = nextKey === videoCaptionTimelineKey;

    if (nextKey !== videoCaptionTimelineKey) {
      videoCaptionTranslations.clear();
      videoCaptionPending.clear();
      videoDubbingConsumedCueKeys.clear();
      resetVideoDubbingLiveState();
    }

    videoCaptionTimelineKey = nextKey;
    videoCaptionTimelineRetryCount = cues.length ? 0 : videoCaptionTimelineRetryCount + 1;
    if (cues.length) {
      videoCaptionTimelineNextRetryAt = 0;
      videoCaptionTimelineError = "";
    } else {
      const requestedSource = String(settings.videoSubtitleSourceLanguage || "auto");
      const activeSource = data.activeSourceLanguageCode || requestedSource;
      const sourceTrack = (Array.isArray(data.availableTracks) ? data.availableTracks : videoCaptionAvailableTracks)
        .find((track) => sameLanguageCodeForUi(track?.languageCode, activeSource));
      const sourceLabel = sourceTrack?.label || LANGUAGE_CATALOG?.nameFor(activeSource, activeSource) || activeSource;
      videoCaptionTimelineError = data.error
        ? `Không tải được phụ đề: ${data.error}`
        : `Track ${sourceLabel} không có dữ liệu phụ đề`;
      const retryDelays = [2000, 6000, 15000];
      const delay = retryDelays[Math.min(videoCaptionTimelineRetryCount - 1, retryDelays.length - 1)];
      videoCaptionTimelineNextRetryAt = Date.now() + delay;
      // An empty/retrying player response is metadata, not permission to cut a
      // sentence that is already playing. Older code stopped TTS here and lost
      // the live cue after only its first few words.
      if (!sameTimelineKey || !videoCaptionTimeline.length) hideVideoSubtitleOverlay();
    }
    // Keep a valid timeline when YouTube emits a later empty response for the
    // same track (this happens while the player refreshes its caption token).
    if (cues.length || !sameTimelineKey || !videoCaptionTimeline.length) {
      videoCaptionTimeline = cues;
      videoCaptionTranslatedTimeline = translatedCues;
    }
    videoCaptionTranslationEngine = data.translationEngine || "";
    videoCaptionUsesPlayerTrack = Boolean(data.playerTrackActivated);
    videoCaptionAvailableTracks = Array.isArray(data.availableTracks) ? data.availableTracks : videoCaptionAvailableTracks;
    videoCaptionActiveSourceLanguageCode = data.activeSourceLanguageCode || "";
    lastVideoCaptionTimelineIndex = -1;
    updateYouTubeVideoControl();
    if (!isVideoDubbingSessionPreparing() && !videoCaptionTranslatedTimeline.length) {
      const video = getPrimaryVideo();
      const currentIndex = findTimelineCueIndex(Number(video?.currentTime || 0));
      if (currentIndex >= 0) {
        requestVideoCaptionCueTranslation(currentIndex);
        window.setTimeout(() => prefetchVideoCaptionWindow(currentIndex + 1), 80);
      } else {
        prefetchVideoCaptionWindow(0);
      }
    }
    scheduleVideoCaptionRead(0);
    syncVideoDubbing("timeline-ready");
    const manualRetryLimit = isVideoDubbingSessionPreparing() ? 1 : 2;
    if (!cues.length && videoCaptionTimelineRetryCount <= manualRetryLimit) {
      const retryDelay = Math.max(500, videoCaptionTimelineNextRetryAt - Date.now());
      window.setTimeout(() => requestYouTubeCaptionTimeline(true), retryDelay);
    }
  }

  function cancelYouTubeCaptionTimelineRequest() {
    videoCaptionTimelineRequestId += 1;
    videoCaptionTimelineLoading = false;
    videoCaptionTimelineRequestKey = "";
    if (/(^|\.)youtube\.com$/i.test(location.hostname)) {
      window.postMessage({
        source: "inputbridge-content",
        type: YT_CAPTION_CANCEL,
        clientId: VIDEO_CAPTION_CLIENT_ID
      }, "*");
    }
  }

  function requestYouTubeCaptionTimeline(force = false) {
    if (extensionTornDown || checkAndTeardownIfOrphaned()) return;
    if (!shouldRunVideoSubtitleFeature()) return;
    if (!/(^|\.)youtube\.com$/i.test(location.hostname)) return;

    const targetLanguageCode = LANGUAGE_CATALOG?.codeFor(
      settings.videoSubtitleTargetLanguage || "Vietnamese",
      "vi"
    ) || "vi";
    const videoId = new URL(location.href).searchParams.get("v") || location.pathname;
    const sourceLanguageCode = settings.videoSubtitleSourceLanguage || "auto";
    const visibilityMode = `${settings.videoSubtitleShowSource ? "source" : ""}:${settings.videoSubtitleShowTranslation !== false ? "translation" : ""}`;
    const requestKey = `${videoId}\u0000${sourceLanguageCode}\u0000${targetLanguageCode}\u0000${visibilityMode}`;
    if (!force && videoCaptionTimelineNextRetryAt > Date.now() && videoCaptionTimelineRequestKey === requestKey) return;
    if (force && videoCaptionTimelineRetryCount > 2 && videoCaptionTimelineRequestKey === requestKey) return;
    if (!force && videoCaptionTimelineLoading && videoCaptionTimelineRequestKey === requestKey) return;
    if (!force && videoCaptionTimelineRequestKey === requestKey && videoCaptionTimeline.length) return;

    videoCaptionTimelineRequestKey = requestKey;
    videoCaptionTimelineLoading = true;
    const requestId = ++videoCaptionTimelineRequestId;
    window.postMessage({
      source: "inputbridge-content",
      type: YT_CAPTION_REQUEST,
      clientId: VIDEO_CAPTION_CLIENT_ID,
      requestId,
      targetLanguageCode,
      sourceLanguageCode: settings.videoSubtitleSourceLanguage || "auto",
      bilingual: Boolean(settings.videoSubtitleShowSource),
      customTranslation: true
    }, "*");
  }

  function getPrimaryVideo() {
    return [...document.querySelectorAll("video")]
      .filter((video) => video.readyState > 0)
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        return (rightRect.width * rightRect.height) - (leftRect.width * leftRect.height);
      })[0] || null;
  }

  function getVideoSubtitleSessionKey(video = getPrimaryVideo()) {
    if (!video) return "";

    if (/(^|\.)youtube\.com$/i.test(location.hostname)) {
      const url = new URL(location.href);
      const pathVideoId = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/i)?.[1] || "";
      const videoId = url.searchParams.get("v") || pathVideoId;
      if (videoId) return `youtube:${videoId}`;
    }

    let elementId = videoSubtitleElementSessionIds.get(video);
    if (!elementId) {
      elementId = ++videoSubtitleElementSessionId;
      videoSubtitleElementSessionIds.set(video, elementId);
    }
    const pageKey = `${location.origin}${location.pathname}${location.search}`;
    const sourceKey = String(video.currentSrc || video.src || "");
    return `html5:${pageKey}\u0000${elementId}\u0000${sourceKey}`;
  }

  function getCurrentVideoSubtitleSessionState() {
    const video = getPrimaryVideo();
    const sessionKey = getVideoSubtitleSessionKey(video);
    const temporarilyDisabled = Boolean(
      sessionKey && videoSubtitleTemporarilyDisabledSessions.has(sessionKey)
    );
    const globallyEnabled = Boolean(settings.enabled && settings.videoSubtitleEnabled);
    const requiresNativeCaptions = isYouTubeVideoPage();
    const nativeCaptionsEnabled = isCurrentPlayerCaptionTrackEnabled();
    return {
      available: Boolean(video && sessionKey),
      temporarilyDisabled,
      globallyEnabled,
      requiresNativeCaptions,
      nativeCaptionsEnabled,
      effectiveEnabled: Boolean(globallyEnabled && !temporarilyDisabled && nativeCaptionsEnabled)
    };
  }

  function isCurrentVideoSubtitleTemporarilyDisabled() {
    return getCurrentVideoSubtitleSessionState().temporarilyDisabled;
  }

  function isCurrentPlayerCaptionTrackEnabled() {
    if (!isYouTubeVideoPage()) return true;
    const button = document.querySelector(".html5-video-player .ytp-subtitles-button");
    if (!button) return false;
    const pressed = button.getAttribute("aria-pressed");
    if (pressed !== null) return pressed === "true";
    return button.classList.contains("ytp-subtitles-button-active");
  }

  function shouldDisplayCurrentVideoSubtitles() {
    return Boolean(
      settings.videoSubtitleEnabled
      && !isCurrentVideoSubtitleTemporarilyDisabled()
      && isCurrentPlayerCaptionTrackEnabled()
    );
  }

  function toggleCurrentVideoSubtitleTemporaryDisabled() {
    const video = getPrimaryVideo();
    const sessionKey = getVideoSubtitleSessionKey(video);
    if (!sessionKey) return getCurrentVideoSubtitleSessionState();

    const temporarilyDisabled = !videoSubtitleTemporarilyDisabledSessions.has(sessionKey);
    if (temporarilyDisabled) {
      if (videoSubtitleTemporarilyDisabledSessions.size >= 32) {
        const oldestKey = videoSubtitleTemporarilyDisabledSessions.values().next().value;
        if (oldestKey) videoSubtitleTemporarilyDisabledSessions.delete(oldestKey);
      }
      videoSubtitleTemporarilyDisabledSessions.add(sessionKey);
      videoSubtitleRequestSeq += 1;
      lastVideoCaptionText = "";
      hideVideoSubtitleOverlay();
    } else {
      videoSubtitleTemporarilyDisabledSessions.delete(sessionKey);
    }

    syncVideoSubtitleFeature();
    updateYouTubeVideoControl();
    return getCurrentVideoSubtitleSessionState();
  }

  function getVideoSubtitleSyncOffsetSeconds() {
    return clampNumber(settings.videoSubtitleSyncOffsetMs, -2000, 2000, -450) / 1000;
  }

  function getVideoSubtitleLookupTime(time) {
    // Negative offset means the subtitle should appear earlier.
    return Number(time || 0) - getVideoSubtitleSyncOffsetSeconds();
  }

  function findTimelineCueIndex(time, timeline = videoCaptionTimeline) {
    const lookupTime = getVideoSubtitleLookupTime(time);
    let low = 0;
    let high = timeline.length - 1;
    let found = -1;

    while (low <= high) {
      const middle = (low + high) >> 1;
      if (timeline[middle].start <= lookupTime + 0.03) {
        found = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    if (found < 0) return -1;
    const cue = timeline[found];
    return lookupTime <= cue.end + 0.42 ? found : -1;
  }

  function scheduleNextTimelineCueRead(video, currentIndex, timeline = videoCaptionTimeline) {
    if (!video || video.paused || video.seeking || !timeline.length) return;

    const currentTime = Number(video.currentTime || 0);
    const lookupTime = getVideoSubtitleLookupTime(currentTime);
    let nextIndex = currentIndex >= 0 ? currentIndex + 1 : -1;

    if (nextIndex < 0) {
      let low = 0;
      let high = timeline.length - 1;
      while (low <= high) {
        const middle = (low + high) >> 1;
        if (timeline[middle].start > lookupTime + 0.01) {
          nextIndex = middle;
          high = middle - 1;
        } else {
          low = middle + 1;
        }
      }
    }

    if (nextIndex < 0 || nextIndex >= timeline.length) return;
    const triggerTime = timeline[nextIndex].start + getVideoSubtitleSyncOffsetSeconds();
    const delayMs = Math.max(0, (triggerTime - currentTime) * 1000);
    // Long gaps are rechecked periodically so seek/rate changes cannot leave a stale timer.
    scheduleVideoCaptionRead(Math.min(2000, delayMs <= 8 ? 0 : delayMs));
  }

  function getVideoCaptionTargetLanguageCode() {
    return LANGUAGE_CATALOG?.codeFor(
      settings.videoSubtitleTargetLanguage || "Vietnamese",
      "vi"
    ) || "vi";
  }

  function videoCaptionTargetMatchesSource() {
    return Boolean(
      videoCaptionActiveSourceLanguageCode
      && sameLanguageCodeForUi(videoCaptionActiveSourceLanguageCode, getVideoCaptionTargetLanguageCode())
    );
  }

  function shouldPrepareVideoCaptionTranslation() {
    return settings.videoSubtitleShowTranslation !== false || isVideoDubbingSessionRequested();
  }
  function canUseVideoDubbing() {
    return Boolean(
      IS_TOP_FRAME
      && settings.enabled
      && isVideoDubbingSessionArmed()
      && (
        typeof Audio === "function"
        || ("speechSynthesis" in window && typeof SpeechSynthesisUtterance === "function")
      )
    );
  }
  function getVideoDubbingTimeline() {
    return videoCaptionTimeline.length ? videoCaptionTimeline : videoCaptionTranslatedTimeline;
  }
  function findVideoDubbingCueIndex(time) {
    const timeline = getVideoDubbingTimeline();
    const currentTime = getVideoSubtitleLookupTime(time);
    let low = 0;
    let high = timeline.length - 1;
    let latestStarted = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (Number(timeline[middle]?.start || 0) <= currentTime + 0.03) {
        latestStarted = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    // Match the visual subtitle rule: when YouTube's rolling ASR cues overlap,
    // the latest-started cue is the line currently displayed. In a gap, return
    // the first future cue so the scheduler can arm it.
    if (
      latestStarted >= 0
      && currentTime <= Number(timeline[latestStarted]?.end || 0) + 0.42
    ) {
      return latestStarted;
    }
    const nextIndex = latestStarted + 1;
    return nextIndex < timeline.length ? nextIndex : -1;
  }
  function getVideoDubbingCue(index) {
    const timingTimeline = getVideoDubbingTimeline();
    const timingCue = timingTimeline[index];
    if (!timingCue) return null;
    const sourceCue = videoCaptionTimeline.length ? videoCaptionTimeline[index] || timingCue : timingCue;
    let translatedCue = null;
    if (videoCaptionTranslatedTimeline.length) {
      translatedCue = videoCaptionTranslatedTimeline[index] || null;
      if (!translatedCue || Math.abs(Number(translatedCue.start || 0) - Number(sourceCue.start || 0)) > 0.12) {
        translatedCue = videoCaptionTranslatedTimeline.find((cue) =>
          Math.abs(Number(cue?.start || 0) - Number(sourceCue.start || 0)) <= 0.12
        ) || null;
      }
    }
    const cached = videoCaptionTimeline.length
      ? videoCaptionTranslations.get(getVideoCaptionCueCacheKey(index))
      : null;
    const text = normalizeVideoCaptionText(
      videoCaptionTargetMatchesSource()
        ? sourceCue.text
        : translatedCue?.text || cached?.result || (timingTimeline === videoCaptionTranslatedTimeline ? timingCue.text : "")
    );
    const start = Number(sourceCue.start ?? timingCue.start ?? 0);
    const rawEnd = Number(sourceCue.end ?? timingCue.end ?? start);
    let nextStart = Number.POSITIVE_INFINITY;
    for (let nextIndex = index + 1; nextIndex < timingTimeline.length; nextIndex += 1) {
      const candidateStart = Number(timingTimeline[nextIndex]?.start);
      if (Number.isFinite(candidateStart) && candidateStart > start + 0.03) {
        nextStart = candidateStart;
        break;
      }
    }
    // YouTube ASR's dDurationMs describes how long a line remains in its
    // two-line rolling window, not how long that sentence is spoken. The
    // dubbing deadline is therefore the next distinct cue start.
    const validRawEnd = Number.isFinite(rawEnd) && rawEnd > start ? rawEnd : nextStart;
    const effectiveEnd = Number.isFinite(nextStart)
      ? Math.min(validRawEnd, nextStart)
      : validRawEnd;
    const boundedEnd = Number.isFinite(effectiveEnd) && effectiveEnd > start
      ? effectiveEnd
      : start + 0.08;
    const minimumEnd = Math.min(
      start + 0.08,
      Number.isFinite(nextStart) ? nextStart : Number.POSITIVE_INFINITY
    );
    return {
      index,
      start,
      end: Math.max(minimumEnd, boundedEnd),
      rawEnd,
      text
    };
  }

  function setVideoDubbingSessionState(state, status = "") {
    videoDubbingSessionState = state || "idle";
    videoDubbingSessionStatus = String(status || "");
    if (youtubeVideoControlPanelEl) {
      youtubeVideoControlPanelEl.dataset.dubbingSessionState = videoDubbingSessionState;
    }
    updateYouTubeVideoControl();
  }

  function waitForVideoDubbingCondition(predicate, timeoutMs, sessionId, intervalMs = 80) {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const poll = () => {
        if (checkAndTeardownIfOrphaned()) {
          reject(new Error("InputBridge đã được tải lại"));
          return;
        }
        if (sessionId !== videoDubbingSessionId) {
          reject(new Error("Đã hủy chuẩn bị lồng tiếng"));
          return;
        }
        let value = null;
        try {
          value = predicate();
        } catch (error) {
          reject(error);
          return;
        }
        if (value) {
          resolve(value);
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error("Chuẩn bị lồng tiếng quá thời gian"));
          return;
        }
        window.setTimeout(poll, intervalMs);
      };
      poll();
    });
  }

  function withVideoDubbingTimeout(promise, timeoutMs, message) {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
      Promise.resolve(promise).then(resolve, reject).finally(() => clearTimeout(timer));
    });
  }

  function collectVideoDubbingBufferIndices(
    startIndex,
    horizonSeconds = VIDEO_DUBBING_INITIAL_BUFFER_SECONDS,
    maxCues = VIDEO_DUBBING_INITIAL_BUFFER_MAX_CUES
  ) {
    const timeline = getVideoDubbingTimeline();
    if (!timeline.length || startIndex < 0) return [];
    const videoTime = getVideoSubtitleLookupTime(videoDubbingSessionVideo?.currentTime || 0);
    const indices = [];
    const cueLimit = Math.max(1, Math.min(20, Number(maxCues || VIDEO_DUBBING_INITIAL_BUFFER_MAX_CUES)));
    for (let index = startIndex; index < timeline.length && indices.length < cueLimit; index += 1) {
      const cue = getVideoDubbingCue(index);
      if (!cue || Number(cue.end || 0) <= videoTime + 0.04) continue;
      indices.push(index);
      const coverage = Number(cue.end || 0) - videoTime;
      if (coverage >= horizonSeconds) break;
    }
    return indices;
  }

  function isVideoDubbingTranslationBackedOff(index) {
    const key = getVideoCaptionCueCacheKey(index);
    const retryAt = Number(videoDubbingTranslationFailures.get(key) || 0);
    if (!retryAt) return false;
    if (retryAt <= Date.now()) {
      videoDubbingTranslationFailures.delete(key);
      return false;
    }
    return true;
  }

  async function prepareVideoDubbingTranslations(indices, sessionId, { updateStatus = true } = {}) {
    if (!indices.length || videoCaptionTargetMatchesSource()) return;
    const missing = indices.filter((index) => (
      !getVideoDubbingCue(index)?.text
      && (updateStatus || !isVideoDubbingTranslationBackedOff(index))
    ));
    if (!missing.length) return;

    if (updateStatus) setVideoDubbingSessionState("translating", `Đang dịch ${missing.length} câu đầu…`);
    const items = missing.map((index) => {
      const cue = videoCaptionTimeline[index];
      const id = getVideoCaptionCueCacheKey(index);
      videoCaptionPending.add(id);
      return {
        id,
        text: cue?.text || "",
        ...getVideoCaptionCueContext(index),
        sourceLanguage: videoCaptionActiveSourceLanguageCode || settings.videoSubtitleSourceLanguage || "auto"
      };
    }).filter((item) => item.id && item.text);

    if (items.length) {
      try {
        const response = await withVideoDubbingTimeout(sendMessage({
          type: "IB_TRANSLATE_VIDEO_CAPTION_BATCH",
          items,
          manualSession: true,
          targetLanguage: settings.videoSubtitleTargetLanguage || "Vietnamese",
          origin: getPageOrigin()
        }), VIDEO_DUBBING_TRANSLATION_TIMEOUT_MS, "Dịch phụ đề quá thời gian");
        if (sessionId !== videoDubbingSessionId) throw new Error("Đã hủy chuẩn bị lồng tiếng");
        for (const item of response?.data?.items || []) {
          if (item?.id && item?.result) {
            videoCaptionTranslations.set(item.id, {
              result: item.result,
              engine: item.engine || ""
            });
            videoDubbingTranslationFailures.delete(item.id);
          }
        }
      } catch (error) {
        if (sessionId !== videoDubbingSessionId) throw new Error("Đã hủy chuẩn bị lồng tiếng");
        if (updateStatus) throw error;
        for (const item of items) {
          videoDubbingTranslationFailures.set(item.id, Date.now() + 5000);
        }
      } finally {
        for (const item of items) videoCaptionPending.delete(item.id);
      }
    }

    const unresolved = indices.filter((index) => !getVideoDubbingCue(index)?.text);
    if (unresolved.length && updateStatus) throw new Error("Không dịch đủ phụ đề để tạo đoạn đệm");
    if (!updateStatus) {
      for (const index of unresolved) {
        const key = getVideoCaptionCueCacheKey(index);
        if (key) videoDubbingTranslationFailures.set(key, Date.now() + 5000);
      }
    }
  }

  async function prepareVideoDubbingAudioBuffer(indices, sessionId, { updateStatus = true } = {}) {
    if (!indices.length) throw new Error("Không tìm thấy câu phụ đề ở vị trí hiện tại");
    let readyCount = 0;
    if (updateStatus) setVideoDubbingSessionState("buffering", `Đang tạo giọng đọc 0/${indices.length}…`);
    let next = 0;
    const worker = async () => {
      while (next < indices.length) {
        if (sessionId !== videoDubbingSessionId) throw new Error("Đã hủy chuẩn bị lồng tiếng");
        const index = indices[next];
        next += 1;
        const cue = getVideoDubbingCue(index);
        const cueKey = getVideoDubbingCueKey(cue);
        if (!cue?.text || !cueKey) {
          if (updateStatus) throw new Error("Phụ đề chưa sẵn sàng để tạo giọng đọc");
          continue;
        }
        if (!updateStatus && isVideoDubbingAudioFailed(cueKey)) continue;
        try {
          await requestVideoDubbingAudio(cue, cueKey, { manualSession: true });
        } catch (error) {
          if (sessionId !== videoDubbingSessionId) throw new Error("Đã hủy chuẩn bị lồng tiếng");
          if (updateStatus) throw error;
          videoDubbingAudioFailures.set(cueKey, Date.now() + 5000);
          continue;
        }
        if (sessionId !== videoDubbingSessionId) throw new Error("Đã hủy chuẩn bị lồng tiếng");
        readyCount += 1;
        if (updateStatus) {
          setVideoDubbingSessionState("buffering", `Đang tạo giọng đọc ${readyCount}/${indices.length}…`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, indices.length) }, () => worker()));
  }

  async function prepareVideoDubbingBuffer(startIndex, sessionId, horizonSeconds, {
    maxCues = VIDEO_DUBBING_INITIAL_BUFFER_MAX_CUES,
    updateStatus = true
  } = {}) {
    const indices = collectVideoDubbingBufferIndices(startIndex, horizonSeconds, maxCues);
    if (!indices.length) throw new Error("Không có phụ đề tiếp theo để lồng tiếng");
    await prepareVideoDubbingTranslations(indices, sessionId, { updateStatus });
    const audioBufferTask = prepareVideoDubbingAudioBuffer(indices, sessionId, { updateStatus });
    if (updateStatus) {
      await withVideoDubbingTimeout(
        audioBufferTask,
        VIDEO_DUBBING_AUDIO_BUFFER_TIMEOUT_MS,
        "Tạo giọng đọc quá thời gian"
      );
    } else {
      // Each individual provider request already has a bounded timeout. Let the
      // rolling worker finish so a second refill cannot overlap it after a
      // foreground-oriented aggregate timeout expires.
      await audioBufferTask;
    }
    return indices;
  }

  function resetVideoDubbingBackgroundBuffer() {
    if (videoDubbingBackgroundBufferTimer) clearTimeout(videoDubbingBackgroundBufferTimer);
    videoDubbingBackgroundBufferTimer = null;
    videoDubbingBackgroundBufferPromise = null;
    videoDubbingBackgroundBufferNextCheckAt = 0;
    videoDubbingAudioReadyWaiters.clear();
    videoDubbingTranslationFailures.clear();
  }

  function videoDubbingBufferNeedsWork(indices) {
    return indices.some((index) => {
      const cue = getVideoDubbingCue(index);
      if (!cue?.text) return !isVideoDubbingTranslationBackedOff(index);
      const cueKey = getVideoDubbingCueKey(cue);
      if (cueKey && isVideoDubbingAudioFailed(cueKey)) return false;
      return Boolean(
        cueKey
        && !videoDubbingAudioCache.has(cueKey)
        && !videoDubbingAudioRequests.has(cueKey)
      );
    });
  }

  function scheduleVideoDubbingBackgroundBuffer(delayMs = 0, { force = false } = {}) {
    if (!isVideoDubbingSessionArmed() || videoDubbingBackgroundBufferPromise || videoDubbingBackgroundBufferTimer) return;
    const now = Date.now();
    if (!force && videoDubbingBackgroundBufferNextCheckAt > now) return;
    videoDubbingBackgroundBufferNextCheckAt = now + 900;

    videoDubbingBackgroundBufferTimer = window.setTimeout(() => {
      videoDubbingBackgroundBufferTimer = null;
      if (!isVideoDubbingSessionArmed()) return;
      const video = videoDubbingSessionVideo || getPrimaryVideo();
      if (!video || video.ended || video.seeking) return;
      const startIndex = findVideoDubbingCueIndex(video.currentTime);
      const indices = collectVideoDubbingBufferIndices(
        startIndex,
        VIDEO_DUBBING_BACKGROUND_BUFFER_SECONDS,
        VIDEO_DUBBING_BACKGROUND_BUFFER_MAX_CUES
      );
      if (!indices.length || !videoDubbingBufferNeedsWork(indices)) return;

      const sessionId = videoDubbingSessionId;
      let nextDelayMs = 1200;
      const request = prepareVideoDubbingBuffer(
        startIndex,
        sessionId,
        VIDEO_DUBBING_BACKGROUND_BUFFER_SECONDS,
        {
          maxCues: VIDEO_DUBBING_BACKGROUND_BUFFER_MAX_CUES,
          updateStatus: false
        }
      ).catch(() => {
        if (sessionId === videoDubbingSessionId && isVideoDubbingSessionArmed()) {
          nextDelayMs = 2000;
        }
      }).finally(() => {
        if (videoDubbingBackgroundBufferPromise === request) videoDubbingBackgroundBufferPromise = null;
        if (sessionId === videoDubbingSessionId && isVideoDubbingSessionArmed()) {
          scheduleVideoDubbingBackgroundBuffer(nextDelayMs);
          syncVideoDubbing("background-buffer-ready");
        }
      });
      videoDubbingBackgroundBufferPromise = request;
    }, Math.max(0, Number(delayMs || 0)));
  }

  function resetVideoDubbingTimelineForPreparation() {
    cancelYouTubeCaptionTimelineRequest();
    videoCaptionTimeline = [];
    videoCaptionTranslatedTimeline = [];
    videoCaptionTranslationEngine = "";
    videoCaptionUsesPlayerTrack = false;
    videoCaptionTimelineKey = "";
    videoCaptionTimelineRequestKey = "";
    videoCaptionTimelineLoading = false;
    videoCaptionTimelineRetryCount = 0;
    videoCaptionTimelineNextRetryAt = 0;
    videoCaptionTimelineError = "";
    lastVideoCaptionTimelineIndex = -1;
    videoCaptionTranslations.clear();
    videoCaptionPending.clear();
  }

  async function resumeOriginalVideoAfterDubbingStop(video, shouldResume) {
    if (!shouldResume || !video || video.ended) return false;
    if (!video.paused) return true;
    try {
      await video.play();
      return !video.paused;
    } catch {
      return false;
    }
  }

  function stopVideoDubbingSession({ resumeOriginal = false, keepError = false } = {}) {
    const video = videoDubbingSessionVideo;
    const shouldResume = Boolean(resumeOriginal && videoDubbingSessionWasPlaying);
    videoDubbingResumeAfterSeekVideo = null;
    cancelYouTubeCaptionTimelineRequest();
    videoDubbingSessionId += 1;
    resetVideoDubbingBackgroundBuffer();
    videoDubbingSessionVideo = null;
    videoDubbingSessionWasPlaying = false;
    videoDubbingSessionStartIndex = -1;
    videoDubbingConsumedCueKeys.clear();
    resetVideoDubbingLiveState();
    stopVideoDubbing(true);
    if (!keepError) setVideoDubbingSessionState("idle", "");
    syncVideoSubtitleFeature();
    void resumeOriginalVideoAfterDubbingStop(video, shouldResume);
  }

  function failVideoDubbingSession(message, sessionId = videoDubbingSessionId) {
    if (checkAndTeardownIfOrphaned()) return;
    if (sessionId !== videoDubbingSessionId) return;
    const video = videoDubbingSessionVideo;
    const shouldResume = videoDubbingSessionWasPlaying;
    videoDubbingResumeAfterSeekVideo = null;
    cancelYouTubeCaptionTimelineRequest();
    videoDubbingSessionId += 1;
    resetVideoDubbingBackgroundBuffer();
    videoDubbingSessionVideo = null;
    videoDubbingSessionWasPlaying = false;
    videoDubbingSessionStartIndex = -1;
    stopVideoDubbing(true);
    setVideoDubbingSessionState("error", message || "Không chuẩn bị được lồng tiếng");
    syncVideoSubtitleFeature();
    showToast(message || "Không chuẩn bị được lồng tiếng");
    void resumeOriginalVideoAfterDubbingStop(video, shouldResume);
  }

  async function startVideoDubbingSession({ resumePlayback = null } = {}) {
    if (!settings.enabled) {
      setVideoDubbingSessionState("error", "InputBridge đang tắt");
      showToast("Hãy bật InputBridge trước khi lồng tiếng");
      return;
    }
    const video = getPrimaryVideo();
    if (!video) {
      setVideoDubbingSessionState("error", "Chưa tìm thấy video để lồng tiếng");
      showToast("Chưa tìm thấy video để lồng tiếng");
      return;
    }
    videoDubbingResumeAfterSeekVideo = null;

    const wasPlaying = resumePlayback === null
      ? !video.paused && !video.ended
      : Boolean(resumePlayback && !video.ended);
    // Pause synchronously in the click task. No translation or TTS request may
    // race ahead of the video while preparation is still incomplete.
    try { video.pause(); } catch {}

    stopVideoDubbing(true);
    resetVideoDubbingLiveState();
    videoDubbingConsumedCueKeys.clear();
    clearVideoDubbingAudioCache();
    const sessionId = ++videoDubbingSessionId;
    videoDubbingSessionVideo = video;
    videoDubbingSessionWasPlaying = wasPlaying;
    videoDubbingSessionStartIndex = -1;
    setVideoDubbingSessionState("timeline", "Đang tải toàn bộ phụ đề…");
    resetVideoDubbingTimelineForPreparation();
    syncVideoSubtitleFeature();

    try {
      requestYouTubeCaptionTimeline();
      await waitForVideoDubbingCondition(() => {
        if (videoCaptionTimeline.length) return videoCaptionTimeline;
        if (!videoCaptionTimelineLoading && videoCaptionTimelineRetryCount >= 2) {
          throw new Error(videoCaptionTimelineError || "Video này không có phụ đề để lồng tiếng");
        }
        return null;
      }, VIDEO_DUBBING_TIMELINE_TIMEOUT_MS, sessionId);
      if (sessionId !== videoDubbingSessionId) return;
      if (video !== videoDubbingSessionVideo || !video.isConnected || video !== getPrimaryVideo()) {
        stopVideoDubbingSession({ resumeOriginal: false });
        return;
      }

      let startIndex = findVideoDubbingCueIndex(video.currentTime);
      const currentCue = getVideoDubbingCue(startIndex);
      if (currentCue && startIndex + 1 < getVideoDubbingTimeline().length) {
        // Use raw media time here: the subtitle display offset must not make a
        // newly-started cue look late. Keep a mostly-unread cue, but avoid
        // cramming an entire sentence into only its final fraction.
        const cueDuration = Math.max(0.25, Number(currentCue.end || 0) - Number(currentCue.start || 0));
        const elapsed = Math.max(0, Number(video.currentTime || 0) - Number(currentCue.start || 0));
        const remaining = Number(currentCue.end || 0) - Number(video.currentTime || 0);
        if (remaining < 0.8 || elapsed / cueDuration > 0.65) startIndex += 1;
      }
      if (startIndex < 0) throw new Error("Không còn phụ đề ở vị trí hiện tại");
      videoDubbingSessionStartIndex = startIndex;
      await prepareVideoDubbingBuffer(startIndex, sessionId, VIDEO_DUBBING_INITIAL_BUFFER_SECONDS, {
        maxCues: VIDEO_DUBBING_INITIAL_BUFFER_MAX_CUES
      });
      if (sessionId !== videoDubbingSessionId) return;
      if (video !== videoDubbingSessionVideo || !video.isConnected || video !== getPrimaryVideo()) {
        stopVideoDubbingSession({ resumeOriginal: false });
        return;
      }

      setVideoDubbingSessionState("ready", wasPlaying ? "Đã sẵn sàng · đang phát video…" : "Đã sẵn sàng · bấm Play để xem");
      scheduleVideoDubbingBackgroundBuffer(0, { force: true });
      if (wasPlaying) {
        try {
          await video.play();
          if (sessionId === videoDubbingSessionId) {
            setVideoDubbingSessionState("running", "Đang lồng tiếng");
            syncVideoDubbing("manual-ready");
          }
        } catch {
          if (sessionId === videoDubbingSessionId) {
            setVideoDubbingSessionState("ready", "Đã chuẩn bị · bấm Play để tiếp tục");
          }
        }
      }
    } catch (error) {
      failVideoDubbingSession(error?.message || String(error), sessionId);
    }
  }

  function toggleVideoDubbingSession() {
    if (isVideoDubbingSessionRequested()) {
      stopVideoDubbingSession({
        resumeOriginal: isVideoDubbingSessionPreparing()
      });
      return;
    }
    void startVideoDubbingSession();
  }

  function getVideoDubbingLanguageKey() {
    return String(getVideoCaptionTargetLanguageCode() || "en").trim().toLowerCase().replace(/_/g, "-");
  }

  function getSelectedVideoDubbingVoice() {
    const map = settings.videoDubbingVoiceByLanguage;
    if (!map || typeof map !== "object" || Array.isArray(map)) return "";
    const languageKey = getVideoDubbingLanguageKey();
    return String(map[languageKey] || map[languageKey.split("-")[0]] || "").trim();
  }

  function clearVideoDubbingAudioCache() {
    resetVideoDubbingBackgroundBuffer();
    videoDubbingAudioCache.clear();
    videoDubbingAudioRequests.clear();
    videoDubbingAudioFailures.clear();
  }

  async function ensureVideoDubbingVoices(languageKey = getVideoDubbingLanguageKey()) {
    const key = String(languageKey || "en").toLowerCase().replace(/_/g, "-");
    if (videoDubbingVoicesByLanguage.has(key)) return videoDubbingVoicesByLanguage.get(key);
    const pending = videoDubbingVoiceRequests.get(key);
    if (pending) return pending;
    const request = sendMessage({
      type: "IB_VIDEO_DUBBING_VOICES",
      language: key,
      origin: getPageOrigin()
    }).then((response) => {
      const voices = Array.isArray(response?.data?.voices) ? response.data.voices : [];
      videoDubbingVoicesByLanguage.set(key, voices);
      return voices;
    }).catch(() => {
      videoDubbingVoicesByLanguage.set(key, []);
      return [];
    }).finally(() => {
      videoDubbingVoiceRequests.delete(key);
      if (youtubeVideoControlPanelEl?.isConnected) updateYouTubeVideoControl();
    });
    videoDubbingVoiceRequests.set(key, request);
    return request;
  }

  function getVideoDubbingVoiceLabel(voice) {
    const name = String(voice?.localName || voice?.friendlyName || voice?.name || "").trim();
    const gender = String(voice?.gender || "").toLowerCase();
    const genderLabel = gender === "female" ? "Nữ" : gender === "male" ? "Nam" : "";
    return genderLabel ? `${name} · ${genderLabel}` : name;
  }

  function populateVideoDubbingVoiceSelect(select) {
    if (!select) return;
    const languageKey = getVideoDubbingLanguageKey();
    const selectedVoice = getSelectedVideoDubbingVoice();
    const voices = videoDubbingVoicesByLanguage.get(languageKey);
    const fragment = document.createDocumentFragment();
    const autoOption = document.createElement("option");
    autoOption.value = "";
    autoOption.textContent = voices ? "Tự động · Edge/System" : "Đang tải giọng Edge...";
    fragment.appendChild(autoOption);
    for (const voice of voices || []) {
      const option = document.createElement("option");
      option.value = voice.name;
      option.textContent = getVideoDubbingVoiceLabel(voice);
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
    if (!voices) void ensureVideoDubbingVoices(languageKey);
  }

  function getVideoDubbingCueKey(cue) {
    return cue?.text
      ? `${videoCaptionTimelineKey || location.href}\u0000${getVideoDubbingLanguageKey()}\u0000${getSelectedVideoDubbingVoice()}\u0000${cue.start.toFixed(3)}\u0000${cue.text}`
      : "";
  }
  function resetVideoDubbingLiveState() {
    if (videoDubbingLiveTimer) clearTimeout(videoDubbingLiveTimer);
    videoDubbingLiveTimer = null;
    videoDubbingLivePendingCue = null;
    videoDubbingLiveQueuedCues = [];
    videoDubbingLastLiveCueKey = "";
    videoDubbingLastLiveSourceText = "";
    videoDubbingLastLiveSpokenText = "";
  }
  function hasPendingVideoDubbingLiveCue() {
    return Boolean(videoDubbingLivePendingCue || videoDubbingLiveQueuedCues.length);
  }
  function getLatestPendingVideoDubbingLiveCue() {
    return videoDubbingLiveQueuedCues[videoDubbingLiveQueuedCues.length - 1]
      || videoDubbingLivePendingCue
      || null;
  }
  function advancePendingVideoDubbingLiveCue() {
    videoDubbingLivePendingCue = videoDubbingLiveQueuedCues.shift() || null;
  }
  function commitVideoDubbingLiveCue(cue, cueKey) {
    if (!cue?.live) return;
    videoDubbingLastLiveCueKey = cueKey;
    videoDubbingLastLiveSourceText = normalizeVideoCaptionText(cue.liveSourceText);
    videoDubbingLastLiveSpokenText = normalizeVideoCaptionText(cue.liveSpokenText);
    if (hasPendingVideoDubbingLiveCue()) schedulePendingLiveVideoDubbing(40);
  }
  function getVideoDubbingAppendedText(previousText, nextText) {
    const previous = normalizeVideoCaptionText(previousText);
    const next = normalizeVideoCaptionText(nextText);
    if (!next || next === previous) return "";
    if (!previous) return next;
    if (next.startsWith(previous)) {
      return normalizeVideoCaptionText(next.slice(previous.length).replace(/^[\s,.;:!?\-–—]+/u, ""));
    }
    const previousWithoutTerminal = previous.replace(/[.!?。！？]+$/u, "").trimEnd();
    if (
      previousWithoutTerminal
      && next.startsWith(previousWithoutTerminal)
      && /^[\s,.;:!?。！？\-–—]/u.test(next.slice(previousWithoutTerminal.length, previousWithoutTerminal.length + 1))
    ) {
      return normalizeVideoCaptionText(
        next.slice(previousWithoutTerminal.length).replace(/^[\s,.;:!?。！？\-–—]+/u, "")
      );
    }

    const previousWords = previous.split(/\s+/u).filter(Boolean);
    const nextWords = next.split(/\s+/u).filter(Boolean);
    let sharedPrefixWords = 0;
    while (
      sharedPrefixWords < previousWords.length
      && sharedPrefixWords < nextWords.length
      && previousWords[sharedPrefixWords].toLocaleLowerCase() === nextWords[sharedPrefixWords].toLocaleLowerCase()
    ) {
      sharedPrefixWords += 1;
    }
    if (sharedPrefixWords >= Math.min(2, previousWords.length)) {
      return normalizeVideoCaptionText(nextWords.slice(sharedPrefixWords).join(" "));
    }
    return next;
  }
  function schedulePendingLiveVideoDubbing(delayMs) {
    if (videoDubbingLiveTimer) clearTimeout(videoDubbingLiveTimer);
    const pendingAgeMs = videoDubbingLivePendingCue
      ? Date.now() - Number(videoDubbingLivePendingCue.firstSeenAt || Date.now())
      : 0;
    const canCapDebounce = !videoDubbingAudio && !videoDubbingUtterance && !videoDubbingAudioPendingKey;
    const boundedDelayMs = canCapDebounce
      ? Math.min(Number(delayMs || 0), Math.max(0, VIDEO_DUBBING_LIVE_MAX_WAIT_MS - pendingAgeMs))
      : Number(delayMs || 0);
    videoDubbingLiveTimer = window.setTimeout(() => {
      videoDubbingLiveTimer = null;
      const pending = videoDubbingLivePendingCue;
      if (!pending || !canUseVideoDubbing() || getVideoDubbingTimeline().length) {
        videoDubbingLivePendingCue = null;
        videoDubbingLiveQueuedCues = [];
        return;
      }

      const video = getPrimaryVideo();
      if (!video || video.seeking || video.ended) {
        videoDubbingLivePendingCue = null;
        videoDubbingLiveQueuedCues = [];
        return;
      }
      // Keep the stable caption while paused; the video "playing" listener will
      // restart this debounce instead of permanently losing the sentence.
      if (video.paused) return;
      if (videoDubbingAudioPendingKey) {
        const pendingAgeMs = Date.now() - videoDubbingAudioPendingStartedAt;
        const activeSource = normalizeVideoCaptionText(videoDubbingAudioPendingCue?.liveSourceText);
        const activeSpoken = normalizeVideoCaptionText(videoDubbingAudioPendingCue?.liveSpokenText);
        const translationWasCorrected = Boolean(
          videoDubbingAudioPendingCue?.live
          && pending.sourceText === activeSource
          && activeSpoken
          && pending.spokenText !== activeSpoken
        );
        const pendingExpired = pendingAgeMs > getVideoDubbingPendingMaxMs(videoDubbingAudioPendingCue);
        if (translationWasCorrected || pendingExpired) {
          // The network request may still complete and populate the cache, but its
          // token is detached so an obsolete live sentence cannot play much later.
          stopVideoDubbing(false);
        } else {
          schedulePendingLiveVideoDubbing(180);
          return;
        }
      }
      if (videoDubbingAudio || videoDubbingUtterance) {
        schedulePendingLiveVideoDubbing(180);
        return;
      }

      let speechText = pending.spokenText;
      if (
        videoDubbingLastLiveSourceText
        && pending.sourceText.startsWith(videoDubbingLastLiveSourceText)
      ) {
        speechText = getVideoDubbingAppendedText(videoDubbingLastLiveSpokenText, pending.spokenText);
      }

      advancePendingVideoDubbingLiveCue();
      if (!speechText) {
        // The translated text did not grow even though the source caption did;
        // all audible content is already complete, so commit this no-op update.
        commitVideoDubbingLiveCue({
          live: true,
          liveSourceText: pending.sourceText,
          liveSpokenText: pending.spokenText
        }, pending.cueKey);
        return;
      }

      const start = Number(video.currentTime || 0);
      const duration = clampNumber(estimateVideoDubbingSpeechSeconds(speechText) * 1.15, 1.8, 12, 3.2);
      speakVideoDubbingCue(video, {
        start,
        end: start + duration,
        text: speechText,
        live: true,
        liveSourceText: pending.sourceText,
        liveSpokenText: pending.spokenText
      }, pending.cueKey);
    }, Math.max(0, boundedDelayMs));
  }
  function maybeSpeakLiveVideoDubbing(sourceText, translatedText) {
    if (!canUseVideoDubbing() || getVideoDubbingTimeline().length) return;
    const video = getPrimaryVideo();
    const spokenText = normalizeVideoCaptionText(translatedText);
    const normalizedSource = normalizeVideoCaptionText(sourceText);
    if (!video || video.paused || video.seeking || video.ended || !spokenText) return;

    const cueKey = `${location.href}\u0000live\u0000${getVideoDubbingLanguageKey()}\u0000${getSelectedVideoDubbingVoice()}\u0000${normalizedSource}\u0000${spokenText}`;
    if (
      cueKey === videoDubbingLastLiveCueKey
      || cueKey === videoDubbingActiveCueKey
      || cueKey === videoDubbingAudioPendingKey
      || cueKey === videoDubbingLivePendingCue?.cueKey
      || videoDubbingLiveQueuedCues.some((cue) => cue.cueKey === cueKey)
    ) return;

    // Live captions grow a few words at a time. Starting immediately would cancel
    // and restart the same sentence on every DOM refresh, so wait for a stable chunk.
    const nextCue = {
      cueKey,
      sourceText: normalizedSource,
      spokenText,
      firstSeenAt: Date.now()
    };
    const latestPending = getLatestPendingVideoDubbingLiveCue();
    const growsLatest = Boolean(
      latestPending
      && (
        (normalizedSource && latestPending.sourceText && normalizedSource.startsWith(latestPending.sourceText))
        || (!normalizedSource && !latestPending.sourceText && spokenText.startsWith(latestPending.spokenText))
      )
    );
    if (!latestPending) {
      videoDubbingLivePendingCue = nextCue;
    } else if (growsLatest) {
      latestPending.cueKey = cueKey;
      latestPending.sourceText = normalizedSource;
      latestPending.spokenText = spokenText;
    } else {
      videoDubbingLiveQueuedCues.push(nextCue);
      if (videoDubbingLiveQueuedCues.length > VIDEO_DUBBING_LIVE_QUEUE_LIMIT) {
        videoDubbingLiveQueuedCues.splice(0, videoDubbingLiveQueuedCues.length - VIDEO_DUBBING_LIVE_QUEUE_LIMIT);
      }
    }
    const shouldFlushPrevious = Boolean(latestPending && !growsLatest);
    const correctsActivePending = Boolean(
      videoDubbingAudioPendingCue?.live
      && normalizedSource === normalizeVideoCaptionText(videoDubbingAudioPendingCue.liveSourceText)
      && spokenText !== normalizeVideoCaptionText(videoDubbingAudioPendingCue.liveSpokenText)
    );
    schedulePendingLiveVideoDubbing(
      shouldFlushPrevious || correctsActivePending
        ? 0
        : (hasCaptionTerminalPunctuation(spokenText) ? 220 : 620)
    );
  }
  function estimateVideoDubbingSpeechSeconds(text) {
    const normalized = normalizeVideoCaptionText(text);
    if (!normalized) return 0;
    const wordCount = normalized.split(/\s+/u).filter(Boolean).length;
    const compactLength = normalized.replace(/\s+/gu, "").length;
    const cjkLength = (normalized.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/gu) || []).length;
    const punctuationPause = (normalized.match(/[,.!?;:\u3002\uFF0C\uFF01\uFF1F]/gu) || []).length * 0.055;
    const base = cjkLength >= Math.max(2, compactLength * 0.35)
      ? cjkLength / 5.2
      : Math.max(wordCount / 2.7, compactLength / 16.5);
    return Math.max(0.55, base + punctuationPause);
  }
  function getVideoDubbingVoice(language) {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    if (!voices.length) return null;
    const wanted = String(language || "").toLowerCase().replace(/_/g, "-");
    const wantedBase = wanted.split("-")[0];
    let bestVoice = null;
    let bestScore = -1;
    for (const voice of voices) {
      const voiceLanguage = String(voice?.lang || "").toLowerCase().replace(/_/g, "-");
      const voiceBase = voiceLanguage.split("-")[0];
      let score = 0;
      if (voiceLanguage === wanted) score += 100;
      else if (voiceBase && voiceBase === wantedBase) score += 60;
      else continue;
      if (/natural|neural|premium/i.test(voice.name || "")) score += 18;
      if (/google|microsoft/i.test(voice.name || "")) score += 8;
      if (voice.localService) score += 3;
      if (score > bestScore) {
        bestScore = score;
        bestVoice = voice;
      }
    }
    return bestVoice;
  }
  function getVideoDubbingRate(text, availableVideoSeconds, video) {
    const playbackRate = clampNumber(video?.playbackRate, 0.25, 4, 1);
    const availableWallSeconds = Math.max(0.35, Number(availableVideoSeconds || 0) / playbackRate);
    const estimatedSeconds = estimateVideoDubbingSpeechSeconds(text);
    return clampNumber(estimatedSeconds / availableWallSeconds, 0.85, 1.6, 1);
  }
  function applyVideoDubbingOriginalVolume(video) {
    if (!video) return;
    if (videoDubbingVideo && videoDubbingVideo !== video) restoreVideoDubbingOriginalVolume();
    if (videoDubbingVideo !== video) {
      videoDubbingVideo = video;
      videoDubbingSavedVolume = clampNumber(video.volume, 0, 1, 1);
    }
    const ratio = clampNumber(settings.videoDubbingOriginalVolume, 0, 1, 0.2);
    const nextVolume = clampNumber(Number(videoDubbingSavedVolume ?? video.volume) * ratio, 0, 1, 0.2);
    if (Math.abs(Number(video.volume || 0) - nextVolume) > 0.005) video.volume = nextVolume;
  }
  function restoreVideoDubbingOriginalVolume() {
    if (videoDubbingVideo && Number.isFinite(videoDubbingSavedVolume)) {
      try {
        videoDubbingVideo.volume = clampNumber(videoDubbingSavedVolume, 0, 1, 1);
      } catch {}
    }
    videoDubbingVideo = null;
    videoDubbingSavedVolume = null;
  }
  function clearVideoDubbingTimer() {
    if (videoDubbingTimer) clearTimeout(videoDubbingTimer);
    videoDubbingTimer = null;
    videoDubbingScheduledCueKey = "";
  }
  function clearVideoDubbingAudioPendingTimer() {
    if (videoDubbingAudioPendingTimer) clearTimeout(videoDubbingAudioPendingTimer);
    videoDubbingAudioPendingTimer = null;
  }
  function setVideoDubbingState(state) {
    if (youtubeVideoControlPanelEl) {
      youtubeVideoControlPanelEl.dataset.dubbingState = state || "idle";
    }
  }
  function setVideoDubbingActiveCueDiagnostic(cue = null) {
    for (const element of [youtubeVideoControlPanelEl, youtubeVideoDubbingButtonEl]) {
      if (!element) continue;
      if (cue) {
        element.dataset.dubbingCueIndex = String(cue.index ?? "");
        element.dataset.dubbingCueStart = String(Number(cue.start || 0));
        element.dataset.dubbingCueEnd = String(Number(cue.end || 0));
      } else {
        delete element.dataset.dubbingCueIndex;
        delete element.dataset.dubbingCueStart;
        delete element.dataset.dubbingCueEnd;
      }
    }
  }
  function stopVideoDubbing(restoreOriginal = false) {
    const activeUtterance = videoDubbingUtterance;
    videoDubbingToken += 1;
    clearVideoDubbingTimer();
    videoDubbingActiveCueKey = "";
    setVideoDubbingActiveCueDiagnostic();
    videoDubbingAudioPendingKey = "";
    videoDubbingAudioPendingCue = null;
    videoDubbingAudioPendingStartedAt = 0;
    clearVideoDubbingAudioPendingTimer();
    videoDubbingUtterance = null;
    if (videoDubbingAudio) {
      const audio = videoDubbingAudio;
      videoDubbingAudio = null;
      try {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      } catch {}
    }
    if (activeUtterance) {
      try {
        window.speechSynthesis?.cancel?.();
      } catch {}
    }
    setVideoDubbingState("idle");
    if (restoreOriginal) restoreVideoDubbingOriginalVolume();
  }
  function scheduleVideoDubbingCue(video, cue, cueKey) {
    if (!video || !cue || !cueKey) return;
    if (videoDubbingTimer && videoDubbingScheduledCueKey === cueKey) return;
    clearVideoDubbingTimer();
    videoDubbingScheduledCueKey = cueKey;
    const token = videoDubbingToken;
    const playbackRate = clampNumber(video.playbackRate, 0.25, 4, 1);
    const currentTimelineTime = getVideoSubtitleLookupTime(video.currentTime);
    const delayMs = Math.max(0, ((cue.start - currentTimelineTime) / playbackRate) * 1000);
    videoDubbingTimer = window.setTimeout(() => {
      if (token !== videoDubbingToken) return;
      videoDubbingTimer = null;
      videoDubbingScheduledCueKey = "";
      syncVideoDubbing("cue-start");
    }, Math.min(2000, delayMs));
  }
  function rememberVideoDubbingAudio(key, audioUrl) {
    if (!key || !audioUrl) return;
    if (videoDubbingAudioCache.has(key)) videoDubbingAudioCache.delete(key);
    while (videoDubbingAudioCache.size >= VIDEO_DUBBING_AUDIO_CACHE_LIMIT) {
      const oldestKey = videoDubbingAudioCache.keys().next().value;
      if (oldestKey === undefined) break;
      videoDubbingAudioCache.delete(oldestKey);
    }
    videoDubbingAudioCache.set(key, audioUrl);
  }
  async function requestVideoDubbingAudio(cue, cueKey, { manualSession = false, providerPolicy = "edge-with-fallback" } = {}) {
    const cached = videoDubbingAudioCache.get(cueKey);
    if (cached) return cached;
    const pending = videoDubbingAudioRequests.get(cueKey);
    if (pending) return pending;

    const request = sendMessage({
      type: "IB_VIDEO_DUBBING_TTS",
      text: cue.text,
      language: getVideoCaptionTargetLanguageCode(),
      voice: getSelectedVideoDubbingVoice(),
      manualSession,
      providerPolicy,
      origin: getPageOrigin()
    }).then((response) => {
      const audioUrl = response?.data?.audioUrl;
      if (!response?.ok || !audioUrl) {
        throw new Error(response?.error || "Không tạo được giọng đọc");
      }
      rememberVideoDubbingAudio(cueKey, audioUrl);
      videoDubbingAudioFailures.delete(cueKey);
      return audioUrl;
    });

    videoDubbingAudioRequests.set(cueKey, request);
    try {
      return await request;
    } finally {
      if (videoDubbingAudioRequests.get(cueKey) === request) {
        videoDubbingAudioRequests.delete(cueKey);
      }
    }
  }
  function isVideoDubbingAudioFailed(cueKey) {
    const retryAt = Number(videoDubbingAudioFailures.get(cueKey) || 0);
    if (!retryAt) return false;
    if (retryAt <= Date.now()) {
      videoDubbingAudioFailures.delete(cueKey);
      return false;
    }
    return true;
  }
  function prefetchVideoDubbingAudio(startIndex, count = 2) {
    for (let index = startIndex; index < startIndex + count; index += 1) {
      const cue = getVideoDubbingCue(index);
      if (!cue?.text) continue;
      const cueKey = getVideoDubbingCueKey(cue);
      if (!cueKey || videoDubbingAudioCache.has(cueKey) || videoDubbingAudioRequests.has(cueKey)) continue;
      void requestVideoDubbingAudio(cue, cueKey, { manualSession: true }).catch(() => {});
    }
  }
  function waitForVideoDubbingAudioWithoutPausing(cue, cueKey) {
    if (!cue?.text || !cueKey || videoDubbingAudioReadyWaiters.has(cueKey)) return;
    const sessionId = videoDubbingSessionId;
    videoDubbingAudioReadyWaiters.set(cueKey, sessionId);
    void requestVideoDubbingAudio(cue, cueKey, { manualSession: true })
      .catch(() => {
        if (sessionId === videoDubbingSessionId) {
          videoDubbingAudioFailures.set(cueKey, Date.now() + 5000);
        }
      })
      .finally(() => {
        if (videoDubbingAudioReadyWaiters.get(cueKey) === sessionId) {
          videoDubbingAudioReadyWaiters.delete(cueKey);
        }
        if (sessionId === videoDubbingSessionId && isVideoDubbingSessionArmed()) {
          syncVideoDubbing("audio-ready-without-pause");
        }
      });
  }
  function waitForVideoDubbingAudioMetadata(audio, timeoutMs = 900) {
    if (audio.readyState >= 1 && Number.isFinite(audio.duration)) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      let timeout = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        audio.removeEventListener("loadedmetadata", finish);
        audio.removeEventListener("canplay", finish);
        audio.removeEventListener("error", finish);
        resolve();
      };
      audio.addEventListener("loadedmetadata", finish);
      audio.addEventListener("canplay", finish);
      audio.addEventListener("error", finish);
      timeout = window.setTimeout(finish, timeoutMs);
      try {
        audio.load();
      } catch {
        finish();
      }
    });
  }
  function getVideoDubbingWatchdogMs(expectedSeconds) {
    const expected = Math.max(0.5, Number(expectedSeconds || 0));
    const margin = Math.max(5, expected * 0.75);
    return clampNumber((expected + margin) * 1000, 8000, 300000, 15000);
  }
  function getVideoDubbingPendingMaxMs(cue) {
    const estimatedSeconds = estimateVideoDubbingSpeechSeconds(cue?.text || "");
    return cue?.live
      ? clampNumber((estimatedSeconds * 1.2 + 4) * 1000, 6000, 8000, 6500)
      : clampNumber((estimatedSeconds * 1.5 + 4) * 1000, 6500, 14000, 9000);
  }
  async function playVideoDubbingAudioCue(video, cue, cueKey) {
    stopVideoDubbing(false);
    applyVideoDubbingOriginalVolume(video);
    const token = videoDubbingToken;
    // A live cue may only speak the newly appended suffix. Include the actual
    // synthesized text in its cache key so a later seek/reset cannot reuse a
    // suffix-only clip as though it contained the whole caption.
    const audioCacheKey = cue.live ? `${cueKey}\u0000audio\u0000${cue.text}` : cueKey;
    videoDubbingAudioPendingKey = cueKey;
    videoDubbingAudioPendingCue = cue;
    videoDubbingAudioPendingStartedAt = Date.now();
    videoDubbingActiveCueKey = cueKey;
    setVideoDubbingState("loading");
    videoDubbingAudioPendingTimer = window.setTimeout(() => {
      if (token !== videoDubbingToken || videoDubbingAudioPendingKey !== cueKey) return;
      if (!cue.live) videoDubbingConsumedCueKeys.add(cueKey);
      stopVideoDubbing(false);
      if (cue.live && hasPendingVideoDubbingLiveCue()) schedulePendingLiveVideoDubbing(0);
      else syncVideoDubbing("tts-pending-timeout");
    }, getVideoDubbingPendingMaxMs(cue));

    let audioUrl = "";
    try {
      audioUrl = await requestVideoDubbingAudio(cue, audioCacheKey, { manualSession: true });
    } catch {
      if (token !== videoDubbingToken) return;
      clearVideoDubbingAudioPendingTimer();
      videoDubbingAudioPendingKey = "";
      videoDubbingAudioPendingCue = null;
      videoDubbingAudioPendingStartedAt = 0;
      videoDubbingActiveCueKey = "";
      videoDubbingAudioFailures.set(cueKey, Date.now() + 5000);
      if (!cue.live) videoDubbingConsumedCueKeys.add(cueKey);
      setVideoDubbingState("error");
      window.setTimeout(() => syncVideoDubbing("tts-error"), 0);
      return;
    }

    if (token !== videoDubbingToken) return;
    clearVideoDubbingAudioPendingTimer();
    if (!canUseVideoDubbing()) {
      stopVideoDubbing(true);
      return;
    }
    const isLiveCue = Boolean(cue.live);
    const currentTime = getVideoSubtitleLookupTime(video.currentTime);
    if (video.paused || video.seeking || video.ended || (!isLiveCue && cue.end - currentTime < 0.2)) {
      videoDubbingAudioPendingKey = "";
      videoDubbingAudioPendingCue = null;
      videoDubbingAudioPendingStartedAt = 0;
      videoDubbingActiveCueKey = "";
      if (!isLiveCue) videoDubbingConsumedCueKeys.add(cueKey);
      setVideoDubbingState("idle");
      window.setTimeout(() => syncVideoDubbing("tts-stale"), 0);
      return;
    }

    const audio = new Audio(audioUrl);
    audio.preload = "auto";
    videoDubbingAudio = audio;
    videoDubbingAudioPendingKey = "";
    videoDubbingAudioPendingCue = null;
    videoDubbingAudioPendingStartedAt = 0;
    videoDubbingActiveCueKey = cueKey;

    const finish = (failed = false, completed = false) => {
      if (token !== videoDubbingToken || videoDubbingAudio !== audio) return;
      clearVideoDubbingTimer();
      videoDubbingAudio = null;
      videoDubbingActiveCueKey = "";
      setVideoDubbingActiveCueDiagnostic();
      audio.onended = null;
      audio.onerror = null;
      try {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      } catch {}
      if (failed) {
        videoDubbingAudioCache.delete(audioCacheKey);
        videoDubbingAudioFailures.set(cueKey, Date.now() + 5000);
        if (!isLiveCue) videoDubbingConsumedCueKeys.add(cueKey);
        setVideoDubbingState("error");
      } else {
        if (isLiveCue) {
          if (completed) commitVideoDubbingLiveCue(cue, cueKey);
        } else {
          videoDubbingConsumedCueKeys.add(cueKey);
        }
        setVideoDubbingState("idle");
      }
      if (isLiveCue && hasPendingVideoDubbingLiveCue()) schedulePendingLiveVideoDubbing(failed ? 220 : 40);
      const syncReason = failed ? "audio-error" : "audio-finished";
      window.setTimeout(() => syncVideoDubbing(syncReason), 0);
    };
    audio.onended = () => finish(false, true);
    audio.onerror = () => finish(true);

    await waitForVideoDubbingAudioMetadata(audio);
    if (token !== videoDubbingToken || videoDubbingAudio !== audio) return;

    const refreshedTimelineTime = getVideoSubtitleLookupTime(video.currentTime);
    if (video.paused || video.seeking || video.ended || (!isLiveCue && cue.end - refreshedTimelineTime < 0.16)) {
      finish(false, false);
      return;
    }

    const playbackRate = clampNumber(video.playbackRate, 0.25, 4, 1);
    const availableWallSeconds = isLiveCue
      ? Math.max(0.8, estimateVideoDubbingSpeechSeconds(cue.text) / playbackRate)
      : Math.max(0.08, (cue.end - refreshedTimelineTime) / playbackRate);
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.preservesPitch = true;
      const requiredRate = audio.duration / availableWallSeconds;
      // Prefer continuous video playback. Speed long translations toward their
      // caption budget (up to the safe media-rate cap) instead of freezing the
      // picture until TTS catches up.
      audio.playbackRate = clampNumber(requiredRate, 0.95, VIDEO_DUBBING_MAX_PLAYBACK_RATE, 1);
    }

    try {
      await audio.play();
    } catch {
      finish(true);
      return;
    }
    if (token !== videoDubbingToken || videoDubbingAudio !== audio) return;
    if (
      !isLiveCue
      && Number.isFinite(audio.duration)
      && audio.duration > 0
    ) {
      // audio.play() itself can take a little time to start. Recalculate from
      // the two clocks once playback is real so that startup latency cannot
      // push this sentence under the following caption.
      const activeTimelineTime = getVideoSubtitleLookupTime(video.currentTime);
      const remainingVideoSeconds = cue.end - activeTimelineTime;
      if (remainingVideoSeconds <= 0.04) {
        finish(false, false);
        return;
      }
      const remainingWallSeconds = Math.max(0.04, remainingVideoSeconds / playbackRate);
      const remainingAudioSeconds = Math.max(0.01, audio.duration - Number(audio.currentTime || 0));
      const activeRequiredRate = remainingAudioSeconds / remainingWallSeconds;
      audio.playbackRate = clampNumber(activeRequiredRate, 0.95, VIDEO_DUBBING_MAX_PLAYBACK_RATE, 1);
    }
    setVideoDubbingActiveCueDiagnostic(cue);
    setVideoDubbingState("playing");

    // Only a hung-playback fuse. Normal completion is driven by onended.
    const expectedWallSeconds = Number.isFinite(audio.duration) && audio.duration > 0
      ? audio.duration / clampNumber(audio.playbackRate, 0.25, 4, 1)
      : estimateVideoDubbingSpeechSeconds(cue.text);
    const remainingWallMs = getVideoDubbingWatchdogMs(expectedWallSeconds);
    videoDubbingTimer = window.setTimeout(() => {
      if (token !== videoDubbingToken || videoDubbingAudio !== audio) return;
      if (!isLiveCue) videoDubbingConsumedCueKeys.add(cueKey);
      stopVideoDubbing(false);
      syncVideoDubbing("audio-timeout");
    }, remainingWallMs);
  }
  function speakVideoDubbingCue(video, cue, cueKey) {
    const isLiveCue = Boolean(cue.live);
    if (isVideoDubbingSessionArmed()) {
      void playVideoDubbingAudioCue(video, cue, cueKey);
      return;
    }
    const language = selectionSpeechLanguage(settings.videoSubtitleTargetLanguage || "Vietnamese");
    const selectedEdgeVoice = getSelectedVideoDubbingVoice();
    const voice = selectedEdgeVoice ? null : getVideoDubbingVoice(language);
    if (selectedEdgeVoice || !voice || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance !== "function") {
      void playVideoDubbingAudioCue(video, cue, cueKey);
      return;
    }

    stopVideoDubbing(false);
    applyVideoDubbingOriginalVolume(video);
    const token = videoDubbingToken;
    const utterance = new SpeechSynthesisUtterance(cue.text);
    utterance.lang = voice.lang || language;
    utterance.voice = voice;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.rate = getVideoDubbingRate(cue.text, cue.end - getVideoSubtitleLookupTime(video.currentTime), video);
    videoDubbingUtterance = utterance;
    videoDubbingActiveCueKey = cueKey;
    setVideoDubbingActiveCueDiagnostic(cue);
    setVideoDubbingState("playing");
    const expectedWallSeconds = estimateVideoDubbingSpeechSeconds(cue.text)
      / clampNumber(utterance.rate, 0.1, 10, 1);
    let utteranceStartedAt = null;
    const utteranceQueuedAt = performance.now();

    const finish = (failed = false) => {
      if (token !== videoDubbingToken || videoDubbingUtterance !== utterance) return;
      clearVideoDubbingTimer();
      videoDubbingUtterance = null;
      videoDubbingActiveCueKey = "";
      setVideoDubbingActiveCueDiagnostic();
      if (failed) {
        setVideoDubbingState("loading");
        void playVideoDubbingAudioCue(video, cue, cueKey);
      } else {
        if (isLiveCue) commitVideoDubbingLiveCue(cue, cueKey);
        else videoDubbingConsumedCueKeys.add(cueKey);
        setVideoDubbingState("idle");
        if (isLiveCue && hasPendingVideoDubbingLiveCue()) schedulePendingLiveVideoDubbing(40);
        window.setTimeout(() => syncVideoDubbing("utterance-finished"), 0);
      }
    };
    utterance.onstart = () => {
      utteranceStartedAt = performance.now();
    };
    utterance.onend = () => {
      const elapsedSeconds = Math.max(
        0,
        (performance.now() - (utteranceStartedAt ?? utteranceQueuedAt)) / 1000
      );
      const endedPrematurely = expectedWallSeconds >= 1.4
        && elapsedSeconds < Math.max(0.45, expectedWallSeconds * 0.35);
      finish(endedPrematurely);
    };
    utterance.onerror = () => finish(true);
    try {
      window.speechSynthesis.resume?.();
      window.speechSynthesis.speak(utterance);
    } catch {
      finish(true);
      return;
    }
    // Only a hung-playback fuse. Normal completion is driven by onended.
    const remainingWallMs = getVideoDubbingWatchdogMs(expectedWallSeconds);
    videoDubbingTimer = window.setTimeout(() => {
      if (token !== videoDubbingToken || videoDubbingUtterance !== utterance) return;
      if (!isLiveCue) videoDubbingConsumedCueKeys.add(cueKey);
      stopVideoDubbing(false);
      syncVideoDubbing("speech-timeout");
    }, remainingWallMs);
  }
  function syncVideoDubbing(reason = "sync") {
    if (!canUseVideoDubbing()) {
      if (videoDubbingUtterance || videoDubbingAudio || videoDubbingAudioPendingKey || videoDubbingTimer || videoDubbingVideo) {
        stopVideoDubbing(true);
      }
      return;
    }
    const video = getPrimaryVideo();
    if (!video || video.paused || video.seeking || video.ended) {
      if (videoDubbingUtterance || videoDubbingAudio || videoDubbingAudioPendingKey || videoDubbingTimer || videoDubbingVideo) {
        stopVideoDubbing(true);
      }
      return;
    }
    const timeline = getVideoDubbingTimeline();
    if (!timeline.length) {
      if (!videoDubbingAudio && !videoDubbingUtterance && !videoDubbingAudioPendingKey) {
        if (hasPendingVideoDubbingLiveCue()) {
          // A rate/voice change or watchdog can stop the active cue before its
          // finish handler arms the next queued live cue.
          if (!videoDubbingLiveTimer) schedulePendingLiveVideoDubbing(0);
        } else {
          restoreVideoDubbingOriginalVolume();
        }
      }
      requestYouTubeCaptionTimeline();
      return;
    }
    applyVideoDubbingOriginalVolume(video);
    const currentTime = Number(video.currentTime || 0);
    const timelineTime = getVideoSubtitleLookupTime(currentTime);
    // Let the active sentence finish. timeupdate keeps firing after cue.end and
    // previously treated that as permission to cut the generated audio. A TTS
    // request in flight is active too; replacing it every cue only creates churn.
    if (videoDubbingAudio || videoDubbingUtterance) return;
    if (videoDubbingAudioPendingKey) {
      const pendingCue = videoDubbingAudioPendingCue;
      const pendingKey = videoDubbingAudioPendingKey;
      const pendingAgeMs = Date.now() - videoDubbingAudioPendingStartedAt;
      const isStale = !pendingCue?.live && Number(pendingCue?.end || 0) - timelineTime < 0.2;
      const isExpired = pendingAgeMs > getVideoDubbingPendingMaxMs(pendingCue);
      if (!isStale && !isExpired) return;
      if (!pendingCue?.live && pendingKey) videoDubbingConsumedCueKeys.add(pendingKey);
      stopVideoDubbing(false);
      applyVideoDubbingOriginalVolume(video);
    }
    let index = findVideoDubbingCueIndex(currentTime);
    if (videoDubbingSessionStartIndex >= 0 && index >= 0 && index < videoDubbingSessionStartIndex) {
      index = videoDubbingSessionStartIndex;
    }
    while (index >= 0 && index < timeline.length) {
      const cue = getVideoDubbingCue(index);
      if (!cue || cue.end <= timelineTime + 0.04) {
        index += 1;
        continue;
      }
      if (!cue.text) {
        if (videoDubbingUtterance || videoDubbingAudio || videoDubbingAudioPendingKey) {
          stopVideoDubbing(false);
          applyVideoDubbingOriginalVolume(video);
        }
        if (videoCaptionTimeline.length) {
          requestVideoCaptionCueTranslation(index);
          prefetchVideoCaptionWindow(index + 1);
        }
        const pendingKey = `${videoCaptionTimelineKey || location.href}\u0000pending\u0000${index}`;
        if (!videoDubbingTimer || videoDubbingScheduledCueKey !== pendingKey) {
          clearVideoDubbingTimer();
          videoDubbingScheduledCueKey = pendingKey;
          const token = videoDubbingToken;
          videoDubbingTimer = window.setTimeout(() => {
            if (token !== videoDubbingToken) return;
            videoDubbingTimer = null;
            videoDubbingScheduledCueKey = "";
            syncVideoDubbing("translation-wait");
          }, 140);
        }
        return;
      }
      const cueKey = getVideoDubbingCueKey(cue);
      if (videoDubbingConsumedCueKeys.has(cueKey)) {
        index += 1;
        continue;
      }
      if (isVideoDubbingAudioFailed(cueKey)) {
        index += 1;
        continue;
      }
      // Prefetch the current cue too. Waiting until cue.start to call Edge TTS
      // loses the synthesis latency and leaves only a fraction of the cue to speak.
      prefetchVideoDubbingAudio(index, 6);
      if (cue.start > timelineTime + 0.06) {
        if (videoDubbingUtterance || videoDubbingAudio || videoDubbingAudioPendingKey) stopVideoDubbing(false);
        applyVideoDubbingOriginalVolume(video);
        scheduleVideoDubbingCue(video, cue, cueKey);
        return;
      }
      const elapsed = Math.max(0, timelineTime - cue.start);
      const duration = Math.max(0.25, cue.end - cue.start);
      const remaining = cue.end - timelineTime;
      const lateLimit = Math.min(1.4, Math.max(0.45, duration * 0.55));
      if (remaining < 0.28 || (elapsed > lateLimit && remaining < 0.75)) {
        videoDubbingConsumedCueKeys.add(cueKey);
        index += 1;
        continue;
      }
      if (!videoDubbingAudioCache.has(cueKey)) {
        // Startup and the rolling high-water buffer should normally make this
        // path rare. If the network still falls behind, keep the picture moving
        // and join the in-flight request; a late cue is preferable to freezing
        // the video in the middle of playback.
        scheduleVideoDubbingBackgroundBuffer(0, { force: true });
        waitForVideoDubbingAudioWithoutPausing(cue, cueKey);
        return;
      }
      if (videoDubbingAudioPendingKey === cueKey) return;
      if (
        videoDubbingActiveCueKey === cueKey
        && (videoDubbingUtterance || videoDubbingAudio || videoDubbingTimer)
        && timelineTime <= cue.end + 0.12
      ) return;
      speakVideoDubbingCue(video, cue, cueKey);
      return;
    }
    if (videoDubbingUtterance || videoDubbingAudio || videoDubbingAudioPendingKey || videoDubbingTimer) {
      stopVideoDubbing(false);
    } else {
      videoDubbingActiveCueKey = "";
    }
    restoreVideoDubbingOriginalVolume();
  }

  function getVideoCaptionCacheKey(text, cueStart = "live") {
    return `${settings.videoSubtitleEngine || "google"}\u0000${settings.videoSubtitleTargetLanguage || "Vietnamese"}\u0000${videoCaptionActiveSourceLanguageCode || settings.videoSubtitleSourceLanguage || "auto"}\u0000${cueStart}\u0000${text}`;
  }

  function getVideoCaptionCueContext(index) {
    return {
      contextBefore: normalizeVideoCaptionText(videoCaptionTimeline[index - 1]?.text || ""),
      contextAfter: normalizeVideoCaptionText(videoCaptionTimeline[index + 1]?.text || "")
    };
  }

  function getVideoCaptionCueCacheKey(index) {
    const cue = videoCaptionTimeline[index];
    return cue ? getVideoCaptionCacheKey(cue.text, cue.start.toFixed(3)) : "";
  }

  function requestVideoCaptionTranslation(text, {
    key = "",
    contextBefore = "",
    contextAfter = ""
  } = {}) {
    if (!shouldPrepareVideoCaptionTranslation()) return;
    const normalized = normalizeVideoCaptionText(text);
    if (!normalized) return;

    const cacheKey = key || getVideoCaptionCacheKey(normalized);
    if (videoCaptionTranslations.has(cacheKey) || videoCaptionPending.has(cacheKey)) return;
    videoCaptionPending.add(cacheKey);

    void sendMessage({
      type: "IB_TRANSLATE_VIDEO_CAPTION",
      text: normalized,
      contextBefore,
      contextAfter,
      manualSession: isVideoDubbingSessionRequested(),
      sourceLanguage: videoCaptionActiveSourceLanguageCode || settings.videoSubtitleSourceLanguage || "auto",
      targetLanguage: settings.videoSubtitleTargetLanguage || "Vietnamese",
      origin: getPageOrigin()
    }).then((response) => {
      if (!response?.ok || !response?.data?.result) return;
      videoCaptionTranslations.set(cacheKey, {
        result: response.data.result,
        engine: response.data.engine || ""
      });
    }).finally(() => {
      videoCaptionPending.delete(cacheKey);
      scheduleVideoCaptionRead(0);
      syncVideoDubbing("translation-ready");
    });
  }

  function requestVideoCaptionCueTranslation(index) {
    const cue = videoCaptionTimeline[index];
    if (!cue || !shouldPrepareVideoCaptionTranslation() || videoCaptionTargetMatchesSource()) return;
    requestVideoCaptionTranslation(cue.text, {
      key: getVideoCaptionCueCacheKey(index),
      ...getVideoCaptionCueContext(index)
    });
  }

  function prefetchVideoCaptionWindow(startIndex = 0) {
    if (!shouldPrepareVideoCaptionTranslation() || !videoCaptionTimeline.length || videoCaptionTranslatedTimeline.length) return;

    const targetLanguageCode = LANGUAGE_CATALOG?.codeFor(
      settings.videoSubtitleTargetLanguage || "Vietnamese",
      "vi"
    ) || "vi";
    if (sameLanguageCodeForUi(videoCaptionActiveSourceLanguageCode, targetLanguageCode)) return;

    const video = getPrimaryVideo();
    const currentTime = Number(video?.currentTime || 0);
    const endTime = currentTime + VIDEO_SUBTITLE_PREFETCH_SECONDS;
    const items = [];

    for (let index = Math.max(0, startIndex); index < videoCaptionTimeline.length; index += 1) {
      const cue = videoCaptionTimeline[index];
      if (cue.start > endTime && items.length) break;
      const key = getVideoCaptionCueCacheKey(index);
      if (videoCaptionTranslations.has(key) || videoCaptionPending.has(key)) continue;
      videoCaptionPending.add(key);
      items.push({
        id: key,
        text: cue.text,
        ...getVideoCaptionCueContext(index),
        sourceLanguage: videoCaptionActiveSourceLanguageCode || settings.videoSubtitleSourceLanguage || "auto"
      });
      if (items.length >= VIDEO_SUBTITLE_PREFETCH_BATCH) break;
    }

    if (!items.length) return;

    void sendMessage({
      type: "IB_TRANSLATE_VIDEO_CAPTION_BATCH",
      items,
      manualSession: isVideoDubbingSessionRequested(),
      targetLanguage: settings.videoSubtitleTargetLanguage || "Vietnamese",
      origin: getPageOrigin()
    }).then((response) => {
      for (const item of response?.data?.items || []) {
        if (item?.id && item?.result) {
          videoCaptionTranslations.set(item.id, {
            result: item.result,
            engine: item.engine || ""
          });
        }
      }
    }).finally(() => {
      for (const item of items) videoCaptionPending.delete(item.id);
      scheduleVideoCaptionRead(0);
      syncVideoDubbing("translation-batch-ready");
    });
  }

  function scheduleVideoCaptionRead(delay = 20) {
    if (checkAndTeardownIfOrphaned()) return;
    if (!shouldRunVideoSubtitleFeature()) return;
    const wait = Math.max(0, Number(delay || 0));
    const dueAt = performance.now() + wait;
    if (videoSubtitleTimer) {
      // Keep the earlier deadline, but let a more urgent cue replace a later timer.
      if (videoSubtitleTimerDueAt && videoSubtitleTimerDueAt <= dueAt + 2) return;
      clearTimeout(videoSubtitleTimer);
    }
    videoSubtitleTimerDueAt = dueAt;
    videoSubtitleTimer = window.setTimeout(() => {
      videoSubtitleTimer = null;
      videoSubtitleTimerDueAt = 0;
      void processCurrentVideoCaption();
    }, wait);
  }

  async function processCurrentVideoCaption() {
    if (!shouldRunVideoSubtitleFeature()) return;
    if (!settings.videoSubtitleShowSource && settings.videoSubtitleShowTranslation === false) {
      hideVideoSubtitleOverlay();
      if (!isVideoDubbingSessionRequested()) return;
    }

    if (
      videoCaptionUsesPlayerTrack
      || (!videoCaptionTimeline.length && !videoCaptionTranslatedTimeline.length)
    ) {
      const speechVideo = getPrimaryVideo();
      if (speechVideo && !speechVideo.seeking) {
        sampleVideoSubtitleSpeechActivity(speechVideo, performance.now());
      }
    }

    if (videoCaptionUsesPlayerTrack) {
      const video = getPrimaryVideo();
      const currentTime = Number(video?.currentTime || 0);
      if (video?.seeking) {
        hideVideoSubtitleOverlay();
        return;
      }
      const sourceIndex = videoCaptionTimeline.length
        ? findTimelineCueIndex(currentTime)
        : -1;
      if (videoCaptionTimeline.length) {
        scheduleNextTimelineCueRead(video, sourceIndex, videoCaptionTimeline);
      }

      if (videoCaptionTimeline.length && sourceIndex < 0) {
        return;
      }

      const translatedText = readYouTubeCaptionText();
      const sourceCue = sourceIndex >= 0 ? videoCaptionTimeline[sourceIndex] : null;
      const sourceText = sourceCue?.text || "";
      const targetLanguageCode = LANGUAGE_CATALOG?.codeFor(
        settings.videoSubtitleTargetLanguage || "Vietnamese",
        "vi"
      ) || "vi";
      const targetMatchesSource = Boolean(
        sourceCue
        && sameLanguageCodeForUi(videoCaptionActiveSourceLanguageCode, targetLanguageCode)
      );

      const translatedCue = videoCaptionTranslatedTimeline.length && sourceCue
        ? videoCaptionTranslatedTimeline.find((c) => Math.abs(c.start - sourceCue.start) < 0.08)
        : null;
      const timelineTranslation = translatedCue?.text || "";

      const cached = sourceCue
        ? videoCaptionTranslations.get(getVideoCaptionCueCacheKey(sourceIndex))
        : null;
      const fullTranslation = targetMatchesSource
        ? sourceText
        : timelineTranslation || cached?.result || "";

      if (sourceCue && settings.videoSubtitleShowSource && settings.videoSubtitleShowTranslation === false) {
        clearTimeout(videoSubtitleEmptyTimer);
        lastVideoCaptionText = sourceText;
        lastVideoCaptionTimelineIndex = sourceIndex;
        renderVideoSubtitleOverlay({
          source: sourceText,
          translation: "",
          engine: "source-track",
          karaokeStart: sourceCue.start,
          karaokeEnd: sourceCue.end,
          karaokeMode: "timeline"
        });
        return;
      }

      if (sourceCue && fullTranslation) {
        clearTimeout(videoSubtitleEmptyTimer);
        const captionChanged = fullTranslation !== lastVideoCaptionText
          || sourceIndex !== lastVideoCaptionTimelineIndex;
        lastVideoCaptionText = fullTranslation;
        lastVideoCaptionTimelineIndex = sourceIndex;
        if (captionChanged || videoSubtitleEl?.style.display !== "flex") {
          renderVideoSubtitleOverlay({
            source: sourceText,
            translation: fullTranslation,
            engine: targetMatchesSource ? "youtube-source-track" : (timelineTranslation ? "youtube-timeline" : cached?.engine || "google-prefetch"),
            karaokeStart: sourceCue.start,
            karaokeEnd: sourceCue.end,
            karaokeMode: "timeline"
          });
        }
        prefetchVideoCaptionWindow(sourceIndex + 1);
        return;
      }

      if (sourceCue) {
        requestVideoCaptionCueTranslation(sourceIndex);
        window.setTimeout(() => prefetchVideoCaptionWindow(sourceIndex + 1), 80);
      }
      if (!translatedText) return;

      clearTimeout(videoSubtitleEmptyTimer);
      if (translatedText === videoPlayerCaptionExpiredText) return;
      if (videoPlayerCaptionExpiredText) videoPlayerCaptionExpiredText = "";

      const captionChanged = translatedText !== lastVideoCaptionText;
      if (captionChanged) lastVideoCaptionText = translatedText;

      lastVideoCaptionTimelineIndex = sourceIndex;
      if (!captionChanged && videoSubtitleEl?.style.display === "flex") return;
      renderVideoSubtitleOverlay({
        source: sourceText,
        translation: translatedText,
        engine: videoCaptionTranslationEngine || "youtube-player-track",
        karaokeMode: "live"
      });
      return;
    }

    if (videoCaptionTimeline.length) {
      const video = getPrimaryVideo();
      const currentTime = Number(video?.currentTime || 0);
      const index = findTimelineCueIndex(currentTime);
      scheduleNextTimelineCueRead(video, index, videoCaptionTimeline);
      if (index >= 0) {
        const cue = videoCaptionTimeline[index];
        if (videoCaptionTargetMatchesSource()) {
          lastVideoCaptionText = cue.text;
          lastVideoCaptionTimelineIndex = index;
          clearTimeout(videoSubtitleEmptyTimer);
          renderVideoSubtitleOverlay({
            source: cue.text,
            translation: cue.text,
            engine: "source-track",
            karaokeStart: cue.start,
            karaokeEnd: cue.end,
            karaokeMode: "timeline"
          });
          return;
        }
        if (videoCaptionTranslatedTimeline.length) {
          const translatedIndex = findTimelineCueIndex(currentTime, videoCaptionTranslatedTimeline);
          const translatedCue = translatedIndex >= 0 ? videoCaptionTranslatedTimeline[translatedIndex] : null;
          lastVideoCaptionText = cue.text;
          lastVideoCaptionTimelineIndex = index;

          if (translatedCue?.text) {
            clearTimeout(videoSubtitleEmptyTimer);
            renderVideoSubtitleOverlay({
              source: cue.text,
              translation: translatedCue.text,
              engine: videoCaptionTranslationEngine || "youtube",
              karaokeStart: translatedCue.start,
              karaokeEnd: translatedCue.end,
              karaokeMode: "timeline"
            });
          }
          return;
        }
        const key = getVideoCaptionCueCacheKey(index);
        const cached = videoCaptionTranslations.get(key);
        lastVideoCaptionText = cue.text;
        lastVideoCaptionTimelineIndex = index;

        if (cached?.result) {
          clearTimeout(videoSubtitleEmptyTimer);
          renderVideoSubtitleOverlay({
            source: cue.text,
            translation: cached.result,
            engine: cached.engine,
            karaokeStart: cue.start,
            karaokeEnd: cue.end,
            karaokeMode: "timeline"
          });
          prefetchVideoCaptionWindow(index + 1);
          return;
        }

        if (settings.videoSubtitleShowSource) {
          clearTimeout(videoSubtitleEmptyTimer);
          renderVideoSubtitleOverlay({
            source: cue.text,
            translation: "",
            engine: "translation-pending",
            karaokeStart: cue.start,
            karaokeEnd: cue.end,
            karaokeMode: "timeline"
          });
        }
        requestVideoCaptionCueTranslation(index);
        window.setTimeout(() => prefetchVideoCaptionWindow(index + 1), 40);
        return;
      }
    }

    if (videoCaptionTranslatedTimeline.length) return;

    const targetMatchesSource = videoCaptionTargetMatchesSource();
    const liveCandidate = readYouTubeCaptionCandidate() || readHtmlVideoTrackText();
    const text = readCurrentVideoCaptionText();
    if ((liveCandidate || text) && videoCaptionTimelineError) {
      videoCaptionTimelineError = "";
      updateYouTubeVideoControl();
    }

    if (settings.videoSubtitleShowSource && settings.videoSubtitleShowTranslation === false && liveCandidate) {
      lastVideoCaptionText = liveCandidate;
      clearTimeout(videoSubtitleEmptyTimer);
      renderVideoSubtitleOverlay({
        source: liveCandidate,
        translation: "",
        engine: "source-track",
        karaokeMode: "live"
      });
      return;
    }

    // When no translation is needed, render the raw live candidate immediately.
    // The committed text intentionally lags behind to avoid translating every growing word,
    // but it must not delay same-language subtitle display.
    if (targetMatchesSource && liveCandidate) {
      lastVideoCaptionText = liveCandidate;
      clearTimeout(videoSubtitleEmptyTimer);
      renderVideoSubtitleOverlay({
        source: liveCandidate,
        translation: liveCandidate,
        engine: "source-track",
        karaokeMode: "live"
      });
      maybeSpeakLiveVideoDubbing(liveCandidate, liveCandidate);
      return;
    }

    if (!text) {
      if (settings.videoSubtitleShowSource && liveCandidate && !targetMatchesSource) {
        clearTimeout(videoSubtitleEmptyTimer);
        renderVideoSubtitleOverlay({
          source: liveCandidate,
          translation: "",
          engine: "translation-pending",
          karaokeMode: "live"
        });
      }
      return;
    }

    clearTimeout(videoSubtitleEmptyTimer);
    if (targetMatchesSource) {
      const displayText = liveCandidate || text;
      lastVideoCaptionText = displayText;
      renderVideoSubtitleOverlay({
        source: displayText,
        translation: displayText,
        engine: "source-track",
        karaokeMode: "live"
      });
      maybeSpeakLiveVideoDubbing(displayText, displayText);
      return;
    }
    const key = getVideoCaptionCacheKey(text);
    const cached = videoCaptionTranslations.get(key);
    if (cached?.result) {
      lastVideoCaptionText = text;
      renderVideoSubtitleOverlay({
        source: text,
        translation: cached.result,
        engine: cached.engine,
        karaokeMode: "live"
      });
      maybeSpeakLiveVideoDubbing(text, cached.result);
      return;
    }
    if (settings.videoSubtitleShowSource) {
      clearTimeout(videoSubtitleEmptyTimer);
      renderVideoSubtitleOverlay({
        source: text,
        translation: "",
        engine: "translation-pending",
        karaokeMode: "live"
      });
    }
    if (text === lastVideoCaptionText && videoCaptionPending.has(key)) return;
    lastVideoCaptionText = text;
    videoCaptionPending.add(key);

    const requestId = ++videoSubtitleRequestSeq;
    const response = await sendMessage({
      type: "IB_TRANSLATE_VIDEO_CAPTION",
      text,
      sourceLanguage: videoCaptionActiveSourceLanguageCode || settings.videoSubtitleSourceLanguage || "auto",
      targetLanguage: settings.videoSubtitleTargetLanguage || "Vietnamese",
      origin: getPageOrigin()
    });
    videoCaptionPending.delete(key);

    if (requestId !== videoSubtitleRequestSeq || text !== lastVideoCaptionText) return;
    if (!response?.ok || !response?.data?.result) return;

    videoCaptionTranslations.set(key, {
      result: response.data.result,
      engine: response.data.engine || ""
    });
    renderVideoSubtitleOverlay({
      source: text,
      translation: response.data.result,
      engine: response.data.engine,
      karaokeMode: "live"
    });
    maybeSpeakLiveVideoDubbing(text, response.data.result);
  }

  function resetVideoSubtitleLiveKaraoke() {
    videoSubtitleLiveKaraokeCandidate = "";
    videoSubtitleLiveKaraokeDisplayText = "";
    videoSubtitleLiveKaraokeCandidateWordCount = 0;
    videoSubtitleLiveKaraokeLastArrivalAt = 0;
    videoSubtitleLiveKaraokeMsPerWord = 245;
    videoSubtitleLiveKaraokeNextStepAt = 0;
    videoSubtitleLiveKaraokeTargetIndex = -1;
    videoSubtitleKaraokeActiveIndex = -1;
  }

  function resetYouTubeCaptionReader() {
    videoPlayerCaptionCandidateText = "";
    videoPlayerCaptionCandidateChangedAt = 0;
    videoPlayerCaptionCandidateStartedAt = 0;
    videoPlayerCaptionCandidateSpeechClockStartedAt = 0;
    videoPlayerCaptionCommittedText = "";
    videoPlayerCaptionLastCommittedAt = 0;
    resetVideoSubtitleLiveKaraoke();
  }

  function readCurrentVideoCaptionText() {
    return readYouTubeCaptionText() || readHtmlVideoTrackText();
  }

  function readYouTubeCaptionText() {
    const candidate = readYouTubeCaptionCandidate();
    if (!candidate) return videoPlayerCaptionCommittedText;

    const now = performance.now();
    if (candidate !== videoPlayerCaptionCandidateText) {
      const previousCandidate = videoPlayerCaptionCandidateText;
      const sameGrowingChunk = Boolean(
        previousCandidate
        && (candidate.startsWith(previousCandidate) || previousCandidate.startsWith(candidate))
      );

      if (!sameGrowingChunk || !videoPlayerCaptionCandidateStartedAt) {
        videoPlayerCaptionCandidateStartedAt = now;
        videoPlayerCaptionCandidateSpeechClockStartedAt = videoSubtitleSpeechClockMs;
      }
      videoPlayerCaptionCandidateText = candidate;
      videoPlayerCaptionCandidateChangedAt = now;
    }

    const completeSentence = hasCaptionTerminalPunctuation(candidate);
    const wordCount = candidate.split(/\s+/).filter(Boolean).length;
    const committedWordCount = videoPlayerCaptionCommittedText.split(/\s+/).filter(Boolean).length;
    const hasEnoughContent = candidate.length >= 8 || wordCount >= 2;
    const isNewChunk = !videoPlayerCaptionCommittedText
      || (!candidate.startsWith(videoPlayerCaptionCommittedText)
        && !videoPlayerCaptionCommittedText.startsWith(candidate));
    const initialCommitDue = isNewChunk
      && hasEnoughContent
      && now - videoPlayerCaptionCandidateStartedAt >= VIDEO_PLAYER_CAPTION_INITIAL_COMMIT_MS;
    const refreshDue = !isNewChunk
      && hasEnoughContent
      && now - videoPlayerCaptionLastCommittedAt >= VIDEO_PLAYER_CAPTION_REFRESH_MS
      && (candidate.length - videoPlayerCaptionCommittedText.length >= 10
        || wordCount - committedWordCount >= 2);

    if (candidate !== videoPlayerCaptionCommittedText && (completeSentence || initialCommitDue || refreshDue)) {
      videoPlayerCaptionCommittedText = candidate;
      videoPlayerCaptionLastCommittedAt = now;
    } else if (candidate !== videoPlayerCaptionCommittedText) {
      scheduleVideoCaptionRead(60);
    }

    return videoPlayerCaptionCommittedText;
  }

  function readYouTubeCaptionCandidate() {
    const windows = [...document.querySelectorAll(".ytp-caption-window-container .caption-window")]
      .filter((windowEl) => !windowEl.closest(".ib-video-subtitle-overlay"));
    const scope = windows.at(-1) || document;
    const nodes = [...scope.querySelectorAll(".caption-visual-line .ytp-caption-segment")];
    const fallbackNodes = nodes.length
      ? nodes
      : [...scope.querySelectorAll(".ytp-caption-segment, .caption-visual-line")];
    const parts = [];

    for (const node of fallbackNodes) {
      const value = cleanYouTubeCaptionSegment(node.textContent);
      if (value && value !== parts.at(-1)) parts.push(value);
    }

    return extractLatestYouTubeCaptionChunk(parts);
  }

  function extractLatestYouTubeCaptionChunk(parts) {
    if (!parts.length) return "";

    let startIndex = 0;
    let markerOffset = -1;
    for (let index = 0; index < parts.length; index += 1) {
      const offset = parts[index].lastIndexOf(">>");
      if (offset >= 0) {
        startIndex = index;
        markerOffset = offset + 2;
      }
    }

    const activeParts = parts.slice(startIndex);
    if (markerOffset >= 0 && activeParts.length) {
      activeParts[0] = activeParts[0].slice(markerOffset).trim();
    }

    const activeText = normalizeVideoCaptionText(activeParts.filter(Boolean).join(" "));
    const fullText = normalizeVideoCaptionText(parts.join(" ").replace(/>>/g, " "));
    const sentencePattern = /[^.!?…。！？]+[.!?…。！？]+(?:["'”’）)\]}]+)?/g;
    const extractCurrentSentence = (text) => {
      const value = normalizeVideoCaptionText(text);
      if (!value) return "";

      const trailing = value.match(/(?:^|[.!?…。！？]+(?:["'”’）)\]}]+)?\s+)([^.!?…。！？]+)$/)?.[1];
      if (trailing) return normalizeVideoCaptionText(trailing);

      const completed = value.match(sentencePattern)
        ?.map((sentence) => normalizeVideoCaptionText(sentence))
        .filter(Boolean) || [];
      return completed.at(-1) || value;
    };

    const activeCurrent = extractCurrentSentence(activeText);
    if (activeCurrent) return activeCurrent;

    const fullCurrent = extractCurrentSentence(fullText);
    if (fullCurrent) return fullCurrent;

    if (activeParts.length > 1) return normalizeVideoCaptionText(activeParts.at(-1));
    return activeText;
  }

  function hasCaptionTerminalPunctuation(text) {
    return /[.!?…。！？](?:["'”’）)\]}]+)?$/.test(String(text || "").trim());
  }

  function cleanYouTubeCaptionSegment(value) {
    let text = normalizeVideoCaptionText(value);
    if (!text) return "";

    text = text.replace(/^.*?click\s+(?:here\s+)?for\s+settings\s*/i, "").trim();
    const labels = new Set([
      settings.videoSubtitleTargetLanguage,
      LANGUAGE_CATALOG?.nameFor(videoCaptionActiveSourceLanguageCode, ""),
      ...videoCaptionAvailableTracks.map((track) => track?.label)
    ].filter(Boolean).map((label) => normalizeVideoCaptionText(label)));

    const orderedLabels = [...labels].sort((left, right) => right.length - left.length);

    for (const label of orderedLabels) {
      if (!label) continue;
      if (text.toLowerCase() === label.toLowerCase()) return "";
      if (text.toLowerCase().startsWith(`${label.toLowerCase()} `)) {
        text = text.slice(label.length).trim();
        break;
      }
    }

    return normalizeVideoCaptionText(text);
  }

  function readHtmlVideoTrackText() {
    const parts = [];
    for (const video of document.querySelectorAll("video")) {
      for (const track of video.textTracks || []) {
        const cues = [...(track.activeCues || [])];
        for (const cue of cues) {
          const value = normalizeVideoCaptionText(cue?.text);
          if (value && value !== parts.at(-1)) parts.push(value);
        }
      }
    }
    return normalizeVideoCaptionText(parts.join(" "));
  }

  function normalizeVideoCaptionText(value) {
    return String(value || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 800);
  }

  function getVideoSubtitleHost() {
    const fullscreen = document.fullscreenElement;
    if (fullscreen) {
      if (fullscreen instanceof HTMLVideoElement) {
        return fullscreen.parentElement || document.body || document.documentElement;
      }
      return fullscreen;
    }
    return document.querySelector(".html5-video-player")
      || document.querySelector("video")?.parentElement
      || document.body
      || document.documentElement;
  }

  function ensureVideoSubtitleOverlay(forceReattach = false) {
    const host = getVideoSubtitleHost();
    if (!host) return null;

    if (!videoSubtitleEl) {
      videoSubtitleEl = document.createElement("div");
      videoSubtitleEl.className = "ib-video-subtitle-overlay";
      videoSubtitleEl.setAttribute("aria-live", "polite");
      videoSubtitleEl.innerHTML = `
        <div class="ib-video-subtitle-item" data-subtitle-kind="source">
          <button class="ib-video-subtitle-drag-handle" type="button" aria-label="Kéo phụ đề gốc" title="Kéo để đổi vị trí · Nhấp đúp để đặt lại"></button>
          <div class="ib-video-subtitle-source"></div>
        </div>
        <div class="ib-video-subtitle-item" data-subtitle-kind="translation">
          <button class="ib-video-subtitle-drag-handle" type="button" aria-label="Kéo bản dịch" title="Kéo để đổi vị trí · Nhấp đúp để đặt lại"></button>
          <div class="ib-video-subtitle-translation"></div>
        </div>
        <div class="ib-video-subtitle-word-tooltip" role="tooltip" hidden></div>
      `;
      bindVideoSubtitleDrag(videoSubtitleEl);
      void loadVideoSubtitleDragPositions();
    }

    if (forceReattach || videoSubtitleEl.parentElement !== host) {
      videoSubtitleEl.remove();
      if (host !== document.body && host !== document.documentElement) host.classList.add("ib-video-subtitle-host");
      host.appendChild(videoSubtitleEl);
      bindVideoSubtitleWordHover(videoSubtitleEl);
      bindVideoSubtitleDrag(videoSubtitleEl);
    }

    videoSubtitleEl.dataset.position = settings.videoSubtitlePosition === "top" ? "top" : "bottom";
    const legacyFontSize = Math.max(16, Math.min(36, Number(settings.videoSubtitleFontSize || 22)));
    const sourceFontSize = Math.max(14, Math.min(42, Number(settings.videoSubtitleSourceFontSize || legacyFontSize + 2)));
    const translationFontSize = Math.max(14, Math.min(42, Number(settings.videoSubtitleTranslationFontSize || legacyFontSize - 2)));
    const sourceColor = normalizeVideoSubtitleColor(settings.videoSubtitleSourceColor, "#ffffff");
    const translationColor = normalizeVideoSubtitleColor(settings.videoSubtitleTranslationColor, "#8fd3ff");
    const sourceOpacity = clampNumber(settings.videoSubtitleSourceBackgroundOpacity, 0, 100, 78) / 100;
    const translationOpacity = clampNumber(settings.videoSubtitleTranslationBackgroundOpacity, 0, 100, 82) / 100;
    const sourceBackground = videoSubtitleColorWithAlpha(settings.videoSubtitleSourceBackground, sourceOpacity, "#111827");
    const translationBackground = videoSubtitleColorWithAlpha(settings.videoSubtitleTranslationBackground, translationOpacity, "#0b2538");
    videoSubtitleEl.dataset.sourceTransparent = String(sourceOpacity <= 0.02);
    videoSubtitleEl.dataset.translationTransparent = String(translationOpacity <= 0.02);
    const sourceWeight = clampNumber(settings.videoSubtitleSourceFontWeight, 400, 800, 700);
    const translationWeight = clampNumber(settings.videoSubtitleTranslationFontWeight, 400, 800, 600);
    const sourceRadius = clampNumber(settings.videoSubtitleSourceRadius, 0, 24, 10);
    const translationRadius = clampNumber(settings.videoSubtitleTranslationRadius, 0, 24, 10);
    const sourceOutline = clampNumber(settings.videoSubtitleSourceOutline, 0, 3, 1);
    const translationOutline = clampNumber(settings.videoSubtitleTranslationOutline, 0, 3, 1);

    videoSubtitleEl.style.setProperty("--ib-video-subtitle-size", `${translationFontSize}px`);
    videoSubtitleEl.style.setProperty("--ib-video-subtitle-source-size", `${sourceFontSize}px`);
    videoSubtitleEl.style.setProperty("--ib-video-subtitle-translation-size", `${translationFontSize}px`);
    videoSubtitleEl.style.setProperty("--ib-video-subtitle-source-color", sourceColor);
    videoSubtitleEl.style.setProperty("--ib-video-subtitle-translation-color", translationColor);
    videoSubtitleEl.style.setProperty("--ib-video-subtitle-source-bg", sourceBackground);
    videoSubtitleEl.style.setProperty("--ib-video-subtitle-translation-bg", translationBackground);
    videoSubtitleEl.style.setProperty("--ib-video-subtitle-source-family", videoSubtitleFontFamily(settings.videoSubtitleSourceFontFamily));
    videoSubtitleEl.style.setProperty("--ib-video-subtitle-translation-family", videoSubtitleFontFamily(settings.videoSubtitleTranslationFontFamily));
    videoSubtitleEl.style.setProperty("--ib-video-subtitle-source-weight", String(sourceWeight));
    videoSubtitleEl.style.setProperty("--ib-video-subtitle-translation-weight", String(translationWeight));
    videoSubtitleEl.style.setProperty("--ib-video-subtitle-source-radius", `${sourceRadius}px`);
    videoSubtitleEl.style.setProperty("--ib-video-subtitle-translation-radius", `${translationRadius}px`);
    videoSubtitleEl.style.setProperty("--ib-video-subtitle-source-outline", `${sourceOutline}px`);
    videoSubtitleEl.style.setProperty("--ib-video-subtitle-translation-outline", `${translationOutline}px`);
    return videoSubtitleEl;
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  }

  function normalizeVideoSubtitleColor(value, fallback) {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
  }

  function videoSubtitleColorWithAlpha(value, alpha, fallback) {
    const color = normalizeVideoSubtitleColor(value, fallback).slice(1);
    const red = Number.parseInt(color.slice(0, 2), 16);
    const green = Number.parseInt(color.slice(2, 4), 16);
    const blue = Number.parseInt(color.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  function videoSubtitleFontFamily(value) {
    const families = {
      system: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
      sans: 'Arial, Helvetica, ui-sans-serif, sans-serif',
      serif: 'Georgia, "Times New Roman", ui-serif, serif',
      mono: 'ui-monospace, "SFMono-Regular", Consolas, monospace'
    };
    return families[String(value || "system")] || families.system;
  }

  function getDefaultVideoSubtitleDragPositions() {
    const top = settings.videoSubtitlePosition === "top";
    return top
      ? { source: { x: 50, y: 19 }, translation: { x: 50, y: 24 } }
      : { source: { x: 50, y: 81 }, translation: { x: 50, y: 86 } };
  }

  function sanitizeVideoSubtitlePosition(value, fallback) {
    return {
      x: clampNumber(value?.x, 0, 100, fallback.x),
      y: clampNumber(value?.y, 0, 100, fallback.y)
    };
  }

  function getVideoSubtitleDragPositions() {
    const defaults = getDefaultVideoSubtitleDragPositions();
    return {
      source: sanitizeVideoSubtitlePosition(videoSubtitleDragPositions?.source, defaults.source),
      translation: sanitizeVideoSubtitlePosition(videoSubtitleDragPositions?.translation, defaults.translation)
    };
  }

  async function loadVideoSubtitleDragPositions() {
    if (videoSubtitlePositionLoadPromise) return videoSubtitlePositionLoadPromise;
    videoSubtitlePositionLoadPromise = chrome.storage.local.get([
      VIDEO_SUBTITLE_POSITION_STORAGE_KEY,
      VIDEO_SUBTITLE_POSITION_LAYOUT_VERSION_KEY
    ])
      .then(async (stored) => {
        let byOrigin = stored?.[VIDEO_SUBTITLE_POSITION_STORAGE_KEY] || {};
        const storedLayoutVersion = Number(stored?.[VIDEO_SUBTITLE_POSITION_LAYOUT_VERSION_KEY] || 0);
        if (storedLayoutVersion < VIDEO_SUBTITLE_POSITION_LAYOUT_VERSION) {
          const sourceShift = storedLayoutVersion < 1 ? 5 : 4;
          byOrigin = Object.fromEntries(
            Object.entries(byOrigin).map(([origin, positions]) => {
              const source = positions?.source;
              if (!source || !Number.isFinite(Number(source.y))) return [origin, positions];
              return [origin, {
                ...positions,
                source: {
                  ...source,
                  y: clampNumber(Number(source.y) + sourceShift, 0, 100, 81)
                }
              }];
            })
          );
          await chrome.storage.local.set({
            [VIDEO_SUBTITLE_POSITION_STORAGE_KEY]: byOrigin,
            [VIDEO_SUBTITLE_POSITION_LAYOUT_VERSION_KEY]: VIDEO_SUBTITLE_POSITION_LAYOUT_VERSION
          });
        }
        videoSubtitleDragPositions = byOrigin[getPageOrigin()] || null;
        applyVideoSubtitleItemPositions();
      })
      .catch(() => {
        videoSubtitleDragPositions = null;
      });
    return videoSubtitlePositionLoadPromise;
  }

  function saveVideoSubtitleDragPositions() {
    clearTimeout(videoSubtitlePositionSaveTimer);
    videoSubtitlePositionSaveTimer = window.setTimeout(async () => {
      try {
        const stored = await chrome.storage.local.get(VIDEO_SUBTITLE_POSITION_STORAGE_KEY);
        const byOrigin = { ...(stored?.[VIDEO_SUBTITLE_POSITION_STORAGE_KEY] || {}) };
        byOrigin[getPageOrigin()] = getVideoSubtitleDragPositions();
        await chrome.storage.local.set({ [VIDEO_SUBTITLE_POSITION_STORAGE_KEY]: byOrigin });
      } catch {}
    }, 120);
  }

  function applyVideoSubtitleItemPositions(overlay = videoSubtitleEl) {
    if (!overlay?.isConnected) return;
    const overlayRect = overlay.getBoundingClientRect();
    if (!overlayRect.width || !overlayRect.height) return;
    const positions = getVideoSubtitleDragPositions();

    for (const kind of ["source", "translation"]) {
      const item = overlay.querySelector(`.ib-video-subtitle-item[data-subtitle-kind="${kind}"]`);
      if (!item) continue;
      item.style.left = `${positions[kind].x}%`;
      item.style.top = `${positions[kind].y}%`;
    }
  }

  function bindVideoSubtitleDrag(overlay) {
    if (!overlay || overlay.dataset.dragBound === "true") return;
    overlay.dataset.dragBound = "true";

    for (const handle of overlay.querySelectorAll(".ib-video-subtitle-drag-handle")) {
      handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        const item = handle.closest(".ib-video-subtitle-item");
        if (!item) return;
        const overlayRect = overlay.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();
        if (!overlayRect.width || !overlayRect.height) return;

        videoSubtitleDragState = {
          pointerId: event.pointerId,
          item,
          kind: item.dataset.subtitleKind,
          offsetX: event.clientX - (itemRect.left + itemRect.width / 2),
          offsetY: event.clientY - (itemRect.top + itemRect.height / 2)
        };
        item.classList.add("is-dragging");
        try { handle.setPointerCapture?.(event.pointerId); } catch {}
        event.preventDefault();
        event.stopPropagation();
      });

      handle.addEventListener("pointermove", (event) => {
        const state = videoSubtitleDragState;
        if (!state || state.pointerId !== event.pointerId) return;
        const overlayRect = overlay.getBoundingClientRect();
        const itemRect = state.item.getBoundingClientRect();
        const halfWidth = itemRect.width / 2;
        const halfHeight = itemRect.height / 2;
        const centerX = Math.max(halfWidth, Math.min(overlayRect.width - halfWidth, event.clientX - overlayRect.left - state.offsetX));
        const centerY = Math.max(halfHeight, Math.min(overlayRect.height - halfHeight, event.clientY - overlayRect.top - state.offsetY));

        state.item.style.left = `${centerX}px`;
        state.item.style.top = `${centerY}px`;
        const positions = getVideoSubtitleDragPositions();
        positions[state.kind] = {
          x: centerX / overlayRect.width * 100,
          y: centerY / overlayRect.height * 100
        };
        videoSubtitleDragPositions = positions;
        event.preventDefault();
        event.stopPropagation();
      });

      const finishDrag = (event) => {
        const state = videoSubtitleDragState;
        if (!state || state.pointerId !== event.pointerId) return;
        state.item.classList.remove("is-dragging");
        videoSubtitleDragState = null;
        saveVideoSubtitleDragPositions();
        try { handle.releasePointerCapture?.(event.pointerId); } catch {}
        event.preventDefault();
        event.stopPropagation();
      };
      handle.addEventListener("pointerup", finishDrag);
      handle.addEventListener("pointercancel", finishDrag);

      handle.addEventListener("dblclick", (event) => {
        const kind = handle.closest(".ib-video-subtitle-item")?.dataset.subtitleKind;
        if (!kind) return;
        const positions = getVideoSubtitleDragPositions();
        positions[kind] = getDefaultVideoSubtitleDragPositions()[kind];
        videoSubtitleDragPositions = positions;
        applyVideoSubtitleItemPositions(overlay);
        saveVideoSubtitleDragPositions();
        event.preventDefault();
        event.stopPropagation();
      });
    }
  }

  function renderVideoSubtitleOverlay({
    source = "",
    translation = "",
    engine = "",
    karaokeStart = null,
    karaokeEnd = null,
    karaokeMode = ""
  } = {}) {
    if (!shouldDisplayCurrentVideoSubtitles()) {
      hideVideoSubtitleOverlay();
      return;
    }
    const value = normalizeVideoCaptionText(translation);
    const normalizedSource = normalizeVideoCaptionText(source);
    const wantsSource = Boolean(settings.videoSubtitleShowSource);
    const wantsTranslation = settings.videoSubtitleShowTranslation !== false;
    const translationVisible = Boolean(wantsTranslation && value);
    const sourceVisible = Boolean(
      wantsSource
      && normalizedSource
      && (!translationVisible || normalizedSource.toLocaleLowerCase() !== value.toLocaleLowerCase())
    );
    if (!translationVisible && !sourceVisible) {
      hideVideoSubtitleOverlay();
      return;
    }

    const overlay = ensureVideoSubtitleOverlay();
    if (!overlay) return;

    const sourceEl = overlay.querySelector(".ib-video-subtitle-source");
    const translationEl = overlay.querySelector(".ib-video-subtitle-translation");
    const sourceItem = sourceEl.closest(".ib-video-subtitle-item");
    const translationItem = translationEl.closest(".ib-video-subtitle-item");

    renderVideoSubtitleWordText(sourceEl, sourceVisible ? normalizedSource : "", "source");
    sourceEl.hidden = !sourceVisible;
    if (sourceItem) sourceItem.hidden = !sourceVisible;
    translationEl.hidden = !translationVisible;
    if (translationItem) translationItem.hidden = !translationVisible;

    if (translationVisible) {
      const cueStart = Number(karaokeStart);
      const cueEnd = Number(karaokeEnd);
      const hasCueTiming = Number.isFinite(cueStart)
        && Number.isFinite(cueEnd)
        && cueEnd > cueStart;
      const newCueId = karaokeMode === "timeline"
        ? `timeline_${cueStart}_${cueEnd}`
        : `live_${videoPlayerCaptionCandidateStartedAt || 0}`;
      const sameCue = newCueId === currentVideoSubtitleCueId;

      if (newCueId !== currentVideoSubtitleCueId) {
        console.log("[InputBridge] Cue changed:", { previous: currentVideoSubtitleCueId, next: newCueId });
        currentVideoSubtitleCueId = newCueId;
      }
      if (translationEl.dataset.karaokeKey !== newCueId) {
        translationEl.dataset.karaokeKey = newCueId;
        if (!sameCue) resetVideoSubtitleLiveKaraoke();
      }

      translationEl.dataset.karaokeMode = karaokeMode || "";
      if (hasCueTiming) {
        translationEl.dataset.karaokeStart = String(cueStart);
        translationEl.dataset.karaokeEnd = String(cueEnd);
      } else {
        delete translationEl.dataset.karaokeStart;
        delete translationEl.dataset.karaokeEnd;
      }
      renderVideoSubtitleKaraokeText(translationEl, value, sameCue);
    } else {
      if (translationEl.childNodes.length) translationEl.replaceChildren();
      delete translationEl.dataset.karaokeKey;
      delete translationEl.dataset.karaokeMode;
      delete translationEl.dataset.karaokeStart;
      delete translationEl.dataset.karaokeEnd;
      stopVideoSubtitleKaraokeLoop();
    }

    overlay.classList.toggle("is-bilingual", sourceVisible && translationVisible);
    overlay.dataset.engine = engine || "";
    overlay.style.display = "flex";
    requestAnimationFrame(() => applyVideoSubtitleItemPositions(overlay));
    setNativeVideoCaptionsHidden(true);

    if (translationVisible) {
      updateVideoSubtitleKaraoke();
      startVideoSubtitleKaraokeLoop();
    }
  }

  function renderVideoSubtitleWordText(container, value, direction) {
    if (!container) return;
    const normalized = normalizeVideoCaptionText(value);
    const renderKey = `${direction}\u0000${normalized}`;
    if (container.dataset.hoverRenderKey === renderKey) return;

    if (videoSubtitleWordHoverEl && container.contains(videoSubtitleWordHoverEl)) {
      hideVideoSubtitleWordTooltip(videoSubtitleEl, { force: true });
    }

    container.dataset.hoverRenderKey = renderKey;
    container.replaceChildren();
    for (const segment of segmentVideoSubtitleText(normalized)) {
      if (!segment.isWord) {
        container.appendChild(document.createTextNode(segment.text));
        continue;
      }
      const word = document.createElement('span');
      word.className = 'ib-video-subtitle-word ib-video-subtitle-word-hover';
      word.dataset.hoverDirection = direction;
      word.dataset.hoverWord = segment.text;
      word.textContent = segment.text;
      container.appendChild(word);
    }
  }

  const VIDEO_SUBTITLE_PHRASE_LINKERS = new Set([
    'a', 'an', 'the', 'to', 'of', 'for', 'from', 'with', 'without', 'at', 'by', 'in', 'on',
    'into', 'onto', 'over', 'under', 'after', 'before', 'through', 'around', 'about', 'as', 'than'
  ]);
  const VIDEO_SUBTITLE_PHRASE_PARTICLES = new Set([
    'up', 'down', 'out', 'off', 'on', 'in', 'into', 'over', 'away', 'back', 'through', 'around',
    'along', 'apart', 'after', 'across'
  ]);

  function clearVideoSubtitleHoverHighlights() {
    for (const element of videoSubtitleWordHoverEls) {
      element?.classList.remove('is-hovered', 'is-phrase-hovered');
    }
    videoSubtitleWordHoverEls = [];
  }

  function hideVideoSubtitleWordTooltip(overlay, { force = false } = {}) {
    if (videoSubtitleSelectionActive && !force) return;
    clearTimeout(videoSubtitleWordHoverTimer);
    videoSubtitleWordHoverSeq += 1;
    clearVideoSubtitleHoverHighlights();
    videoSubtitleWordHoverEl = null;
    videoSubtitleWordHoverUsesPhrase = false;
    if (force) videoSubtitleSelectionActive = false;
    const tooltip = overlay?.querySelector('.ib-video-subtitle-word-tooltip');
    if (tooltip) tooltip.hidden = true;
  }

  function hasVideoSubtitlePhraseBoundary(leftWord, rightWord) {
    let node = leftWord?.nextSibling || null;
    while (node && node !== rightWord) {
      if (node.nodeType === Node.TEXT_NODE && /[.!?;:\n]/u.test(node.textContent || '')) return true;
      node = node.nextSibling;
    }
    return false;
  }

  function getVideoSubtitleTextBetween(firstWord, lastWord) {
    if (!firstWord || !lastWord) return '';
    const range = document.createRange();
    range.setStartBefore(firstWord);
    range.setEndAfter(lastWord);
    return normalizeVideoCaptionText(range.toString());
  }

  function getSmartVideoSubtitlePhrase(wordEl) {
    const container = wordEl?.closest?.('.ib-video-subtitle-source, .ib-video-subtitle-translation');
    const words = container ? [...container.querySelectorAll('.ib-video-subtitle-word-hover')] : [];
    const index = words.indexOf(wordEl);
    if (index < 0) return { text: '', elements: [] };

    const tokens = words.map((item) => normalizeVideoSubtitleWord(item.dataset.hoverWord || item.textContent));
    const canIncludeLeft = (position) => position > 0 && !hasVideoSubtitlePhraseBoundary(words[position - 1], words[position]);
    const canIncludeRight = (position) => position < words.length - 1 && !hasVideoSubtitlePhraseBoundary(words[position], words[position + 1]);
    let start = index;
    let end = index;

    if (canIncludeLeft(start) && VIDEO_SUBTITLE_PHRASE_LINKERS.has(tokens[start - 1])) start -= 1;
    if (canIncludeRight(end) && VIDEO_SUBTITLE_PHRASE_LINKERS.has(tokens[end + 1])) end += 1;

    if (VIDEO_SUBTITLE_PHRASE_LINKERS.has(tokens[index]) || VIDEO_SUBTITLE_PHRASE_PARTICLES.has(tokens[index])) {
      if (canIncludeRight(end) && end - start + 1 < 5) end += 1;
      else if (canIncludeLeft(start) && end - start + 1 < 5) start -= 1;
    }

    if (canIncludeRight(end) && VIDEO_SUBTITLE_PHRASE_PARTICLES.has(tokens[end + 1]) && end - start + 1 < 5) {
      end += 1;
    }
    if (
      start === index
      && VIDEO_SUBTITLE_PHRASE_PARTICLES.has(tokens[index])
      && canIncludeLeft(start)
      && end - start + 1 < 5
    ) {
      start -= 1;
    }

    const rightToken = tokens[end + 1];
    if (canIncludeRight(end) && ['a', 'an', 'the'].includes(rightToken) && end - start + 1 < 4) {
      end += 1;
      if (canIncludeRight(end) && end - start + 1 < 5) end += 1;
    }

    const leftToken = tokens[start - 1];
    if (canIncludeLeft(start) && ['a', 'an', 'the'].includes(leftToken) && end - start + 1 < 4) {
      start -= 1;
      if (canIncludeLeft(start) && end - start + 1 < 5) start -= 1;
    }

    if (start === end) {
      if (canIncludeRight(end)) end += 1;
      else if (canIncludeLeft(start)) start -= 1;
    }

    const elements = words.slice(start, end + 1);
    return {
      text: getVideoSubtitleTextBetween(elements[0], elements.at(-1)),
      elements
    };
  }

  function getVideoSubtitleDirectionLanguages(direction) {
    const targetLanguageCode = LANGUAGE_CATALOG?.codeFor(
      settings.videoSubtitleTargetLanguage || 'Vietnamese',
      'vi'
    ) || 'vi';
    const configuredSourceCode = String(settings.videoSubtitleSourceLanguage || 'auto');
    const activeSourceCode = configuredSourceCode.toLowerCase() === 'auto'
      ? (videoCaptionActiveSourceLanguageCode || 'auto')
      : configuredSourceCode;
    const isSourceText = direction === 'source';
    return {
      sourceCode: isSourceText ? activeSourceCode : targetLanguageCode,
      targetCode: isSourceText ? targetLanguageCode : activeSourceCode
    };
  }

  function positionVideoSubtitleWordTooltip(overlay, tooltip, rect) {
    const overlayRect = overlay.getBoundingClientRect();
    tooltip.style.left = `${Math.max(18, Math.min(overlayRect.width - 18, rect.left - overlayRect.left + rect.width / 2))}px`;
    tooltip.style.top = `${rect.top - overlayRect.top - 8}px`;
    tooltip.hidden = false;
  }

  function renderVideoSubtitleWordTooltip(tooltip, sourceText, resultText, mode = 'word') {
    tooltip.dataset.mode = mode;
    tooltip.replaceChildren();
    const source = document.createElement('div');
    source.className = 'ib-video-subtitle-tooltip-source';
    source.textContent = sourceText;
    const result = document.createElement('div');
    result.className = 'ib-video-subtitle-tooltip-result';
    result.textContent = resultText;
    tooltip.append(source, result);
  }

  async function requestVideoSubtitleTermTranslation({ text, context, direction, mode }) {
    const { sourceCode, targetCode } = getVideoSubtitleDirectionLanguages(direction);
    if (!targetCode || targetCode === 'auto') {
      return { result: '', error: 'Chưa xác định ngôn ngữ gốc' };
    }

    const normalizedText = normalizeVideoCaptionText(text).slice(0, 240);
    const normalizedContext = normalizeVideoCaptionText(context).slice(0, 800);
    const key = `${sourceCode}|${targetCode}|${mode}|${normalizedContext.toLocaleLowerCase()}|${normalizedText.toLocaleLowerCase()}`;
    const cached = videoSubtitleWordCache.get(key);
    if (cached) return { result: cached, error: '' };

    const response = await sendMessage({
      type: 'IB_TRANSLATE_SUBTITLE_WORD',
      text: normalizedText,
      context: normalizedContext,
      mode,
      sourceLanguage: sourceCode,
      targetLanguage: targetCode,
      origin: getPageOrigin()
    });
    const result = normalizeVideoCaptionText(response?.data?.result || '');
    if (response?.ok && result) {
      videoSubtitleWordCache.set(key, result);
      if (videoSubtitleWordCache.size > 300) {
        videoSubtitleWordCache.delete(videoSubtitleWordCache.keys().next().value);
      }
      return { result, error: '' };
    }
    return { result: '', error: 'Không dịch được' };
  }

  function getVideoSubtitleSelectionPayload(overlay) {
    const selection = window.getSelection?.();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    const sourceEl = overlay.querySelector('.ib-video-subtitle-source');
    const translationEl = overlay.querySelector('.ib-video-subtitle-translation');
    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    const container = sourceEl?.contains(anchorNode) && sourceEl?.contains(focusNode)
      ? sourceEl
      : translationEl?.contains(anchorNode) && translationEl?.contains(focusNode)
        ? translationEl
        : null;
    if (!container) return null;

    const text = normalizeVideoCaptionText(selection.toString()).slice(0, 240);
    if (!text || text.length < 2) return null;
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) return null;
    return {
      text,
      context: normalizeVideoCaptionText(container.textContent),
      direction: container.classList.contains('ib-video-subtitle-source') ? 'source' : 'translation',
      rect
    };
  }

  function startVideoSubtitleWordHover(overlay, wordEl, usePhrase) {
    hideVideoSubtitleWordTooltip(overlay, { force: true });
    videoSubtitleWordHoverEl = wordEl;
    videoSubtitleWordHoverUsesPhrase = usePhrase;

    const phrase = usePhrase
      ? getSmartVideoSubtitlePhrase(wordEl)
      : { text: normalizeVideoCaptionText(wordEl.dataset.hoverWord || wordEl.textContent), elements: [wordEl] };
    const text = phrase.text;
    if (!text) return;

    videoSubtitleWordHoverEls = phrase.elements;
    for (const element of videoSubtitleWordHoverEls) {
      element.classList.add(usePhrase ? 'is-phrase-hovered' : 'is-hovered');
    }

    const first = phrase.elements[0] || wordEl;
    const last = phrase.elements.at(-1) || wordEl;
    const range = document.createRange();
    range.setStartBefore(first);
    range.setEndAfter(last);
    const rect = range.getBoundingClientRect();
    const direction = wordEl.dataset.hoverDirection || 'source';
    const contextContainer = wordEl.closest('.ib-video-subtitle-source, .ib-video-subtitle-translation');
    const context = normalizeVideoCaptionText(contextContainer?.textContent || '');
    const mode = usePhrase ? 'phrase' : 'word';
    const seq = ++videoSubtitleWordHoverSeq;

    videoSubtitleWordHoverTimer = window.setTimeout(async () => {
      if (wordEl !== videoSubtitleWordHoverEl || seq !== videoSubtitleWordHoverSeq) return;
      const tooltip = overlay.querySelector('.ib-video-subtitle-word-tooltip');
      if (!tooltip) return;
      positionVideoSubtitleWordTooltip(overlay, tooltip, rect);
      renderVideoSubtitleWordTooltip(tooltip, text, 'Đang dịch…', mode);

      const translated = await requestVideoSubtitleTermTranslation({ text, context, direction, mode });
      if (wordEl !== videoSubtitleWordHoverEl || seq !== videoSubtitleWordHoverSeq) return;
      renderVideoSubtitleWordTooltip(tooltip, text, translated.result || translated.error, mode);
    }, usePhrase ? 100 : 120);
  }

  function releaseVideoSubtitleHoverPause() {
    clearTimeout(videoSubtitleHoverResumeTimer);
    videoSubtitleHoverResumeTimer = null;

    const state = videoSubtitleHoverPauseState;
    videoSubtitleHoverPauseState = null;
    if (!state) return;

    if (state.onPlay) state.video.removeEventListener('play', state.onPlay);
    if (state.shouldResume && state.video.isConnected && state.video.paused && !state.video.ended) {
      void state.video.play().catch(() => {});
    }
  }

  function pauseVideoForSubtitleHover() {
    clearTimeout(videoSubtitleHoverResumeTimer);
    videoSubtitleHoverResumeTimer = null;

    // A subtitle appearing under a stationary cursor used to pause the video and
    // cancel the current dubbed sentence. Keep hover translation interactive,
    // but leave playback alone while dubbing is enabled.
    if (isVideoDubbingSessionRequested()) return;

    const video = getPrimaryVideo();
    if (!video || video.ended) return;
    if (videoSubtitleHoverPauseState?.video === video) return;
    if (videoSubtitleHoverPauseState) releaseVideoSubtitleHoverPause();

    const state = {
      video,
      shouldResume: !video.paused,
      onPlay: null
    };
    state.onPlay = () => {
      if (videoSubtitleHoverPauseState === state) state.shouldResume = false;
    };
    video.addEventListener('play', state.onPlay, { once: true });
    videoSubtitleHoverPauseState = state;
    if (state.shouldResume) video.pause();
  }

  function scheduleVideoSubtitleHoverResume() {
    clearTimeout(videoSubtitleHoverResumeTimer);
    videoSubtitleHoverResumeTimer = window.setTimeout(() => {
      videoSubtitleHoverResumeTimer = null;
      releaseVideoSubtitleHoverPause();
    }, 90);
  }

  function bindVideoSubtitleWordHover(overlay) {
    if (!overlay || overlay.dataset.wordHoverBound === 'true') return;
    overlay.dataset.wordHoverBound = 'true';

    for (const container of overlay.querySelectorAll('.ib-video-subtitle-source, .ib-video-subtitle-translation')) {
      container.addEventListener('pointerenter', pauseVideoForSubtitleHover);
      container.addEventListener('pointerleave', scheduleVideoSubtitleHoverResume);
      container.addEventListener('pointercancel', scheduleVideoSubtitleHoverResume);
    }

    overlay.addEventListener('pointermove', (event) => {
      if (videoSubtitleSelectionActive) return;
      const wordEl = event.target?.closest?.('.ib-video-subtitle-word-hover') || null;
      const usePhrase = Boolean(event.shiftKey);
      if (wordEl === videoSubtitleWordHoverEl && usePhrase === videoSubtitleWordHoverUsesPhrase) return;
      if (!wordEl) {
        hideVideoSubtitleWordTooltip(overlay);
        return;
      }
      startVideoSubtitleWordHover(overlay, wordEl, usePhrase);
    });

    overlay.addEventListener('pointerdown', (event) => {
      if (!event.target?.closest?.('.ib-video-subtitle-source, .ib-video-subtitle-translation')) return;
      hideVideoSubtitleWordTooltip(overlay, { force: true });
    });

    overlay.addEventListener('pointerup', () => {
      window.setTimeout(async () => {
        const payload = getVideoSubtitleSelectionPayload(overlay);
        if (!payload) return;
        hideVideoSubtitleWordTooltip(overlay, { force: true });
        videoSubtitleSelectionActive = true;
        const seq = ++videoSubtitleWordHoverSeq;
        const tooltip = overlay.querySelector('.ib-video-subtitle-word-tooltip');
        if (!tooltip) return;
        positionVideoSubtitleWordTooltip(overlay, tooltip, payload.rect);
        renderVideoSubtitleWordTooltip(tooltip, payload.text, 'Đang dịch…', 'selection');
        const translated = await requestVideoSubtitleTermTranslation({ ...payload, mode: 'selection' });
        if (!videoSubtitleSelectionActive || seq !== videoSubtitleWordHoverSeq) return;
        renderVideoSubtitleWordTooltip(tooltip, payload.text, translated.result || translated.error, 'selection');
      }, 0);
    });

    const refreshShiftMode = (event) => {
      if (event.key !== 'Shift' || event.repeat || videoSubtitleSelectionActive) return;
      const wordEl = videoSubtitleWordHoverEl;
      if (!wordEl?.isConnected) return;
      startVideoSubtitleWordHover(overlay, wordEl, event.type === 'keydown');
    };
    window.addEventListener('keydown', refreshShiftMode, true);
    window.addEventListener('keyup', refreshShiftMode, true);

    document.addEventListener('selectionchange', () => {
      if (!videoSubtitleSelectionActive) return;
      const selection = window.getSelection?.();
      if (!selection || selection.isCollapsed || !getVideoSubtitleSelectionPayload(overlay)) {
        hideVideoSubtitleWordTooltip(overlay, { force: true });
      }
    });

    overlay.addEventListener('pointerleave', () => hideVideoSubtitleWordTooltip(overlay));
    overlay.addEventListener('pointercancel', () => hideVideoSubtitleWordTooltip(overlay));
  }

  function renderVideoSubtitleKaraokeText(container, value, sameCue = false) {
    if (!container || container.dataset.karaokeText === value) return;

    const previousValue = container.dataset.karaokeText || "";
    const previousActiveIndex = videoSubtitleKaraokeActiveIndex;
    const growingCaption = Boolean(previousValue && value.startsWith(previousValue));
    container.dataset.karaokeText = value;
    container.replaceChildren();
    let wordIndex = 0;
    for (const segment of segmentVideoSubtitleText(value)) {
      if (!segment.isWord) {
        container.appendChild(document.createTextNode(segment.text));
        continue;
      }

      const word = document.createElement("span");
      word.className = "ib-video-subtitle-word ib-video-subtitle-word-hover";
      word.dataset.hoverDirection = "translation";
      word.dataset.hoverWord = segment.text;
      word.dataset.wordIndex = String(wordIndex++);
      word.textContent = segment.text;
      container.appendChild(word);
    }

    container.dataset.wordCount = String(wordIndex);
    videoSubtitleKaraokeActiveIndex = (sameCue || growingCaption) && previousActiveIndex >= 0
      ? Math.min(previousActiveIndex, wordIndex - 1)
      : -1;
  }

  function segmentVideoSubtitleText(value) {
    const text = String(value || "");
    if (!text) return [];

    try {
      const locale = LANGUAGE_CATALOG?.codeFor(
        settings.videoSubtitleTargetLanguage || "Vietnamese",
        "en"
      ) || "en";
      const segmenter = new Intl.Segmenter(locale, { granularity: "word" });
      return [...segmenter.segment(text)].map((segment) => ({
        text: segment.segment,
        isWord: Boolean(segment.isWordLike)
      }));
    } catch {
      return (text.match(/[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*|\s+|./gu) || [])
        .map((segment) => ({
          text: segment,
          isWord: /[\p{L}\p{N}]/u.test(segment)
        }));
    }
  }

  function getVideoSubtitleWords(value) {
    return segmentVideoSubtitleText(value)
      .filter((segment) => segment.isWord)
      .map((segment) => normalizeVideoSubtitleWord(segment.text))
      .filter(Boolean);
  }

  function normalizeVideoSubtitleWord(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, "")
      .trim();
  }

  function findVideoSubtitleCandidateWordIndex(displayText, candidateText) {
    const displayed = getVideoSubtitleWords(displayText);
    const candidate = getVideoSubtitleWords(candidateText);
    if (!displayed.length || !candidate.length) return -1;

    const comparableLength = Math.min(displayed.length, candidate.length);
    let prefixLength = 0;
    while (
      prefixLength < comparableLength
      && displayed[prefixLength] === candidate[prefixLength]
    ) {
      prefixLength += 1;
    }

    const requiredPrefix = comparableLength <= 2 ? 1 : 2;
    if (prefixLength >= requiredPrefix) {
      return Math.min(displayed.length - 1, candidate.length - 1);
    }

    let bestLength = 0;
    let bestDisplayEnd = -1;
    for (let displayStart = 0; displayStart < displayed.length; displayStart += 1) {
      for (let candidateStart = 0; candidateStart < candidate.length; candidateStart += 1) {
        let length = 0;
        while (
          displayStart + length < displayed.length
          && candidateStart + length < candidate.length
          && displayed[displayStart + length] === candidate[candidateStart + length]
        ) {
          length += 1;
        }
        if (length > bestLength) {
          bestLength = length;
          bestDisplayEnd = displayStart + length - 1;
        }
      }
    }

    return bestLength >= 3 ? bestDisplayEnd : -1;
  }

  function teardownVideoSubtitleAudioVad() {
    try { videoSubtitleVadSource?.disconnect(); } catch {}
    try { videoSubtitleVadHighpass?.disconnect(); } catch {}
    try { videoSubtitleVadLowpass?.disconnect(); } catch {}
    try { videoSubtitleVadAnalyser?.disconnect(); } catch {}
    try { videoSubtitleVadStream?.getTracks?.().forEach((track) => track.stop()); } catch {}
    try { videoSubtitleVadAudioContext?.close?.(); } catch {}

    videoSubtitleVadAudioContext = null;
    videoSubtitleVadStream = null;
    videoSubtitleVadSource = null;
    videoSubtitleVadHighpass = null;
    videoSubtitleVadLowpass = null;
    videoSubtitleVadAnalyser = null;
    videoSubtitleVadBuffer = null;
    videoSubtitleVadVideo = null;
    videoSubtitleVadAvailable = false;
    videoSubtitleVadSpeaking = true;
    videoSubtitleVadNoiseFloor = 0.012;
    videoSubtitleVadPeak = 0.06;
    videoSubtitleVadRms = 0;
    videoSubtitleVadThreshold = 0.025;
    videoSubtitleVadSilenceSince = 0;
    videoSubtitleVadLastSampleAt = 0;
    videoSubtitleSpeechClockMs = 0;
    videoSubtitleSpeechClockLastAt = 0;
  }

  function ensureVideoSubtitleAudioVad(video, now = performance.now()) {
    if (!video) return false;
    if (videoSubtitleVadVideo === video && videoSubtitleVadAnalyser) return true;
    if (now < videoSubtitleVadRetryAfter) return false;

    teardownVideoSubtitleAudioVad();
    try {
      const capture = video.captureStream || video.mozCaptureStream;
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (typeof capture !== "function" || typeof AudioContextCtor !== "function") {
        videoSubtitleVadRetryAfter = now + 10000;
        return false;
      }

      const stream = capture.call(video);
      if (!stream?.getAudioTracks?.().length) {
        stream?.getTracks?.().forEach((track) => track.stop());
        videoSubtitleVadRetryAfter = now + 5000;
        return false;
      }

      const context = new AudioContextCtor({ latencyHint: "interactive" });
      const source = context.createMediaStreamSource(stream);
      const highpass = context.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 110;
      const lowpass = context.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 4200;
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.18;
      source.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(analyser);

      videoSubtitleVadAudioContext = context;
      videoSubtitleVadStream = stream;
      videoSubtitleVadSource = source;
      videoSubtitleVadHighpass = highpass;
      videoSubtitleVadLowpass = lowpass;
      videoSubtitleVadAnalyser = analyser;
      videoSubtitleVadBuffer = new Float32Array(analyser.fftSize);
      videoSubtitleVadVideo = video;
      videoSubtitleVadRetryAfter = 0;
      void context.resume?.().catch(() => {});
      return true;
    } catch {
      teardownVideoSubtitleAudioVad();
      videoSubtitleVadRetryAfter = now + 5000;
      return false;
    }
  }

  function sampleVideoSubtitleSpeechActivity(video, now = performance.now()) {
    const elapsed = videoSubtitleSpeechClockLastAt
      ? Math.max(0, Math.min(250, now - videoSubtitleSpeechClockLastAt))
      : 0;
    videoSubtitleSpeechClockLastAt = now;

    const canAnalyze = ensureVideoSubtitleAudioVad(video, now)
      && videoSubtitleVadAudioContext?.state !== "suspended"
      && videoSubtitleVadAnalyser
      && videoSubtitleVadBuffer
      && !video.muted
      && Number(video.volume || 0) > 0;

    if (videoSubtitleVadAudioContext?.state === "suspended") {
      void videoSubtitleVadAudioContext.resume?.().catch(() => {});
    }

    if (canAnalyze && now - videoSubtitleVadLastSampleAt >= 28) {
      videoSubtitleVadLastSampleAt = now;
      videoSubtitleVadAnalyser.getFloatTimeDomainData(videoSubtitleVadBuffer);
      let sumSquares = 0;
      for (const sample of videoSubtitleVadBuffer) sumSquares += sample * sample;
      const rms = Math.sqrt(sumSquares / Math.max(1, videoSubtitleVadBuffer.length));
      videoSubtitleVadRms = rms;

      if (rms >= VIDEO_SUBTITLE_VAD_MIN_ENERGY) videoSubtitleVadAvailable = true;
      videoSubtitleVadPeak = Math.max(rms, videoSubtitleVadPeak * 0.992);
      if (rms <= videoSubtitleVadNoiseFloor * 1.35) {
        videoSubtitleVadNoiseFloor = (videoSubtitleVadNoiseFloor * 0.86) + (rms * 0.14);
      } else {
        videoSubtitleVadNoiseFloor = Math.min(
          videoSubtitleVadNoiseFloor + 0.000025,
          Math.max(0.014, videoSubtitleVadPeak * 0.48)
        );
      }

      videoSubtitleVadThreshold = videoSubtitleVadNoiseFloor
        + Math.max(0.007, (videoSubtitleVadPeak - videoSubtitleVadNoiseFloor) * 0.24);
      const hasVoiceEnergy = rms >= videoSubtitleVadThreshold;
      if (hasVoiceEnergy) {
        videoSubtitleVadSpeaking = true;
        videoSubtitleVadSilenceSince = 0;
      } else if (!videoSubtitleVadSilenceSince) {
        videoSubtitleVadSilenceSince = now;
      } else if (now - videoSubtitleVadSilenceSince >= VIDEO_SUBTITLE_VAD_SILENCE_HOLD_MS) {
        videoSubtitleVadSpeaking = false;
      }
    }

    const shouldAdvanceClock = !video.paused
      && (!videoSubtitleVadAvailable || !canAnalyze || videoSubtitleVadSpeaking);
    if (shouldAdvanceClock) {
      videoSubtitleSpeechClockMs += elapsed * Math.max(0.25, Number(video.playbackRate || 1));
    }

    return {
      available: Boolean(videoSubtitleVadAvailable && canAnalyze),
      speaking: Boolean(videoSubtitleVadSpeaking),
      rms: videoSubtitleVadRms,
      threshold: videoSubtitleVadThreshold,
      clock: videoSubtitleSpeechClockMs
    };
  }

  function getCueSegmentWordTimes(cue) {
    if (!cue || !Array.isArray(cue.segments) || cue.segments.length < 1) return [];
    const timed = cue.segments
      .map((segment, index) => ({
        index,
        text: String(segment?.text || ""),
        start: Number(cue.start || 0) + Math.max(0, Number(segment?.offset || 0))
      }))
      .filter((segment) => getVideoSubtitleWords(segment.text).length > 0)
      .sort((left, right) => left.start - right.start || left.index - right.index);
    if (!timed.length || !timed.some((segment) => segment.start > Number(cue.start || 0) + 0.001)) {
      return [];
    }

    const times = [];
    for (let index = 0; index < timed.length; index += 1) {
      const segment = timed[index];
      const words = getVideoSubtitleWords(segment.text);
      const nextStart = index + 1 < timed.length
        ? timed[index + 1].start
        : Math.max(segment.start + 0.18, Number(cue.end || segment.start + 0.5));
      const availableSpan = Math.max(0.08, nextStart - segment.start);
      const naturalSpeechSpan = Math.max(0.12, words.length * 0.27);
      const speechSpan = Math.min(availableSpan, naturalSpeechSpan);
      for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
        times.push(segment.start + (speechSpan * wordIndex) / Math.max(1, words.length));
      }
    }
    return times;
  }

  function projectCueWordTimes(sourceTimes, targetWordCount) {
    if (!Array.isArray(sourceTimes) || !sourceTimes.length || targetWordCount < 1) return null;
    if (sourceTimes.length === 1) return Array(targetWordCount).fill(sourceTimes[0]);
    if (targetWordCount === 1) return [sourceTimes[0]];

    const projected = [];
    for (let index = 0; index < targetWordCount; index += 1) {
      const position = (index / (targetWordCount - 1)) * (sourceTimes.length - 1);
      const leftIndex = Math.floor(position);
      const rightIndex = Math.min(sourceTimes.length - 1, Math.ceil(position));
      const fraction = position - leftIndex;
      projected.push(
        sourceTimes[leftIndex]
        + (sourceTimes[rightIndex] - sourceTimes[leftIndex]) * fraction
      );
    }
    return projected;
  }

  function getVideoSubtitlePauseAfterWord(displayText, wordIndex) {
    if (wordIndex < 0) return 0;

    let currentWordIndex = -1;
    let trailingText = "";
    for (const segment of segmentVideoSubtitleText(displayText)) {
      if (segment.isWord) {
        currentWordIndex += 1;
        if (currentWordIndex > wordIndex) break;
        continue;
      }
      if (currentWordIndex === wordIndex) trailingText += segment.text;
    }

    if (/\.{3}|…/u.test(trailingText)) return 520;
    if (/[.!?。！？]/u.test(trailingText)) return 360;
    if (/[;:；：]/u.test(trailingText)) return 220;
    if (/[,，]/u.test(trailingText)) return 140;
    if (/[—–-]/u.test(trailingText)) return 170;
    return 0;
  }

  function resolveLiveVideoSubtitleKaraokeIndex(targetIndex, displayText, candidateText, wordCount) {
    const now = performance.now();
    const speechNow = videoSubtitleSpeechClockMs;
    const candidateWords = getVideoSubtitleWords(candidateText);

    // Cue identity owns resets. Text may be retranslated inside the same cue.
    videoSubtitleLiveKaraokeDisplayText = displayText;

    if (candidateText && candidateText !== videoSubtitleLiveKaraokeCandidate) {
      const nextWordCount = candidateWords.length;
      const addedWords = nextWordCount - videoSubtitleLiveKaraokeCandidateWordCount;
      const elapsed = now - videoSubtitleLiveKaraokeLastArrivalAt;

      if (addedWords > 0 && elapsed >= 55 && elapsed <= 2200) {
        const sample = Math.max(150, Math.min(520, elapsed / addedWords));
        videoSubtitleLiveKaraokeMsPerWord = (videoSubtitleLiveKaraokeMsPerWord * 0.78) + (sample * 0.22);
      }

      videoSubtitleLiveKaraokeCandidate = candidateText;
      videoSubtitleLiveKaraokeCandidateWordCount = nextWordCount;
      videoSubtitleLiveKaraokeLastArrivalAt = now;
    }

    videoSubtitleLiveKaraokeTargetIndex = Math.max(
      videoSubtitleLiveKaraokeTargetIndex,
      Math.min(wordCount - 1, targetIndex)
    );

    const cueSpeechStartedAt = Number(videoPlayerCaptionCandidateSpeechClockStartedAt || 0);
    const baseWordMs = Math.max(145, Math.min(540, videoSubtitleLiveKaraokeMsPerWord));
    const syncLeadMs = Math.max(
      280,
      Math.min(620, baseWordMs * VIDEO_SUBTITLE_LIVE_SYNC_LEAD_WORDS)
    );
    let remainingSpeechMs = Math.max(
      0,
      speechNow - cueSpeechStartedAt + syncLeadMs
    );
    let estimatedIndex = 0;
    const maxIndex = Math.max(0, videoSubtitleLiveKaraokeTargetIndex);

    while (estimatedIndex < maxIndex) {
      const stepMs = baseWordMs + getVideoSubtitlePauseAfterWord(displayText, estimatedIndex);
      if (remainingSpeechMs < stepMs) break;
      remainingSpeechMs -= stepMs;
      estimatedIndex += 1;
    }

    videoSubtitleKaraokeActiveIndex = videoSubtitleKaraokeActiveIndex < 0
      ? estimatedIndex
      : Math.max(videoSubtitleKaraokeActiveIndex, estimatedIndex);
    videoSubtitleLiveKaraokeNextStepAt = speechNow + Math.max(0, baseWordMs - remainingSpeechMs);

    // The cue speech clock starts before translation rendering. This lets a
    // late translation enter at the word currently being spoken instead of
    // replaying the sentence from its first word and staying behind.
    return Math.min(wordCount - 1, videoSubtitleKaraokeActiveIndex);
  }

  function cleanString(str) {
    return String(str || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  }

  function calculateKaraokeIndexForCue(cue, video, words, displayText, fallbackTimingCue = null) {
    if (!cue || !video || words.length < 1) return -1;

    const currentTime = Number(video.currentTime || 0);
    const adjustedTime = currentTime + VIDEO_SUBTITLE_SYNC_OFFSET;

    // 1. Use real YouTube segment offsets whenever they are available.
    // If the rendered text is translated, project the source speech pauses
    // onto the translated word count instead of flattening the whole cue.
    let wordTimes = null;
    const cueSegmentTimes = getCueSegmentWordTimes(cue);
    const cueSegmentText = Array.isArray(cue.segments)
      ? cue.segments.map((segment) => segment?.text || "").join("")
      : "";
    if (
      cueSegmentTimes.length
      && cleanString(cueSegmentText) === cleanString(displayText)
    ) {
      wordTimes = projectCueWordTimes(cueSegmentTimes, words.length);
    }

    if (!wordTimes && fallbackTimingCue) {
      const sourceSegmentTimes = getCueSegmentWordTimes(fallbackTimingCue);
      if (sourceSegmentTimes.length) {
        wordTimes = projectCueWordTimes(sourceSegmentTimes, words.length);
      }
    }

    // 2. If no segment timing is available, fall back to weighted interpolation
    if (!wordTimes) {
      const weights = words.map((word) => {
        const text = word.textContent || "";
        let weight = text.length;
        const nextNode = word.nextSibling;
        if (nextNode && nextNode.nodeType === 3 /* Node.TEXT_NODE */) {
          const nextText = nextNode.textContent || "";
          const trimmed = nextText.trim();
          if (trimmed) {
            const firstChar = trimmed[0];
            if (/[.!?]/.test(firstChar)) {
              weight += 4;
            } else if (/,;:-/.test(firstChar)) {
              weight += 2;
            }
          }
        }
        return Math.max(1, weight);
      });

      const totalWeight = weights.reduce((a, b) => a + b, 0);
      if (totalWeight > 0) {
        const duration = cue.end - cue.start;
        const interpolatedTimes = [];
        let accum = 0;
        for (let i = 0; i < words.length; i++) {
          interpolatedTimes.push(cue.start + (accum / totalWeight) * duration);
          accum += weights[i];
        }
        wordTimes = interpolatedTimes;
      }
    }

    if (wordTimes && wordTimes.length === words.length) {
      let detectedIndex = -1;
      for (let i = 0; i < words.length; i++) {
        if (adjustedTime >= wordTimes[i]) {
          detectedIndex = i;
        }
      }
      
      let finalIndex = detectedIndex;
      if (videoSubtitleKaraokeActiveIndex >= 0) {
        finalIndex = Math.max(videoSubtitleKaraokeActiveIndex, detectedIndex);
      }
      return Math.min(words.length - 1, finalIndex);
    }

    // Final fallback
    const duration = Math.max(0.25, cue.end - cue.start);
    const progress = Math.max(0, Math.min(0.999, (adjustedTime - cue.start) / duration));
    const detectedIndex = Math.floor(progress * words.length);
    let finalIndex = detectedIndex;
    if (videoSubtitleKaraokeActiveIndex >= 0) {
      finalIndex = Math.max(videoSubtitleKaraokeActiveIndex, detectedIndex);
    }
    return Math.min(words.length - 1, finalIndex);
  }

  function resolveVideoSubtitleKaraokeIndex(displayText, wordCount, translationEl) {
    if (!displayText || wordCount < 1) return -1;
    const video = getPrimaryVideo();
    if (!video) return -1;

    const cueStart = Number(translationEl?.dataset.karaokeStart);
    const cueEnd = Number(translationEl?.dataset.karaokeEnd);
    if (
      translationEl?.dataset.karaokeMode === "timeline"
      && Number.isFinite(cueStart)
      && Number.isFinite(cueEnd)
      && cueEnd > cueStart
    ) {
      if (video.paused) return videoSubtitleKaraokeActiveIndex;
      const timeline = videoCaptionTranslatedTimeline.length
        ? videoCaptionTranslatedTimeline
        : videoCaptionTimeline;
      const cue = timeline.find((c) => Math.abs(c.start - cueStart) < 0.01) || {
        start: cueStart,
        end: cueEnd,
        segments: []
      };
      const sourceCue = videoCaptionTimeline.find((item) => Math.abs(item.start - cueStart) < 0.08)
        || videoCaptionTimeline[findTimelineCueIndex(Number(video.currentTime || 0), videoCaptionTimeline)]
        || null;
      const words = [...translationEl.querySelectorAll(".ib-video-subtitle-word")];
      return calculateKaraokeIndexForCue(cue, video, words, displayText, sourceCue);
    }

    const candidate = videoPlayerCaptionCandidateText || readYouTubeCaptionCandidate();
    const matchedCandidateIndex = findVideoSubtitleCandidateWordIndex(displayText, candidate);
    const candidateIndex = matchedCandidateIndex >= 0
      ? matchedCandidateIndex
      : translationEl?.dataset.karaokeMode === "live" && candidate
        ? wordCount - 1
        : -1;
    if (candidateIndex >= 0) {
      return resolveLiveVideoSubtitleKaraokeIndex(
        candidateIndex,
        displayText,
        candidate,
        wordCount
      );
    }

    if (videoCaptionUsesPlayerTrack) {
      return video.paused ? videoSubtitleKaraokeActiveIndex : -1;
    }

    const currentTime = Number(video.currentTime || 0);
    const timeline = videoCaptionTranslatedTimeline.length
      ? videoCaptionTranslatedTimeline
      : videoCaptionTimeline;
    const cueIndex = timeline.length ? findTimelineCueIndex(currentTime, timeline) : -1;
    if (cueIndex >= 0) {
      if (video.paused) return videoSubtitleKaraokeActiveIndex;
      const cue = timeline[cueIndex];
      const sourceIndex = videoCaptionTimeline.length
        ? findTimelineCueIndex(currentTime, videoCaptionTimeline)
        : -1;
      const sourceCue = sourceIndex >= 0 ? videoCaptionTimeline[sourceIndex] : null;
      const words = [...translationEl.querySelectorAll(".ib-video-subtitle-word")];
      return calculateKaraokeIndexForCue(cue, video, words, displayText, sourceCue);
    }

    if (video.paused) return videoSubtitleKaraokeActiveIndex;
    return -1;
  }

  function updateVideoSubtitleKaraoke() {
    const overlay = videoSubtitleEl;
    const translationEl = overlay?.querySelector(".ib-video-subtitle-translation");
    if (!overlay || !translationEl || overlay.style.display !== "flex") return;

    const video = getPrimaryVideo();
    if (video) {
      if (translationEl.dataset.karaokeMode === "live") {
        const vadState = sampleVideoSubtitleSpeechActivity(video);
        translationEl.dataset.vadAvailable = String(Boolean(vadState.available));
        translationEl.dataset.vadSpeaking = String(Boolean(vadState.speaking));
        translationEl.dataset.vadRms = vadState.rms.toFixed(4);
        translationEl.dataset.vadThreshold = vadState.threshold.toFixed(4);
        translationEl.dataset.speechClock = Math.round(vadState.clock).toString();
      } else {
        if (videoSubtitleVadAnalyser) teardownVideoSubtitleAudioVad();
        delete translationEl.dataset.vadAvailable;
        delete translationEl.dataset.vadSpeaking;
        delete translationEl.dataset.vadRms;
        delete translationEl.dataset.vadThreshold;
        delete translationEl.dataset.speechClock;
      }
      const currentTime = Number(video.currentTime || 0);
      if (currentTime < videoSubtitleLastCurrentTime - 0.1) {
        videoSubtitleKaraokeActiveIndex = -1;
      }
      videoSubtitleLastCurrentTime = currentTime;
    }

    const words = [...translationEl.querySelectorAll(".ib-video-subtitle-word")];
    const displayText = translationEl.dataset.karaokeText || translationEl.textContent || "";
    const previousActiveIndex = videoSubtitleKaraokeActiveIndex;
    const resolvedIndex = resolveVideoSubtitleKaraokeIndex(displayText, words.length, translationEl);
    const activeIndex = previousActiveIndex >= 0 && resolvedIndex >= 0
      ? Math.max(previousActiveIndex, resolvedIndex)
      : resolvedIndex;
    if (
      activeIndex === previousActiveIndex
      && Number(translationEl.dataset.activeWordIndex ?? -1) === activeIndex
    ) {
      return;
    }

    if (activeIndex < previousActiveIndex && previousActiveIndex >= 0 && activeIndex >= 0) {
      console.warn(`[InputBridge] Index decreased from ${previousActiveIndex} to ${activeIndex}. CueId: ${currentVideoSubtitleCueId}`);
    }

    videoSubtitleKaraokeActiveIndex = activeIndex;
    translationEl.dataset.activeWordIndex = String(activeIndex);
    words.forEach((word, index) => {
      word.classList.toggle("is-active", index === activeIndex);
      word.classList.toggle("is-spoken", activeIndex >= 0 && index < activeIndex);
    });
  }

  function isExtensionOrphaned() {
    try {
      return !chrome.runtime?.id;
    } catch {
      return true;
    }
  }

  function checkAndTeardownIfOrphaned() {
    if (extensionTornDown) return true;
    if (isExtensionOrphaned()) {
      teardownExtension();
      return true;
    }
    return false;
  }

  function teardownExtension() {
    if (extensionTornDown) return;
    extensionTornDown = true;
    videoDubbingResumeAfterSeekVideo = null;
    console.log("[InputBridge] Orphaned extension script detected. Tearing down...");

    const orphanedSessionVideo = videoDubbingSessionVideo;
    const shouldResumeOrphanedVideo = Boolean(
      orphanedSessionVideo
      && orphanedSessionVideo.paused
      && videoDubbingSessionWasPlaying
    );
    // Invalidate every async prepare/refill continuation without calling the
    // normal session stop path, which would try to rebuild UI during teardown.
    videoDubbingSessionId += 1;
    resetVideoDubbingBackgroundBuffer();
    videoDubbingSessionVideo = null;
    videoDubbingSessionWasPlaying = false;
    videoDubbingSessionStartIndex = -1;
    videoDubbingSessionState = "idle";
    videoDubbingSessionStatus = "";
    videoDubbingConsumedCueKeys.clear();
    cancelYouTubeCaptionTimelineRequest();
    stopVideoSubtitleKaraokeLoop();
    resetVideoDubbingLiveState();
    stopVideoDubbing(true);
    setNativeVideoCaptionsHidden(false);
    if (youtubeVideoControlSyncFrame) cancelAnimationFrame(youtubeVideoControlSyncFrame);
    if (youtubeNativeCaptionStateSyncFrame) cancelAnimationFrame(youtubeNativeCaptionStateSyncFrame);
    if (videoSubtitleTimer) clearTimeout(videoSubtitleTimer);
    if (videoSubtitleEmptyTimer) clearTimeout(videoSubtitleEmptyTimer);
    teardownVideoSubtitleAudioVad();
    
    videoSubtitleObserver?.disconnect();
    youtubeVideoControlObserver?.disconnect();
    youtubeNativeCaptionStateObserver?.disconnect();

    window.removeEventListener("scroll", onViewportScroll, true);
    window.removeEventListener("resize", repositionAll, true);
    window.removeEventListener("message", onVideoCaptionBridgeMessage);
    document.removeEventListener("pointerdown", onYouTubeControlDocumentPointerDown, true);
    document.removeEventListener("keydown", onYouTubeControlDocumentKeyDown, true);
    document.removeEventListener("loadedmetadata", onAnyVideoMetadataLoaded, true);
    document.removeEventListener("yt-navigate-start", onYouTubeVideoControlNavigation, true);
    document.removeEventListener("yt-navigate-finish", onYouTubeVideoControlNavigation, true);
    document.removeEventListener("yt-navigate-finish", onVideoSubtitleNavigation, true);
    document.removeEventListener("fullscreenchange", onVideoSubtitleFullscreen, true);
    window.removeEventListener("resize", onVideoSubtitleViewportChange, true);

    try {
      videoSubtitleEl?.remove();
      youtubeVideoDubbingButtonEl?.remove();
      youtubeVideoControlButtonEl?.remove();
      youtubeVideoControlPanelEl?.remove();
    } catch (e) {
      console.error("[InputBridge] Error cleaning up DOM elements:", e);
    }
    void resumeOriginalVideoAfterDubbingStop(orphanedSessionVideo, shouldResumeOrphanedVideo);
  }

  function startVideoSubtitleKaraokeLoop() {
    // The RAF id becomes stale as soon as its callback starts, so it cannot be
    // used as the running lock. Keep a separate lock for the entire RAF chain.
    if (videoSubtitleKaraokeLoopRunning) return;

    videoSubtitleKaraokeLoopRunning = true;
    window.__ibActiveLoopsCount = Number(window.__ibActiveLoopsCount || 0) + 1;

    const tick = (now) => {
      // This frame has fired. The running lock stays true until the whole chain stops.
      videoSubtitleKaraokeFrame = 0;
      if (!videoSubtitleKaraokeLoopRunning) return;

      if (checkAndTeardownIfOrphaned()) return;

      if (
        !settings.enabled
        || !settings.videoSubtitleEnabled
        || !videoSubtitleEl?.isConnected
        || videoSubtitleEl.style.display !== "flex"
      ) {
        stopVideoSubtitleKaraokeLoop();
        return;
      }

      if (now - videoSubtitleKaraokeLastTick >= VIDEO_SUBTITLE_KARAOKE_FRAME_MS) {
        videoSubtitleKaraokeLastTick = now;
        void processCurrentVideoCaption();
        updateVideoSubtitleKaraoke();
      }

      // update/process may synchronously hide the overlay and stop the loop.
      if (videoSubtitleKaraokeLoopRunning) {
        videoSubtitleKaraokeFrame = requestAnimationFrame(tick);
      }
    };

    videoSubtitleKaraokeFrame = requestAnimationFrame(tick);
  }

  function stopVideoSubtitleKaraokeLoop() {
    const wasRunning = videoSubtitleKaraokeLoopRunning;
    videoSubtitleKaraokeLoopRunning = false;

    if (videoSubtitleKaraokeFrame) {
      cancelAnimationFrame(videoSubtitleKaraokeFrame);
    }
    videoSubtitleKaraokeFrame = 0;

    if (wasRunning) {
      window.__ibActiveLoopsCount = Math.max(0, Number(window.__ibActiveLoopsCount || 1) - 1);
    }

    videoSubtitleKaraokeLastTick = 0;
    videoSubtitleLastCurrentTime = 0;
    resetVideoSubtitleLiveKaraoke();
  }

  function setNativeVideoCaptionsHidden(hidden) {
    document.documentElement.classList.toggle(
      "ib-video-hide-native-captions",
      Boolean(hidden)
    );
  }

  function hideVideoSubtitleOverlay() {
    stopVideoSubtitleKaraokeLoop();
    releaseVideoSubtitleHoverPause();
    if (videoSubtitleEl) videoSubtitleEl.style.display = "none";
  }

  function isYouTubeVideoPage() {
    return Boolean(IS_TOP_FRAME && /(^|\.)youtube\.com$/i.test(location.hostname));
  }

  function syncYouTubeVideoControl() {
    if (extensionTornDown) return;
    if (!isYouTubeVideoPage()) {
      youtubeNativeCaptionStateObserver?.disconnect();
      youtubeNativeCaptionStateObserver = null;
      youtubeNativeCaptionStateButton = null;
      if (youtubeNativeCaptionStateSyncFrame) cancelAnimationFrame(youtubeNativeCaptionStateSyncFrame);
      youtubeNativeCaptionStateSyncFrame = 0;
      youtubeVideoControlObserver?.disconnect();
      youtubeVideoControlObserver = null;
      if (youtubeVideoControlSyncFrame) cancelAnimationFrame(youtubeVideoControlSyncFrame);
      youtubeVideoControlSyncFrame = 0;
      youtubeVideoDubbingButtonEl?.remove();
      youtubeVideoControlButtonEl?.remove();
      youtubeVideoControlPanelEl?.remove();
      youtubeVideoDubbingButtonEl = null;
      youtubeVideoControlButtonEl = null;
      youtubeVideoControlPanelEl = null;
      return;
    }

    syncYouTubeNativeCaptionStateObserver();

    if (
      youtubeVideoDubbingButtonEl?.isConnected
      && youtubeVideoControlButtonEl?.isConnected
      && youtubeVideoControlPanelEl?.isConnected
    ) {
      updateYouTubeVideoControl();
      return;
    }

    if (!youtubeVideoControlObserver && document.documentElement) {
      youtubeVideoControlObserver = new MutationObserver(scheduleYouTubeVideoControlSync);
      youtubeVideoControlObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    }
    scheduleYouTubeVideoControlSync();
  }

  function syncYouTubeNativeCaptionStateObserver() {
    const button = document.querySelector(".html5-video-player .ytp-subtitles-button");
    if (
      button
      && button === youtubeNativeCaptionStateButton
      && youtubeNativeCaptionStateObserver
    ) return;

    youtubeNativeCaptionStateObserver?.disconnect();
    youtubeNativeCaptionStateObserver = null;
    youtubeNativeCaptionStateButton = button || null;
    if (!button) return;

    youtubeNativeCaptionStateObserver = new MutationObserver(() => {
      if (youtubeNativeCaptionStateSyncFrame) return;
      youtubeNativeCaptionStateSyncFrame = requestAnimationFrame(() => {
        youtubeNativeCaptionStateSyncFrame = 0;
        syncVideoSubtitleFeature();
      });
    });
    youtubeNativeCaptionStateObserver.observe(button, {
      attributes: true,
      attributeFilter: ["aria-pressed", "class"]
    });
  }

  function scheduleYouTubeVideoControlSync() {
    if (extensionTornDown) return;
    if (youtubeVideoControlSyncFrame) return;
    youtubeVideoControlSyncFrame = requestAnimationFrame(() => {
      youtubeVideoControlSyncFrame = 0;
      ensureYouTubeVideoControl();
    });
  }

  function ensureYouTubeVideoControl() {
    if (extensionTornDown || !isYouTubeVideoPage()) return null;
    const player = document.querySelector(".html5-video-player");
    const controls = player?.querySelector(".ytp-right-controls");
    if (!player || !controls) return null;

    if (!youtubeVideoDubbingButtonEl?.isConnected) {
      youtubeVideoDubbingButtonEl = document.createElement("button");
      youtubeVideoDubbingButtonEl.type = "button";
      youtubeVideoDubbingButtonEl.className = "ytp-button ib-youtube-dubbing-button";
      youtubeVideoDubbingButtonEl.setAttribute("aria-label", "Lồng tiếng video bằng InputBridge");
      youtubeVideoDubbingButtonEl.innerHTML = `
        <span class="ib-youtube-dubbing-button-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M4 10v4h3l4 4V6L7 10H4Z"></path><path d="M15 9.2a4 4 0 0 1 0 5.6M17.5 6.8a7.2 7.2 0 0 1 0 10.4"></path></svg>
        </span>
        <span class="ib-youtube-dubbing-button-label">Lồng tiếng</span>
        <span class="ib-youtube-dubbing-button-spinner" aria-hidden="true"></span>
      `;
      youtubeVideoDubbingButtonEl.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleVideoDubbingSession();
      });
    }

    if (!youtubeVideoControlButtonEl?.isConnected) {
      youtubeVideoControlButtonEl = document.createElement("button");
      youtubeVideoControlButtonEl.type = "button";
      youtubeVideoControlButtonEl.className = "ytp-button ib-youtube-subtitle-button";
      youtubeVideoControlButtonEl.setAttribute("aria-label", "Cài đặt phụ đề InputBridge");
      youtubeVideoControlButtonEl.setAttribute("aria-haspopup", "dialog");
      youtubeVideoControlButtonEl.innerHTML = `
        <span class="ib-youtube-subtitle-button-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M4 5.5h16v11H9l-4.2 3v-3H4v-11Z"></path><path d="M8 9h3M8 12.5h5M15.5 9H17"></path></svg>
          <b>IB</b>
        </span>
      `;
      youtubeVideoControlButtonEl.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleYouTubeVideoControlPanel();
      });
    }

    const settingsButton = controls.querySelector(".ytp-settings-button");
    const buttonHost = settingsButton?.parentElement || controls;
    if (youtubeVideoDubbingButtonEl.parentElement !== buttonHost) {
      youtubeVideoDubbingButtonEl.remove();
      buttonHost.insertBefore(youtubeVideoDubbingButtonEl, settingsButton || null);
    }
    if (youtubeVideoControlButtonEl.parentElement !== buttonHost) {
      youtubeVideoControlButtonEl.remove();
      buttonHost.insertBefore(youtubeVideoControlButtonEl, settingsButton || null);
    }

    if (!youtubeVideoControlPanelEl?.isConnected) {
      youtubeVideoControlPanelEl = document.createElement("div");
      youtubeVideoControlPanelEl.className = "ib-youtube-subtitle-panel";
      youtubeVideoControlPanelEl.setAttribute("role", "dialog");
      youtubeVideoControlPanelEl.setAttribute("aria-label", "Cài đặt phụ đề InputBridge");
      const youtubePanelLogoUrl = chrome.runtime.getURL("icons/icon128.png");
      youtubeVideoControlPanelEl.innerHTML = `
        <div class="ib-youtube-panel-head">
          <div class="ib-youtube-panel-brand">
            <img class="ib-youtube-panel-logo" src="${youtubePanelLogoUrl}" alt="" width="28" height="28">
            <div><strong>InputBridge</strong><small data-role="status">Đang tắt</small></div>
          </div>
          <label class="ib-youtube-toggle" title="Bật hoặc tắt phụ đề InputBridge">
            <input data-role="enabled" type="checkbox">
            <span aria-hidden="true"></span>
          </label>
          <button class="ib-youtube-panel-settings" data-role="style-settings" type="button" aria-label="Tùy chỉnh kiểu phụ đề" aria-pressed="false" title="Tùy chỉnh kiểu phụ đề">⚙</button>
          <button class="ib-youtube-panel-close" data-role="close" type="button" aria-label="Đóng">×</button>
        </div>
        <div class="ib-youtube-panel-body" data-role="main-view">
          <button class="ib-youtube-session-subtitle-toggle" data-role="temporary-toggle" type="button">
            <span data-role="temporary-toggle-label">Tắt riêng video này</span>
            <small>Chỉ trong phiên này · không lưu</small>
          </button>
          <div class="ib-youtube-panel-row ib-youtube-panel-row-visibility" data-subtitle-visibility-row="source">
            <div class="ib-youtube-panel-row-title">
              <span>Phụ đề gốc</span>
              <label class="ib-youtube-row-toggle" title="Bật hoặc tắt phụ đề gốc">
                <input data-role="show-source" type="checkbox" aria-label="Hiện phụ đề gốc">
                <span aria-hidden="true"></span>
              </label>
            </div>
            <select data-role="source" aria-label="Ngôn ngữ phụ đề gốc"></select>
          </div>
          <div class="ib-youtube-panel-row ib-youtube-panel-row-visibility" data-subtitle-visibility-row="translation">
            <div class="ib-youtube-panel-row-title">
              <span>Phụ đề dịch</span>
              <label class="ib-youtube-row-toggle" title="Bật hoặc tắt phụ đề dịch">
                <input data-role="show-translation" type="checkbox" aria-label="Hiện phụ đề dịch">
                <span aria-hidden="true"></span>
              </label>
            </div>
            <select data-role="target" aria-label="Ngôn ngữ phụ đề dịch"></select>
          </div>
          <div class="ib-youtube-panel-row ib-youtube-panel-row-visibility" data-dubbing-row>
            <div class="ib-youtube-panel-row-title">
              <span>Lồng tiếng khi cần</span>
              <label class="ib-youtube-row-toggle" title="Tạm dừng, chuẩn bị rồi mới phát lồng tiếng">
                <input data-role="dubbing-enabled" type="checkbox" aria-label="Bắt đầu lồng tiếng">
                <span aria-hidden="true"></span>
              </label>
            </div>
            <select data-role="dubbing-original-volume" aria-label="Âm lượng tiếng gốc khi đọc bản dịch">
              <option value="0">Tắt tiếng gốc</option>
              <option value="0.2">Tiếng gốc 20%</option>
              <option value="0.4">Tiếng gốc 40%</option>
              <option value="1">Giữ nguyên tiếng gốc</option>
            </select>
          </div>
          <label class="ib-youtube-panel-row">
            <span>Giọng đọc Edge</span>
            <select data-role="dubbing-voice" aria-label="Giọng đọc bản dịch">
              <option value="">Đang tải giọng Edge...</option>
            </select>
          </label>
          <label class="ib-youtube-panel-row">
            <span>Bộ dịch dự phòng</span>
            <select data-role="engine" aria-label="Bộ dịch dự phòng">
              <option value="google">Google Translate</option>
              <option value="gemini">Gemini Flash-Lite</option>
            </select>
          </label>
        </div>
        <div class="ib-youtube-style-view" data-role="style-view" hidden>
          <div class="ib-youtube-style-heading">
            <div><strong>Kiểu phụ đề</strong><small>Thay đổi được áp dụng ngay trên video</small></div>
            <button data-role="style-done" type="button">Xong</button>
          </div>
          <div class="ib-youtube-style-presets" role="group" aria-label="Mẫu kiểu phụ đề">
            <button data-style-preset="anime" type="button">Anime</button>
            <button data-style-preset="clean" type="button">Tối giản</button>
            <button data-style-preset="glass" type="button">Khung kính</button>
          </div>
          <div class="ib-youtube-style-tabs" role="tablist" aria-label="Dòng phụ đề cần chỉnh">
            <button data-style-tab="source" type="button" role="tab" aria-selected="true">Dòng gốc</button>
            <button data-style-tab="translation" type="button" role="tab" aria-selected="false">Dòng dịch</button>
          </div>
          <div class="ib-youtube-style-section" data-style-section="source">
            <label><span>Cỡ chữ</span><input data-style-key="videoSubtitleSourceFontSize" type="number" min="14" max="42" step="1"></label>
            <label><span>Font</span><select data-style-key="videoSubtitleSourceFontFamily"><option value="system">Hệ thống</option><option value="sans">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option></select></label>
            <label><span>Độ đậm</span><select data-style-key="videoSubtitleSourceFontWeight"><option value="400">400</option><option value="500">500</option><option value="600">600</option><option value="700">700</option><option value="800">800</option></select></label>
            <label><span>Màu chữ</span><input data-style-key="videoSubtitleSourceColor" type="color"></label>
            <label><span>Màu nền</span><input data-style-key="videoSubtitleSourceBackground" type="color"></label>
            <label><span>Độ mờ nền</span><input data-style-key="videoSubtitleSourceBackgroundOpacity" type="number" min="0" max="100" step="1"></label>
            <label><span>Bo góc</span><input data-style-key="videoSubtitleSourceRadius" type="number" min="0" max="24" step="1"></label>
            <label><span>Viền chữ</span><input data-style-key="videoSubtitleSourceOutline" type="number" min="0" max="3" step="0.5"></label>
          </div>
          <div class="ib-youtube-style-section" data-style-section="translation" hidden>
            <label><span>Cỡ chữ</span><input data-style-key="videoSubtitleTranslationFontSize" type="number" min="14" max="42" step="1"></label>
            <label><span>Font</span><select data-style-key="videoSubtitleTranslationFontFamily"><option value="system">Hệ thống</option><option value="sans">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option></select></label>
            <label><span>Độ đậm</span><select data-style-key="videoSubtitleTranslationFontWeight"><option value="400">400</option><option value="500">500</option><option value="600">600</option><option value="700">700</option><option value="800">800</option></select></label>
            <label><span>Màu chữ</span><input data-style-key="videoSubtitleTranslationColor" type="color"></label>
            <label><span>Màu nền</span><input data-style-key="videoSubtitleTranslationBackground" type="color"></label>
            <label><span>Độ mờ nền</span><input data-style-key="videoSubtitleTranslationBackgroundOpacity" type="number" min="0" max="100" step="1"></label>
            <label><span>Bo góc</span><input data-style-key="videoSubtitleTranslationRadius" type="number" min="0" max="24" step="1"></label>
            <label><span>Viền chữ</span><input data-style-key="videoSubtitleTranslationOutline" type="number" min="0" max="3" step="0.5"></label>
          </div>
          <button class="ib-youtube-style-reset-position" data-role="reset-style-position" type="button">Đặt lại vị trí hai dòng</button>
        </div>
        <div class="ib-youtube-panel-footer">
          <button data-role="full-settings" type="button">Mở cài đặt đầy đủ</button>
        </div>
      `;
      youtubeVideoControlPanelEl.addEventListener("pointerdown", (event) => event.stopPropagation());
      youtubeVideoControlPanelEl.addEventListener("click", (event) => event.stopPropagation());
      ["keydown", "keypress", "keyup"].forEach((type) => {
        youtubeVideoControlPanelEl.addEventListener(type, (event) => event.stopPropagation());
      });
      bindYouTubeVideoControlPanel();
    }

    if (youtubeVideoControlPanelEl.parentElement !== player) {
      youtubeVideoControlPanelEl.remove();
      player.appendChild(youtubeVideoControlPanelEl);
    }

    youtubeVideoControlObserver?.disconnect();
    youtubeVideoControlObserver = null;
    updateYouTubeVideoControl();
    return youtubeVideoControlPanelEl;
  }

  function bindYouTubeVideoControlPanel() {
    const panel = youtubeVideoControlPanelEl;
    if (!panel) return;

    panel.querySelector('[data-role="close"]')?.addEventListener("click", closeYouTubeVideoControlPanel);
    panel.querySelector('[data-role="enabled"]')?.addEventListener("change", async (event) => {
      settings.videoSubtitleEnabled = Boolean(event.target.checked);
      await saveSyncSettings({ videoSubtitleEnabled: settings.videoSubtitleEnabled });
      syncVideoSubtitleFeature();
      updateYouTubeVideoControl();
    });
    panel.querySelector('[data-role="temporary-toggle"]')?.addEventListener("click", () => {
      toggleCurrentVideoSubtitleTemporaryDisabled();
    });
    panel.querySelector('[data-role="source"]')?.addEventListener("change", async (event) => {
      settings.videoSubtitleSourceLanguage = event.target.value || "auto";
      resetVideoCaptionSession();
      await saveSyncSettings({ videoSubtitleSourceLanguage: settings.videoSubtitleSourceLanguage });
      syncVideoSubtitleFeature();
      updateYouTubeVideoControl();
    });
    panel.querySelector('[data-role="target"]')?.addEventListener("change", async (event) => {
      settings.videoSubtitleTargetLanguage = event.target.value || "Vietnamese";
      resetVideoCaptionSession();
      await saveSyncSettings({ videoSubtitleTargetLanguage: settings.videoSubtitleTargetLanguage });
      syncVideoSubtitleFeature();
      updateYouTubeVideoControl();
    });
    panel.querySelector('[data-role="engine"]')?.addEventListener("change", async (event) => {
      settings.videoSubtitleEngine = event.target.value === "gemini" ? "gemini" : "google";
      if (isVideoDubbingSessionRequested()) stopVideoDubbingSession({ resumeOriginal: true });
      await saveSyncSettings({ videoSubtitleEngine: settings.videoSubtitleEngine });
      updateYouTubeVideoControl();
      scheduleVideoCaptionRead(0);
    });
    panel.querySelector('[data-role="dubbing-enabled"]')?.addEventListener("change", async (event) => {
      const requested = Boolean(event.target.checked);
      if (requested && !isVideoDubbingSessionRequested()) {
        toggleVideoDubbingSession();
      } else if (!requested && isVideoDubbingSessionRequested()) {
        stopVideoDubbingSession({
          resumeOriginal: isVideoDubbingSessionPreparing()
        });
      }
      updateYouTubeVideoControl();
    });
    panel.querySelector('[data-role="dubbing-original-volume"]')?.addEventListener("change", async (event) => {
      settings.videoDubbingOriginalVolume = clampNumber(event.target.value, 0, 1, 0.2);
      await saveSyncSettings({ videoDubbingOriginalVolume: settings.videoDubbingOriginalVolume });
      const video = videoDubbingSessionVideo || getPrimaryVideo();
      restoreVideoDubbingOriginalVolume();
      if (video && videoDubbingSessionState === "running") applyVideoDubbingOriginalVolume(video);
      updateYouTubeVideoControl();
    });
    panel.querySelector('[data-role="dubbing-voice"]')?.addEventListener("change", async (event) => {
      const languageKey = getVideoDubbingLanguageKey();
      const nextMap = {
        ...(settings.videoDubbingVoiceByLanguage && typeof settings.videoDubbingVoiceByLanguage === "object"
          ? settings.videoDubbingVoiceByLanguage
          : {})
      };
      const voice = String(event.target.value || "").trim();
      if (voice) nextMap[languageKey] = voice;
      else delete nextMap[languageKey];
      settings.videoDubbingVoiceByLanguage = nextMap;
      resetVideoDubbingLiveState();
      if (isVideoDubbingSessionRequested()) stopVideoDubbingSession({ resumeOriginal: true });
      else stopVideoDubbing(true);
      clearVideoDubbingAudioCache();
      await saveSyncSettings({ videoDubbingVoiceByLanguage: nextMap });
      updateYouTubeVideoControl();
    });
    const handleSubtitleVisibilityChange = async () => {
      const showSource = Boolean(panel.querySelector('[data-role="show-source"]')?.checked);
      const showTranslation = Boolean(panel.querySelector('[data-role="show-translation"]')?.checked);
      settings.videoSubtitleShowSource = showSource;
      settings.videoSubtitleShowTranslation = showTranslation;
      settings.videoSubtitleBilingual = showSource && showTranslation;
      videoSubtitleRequestSeq += 1;
      if (!showTranslation && !isVideoDubbingSessionRequested()) videoCaptionPending.clear();
      await saveSyncSettings({
        videoSubtitleShowSource: showSource,
        videoSubtitleShowTranslation: showTranslation,
        videoSubtitleBilingual: settings.videoSubtitleBilingual
      });
      if (!showSource && !showTranslation) hideVideoSubtitleOverlay();
      else scheduleVideoCaptionRead(0);
      updateYouTubeVideoControl();
    };
    panel.querySelector('[data-role="show-source"]')?.addEventListener("change", handleSubtitleVisibilityChange);
    panel.querySelector('[data-role="show-translation"]')?.addEventListener("change", handleSubtitleVisibilityChange);
    panel.querySelector('[data-role="style-settings"]')?.addEventListener("click", () => {
      toggleYouTubeVideoStyleView();
    });
    panel.querySelector('[data-role="style-done"]')?.addEventListener("click", () => {
      toggleYouTubeVideoStyleView(false);
    });
    panel.querySelectorAll('[data-style-tab]').forEach((button) => {
      button.addEventListener("click", () => setYouTubeVideoStyleTab(button.dataset.styleTab || "source"));
    });
    panel.querySelectorAll('[data-style-preset]').forEach((button) => {
      button.addEventListener("click", () => {
        void applyYouTubeVideoSubtitleStylePreset(button.dataset.stylePreset || "");
      });
    });
    panel.querySelectorAll('[data-style-key]').forEach((control) => {
      control.addEventListener("input", () => {
        applyYouTubeVideoSubtitleStyleField(control.dataset.styleKey || "", control.value, false);
      });
      control.addEventListener("change", () => {
        applyYouTubeVideoSubtitleStyleField(control.dataset.styleKey || "", control.value, true);
      });
    });
    panel.querySelector('[data-role="reset-style-position"]')?.addEventListener("click", () => {
      void resetYouTubeVideoSubtitlePositions();
    });
    panel.querySelector('[data-role="full-settings"]')?.addEventListener("click", () => {
      const url = chrome.runtime?.getURL?.("popup.html") || "";
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    });
  }

  function toggleYouTubeVideoStyleView(forceOpen) {
    const panel = youtubeVideoControlPanelEl;
    if (!panel) return;
    const styleView = panel.querySelector('[data-role="style-view"]');
    const mainView = panel.querySelector('[data-role="main-view"]');
    const settingsButton = panel.querySelector('[data-role="style-settings"]');
    const open = typeof forceOpen === "boolean"
      ? forceOpen
      : Boolean(styleView?.hidden);
    if (styleView) styleView.hidden = !open;
    if (mainView) mainView.hidden = open;
    panel.classList.toggle("is-style-open", open);
    settingsButton?.classList.toggle("is-active", open);
    settingsButton?.setAttribute("aria-pressed", String(open));
    if (open) updateYouTubeVideoStyleEditor();
  }

  function setYouTubeVideoStyleTab(tabName) {
    const panel = youtubeVideoControlPanelEl;
    if (!panel) return;
    const activeTab = tabName === "translation" ? "translation" : "source";
    panel.querySelectorAll('[data-style-tab]').forEach((button) => {
      const selected = button.dataset.styleTab === activeTab;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", String(selected));
    });
    panel.querySelectorAll('[data-style-section]').forEach((section) => {
      section.hidden = section.dataset.styleSection !== activeTab;
    });
  }

  function normalizeYouTubeVideoSubtitleStyleValue(key, rawValue) {
    if (!key || !Object.prototype.hasOwnProperty.call(BOOT_SETTINGS, key)) return undefined;
    if (key.endsWith("Color") || key.endsWith("Background")) {
      return normalizeVideoSubtitleColor(rawValue, BOOT_SETTINGS[key]);
    }
    if (key.endsWith("FontFamily")) {
      return ["system", "sans", "serif", "mono"].includes(rawValue) ? rawValue : "system";
    }
    if (rawValue === "") return undefined;
    if (key.endsWith("FontSize")) return Math.round(clampNumber(rawValue, 14, 42, BOOT_SETTINGS[key]));
    if (key.endsWith("FontWeight")) {
      return Math.round(clampNumber(rawValue, 400, 800, BOOT_SETTINGS[key]) / 100) * 100;
    }
    if (key.endsWith("BackgroundOpacity")) return Math.round(clampNumber(rawValue, 0, 100, BOOT_SETTINGS[key]));
    if (key.endsWith("Radius")) return Math.round(clampNumber(rawValue, 0, 24, BOOT_SETTINGS[key]));
    if (key.endsWith("Outline")) return Math.round(clampNumber(rawValue, 0, 3, BOOT_SETTINGS[key]) * 2) / 2;
    return undefined;
  }

  function applyYouTubeVideoSubtitleStyleField(key, rawValue, persist) {
    const value = normalizeYouTubeVideoSubtitleStyleValue(key, rawValue);
    if (value === undefined) return;
    settings[key] = value;
    ensureVideoSubtitleOverlay();
    updateYouTubeVideoStylePresetState();
    if (persist) void saveSyncSettings({ [key]: value });
  }

  async function applyYouTubeVideoSubtitleStylePreset(name) {
    const preset = VIDEO_SUBTITLE_STYLE_PRESETS[name];
    if (!preset) return;
    Object.assign(settings, preset);
    ensureVideoSubtitleOverlay();
    updateYouTubeVideoStyleEditor();
    await saveSyncSettings({ ...preset });
  }

  function updateYouTubeVideoStylePresetState() {
    const panel = youtubeVideoControlPanelEl;
    if (!panel) return;
    panel.querySelectorAll('[data-style-preset]').forEach((button) => {
      const preset = VIDEO_SUBTITLE_STYLE_PRESETS[button.dataset.stylePreset || ""];
      const active = Boolean(preset && Object.entries(preset).every(([key, value]) => String(settings[key]) === String(value)));
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function updateYouTubeVideoStyleEditor() {
    const panel = youtubeVideoControlPanelEl;
    if (!panel) return;
    panel.querySelectorAll('[data-style-key]').forEach((control) => {
      const key = control.dataset.styleKey || "";
      const value = settings[key];
      if (value !== undefined && document.activeElement !== control) control.value = String(value);
    });
    updateYouTubeVideoStylePresetState();
    const selected = panel.querySelector('[data-style-tab][aria-selected="true"]')?.dataset.styleTab || "source";
    setYouTubeVideoStyleTab(selected);
  }

  async function resetYouTubeVideoSubtitlePositions() {
    videoSubtitleDragPositions = null;
    applyVideoSubtitleItemPositions();
    try {
      const stored = await chrome.storage.local.get(VIDEO_SUBTITLE_POSITION_STORAGE_KEY);
      const byOrigin = { ...(stored?.[VIDEO_SUBTITLE_POSITION_STORAGE_KEY] || {}) };
      delete byOrigin[getPageOrigin()];
      await chrome.storage.local.set({ [VIDEO_SUBTITLE_POSITION_STORAGE_KEY]: byOrigin });
    } catch {}
    const button = youtubeVideoControlPanelEl?.querySelector('[data-role="reset-style-position"]');
    if (button) {
      const original = button.textContent;
      button.textContent = "Đã đặt lại vị trí";
      window.setTimeout(() => {
        if (button.isConnected) button.textContent = original;
      }, 1100);
    }
  }

  function resetVideoCaptionSession() {
    clearTimeout(videoSubtitleEmptyTimer);
    videoSubtitleRequestSeq += 1;
    lastVideoCaptionText = "";
    videoDubbingConsumedCueKeys.clear();
    resetVideoDubbingLiveState();
    lastVideoCaptionTimelineIndex = -1;
    resetYouTubeCaptionReader();
    videoPlayerCaptionExpiredText = "";
    videoCaptionTimeline = [];
    videoCaptionTranslatedTimeline = [];
    videoCaptionTranslationEngine = "";
    videoCaptionUsesPlayerTrack = false;
    videoCaptionTimelineKey = "";
    videoCaptionTimelineRequestKey = "";
    videoCaptionTimelineLoading = false;
    videoCaptionTimelineRetryCount = 0;
    videoCaptionTimelineNextRetryAt = 0;
    videoCaptionTimelineError = "";
    videoCaptionTranslations.clear();
    videoCaptionPending.clear();
    if (isVideoDubbingSessionRequested()) stopVideoDubbingSession({ resumeOriginal: true });
    else stopVideoDubbing(true);
    hideVideoSubtitleOverlay();
  }

  function populateYouTubeSourceSelect(select) {
    if (!select) return;
    const current = settings.videoSubtitleSourceLanguage || "auto";
    const signature = JSON.stringify({
      current,
      active: videoCaptionActiveSourceLanguageCode,
      tracks: videoCaptionAvailableTracks.map((track) => [track?.languageCode, track?.label, Boolean(track?.isAsr)])
    });
    if (select.dataset.signature === signature) {
      select.value = current;
      return;
    }
    select.dataset.signature = signature;
    const fragment = document.createDocumentFragment();
    const automatic = document.createElement("option");
    automatic.value = "auto";
    const activeTrack = videoCaptionAvailableTracks.find((track) =>
      sameLanguageCodeForUi(track?.languageCode, videoCaptionActiveSourceLanguageCode)
    );
    automatic.textContent = activeTrack?.label
      ? `Theo audio đang phát · ${activeTrack.label}`
      : "Theo audio đang phát";
    fragment.appendChild(automatic);

    const original = document.createElement("option");
    original.value = "original";
    original.textContent = "Ngôn ngữ gốc video";
    fragment.appendChild(original);

    const seen = new Set(["auto", "original"]);
    for (const track of videoCaptionAvailableTracks) {
      const code = String(track?.languageCode || "").trim();
      if (!code || seen.has(code.toLowerCase())) continue;
      seen.add(code.toLowerCase());
      const option = document.createElement("option");
      option.value = code;
      option.textContent = `${track.label || LANGUAGE_CATALOG?.nameFor(code, code) || code}${track.isAsr ? " · tự động" : ""}`;
      fragment.appendChild(option);
    }

    if (current !== "auto" && !seen.has(current.toLowerCase())) {
      const option = document.createElement("option");
      option.value = current;
      option.textContent = LANGUAGE_CATALOG?.nameFor(current, current) || current;
      fragment.appendChild(option);
    }
    select.replaceChildren(fragment);
    select.value = current;
  }

  function populateYouTubeTargetSelect(select) {
    if (!select || select.options.length) return;
    const fragment = document.createDocumentFragment();
    for (const language of LANGUAGE_CATALOG?.ordered || []) {
      const option = document.createElement("option");
      option.value = language.name;
      option.textContent = language.name;
      fragment.appendChild(option);
    }
    select.replaceChildren(fragment);
  }

  function updateYouTubeVideoControl() {
    const button = youtubeVideoControlButtonEl;
    const dubbingButton = youtubeVideoDubbingButtonEl;
    const panel = youtubeVideoControlPanelEl;
    if (!button || !dubbingButton || !panel) return;
    dubbingButton.dataset.dubbingSyncMode = "latest-start";

    const currentVideoSession = getCurrentVideoSubtitleSessionState();
    const temporarilyDisabled = currentVideoSession.temporarilyDisabled;
    const waitingForYouTubeCaptions = Boolean(
      settings.videoSubtitleEnabled
      && currentVideoSession.requiresNativeCaptions
      && !currentVideoSession.nativeCaptionsEnabled
    );
    const enabled = currentVideoSession.effectiveEnabled;
    button.classList.toggle("is-enabled", enabled);
    button.classList.toggle("is-session-disabled", temporarilyDisabled);
    button.setAttribute("aria-pressed", String(enabled));
    button.title = waitingForYouTubeCaptions
      ? "Bật phụ đề YouTube (CC) để chạy phụ đề InputBridge"
      : temporarilyDisabled
      ? "Phụ đề InputBridge đang tắt riêng cho video này"
      : (enabled
        ? `InputBridge · ${settings.videoSubtitleTargetLanguage || "Vietnamese"}`
        : "Bật phụ đề InputBridge");

    const quickLabels = {
      idle: "Lồng tiếng",
      timeline: "Đang xử lý",
      translating: "Đang xử lý",
      buffering: "Đang xử lý",
      ready: "Sẵn sàng",
      running: "Đang lồng tiếng",
      error: "Thử lại"
    };
    const quickLabel = quickLabels[videoDubbingSessionState] || "Lồng tiếng";
    const quickLabelEl = dubbingButton.querySelector(".ib-youtube-dubbing-button-label");
    if (quickLabelEl) quickLabelEl.textContent = quickLabel;
    dubbingButton.classList.toggle("is-preparing", isVideoDubbingSessionPreparing());
    dubbingButton.classList.toggle("is-active", isVideoDubbingSessionArmed());
    dubbingButton.classList.toggle("is-error", videoDubbingSessionState === "error");
    dubbingButton.setAttribute("aria-pressed", String(isVideoDubbingSessionRequested()));
    dubbingButton.setAttribute("aria-busy", String(isVideoDubbingSessionPreparing()));
    dubbingButton.title = videoDubbingSessionStatus || (
      isVideoDubbingSessionRequested()
        ? "Bấm để dừng lồng tiếng"
        : "Tạm dừng video, chuẩn bị bản dịch và giọng đọc rồi mới phát"
    );

    const sourceSelect = panel.querySelector('[data-role="source"]');
    const targetSelect = panel.querySelector('[data-role="target"]');
    populateYouTubeSourceSelect(sourceSelect);
    populateYouTubeTargetSelect(targetSelect);
    if (targetSelect) targetSelect.value = settings.videoSubtitleTargetLanguage || "Vietnamese";
    const enabledInput = panel.querySelector('[data-role="enabled"]');
    const engineSelect = panel.querySelector('[data-role="engine"]');
    const showSourceInput = panel.querySelector('[data-role="show-source"]');
    const showTranslationInput = panel.querySelector('[data-role="show-translation"]');
    const dubbingEnabledInput = panel.querySelector('[data-role="dubbing-enabled"]');
    const dubbingOriginalVolumeSelect = panel.querySelector('[data-role="dubbing-original-volume"]');
    const dubbingVoiceSelect = panel.querySelector('[data-role="dubbing-voice"]');
    const temporaryToggle = panel.querySelector('[data-role="temporary-toggle"]');
    const temporaryToggleLabel = panel.querySelector('[data-role="temporary-toggle-label"]');
    const showSource = Boolean(settings.videoSubtitleShowSource);
    const showTranslation = settings.videoSubtitleShowTranslation !== false;
    const dubbingEnabled = isVideoDubbingSessionRequested();
    if (enabledInput) enabledInput.checked = Boolean(settings.videoSubtitleEnabled);
    if (sourceSelect) sourceSelect.disabled = !showSource;
    if (targetSelect) targetSelect.disabled = isVideoDubbingSessionPreparing();
    if (engineSelect) {
      engineSelect.value = settings.videoSubtitleEngine === "gemini" ? "gemini" : "google";
      engineSelect.disabled = isVideoDubbingSessionPreparing();
    }
    if (showSourceInput) showSourceInput.checked = showSource;
    if (showTranslationInput) showTranslationInput.checked = showTranslation;
    if (dubbingEnabledInput) dubbingEnabledInput.checked = dubbingEnabled;
    if (dubbingOriginalVolumeSelect) {
      dubbingOriginalVolumeSelect.value = String(clampNumber(settings.videoDubbingOriginalVolume, 0, 1, 0.2));
      dubbingOriginalVolumeSelect.disabled = isVideoDubbingSessionPreparing();
    }
    if (dubbingVoiceSelect) {
      populateVideoDubbingVoiceSelect(dubbingVoiceSelect);
      dubbingVoiceSelect.disabled = isVideoDubbingSessionPreparing();
    }
    if (temporaryToggle) {
      temporaryToggle.disabled = (
        !currentVideoSession.available
        || !settings.videoSubtitleEnabled
        || waitingForYouTubeCaptions
      );
      temporaryToggle.classList.toggle("is-active", temporarilyDisabled);
      temporaryToggle.setAttribute("aria-pressed", String(temporarilyDisabled));
    }
    if (temporaryToggleLabel) {
      temporaryToggleLabel.textContent = temporarilyDisabled
        ? "Bật lại phụ đề video này"
        : "Tắt riêng video này";
    }
    panel.querySelector('[data-subtitle-visibility-row="source"]')?.classList.toggle("is-line-hidden", !showSource);
    panel.querySelector('[data-subtitle-visibility-row="translation"]')?.classList.toggle("is-line-hidden", !showTranslation);
    const status = panel.querySelector('[data-role="status"]');
    if (status) {
      status.textContent = videoDubbingSessionStatus
        || (waitingForYouTubeCaptions
          ? "Hãy bật phụ đề YouTube (CC)"
          : videoCaptionTimelineError
            || (temporarilyDisabled
              ? "Đã tắt riêng video này · không lưu"
              : enabled
                ? (!showSource && !showTranslation
                  ? "Đang ẩn cả hai dòng"
                  : `${settings.videoSubtitleTargetLanguage || "Vietnamese"} · phụ đề đang chạy`)
                : "Phụ đề đang tắt · lồng tiếng chỉ chạy khi bấm"));
    }
    updateYouTubeVideoStyleEditor();
  }

  function sameLanguageCodeForUi(left, right) {
    const first = String(left || "").toLowerCase().replace(/_/g, "-");
    const second = String(right || "").toLowerCase().replace(/_/g, "-");
    return Boolean(first && second && (first === second || first.split("-")[0] === second.split("-")[0]));
  }

  function toggleYouTubeVideoControlPanel() {
    const panel = ensureYouTubeVideoControl();
    if (!panel) return;
    const open = !panel.classList.contains("is-open");
    panel.classList.toggle("is-open", open);
    youtubeVideoControlButtonEl?.classList.toggle("is-panel-open", open);
    youtubeVideoControlButtonEl?.setAttribute("aria-expanded", String(open));
    if (open) updateYouTubeVideoControl();
  }

  function closeYouTubeVideoControlPanel() {
    youtubeVideoControlPanelEl?.classList.remove("is-open");
    youtubeVideoControlButtonEl?.classList.remove("is-panel-open");
    youtubeVideoControlButtonEl?.setAttribute("aria-expanded", "false");
  }

  function onYouTubeVideoControlNavigation() {
    videoDubbingResumeAfterSeekVideo = null;
    if (isVideoDubbingSessionRequested()) {
      stopVideoDubbingSession({ resumeOriginal: false });
    } else if (videoDubbingSessionState === "error") {
      setVideoDubbingSessionState("idle", "");
    }
    scheduleYouTubeVideoControlSync();
    window.setTimeout(scheduleYouTubeVideoControlSync, 180);
    window.setTimeout(scheduleYouTubeVideoControlSync, 700);
  }

  function onYouTubeControlDocumentPointerDown(event) {
    const eventTarget = event.target instanceof Element ? event.target : null;
    if (eventTarget?.closest(".ytp-subtitles-button")) {
      window.setTimeout(syncVideoSubtitleFeature, 0);
    }
    if (!youtubeVideoControlPanelEl?.classList.contains("is-open")) return;
    const target = event.target instanceof Node ? event.target : null;
    if (target && (
      youtubeVideoControlPanelEl.contains(target)
      || youtubeVideoControlButtonEl?.contains(target)
      || youtubeVideoDubbingButtonEl?.contains(target)
    )) return;
    closeYouTubeVideoControlPanel();
  }

  function onYouTubeControlDocumentKeyDown(event) {
    if (
      event.key?.toLowerCase() === "c"
      && !event.ctrlKey
      && !event.metaKey
      && !event.altKey
    ) {
      window.setTimeout(syncVideoSubtitleFeature, 0);
    }
    if (event.key === "Escape") closeYouTubeVideoControlPanel();
  }

  function observeEventRoot(root) {
    if (!root || observedRoots.has(root)) return;
    observedRoots.add(root);

    const bind = (type, handler, options = true) => {
      root.addEventListener(type, (event) => {
        if (!shouldHandleEventAtRoot(root, event)) return;
        handler(event);
      }, options);
    };

    bind(SHADOW_ATTACHED_EVENT, onShadowAttached);
    bind("focusin", onFocusIn);
    bind("focusout", onFocusOut);
    bind("input", onInput);
    bind("keydown", onKeyDown);
    bind("click", onDocumentClick);
    bind("pointerdown", (event) => onSelectionPointerDown(event, root));
    bind("pointerup", (event) => onSelectionPointerUp(event, root));
    bind("keyup", (event) => onSelectionKeyUp(event, root));
    root.addEventListener("selectionchange", () => onSelectionChange(root), true);
    bind("compositionstart", () => { isComposing = true; });
    bind("compositionend", () => {
      isComposing = false;
      scheduleTransform("compositionend");
    });

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) scanForOpenShadowRoots(node);
      }
    });
    observer.observe(root, { childList: true, subtree: true });
    rootObservers.set(root, observer);
    if (root instanceof ShadowRoot) scanForOpenShadowRoots(root);
  }

  function shouldHandleEventAtRoot(root, event) {
    const path = event.composedPath?.() || [];
    const innermostShadowRoot = path.find((node) => node instanceof ShadowRoot) || null;
    if (root === document) return !innermostShadowRoot;
    return innermostShadowRoot === root;
  }

  function onShadowAttached(event) {
    const host = event.target instanceof Element ? event.target : null;
    if (host?.shadowRoot) observeEventRoot(host.shadowRoot);
  }

  function scanForOpenShadowRoots(startNode) {
    if (!startNode) return;

    const inspect = (node) => {
      if (!(node instanceof Element)) return;
      if (node.shadowRoot) observeEventRoot(node.shadowRoot);
    };

    if (startNode instanceof Element) inspect(startNode);
    const scope = startNode instanceof Document || startNode instanceof ShadowRoot || startNode instanceof Element
      ? startNode
      : null;
    if (!scope?.querySelectorAll) return;
    for (const el of scope.querySelectorAll("*")) inspect(el);
  }

  function getDeepActiveElement() {
    let current = document.activeElement;
    while (current?.shadowRoot?.activeElement) current = current.shadowRoot.activeElement;
    return current;
  }

  function isEditorActive(editor) {
    const focused = getDeepActiveElement();
    return Boolean(editor && focused && (focused === editor || editor.contains?.(focused)));
  }

  function onFocusIn(event) {
    const el = findEditable(event.target);
    if (!el) return;

    if (el !== activeEl) {
      activeEl = el;
      lastOriginal = getEditableText(el);
      currentPreview = null;
      scheduleTransform("focus");
    } else {
      const text = getEditableText(el);
      if (text !== lastOriginal || !currentPreview) {
        lastOriginal = text;
        currentPreview = null;
        scheduleTransform("focus");
      }
    }
  }

  function onFocusOut() {
    window.setTimeout(() => {
      if (sendInProgress) return;
      if (Date.now() < previewInteractionUntil) return;

      const focused = getDeepActiveElement();
      if (previewEl?.contains(focused)) return;
      if (activeEl && isEditorActive(activeEl)) return;

      if (!focused || !findEditable(focused)) {
        activeEl = null;
        currentPreview = null;
        requestSeq += 1;
        clearTimers();
        hidePreview();
      }
    }, 160);
  }

  function onInput(event) {
    const el = findEditable(event.target);
    if (!el) return;

    if (el !== activeEl) {
      activeEl = el;
      currentPreview = null;
      lastOriginal = getEditableText(el);
    }

    if (suppressNextInput) {
      suppressNextInput = false;
      return;
    }

    currentPreview = null;
    lastOriginal = getEditableText(el);
    const text = lastOriginal.trim();

    if (!shouldProcess(text)) {
      requestSeq += 1;
      clearTimers();
      hidePreview();
      return;
    }

    scheduleTransform("input");
  }

  async function onKeyDown(event) {
    if (event.key === "Escape") {
      const target = event.target instanceof Element ? event.target : null;
      const openSelect = target?.closest?.(".ib-custom-select.is-open") ||
        selectionCardEl?.querySelector?.(".ib-custom-select.is-open") ||
        previewEl?.querySelector?.(".ib-custom-select.is-open");

      if (openSelect) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        closeInlineSelect(openSelect, { clearSearch: true, focusTrigger: true });
        if (selectionCardEl?.contains(openSelect)) positionSelectionUi({ preserveCardPlacement: true });
        else positionPreview();
        return;
      }

      hideSelectionUi();
      hidePreview();
      return;
    }

    const eventEl = findEditable(event.target);
    if (eventEl && eventEl !== activeEl) activeEl = eventEl;
    if (!activeEl || !settings?.enabled) return;

    if (event.ctrlKey && event.key.toLowerCase() === "z" && lastApplied) {
      restoreLastApplied();
      return;
    }

    if (settings.acceptWithTab && event.key === "Tab" && currentPreview?.result) {
      event.preventDefault();
      applyPreview("tab");
      return;
    }

    if (event.key === "Enter" && !event.shiftKey && settings.autoMode === "autoOnSend") {
      const text = getEditableText(activeEl).trim();
      if (!shouldProcess(text) || sendInProgress) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      await handleSendIntent({ source: "enter", editable: activeEl });
    }
  }

  function onDocumentClick(event) {
    if (!settings?.enabled || settings.autoMode !== "autoOnSend" || sendInProgress) return;
    if (bypassNextSendClick) {
      bypassNextSendClick = false;
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest(".ib-preview-card, .ib-toast, .ib-selection-icon, .ib-selection-card, .ib-youtube-subtitle-panel, .ib-youtube-subtitle-button")) return;

    const control = target.closest('button, [role="button"], input[type="submit"]');
    if (!control || !isLikelySendControl(control, activeEl)) return;

    const editable = activeEl || findEditable(getDeepActiveElement());
    const text = editable ? getEditableText(editable).trim() : "";
    if (!editable || !shouldProcess(text)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    void handleSendIntent({ source: "click", editable, sendControl: control });
  }

  async function handleSendIntent({ source, editable, sendControl = null }) {
    if (sendInProgress || !editable) return false;

    const originalText = getEditableText(editable).trim();
    if (!shouldProcess(originalText)) return false;

    sendInProgress = true;
    clearTimers();
    showToast("Đang dịch trước khi gửi...");

    try {
      const preview = currentPreview?.original === originalText && currentPreview?.result
        ? currentPreview
        : await requestTransform(originalText, "send", editable);

      if (!preview?.result) {
        showToast("Dịch lỗi, chưa gửi tin nhắn.");
        return false;
      }

      suppressTransformUntil = Date.now() + 700;
      setEditableText(editable, preview.result);
      await waitForEditableCommit(editable, preview.result);
      clearTimers();
      hidePreview();

      const control = sendControl?.isConnected ? sendControl : findLikelySendButton(editable);
      if (control) {
        bypassNextSendClick = true;
        control.click();
        showToast("Đã gửi bản dịch.");
        return true;
      }

      const form = editable.closest("form");
      if (form?.requestSubmit) {
        form.requestSubmit();
        showToast("Đã gửi bản dịch.");
        return true;
      }

      showToast(source === "enter"
        ? "Đã thay bằng bản dịch. Bấm Enter thêm lần nữa để gửi."
        : "Đã thay bằng bản dịch nhưng chưa tìm thấy nút gửi.");
      return false;
    } finally {
      window.setTimeout(() => { sendInProgress = false; }, 120);
    }
  }

  function waitForEditableCommit(editable, expectedText) {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.setTimeout(() => {
            if (getEditableText(editable).trim() !== String(expectedText).trim()) {
              setEditableText(editable, expectedText);
            }
            resolve();
          }, 40);
        });
      });
    });
  }

  function scheduleTransform(reason) {
    if (!settings?.enabled || !activeEl || !settings.livePreview) return;
    if (isComposing || Date.now() < suppressTransformUntil) return;

    clearTimeout(debounceTimer);
    clearTimeout(typingDelayTimer);
    clearTimeout(autoReplaceTimer);

    const text = getEditableText(activeEl).trim();
    if (!shouldProcess(text)) {
      hidePreview();
      return;
    }

    typingDelayTimer = window.setTimeout(() => {
      const latest = activeEl ? getEditableText(activeEl).trim() : "";
      if (latest === text && shouldProcess(latest) && isEditorActive(activeEl)) {
        renderTypingIndicator();
      }
    }, 220);

    debounceTimer = window.setTimeout(async () => {
      const preview = await requestTransform(text, reason);
      if (preview && settings.autoMode === "autoReplace") {
        const delay = 450;
        autoReplaceTimer = window.setTimeout(() => {
          const latest = getEditableText(activeEl).trim();
          if (latest === preview.original && isEditorActive(activeEl)) {
            applyPreview("autoReplace");
          }
        }, delay);
      }
    }, Number(settings.debounceMs || 700));
  }

  function requestTransform(text, reason, sourceEl = activeEl) {
    const originalAtRequest = text;
    const seq = ++requestSeq;
    if (sourceEl && !activeEl) activeEl = sourceEl;
    renderTypingIndicator();

    return new Promise((resolve) => {
      streamTransform({
        text: originalAtRequest,
        mode: settings.mode,
        tone: settings.tone,
        targetLanguage: settings.targetLanguage,
        origin: getPageOrigin(),
        contextHint: getContextHint()
      }, (chunk) => {
        if (seq !== requestSeq) return;

        const validationEl = sourceEl?.isConnected ? sourceEl : activeEl;
        const latest = validationEl ? getEditableText(validationEl).trim() : "";
        if (
          !validationEl ||
          normalizeEditableText(latest) !== normalizeEditableText(originalAtRequest) ||
          !shouldProcess(latest)
        ) {
          hidePreview();
          return;
        }

        renderPreview({
          original: originalAtRequest,
          result: chunk.result,
          backTranslation: chunk.backTranslation,
          warnings: chunk.warnings,
          tone: chunk.tone,
          status: "Preview"
        });
      }, (finalData) => {
        if (seq !== requestSeq) {
          resolve(null);
          return;
        }

        const validationEl = sourceEl?.isConnected ? sourceEl : activeEl;
        const latest = validationEl ? getEditableText(validationEl).trim() : "";
        if (
          !validationEl ||
          normalizeEditableText(latest) !== normalizeEditableText(originalAtRequest) ||
          !shouldProcess(latest)
        ) {
          hidePreview();
          resolve(null);
          return;
        }

        const preview = {
          original: originalAtRequest,
          result: finalData.result,
          backTranslation: finalData.backTranslation,
          warnings: finalData.warnings,
          tone: finalData.tone,
          status: finalData.demo ? "Demo" : reason === "send" ? "Ready to send" : "Preview",
          fullRebuild: true
        };

        currentPreview = preview;
        renderPreview(preview);
        resolve(preview);
      }, (error) => {
        if (seq !== requestSeq) {
          resolve(null);
          return;
        }

        renderPreview({
          original: originalAtRequest,
          result: error,
          backTranslation: "",
          warnings: [],
          status: "Error",
          fullRebuild: true
        });
        resolve(null);
      });
    });
  }

  function handlePreviewMouseDown(event) {
    const target = event.target instanceof Element ? event.target : null;
    const isInteractive = Boolean(target?.closest("input, select, textarea, option, button, [contenteditable='true']"));
    const isSelectableText = Boolean(target?.closest(".ib-result, .ib-back, .ib-warning"));

    previewInteractionUntil = Date.now() + 1200;
    event.stopPropagation();
    if (!isInteractive && !isSelectableText) event.preventDefault();
  }

  function renderTypingIndicator() {
    if (!activeEl) return;
    if (!previewEl) {
      previewEl = document.createElement("div");
      previewEl.className = "ib-preview-card";
      previewEl.addEventListener("mousedown", handlePreviewMouseDown);
      document.documentElement.appendChild(previewEl);
    }

    previewEl.className = "ib-preview-card ib-typing-card";
    previewEl.innerHTML = `
      <div class="ib-typing-row" aria-label="InputBridge đang xử lý">
        <span class="ib-typing-label">Đang xử lý</span>
        <span class="ib-typing-dots" aria-hidden="true">
          <i></i><i></i><i></i>
        </span>
      </div>
    `;
    previewEl.style.display = "block";
    positionPreview();
  }

  function renderPreview(preview, compact = false) {
    if (!activeEl) return;
    if (preview?.status === "Thinking" || preview?.result === "Đang xử lý...") {
      renderTypingIndicator();
      return;
    }
    if (!preview?.result) {
      hidePreview();
      return;
    }

    const isIncremental = previewEl && previewEl.style.display !== "none" && !preview.fullRebuild;
    if (isIncremental) {
      const resultEl = previewEl.querySelector(".ib-result");
      if (resultEl) {
        resultEl.textContent = preview.result || "";
      }
      const backEl = previewEl.querySelector(".ib-back");
      if (backEl) {
        if (preview.backTranslation) {
          backEl.innerHTML = `<b>Nghĩa ngược:</b> ${escapeHtml(preview.backTranslation)}`;
          backEl.style.display = "block";
        } else {
          backEl.style.display = "none";
        }
      }

      const resultLength = String(preview.result || "").trim().length;
      const sizeClass = showSettingsPanel
        ? ""
        : resultLength <= 40
          ? "ib-micro"
          : (compact || resultLength <= 110)
            ? "ib-compact"
            : "";

      previewEl.classList.remove("ib-micro", "ib-compact");
      if (sizeClass) previewEl.classList.add(sizeClass);

      positionPreview();
      return;
    }

    if (!previewEl) {
      previewEl = document.createElement("div");
      previewEl.className = "ib-preview-card";
      previewEl.addEventListener("mousedown", handlePreviewMouseDown);
      document.documentElement.appendChild(previewEl);
    }

    const resultLength = String(preview.result || "").trim().length;
    const sizeClass = showSettingsPanel
      ? ""
      : resultLength <= 40
        ? "ib-micro"
        : (compact || resultLength <= 110)
          ? "ib-compact"
          : "";
    previewEl.className = `ib-preview-card ${sizeClass}`;
    const warnings = (preview.warnings || []).slice(0, 2).map(escapeHtml).join(" · ");
    const back = settings?.showBackTranslation && preview.backTranslation && showSettingsPanel
      ? `<div class="ib-back"><b>Nghĩa ngược:</b> ${escapeHtml(preview.backTranslation)}</div>`
      : "";
    const warningText = (warnings && showSettingsPanel)
      ? `<div class="ib-warning">${warnings}</div>`
      : "";

    previewEl.innerHTML = `
      <button class="ib-card-close" data-ib-action="close" type="button" title="Close" aria-label="Close preview">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"></path></svg>
      </button>
      <div class="ib-preview-body" style="padding: 12px 12px 10px;">
        <p class="ib-result">${escapeHtml(preview.result || "")}</p>
        
        <div class="ib-settings-panel" style="display: ${showSettingsPanel ? 'block' : 'none'};">
          <div class="ib-settings-grid">
            <div>
              <span class="ib-settings-label">Mode</span>
              <select id="ib-inline-mode" class="ib-select">
                <option value="translate" ${settings.mode === 'translate' ? 'selected' : ''}>Translate</option>
                <option value="polish" ${settings.mode === 'polish' ? 'selected' : ''}>Polish</option>
                <option value="clarify" ${settings.mode === 'clarify' ? 'selected' : ''}>Clarify</option>
              </select>
            </div>
            <div>
              <span class="ib-settings-label">Tone</span>
              <select id="ib-inline-tone" class="ib-select">
                <option value="natural" ${settings.tone === 'natural' ? 'selected' : ''}>Natural</option>
                <option value="casual" ${settings.tone === 'casual' ? 'selected' : ''}>Casual</option>
                <option value="neutral" ${settings.tone === 'neutral' ? 'selected' : ''}>Neutral</option>
                <option value="professional" ${settings.tone === 'professional' ? 'selected' : ''}>Professional</option>
                <option value="polite" ${settings.tone === 'polite' ? 'selected' : ''}>Polite</option>
                <option value="direct" ${settings.tone === 'direct' ? 'selected' : ''}>Direct</option>
              </select>
            </div>
          </div>
          <div class="ib-settings-row">
            <div>
              <span class="ib-settings-label">Target Language</span>
              <select id="ib-inline-lang" class="ib-select">
                ${renderLanguageOptions(settings.targetLanguage)}
              </select>
            </div>
            <div>
              <span class="ib-settings-label">Apply Behavior</span>
              <select id="ib-inline-auto-mode" class="ib-select">
                <option value="preview" ${settings.autoMode === 'preview' ? 'selected' : ''}>Manual Apply (default)</option>
                <option value="autoReplace" ${settings.autoMode === 'autoReplace' ? 'selected' : ''}>Auto Apply</option>
                <option value="autoOnSend" ${settings.autoMode === 'autoOnSend' ? 'selected' : ''}>Auto on Send</option>
              </select>
            </div>
          </div>
        </div>

        ${back}
        ${warningText}
      </div>
      <div class="ib-actions">
        <button class="ib-btn ib-btn-primary ib-apply-btn" data-ib-action="apply" type="button">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"></path></svg>
          <span>Apply</span>
        </button>
        <button class="ib-icon-btn ib-copy-btn" data-ib-action="copy" type="button" title="Copy" aria-label="Copy translation">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"></path></svg>
        </button>
        <button class="ib-icon-btn ${showSettingsPanel ? 'ib-active' : ''}" data-ib-action="settings" title="Quick Settings" aria-label="Quick settings" style="margin-left: auto; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; opacity: 0.75; transition: opacity 0.15s, transform 0.25s;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="${showSettingsPanel ? 'transform: rotate(45deg); opacity: 1; color: var(--ib-accent);' : ''}"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        </button>
      </div>
    `;

    upgradeInlineSelects(previewEl);

    previewEl.querySelector('[data-ib-action="apply"]')?.addEventListener("click", () => applyPreview("button"));
    previewEl.querySelector('[data-ib-action="copy"]')?.addEventListener("click", () => copyPreview());
    previewEl.querySelector('[data-ib-action="close"]')?.addEventListener("click", () => hidePreview());

    previewEl.querySelector('[data-ib-action="settings"]')?.addEventListener("click", () => {
      previewInteractionUntil = Date.now() + 800;
      showSettingsPanel = !showSettingsPanel;
      renderPreview(preview, compact);
    });

    const handleInlineSettingsChange = async () => {
      const modeVal = previewEl.querySelector('#ib-inline-mode')?.value;
      const toneVal = previewEl.querySelector('#ib-inline-tone')?.value;
      const langVal = previewEl.querySelector('#ib-inline-lang')?.value || '';

      settings.mode = modeVal;
      settings.tone = toneVal;
      settings.targetLanguage = langVal;

      await saveSyncSettings({
        mode: modeVal,
        tone: toneVal,
        targetLanguage: langVal
      });

      const text = activeEl ? getEditableText(activeEl).trim() : "";
      if (shouldProcess(text)) {
        await requestTransform(text, "inline-settings");
      }
    };

    const handleInlineAutoModeChange = async (event) => {
      const nextAutoMode = ["preview", "autoReplace", "autoOnSend"].includes(event.target.value)
        ? event.target.value
        : "preview";
      settings.autoMode = nextAutoMode;
      await saveSyncSettings({ autoMode: nextAutoMode });
      if (nextAutoMode === "autoReplace" && currentPreview?.result) {
        applyPreview("autoReplace-setting");
        return;
      }
      showToast(nextAutoMode === "autoOnSend"
        ? "Đã bật tự động dịch khi gửi."
        : "Đã chuyển sang bấm Apply thủ công.");
    };

    previewEl.querySelector('#ib-inline-mode')?.addEventListener("change", handleInlineSettingsChange);
    previewEl.querySelector('#ib-inline-tone')?.addEventListener("change", handleInlineSettingsChange);
    previewEl.querySelector('#ib-inline-lang')?.addEventListener("change", handleInlineSettingsChange);
    previewEl.querySelector('#ib-inline-auto-mode')?.addEventListener("change", handleInlineAutoModeChange);

    previewEl.style.display = "block";
    positionPreview();
  }

  function upgradeInlineSelects(root) {
    if (!inlineSelectOwners.has(root)) {
      inlineSelectOwners.add(root);

      root.addEventListener("pointerdown", (event) => {
        const target = event.target instanceof Node ? event.target : null;
        root.querySelectorAll(".ib-custom-select.is-open").forEach((wrapper) => {
          if (target && wrapper.contains(target)) return;
          closeInlineSelect(wrapper, { clearSearch: true });
        });
      }, true);

      root.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        const openSelects = [...root.querySelectorAll(".ib-custom-select.is-open")];
        if (!openSelects.length) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        openSelects.forEach((wrapper, index) => {
          closeInlineSelect(wrapper, { clearSearch: true, focusTrigger: index === 0 });
        });
      }, true);
    }

    root.querySelectorAll("select.ib-select").forEach((select) => {
      select.classList.add("ib-native-select-source");
      select.hidden = true;
      select.tabIndex = -1;
      select.setAttribute("aria-hidden", "true");

      const wrapper = document.createElement("div");
      wrapper.className = "ib-custom-select";
      if (select.classList.contains("ib-selection-toolbar-lang")) {
        wrapper.classList.add("ib-selection-language-dropdown");
      }

      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "ib-custom-select-trigger";
      trigger.setAttribute("role", "combobox");
      trigger.setAttribute("aria-haspopup", "listbox");
      trigger.setAttribute("aria-expanded", "false");

      const value = document.createElement("span");
      value.className = "ib-custom-select-value";

      const chevron = document.createElement("span");
      chevron.className = "ib-custom-select-chevron";
      chevron.setAttribute("aria-hidden", "true");

      const menu = document.createElement("div");
      menu.className = "ib-custom-select-menu";
      menu.setAttribute("role", "listbox");

      const searchable = select.options.length > 24;
      let searchInput = null;
      if (searchable) {
        wrapper.classList.add("is-searchable");
        const searchWrap = document.createElement("div");
        searchWrap.className = "ib-custom-select-search-wrap";
        searchInput = document.createElement("input");
        searchInput.type = "search";
        searchInput.className = "ib-custom-select-search";
        searchInput.placeholder = "Search language...";
        searchInput.setAttribute("aria-label", "Search languages");
        searchInput.addEventListener("pointerdown", (event) => event.stopPropagation());
        searchInput.addEventListener("click", (event) => event.stopPropagation());
        searchWrap.appendChild(searchInput);
        menu.appendChild(searchWrap);
      }

      menu.addEventListener("wheel", (event) => {
        if (!wrapper.classList.contains("is-open")) return;

        let delta = event.deltaY;
        if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= 24;
        else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) delta *= Math.max(80, menu.clientHeight);

        const maxScrollTop = Math.max(0, menu.scrollHeight - menu.clientHeight);
        menu.scrollTop = Math.max(0, Math.min(maxScrollTop, menu.scrollTop + delta));
        event.preventDefault();
        event.stopPropagation();
      }, { passive: false });

      const update = () => {
        const selected = select.selectedOptions?.[0];
        value.textContent = selected?.textContent || "";
        menu.querySelectorAll(".ib-custom-select-option").forEach((item) => {
          const isSelected = item.dataset.value === select.value;
          item.classList.toggle("is-selected", isSelected);
          item.setAttribute("aria-selected", String(isSelected));
        });
      };

      for (const option of select.options) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "ib-custom-select-option";
        item.dataset.value = option.value;
        item.dataset.search = normalizeLanguageSearch(`${option.textContent} ${option.value}`);
        item.textContent = option.textContent;
        item.setAttribute("role", "option");
        item.addEventListener("click", (event) => {
          previewInteractionUntil = Date.now() + 1200;
          event.preventDefault();
          event.stopPropagation();
          select.value = option.value;
          update();
          closeInlineSelect(wrapper, { clearSearch: true });
          select.dispatchEvent(new Event("change", { bubbles: true }));
        });
        menu.appendChild(item);
      }

      if (searchInput) {
        searchInput.addEventListener("input", () => {
          filterCustomSelectOptions(menu, searchInput.value);
          menu.scrollTop = 0;
        });
      }

      trigger.append(value, chevron);
      wrapper.append(trigger, menu);
      select.insertAdjacentElement("afterend", wrapper);

      trigger.addEventListener("click", (event) => {
        previewInteractionUntil = Date.now() + 1200;
        event.preventDefault();
        event.stopPropagation();
        const willOpen = !wrapper.classList.contains("is-open");
        root.querySelectorAll(".ib-custom-select.is-open").forEach((other) => {
          if (other !== wrapper) closeInlineSelect(other, { clearSearch: true });
        });
        wrapper.classList.toggle("is-open", willOpen);
        trigger.setAttribute("aria-expanded", String(willOpen));

        if (willOpen) {
          if (searchInput) {
            searchInput.value = "";
            filterCustomSelectOptions(menu, "");
          }
          requestAnimationFrame(() => {
            positionInlineSelectMenu(wrapper, menu, true);
            searchInput?.focus({ preventScroll: true });
            if (root === selectionCardEl) positionSelectionUi();
            else positionPreview();
          });
        } else {
          closeInlineSelect(wrapper, { clearSearch: true });
          window.setTimeout(() => {
            if (root === selectionCardEl) positionSelectionUi();
            else positionPreview();
          }, 0);
        }
      });

      update();
    });
  }

  function closeInlineSelect(wrapper, options = {}) {
    if (!wrapper) return;
    const trigger = wrapper.querySelector(".ib-custom-select-trigger");
    const menu = wrapper.querySelector(".ib-custom-select-menu");
    const searchInput = wrapper.querySelector(".ib-custom-select-search");

    wrapper.classList.remove("is-open", "opens-up");
    trigger?.setAttribute("aria-expanded", "false");
    menu?.style.removeProperty("max-height");
    menu?.style.removeProperty("width");
    menu?.style.removeProperty("left");
    menu?.style.removeProperty("right");

    if (options.clearSearch && searchInput) {
      searchInput.value = "";
      filterCustomSelectOptions(menu, "");
      menu.scrollTop = 0;
    }

    if (options.focusTrigger) {
      trigger?.focus({ preventScroll: true });
    }
  }

  function normalizeLanguageSearch(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .trim();
  }

  function filterCustomSelectOptions(menu, query) {
    const normalized = normalizeLanguageSearch(query);
    menu.querySelectorAll(".ib-custom-select-option").forEach((item) => {
      item.classList.toggle("is-filtered-out", Boolean(normalized) && !item.dataset.search.includes(normalized));
    });
  }

  function positionInlineSelectMenu(wrapper, menu, ensureSelectedVisible = false) {
    if (!wrapper?.classList.contains("is-open") || !menu) return;

    const trigger = wrapper.querySelector(".ib-custom-select-trigger");
    if (!trigger) return;

    wrapper.classList.remove("opens-up");
    menu.style.removeProperty("max-height");
    menu.style.removeProperty("width");
    menu.style.removeProperty("left");
    menu.style.removeProperty("right");

    const rect = trigger.getBoundingClientRect();
    const viewportMargin = 12;
    const menuGap = 6;
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - menuGap - viewportMargin);
    const spaceAbove = Math.max(0, rect.top - menuGap - viewportMargin);
    const preferredHeight = Math.min(menu.scrollHeight || 174, 210);
    const shouldOpenUp = spaceBelow < preferredHeight && spaceAbove > spaceBelow;
    const availableSpace = shouldOpenUp ? spaceAbove : spaceBelow;

    wrapper.classList.toggle("opens-up", shouldOpenUp);
    menu.style.maxHeight = `${Math.max(72, Math.min(210, Math.floor(availableSpace)))}px`;

    if (wrapper.classList.contains("ib-selection-language-dropdown")) {
      const menuWidth = Math.min(190, Math.max(156, menu.scrollWidth || 156));
      menu.style.width = `${menuWidth}px`;
      const alignRight = rect.left + menuWidth > window.innerWidth - viewportMargin;
      menu.style.left = alignRight ? "auto" : "0";
      menu.style.right = alignRight ? "0" : "auto";
    }

    if (ensureSelectedVisible) {
      const selected = menu.querySelector(".ib-custom-select-option.is-selected");
      requestAnimationFrame(() => selected?.scrollIntoView({ block: "nearest" }));
    }
  }

  function positionOpenInlineMenus() {
    [previewEl, selectionCardEl].forEach((owner) => {
      owner?.querySelectorAll(".ib-custom-select.is-open").forEach((wrapper) => {
        positionInlineSelectMenu(wrapper, wrapper.querySelector(".ib-custom-select-menu"));
      });
    });
  }

  function applyPreview(source) {
    if (!activeEl || !currentPreview?.result || currentPreview.result === "Đang xử lý...") return;
    const before = getEditableText(activeEl);
    const appliedResult = currentPreview.result;
    suppressTransformUntil = Date.now() + 700;
    setEditableText(activeEl, appliedResult);
    clearTimers();
    requestSeq += 1;
    currentPreview = null;
    lastApplied = { el: activeEl, before, after: appliedResult, source };
    clearTimeout(lastAppliedTimer);
    lastAppliedTimer = window.setTimeout(() => { lastApplied = null; }, 8000);
    hidePreview();
    showToast("Đã thay. Ctrl+Z để hoàn tác.");
  }

  async function copyPreview() {
    if (!currentPreview?.result) return;
    await navigator.clipboard.writeText(currentPreview.result).catch(() => {});
    showToast("Đã copy kết quả.");
  }

  function restoreLastApplied() {
    if (!lastApplied?.el) return;
    suppressTransformUntil = Date.now() + 700;
    setEditableText(lastApplied.el, lastApplied.before);
    lastApplied = null;
    hidePreview();
    showToast("Đã hoàn tác InputBridge.");
  }

  function onSelectionPointerDown(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(".ib-selection-icon, .ib-selection-card, .ib-youtube-subtitle-panel, .ib-youtube-subtitle-button")) {
      selectionInteractionUntil = Date.now() + 1000;
      return;
    }

    clearTimeout(selectionTimer);
    clearTimeout(selectionValidationTimer);
    selectionRequestSeq += 1;
    selectionState = null;
    hideSelectionIcon();
    hideSelectionCard();
  }

  function onSelectionPointerUp(event, root) {
    if (!settings?.enabled || !settings.selectionTranslation) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(".ib-selection-icon, .ib-selection-card, .ib-youtube-subtitle-panel, .ib-youtube-subtitle-button")) return;

    const pointerPoint = Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
      ? { x: event.clientX, y: event.clientY }
      : null;
    const forceTranslate = Boolean(settings.selectionShiftTranslate && event.shiftKey);
    const pointerType = String(event.pointerType || "mouse");

    window.setTimeout(() => handleSelectionCandidate(root, target, {
      forceTranslate,
      pointerPoint,
      pointerType
    }), 0);
  }

  function onSelectionKeyUp(event, root) {
    if (!settings?.enabled || !settings.selectionTranslation) return;
    const key = String(event.key || "");
    const shiftShortcut = Boolean(settings.selectionShiftTranslate && key === "Shift");
    const selectionKey = shiftShortcut ||
      event.shiftKey ||
      key.startsWith("Arrow") ||
      key === "Home" ||
      key === "End" ||
      ((event.ctrlKey || event.metaKey) && key.toLowerCase() === "a");
    if (!selectionKey) return;

    window.setTimeout(() => handleSelectionCandidate(root, event.target, {
      forceTranslate: shiftShortcut,
      keyboard: true,
      deferIcon: Boolean(settings.selectionShiftTranslate && event.shiftKey && key !== "Shift")
    }), 0);
  }

  function onSelectionChange(root) {
    if (!selectionState || selectionCardEl?.style.display === "block") return;
    clearTimeout(selectionValidationTimer);
    selectionValidationTimer = window.setTimeout(() => {
      if (Date.now() < selectionInteractionUntil) return;
      const next = getSelectionSnapshot(root, null);
      if (!next || next.text !== selectionState.text) {
        selectionState = null;
        hideSelectionIcon();
        return;
      }
      selectionState = { ...selectionState, ...next };
      positionSelectionUi();
    }, 40);
  }

  function handleSelectionCandidate(root, target, options = {}) {
    const snapshot = getSelectionSnapshot(root, target);
    if (!snapshot) {
      if (selectionCardEl?.style.display !== "block") {
        selectionState = null;
        hideSelectionIcon();
      }
      return;
    }

    selectionState = {
      ...snapshot,
      pointerPoint: options.pointerPoint || null,
      pointerType: options.pointerType || "keyboard"
    };
    selectionRequestSeq += 1;
    selectionSettingsOpen = false;
    selectionExplanation = "";
    selectionExplanationLoading = false;
    selectionExplanationError = "";
    selectionIsFavorite = false;
    selectionCardPlacement = "";
    if (selectionCardEl) delete selectionCardEl.dataset.placement;
    clearTimeout(selectionTimer);
    hideSelectionCard();
    hideSelectionIcon();

    if (options.forceTranslate) {
      selectionTimer = window.setTimeout(() => {
        if (selectionState?.text === snapshot.text) void translateSelectedText();
      }, 70);
      return;
    }

    if (settings.selectionTrigger === "instant") {
      selectionTimer = window.setTimeout(() => {
        if (selectionState?.text === snapshot.text) void translateSelectedText();
      }, 280);
      return;
    }

    const iconDelay = options.deferIcon
      ? 180
      : options.pointerType === "touch"
        ? 100
        : 10;
    selectionTimer = window.setTimeout(() => {
      if (selectionState?.text !== snapshot.text) return;
      if (selectionCardEl?.style.display === "block") return;
      showSelectionIcon();
    }, iconDelay);
  }

  function getSelectionSnapshot(root, target) {
    if (!settings?.enabled || !settings.selectionTranslation) return null;
    const targetEl = target instanceof Element ? target : null;
    if (targetEl?.closest(".ib-preview-card, .ib-toast, .ib-selection-icon, .ib-selection-card, .ib-youtube-subtitle-panel, .ib-youtube-subtitle-button")) return null;

    const editable = findEditable(targetEl);
    if (editable && !settings.selectionAllowEditable) return null;

    const tag = editable?.tagName?.toLowerCase();
    if (editable && (tag === "input" || tag === "textarea")) {
      const start = Number(editable.selectionStart ?? 0);
      const end = Number(editable.selectionEnd ?? 0);
      if (end <= start) return null;
      const text = normalizeSelectionText((editable.value || "").slice(start, end));
      if (!isSelectionTextValid(text)) return null;
      const rect = editable.getBoundingClientRect();
      if (!rect.width && !rect.height) return null;
      const editableRect = copyRect(rect);
      return {
        text,
        root,
        sourceEl: editable,
        range: null,
        anchorRect: editableRect,
        selectionBounds: editableRect,
        selectionRects: [editableRect],
        isEditable: true
      };
    }

    const selection = getSelectionForRoot(root);
    if (!selection || selection.isCollapsed || selection.rangeCount < 1) return null;
    const text = normalizeSelectionText(selection.toString());
    if (!isSelectionTextValid(text)) return null;

    const range = selection.getRangeAt(0).cloneRange();
    const common = range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer?.parentElement;
    if (common?.closest?.(".ib-preview-card, .ib-toast, .ib-selection-icon, .ib-selection-card, .ib-youtube-subtitle-panel, .ib-youtube-subtitle-button")) return null;
    const rangeEditable = findEditable(common);
    if (rangeEditable && !settings.selectionAllowEditable) return null;

    const geometry = getSelectionGeometry(range);
    if (!geometry) return null;
    return {
      text,
      root,
      sourceEl: rangeEditable || common || null,
      range,
      ...geometry,
      isEditable: Boolean(rangeEditable)
    };
  }

  function getSelectionForRoot(root) {
    try {
      if (root instanceof ShadowRoot && typeof root.getSelection === "function") {
        const shadowSelection = root.getSelection();
        if (shadowSelection?.rangeCount) return shadowSelection;
      }
    } catch {}
    return window.getSelection?.() || document.getSelection?.() || null;
  }

  function getSelectionGeometry(range) {
    try {
      let rects = Array.from(range.getClientRects())
        .filter((rect) => rect.width || rect.height)
        .map(copyRect);

      if (!rects.length) {
        const fallback = range.getBoundingClientRect();
        if (fallback?.width || fallback?.height) rects = [copyRect(fallback)];
      }
      if (!rects.length) return null;

      const bounds = rects.reduce((acc, rect) => ({
        left: Math.min(acc.left, rect.left),
        top: Math.min(acc.top, rect.top),
        right: Math.max(acc.right, rect.right),
        bottom: Math.max(acc.bottom, rect.bottom),
        width: 0,
        height: 0
      }), {
        left: rects[0].left,
        top: rects[0].top,
        right: rects[0].right,
        bottom: rects[0].bottom,
        width: 0,
        height: 0
      });
      bounds.width = Math.max(0, bounds.right - bounds.left);
      bounds.height = Math.max(0, bounds.bottom - bounds.top);

      return {
        anchorRect: rects.at(-1),
        selectionBounds: bounds,
        selectionRects: rects
      };
    } catch {
      return null;
    }
  }

  function getSelectionRangeRect(range) {
    return getSelectionGeometry(range)?.anchorRect || null;
  }

  function copyRect(rect) {
    return {
      left: Number(rect.left || 0),
      top: Number(rect.top || 0),
      right: Number(rect.right || 0),
      bottom: Number(rect.bottom || 0),
      width: Number(rect.width || 0),
      height: Number(rect.height || 0)
    };
  }

  function normalizeSelectionText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[\u200b-\u200d\ufeff]/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function isSelectionTextValid(text) {
    if (!text || !/[\p{L}\p{N}]/u.test(text)) return false;
    const min = Math.max(1, Number(settings.selectionMinChars || 2));
    const max = Math.max(min, Number(settings.selectionMaxChars || 20000));
    return text.length >= min && text.length <= max;
  }

  function showSelectionIcon() {
    if (!selectionState) return;
    if (!selectionIconEl) {
      selectionIconEl = document.createElement("button");
      selectionIconEl.type = "button";
      selectionIconEl.className = "ib-selection-icon";
      selectionIconEl.setAttribute("aria-label", "Translate selected text");
      selectionIconEl.innerHTML = `<span aria-hidden="true">A文</span>`;
      selectionIconEl.addEventListener("pointerdown", (event) => {
        selectionInteractionUntil = Date.now() + 1000;
        event.preventDefault();
        event.stopPropagation();
      });
      selectionIconEl.addEventListener("click", (event) => {
        selectionInteractionUntil = Date.now() + 1000;
        event.preventDefault();
        event.stopPropagation();
        void translateSelectedText();
      });
      document.documentElement.appendChild(selectionIconEl);
    }
    const shortcutHint = settings.selectionShiftTranslate ? "Click to translate · Hold Shift for instant" : "Click to translate";
    selectionIconEl.title = shortcutHint;
    selectionIconEl.dataset.hint = shortcutHint;
    selectionIconEl.style.display = "flex";
    positionSelectionUi();
  }

  async function translateSelectedText() {
    const state = selectionState;
    if (!state?.text) return;

    clearTimeout(selectionTimer);
    hideSelectionIcon();
    const seq = ++selectionRequestSeq;
    renderSelectionCard({ loading: true });

    const response = await sendMessage({
      type: "IB_TRANSLATE_SELECTION",
      text: state.text,
      targetLanguage: settings.targetLanguage,
      fallbackLanguage: settings.backTranslationLanguage || "Vietnamese",
      origin: getPageOrigin(),
      contextHint: getContextHint()
    });

    if (seq !== selectionRequestSeq || selectionState !== state) return;
    if (!response?.ok) {
      renderSelectionCard({ error: response?.error || "Translation failed." });
      return;
    }

    const result = String(response.data?.result || "").trim();
    selectionState = {
      ...state,
      result,
      targetLanguage: response.data?.targetLanguage || settings.targetLanguage,
      detectedSourceLanguage: response.data?.detectedSourceLanguage || "",
      detectedSourceCode: response.data?.detectedSourceCode || "",
      dictionaryMode: Boolean(response.data?.dictionaryMode),
      dictionary: Array.isArray(response.data?.dictionary) ? response.data.dictionary : [],
      phonetic: String(response.data?.phonetic || "").trim(),
      headword: String(response.data?.headword || state.text || "").trim()
    };
    renderSelectionCard({ result });
  }

  function renderSelectionCard({ loading = false, result = "", error = "" } = {}) {
    if (!selectionState) return;
    if (!selectionCardEl) {
      selectionCardEl = document.createElement("div");
      selectionCardEl.className = "ib-selection-card";
      selectionCardEl.addEventListener("pointerdown", (event) => {
        selectionInteractionUntil = Date.now() + 1400;
        event.stopPropagation();
        if (event.target instanceof Element && event.target.closest("button")) event.preventDefault();
      });
      document.documentElement.appendChild(selectionCardEl);
    }

    const displayResult = error || result || selectionState.result || "";
    const resultLength = displayResult.length;
    const themeClass = settings.selectionCardTheme === "dark" ? "ib-selection-dark" : "";
    const dictionaryMode = !loading && !error && Boolean(selectionState.dictionaryMode) && Array.isArray(selectionState.dictionary) && selectionState.dictionary.length > 0;
    const expanded = selectionSettingsOpen || selectionExplanation || selectionExplanationLoading || selectionExplanationError;
    const sizeClass = expanded
      ? "ib-selection-expanded"
      : dictionaryMode
        ? "ib-selection-dictionary"
        : resultLength <= 56
          ? "ib-selection-micro"
          : resultLength <= 190
            ? "ib-selection-compact"
            : "";
    const explanationMarkup = selectionExplanationLoading
      ? `<div class="ib-selection-explanation is-loading"><span class="ib-selection-loading"><i></i><i></i><i></i></span></div>`
      : selectionExplanationError
        ? `<div class="ib-selection-explanation is-error">${escapeHtml(selectionExplanationError)}</div>`
        : selectionExplanation
          ? `<div class="ib-selection-explanation"><span>AI explanation</span>${escapeHtml(selectionExplanation)}</div>`
          : "";
    const settingsMarkup = selectionSettingsOpen
      ? `<div class="ib-selection-settings">
          <label><span>Translate to</span><select id="ib-selection-lang" class="ib-select">${renderLanguageOptions(selectionState.targetLanguage || settings.targetLanguage)}</select></label>
          <label><span>Trigger</span><select id="ib-selection-trigger" class="ib-select">
            <option value="icon" ${settings.selectionTrigger === "icon" ? "selected" : ""}>Click icon</option>
            <option value="instant" ${settings.selectionTrigger === "instant" ? "selected" : ""}>Instant</option>
          </select></label>
          <label class="ib-selection-check"><input id="ib-selection-shift" type="checkbox" ${settings.selectionShiftTranslate ? "checked" : ""}> Hold Shift to translate immediately</label>
          <label class="ib-selection-check"><input id="ib-selection-editable" type="checkbox" ${settings.selectionAllowEditable ? "checked" : ""}> Allow inside editable fields</label>
          <div class="ib-selection-settings-actions">
            <button type="button" data-ib-selection-action="favorite" class="${selectionIsFavorite ? "is-active" : ""}">
              <svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"></path></svg>
              ${selectionIsFavorite ? "Saved" : "Save"}
            </button>
            <button type="button" data-ib-selection-action="theme">
              <svg viewBox="0 0 24 24"><path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"></path></svg>
              ${settings.selectionCardTheme === "dark" ? "Light" : "Dark"}
            </button>
          </div>
        </div>`
      : "";

    const dictionaryMarkup = dictionaryMode ? renderSelectionDictionary(displayResult) : "";

    selectionCardEl.className = `ib-selection-card ${sizeClass} ${themeClass}`.trim();
    selectionCardEl.innerHTML = `
      <div class="ib-selection-toolbar">
        <select id="ib-selection-toolbar-lang" class="ib-select ib-selection-toolbar-lang" aria-label="Translate to language">
          ${renderLanguageOptions(selectionState.targetLanguage || settings.targetLanguage || "English")}
        </select>
        <div class="ib-selection-tools">
          <button type="button" data-ib-selection-action="speak" title="Listen" aria-label="Listen to translation">
            <svg viewBox="0 0 24 24"><path d="M11 5 6.5 9H3v6h3.5L11 19V5Z"></path><path d="M15 9.5a4 4 0 0 1 0 5M17.8 7a7.5 7.5 0 0 1 0 10"></path></svg>
          </button>
          <button type="button" data-ib-selection-action="ai" class="${selectionExplanation || selectionExplanationLoading ? "is-active" : ""}" title="Explain with AI" aria-label="Explain with AI">
            <svg viewBox="0 0 24 24"><path d="m12 3 1.2 4.1L17 8.5l-3.8 1.4L12 14l-1.2-4.1L7 8.5l3.8-1.4L12 3Z"></path><path d="m18.5 14 .7 2.3 2.3.7-2.3.8-.7 2.2-.8-2.2-2.2-.8 2.2-.7.8-2.3Z"></path></svg>
          </button>
          <button class="ib-selection-copy" type="button" data-ib-selection-action="copy" title="Copy translation" aria-label="Copy translation" ${loading || error || !displayResult ? "disabled" : ""}>
            <svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
          <button type="button" data-ib-selection-action="settings" class="${selectionSettingsOpen ? "is-active" : ""}" title="Quick settings" aria-label="Quick settings">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1-2.9 2.9-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1-2.9-2.9.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3v-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1 2.9-2.9.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.5V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1 2.9 2.9-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z"></path></svg>
          </button>
          <button class="ib-selection-close" type="button" data-ib-selection-action="close" title="Close" aria-label="Close translation">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"></path></svg>
          </button>
        </div>
      </div>
      <div class="ib-selection-body">
        ${dictionaryMode
          ? dictionaryMarkup
          : `<div class="ib-selection-result ${error ? "is-error" : ""}">${loading
              ? `<span class="ib-selection-loading"><i></i><i></i><i></i></span>`
              : escapeHtml(displayResult || "No translation returned.")}</div>`}
        ${explanationMarkup}
        ${settingsMarkup}
      </div>
    `;

    upgradeInlineSelects(selectionCardEl);
    bindSelectionCardActions({ loading, error, result: displayResult });
    selectionCardEl.style.display = "block";
    positionSelectionUi({ preserveCardPlacement: true });
    if (!loading && !error && displayResult) void refreshSelectionFavoriteState();
  }

  function renderSelectionDictionary(primaryMeaning) {
    const phonetic = String(selectionState?.phonetic || "").trim();
    const groups = Array.isArray(selectionState?.dictionary) ? selectionState.dictionary : [];
    const targetLanguage = selectionState?.targetLanguage || settings.targetLanguage || "English";
    const groupMarkup = groups.map((group) => {
      const meanings = Array.isArray(group?.meanings)
        ? [...new Set(group.meanings.map((meaning) => String(meaning || "").trim()).filter(Boolean))].slice(0, 8)
        : [];
      if (!meanings.length) return "";
      return `<section class="ib-dictionary-group">
        <div class="ib-dictionary-pos">${escapeHtml(dictionaryPartOfSpeechLabel(group?.partOfSpeech, targetLanguage))}</div>
        <div class="ib-dictionary-meanings">${meanings.map(escapeHtml).join(", ")}</div>
      </section>`;
    }).join("");

    return `<div class="ib-dictionary-view">
      <div class="ib-dictionary-summary">
        ${phonetic ? `<div class="ib-dictionary-phonetic">/${escapeHtml(phonetic.replace(/^\/+|\/+$/g, ""))}/</div>` : ""}
        <div class="ib-dictionary-primary">${escapeHtml(primaryMeaning || "No translation returned.")}</div>
      </div>
      <div class="ib-dictionary-groups">${groupMarkup}</div>
    </div>`;
  }

  function dictionaryPartOfSpeechLabel(partOfSpeech, targetLanguage) {
    const raw = String(partOfSpeech || "other").trim();
    const key = raw.toLowerCase();
    if (String(targetLanguage || "").toLowerCase().includes("vietnam")) {
      const vi = {
        adjective: "Tính từ",
        adverb: "Trạng từ",
        noun: "Danh từ",
        verb: "Động từ",
        pronoun: "Đại từ",
        preposition: "Giới từ",
        conjunction: "Liên từ",
        interjection: "Thán từ",
        determiner: "Từ hạn định",
        article: "Mạo từ",
        other: "Nghĩa khác"
      };
      return vi[key] || raw;
    }
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "Other";
  }

  function bindSelectionCardActions({ loading, error, result }) {
    selectionCardEl.querySelector('[data-ib-selection-action="close"]')?.addEventListener("click", () => hideSelectionUi());
    selectionCardEl.querySelectorAll('[data-ib-selection-action="copy"]').forEach((button) => button.addEventListener("click", async () => {
      const text = selectionState?.result || result;
      if (!text) return;
      await navigator.clipboard.writeText(text).catch(() => {});
      showToast("Đã copy bản dịch.");
    }));
    selectionCardEl.querySelector('[data-ib-selection-action="speak"]')?.addEventListener("click", speakSelectionTranslation);
    selectionCardEl.querySelectorAll('[data-ib-selection-action="ai"]').forEach((button) => button.addEventListener("click", toggleSelectionExplanation));
    selectionCardEl.querySelector('[data-ib-selection-action="favorite"]')?.addEventListener("click", () => void toggleSelectionFavorite());
    selectionCardEl.querySelector('[data-ib-selection-action="theme"]')?.addEventListener("click", () => {
      settings.selectionCardTheme = settings.selectionCardTheme === "dark" ? "light" : "dark";
      void saveSyncSettings({ selectionCardTheme: settings.selectionCardTheme });
      renderSelectionCard({ loading, error, result });
    });
    selectionCardEl.querySelectorAll('[data-ib-selection-action="settings"]').forEach((button) => button.addEventListener("click", () => {
      selectionSettingsOpen = !selectionSettingsOpen;
      renderSelectionCard({ loading, error, result });
    }));

    const languageSelects = selectionCardEl.querySelectorAll('#ib-selection-lang, #ib-selection-toolbar-lang');
    const triggerSelect = selectionCardEl.querySelector('#ib-selection-trigger');
    const shiftCheck = selectionCardEl.querySelector('#ib-selection-shift');
    const editableCheck = selectionCardEl.querySelector('#ib-selection-editable');
    languageSelects.forEach((languageSelect) => languageSelect.addEventListener("change", async () => {
      const nextLanguage = languageSelect.value || settings.targetLanguage;
      settings.targetLanguage = nextLanguage;
      if (selectionState) selectionState.targetLanguage = nextLanguage;
      await saveSyncSettings({ targetLanguage: nextLanguage });
      void translateSelectedText();
    }));
    triggerSelect?.addEventListener("change", () => {
      settings.selectionTrigger = triggerSelect.value;
      void saveSyncSettings({ selectionTrigger: settings.selectionTrigger });
    });
    shiftCheck?.addEventListener("change", () => {
      settings.selectionShiftTranslate = shiftCheck.checked;
      void saveSyncSettings({ selectionShiftTranslate: settings.selectionShiftTranslate });
    });
    editableCheck?.addEventListener("change", () => {
      settings.selectionAllowEditable = editableCheck.checked;
      void saveSyncSettings({ selectionAllowEditable: settings.selectionAllowEditable });
    });
  }

  function speakSelectionTranslation() {
    const dictionaryMode = Boolean(selectionState?.dictionaryMode);
    const text = dictionaryMode ? selectionState?.text : selectionState?.result;
    if (!text || !("speechSynthesis" in window)) {
      showToast("Trình duyệt này không hỗ trợ đọc văn bản.");
      return;
    }
    if (videoDubbingUtterance) stopVideoDubbing(false);
    else window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const speechLanguage = dictionaryMode
      ? selectionState?.detectedSourceLanguage || selectionState?.detectedSourceCode
      : selectionState?.targetLanguage || settings.targetLanguage;
    utterance.lang = selectionSpeechLanguage(speechLanguage);
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  }

  function selectionSpeechLanguage(language) {
    const code = LANGUAGE_CATALOG?.codeFor(language, "en") || "en";
    const regionalDefaults = {
      en: "en-US",
      vi: "vi-VN",
      ja: "ja-JP",
      ko: "ko-KR",
      fr: "fr-FR",
      de: "de-DE",
      es: "es-ES",
      pt: "pt-BR",
      ar: "ar-SA",
      hi: "hi-IN",
      zh: "zh-CN"
    };
    return regionalDefaults[String(code).toLowerCase()] || code;
  }

  function toggleSelectionExplanation() {
    if (selectionExplanationLoading) return;
    if (selectionExplanation || selectionExplanationError) {
      selectionExplanation = "";
      selectionExplanationError = "";
      renderSelectionCard({ result: selectionState?.result || "" });
      return;
    }
    void explainSelectionWithAi();
  }

  async function explainSelectionWithAi() {
    if (!selectionState?.text || selectionExplanationLoading) return;
    selectionExplanationLoading = true;
    selectionExplanationError = "";
    renderSelectionCard({ result: selectionState.result || "" });
    const state = selectionState;
    const response = await sendMessage({
      type: "IB_EXPLAIN_SELECTION",
      text: state.text,
      translation: state.result || "",
      explainLanguage: settings.backTranslationLanguage || "Vietnamese",
      origin: getPageOrigin(),
      contextHint: getContextHint()
    });
    if (selectionState !== state) return;
    selectionExplanationLoading = false;
    if (!response?.ok) {
      selectionExplanationError = response?.error || "AI explanation failed.";
    } else {
      selectionExplanation = String(response.data?.result || "").trim();
      selectionExplanationError = "";
    }
    renderSelectionCard({ result: state.result || "" });
  }

  function selectionFavoriteKey() {
    return `${selectionState?.text || ""}\u0000${selectionState?.targetLanguage || settings.targetLanguage || "English"}`;
  }

  async function refreshSelectionFavoriteState() {
    if (!chrome.storage?.local || !selectionState) return;
    const state = selectionState;
    const key = selectionFavoriteKey();
    const stored = await chrome.storage.local.get("selectionFavorites").catch(() => ({}));
    if (selectionState !== state) return;
    const favorites = Array.isArray(stored.selectionFavorites) ? stored.selectionFavorites : [];
    const next = favorites.some((item) => item?.key === key);
    if (next !== selectionIsFavorite) {
      selectionIsFavorite = next;
      renderSelectionCard({ result: state.result || "" });
    }
  }

  async function toggleSelectionFavorite() {
    if (!chrome.storage?.local || !selectionState?.result) return;
    const key = selectionFavoriteKey();
    const stored = await chrome.storage.local.get("selectionFavorites").catch(() => ({}));
    let favorites = Array.isArray(stored.selectionFavorites) ? stored.selectionFavorites : [];
    if (favorites.some((item) => item?.key === key)) {
      favorites = favorites.filter((item) => item?.key !== key);
      selectionIsFavorite = false;
      showToast("Đã bỏ khỏi mục đã lưu.");
    } else {
      favorites = [{ key, source: selectionState.text, result: selectionState.result, language: selectionState.targetLanguage, savedAt: Date.now() }, ...favorites].slice(0, 100);
      selectionIsFavorite = true;
      showToast("Đã lưu bản dịch.");
    }
    await chrome.storage.local.set({ selectionFavorites: favorites }).catch(() => {});
    renderSelectionCard({ result: selectionState.result || "" });
  }

  function refreshSelectionRect() {
    if (!selectionState) return null;
    if (selectionState.range) {
      const geometry = getSelectionGeometry(selectionState.range);
      if (geometry) Object.assign(selectionState, geometry);
    } else if (selectionState.sourceEl?.isConnected) {
      const sourceRect = copyRect(selectionState.sourceEl.getBoundingClientRect());
      selectionState.anchorRect = sourceRect;
      selectionState.selectionBounds = sourceRect;
      selectionState.selectionRects = [sourceRect];
    }
    return selectionState.selectionBounds || selectionState.anchorRect || null;
  }

  function positionSelectionUi(options = {}) {
    if (!selectionState) return;
    const bounds = refreshSelectionRect();
    if (!bounds) return;

    const anchor = selectionState.anchorRect || bounds;
    const obstacles = Array.isArray(selectionState.selectionRects) && selectionState.selectionRects.length
      ? selectionState.selectionRects
      : [bounds];
    const outsideViewport = bounds.bottom < -24 || bounds.top > window.innerHeight + 24 || bounds.right < -24 || bounds.left > window.innerWidth + 24;
    if (outsideViewport) {
      hideSelectionUi();
      return;
    }

    const point = selectionState.pointerPoint &&
      Number.isFinite(selectionState.pointerPoint.x) &&
      Number.isFinite(selectionState.pointerPoint.y)
      ? selectionState.pointerPoint
      : { x: anchor.right, y: anchor.bottom };

    if (selectionIconEl?.style.display === "flex") {
      const width = selectionIconEl.offsetWidth || 30;
      const height = selectionIconEl.offsetHeight || 30;
      const gap = 8;
      const candidates = [
        { placement: "pointer-bottom-right", left: point.x + gap, top: point.y + gap },
        { placement: "pointer-bottom-left", left: point.x - width - gap, top: point.y + gap },
        { placement: "pointer-top-right", left: point.x + gap, top: point.y - height - gap },
        { placement: "pointer-top-left", left: point.x - width - gap, top: point.y - height - gap },
        { placement: "selection-right", left: anchor.right + gap, top: anchor.top + (anchor.height - height) / 2 },
        { placement: "selection-left", left: anchor.left - width - gap, top: anchor.top + (anchor.height - height) / 2 },
        { placement: "selection-bottom", left: anchor.right - width, top: anchor.bottom + gap },
        { placement: "selection-top", left: anchor.right - width, top: anchor.top - height - gap }
      ];
      const chosen = chooseOverlayCandidate(candidates, width, height, {
        margin: 10,
        obstacles,
        pointer: point,
        obstaclePadding: 4,
        pointerPadding: 5
      });

      selectionIconEl.classList.toggle("ib-tooltip-left", chosen.left > window.innerWidth / 2);
      selectionIconEl.dataset.placement = chosen.placement;
      selectionIconEl.style.left = `${chosen.left}px`;
      selectionIconEl.style.top = `${chosen.top}px`;
    }

    if (selectionCardEl?.style.display === "block") {
      const width = Math.min(selectionCardEl.offsetWidth || 320, window.innerWidth - 24);
      const height = Math.min(selectionCardEl.offsetHeight || 150, window.innerHeight - 24);
      const gap = 10;
      const centerLeft = bounds.left + (bounds.width - width) / 2;
      const rightAligned = bounds.right - width;
      const verticalCenter = bounds.top + (bounds.height - height) / 2;
      const pointerLeft = point.x - Math.min(width - 24, width * 0.78);
      const candidates = [
        { placement: "bottom-start", left: bounds.left, top: bounds.bottom + gap },
        { placement: "bottom-center", left: centerLeft, top: bounds.bottom + gap },
        { placement: "bottom-end", left: rightAligned, top: bounds.bottom + gap },
        { placement: "top-start", left: bounds.left, top: bounds.top - height - gap },
        { placement: "top-center", left: centerLeft, top: bounds.top - height - gap },
        { placement: "top-end", left: rightAligned, top: bounds.top - height - gap },
        { placement: "right", left: bounds.right + gap, top: verticalCenter },
        { placement: "left", left: bounds.left - width - gap, top: verticalCenter },
        { placement: "pointer-bottom", left: pointerLeft, top: point.y + 14 },
        { placement: "pointer-top", left: pointerLeft, top: point.y - height - 14 }
      ];
      const chosen = chooseOverlayCandidate(candidates, width, height, {
        margin: 12,
        obstacles,
        pointer: point,
        obstaclePadding: 7,
        pointerPadding: 12,
        distanceWeight: 0.018,
        preferredPlacement: options.preserveCardPlacement
          ? selectionCardPlacement || selectionCardEl.dataset.placement || ""
          : ""
      });

      selectionCardPlacement = chosen.placement;
      selectionCardEl.dataset.placement = chosen.placement;
      selectionCardEl.style.left = `${chosen.left}px`;
      selectionCardEl.style.top = `${chosen.top}px`;
    }
  }

  function chooseOverlayCandidate(candidates, width, height, options = {}) {
    const margin = Number(options.margin || 10);
    const obstacles = Array.isArray(options.obstacles) ? options.obstacles : [];
    const pointer = options.pointer || null;
    const obstaclePadding = Number(options.obstaclePadding || 0);
    const pointerPadding = Number(options.pointerPadding || 0);
    const distanceWeight = Number(options.distanceWeight || 0.025);
    const preferredPlacement = String(options.preferredPlacement || "");
    const viewportRight = Math.max(margin, window.innerWidth - width - margin);
    const viewportBottom = Math.max(margin, window.innerHeight - height - margin);

    const scored = candidates.map((candidate, index) => {
      const rawLeft = Number(candidate.left || 0);
      const rawTop = Number(candidate.top || 0);
      const left = Math.min(viewportRight, Math.max(margin, rawLeft));
      const top = Math.min(viewportBottom, Math.max(margin, rawTop));
      const box = { left, top, right: left + width, bottom: top + height, width, height };
      const overflow = Math.abs(left - rawLeft) + Math.abs(top - rawTop);
      let score = index * 6 + overflow * 180;
      if (preferredPlacement && candidate.placement === preferredPlacement) score -= 500;

      for (const obstacle of obstacles) {
        score += overlapArea(box, inflateRect(obstacle, obstaclePadding)) * 120;
      }

      if (pointer) {
        const pointerZone = {
          left: pointer.x - pointerPadding,
          top: pointer.y - pointerPadding,
          right: pointer.x + pointerPadding,
          bottom: pointer.y + pointerPadding,
          width: pointerPadding * 2,
          height: pointerPadding * 2
        };
        score += overlapArea(box, pointerZone) * 260;
        const centerX = left + width / 2;
        const centerY = top + height / 2;
        score += Math.hypot(centerX - pointer.x, centerY - pointer.y) * distanceWeight;
      }

      return { ...candidate, left, top, score };
    });

    scored.sort((first, second) => first.score - second.score);
    return scored[0] || { placement: "fallback", left: margin, top: margin };
  }

  function inflateRect(rect, padding) {
    return {
      left: rect.left - padding,
      top: rect.top - padding,
      right: rect.right + padding,
      bottom: rect.bottom + padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2
    };
  }

  function overlapArea(first, second) {
    const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
    const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
    return width * height;
  }

  function hideSelectionIcon() {
    if (selectionIconEl) selectionIconEl.style.display = "none";
  }

  function hideSelectionCard() {
    if (selectionCardEl) selectionCardEl.style.display = "none";
  }

  function hideSelectionUi() {
    clearTimeout(selectionTimer);
    clearTimeout(selectionValidationTimer);
    selectionRequestSeq += 1;
    selectionState = null;
    selectionSettingsOpen = false;
    selectionExplanation = "";
    selectionExplanationLoading = false;
    selectionExplanationError = "";
    selectionIsFavorite = false;
    selectionCardPlacement = "";
    if (selectionCardEl) delete selectionCardEl.dataset.placement;
    // speechSynthesis.cancel() is global for the page. Do not let closing an
    // unrelated selection card cut an active video-dubbing utterance.
    if (!videoDubbingUtterance) window.speechSynthesis?.cancel?.();
    hideSelectionIcon();
    hideSelectionCard();
  }

  function hidePreview() {
    if (previewEl) {
      previewEl.style.display = "none";
      previewEl.classList.remove("ib-typing-card");
    }
  }

  function clearTimers() {
    clearTimeout(debounceTimer);
    clearTimeout(typingDelayTimer);
    clearTimeout(autoReplaceTimer);
  }

  function onViewportScroll(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest?.(".ib-selection-card")) return;

    clearTimeout(selectionTimer);
    if (selectionIconEl?.style.display === "flex") {
      hideSelectionIcon();
      if (selectionCardEl?.style.display !== "block") selectionState = null;
    }
    repositionAll();
  }

  function repositionAll() {
    if (activeEl && previewEl?.style.display !== "none") {
      positionPreview();
      positionOpenInlineMenus();
    }
    positionSelectionUi();
  }

  function positionPreview() {
    const rect = getElementRect(activeEl);
    if (!rect || !previewEl) return;
    const margin = 8;
    const width = Math.min(previewEl.offsetWidth || 372, window.innerWidth - 24);
    const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.left));
    let top = rect.bottom + margin;
    const estimatedHeight = Math.min(360, previewEl.offsetHeight || 180);
    if (top + estimatedHeight > window.innerHeight - 12) top = Math.max(12, rect.top - estimatedHeight - margin);
    previewEl.style.left = `${left}px`;
    previewEl.style.top = `${top}px`;
  }

  function getElementRect(el) {
    if (!el?.getBoundingClientRect) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width || rect.height) return rect;
    return null;
  }

  function shouldProcess(text) {
    if (!settings?.enabled) return false;
    if (!text) return false;
    if (text.length < Number(settings.minChars || 1)) return false;
    // \w/\W trong JavaScript chủ yếu theo ASCII, nên chữ Việt có dấu bị loại nhầm.
    // Chỉ bỏ qua text không chứa bất kỳ chữ cái hoặc chữ số Unicode nào.
    if (!/[\p{L}\p{N}]/u.test(text)) return false;
    return true;
  }

  function findEditable(node) {
    let el = node instanceof Element ? node : node?.parentElement;

    while (el) {
      const resolved = resolveEditable(el);
      if (resolved) return resolved;

      if (el.parentElement) {
        el = el.parentElement;
        continue;
      }

      const root = el.getRootNode?.();
      el = root instanceof ShadowRoot ? root.host : null;
    }

    return null;
  }

  function resolveEditable(el) {
    if (!(el instanceof HTMLElement)) return null;
    if (el.closest?.('[data-inputbridge-ignore="true"], .ib-preview-card, .ib-floating-icon')) return null;
    if (el.getAttribute("aria-disabled") === "true" || el.getAttribute("aria-readonly") === "true") return null;

    const tag = el.tagName?.toLowerCase();
    if (tag === "textarea") return !el.disabled && !el.readOnly ? el : null;
    if (tag === "input") {
      const type = String(el.getAttribute("type") || "text").toLowerCase();
      return !el.disabled && !el.readOnly && !SKIP_INPUT_TYPES.has(type) ? el : null;
    }

    if (el.isContentEditable) {
      let host = el;
      while (host.parentElement?.isContentEditable) host = host.parentElement;
      return host;
    }

    const role = String(el.getAttribute("role") || "").toLowerCase();
    const ariaMultiline = el.getAttribute("aria-multiline") === "true";
    const frameworkEditor = el.matches?.('[data-lexical-editor="true"], .ProseMirror, .ql-editor, [data-slate-editor="true"]');
    if ((role === "textbox" || ariaMultiline || frameworkEditor) && !el.hasAttribute("disabled")) return el;

    return null;
  }

  function isEditable(el) {
    return Boolean(resolveEditable(el));
  }

  function getEditorKind(el) {
    if (!el) return "unknown";
    const tag = el.tagName?.toLowerCase();
    if (tag === "textarea" || tag === "input") return "native";
    if (!el.isContentEditable && typeof el.value === "string") return "value";
    if (el.isContentEditable || el.getAttribute("role") === "textbox" || el.getAttribute("aria-multiline") === "true") return "rich";
    return "unknown";
  }

  function getEditableText(el) {
    if (!el) return "";
    const kind = getEditorKind(el);
    if (kind === "native" || kind === "value") return String(el.value || "");
    if (kind === "rich") return el.innerText || el.textContent || "";
    return "";
  }

  function normalizeEditableText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[\u200b-\u200d\ufeff]/g, "")
      .replace(/\r\n/g, "\n")
      .trim();
  }

  function findPropertyDescriptor(target, property) {
    let proto = target;
    while (proto) {
      const descriptor = Object.getOwnPropertyDescriptor(proto, property);
      if (descriptor) return descriptor;
      proto = Object.getPrototypeOf(proto);
    }
    return null;
  }

  function dispatchEditorInput(el, value) {
    try {
      el.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        composed: true,
        inputType: "insertReplacementText",
        data: value
      }));
    } catch {
      el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    }
  }

  function setEditableText(el, value) {
    if (!el) return;
    suppressNextInput = true;
    el.focus();

    const kind = getEditorKind(el);
    if (kind === "native" || kind === "value") {
      const descriptor = findPropertyDescriptor(el, "value");
      if (descriptor?.set) descriptor.set.call(el, value);
      else el.value = value;

      dispatchEditorInput(el, value);
      el.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      if (typeof el.setSelectionRange === "function") {
        try { el.setSelectionRange(value.length, value.length); } catch {}
      }
      return;
    }

    if (kind === "rich") {
      try {
        el.dispatchEvent(new InputEvent("beforeinput", {
          bubbles: true,
          composed: true,
          cancelable: true,
          inputType: "insertReplacementText",
          data: value
        }));
      } catch {}

      const selection = el.ownerDocument?.getSelection?.() || window.getSelection();
      const range = el.ownerDocument.createRange();
      range.selectNodeContents(el);
      selection?.removeAllRanges();
      selection?.addRange(range);

      let inserted = false;
      try { inserted = Boolean(el.ownerDocument.execCommand("insertText", false, value)); } catch {}

      if (!inserted) {
        range.deleteContents();
        const textNode = el.ownerDocument.createTextNode(value);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }

      dispatchEditorInput(el, value);
    }
  }

  function isLikelySendControl(control, editable) {
    if (!(control instanceof HTMLElement) || !isVisibleAndEnabled(control)) return false;

    const meta = [
      control.getAttribute("aria-label"),
      control.getAttribute("title"),
      control.getAttribute("data-testid"),
      control.getAttribute("name"),
      control.textContent
    ].filter(Boolean).join(" ");

    if (/send|gửi|submit|paper.?plane|send-button|composer-submit/i.test(meta)) return true;

    const type = String(control.getAttribute("type") || "").toLowerCase();
    if (type !== "submit") return false;

    const form = control.closest("form");
    return Boolean(form && editable && form.contains(editable));
  }

  function findLikelySendButton(el) {
    const treeRoot = el.getRootNode?.();
    const fallbackRoot = treeRoot?.querySelectorAll ? treeRoot : document;
    const root = el.closest("form") || el.closest('[role="dialog"], [role="main"], main, section, article') || fallbackRoot;
    const selectors = [
      '[data-testid="send-button"]',
      '[data-testid*="send" i]',
      'button[aria-label*="Send" i]',
      '[role="button"][aria-label*="Send" i]',
      'button[title*="Send" i]',
      '[role="button"][title*="Send" i]',
      'button[aria-label*="Gửi" i]',
      '[role="button"][aria-label*="Gửi" i]',
      'button[type="submit"]',
      'input[type="submit"]'
    ];

    for (const selector of selectors) {
      const controls = Array.from(root.querySelectorAll(selector)).filter(isVisibleAndEnabled);
      const matched = controls.find((control) => isLikelySendControl(control, el));
      if (matched) return matched;
    }

    return null;
  }

  function isVisibleAndEnabled(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (el.disabled || el.getAttribute("aria-disabled") === "true") return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function getPageUrl() {
    try {
      const ancestors = location.ancestorOrigins;
      const topOrigin = ancestors?.length ? ancestors[ancestors.length - 1] : "";
      if (topOrigin) {
        if (document.referrer) {
          const referrerUrl = new URL(document.referrer);
          if (referrerUrl.origin === topOrigin) return referrerUrl.href;
        }
        return topOrigin;
      }
    } catch {}

    return location.href;
  }

  function getPageOrigin() {
    try {
      return new URL(getPageUrl()).origin;
    } catch {
      return location.origin;
    }
  }

  function getContextHint() {
    try {
      const pageUrl = new URL(getPageUrl());
      const host = pageUrl.hostname.replace(/^www\./, "");
      const path = pageUrl.pathname.split("/").filter(Boolean).slice(0, 2).join("/");
      return `${host}${path ? `/${path}` : ""}`;
    } catch {
      return location.hostname.replace(/^www\./, "");
    }
  }

  function saveSyncSettings(nextSettings) {
    return new Promise((resolve) => {
      try {
        const syncStorage = globalThis.chrome?.storage?.sync;
        if (!syncStorage?.set) {
          resolve(false);
          return;
        }

        syncStorage.set(nextSettings, () => {
          try {
            resolve(!globalThis.chrome?.runtime?.lastError);
          } catch {
            resolve(false);
          }
        });
      } catch {
        resolve(false);
      }
    });
  }

  async function getSettings() {
    const response = await sendMessage({ type: "IB_GET_SETTINGS", origin: getPageOrigin() });
    return response?.settings || { enabled: false };
  }

  function sendMessage(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(response);
        });
      } catch (error) {
        resolve({ ok: false, error: error?.message || String(error) });
      }
    });
  }

  let streamPort = null;

  function streamTransform(message, onChunk, onDone, onError) {
    // Keep translation on the port path even when AI enhancement is off.
    // The background can publish the primary Google result immediately there;
    // the request/response path waits for optional secondary work and can hit
    // the UI timeout before that result is returned.
    const useRegularRequest =
      settings?.llmProvider === "9router" && message.mode !== "translate";
    if (useRegularRequest) {
      let finished = false;
      const timeout = window.setTimeout(() => {
        if (finished) return;
        finished = true;
        onError(message.mode === "translate"
          ? "Google Translate không phản hồi sau 25 giây."
          : "9Router không phản hồi sau 25 giây.");
      }, 25000);

      sendMessage({ type: "IB_TRANSFORM", ...message }).then((response) => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timeout);
        if (!response?.ok) {
          onError(response?.error || "9Router request failed.");
          return;
        }
        onDone(response.data || {});
      });
      return;
    }

    if (streamPort) {
      try { streamPort.disconnect(); } catch {}
    }

    try {
      const port = chrome.runtime.connect({ name: "ib-transform-stream" });
      streamPort = port;
      let hasFinished = false;
      const timeout = window.setTimeout(() => {
        if (hasFinished) return;
        hasFinished = true;
        if (streamPort === port) streamPort = null;
        try { port.disconnect(); } catch {}
        onError("LLM không phản hồi sau 25 giây.");
      }, 25000);

      port.onMessage.addListener((response) => {
        if (hasFinished) return;
        if (!response.ok) {
          hasFinished = true;
          window.clearTimeout(timeout);
          onError(response.error || "Streaming error");
          if (streamPort === port) streamPort = null;
          try { port.disconnect(); } catch {}
          return;
        }

        const data = response.data || {};
        if (data.done) {
          hasFinished = true;
          window.clearTimeout(timeout);
          onDone(data);
          if (streamPort === port) streamPort = null;
          try { port.disconnect(); } catch {}
        } else {
          onChunk(data);
        }
      });

      port.onDisconnect.addListener(() => {
        if (streamPort === port) streamPort = null;
        if (!hasFinished) {
          hasFinished = true;
          window.clearTimeout(timeout);
          onError("Kết nối với background page bị đóng.");
        }
      });

      port.postMessage(message);
    } catch (error) {
      onError(error?.message || String(error));
      streamPort = null;
    }
  }

  function showToast(text) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "ib-toast";
      document.documentElement.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.style.display = "block";
    clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(() => {
      if (toastEl) toastEl.style.display = "none";
    }, 2200);
  }

  function renderLanguageOptions(currentLanguage) {
    const languages = Array.from(LANGUAGE_CATALOG?.ordered || []);
    const current = String(currentLanguage || "English").trim();
    if (current && !languages.some((language) => language.name === current)) {
      languages.unshift({ name: current, code: current });
    }

    return languages
      .map((language) => `<option value="${escapeHtml(language.name)}" ${language.name === current ? "selected" : ""}>${escapeHtml(language.name)}</option>`)
      .join("");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
