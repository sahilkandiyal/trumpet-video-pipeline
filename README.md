# Trumpet Launch: Local Video Pipeline Prototype

Combines a founder interview recording with an AI elephant interviewer's spoken question and renders a 1080p, 30 fps MP4 locally with Remotion. No paid API is needed. This is a pipeline experiment, not the full product.

```
input/sample-interview.json -> Piper TTS -> public/audio/question-01.wav -> Remotion -> output/interview-demo.mp4
```

## Requirements

- Node.js 20+ and pnpm
- Piper TTS plus a voice model (`.onnx`). Only needed for `generate:voice`.

## Setup

```bash
pnpm install
cp .env.example .env.local     # then edit the Piper settings
```

### Piper (local TTS)

Easiest on Windows is the pip package:

```bash
pip install piper-tts
python -m piper.download_voices en_US-lessac-medium   # downloads .onnx + .json into the current folder
```

Put the files in `models/` (gitignore it if you like), then in `.env.local`:

```
PIPER_BIN=python -m piper
PIPER_MODEL=models/en_US-lessac-medium.onnx
```

Check the license of the exact voice you choose before using it in anything commercial.

### Your founder video

Copy it to `public/media/founder-sample.mp4` (mp4/mov/webm all work; the .gitignore keeps recordings out of Git). Then edit `input/sample-interview.json`:

- `question.text`: what the elephant asks
- `answer.transcript`: the words spoken in the video, used for captions
- `branding.showCaptions` / `showIntro`: toggles

All media paths must live inside `public/`.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Opens Remotion Studio for visual iteration |
| `pnpm validate` | Checks the input JSON and media. Add `-- --voice` to skip the audio check |
| `pnpm generate:voice` | Generates the question audio with Piper |
| `pnpm render` | Validates, then renders `output/interview-demo.mp4` |

Typical run: `pnpm validate -- --voice && pnpm generate:voice && pnpm render`

Both scripts accept an alternate input file: `pnpm render input/other.json output/other.mp4`.

## Web UI: the interview (for non-technical testers)

Double-click `start-ui.bat` (or run `pnpm ui`) and open **http://localhost:4000**.

1. Enter your name and product, choose **Video** or **Voice**, press Start. The browser asks for camera/mic permission at this step only.
2. Trumpet asks 3 questions, one at a time. His voice plays and the question is shown as text.
3. Press **Record**: 3-2-1 countdown, then up to 90 s (hard stop). Minimum 5 s. Preview the take, then **Use this take** or re-record (2 re-records per question).
4. Each answer is converted and transcribed in the background (faster-whisper) while the next question starts.
5. **Review**: replay answers, fix typos in the text (it becomes the captions), re-record any answer.
6. **Create my video**: intro, then question and answer for each turn, then Trumpet's sign-off. Rendering takes 1-3 minutes. The video plays on the page, with a download link.

Behaviour that follows the PRD: question 1 is fixed ("Why did you build this?"), the sign-off is fixed, voice answers get their own full layout (waveform), camera denied falls back to voice, and voice-synthesis failure falls back to text-only questions.

The questions and limits live in `src/lib/interview-config.ts`. They are fixed for now; that file is where a Claude-generated follow-up question would plug in later (needs an Anthropic API key).

Requirements: `pip install piper-tts faster-whisper "av==15.1.0"`. The first transcription downloads a ~150 MB speech model. Set `PYTHON_BIN` if Python isn't on PATH. Recordings are converted with the ffmpeg bundled in Remotion, so no separate ffmpeg install is needed.

Each run is saved as `output/job-<id>.mp4`. One video renders at a time.

**Camera access only works on `http://localhost`.** Browsers block the camera and microphone on plain `http://<ip-address>` pages, so your boss must run the tool on their own computer (clone the project and run `start-ui.bat`), or you must serve it over HTTPS.

## How the video is built

1. Intro card (optional, 2.5 s)
2. Elephant section: placeholder elephant plus the question text, with the TTS audio starting 0.5 s in
3. Founder answer: the founder video with its original audio, plus sentence-level captions
4. End card (1.5 s)

Durations are read from the real audio and video files (`calculateMetadata` in `src/Root.tsx`), so a longer answer or a different voice changes the length automatically. The timeline is deterministic: see `src/lib/timeline.ts`.

The composition never imports a TTS SDK. To add ElevenLabs later, implement `TtsProvider` in `src/tts/providers/` and register it in `src/tts/generate-speech.ts`.

## Known limitations

- Captions are split by sentence and timed by text length. There are no word-level timestamps, so they can drift from the speech.
- The elephant is a static placeholder SVG (`public/media/elephant.svg`).
- No loudness normalisation yet. Check the question vs. founder volume by ear.
- Only one question and one answer are supported.
- No background music.

## Licensing note (verify before production)

Remotion's free license covers individuals and small companies; larger companies, and some automated/commercial video-generation uses, need a paid license. This prototype uses the free version. Confirm current terms at https://www.remotion.dev/docs/license/pricing before shipping a product.

## Evaluation notes (fill in after your first runs)

| Metric | Result |
| --- | --- |
| TTS generation time | |
| Render time (1080p) | |
| Question audio duration | |
| Audio quality / sync / visual issues | |
