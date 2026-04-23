import sys
import io
import json
from pathlib import Path
from difflib import SequenceMatcher
from faster_whisper import WhisperModel

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")


def format_lrc_time(seconds: float) -> str:
    minutes = int(seconds // 60)
    secs = seconds % 60
    return f"[{minutes:02d}:{secs:05.2f}]"


def clean_text(text: str) -> str:
    return " ".join((text or "").strip().split())


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def transcribe_segments(audio_path: str, model_size: str = "small"):
    model = WhisperModel(model_size, device="cpu", compute_type="int8")

    segments, info = model.transcribe(
        audio_path,
        beam_size=5,
        vad_filter=False,
        word_timestamps=False
    )

    cleaned_segments = []
    for segment in segments:
        text = clean_text(getattr(segment, "text", ""))
        start = float(getattr(segment, "start", 0) or 0)
        end = float(getattr(segment, "end", start) or start)

        if text:
            cleaned_segments.append({
                "text": text,
                "start": start,
                "end": end
            })

    return cleaned_segments, info


def align_lyrics_lines(lyrics_text: str, segments: list):
    lyric_lines = [clean_text(line) for line in str(lyrics_text).splitlines() if clean_text(line)]
    synced = []
    used_indexes = set()

    for line in lyric_lines:
        best_score = 0
        best_index = None

        for i, segment in enumerate(segments):
            if i in used_indexes:
                continue

            score = similarity(line, segment["text"])

            if line.lower() in segment["text"].lower():
                score += 0.35
            if segment["text"].lower() in line.lower():
                score += 0.25

            if score > best_score:
                best_score = score
                best_index = i

        if best_index is not None and best_score >= 0.15:
            seg = segments[best_index]
            used_indexes.add(best_index)

            synced.append({
                "time": round(seg["start"], 2),
                "start": round(seg["start"], 2),
                "end": round(seg["end"], 2),
                "text": line
            })

    synced.sort(key=lambda x: x["time"])
    return synced


def save_lrc_file(audio_path: str, synced_lyrics_raw: str) -> str:
    audio_file = Path(audio_path)
    lrc_path = audio_file.with_suffix(".lrc")
    lrc_path.write_text(synced_lyrics_raw, encoding="utf-8")
    return str(lrc_path)


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python sync_from_lyrics.py <audio_path> <lyrics_path> [model_size]"}, ensure_ascii=False))
        return

    audio_path = sys.argv[1]
    lyrics_path = sys.argv[2]
    model_size = sys.argv[3] if len(sys.argv) > 3 else "small"

    if not Path(audio_path).exists():
        print(json.dumps({"error": f"Audio file not found: {audio_path}"}, ensure_ascii=False))
        return

    if not Path(lyrics_path).exists():
        print(json.dumps({"error": f"Lyrics file not found: {lyrics_path}"}, ensure_ascii=False))
        return

    try:
        lyrics_text = Path(lyrics_path).read_text(encoding="utf-8")
        segments, info = transcribe_segments(audio_path, model_size=model_size)
        synced = align_lyrics_lines(lyrics_text, segments)

        synced_raw = "\n".join(f"{format_lrc_time(line['time'])} {line['text']}" for line in synced)
        lrc_file = save_lrc_file(audio_path, synced_raw)

        result = {
            "language": getattr(info, "language", None),
            "duration": getattr(info, "duration", None),
            "lyrics": lyrics_text,
            "syncedLyricsRaw": synced_raw,
            "syncedLyrics": synced,
            "lrcFile": lrc_file
        }

        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False))


if __name__ == "__main__":
    main()