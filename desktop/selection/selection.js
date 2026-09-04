const screenImage = document.getElementById("screenImage");
const shade = document.getElementById("shade");
const selection = document.getElementById("selection");
const sizeLabel = document.getElementById("sizeLabel");
const hint = document.getElementById("hint");
const hintTitle = document.getElementById("hintTitle");
const hintDetail = document.getElementById("hintDetail");
const captureToolbar = document.getElementById("captureToolbar");
const modeText = document.getElementById("modeText");
const modeLayout = document.getElementById("modeLayout");

let context = null;
let start = null;
let currentRect = null;
let dragging = false;
let currentMode = "text";
let modeSwitchBusy = false;

init().catch(() => cancel());

async function init() {
  context = await window.inputBridge.getSelectionContext();
  if (!context) throw new Error("Missing selection context");
  screenImage.src = context.imageDataUrl;
  currentMode = context.captureMode === "layout" ? "layout" : "text";
  applyModeUi(currentMode);
  hint.hidden = !context.primary;

  modeText.addEventListener("click", () => changeMode("text"));
  modeLayout.addEventListener("click", () => changeMode("layout"));
  captureToolbar.addEventListener("pointerdown", (event) => event.stopPropagation());
  captureToolbar.addEventListener("pointerup", (event) => event.stopPropagation());

  window.inputBridge.onSelectionModeUpdated((mode) => {
    currentMode = mode === "layout" ? "layout" : "text";
    applyModeUi(currentMode);
  });

  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") cancel();
  });
  window.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    cancel();
  });
}

async function changeMode(mode) {
  if (modeSwitchBusy || mode === currentMode) return;
  modeSwitchBusy = true;
  captureToolbar.classList.add("busy");
  try {
    const result = await window.inputBridge.setSelectionMode(mode);
    if (result?.ok) {
      currentMode = result.mode === "layout" ? "layout" : "text";
      applyModeUi(currentMode);
    }
  } finally {
    modeSwitchBusy = false;
    captureToolbar.classList.remove("busy");
  }
}

function applyModeUi(mode) {
  const layout = mode === "layout";
  modeText.classList.toggle("active", !layout);
  modeLayout.classList.toggle("active", layout);
  modeText.setAttribute("aria-selected", String(!layout));
  modeLayout.setAttribute("aria-selected", String(layout));
  hintTitle.textContent = layout
    ? "Kéo chọn vùng cần dịch trong ảnh"
    : "Kéo chọn vùng chữ cần dịch";
  hintDetail.textContent = layout
    ? "Kết quả giữ vị trí từng dòng · Esc để hủy"
    : "Kết quả gom thành văn bản · Esc để hủy";
}

function onPointerDown(event) {
  if (event.button !== 0 || event.target.closest("#captureToolbar")) return;
  dragging = true;
  start = point(event);
  currentRect = { x: start.x, y: start.y, width: 1, height: 1 };
  selection.hidden = false;
  shade.hidden = true;
  document.body.classList.add("is-dragging");
  render();
}

function onPointerMove(event) {
  if (!dragging || !start) return;
  currentRect = rectFromPoints(start, point(event));
  render();
}

function onPointerUp(event) {
  if (!dragging || event.button !== 0) return;
  dragging = false;
  document.body.classList.remove("is-dragging");
  currentRect = rectFromPoints(start, point(event));
  if (currentRect.width < 8 || currentRect.height < 8) {
    selection.hidden = true;
    shade.hidden = false;
    start = null;
    currentRect = null;
    return;
  }

  window.inputBridge.submitSelection({
    displayId: context.displayId,
    rect: currentRect,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    },
    mode: currentMode
  }).catch(() => {});
}

function render() {
  if (!currentRect) return;
  selection.style.left = `${currentRect.x}px`;
  selection.style.top = `${currentRect.y}px`;
  selection.style.width = `${currentRect.width}px`;
  selection.style.height = `${currentRect.height}px`;
  sizeLabel.textContent = `${currentRect.width} × ${currentRect.height}`;
  sizeLabel.style.top = currentRect.y < 54 ? `${currentRect.height + 8}px` : "-36px";
}

function point(event) {
  return {
    x: clamp(Math.round(event.clientX), 0, window.innerWidth),
    y: clamp(Math.round(event.clientY), 0, window.innerHeight)
  };
}

function rectFromPoints(first, second) {
  const x = Math.min(first.x, second.x);
  const y = Math.min(first.y, second.y);
  return {
    x,
    y,
    width: Math.max(1, Math.abs(second.x - first.x)),
    height: Math.max(1, Math.abs(second.y - first.y))
  };
}

function cancel() {
  window.inputBridge.cancelSelection().catch(() => {});
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
