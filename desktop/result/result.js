const loading = document.getElementById("loading");
const loadingText = document.getElementById("loadingText");
const preview = document.getElementById("preview");
const layoutBlock = document.getElementById("layoutBlock");
const layoutCanvas = document.getElementById("layoutCanvas");
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
const copyButton = document.getElementById("copyButton");
const copyImageButton = document.getElementById("copyImageButton");
const recaptureButton = document.getElementById("recaptureButton");
const closeButton = document.getElementById("closeButton");
const openMainButton = document.getElementById("openMainButton");
const zoomOutButton = document.getElementById("zoomOutButton");
const zoomResetButton = document.getElementById("zoomResetButton");
const zoomInButton = document.getElementById("zoomInButton");
const selectTextButton = document.getElementById("selectTextButton");
const drawButton = document.getElementById("drawButton");
const eraseButton = document.getElementById("eraseButton");
const clearDrawingButton = document.getElementById("clearDrawingButton");
const resultTitle = document.getElementById("resultTitle");
const selectionToolbar = document.getElementById("selectionToolbar");
const copySelectionButton = document.getElementById("copySelectionButton");

let current = null;
let drawVersion = 0;
let canvasReady = false;
let zoom = 1;
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

  copyButton.addEventListener("click", copyTranslation);
  copyImageButton.addEventListener("click", copyLayoutImage);
  recaptureButton.addEventListener("click", () => window.inputBridge.recapture());
  closeButton.addEventListener("click", () => window.inputBridge.closeResult());
  openMainButton.addEventListener("click", () => window.inputBridge.showMain());
  zoomOutButton.addEventListener("click", () => setZoom(zoom - 0.25));
  zoomInButton.addEventListener("click", () => setZoom(zoom + 0.25));
  zoomResetButton.addEventListener("click", () => setZoom(1));
  selectTextButton.addEventListener("click", () => setInteractionMode("select"));
  drawButton.addEventListener("click", () => setInteractionMode("draw"));
  eraseButton.addEventListener("click", () => setInteractionMode("erase"));
  clearDrawingButton.addEventListener("click", clearDrawing);
  copySelectionButton.addEventListener("pointerdown", (event) => event.preventDefault());
  copySelectionButton.addEventListener("click", copySelectedLayoutText);
  drawingCanvas.addEventListener("pointerdown", onDrawStart);
  drawingCanvas.addEventListener("pointermove", onDrawMove);
  drawingCanvas.addEventListener("pointerup", onDrawEnd);
  drawingCanvas.addEventListener("pointercancel", onDrawEnd);
  canvasWrap.addEventListener("wheel", onCanvasWheel, { passive: false });
  canvasWrap.addEventListener("pointerdown", onPanStart);
  canvasWrap.addEventListener("pointermove", onPanMove);
  canvasWrap.addEventListener("pointerup", onPanEnd);
  canvasWrap.addEventListener("pointercancel", onPanEnd);
  layoutCanvas.addEventListener("dblclick", () => setZoom(1));
  document.addEventListener("selectionchange", scheduleSelectionToolbarUpdate);
  document.addEventListener("keydown", onSelectionShortcut);
  canvasWrap.addEventListener("scroll", scheduleSelectionToolbarUpdate, { passive: true });
  window.addEventListener("blur", hideSelectionToolbar);
  window.addEventListener("resize", () => {
    if (current?.mode !== "layout") return;
    syncSelectableTextScale();
    scheduleSelectionToolbarUpdate();
  });
}

function render(data = {}) {
  const status = data.status || "loading";
  const layoutMode = data.mode === "layout";
  loading.hidden = status !== "loading";
  loadingText.textContent = data.meta || "Đang xử lý…";
  resultTitle.textContent = layoutMode ? "Dịch trong ảnh" : "Dịch màn hình";
  document.body.classList.toggle("layout-mode", layoutMode);

  preview.hidden = layoutMode || !data.previewDataUrl;
  if (!preview.hidden) preview.src = data.previewDataUrl;

  const original = String(data.original || "").trim();
  const translation = String(data.translation || "").trim();
  const showOriginal = data.showOriginal !== false;

  originalText.textContent = original;
  originalBlock.hidden = layoutMode || !original || !showOriginal;
  translationText.textContent = translation;
  translationBlock.hidden = layoutMode || !translation;

  layoutBlock.hidden = !layoutMode || !data.layoutImageDataUrl;
  copyImageButton.disabled = true;
  canvasReady = false;
  if (!layoutBlock.hidden) void drawLayoutResult(data);

  errorBlock.hidden = status !== "error";
  errorText.textContent = status === "error" ? String(data.error || "Lỗi không xác định.") : "";
  meta.textContent = data.meta || "";
}

async function drawLayoutResult(data) {
  const version = ++drawVersion;
  const image = await loadImage(data.layoutImageDataUrl);
  if (version !== drawVersion) return;

  layoutImageWidth = image.naturalWidth;
  layoutImageHeight = image.naturalHeight;
  layoutCanvas.width = image.naturalWidth;
  layoutCanvas.height = image.naturalHeight;
  drawingCanvas.width = image.naturalWidth;
  drawingCanvas.height = image.naturalHeight;
  canvasStage.style.aspectRatio = `${image.naturalWidth} / ${image.naturalHeight}`;
  drawingHasContent = false;
  clearDrawingButton.disabled = true;
  setZoom(zoom, false);
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
  requestAnimationFrame(syncSelectableTextScale);

  canvasReady = data.status === "done";
  copyImageButton.disabled = !canvasReady;
}

function drawTranslatedBlock(context2d, block, imageWidth, imageHeight) {
  const originalHeight = clamp(Number(block?.height || 1), 1, imageHeight);
  const outerPad = Math.max(2, Math.round(originalHeight * 0.12));
  const x = clamp(Math.round(Number(block?.x || 0)) - outerPad, 0, imageWidth - 1);
  const y = clamp(Math.round(Number(block?.y || 0)) - outerPad, 0, imageHeight - 1);
  const width = clamp(Math.round(Number(block?.width || 1)) + outerPad * 2, 1, imageWidth - x);
  const height = clamp(Math.round(originalHeight) + outerPad * 2, 1, imageHeight - y);
  const text = String(block?.translation || block?.text || "").trim();
  if (!text) return;

  const luminance = averageLuminance(context2d, x, y, width, height);
  const darkSurface = luminance < 118;
  context2d.save();
  roundedRect(context2d, x, y, width, height, Math.min(8, height * 0.22));
  context2d.fillStyle = darkSurface ? "rgba(18, 23, 34, 0.91)" : "rgba(250, 252, 255, 0.92)";
  context2d.fill();
  context2d.strokeStyle = darkSurface ? "rgba(255,255,255,.22)" : "rgba(62,78,108,.18)";
  context2d.lineWidth = Math.max(1, Math.round(Math.min(imageWidth, imageHeight) / 900));
  context2d.stroke();
  context2d.clip();

  const innerPad = Math.max(3, Math.round(height * 0.12));
  const textWidth = Math.max(1, width - innerPad * 2);
  const textHeight = Math.max(1, height - innerPad * 2);
  const fit = fitText(context2d, text, textWidth, textHeight, height);
  context2d.fillStyle = darkSurface ? "#ffffff" : "#172034";
  context2d.textBaseline = "top";
  context2d.textAlign = "left";
  context2d.font = `600 ${fit.fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

  const visibleLines = fit.lines.slice(0, fit.maxLines);
  if (fit.lines.length > fit.maxLines && visibleLines.length) {
    visibleLines[visibleLines.length - 1] = trimWithEllipsis(context2d, visibleLines[visibleLines.length - 1], textWidth);
  }
  const totalHeight = visibleLines.length * fit.lineHeight;
  let cursorY = y + innerPad + Math.max(0, (textHeight - totalHeight) / 2);
  for (const line of visibleLines) {
    context2d.fillText(line, x + innerPad, cursorY, textWidth);
    cursorY += fit.lineHeight;
  }
  context2d.restore();

  return {
    text: visibleLines.join("\n"),
    x: x + innerPad,
    y: y + innerPad + Math.max(0, (textHeight - totalHeight) / 2),
    width: textWidth,
    height: Math.min(textHeight, totalHeight),
    fontSize: fit.fontSize,
    lineHeight: fit.lineHeight
  };
}

function fitText(context2d, text, maxWidth, maxHeight, originalHeight) {
  const startSize = clamp(Math.floor(originalHeight * 0.68), 9, 40);
  let best = null;
  for (let fontSize = startSize; fontSize >= 7; fontSize -= 1) {
    context2d.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    const lines = wrapText(context2d, text, maxWidth);
    const lineHeight = Math.ceil(fontSize * 1.16);
    const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
    best = { fontSize, lines, lineHeight, maxLines };
    if (lines.length <= maxLines) return best;
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

function averageLuminance(context2d, x, y, width, height) {
  const sampleWidth = Math.max(1, Math.min(40, width));
  const sampleHeight = Math.max(1, Math.min(20, height));
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = sampleWidth;
  sampleCanvas.height = sampleHeight;
  const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
  sampleContext.drawImage(layoutCanvas, x, y, width, height, 0, 0, sampleWidth, sampleHeight);
  const pixels = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight).data;
  let total = 0;
  let count = 0;
  for (let index = 0; index < pixels.length; index += 16) {
    total += pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
    count += 1;
  }
  return count ? total / count : 255;
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
  interactionHint.textContent = mode === "select"
    ? "Bôi đen chữ để hiện nút sao chép · Ctrl + lăn để phóng to"
    : mode === "draw"
      ? "Kéo chuột để vẽ lên ảnh"
      : "Kéo qua nét vẽ để tẩy";
}

function scheduleSelectionToolbarUpdate() {
  cancelAnimationFrame(selectionUpdateFrame);
  selectionUpdateFrame = requestAnimationFrame(updateSelectionToolbar);
}

function updateSelectionToolbar() {
  selectionUpdateFrame = 0;
  if (interactionMode !== "select" || layoutBlock.hidden) {
    hideSelectionToolbar();
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
}

function hideSelectionToolbar() {
  selectedLayoutText = "";
  selectionToolbar.hidden = true;
  selectionToolbar.classList.remove("is-copied");
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

function flashButton(button, text) {
  const previous = button.textContent;
  button.textContent = text;
  setTimeout(() => { button.textContent = previous; }, 1200);
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

  zoom = clamp(Math.round(nextZoom * 100) / 100, 0.5, 4);
  canvasStage.style.width = `${zoom * 100}%`;
  canvasStage.style.maxWidth = "none";
  zoomResetButton.textContent = `${Math.round(zoom * 100)}%`;
  zoomOutButton.disabled = zoom <= 0.5;
  zoomInButton.disabled = zoom >= 4;
  if (keepAnchor) {
    const nextStageRect = canvasStage.getBoundingClientRect();
    const nextAnchorX = nextStageRect.left + nextStageRect.width * stageRatioX;
    const nextAnchorY = nextStageRect.top + nextStageRect.height * stageRatioY;
    canvasWrap.scrollLeft += nextAnchorX - anchorX;
    canvasWrap.scrollTop += nextAnchorY - anchorY;
  }
  requestAnimationFrame(syncSelectableTextScale);
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
