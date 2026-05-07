import os
import sys
import shutil
import tempfile
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from sync_engine import generate_sync_from_lyrics

app = FastAPI(title='Music Sync Service', version='3.0.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


def clean_text(text: str) -> str:
    return " ".join((text or "").strip().split())


@app.get('/')
def root():
    return {'status': 'ok', 'message': 'Music Sync Service running'}


@app.get('/health')
def health():
    return {'status': 'healthy'}


@app.post('/transcribe')
async def transcribe_audio_upload(
    audio: UploadFile = File(...),
    model_size: str = Form('small'),
):
    suffix = os.path.splitext(audio.filename or 'audio.mp3')[1] or '.mp3'
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp_path = tmp.name
    tmp.close()

    try:
      with open(tmp_path, 'wb') as f:
          shutil.copyfileobj(audio.file, f)

      model = WhisperModel(model_size, device='cpu', compute_type='int8')
      segments, info = model.transcribe(
          tmp_path,
          beam_size=5,
          vad_filter=True,
          word_timestamps=False
      )

      lines = []
      for segment in segments:
          text = clean_text(getattr(segment, 'text', ''))
          if text:
              lines.append(text)

      lyrics_text = "\n".join(lines)

      return {
          'success': True,
          'language': getattr(info, 'language', None),
          'duration': getattr(info, 'duration', None),
          'lyrics': lyrics_text,
          'segmentsCount': len(lines)
      }
    except Exception as e:
      raise HTTPException(status_code=500, detail=str(e))
    finally:
      if os.path.exists(tmp_path):
          try:
              os.unlink(tmp_path)
          except Exception:
              pass


@app.post('/sync')
async def sync_lyrics_upload(
    audio: UploadFile = File(...),
    lyrics: str = Form(...),
    model_size: str = Form('base'),
):
    suffix = os.path.splitext(audio.filename or 'audio.mp3')[1] or '.mp3'
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp_path = tmp.name
    tmp.close()

    try:
        with open(tmp_path, 'wb') as f:
            shutil.copyfileobj(audio.file, f)

        result = generate_sync_from_lyrics(
            audio_path=tmp_path,
            lyrics_text=lyrics,
            model_size=model_size,
        )

        return {'success': True, **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception:
                pass