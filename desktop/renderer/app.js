const captureButton = document.getElementById("captureButton");
const sourceLanguage = document.getElementById("sourceLanguage");
const targetLanguage = document.getElementById("targetLanguage");
const showOriginal = document.getElementById("showOriginal");
const pushToTalkEnabled = document.getElementById("pushToTalkEnabled");
const startupEnabled = document.getElementById("startupEnabled");
const hotkeyLabel = document.getElementById("hotkeyLabel");
const hotkeyRecorder = document.getElementById("hotkeyRecorder");
const hotkeyValue = document.getElementById("hotkeyValue");
const hotkeyHint = document.getElementById("hotkeyHint");
const resetHotkeyButton = document.getElementById("resetHotkeyButton");
const voiceHotkeyRecorder = document.getElementById("voiceHotkeyRecorder");
const voiceHotkeyValue = document.getElementById("voiceHotkeyValue");
const voiceHotkeyHint = document.getElementById("voiceHotkeyHint");
const resetVoiceHotkeyButton = document.getElementById("resetVoiceHotkeyButton");
const voiceToggleButton = document.getElementById("voiceToggleButton");
const voiceStatus = document.getElementById("voiceStatus");
const minimizeButton = document.getElementById("minimizeButton");
const closeAppButton = document.getElementById("closeAppButton");
const advancedToggle = document.getElementById("advancedToggle");
const advancedContent = document.getElementById("advancedContent");
const message = document.getElementById("message");

const DEFAULT_HOTKEY = "CommandOrControl+Shift+X";
const DEFAULT_VOICE_HOTKEY = "Super+Shift+F";
let settings = null;
let currentHotkey = { accelerator: DEFAULT_HOTKEY, label: "Ctrl + Shift + X" };
let currentVoiceHotkey = { accelerator: DEFAULT_VOICE_HOTKEY, label: "Win + Shift + F" };
let recordingTarget = "capture";
let saveTimer = null;
let recording = false;
let recordingTimer = null;
let activeSelectController = null;

init().catch((error) => showMessage(error?.message || String(error)));

async function init() {
  const data = await window.inputBridge.getBootstrap();
  settings = data.settings;
  currentHotkey = data.hotkey || currentHotkey;
  currentVoiceHotkey = data.voiceHotkey || currentVoiceHotkey;
  renderHotkey(currentHotkey);
  renderVoiceHotkey(currentVoiceHotkey);
  populateLanguages(data.languages || []);
  sourceLanguage.value = settings.sourceLanguage || "Auto detect";
  targetLanguage.value = settings.targetLanguage || "Vietnamese";
  showOriginal.checked = settings.showOriginal !== false;
  pushToTalkEnabled.checked = settings.pushToTalkEnabled !== false;
  startupEnabled.checked = settings.startupEnabled !== false;

  createMacSelect(sourceLanguage, {
    searchPlaceholder: "Tìm ngôn ngữ nhận dạng…",
    emptyText: "Không tìm thấy ngôn ngữ"
  });
  createMacSelect(targetLanguage, {
    searchPlaceholder: "Tìm ngôn ngữ dịch…",
    emptyText: "Không tìm thấy ngôn ngữ"
  });

  captureButton.addEventListener("click", startCapture);
  sourceLanguage.addEventListener("change", scheduleSave);
  targetLanguage.addEventListener("change", scheduleSave);
  showOriginal.addEventListener("change", scheduleSave);
  pushToTalkEnabled.addEventListener("change", scheduleSave);
  startupEnabled.addEventListener("change", updateStartupSetting);
  hotkeyRecorder.addEventListener("click", () => beginHotkeyRecording("capture"));
  resetHotkeyButton.addEventListener("click", () => setHotkey(DEFAULT_HOTKEY));
  voiceHotkeyRecorder.addEventListener("click", () => beginHotkeyRecording("voice"));
  resetVoiceHotkeyButton.addEventListener("click", () => setVoiceHotkey(DEFAULT_VOICE_HOTKEY));
  voiceToggleButton.addEventListener("click", toggleVoice);
  minimizeButton.addEventListener("click", () => window.inputBridge.minimizeWindow());
  closeAppButton.addEventListener("click", () => window.inputBridge.closeWindow());
  advancedToggle.addEventListener("click", toggleAdvancedSettings);
  document.addEventListener("keydown", handleHotkeyRecording, true);
  window.inputBridge.onVoiceStatus(renderVoiceStatus);
  window.inputBridge.onWarning((warning) => showMessage(warning));
}

function populateLanguages(languages) {
  const autoOption = document.createElement("option");
  autoOption.value = "Auto detect";
  autoOption.textContent = "Auto detect · Windows language packs";
  sourceLanguage.appendChild(autoOption);

  for (const language of languages) {
    const sourceOption = document.createElement("option");
    sourceOption.value = language.name;
    sourceOption.textContent = language.name;
    sourceLanguage.appendChild(sourceOption);

    const targetOption = document.createElement("option");
    targetOption.value = language.name;
    targetOption.textContent = language.name;
    targetLanguage.appendChild(targetOption);
  }
}

function createMacSelect(select, { searchPlaceholder, emptyText }) {
  const root = document.createElement("div");
  root.className = "mac-select";
  select.parentNode.insertBefore(root, select);
  root.appendChild(select);
  select.classList.add("native-select");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "mac-select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const valueLabel = document.createElement("span");
  valueLabel.className = "mac-select-value";
  const arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  arrow.classList.add("mac-select-arrow");
  arrow.setAttribute("viewBox", "0 0 13 13");
  arrow.setAttribute("aria-hidden", "true");
  const arrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  arrowPath.setAttribute("d", "M2.5 4.75 6.5 8.25l4-3.5");
  arrowPath.setAttribute("fill", "none");
  arrowPath.setAttribute("stroke", "currentColor");
  arrowPath.setAttribute("stroke-width", "1.35");
  arrowPath.setAttribute("stroke-linecap", "round");
  arrowPath.setAttribute("stroke-linejoin", "round");
  arrow.appendChild(arrowPath);
  trigger.append(valueLabel, arrow);
  root.insertBefore(trigger, select);

  const panel = document.createElement("div");
  panel.className = "mac-select-popover";
  panel.hidden = true;
  panel.innerHTML = `
    <div class="mac-select-search-wrap">
      <input class="mac-select-search" type="search" autocomplete="off" spellcheck="false">
    </div>
    <div class="mac-select-list" role="listbox"></div>
  `;
  document.body.appendChild(panel);

  const search = panel.querySelector(".mac-select-search");
  const list = panel.querySelector(".mac-select-list");
  search.placeholder = searchPlaceholder;
  let visibleOptions = [];
  let highlightedIndex = 0;

  const controller = {
    close,
    reposition: positionPanel
  };

  function getOptions() {
    return Array.from(select.options).map((option) => ({
      value: option.value,
      label: option.textContent || option.value
    }));
  }

  function syncValue() {
    const selected = select.selectedOptions[0];
    valueLabel.textContent = selected?.textContent || select.value;
  }

  function renderOptions(query = "") {
    const normalized = query.trim().toLocaleLowerCase();
    visibleOptions = getOptions().filter((option) =>
      !normalized || option.label.toLocaleLowerCase().includes(normalized)
    );
    highlightedIndex = Math.min(highlightedIndex, Math.max(0, visibleOptions.length - 1));
    list.replaceChildren();

    if (!visibleOptions.length) {
      const empty = document.createElement("div");
      empty.className = "mac-select-empty";
      empty.textContent = emptyText;
      list.appendChild(empty);
      return;
    }

    visibleOptions.forEach((option, index) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "mac-select-option";
      item.dataset.index = String(index);
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option.value === select.value));
      item.classList.toggle("selected", option.value === select.value);
      item.classList.toggle("highlighted", index === highlightedIndex);
      item.textContent = option.label;
      item.addEventListener("pointerenter", () => {
        highlightedIndex = index;
        updateHighlight();
      });
      item.addEventListener("click", () => choose(option));
      list.appendChild(item);
    });
  }

  function updateHighlight() {
    list.querySelectorAll(".mac-select-option").forEach((item, index) => {
      item.classList.toggle("highlighted", index === highlightedIndex);
    });
    list.querySelector(`[data-index="${highlightedIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }

  function choose(option) {
    select.value = option.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    syncValue();
    close();
    trigger.focus();
  }

  function open() {
    if (!panel.hidden) return;
    activeSelectController?.close();
    activeSelectController = controller;
    panel.hidden = false;
    trigger.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
    search.value = "";
    highlightedIndex = Math.max(0, getOptions().findIndex((option) => option.value === select.value));
    renderOptions();
    positionPanel();
    document.addEventListener("pointerdown", handleOutsidePointer, true);
    window.addEventListener("resize", positionPanel);
    document.querySelector(".app-shell")?.addEventListener("scroll", positionPanel, { passive: true });
    requestAnimationFrame(() => search.focus());
  }

  function close() {
    if (panel.hidden) return;
    panel.hidden = true;
    trigger.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", handleOutsidePointer, true);
    window.removeEventListener("resize", positionPanel);
    document.querySelector(".app-shell")?.removeEventListener("scroll", positionPanel);
    if (activeSelectController === controller) activeSelectController = null;
  }

  function positionPanel() {
    if (panel.hidden) return;
    const rect = trigger.getBoundingClientRect();
    const edge = 10;
    const gap = 6;
    const idealHeight = 276;
    const below = window.innerHeight - rect.bottom - edge;
    const above = rect.top - edge;
    const openAbove = below < 210 && above > below;
    const available = Math.max(150, Math.min(idealHeight, (openAbove ? above : below) - gap));
    const width = Math.min(rect.width, window.innerWidth - edge * 2);
    const left = Math.max(edge, Math.min(rect.left, window.innerWidth - width - edge));
    panel.style.left = `${Math.round(left)}px`;
    panel.style.width = `${Math.round(width)}px`;
    panel.style.maxHeight = `${Math.round(available)}px`;
    panel.classList.toggle("above", openAbove);
    panel.style.top = openAbove
      ? `${Math.round(rect.top - available - gap)}px`
      : `${Math.round(rect.bottom + gap)}px`;
  }

  function handleOutsidePointer(event) {
    if (!root.contains(event.target) && !panel.contains(event.target)) close();
  }

  trigger.addEventListener("click", () => panel.hidden ? open() : close());
  trigger.addEventListener("keydown", (event) => {
    if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      open();
    }
  });
  search.addEventListener("input", () => {
    highlightedIndex = 0;
    renderOptions(search.value);
  });
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      trigger.focus();
      return;
    }
    if (!visibleOptions.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      highlightedIndex = (highlightedIndex + direction + visibleOptions.length) % visibleOptions.length;
      updateHighlight();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      choose(visibleOptions[highlightedIndex]);
    }
  });
  select.addEventListener("change", syncValue);
  syncValue();
}

function toggleAdvancedSettings() {
  const expanded = advancedToggle.getAttribute("aria-expanded") === "true";
  advancedToggle.setAttribute("aria-expanded", String(!expanded));
  advancedContent.hidden = expanded;
  if (!expanded) {
    requestAnimationFrame(() => advancedToggle.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 180);
}

async function saveNow() {
  try {
    settings = await window.inputBridge.saveSettings({
      sourceLanguage: sourceLanguage.value,
      targetLanguage: targetLanguage.value,
      showOriginal: showOriginal.checked,
      pushToTalkEnabled: pushToTalkEnabled.checked
    });
    showMessage("Đã lưu.", true);
  } catch (error) {
    showMessage(error?.message || String(error));
  }
}

async function updateStartupSetting() {
  const requested = startupEnabled.checked;
  startupEnabled.disabled = true;
  try {
    const result = await window.inputBridge.setStartupEnabled(requested);
    if (!result?.ok) throw new Error(result?.error || "Không cập nhật được thiết lập khởi động.");
    settings = { ...settings, startupEnabled: result.enabled };
    startupEnabled.checked = result.enabled;
    showMessage(result.enabled ? "Sẽ chạy ẩn khi đăng nhập Windows." : "Đã tắt khởi động cùng Windows.", true);
  } catch (error) {
    startupEnabled.checked = settings.startupEnabled !== false;
    showMessage(error?.message || String(error));
  } finally {
    startupEnabled.disabled = false;
  }
}

async function startCapture() {
  captureButton.disabled = true;
  showMessage("");
  try {
    await saveNow();
    const result = await window.inputBridge.startCapture();
    if (!result?.ok) throw new Error(result?.error || "Không mở được chế độ chọn vùng.");
  } catch (error) {
    showMessage(error?.message || String(error));
  } finally {
    captureButton.disabled = false;
  }
}

function beginHotkeyRecording(target = "capture") {
  clearTimeout(recordingTimer);
  recording = true;
  recordingTarget = target;
  const recorder = target === "voice" ? voiceHotkeyRecorder : hotkeyRecorder;
  const value = target === "voice" ? voiceHotkeyValue : hotkeyValue;
  const hint = target === "voice" ? voiceHotkeyHint : hotkeyHint;
  recorder.classList.add("recording");
  value.textContent = "Nhấn tổ hợp phím…";
  hint.textContent = "Esc để hủy · cần phím chính, không chỉ modifier";
  recorder.focus();
  recordingTimer = setTimeout(cancelHotkeyRecording, 10000);
}

function cancelHotkeyRecording() {
  if (!recording) return;
  recording = false;
  clearTimeout(recordingTimer);
  hotkeyRecorder.classList.remove("recording");
  voiceHotkeyRecorder.classList.remove("recording");
  renderHotkey(currentHotkey);
  renderVoiceHotkey(currentVoiceHotkey);
}

async function handleHotkeyRecording(event) {
  if (!recording || event.repeat) return;
  event.preventDefault();
  event.stopPropagation();

  if (event.key === "Escape") {
    cancelHotkeyRecording();
    return;
  }

  const accelerator = acceleratorFromEvent(event);
  if (!accelerator) {
    (recordingTarget === "voice" ? voiceHotkeyValue : hotkeyValue).textContent = "Đang chờ phím chính…";
    return;
  }

  recording = false;
  clearTimeout(recordingTimer);
  hotkeyRecorder.classList.remove("recording");
  voiceHotkeyRecorder.classList.remove("recording");
  if (recordingTarget === "voice") await setVoiceHotkey(accelerator);
  else await setHotkey(accelerator);
}

function acceleratorFromEvent(event) {
  const key = acceleratorKey(event);
  if (!key) return "";

  const modifiers = [];
  if (event.ctrlKey) modifiers.push("CommandOrControl");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  if (event.metaKey) modifiers.push("Super");

  const canStandAlone = /^F(?:[1-9]|1\d|2[0-4])$/.test(key) || key === "PrintScreen";
  if (!modifiers.length && !canStandAlone) {
    showMessage("Phím tắt nên có Ctrl, Alt, Shift hoặc Win. F1–F24 và Print Screen có thể dùng riêng.");
    return "";
  }

  return [...modifiers, key].join("+");
}

function acceleratorKey(event) {
  const code = String(event.code || "");
  const rawKey = String(event.key || "");
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F(?:[1-9]|1\d|2[0-4])$/.test(code)) return code;
  if (/^[a-z0-9]$/i.test(rawKey)) return rawKey.toUpperCase();
  if (/^F(?:[1-9]|1\d|2[0-4])$/i.test(rawKey)) return rawKey.toUpperCase();

  const keys = {
    Space: "Space",
    " ": "Space",
    Enter: "Return",
    Tab: "Tab",
    Backspace: "Backspace",
    Delete: "Delete",
    Insert: "Insert",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    PrintScreen: "PrintScreen",
    Pause: "Pause"
  };
  return keys[code] || keys[rawKey] || "";
}

async function setHotkey(accelerator) {
  hotkeyValue.textContent = "Đang đăng ký…";
  hotkeyHint.textContent = "Kiểm tra xung đột phím tắt";
  try {
    const result = await window.inputBridge.setHotkey(accelerator);
    if (!result?.ok) throw new Error(result?.error || "Không đăng ký được phím tắt.");
    currentHotkey = {
      accelerator: result.accelerator,
      label: result.label
    };
    settings = { ...settings, hotkey: result.accelerator };
    renderHotkey(currentHotkey);
    showMessage("Đã đổi phím tắt.", true);
  } catch (error) {
    renderHotkey(currentHotkey);
    const errorMessage = error?.message || String(error);
    hotkeyHint.textContent = errorMessage;
    showMessage(errorMessage);
  }
}

function renderHotkey(hotkey) {
  const label = hotkey?.label || "Ctrl + Shift + X";
  hotkeyLabel.textContent = label;
  hotkeyValue.textContent = label;
  hotkeyHint.textContent = "Bấm vào đây rồi nhấn tổ hợp mới";
}

async function setVoiceHotkey(accelerator) {
  voiceHotkeyValue.textContent = "Đang đăng ký…";
  voiceHotkeyHint.textContent = "Kiểm tra xung đột phím tắt";
  try {
    const result = await window.inputBridge.setVoiceHotkey(accelerator);
    if (!result?.ok) throw new Error(result?.error || "Không đăng ký được phím voice.");
    currentVoiceHotkey = { accelerator: result.accelerator, label: result.label };
    settings = { ...settings, voiceHotkey: result.accelerator };
    renderVoiceHotkey(currentVoiceHotkey);
    showMessage("Đã đổi phím voice.", true);
  } catch (error) {
    renderVoiceHotkey(currentVoiceHotkey);
    showMessage(error?.message || String(error));
  }
}

function renderVoiceHotkey(hotkey) {
  const label = hotkey?.label || "Win + Shift + F";
  voiceHotkeyValue.textContent = label;
  voiceHotkeyHint.textContent = "Bấm lần 1 để nói, lần 2 để dừng";
}

async function toggleVoice() {
  const result = await window.inputBridge.toggleVoice();
  if (!result?.ok) showMessage(result?.error || "Không bật được voice input.");
}

function renderVoiceStatus(data = {}) {
  const labels = {
    starting: "Đang mở micro…",
    recording: data.partial ? `Đang nghe: ${data.partial}` : "Đang nghe…",
    processing: "Đang nhận âm thanh…",
    transcribing: "Đang chép lời bằng Whisper…",
    translating: "Đang dịch…",
    done: "Đã dịch và chèn vào ô đang focus",
    error: data.error || "Voice input lỗi"
  };
  voiceStatus.textContent = labels[data.status] || "Sẵn sàng";
  const active = ["starting", "recording", "processing", "transcribing", "translating"].includes(data.status);
  voiceToggleButton.textContent = active ? "Dừng và chèn" : "Bắt đầu nói";
  voiceToggleButton.classList.toggle("active", active);
  if (data.status === "error") showMessage(data.error || "Voice input lỗi");
}

function showMessage(text, success = false) {
  message.textContent = text || "";
  message.classList.toggle("success", Boolean(success && text));
  clearTimeout(showMessage.timer);
  if (text && success) {
    showMessage.timer = setTimeout(() => {
      message.textContent = "";
      message.classList.remove("success");
    }, 1600);
  }
}
