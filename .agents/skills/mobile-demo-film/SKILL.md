---
name: mobile-demo-film
description: Turn mobile screen recordings into a framed portrait demo video with phone footage, title cards, cutaways, and an end card. Use when asked to edit a mobile feature demo or launch clip. Use mobile-demo-record to capture real app footage first.
---

# Mobile demo film

Use this skill to edit a new demo from real app recordings. The bundled renderer produces
silent 1080x1920 video at 30fps, with a phone frame on a warm paper backdrop. A useful default
is one feature in 20 to 40 seconds; adapt the story and pacing to the request.

## Prerequisites

Run on macOS with Python 3, Pillow, and ffmpeg (including ffprobe). The default fonts come
from macOS. Install Pillow into a scratch virtual environment if it is not available:

```bash
python3 -m venv <scratch>/film-venv
<scratch>/film-venv/bin/pip install Pillow
```

Use that environment's Python for the commands below. Commands assume the repo root as
working directory. Create output directories first; the renderer overwrites output files.

## Workflow

1. **Plan one story.** Write a short table of on-screen actions and durations. Start with
   the user's action, show the app responding, and end on the visible result. A tour can
   start with the finished artifact instead. Verify the feature works before filming it.
2. **Capture real footage** with `mobile-demo-record`. Use demo data and a separate take
   for each beat. If the story needs an agent doing work, use a working host and agent.
   Capture desktop cutaways with `cdp-verification` when needed.
3. **Normalize before choosing cuts.** Simulator recordings have variable frame rates:
   `python3 .agents/skills/mobile-demo-film/scripts/film.py normalize raw/01.mov cfr/01.mp4`.
   Choose start/end timestamps from this constant-rate copy.
4. **Compose** using a JSON spec beside the recordings:
   `python3 .agents/skills/mobile-demo-film/scripts/film.py compose <scratch>/film.json`.
5. **Review** a contact sheet and play the entire film:
   `python3 .agents/skills/mobile-demo-film/scripts/film.py sheet <scratch>/film.mp4 <scratch>/sheet.jpg`.
   The sheet samples eight frames; inspect transitions and typing in playback too. Check
   for clipped text, unreadable UI, private information, spinners, and unintended clock changes.
6. **Deliver** the film and identify the build, environment, staged data, and omitted steps.
   Draft accompanying post copy only if requested; publishing needs user authorization.

Keep typing and reading at a natural pace. Trim or speed up waiting, and make time jumps
clear. Use title cards to explain missing context rather than implying an unrecorded action
happened in the app. Framing, masks, and the simulated Dynamic Island are presentation layers;
do not fabricate app state inside the recording.

## Composition spec

This example combines phone footage, a desktop cutaway, a result, and an end card. Replace
its paths, cut points, and text for the feature being demonstrated.

```json
{
  "output": "film.mp4",
  "backdrop": "#F2F0EB",
  "segments": [
    { "type": "phone", "src": "cfr/01.mp4", "start": 1, "end": 7, "label": "Start on your phone" },
    { "type": "card", "eyebrow": "Meanwhile", "title": "The agent works on your Mac.",
      "image": "shots/desktop.png", "duration": 4 },
    { "type": "phone", "src": "cfr/02.mp4", "start": 0, "end": 10 },
    { "type": "end", "wordmark": "Superset", "caption": "Review the result anywhere", "duration": 2.2 }
  ]
}
```

Media and output paths resolve relative to the spec file. Use absolute paths for optional
`titleFont` and `sansFont` overrides. Top-level `bezel`, `ink`, and `muted` customize colors.

| Segment | Fields |
| --- | --- |
| `phone` | `src`, optional `start`/`end` in seconds, `speed` (default 1), `label`, `island` (false disables the overlay) |
| `raw` | `src`, optional `start`/`end`, `speed`; unframed footage fitted to the portrait canvas with black padding |
| `card` | `title`, optional `eyebrow`, `caption`, `image`, `footer`, `duration` (default 4 seconds) |
| `end` | `wordmark` or transparent PNG `logo`, optional `caption`, `duration` (default 2.2 seconds) |

Keep cut points within the source duration, speed positive, and segments long enough for the
0.35-second fades. Card titles wrap; captions, labels, and footers should be short. The
renderer removes audio, so use another editing workflow if narration or app audio is needed.

Store raw takes, specs, and finished films in a scratch directory. Share the inputs and spec
when teammates need to re-edit a particular demo; they are not required to create a new one.
