import sys
import io
import json
from pathlib import Path
from faster_whisper import WhisperModel

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")


def clean_text(text: str) -> str:
    return " ".join((text or "").strip().split())


def transcribe_audio_file(audio_path: str, model_size: str = "small"):
    if not Path(audio_path).exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    model = WhisperModel(model_size, device="cpu", compute_type="int8")

    segments, info = model.transcribe(
        audio_path,
        beam_size=5,
        vad_filter=True,
        word_timestamps=False
    )

    lines = []
    raw_segments = []

    for segment in segments:
        text = clean_text(getattr(segment, "text", ""))
        start = float(getattr(segment, "start", 0) or 0)
        end = float(getattr(segment, "end", start) or start)

        if text:
            lines.append(text)
            raw_segments.append({
                "text": text,
                "start": round(start, 2),
                "end": round(end, 2)
            })

    return {
        "language": getattr(info, "language", None),
        "duration": getattr(info, "duration", None),
        "lyrics": "\n".join(lines),
        "segmentsCount": len(raw_segments),
        "segments": raw_segments
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            "error": "Usage: python transcribe_audio.py <audio_path> [model_size]"
        }, ensure_ascii=False))
        return

    audio_path = sys.argv[1]
    model_size = sys.argv[2] if len(sys.argv) > 2 else "small"

    try:
        result = transcribe_audio_file(audio_path, model_size)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False))


if __name__ == "__main__":
    main()