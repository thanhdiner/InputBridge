const loading = document.getElementById("loading");
const loadingText = document.getElementById("loadingText");
const preview = document.getElementById("preview");
const layoutBlock = document.getElementById("layoutBlock");
const originalCanvas = document.getElementById("originalCanvas");
const layoutCanvas = document.getElementById("layoutCanvas");
const translatedLayer = document.getElementById("translatedLayer");
const drawingCanvas = document.getElementById("drawingCanvas");
const canvasStage = document.getElementById("canvasStage");
const textLayer = document.getElementById("textLayer");
const interactionHint = document.getElementById("interactionHint");
const canvasWrap = document.getElementById("canvasWrap");
const originalBlock = document.getElementById("originalBlock");
const originalText = document.getElementById("originalText");
const translationBlock = document.getElementById("translationBlock");
const translationText = document.getElementById("translationText");
const errorBlock = document.getElementById("errorBlock");
const errorText = document.getElementById("errorText");
const meta = document.getElementById("meta");
const langBadge = document.getElementById("langBadge");
const langBadgeText = document.getElementById("langBadgeText");
const langDropdown = document.getElementById("langDropdown");
const langSearchInput = document.getElementById("langSearchInput");
const langList = document.getElementById("langList");
const langSelectorWrap = document.querySelector(".lang-selector-wrap");
const ocrBadge = document.getElementById("ocrBadge");
const ocrBadgeText = document.getElementById("ocrBadgeText");
const speakButton = document.getElementById("speakButton");
const speakTextButton = document.getElementById("speakTextButton");
const copyButton = document.getElementById("copyButton");
const copyImageButton = document.getElementById("copyImageButton");
const recaptureButton = document.getElementById("recaptureButton");
const recaptureTextButton = document.getElementById("recaptureTextButton");
const closeButton = document.getElementById("closeButton");
const openMainButton = document.getElementById("openMainButton");
const zoomOutButton = document.getElementById("zoomOutButton");
const zoomResetButton = document.getElementById("zoomResetButton");
const zoomInButton = document.getElementById("zoomInButton");
const fitWidthButton = document.getElementById("fitWidthButton");
const fitPageButton = document.getElementById("fitPageButton");
const selectTextButton = document.getElementById("selectTextButton");
const cropButton = document.getElementById("cropButton");
const drawButton = document.getElementById("drawButton");
const eraseButton = document.getElementById("eraseButton");
const clearDrawingButton = document.getElementById("clearDrawingButton");
const resultTitle = document.getElementById("resultTitle");
const selectionToolbar = document.getElementById("selectionToolbar");
const copySelectionButton = document.getElementById("copySelectionButton");
const translateSelectionButton = document.getElementById("translateSelectionButton");
const subTranslatePopover = document.getElementById("subTranslatePopover");
const subTransLangBtn = document.getElementById("subTransLangBtn");
const subTransLangText = document.getElementById("subTransLangText");
const subTransDropdown = document.getElementById("subTransDropdown");
const subTransSearch = document.getElementById("subTransSearch");
const subTransList = document.getElementById("subTransList");
const subTransClose = document.getElementById("subTransClose");
const subTransOrigRow = document.getElementById("subTransOrigRow");
const subTransOrigText = document.getElementById("subTransOrigText");
const subTransBody = document.getElementById("subTransBody");
const subTransCopy = document.getElementById("subTransCopy");
const subTransSpeak = document.getElementById("subTransSpeak");

const cropOverlay = document.getElementById("cropOverlay");
const cropBox = document.getElementById("cropBox");
const cropDimText = document.getElementById("cropDimText");
const cropActionsHud = document.getElementById("cropActionsHud");
const cropTranslateBtn = document.getElementById("cropTranslateBtn");
const cropCopyBtn = document.getElementById("cropCopyBtn");
const cropCancelBtn = document.getElementById("cropCancelBtn");

const compareHandle = document.getElementById("compareHandle");
const compareToggleButton = document.getElementById("compareToggleButton");
const compareToggleText = document.getElementById("compareToggleText");
const readingBar = document.getElementById("readingBar");
const readingIndex = document.getElementById("readingIndex");
const readingText = document.getElementById("readingText");
const readingHighlight = document.getElementById("readingHighlight");
const prevSpeechBtn = document.getElementById("prevSpeechBtn");
const pauseSpeechBtn = document.getElementById("pauseSpeechBtn");
const nextSpeechBtn = document.getElementById("nextSpeechBtn");
const stopSpeechBtn = document.getElementById("stopSpeechBtn");

let current = null;
let currentAudio = null;
let availableLanguages = [];
let speechState = {
  active: false,
  paused: false,
  currentIndex: 0,
  blocks: [],
  audio: null
};
let drawVersion = 0;
let canvasReady = false;
let zoom = 1;
let comparePosition = 0;
let isComparing = false;
let isPanning = false;
let panStart = null;
let interactionMode = "select";
let isDrawing = false;
let lastDrawPoint = null;
let layoutImageWidth = 1;
let layoutImageHeight = 1;
let drawingHasContent = false;
let selectedLayoutText = "";
let selectionUpdateFrame = 0;

init().catch((error) => render({ status: "error", error: error?.message || String(error) }));

async function init() {
  current = await window.inputBridge.getResultContext();
  render(current || { status: "loading", meta: "Đang xử lý…" });
  window.inputBridge.onResultUpdate((data) => {
    current = data;
    render(data);
  });

  initLanguagePicker();
  loadLanguages().catch(() => {});

  copyButton.addEventListener("click", copyTranslation);
  copyImageButton.addEventListener("click", copyLayoutImage);
  speakButton?.addEventListener("click", toggleSpeech);
  speakTextButton?.addEventListener("click", toggleSpeech);
  prevSpeechBtn?.addEventListener("click", () => jumpToSpeechBlock(speechState.currentIndex - 1));
  nextSpeechBtn?.addEventListener("click", () => jumpToSpeechBlock(speechState.currentIndex + 1));
  pauseSpeechBtn?.addEventListener("click", togglePauseSpeech);
  stopSpeechBtn?.addEventListener("click", stopSpeech);
  recaptureButton?.addEventListener("click", () => window.inputBridge.recapture());
  recaptureTextButton?.addEventListener("click", () => window.inputBridge.recapture());
  closeButton.addEventListener("click", () => window.inputBridge.closeResult());
  openMainButton?.addEventListener("click", () => window.inputBridge.showMain());
  compareToggleButton?.addEventListener("click", toggleCompareMode);
  zoomOutButton.addEventListener("click", () => setZoom(zoom - 0.25));
  zoomInButton.addEventListener("click", () => setZoom(zoom + 0.25));
  zoomResetButton.addEventListener("click", () => setZoom(1));
  fitWidthButton?.addEventListener("click", () => setZoom(1));
  fitPageButton?.addEventListener("click", fitPage);
  selectTextButton.addEventListener("click", () => setInteractionMode("select"));
  cropButton?.addEventListener("click", () => setInteractionMode("crop"));
  drawButton.addEventListener("click", () => setInteractionMode("draw"));
  eraseButton.addEventListener("click", () => setInteractionMode("erase"));
  clearDrawingButton.addEventListener("click", clearDrawing);

  initCropInteractions();
  initSubTranslate();

  copySelectionButton.addEventListener("pointerdown", (event) => event.preventDefault());
  copySelectionButton.addEventListener("click", copySelectedLayoutText);
  translateSelectionButton?.addEventListener("pointerdown", (event) => event.preventDefault());
  translateSelectionButton?.addEventListener("click", onSubTranslateClick);

  drawingCanvas.addEventListener("pointerdown", onDrawStart);
  drawingCanvas.addEventListener("pointermove", onDrawMove);
  drawingCanvas.addEventListener("pointerup", onDrawEnd);
  drawingCanvas.addEventListener("pointercancel", onDrawEnd);
  compareHandle.addEventListener("pointerdown", onCompareStart);
  compareHandle.addEventListener("pointermove", onCompareMove);
  compareHandle.addEventListener("pointerup", onCompareEnd);
  compareHandle.addEventListener("pointercancel", onCompareEnd);
  compareHandle.addEventListener("keydown", onCompareKeyDown);
  canvasWrap.addEventListener("wheel", onCanvasWheel, { passive: false });
  canvasWrap.addEventListener("pointerdown", onPanStart);
  canvasWrap.addEventListener("pointermove", onPanMove);
  canvasWrap.addEventListener("pointerup", onPanEnd);
  canvasWrap.addEventListener("pointercancel", onPanEnd);
  layoutCanvas.addEventListener("dblclick", () => setZoom(1));
  document.addEventListener("selectionchange", scheduleSelectionToolbarUpdate);
  document.addEventListener("keydown", onSelectionShortcut);
  canvasWrap.addEventListener("scroll", () => {
    scheduleSelectionToolbarUpdate();
    syncCompareHandleKnob();
  }, { passive: true });
  window.addEventListener("blur", hideSelectionToolbar);
  window.addEventListener("resize", () => {
    if (current?.mode !== "layout") return;
    syncSelectableTextScale();
    scheduleSelectionToolbarUpdate();
    syncCompareHandleKnob();
  });
}

function render(data = {}) {
  const status = data.status || "loading";
  const layoutMode = data.mode === "layout";
  if (status === "loading") {
    comparePosition = 0;
  }
  loading.hidden = status !== "loading";
  loadingText.textContent = data.meta || "Đang xử lý…";
  resultTitle.textContent = layoutMode ? "Dịch trong ảnh" : "Dịch màn hình";
  document.body.classList.toggle("layout-mode", layoutMode);

  preview.hidden = layoutMode || !data.previewDataUrl;
  preview.style.display = preview.hidden ? "none" : "block";
  if (!preview.hidden) preview.src = data.previewDataUrl;

  const original = String(data.original || "").trim();
  const translation = String(data.translation || "").trim();
  const showOriginal = data.showOriginal !== false;

  originalText.textContent = original;
  originalBlock.hidden = layoutMode || !original || !showOriginal;
  originalBlock.style.display = originalBlock.hidden ? "none" : "";
  translationText.textContent = translation;
  translationBlock.hidden = layoutMode || !translation;
  translationBlock.style.display = translationBlock.hidden ? "none" : "";

  layoutBlock.hidden = !layoutMode || !data.layoutImageDataUrl;
  syncCompareUi(status);
  copyImageButton.disabled = true;
  canvasReady = false;
  if (!layoutBlock.hidden) void drawLayoutResult(data);

  if (langBadgeText) {
    if (status === "loading") {
      langBadgeText.textContent = data.meta || "Đang nhận dạng…";
      if (ocrBadge) ocrBadge.hidden = true;
      if (speakButton) speakButton.disabled = true;
    } else if (status === "done") {
      const src = data.sourceLanguage || "Tự động";
      const tgt = data.targetLanguage || "Tiếng Việt";
      langBadgeText.textContent = `${src} → ${tgt}`;
      if (speakButton) speakButton.disabled = !translation;
      if (ocrBadge) {
        const ocr = data.ocrDetection || data.detection;
        const hasAuto = ocr?.mode === "auto" || (data.meta && data.meta.includes("OCR auto"));
        ocrBadge.hidden = !hasAuto;
        if (hasAuto) {
          const conf = ocr?.confidence ? ` ${Math.round(ocr.confidence * 100)}%` : "";
          ocrBadgeText.textContent = `Auto OCR${conf}`;
          ocrBadge.title = data.meta || "Tự động phát hiện ngôn ngữ";
        }
      }
    } else {
      langBadgeText.textContent = "Không thành công";
      if (ocrBadge) ocrBadge.hidden = true;
      if (speakButton) speakButton.disabled = true;
    }
  }

  errorBlock.hidden = status !== "error";
  errorText.textContent = status === "error" ? String(data.error || "Lỗi không xác định.") : "";
  if (meta) meta.textContent = data.meta || "";
}

const POPULAR_LANGUAGES = [
  { name: "Vietnamese", code: "vi" },
  { name: "English", code: "en" },
  { name: "Chinese (Simplified)", code: "zh-CN" },
  { name: "Chinese (Traditional)", code: "zh-TW" },
  { name: "Japanese", code: "ja" },
  { name: "Korean", code: "ko" },
  { name: "French", code: "fr" },
  { name: "German", code: "de" },
  { name: "Spanish", code: "es" },
  { name: "Russian", code: "ru" },
  { name: "Italian", code: "it" },
  { name: "Portuguese", code: "pt" },
  { name: "Thai", code: "th" },
  { name: "Indonesian", code: "id" }
];

function initLanguagePicker() {
  availableLanguages = POPULAR_LANGUAGES;
  langBadge?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleLanguageDropdown();
  });
  langSearchInput?.addEventListener("input", () => {
    renderLanguageList(langSearchInput.value);
  });
  langDropdown?.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  document.addEventListener("click", closeLanguageDropdown);
}

async function loadLanguages() {
  try {
    const bootstrap = await window.inputBridge.getBootstrap();
    if (Array.isArray(bootstrap?.languages) && bootstrap.languages.length) {
      availableLanguages = bootstrap.languages;
    } else {
      availableLanguages = POPULAR_LANGUAGES;
    }
  } catch {
    availableLanguages = POPULAR_LANGUAGES;
  }
  renderLanguageList();
}

function toggleLanguageDropdown() {
  if (!langDropdown) return;
  const isHidden = langDropdown.hidden;
  if (isHidden) {
    langDropdown.hidden = false;
    langSelectorWrap?.classList.add("is-open");
    langBadge?.setAttribute("aria-expanded", "true");
    renderLanguageList();
    setTimeout(() => langSearchInput?.focus(), 50);
  } else {
    closeLanguageDropdown();
  }
}

function closeLanguageDropdown() {
  if (!langDropdown) return;
  langDropdown.hidden = true;
  langSelectorWrap?.classList.remove("is-open");
  langBadge?.setAttribute("aria-expanded", "false");
  if (langSearchInput) langSearchInput.value = "";
}

function renderLanguageList(filterText = "") {
  if (!langList) return;
  const search = filterText.toLowerCase().trim();
  const currentTgt = current?.targetLanguage || "Vietnamese";

  const filtered = availableLanguages.filter((l) =>
    !search || l.name.toLowerCase().includes(search) || l.code.toLowerCase().includes(search)
  );

  langList.innerHTML = "";
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.style.cssText = "padding: 12px; font-size: 11px; color: #94a3b8; text-align: center;";
    empty.textContent = "Không tìm thấy";
    langList.appendChild(empty);
    return;
  }

  for (const item of filtered) {
    const btn = document.createElement("div");
    const isSelected = item.name.toLowerCase() === currentTgt.toLowerCase();
    btn.className = `lang-item ${isSelected ? "is-selected" : ""}`;
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-selected", isSelected ? "true" : "false");
    btn.innerHTML = `<span>${item.name}</span><span style="font-size:9.5px; opacity:0.6;">${item.code}</span>`;
    btn.addEventListener("click", async () => {
      closeLanguageDropdown();
      if (item.name.toLowerCase() === currentTgt.toLowerCase()) return;
      await selectSessionTargetLanguage(item.name);
    });
    langList.appendChild(btn);
  }
}

async function selectSessionTargetLanguage(targetLanguage) {
  if (!targetLanguage) return;
  loading.hidden = false;
  loadingText.textContent = `Đang dịch lại sang ${targetLanguage}…`;
  try {
    await window.inputBridge.retranslateResult(targetLanguage);
  } catch (error) {
    console.error("Retranslate error:", error);
  } finally {
    loading.hidden = true;
  }
}

async function drawLayoutResult(data) {
  const version = ++drawVersion;
  const image = await loadImage(data.layoutImageDataUrl);
  if (version !== drawVersion) return;

  layoutImageWidth = image.naturalWidth;
  layoutImageHeight = image.naturalHeight;
  originalCanvas.width = image.naturalWidth;
  originalCanvas.height = image.naturalHeight;
  layoutCanvas.width = image.naturalWidth;
  layoutCanvas.height = image.naturalHeight;
  drawingCanvas.width = image.naturalWidth;
  drawingCanvas.height = image.naturalHeight;
  canvasStage.style.aspectRatio = `${image.naturalWidth} / ${image.naturalHeight}`;
  drawingHasContent = false;
  clearDrawingButton.disabled = true;
  setZoom(zoom, false);
  const originalContext = originalCanvas.getContext("2d", { alpha: false });
  originalContext.imageSmoothingEnabled = true;
  originalContext.imageSmoothingQuality = "high";
  originalContext.drawImage(image, 0, 0);
  const context2d = layoutCanvas.getContext("2d", { alpha: false });
  context2d.imageSmoothingEnabled = true;
  context2d.imageSmoothingQuality = "high";
  context2d.drawImage(image, 0, 0);

  const renderedBlocks = [];
  if (data.status === "done") {
    for (const block of Array.isArray(data.layoutBlocks) ? data.layoutBlocks : []) {
      const rendered = drawTranslatedBlock(context2d, block, image.naturalWidth, image.naturalHeight);
      if (rendered) renderedBlocks.push(rendered);
    }
  }
  renderSelectableText(renderedBlocks, image.naturalWidth, image.naturalHeight);
  requestAnimationFrame(() => {
    syncSelectableTextScale();
    syncCompareHandleKnob();
  });

  canvasReady = data.status === "done";
  copyImageButton.disabled = !canvasReady;
}

function syncCompareHandleKnob() {
  if (!canvasStage || !canvasWrap) return;
  const stageRect = canvasStage.getBoundingClientRect();
  const wrapRect = canvasWrap.getBoundingClientRect();
  if (!stageRect.height) return;

  const visibleTop = Math.max(stageRect.top, wrapRect.top);
  const visibleBottom = Math.min(stageRect.bottom, wrapRect.bottom);
  const visibleCenter = (visibleTop + visibleBottom) / 2;
  const relativeCenterY = clamp(visibleCenter - stageRect.top, 24, stageRect.height - 24);
  canvasStage.style.setProperty("--compare-handle-top", `${relativeCenterY}px`);
}

function syncCompareUi(status) {
  const ready = status === "done" || Boolean(current?.layoutImageDataUrl);
  compareHandle.hidden = !ready;
  compareToggleButton.disabled = !ready;
  translatedLayer.classList.toggle("is-ready", ready);
  setComparePosition(comparePosition);
  syncCompareHandleKnob();
}

function setComparePosition(position) {
  comparePosition = clamp(Number(position) || 0, 0, 1);
  canvasStage.style.setProperty("--compare-position", `${comparePosition * 100}%`);
  compareHandle.setAttribute("aria-valuenow", String(Math.round(comparePosition * 100)));
  canvasStage.classList.toggle("at-start", comparePosition <= 0.015);
  canvasStage.classList.toggle("at-end", comparePosition >= 0.985);
  if (compareToggleText) {
    compareToggleText.textContent = comparePosition >= 0.5 ? "Bản dịch" : "Ảnh gốc";
  }
  compareToggleButton?.classList.toggle("active", comparePosition >= 0.5);
}

function toggleCompareMode() {
  if (comparePosition < 0.5) {
    setComparePosition(1);
  } else {
    setComparePosition(0);
  }
}

function comparePositionFromEvent(event) {
  const rect = canvasStage.getBoundingClientRect();
  if (!rect.width) return comparePosition;
  return (event.clientX - rect.left) / rect.width;
}

function onCompareStart(event) {
  if (current?.status !== "done") return;
  isComparing = true;
  canvasStage.classList.add("is-comparing");
  compareHandle.setPointerCapture(event.pointerId);
  setComparePosition(comparePositionFromEvent(event));
  event.preventDefault();
  event.stopPropagation();
}

function onCompareMove(event) {
  if (!isComparing) return;
  setComparePosition(comparePositionFromEvent(event));
  event.preventDefault();
  event.stopPropagation();
}

function onCompareEnd(event) {
  if (!isComparing) return;
  isComparing = false;
  canvasStage.classList.remove("is-comparing");
  if (compareHandle.hasPointerCapture(event.pointerId)) {
    compareHandle.releasePointerCapture(event.pointerId);
  }
  syncCompareHandleKnob();
  event.preventDefault();
  event.stopPropagation();
}

function onCompareKeyDown(event) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
  if (event.key === "Home") setComparePosition(0);
  else if (event.key === "End") setComparePosition(1);
  else setComparePosition(comparePosition + (event.key === "ArrowLeft" ? -0.03 : 0.03));
  event.preventDefault();
}

function drawTranslatedBlock(context2d, block, imageWidth, imageHeight) {
  const originalHeight = clamp(Number(block?.height || 1), 1, imageHeight);
  const originalWidth = clamp(Number(block?.width || 1), 1, imageWidth);
  const lineCount = Math.max(1, Number(block?.lineCount || 1));
  const avgLineHeight = Math.max(8, Number(block?.avgLineHeight || originalHeight / lineCount));

  const text = String(block?.translation || block?.text || "").trim();
  if (!text) return null;
  const original = String(block?.original || block?.text || "").trim();
  if (original && original.toLowerCase() === text.toLowerCase()) {
    return null;
  }

  // Calculate ideal font size & measure translated text width
  const idealFontSize = clamp(Math.floor(avgLineHeight * 0.76), 8, 48);
  context2d.font = `600 ${idealFontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif`;
  const textMetrics = context2d.measureText(text);
  const neededTextWidth = Math.ceil(textMetrics.width);

  const innerPadX = Math.max(3, Math.round(avgLineHeight * 0.15));
  const innerPadY = Math.max(1, Math.round(avgLineHeight * 0.08));

  // The inpainting box MUST cover at least 100% of the original text, or expand if translation needs more space
  const x = clamp(Math.round(Number(block?.x || 0)), 0, imageWidth - 1);
  const y = clamp(Math.round(Number(block?.y || 0)), 0, imageHeight - 1);
  const coverWidth = clamp(Math.max(originalWidth, neededTextWidth + innerPadX * 2 + 8), originalWidth, imageWidth - x);
  const height = clamp(Math.round(originalHeight), 1, imageHeight - y);

  const palette = sampleColorPalette(context2d, x, y, coverWidth, height);
  context2d.save();
  roundedRect(context2d, x, y, coverWidth, height, Math.min(4, height * 0.2));
  context2d.fillStyle = palette.backgroundColor;
  context2d.fill();
  context2d.clip();

  const textWidth = Math.max(1, coverWidth - innerPadX * 2);
  const textHeight = Math.max(1, height - innerPadY * 2);
  const fit = fitText(context2d, text, textWidth, textHeight, avgLineHeight, lineCount);

  context2d.fillStyle = palette.textColor;
  context2d.textBaseline = "top";
  context2d.textAlign = "left";
  context2d.font = `600 ${fit.fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif`;

  const visibleLines = fit.lines.slice(0, fit.maxLines);
  if (fit.lines.length > fit.maxLines && visibleLines.length) {
    visibleLines[visibleLines.length - 1] = trimWithEllipsis(context2d, visibleLines[visibleLines.length - 1], textWidth);
  }
  const totalHeight = visibleLines.length * fit.lineHeight;
  let cursorY = y + innerPadY + Math.max(0, (textHeight - totalHeight) / 2);
  for (const line of visibleLines) {
    context2d.fillText(line, x + innerPadX, cursorY, textWidth);
    cursorY += fit.lineHeight;
  }
  context2d.restore();

  return {
    text: visibleLines.join("\n"),
    x: x + innerPadX,
    y: y + innerPadY + Math.max(0, (textHeight - totalHeight) / 2),
    width: textWidth,
    height: Math.min(textHeight, totalHeight),
    fontSize: fit.fontSize,
    lineHeight: fit.lineHeight
  };
}

function fitText(context2d, text, maxWidth, maxHeight, avgLineHeight, lineCount) {
  const targetLines = Math.max(1, lineCount || 1);
  const baseSize = clamp(Math.floor(avgLineHeight * 0.76), 8, 54);
  let best = null;

  for (let fontSize = baseSize; fontSize >= 7; fontSize -= 1) {
    context2d.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif`;
    const lines = wrapText(context2d, text, maxWidth);
    const lineHeight = Math.ceil(fontSize * 1.25);
    const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
    best = { fontSize, lines, lineHeight, maxLines };
    if (lines.length <= maxLines && lines.length <= targetLines + 1) return best;
  }
  return best || { fontSize: 7, lines: [text], lineHeight: 9, maxLines: 1 };
}

function wrapText(context2d, text, maxWidth) {
  const paragraphs = String(text || "").split(/\r?\n/u);
  const output = [];
  for (const paragraph of paragraphs) {
    const tokens = /\s/u.test(paragraph)
      ? paragraph.split(/(\s+)/u).filter(Boolean)
      : Array.from(paragraph);
    let line = "";
    for (const token of tokens) {
      const candidate = `${line}${token}`;
      if (line && context2d.measureText(candidate).width > maxWidth) {
        output.push(line.trimEnd());
        line = token.trimStart();
      } else {
        line = candidate;
      }
    }
    if (line) output.push(line.trim());
    if (!paragraph && !output.length) output.push("");
  }
  return output.filter((line, index) => line || index === 0);
}

function trimWithEllipsis(context2d, text, maxWidth) {
  let output = String(text || "").trimEnd();
  while (output && context2d.measureText(`${output}…`).width > maxWidth) {
    output = output.slice(0, -1).trimEnd();
  }
  return `${output}…`;
}

function sampleColorPalette(context2d, x, y, width, height) {
  const sampleW = Math.max(1, Math.min(60, width));
  const sampleH = Math.max(1, Math.min(40, height));
  const canvas = document.createElement("canvas");
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(layoutCanvas, x, y, width, height, 0, 0, sampleW, sampleH);
  const data = ctx.getImageData(0, 0, sampleW, sampleH).data;

  // Sample border pixels for background color
  let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
  for (let py = 0; py < sampleH; py++) {
    for (let px = 0; px < sampleW; px++) {
      const isBorder = py === 0 || py === sampleH - 1 || px === 0 || px === sampleW - 1;
      if (isBorder) {
        const idx = (py * sampleW + px) * 4;
        bgR += data[idx];
        bgG += data[idx + 1];
        bgB += data[idx + 2];
        bgCount++;
      }
    }
  }

  const r = bgCount ? Math.round(bgR / bgCount) : 255;
  const g = bgCount ? Math.round(bgG / bgCount) : 255;
  const b = bgCount ? Math.round(bgB / bgCount) : 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const isDark = luminance < 125;

  return {
    backgroundColor: isDark
      ? `rgb(${Math.max(10, r - 3)}, ${Math.max(10, g - 3)}, ${Math.max(10, b - 3)})`
      : `rgb(${Math.min(255, r + 3)}, ${Math.min(255, g + 3)}, ${Math.min(255, b + 3)})`,
    textColor: isDark ? "#ffffff" : "#111827",
    strokeColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)",
    isDark
  };
}

function roundedRect(context2d, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context2d.beginPath();
  context2d.moveTo(x + r, y);
  context2d.arcTo(x + width, y, x + width, y + height, r);
  context2d.arcTo(x + width, y + height, x, y + height, r);
  context2d.arcTo(x, y + height, x, y, r);
  context2d.arcTo(x, y, x + width, y, r);
  context2d.closePath();
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Không tải được ảnh kết quả."));
    image.src = source;
  });
}

function renderSelectableText(blocks, imageWidth, imageHeight) {
  hideSelectionToolbar();
  textLayer.replaceChildren();
  for (const block of Array.isArray(blocks) ? blocks : []) {
    const text = String(block?.text || "").trim();
    if (!text) continue;
    const item = document.createElement("span");
    item.className = "selectable-text";
    item.textContent = text;
    item.dataset.original = String(block.original || block.text || "");
    item.dataset.fontSize = String(block.fontSize || 12);
    item.dataset.lineHeight = String(block.lineHeight || 14);
    item.style.left = `${clamp(Number(block.x || 0) / imageWidth * 100, 0, 100)}%`;
    item.style.top = `${clamp(Number(block.y || 0) / imageHeight * 100, 0, 100)}%`;
    item.style.width = `${clamp(Number(block.width || 1) / imageWidth * 100, 0.1, 100)}%`;
    item.style.height = `${clamp(Number(block.height || 1) / imageHeight * 100, 0.1, 100)}%`;
    textLayer.appendChild(item);
  }
}

function syncSelectableTextScale() {
  const stageWidth = canvasStage.getBoundingClientRect().width;
  if (!stageWidth || !layoutImageWidth) return;
  const scale = stageWidth / layoutImageWidth;
  for (const item of textLayer.querySelectorAll(".selectable-text")) {
    item.style.fontSize = `${Number(item.dataset.fontSize || 12) * scale}px`;
    item.style.lineHeight = `${Number(item.dataset.lineHeight || 14) * scale}px`;
  }
}

function setInteractionMode(mode) {
  interactionMode = mode;
  if (mode !== "select") {
    window.getSelection()?.removeAllRanges();
    hideSelectionToolbar();
  }
  canvasWrap.classList.toggle("mode-select", mode === "select");
  canvasWrap.classList.toggle("mode-draw", mode === "draw");
  canvasWrap.classList.toggle("mode-erase", mode === "erase");
  selectTextButton.classList.toggle("active", mode === "select");
  drawButton.classList.toggle("active", mode === "draw");
  eraseButton.classList.toggle("active", mode === "erase");
  selectTextButton.setAttribute("aria-selected", String(mode === "select"));
  drawButton.setAttribute("aria-selected", String(mode === "draw"));
  eraseButton.setAttribute("aria-selected", String(mode === "erase"));
  if (interactionHint) {
    interactionHint.textContent = mode === "select"
      ? "Kéo thanh Before/After để so sánh · Bôi đen chữ để sao chép"
      : mode === "draw"
        ? "Kéo chuột để vẽ lên ảnh"
        : "Kéo qua nét vẽ để tẩy";
  }
}

function scheduleSelectionToolbarUpdate() {
  cancelAnimationFrame(selectionUpdateFrame);
  selectionUpdateFrame = requestAnimationFrame(updateSelectionToolbar);
}

function updateSelectionToolbar() {
  selectionUpdateFrame = 0;
  if (interactionMode !== "select" || layoutBlock.hidden) {
    hideSelectionToolbar(true);
    return;
  }

  // If subTranslatePopover is actively shown, don't close it due to click/selection inside popover
  if (subTranslatePopover && !subTranslatePopover.hidden) {
    return;
  }

  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) {
    hideSelectionToolbar();
    return;
  }

  const range = selection.getRangeAt(0);
  const startElement = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer
    : range.startContainer.parentElement;
  const endElement = range.endContainer.nodeType === Node.ELEMENT_NODE
    ? range.endContainer
    : range.endContainer.parentElement;
  if (!startElement || !endElement || !textLayer.contains(startElement) || !textLayer.contains(endElement)) {
    hideSelectionToolbar();
    return;
  }

  const text = selection.toString().trim();
  const rect = range.getBoundingClientRect();
  if (!text || (!rect.width && !rect.height)) {
    hideSelectionToolbar();
    return;
  }

  selectedLayoutText = text;
  selectionToolbar.hidden = false;
  selectionToolbar.classList.remove("is-copied");
  copySelectionButton.querySelector("strong").textContent = "Sao chép";

  const toolbarRect = selectionToolbar.getBoundingClientRect();
  const margin = 10;
  let left = rect.left + rect.width / 2 - toolbarRect.width / 2;
  let top = rect.top - toolbarRect.height - 8;
  if (top < margin) top = rect.bottom + 8;
  left = clamp(left, margin, Math.max(margin, window.innerWidth - toolbarRect.width - margin));
  top = clamp(top, margin, Math.max(margin, window.innerHeight - toolbarRect.height - margin));
  selectionToolbar.style.left = `${Math.round(left)}px`;
  selectionToolbar.style.top = `${Math.round(top)}px`;
  positionSubTranslatePopover();
}

function positionSubTranslatePopover() {
  if (!subTranslatePopover || subTranslatePopover.hidden) return;
  const toolbarRect = selectionToolbar.getBoundingClientRect();
  const popoverH = subTranslatePopover.offsetHeight || 135;
  const popoverW = subTranslatePopover.offsetWidth || 250;

  // Check if there is enough space above the selection toolbar (accounting for titlebar ~48px)
  const spaceAbove = toolbarRect.top - 48;
  const placeBelow = spaceAbove < popoverH;

  if (placeBelow) {
    subTranslatePopover.style.top = "calc(100% + 8px)";
    subTranslatePopover.style.bottom = "auto";
  } else {
    subTranslatePopover.style.bottom = "calc(100% + 8px)";
    subTranslatePopover.style.top = "auto";
  }

  // Ensure horizontal alignment doesn't overflow screen left or right
  const toolbarCenterX = toolbarRect.left + toolbarRect.width / 2;
  const margin = 12;
  const halfW = popoverW / 2;
  let shiftX = 0;
  if (toolbarCenterX - halfW < margin) {
    shiftX = margin - (toolbarCenterX - halfW);
  } else if (toolbarCenterX + halfW > window.innerWidth - margin) {
    shiftX = (window.innerWidth - margin) - (toolbarCenterX + halfW);
  }
  subTranslatePopover.style.transform = `translateX(calc(-50% + ${Math.round(shiftX)}px))`;
}

function hideSelectionToolbar(force = false) {
  if (!force && subTranslatePopover && !subTranslatePopover.hidden) return;
  selectedLayoutText = "";
  selectionToolbar.hidden = true;
  selectionToolbar.classList.remove("is-copied");
  if (subTranslatePopover) subTranslatePopover.hidden = true;
}

async function copySelectedLayoutText() {
  const text = selectedLayoutText || getSelectedLayoutText();
  if (!text) return;
  await window.inputBridge.copyResult(text);
  selectionToolbar.classList.add("is-copied");
  copySelectionButton.querySelector("strong").textContent = "Đã sao chép";
}

function getSelectedLayoutText() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return "";
  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer
    : range.commonAncestorContainer.parentElement;
  return container && textLayer.contains(container) ? selection.toString().trim() : "";
}

function onSelectionShortcut(event) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "c") return;
  const text = getSelectedLayoutText();
  if (!text) return;
  event.preventDefault();
  selectedLayoutText = text;
  void copySelectedLayoutText();
}

function setInteractionMode(mode) {
  interactionMode = mode;
  selectTextButton?.classList.toggle("active", mode === "select");
  cropButton?.classList.toggle("active", mode === "crop");
  drawButton?.classList.toggle("active", mode === "draw");
  eraseButton?.classList.toggle("active", mode === "erase");

  selectTextButton?.setAttribute("aria-selected", String(mode === "select"));
  cropButton?.setAttribute("aria-selected", String(mode === "crop"));
  drawButton?.setAttribute("aria-selected", String(mode === "draw"));
  eraseButton?.setAttribute("aria-selected", String(mode === "erase"));

  canvasWrap.className = `canvas-wrap mode-${mode}`;
  if (cropOverlay) cropOverlay.hidden = mode !== "crop";
  if (mode !== "crop") {
    closeCropHud();
  }
  if (mode !== "select") {
    hideSelectionToolbar();
  }
}

let isCropping = false;
let cropStart = null;
let currentCropRect = null;

function initCropInteractions() {
  if (!cropOverlay) return;
  cropOverlay.addEventListener("pointerdown", onCropPointerDown);
  cropOverlay.addEventListener("pointermove", onCropPointerMove);
  cropOverlay.addEventListener("pointerup", onCropPointerUp);
  cropOverlay.addEventListener("pointercancel", onCropPointerUp);

  cropTranslateBtn?.addEventListener("click", onCropTranslate);
  cropCopyBtn?.addEventListener("click", onCropCopy);
  cropCancelBtn?.addEventListener("click", closeCropHud);
}

function onCropPointerDown(event) {
  if (interactionMode !== "crop") return;
  if (event.target.closest(".crop-actions-hud")) return;
  isCropping = true;
  if (cropActionsHud) cropActionsHud.hidden = true;
  const stageRect = canvasStage.getBoundingClientRect();
  cropStart = {
    x: clamp(event.clientX - stageRect.left, 0, stageRect.width),
    y: clamp(event.clientY - stageRect.top, 0, stageRect.height)
  };
  if (cropBox) cropBox.hidden = false;
  updateCropBox(cropStart.x, cropStart.y, 0, 0);
  cropOverlay.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function onCropPointerMove(event) {
  if (!isCropping || !cropStart) return;
  const stageRect = canvasStage.getBoundingClientRect();
  const currentX = clamp(event.clientX - stageRect.left, 0, stageRect.width);
  const currentY = clamp(event.clientY - stageRect.top, 0, stageRect.height);

  const x = Math.min(cropStart.x, currentX);
  const y = Math.min(cropStart.y, currentY);
  const width = Math.abs(currentX - cropStart.x);
  const height = Math.abs(currentY - cropStart.y);

  updateCropBox(x, y, width, height);
  event.preventDefault();
}

function onCropPointerUp(event) {
  if (!isCropping) return;
  isCropping = false;
  if (cropOverlay.hasPointerCapture(event.pointerId)) {
    cropOverlay.releasePointerCapture(event.pointerId);
  }
  if (!currentCropRect || currentCropRect.width < 12 || currentCropRect.height < 12) {
    closeCropHud();
    return;
  }
  if (cropActionsHud) cropActionsHud.hidden = false;
}

function updateCropBox(x, y, width, height) {
  currentCropRect = { x, y, width, height };
  if (!cropBox) return;
  cropBox.style.left = `${Math.round(x)}px`;
  cropBox.style.top = `${Math.round(y)}px`;
  cropBox.style.width = `${Math.round(width)}px`;
  cropBox.style.height = `${Math.round(height)}px`;

  const scaleX = layoutImageWidth / (canvasStage.clientWidth || 1);
  const scaleY = layoutImageHeight / (canvasStage.clientHeight || 1);
  const origW = Math.round(width * scaleX);
  const origH = Math.round(height * scaleY);
  if (cropDimText) cropDimText.textContent = `${origW} × ${origH}`;
}

function closeCropHud() {
  if (cropBox) cropBox.hidden = true;
  if (cropActionsHud) cropActionsHud.hidden = true;
  currentCropRect = null;
}

async function onCropTranslate() {
  if (!currentCropRect || !layoutImageWidth || !layoutImageHeight) return;
  const stageW = canvasStage.clientWidth || 1;
  const stageH = canvasStage.clientHeight || 1;
  const scaleX = layoutImageWidth / stageW;
  const scaleY = layoutImageHeight / stageH;

  const imageRect = {
    x: Math.max(0, Math.round(currentCropRect.x * scaleX)),
    y: Math.max(0, Math.round(currentCropRect.y * scaleY)),
    width: Math.max(10, Math.round(currentCropRect.width * scaleX)),
    height: Math.max(10, Math.round(currentCropRect.height * scaleY))
  };

  closeCropHud();
  setInteractionMode("select");
  loading.hidden = false;
  loadingText.textContent = "Đang nhận dạng và dịch vùng chọn…";

  try {
    await window.inputBridge.cropAndProcess({ cropRect: imageRect });
  } catch (error) {
    console.error("Crop translate failed:", error);
  } finally {
    loading.hidden = true;
  }
}

async function onCropCopy() {
  if (!currentCropRect || !layoutImageWidth || !layoutImageHeight) return;
  const stageW = canvasStage.clientWidth || 1;
  const stageH = canvasStage.clientHeight || 1;
  const scaleX = layoutImageWidth / stageW;
  const scaleY = layoutImageHeight / stageH;

  const sx = Math.max(0, Math.round(currentCropRect.x * scaleX));
  const sy = Math.max(0, Math.round(currentCropRect.y * scaleY));
  const sw = Math.max(1, Math.round(currentCropRect.width * scaleX));
  const sh = Math.max(1, Math.round(currentCropRect.height * scaleY));

  const subCanvas = document.createElement("canvas");
  subCanvas.width = sw;
  subCanvas.height = sh;
  const ctx = subCanvas.getContext("2d");
  if (originalCanvas) {
    ctx.drawImage(originalCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  }
  if (layoutCanvas) {
    ctx.drawImage(layoutCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  }
  if (drawingCanvas) {
    ctx.drawImage(drawingCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  }

  const dataUrl = subCanvas.toDataURL("image/png");
  const result = await window.inputBridge.copyResultImage(dataUrl);
  if (result?.ok) {
    const origSpan = cropCopyBtn.querySelector("span");
    const origText = origSpan ? origSpan.textContent : "Sao chép";
    if (origSpan) origSpan.textContent = "Đã sao chép!";
    setTimeout(() => {
      if (origSpan) origSpan.textContent = origText;
    }, 1200);
  }
}

let currentSubTranslation = "";
let currentSubTargetLanguage = "English";

function isVietnameseText(str) {
  const text = String(str || "").normalize("NFC").toLowerCase();
  return /[àáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵđ]/u.test(text);
}

function initSubTranslate() {
  subTranslatePopover?.addEventListener("pointerdown", (event) => event.stopPropagation());
  subTranslatePopover?.addEventListener("click", (event) => event.stopPropagation());

  subTransClose?.addEventListener("click", (event) => {
    event.stopPropagation();
    hideSelectionToolbar(true);
  });

  subTransLangBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleSubTransDropdown();
  });

  subTransSearch?.addEventListener("input", () => {
    filterSubTransLanguages(subTransSearch.value);
  });

  subTransCopy?.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (!currentSubTranslation) return;
    await window.inputBridge.copyResult(currentSubTranslation);
    const span = subTransCopy.querySelector("span");
    const origText = span ? span.textContent : "Sao chép";
    if (span) span.textContent = "Đã sao chép";
    setTimeout(() => { if (span) span.textContent = origText; }, 1200);
  });

  subTransSpeak?.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (!currentSubTranslation) return;
    try {
      const res = await window.inputBridge.speakResult({
        text: currentSubTranslation,
        locale: currentSubTargetLanguage || current?.targetLanguage || "vi-VN"
      });
      if (res?.audioBase64) {
        if (currentAudio) currentAudio.pause();
        currentAudio = new Audio(`data:${res.contentType};base64,${res.audioBase64}`);
        currentAudio.play();
      }
    } catch {}
  });

  document.addEventListener("click", (event) => {
    if (!subTransDropdown || subTransDropdown.hidden) return;
    if (!event.target.closest(".sub-lang-wrap")) {
      subTransDropdown.hidden = true;
    }
  });
}

function toggleSubTransDropdown() {
  if (!subTransDropdown) return;
  const isOpening = subTransDropdown.hidden;
  subTransDropdown.hidden = !isOpening;
  if (isOpening) {
    if (subTransSearch) {
      subTransSearch.value = "";
      setTimeout(() => subTransSearch.focus(), 40);
    }
    const langs = availableLanguages && availableLanguages.length ? availableLanguages : POPULAR_LANGUAGES;
    renderSubTransLanguageList(langs);

    const btnRect = subTransLangBtn ? subTransLangBtn.getBoundingClientRect() : null;
    if (btnRect) {
      const spaceBelow = window.innerHeight - btnRect.bottom - 12;
      if (spaceBelow < 140) {
        subTransDropdown.style.bottom = "calc(100% + 4px)";
        subTransDropdown.style.top = "auto";
      } else {
        subTransDropdown.style.top = "calc(100% + 4px)";
        subTransDropdown.style.bottom = "auto";
      }
    }
  }
}

function renderSubTransLanguageList(languages = []) {
  if (!subTransList) return;
  subTransList.innerHTML = "";
  for (const item of languages) {
    const el = document.createElement("div");
    el.className = `sub-lang-item ${item.name === currentSubTargetLanguage ? "is-selected" : ""}`;
    el.innerHTML = `<span>${item.name}</span>`;
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      selectSubTargetLanguage(item.name);
    });
    subTransList.appendChild(el);
  }
}

function filterSubTransLanguages(query = "") {
  const q = query.trim().toLowerCase();
  const langs = availableLanguages && availableLanguages.length ? availableLanguages : POPULAR_LANGUAGES;
  if (!q) {
    renderSubTransLanguageList(langs);
    return;
  }
  const filtered = langs.filter((l) => l.name.toLowerCase().includes(q) || (l.code && l.code.toLowerCase().includes(q)));
  renderSubTransLanguageList(filtered);
}

function selectSubTargetLanguage(langName) {
  currentSubTargetLanguage = langName;
  if (subTransLangText) subTransLangText.textContent = langName;
  if (subTransDropdown) subTransDropdown.hidden = true;
  runSubTranslation(langName);
}

async function onSubTranslateClick(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const text = selectedLayoutText || getSelectedLayoutText();
  if (!text) return;
  if (subTranslatePopover) subTranslatePopover.hidden = false;
  if (subTransDropdown) subTransDropdown.hidden = true;

  // Find associated original text if selecting inside a block
  const selection = window.getSelection();
  let origText = "";
  if (selection && selection.rangeCount) {
    const node = selection.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection.anchorNode?.parentElement;
    const anchor = node?.closest(".selectable-text");
    if (anchor && anchor.dataset.original) {
      origText = anchor.dataset.original.trim();
    }
  }

  if (origText && origText.toLowerCase() !== text.toLowerCase()) {
    if (subTransOrigRow) subTransOrigRow.hidden = false;
    if (subTransOrigText) subTransOrigText.textContent = origText;
  } else {
    if (subTransOrigRow) subTransOrigRow.hidden = true;
  }

  // Determine smart default target language
  const currentAppTarget = current?.targetLanguage || "Vietnamese";
  let defaultTarget = "English";
  if (isVietnameseText(text)) {
    defaultTarget = "English";
  } else if (currentAppTarget.toLowerCase() === "english") {
    defaultTarget = "Vietnamese";
  } else if (current?.sourceLanguage && current.sourceLanguage.toLowerCase() !== currentAppTarget.toLowerCase()) {
    defaultTarget = current.sourceLanguage;
  }

  currentSubTargetLanguage = defaultTarget;
  if (subTransLangText) {
    subTransLangText.textContent = defaultTarget;
  }

  positionSubTranslatePopover();
  await runSubTranslation(defaultTarget);
  positionSubTranslatePopover();
}

async function runSubTranslation(targetLanguage) {
  const text = selectedLayoutText || getSelectedLayoutText();
  if (!text) return;
  if (subTransBody) subTransBody.textContent = "Đang dịch…";
  positionSubTranslatePopover();

  try {
    const res = await window.inputBridge.translateText({
      text,
      targetLanguage: targetLanguage || "English"
    });
    if (res?.ok && res.translation) {
      currentSubTranslation = res.translation;
      if (subTransBody) subTransBody.textContent = res.translation;
    } else {
      if (subTransBody) subTransBody.textContent = "Không dịch được cụm chữ này.";
    }
  } catch (error) {
    if (subTransBody) subTransBody.textContent = error?.message || "Lỗi khi dịch.";
  }
  positionSubTranslatePopover();
}

function clearDrawing() {
  if (!drawingHasContent) return;
  drawingCanvas.getContext("2d").clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
  drawingHasContent = false;
  clearDrawingButton.disabled = true;
  flashButton(clearDrawingButton, "Đã xóa");
}

function drawPointFromEvent(event) {
  const rect = drawingCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * drawingCanvas.width / rect.width,
    y: (event.clientY - rect.top) * drawingCanvas.height / rect.height
  };
}

function onDrawStart(event) {
  if (interactionMode !== "draw" && interactionMode !== "erase") return;
  isDrawing = true;
  lastDrawPoint = drawPointFromEvent(event);
  drawingCanvas.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function onDrawMove(event) {
  if (!isDrawing || !lastDrawPoint) return;
  const point = drawPointFromEvent(event);
  const context2d = drawingCanvas.getContext("2d");
  context2d.save();
  context2d.lineCap = "round";
  context2d.lineJoin = "round";
  context2d.lineWidth = interactionMode === "erase" ? 22 : 4;
  context2d.globalCompositeOperation = interactionMode === "erase" ? "destination-out" : "source-over";
  context2d.strokeStyle = "#ef4444";
  context2d.beginPath();
  context2d.moveTo(lastDrawPoint.x, lastDrawPoint.y);
  context2d.lineTo(point.x, point.y);
  context2d.stroke();
  context2d.restore();
  drawingHasContent = true;
  clearDrawingButton.disabled = false;
  lastDrawPoint = point;
  event.preventDefault();
}

function onDrawEnd(event) {
  if (!isDrawing) return;
  isDrawing = false;
  lastDrawPoint = null;
  if (drawingCanvas.hasPointerCapture(event.pointerId)) drawingCanvas.releasePointerCapture(event.pointerId);
}

async function copyTranslation() {
  const text = String(current?.translation || "").trim();
  if (!text) return;
  await window.inputBridge.copyResult(text);
  flashButton(copyButton, "Đã sao chép");
}

async function copyLayoutImage() {
  if (!canvasReady) return;
  const output = document.createElement("canvas");
  output.width = layoutCanvas.width;
  output.height = layoutCanvas.height;
  const context2d = output.getContext("2d", { alpha: false });
  context2d.drawImage(layoutCanvas, 0, 0);
  context2d.drawImage(drawingCanvas, 0, 0);
  const dataUrl = output.toDataURL("image/png");
  const result = await window.inputBridge.copyResultImage(dataUrl);
  if (result?.ok) flashButton(copyImageButton, "Đã sao chép");
}

async function toggleSpeech() {
  if (speechState.active) {
    stopSpeech();
    return;
  }

  const isLayout = current?.mode === "layout";
  let blocks = [];
  if (isLayout && Array.isArray(current?.layoutBlocks) && current.layoutBlocks.length > 0) {
    blocks = current.layoutBlocks
      .filter((b) => (b.translation || b.text || "").trim())
      .map((b) => ({
        id: b.id,
        text: String(b.translation || b.text || "").trim(),
        x: Number(b.x || 0),
        y: Number(b.y || 0),
        width: Number(b.width || 10),
        height: Number(b.height || 10)
      }));
  }

  if (!blocks.length) {
    const raw = String(current?.translation || current?.original || "").trim();
    if (!raw) return;
    const lines = raw.split(/\r?\n+/).map((s) => s.trim()).filter(Boolean);
    blocks = lines.map((line, idx) => ({ id: `line-${idx}`, text: line }));
  }

  if (!blocks.length) return;

  speechState.active = true;
  speechState.paused = false;
  speechState.blocks = blocks;
  speechState.currentIndex = 0;
  await playSpeechBlock(0);
}

function highlightSpeechBlock(block) {
  if (!block || !readingHighlight || typeof block.x === "undefined" || !block.width) {
    if (readingHighlight) readingHighlight.hidden = true;
    return;
  }
  readingHighlight.hidden = false;
  const stageW = layoutCanvas.width || layoutImageWidth || 1;
  const stageH = layoutCanvas.height || layoutImageHeight || 1;
  const leftPct = (block.x / stageW) * 100;
  const topPct = (block.y / stageH) * 100;
  const widthPct = (block.width / stageW) * 100;
  const heightPct = (block.height / stageH) * 100;

  readingHighlight.style.left = `${leftPct}%`;
  readingHighlight.style.top = `${topPct}%`;
  readingHighlight.style.width = `${widthPct}%`;
  readingHighlight.style.height = `${heightPct}%`;

  if (canvasWrap && zoom > 1) {
    const wrapRect = canvasWrap.getBoundingClientRect();
    const stageRect = canvasStage.getBoundingClientRect();
    const targetTop = (topPct / 100) * stageRect.height;
    canvasWrap.scrollTo({
      top: Math.max(0, targetTop - wrapRect.height / 3),
      behavior: "smooth"
    });
  }
}

async function playSpeechBlock(index) {
  if (!speechState.active || index < 0 || index >= speechState.blocks.length) {
    stopSpeech();
    return;
  }

  if (speechState.audio) {
    speechState.audio.pause();
    speechState.audio = null;
  }

  speechState.currentIndex = index;
  speechState.paused = false;
  const block = speechState.blocks[index];
  const text = String(block.text || "").trim();

  if (readingBar) readingBar.hidden = false;
  if (readingIndex) readingIndex.textContent = `${index + 1}/${speechState.blocks.length}`;
  if (readingText) readingText.textContent = text;
  if (pauseSpeechBtn) pauseSpeechBtn.textContent = "⏸";
  highlightSpeechBlock(block);
  updateSpeechButtonState(true, "Dừng đọc");

  try {
    const targetLang = current?.targetLanguage || "Vietnamese";
    const response = await window.inputBridge.speakResult({
      text,
      locale: targetLang
    });
    if (!speechState.active || speechState.currentIndex !== index) return;
    if (!response?.audioBase64) throw new Error("Không nhận được âm thanh.");

    const audio = new Audio(`data:${response.contentType || "audio/mpeg"};base64,${response.audioBase64}`);
    speechState.audio = audio;
    currentAudio = audio;

    audio.onended = () => {
      if (!speechState.active || speechState.currentIndex !== index) return;
      playSpeechBlock(index + 1);
    };
    audio.onerror = () => {
      if (!speechState.active || speechState.currentIndex !== index) return;
      playSpeechBlock(index + 1);
    };
    await audio.play();
  } catch (err) {
    console.error("Speech error for block:", err);
    if (speechState.active && speechState.currentIndex === index) {
      setTimeout(() => {
        if (speechState.active && speechState.currentIndex === index) {
          playSpeechBlock(index + 1);
        }
      }, 500);
    }
  }
}

function jumpToSpeechBlock(index) {
  if (!speechState.active) return;
  const clamped = clamp(index, 0, speechState.blocks.length - 1);
  void playSpeechBlock(clamped);
}

function togglePauseSpeech() {
  if (!speechState.active || !speechState.audio) return;
  if (speechState.audio.paused) {
    speechState.audio.play();
    speechState.paused = false;
    if (pauseSpeechBtn) pauseSpeechBtn.textContent = "⏸";
  } else {
    speechState.audio.pause();
    speechState.paused = true;
    if (pauseSpeechBtn) pauseSpeechBtn.textContent = "▶";
  }
}

function stopSpeech() {
  speechState.active = false;
  speechState.paused = false;
  if (speechState.audio) {
    speechState.audio.pause();
    speechState.audio = null;
  }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (readingBar) readingBar.hidden = true;
  if (readingHighlight) readingHighlight.hidden = true;
  updateSpeechButtonState(false);
}

function updateSpeechButtonState(isPlaying, label = "Nghe đọc") {
  for (const btn of [speakButton, speakTextButton].filter(Boolean)) {
    const span = btn.querySelector("span") || btn;
    if (span) span.textContent = isPlaying ? label : "Nghe đọc";
    btn.classList.toggle("is-speaking", isPlaying);
  }
}

function flashButton(button, text) {
  const label = button.querySelector("span") || button.querySelector("strong") || button;
  const previous = label.textContent;
  label.textContent = text;
  button.classList.add("is-success");
  setTimeout(() => {
    label.textContent = previous;
    button.classList.remove("is-success");
  }, 1200);
}

function fitPage() {
  if (!layoutImageWidth || !layoutImageHeight || !canvasWrap) return;
  const wrapW = Math.max(1, canvasWrap.clientWidth - 28);
  const wrapH = Math.max(1, canvasWrap.clientHeight - 28);
  const imageAspect = layoutImageWidth / layoutImageHeight;
  const wrapAspect = wrapW / wrapH;
  if (imageAspect >= wrapAspect) {
    setZoom(1);
  } else {
    const scale = (wrapH * imageAspect) / wrapW;
    setZoom(clamp(Math.round(scale * 100) / 100, 0.2, 4));
  }
}

function syncCompareHandleKnob() {
  if (!canvasWrap || !canvasStage || compareHandle.hidden) return;
  const wrapRect = canvasWrap.getBoundingClientRect();
  const stageRect = canvasStage.getBoundingClientRect();
  if (stageRect.height <= 0) return;

  const visibleTop = Math.max(0, wrapRect.top - stageRect.top);
  const visibleBottom = Math.min(stageRect.height, wrapRect.bottom - stageRect.top);
  const centerY = (visibleTop + visibleBottom) / 2;
  const knobY = clamp(centerY, 18, Math.max(18, stageRect.height - 18));
  canvasStage.style.setProperty("--compare-handle-top", `${knobY}px`);
}

function setZoom(nextZoom, keepAnchor = true, anchorPoint = null) {
  const wrapRect = canvasWrap.getBoundingClientRect();
  const stageRect = canvasStage.getBoundingClientRect();
  const anchorX = Number.isFinite(anchorPoint?.clientX)
    ? anchorPoint.clientX
    : wrapRect.left + canvasWrap.clientWidth / 2;
  const anchorY = Number.isFinite(anchorPoint?.clientY)
    ? anchorPoint.clientY
    : wrapRect.top + canvasWrap.clientHeight / 2;
  const stageRatioX = stageRect.width
    ? clamp((anchorX - stageRect.left) / stageRect.width, 0, 1)
    : 0.5;
  const stageRatioY = stageRect.height
    ? clamp((anchorY - stageRect.top) / stageRect.height, 0, 1)
    : 0.5;

  zoom = clamp(Math.round(nextZoom * 100) / 100, 0.2, 4);
  if (zoom <= 1) {
    canvasStage.style.width = `${zoom * 100}%`;
    canvasStage.style.maxWidth = "100%";
  } else {
    canvasStage.style.width = `${zoom * 100}%`;
    canvasStage.style.maxWidth = "none";
  }
  zoomResetButton.textContent = `${Math.round(zoom * 100)}%`;
  zoomOutButton.disabled = zoom <= 0.2;
  zoomInButton.disabled = zoom >= 4;
  if (keepAnchor) {
    const nextStageRect = canvasStage.getBoundingClientRect();
    const nextAnchorX = nextStageRect.left + nextStageRect.width * stageRatioX;
    const nextAnchorY = nextStageRect.top + nextStageRect.height * stageRatioY;
    canvasWrap.scrollLeft += nextAnchorX - anchorX;
    canvasWrap.scrollTop += nextAnchorY - anchorY;
  }
  requestAnimationFrame(() => {
    syncSelectableTextScale();
    syncCompareHandleKnob();
  });
}

function onCanvasWheel(event) {
  if (!event.ctrlKey) return;
  event.preventDefault();
  setZoom(zoom + (event.deltaY < 0 ? 0.25 : -0.25), true, event);
}

function onPanStart(event) {
  if (interactionMode !== "select" || event.button !== 1 || zoom <= 1) return;
  isPanning = true;
  panStart = { x: event.clientX, y: event.clientY, left: canvasWrap.scrollLeft, top: canvasWrap.scrollTop };
  canvasWrap.setPointerCapture(event.pointerId);
  canvasWrap.classList.add("is-panning");
}

function onPanMove(event) {
  if (!isPanning || !panStart) return;
  canvasWrap.scrollLeft = panStart.left - (event.clientX - panStart.x);
  canvasWrap.scrollTop = panStart.top - (event.clientY - panStart.y);
}

function onPanEnd(event) {
  if (!isPanning) return;
  isPanning = false;
  panStart = null;
  canvasWrap.classList.remove("is-panning");
  if (canvasWrap.hasPointerCapture(event.pointerId)) canvasWrap.releasePointerCapture(event.pointerId);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
