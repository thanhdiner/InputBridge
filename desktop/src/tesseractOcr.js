const path = require("node:path");
const { createWorker, OEM, PSM } = require("tesseract.js");

let workerPromise = null;

function normalizeText(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

async function getVietnameseWorker({ langPath, cachePath }) {
  if (!workerPromise) {
    workerPromise = createWorker("vie", OEM.LSTM_ONLY, {
      langPath,
      cachePath,
      gzip: true
    }).then(async (worker) => {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: "1",
        user_defined_dpi: "300"
      });
      return worker;
    }).catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

function normalizeLines(blocks) {
  const lines = [];
  for (const block of Array.isArray(blocks) ? blocks : []) {
    for (const paragraph of Array.isArray(block?.paragraphs) ? block.paragraphs : []) {
      for (const line of Array.isArray(paragraph?.lines) ? paragraph.lines : []) {
        const text = String(line?.text || "").trim();
        const words = (Array.isArray(line?.words) ? line.words : [])
          .map((word) => {
            const box = word?.bbox || {};
            const x = Number(box.x0);
            const y = Number(box.y0);
            const x1 = Number(box.x1);
            const y1 = Number(box.y1);
            const wordText = String(word?.text || "").trim();
            if (!wordText || ![x, y, x1, y1].every(Number.isFinite)) return null;
            return {
              text: wordText,
              x,
              y,
              width: Math.max(1, x1 - x),
              height: Math.max(1, y1 - y)
            };
          })
          .filter(Boolean);
        if (text && words.length) lines.push({ text, words });
      }
    }
  }
  return lines;
}

async function recognizeVietnamese(imagePath, options) {
  const worker = await getVietnameseWorker(options);
  const imageSize = options.imageSize || {};
  const width = Math.max(1, Number(imageSize.width) || 1);
  const height = Math.max(1, Number(imageSize.height) || 1);
  const segmentationMode = width / height >= 6 ? PSM.SINGLE_LINE : PSM.AUTO;
  await worker.setParameters({
    tessedit_pageseg_mode: segmentationMode,
    preserve_interword_spaces: "1",
    user_defined_dpi: "300"
  });
  const { data } = await worker.recognize(imagePath, {}, { blocks: true });
  const confidence = Math.max(0, Math.min(1, Number(data?.confidence || 0) / 100));
  const text = normalizeText(data?.text);

  return {
    ok: true,
    text,
    language: "vi-VN",
    engine: "tesseract-vie",
    detection: {
      mode: options.mode === "manual" ? "manual" : "auto",
      candidatesChecked: 1,
      confidence,
      candidates: [{
        language: "vi-VN",
        engine: "tesseract-vie",
        score: Math.round(confidence * 1000) / 10,
        characters: Array.from(text).filter((character) => /\p{L}|\p{N}/u.test(character)).length
      }]
    },
    sourceWidth: width,
    sourceHeight: height,
    processedWidth: width,
    processedHeight: height,
    lines: normalizeLines(data?.blocks)
  };
}

async function terminateTesseractOcr() {
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {}
}

module.exports = {
  recognizeVietnamese,
  terminateTesseractOcr
};
