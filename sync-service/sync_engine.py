import os
import re
import tempfile
from pathlib import Path
from difflib import SequenceMatcher

try:
    import whisperx
    import ffmpeg
    BACKEND = 'whisperx'
except ImportError:
    whisperx = None
    ffmpeg = None
    BACKEND = None

try:
    from faster_whisper import WhisperModel
    FASTER_AVAILABLE = True
except ImportError:
    FASTER_AVAILABLE = False

DEVICE = 'cpu'
COMPUTE_TYPE = 'int8'

_whisperx_model = None
_faster_model = None


def clean_text(text: str) -> str:
    text = (text or '').strip().lower()
    text = re.sub(r"[^\w\s']", ' ', text)
    return ' '.join(text.split())


def fmt_lrc(seconds: float) -> str:
    minutes = int(seconds // 60)
    secs = seconds % 60
    return f'[{minutes:02d}:{secs:05.2f}]'


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def build_raw(synced: list) -> str:
    return '\n'.join(
        f"{fmt_lrc(line['start'])} {line['text']}"
        for line in synced
        if line.get('text') and line.get('start') is not None
    )


def _preprocess_audio(input_path: str) -> str:
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.wav')
    out_path = tmp.name
    tmp.close()

    (
        ffmpeg.input(input_path)
        .output(out_path, ac=1, ar=16000, format='wav')
        .overwrite_output()
        .run(quiet=True)
    )
    return out_path


def _get_whisperx_model(model_size: str = 'base'):
    global _whisperx_model
    if _whisperx_model is None:
        _whisperx_model = whisperx.load_model(model_size, DEVICE, compute_type=COMPUTE_TYPE)
    return _whisperx_model


def _get_faster_model(model_size: str = 'small'):
    global _faster_model
    if _faster_model is None:
        _faster_model = WhisperModel(model_size, device=DEVICE, compute_type=COMPUTE_TYPE)
    return _faster_model


def _align_words_to_lines(lines: list, words: list) -> list:
    synced = []
    cursor = 0

    for line in lines:
        lyric_words = [w for w in clean_text(line).split() if w]
        if not lyric_words:
            continue

        best = None
        best_score = -1
        total = len(words)
        window = min(total, cursor + 100)

        for start in range(cursor, window):
            matched = 0
            t_idx = start
            for lw in lyric_words:
                for j in range(t_idx, min(t_idx + 6, total)):
                    if clean_text(words[j]['word']) == lw:
                        matched += 1
                        t_idx = j + 1
                        break

            ratio = matched / max(len(lyric_words), 1)
            if ratio > best_score:
                best_score = ratio
                best = {'start_idx': start, 'end_idx': t_idx, 'ratio': ratio}

        if best and best['ratio'] > 0.1 and best['start_idx'] < total:
            s = words[best['start_idx']]['start']
            e = words[min(best['end_idx'], total) - 1]['end'] if best['end_idx'] > 0 else s + 2
            synced.append({
                'time': round(s, 2),
                'start': round(s, 2),
                'end': round(e, 2),
                'text': clean_text(line),
                'confidence': round(best['ratio'], 2),
                'words': []
            })
            cursor = best.get('end_idx', cursor + 1)

    return synced


def _align_segments_to_lines(lines: list, segments: list) -> list:
    synced = []
    used = set()

    for line in lines:
        clean_line = clean_text(line)
        best_score = 0
        best_idx = None

        for i, seg in enumerate(segments):
            if i in used:
                continue
            score = similarity(clean_line, seg['text'])
            if clean_line in seg['text']:
                score += 0.3
            if score > best_score:
                best_score = score
                best_idx = i

        if best_idx is not None and best_score >= 0.12:
            seg = segments[best_idx]
            used.add(best_idx)
            synced.append({
                'time': round(seg['start'], 2),
                'start': round(seg['start'], 2),
                'end': round(seg['end'], 2),
                'text': clean_line,
                'confidence': round(best_score, 2),
                'words': []
            })

    synced.sort(key=lambda x: x['time'])
    return synced


def _fill_gaps(lines: list, synced: list, duration: float) -> list:
    clean_lines = [clean_text(l) for l in lines if clean_text(l)]
    if not clean_lines:
        return synced

    if not synced:
        step = max(duration / max(len(clean_lines), 1), 0.5)
        return [
            {
                'time': round(i * step, 2),
                'start': round(i * step, 2),
                'end': round(min((i + 1) * step, duration), 2),
                'text': line,
                'confidence': 0.2,
                'words': []
            }
            for i, line in enumerate(clean_lines)
        ]

    synced_texts = {s['text'] for s in synced}
    final = list(synced)
    step = max(duration / max(len(clean_lines), 1), 0.5)

    for i, line in enumerate(clean_lines):
      if line not in synced_texts:
        start = round(i * step, 2)
        end = round(min((i + 1) * step, duration), 2)
        final.append({
            'time': start,
            'start': start,
            'end': end,
            'text': line,
            'confidence': 0.15,
            'words': []
        })

    final.sort(key=lambda x: x['time'])
    return final


def _sync_whisperx(audio_path: str, lyrics_lines: list, model_size: str = 'base') -> dict:
    preprocessed = None
    try:
        preprocessed = _preprocess_audio(audio_path)
        model = _get_whisperx_model(model_size)
        audio = whisperx.load_audio(preprocessed)

        transcription = model.transcribe(audio, batch_size=4)
        lang = transcription.get('language', 'en')

        align_model, metadata = whisperx.load_align_model(language_code=lang, device=DEVICE)
        aligned = whisperx.align(
            transcription['segments'],
            align_model,
            metadata,
            audio,
            DEVICE,
            return_char_alignments=False,
        )

        all_words = []
        for seg in aligned.get('segments', []):
            for w in seg.get('words', []) or []:
                txt = clean_text(w.get('word', ''))
                if txt:
                    all_words.append({
                        'word': txt,
                        'start': float(w.get('start', 0) or 0),
                        'end': float(w.get('end', 0) or 0),
                    })

        duration = 0
        segs = aligned.get('segments', [])
        if segs:
            duration = float(segs[-1].get('end', 0) or 0)

        synced = _align_words_to_lines(lyrics_lines, all_words)
        synced = _fill_gaps(lyrics_lines, synced, duration)

        return {
            'language': lang,
            'duration': duration,
            'syncedLyrics': synced,
            'syncedLyricsRaw': build_raw(synced),
            'backend': 'whisperx',
        }
    finally:
        if preprocessed and os.path.exists(preprocessed):
            try:
                os.unlink(preprocessed)
            except Exception:
                pass


def _sync_faster_whisper(audio_path: str, lyrics_lines: list, model_size: str = 'small') -> dict:
    model = _get_faster_model(model_size)
    segments, info = model.transcribe(audio_path, beam_size=5, vad_filter=False, word_timestamps=False)

    seg_list = []
    for s in segments:
        txt = clean_text(getattr(s, 'text', ''))
        if txt:
            seg_list.append({
                'text': txt,
                'start': float(getattr(s, 'start', 0) or 0),
                'end': float(getattr(s, 'end', 0) or 0),
            })

    lang = getattr(info, 'language', 'en')
    duration = getattr(info, 'duration', 0) or 0

    synced = _align_segments_to_lines(lyrics_lines, seg_list)
    synced = _fill_gaps(lyrics_lines, synced, duration)

    return {
        'language': lang,
        'duration': duration,
        'syncedLyrics': synced,
        'syncedLyricsRaw': build_raw(synced),
        'backend': 'faster-whisper',
    }


def generate_sync_from_lyrics(audio_path: str, lyrics_text: str, model_size: str = 'base') -> dict:
    if not Path(audio_path).exists():
        raise FileNotFoundError(f'Audio not found: {audio_path}')

    lines = [l.strip() for l in str(lyrics_text).splitlines() if l.strip()]
    if not lines:
        raise ValueError('Lyrics text is empty')

    if BACKEND == 'whisperx':
        try:
            result = _sync_whisperx(audio_path, lines, model_size)
            result['lyrics'] = lyrics_text
            return result
        except Exception as e:
            print(f'[sync] WhisperX failed, trying faster-whisper: {e}')

    if FASTER_AVAILABLE:
        fw_size = 'small' if model_size == 'base' else model_size
        result = _sync_faster_whisper(audio_path, lines, fw_size)
        result['lyrics'] = lyrics_text
        return result

    raise RuntimeError('No ASR backend available. Install whisperx or faster-whisper.')