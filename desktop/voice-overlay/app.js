const overlay = document.getElementById("overlay");
const voiceTitle = document.getElementById("voiceTitle");
const voiceSubtitle = document.getElementById("voiceSubtitle");
const levelBars = [...document.querySelectorAll(".level-bars i")];

const ACTIVE_STATUSES = new Set(["starting", "recording", "processing", "transcribing", "translating", "done", "error"]);
let mediaRecorder = null;
let mediaStream = null;
let audioContext = null;
let analyser = null;
let levelFrame = 0;
let chunks = [];
let recordingStartedAt = 0;
let pendingStop = false;

function compact(value, maxLength = 82) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function renderVoiceStatus(data = {}) {
  const status = ACTIVE_STATUSES.has(data.status) ? data.status : "starting";
  overlay.className = `voice-overlay ${status}`;

  if (status === "recording") {
    voiceTitle.textContent = "Đang nghe…";
    voiceSubtitle.textContent = compact(data.partial || data.text) || (data.trigger === "ptt"
      ? "Thả Right Ctrl để xử lý"
      : "Win + Shift + F để dừng");
    return;
  }

  if (status === "processing") {
    voiceTitle.textContent = "Đang nhận âm thanh…";
    voiceSubtitle.textContent = "Giữ nguyên ô input, InputBridge đang xử lý";
    return;
  }

  if (status === "transcribing") {
    voiceTitle.textContent = "Đang chép lời…";
    voiceSubtitle.textContent = "Whisper đang nhận dạng giọng nói";
    return;
  }

  if (status === "translating") {
    voiceTitle.textContent = "Đang dịch…";
    voiceSubtitle.textContent = compact(data.original) || "Sắp chèn vào ô input";
    return;
  }

  if (status === "done") {
    voiceTitle.textContent = "Đã chèn văn bản";
    voiceSubtitle.textContent = compact(data.translation) || "Hoàn tất";
    return;
  }

  if (status === "error") {
    voiceTitle.textContent = "Voice input chưa chạy được";
    voiceSubtitle.textContent = compact(data.error, 112) || "Kiểm tra micro rồi thử lại";
    return;
  }

  voiceTitle.textContent = "Đang mở micro…";
  voiceSubtitle.textContent = data.trigger === "ptt"
    ? "Giữ Right Ctrl, thả ra để xử lý"
    : "Win + Shift + F để dừng";
}

function pickMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus"
  ];
  return candidates.find((value) => MediaRecorder.isTypeSupported(value)) || "";
}

function report(payload) {
  window.inputBridge.reportVoiceRecorderStatus(payload);
}

function updateLevel(level) {
  const normalized = Math.max(0, Math.min(1, Number(level) || 0));
  levelBars.forEach((bar, index) => {
    const spread = [0.72, 1, 1.28, 0.92, 0.64][index] || 1;
    const height = 7 + Math.round(Math.min(1, normalized * spread) * 19);
    bar.style.height = `${height}px`;
    bar.style.opacity = String(0.55 + Math.min(1, normalized * 1.8) * 0.45);
  });
}

function startLevelMeter(stream) {
  stopLevelMeter();
  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.72;
  source.connect(analyser);
  const values = new Uint8Array(analyser.fftSize);
  let lastReportAt = 0;

  const tick = (now) => {
    if (!analyser) return;
    analyser.getByteTimeDomainData(values);
    let sum = 0;
    for (const value of values) {
      const sample = (value - 128) / 128;
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / values.length);
    const visualLevel = Math.min(1, rms * 12);
    updateLevel(visualLevel);
    if (now - lastReportAt > 220) {
      lastReportAt = now;
      report({ status: "level", level: visualLevel });
    }
    levelFrame = requestAnimationFrame(tick);
  };
  levelFrame = requestAnimationFrame(tick);
}

function stopLevelMeter() {
  if (levelFrame) cancelAnimationFrame(levelFrame);
  levelFrame = 0;
  analyser = null;
  if (audioContext) void audioContext.close().catch(() => {});
  audioContext = null;
  updateLevel(0);
}

function releaseMedia() {
  stopLevelMeter();
  if (mediaStream) mediaStream.getTracks().forEach((track) => track.stop());
  mediaStream = null;
  mediaRecorder = null;
}

async function startRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") return;
  pendingStop = false;
  chunks = [];

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1
      }
    });
    const mimeType = pickMimeType();
    mediaRecorder = mimeType
      ? new MediaRecorder(mediaStream, { mimeType, audioBitsPerSecond: 64000 })
      : new MediaRecorder(mediaStream);

    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data?.size) chunks.push(event.data);
    });
    mediaRecorder.addEventListener("error", (event) => {
      report({ status: "error", error: event.error?.message || "Không ghi được âm thanh từ micro." });
      releaseMedia();
    });
    mediaRecorder.addEventListener("stop", async () => {
      const durationMs = Math.max(0, Date.now() - recordingStartedAt);
      const blob = new Blob(chunks, { type: mediaRecorder?.mimeType || mimeType || "audio/webm" });
      const blobType = blob.type || "audio/webm";
      releaseMedia();
      chunks = [];

      if (blob.size < 800) {
        report({ status: "error", error: "Micro không thu được dữ liệu âm thanh." });
        return;
      }

      try {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const result = await window.inputBridge.submitVoiceAudio({ bytes, mimeType: blobType, durationMs });
        if (!result?.ok) report({ status: "error", error: result?.error || "Không xử lý được âm thanh." });
      } catch (error) {
        report({ status: "error", error: error?.message || String(error) });
      }
    }, { once: true });

    recordingStartedAt = Date.now();
    mediaRecorder.start(250);
    startLevelMeter(mediaStream);
    report({ status: "recording", mimeType: mediaRecorder.mimeType });
    if (pendingStop) stopRecording();
  } catch (error) {
    releaseMedia();
    report({
      status: "error",
      error: error?.name === "NotAllowedError"
        ? "Windows đang chặn quyền micro cho InputBridge."
        : (error?.message || String(error))
    });
  }
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    pendingStop = true;
    return;
  }
  pendingStop = false;
  try {
    mediaRecorder.requestData();
    mediaRecorder.stop();
  } catch (error) {
    report({ status: "error", error: error?.message || String(error) });
    releaseMedia();
  }
}

window.inputBridge.onVoiceStatus(renderVoiceStatus);
window.inputBridge.onVoiceRecorderCommand((command = {}) => {
  if (command.action === "start") void startRecording();
  if (command.action === "stop") stopRecording();
});
