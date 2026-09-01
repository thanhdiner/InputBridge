from __future__ import annotations

import json
import sys
import time
from pathlib import Path


def emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def transcribe_with(
    whisper_model,
    audio_path: Path,
    language: str | None,
    *,
    model_name: str,
    device: str,
    compute_type: str,
):
    model = whisper_model(
        model_name,
        device=device,
        compute_type=compute_type,
        local_files_only=True,
    )
    segments, info = model.transcribe(
        str(audio_path),
        language=language,
        beam_size=5,
        best_of=5,
        temperature=0,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 350},
        condition_on_previous_text=False,
        without_timestamps=True,
    )
    text = " ".join(segment.text.strip() for segment in segments if segment.text.strip()).strip()
    return text, info


def main() -> int:
    if len(sys.argv) < 2:
        raise ValueError("Thiếu file âm thanh.")

    audio_path = Path(sys.argv[1]).resolve()
    if not audio_path.is_file():
        raise FileNotFoundError(f"Không tìm thấy file âm thanh: {audio_path}")

    requested_language = (sys.argv[2] if len(sys.argv) > 2 else "auto").strip().lower()
    language = None if requested_language in {"", "auto"} else requested_language.split("-", 1)[0]

    from faster_whisper import WhisperModel

    started_at = time.perf_counter()
    device = "cuda"
    compute_type = "float16"
    fallback_reason = ""
    try:
        text, info = transcribe_with(
            WhisperModel,
            audio_path,
            language,
            model_name="small",
            device=device,
            compute_type=compute_type,
        )
    except Exception as cuda_error:
        fallback_reason = str(cuda_error)
        device = "cpu"
        compute_type = "int8"
        text, info = transcribe_with(
            WhisperModel,
            audio_path,
            language,
            model_name="base",
            device=device,
            compute_type=compute_type,
        )

    emit(
        {
            "ok": True,
            "text": text,
            "language": getattr(info, "language", language or ""),
            "languageProbability": getattr(info, "language_probability", None),
            "duration": getattr(info, "duration", None),
            "device": device,
            "computeType": compute_type,
            "fallbackReason": fallback_reason,
            "elapsedMs": round((time.perf_counter() - started_at) * 1000),
        }
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        emit({"ok": False, "error": str(error), "type": type(error).__name__})
        raise SystemExit(1)
