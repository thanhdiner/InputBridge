const loading = document.getElementById("loading");
const loadingText = document.getElementById("loadingText");
const preview = document.getElementById("preview");
const layoutBlock = document.getElementById("layoutBlock");
const layoutCanvas = document.getElementById("layoutCanvas");
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
const resultTitle = document.getElementById("resultTitle");

let current = null;
let drawVersion = 0;
let canvasReady = false;
let zoom = 1;
let isPanning = false;
let panStart = null;

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
  canvasWrap.addEventListener("wheel", onCanvasWheel, { passive: false });
  canvasWrap.addEventListener("pointerdown", onPanStart);
  canvasWrap.addEventListener("pointermove", onPanMove);
  canvasWrap.addEventListener("pointerup", onPanEnd);
  canvasWrap.addEventListener("pointercancel", onPanEnd);
  layoutCanvas.addEventListener("dblclick", () => setZoom(1));
  window.addEventListener("resize", () => {
    if (current?.mode === "layout") canvasWrap.scrollTop = 0;
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

  layoutCanvas.width = image.naturalWidth;
  layoutCanvas.height = image.naturalHeight;
  setZoom(zoom, false);
  const context2d = layoutCanvas.getContext("2d", { alpha: false });
  context2d.imageSmoothingEnabled = true;
  context2d.imageSmoothingQuality = "high";
  context2d.drawImage(image, 0, 0);

  if (data.status === "done") {
    for (const block of Array.isArray(data.layoutBlocks) ? data.layoutBlocks : []) {
      drawTranslatedBlock(context2d, block, image.naturalWidth, image.naturalHeight);
    }
  }

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

async function copyTranslation() {
  const text = String(current?.translation || "").trim();
  if (!text) return;
  await window.inputBridge.copyResult(text);
  flashButton(copyButton, "Đã sao chép");
}

async function copyLayoutImage() {
  if (!canvasReady) return;
  const dataUrl = layoutCanvas.toDataURL("image/png");
  const result = await window.inputBridge.copyResultImage(dataUrl);
  if (result?.ok) flashButton(copyImageButton, "Đã sao chép");
}

function flashButton(button, text) {
  const previous = button.textContent;
  button.textContent = text;
  setTimeout(() => { button.textContent = previous; }, 1200);
}

function setZoom(nextZoom, keepCenter = true) {
  const previous = zoom;
  zoom = clamp(Math.round(nextZoom * 100) / 100, 0.5, 4);
  const centerX = canvasWrap.scrollLeft + canvasWrap.clientWidth / 2;
  const centerY = canvasWrap.scrollTop + canvasWrap.clientHeight / 2;
  layoutCanvas.style.width = `${zoom * 100}%`;
  layoutCanvas.style.maxWidth = "none";
  zoomResetButton.textContent = `${Math.round(zoom * 100)}%`;
  zoomOutButton.disabled = zoom <= 0.5;
  zoomInButton.disabled = zoom >= 4;
  if (keepCenter && previous > 0) {
    requestAnimationFrame(() => {
      const ratio = zoom / previous;
      canvasWrap.scrollLeft = centerX * ratio - canvasWrap.clientWidth / 2;
      canvasWrap.scrollTop = centerY * ratio - canvasWrap.clientHeight / 2;
    });
  }
}

function onCanvasWheel(event) {
  if (!event.ctrlKey) return;
  event.preventDefault();
  setZoom(zoom + (event.deltaY < 0 ? 0.25 : -0.25));
}

function onPanStart(event) {
  if (event.button !== 0 || zoom <= 1) return;
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
