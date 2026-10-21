"""Transcribe a video/audio file with faster-whisper and print JSON to stdout.

Usage: python scripts/transcribe.py <media-file> [model]
Output: {"text": "...", "duration": 4.8, "language": "en"}
"""
import json
import sys


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No media file given"}))
        return 2

    from faster_whisper import WhisperModel

    model_name = sys.argv[2] if len(sys.argv) > 2 else "base.en"
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    # vad_filter drops silence/noise first so quiet clips don't get invented text.
    segments, info = model.transcribe(sys.argv[1], vad_filter=True)
    text = " ".join(s.text.strip() for s in segments).strip()
    print(json.dumps({"text": text, "duration": round(info.duration, 1), "language": info.language}))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # report a clean error the server can show
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
