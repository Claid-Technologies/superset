#!/usr/bin/env python3
"""Composite simulator recordings into a framed portrait product film.

  film.py normalize raw.mov cfr.mp4      constant 30fps copy to find cut points in
  film.py compose film.json              render the film described by the spec
  film.py sheet film.mp4 sheet.jpg       8-frame contact sheet for review

Needs ffmpeg and Pillow. The spec format is documented in ../SKILL.md.
"""

import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 30
SCREEN_W = 664
BEZEL = 16
FADE = 0.35

SANS = ["/System/Library/Fonts/SFNS.ttf", "/System/Library/Fonts/Helvetica.ttc"]
SERIF = ["/System/Library/Fonts/NewYork.ttf", "/System/Library/Fonts/Times.ttc"]


def run(args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def probe(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height:format=duration", "-of", "json", str(path)],
        check=True, capture_output=True, text=True,
    ).stdout
    data = json.loads(out)
    stream = data["streams"][0]
    return stream["width"], stream["height"], float(data["format"]["duration"])


def font(candidates, size, override=None):
    for path in [override, *candidates]:
        if path and Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def hex_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def centered(draw, y, text, fnt, fill):
    width = draw.textlength(text, font=fnt)
    draw.text(((W - width) / 2, y), text, font=fnt, fill=fill)


def normalize(src, dst):
    run(["-i", str(src), "-vf", f"fps={FPS}", "-an", "-c:v", "libx264",
         "-crf", "14", "-pix_fmt", "yuv420p", str(dst)])


def phone_layers(spec, label, src_w, src_h, work, index):
    screen_h = round(SCREEN_W * src_h / src_w / 2) * 2
    x, y = (W - SCREEN_W) // 2, (H - screen_h) // 2
    radius = round(SCREEN_W * 0.137)
    scale = 4

    frame = Image.new("RGB", (W, H), hex_rgb(spec.get("backdrop", "#F2F0EB")))
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        (x - BEZEL, y - BEZEL + 18, x + SCREEN_W + BEZEL, y + screen_h + BEZEL + 18),
        radius + BEZEL, fill=(0, 0, 0, 46))
    frame.paste(shadow.filter(ImageFilter.GaussianBlur(28)), (0, 0), shadow.filter(ImageFilter.GaussianBlur(28)))

    body = Image.new("RGBA", (W * scale, H * scale), (0, 0, 0, 0))
    ImageDraw.Draw(body).rounded_rectangle(
        ((x - BEZEL) * scale, (y - BEZEL) * scale,
         (x + SCREEN_W + BEZEL) * scale, (y + screen_h + BEZEL) * scale),
        (radius + BEZEL) * scale, fill=hex_rgb(spec.get("bezel", "#111113")) + (255,))
    body = body.resize((W, H), Image.LANCZOS)
    frame.paste(body, (0, 0), body)

    if label:
        draw = ImageDraw.Draw(frame)
        centered(draw, y - BEZEL - 58, label.upper(),
                 font(SANS, 22, spec.get("sansFont")), hex_rgb(spec.get("muted", "#8A8780")))

    mask = Image.new("L", (SCREEN_W * scale, screen_h * scale), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, SCREEN_W * scale - 1, screen_h * scale - 1), radius * scale, fill=255)
    mask = mask.resize((SCREEN_W, screen_h), Image.LANCZOS)

    island_w, island_h = round(SCREEN_W * 0.313), round(SCREEN_W * 0.092)
    island = Image.new("RGBA", (W * scale, H * scale), (0, 0, 0, 0))
    ix, iy = (W - island_w) // 2, y + round(SCREEN_W * 0.028)
    ImageDraw.Draw(island).rounded_rectangle(
        (ix * scale, iy * scale, (ix + island_w) * scale, (iy + island_h) * scale),
        island_h * scale // 2, fill=(0, 0, 0, 255))
    island = island.resize((W, H), Image.LANCZOS)

    paths = [work / f"{index}-{name}.png" for name in ("frame", "mask", "island")]
    frame.save(paths[0]); mask.save(paths[1]); island.save(paths[2])
    return paths, (x, y, screen_h)


def render_phone(spec, seg, work, index, base):
    src = (base / seg["src"]).resolve()
    cfr = work / f"{index}-cfr.mp4"
    normalize(src, cfr)
    src_w, src_h, duration = probe(cfr)
    start, end = seg.get("start", 0), seg.get("end", duration)
    speed = seg.get("speed", 1)
    length = (end - start) / speed
    (frame, mask, island), (x, y, screen_h) = phone_layers(
        spec, seg.get("label"), src_w, src_h, work, index)
    backdrop = spec.get("backdrop", "#F2F0EB").replace("#", "0x")
    hide_island = seg.get("island", True) is False

    graph = (
        f"[0:v]trim={start}:{end},setpts=(PTS-STARTPTS)/{speed},fps={FPS},"
        f"scale={SCREEN_W}:{screen_h}:flags=lanczos,format=rgba[v];"
        f"[2:v]format=gray[m];[v][m]alphamerge[screen];"
        f"[1:v][screen]overlay={x}:{y}:shortest=1[p];"
        + ("[p]null[c];" if hide_island else "[p][3:v]overlay=0:0[c];")
        + f"[c]fade=t=in:st=0:d={FADE}:color={backdrop},"
        f"fade=t=out:st={max(length - FADE, 0):.3f}:d={FADE}:color={backdrop},format=yuv420p[out]"
    )
    out = work / f"{index}-seg.mp4"
    run(["-i", str(cfr), "-loop", "1", "-i", str(frame), "-loop", "1", "-i", str(mask),
         "-loop", "1", "-i", str(island), "-filter_complex", graph, "-map", "[out]",
         "-t", f"{length:.3f}", "-r", str(FPS), "-c:v", "libx264", "-crf", "16", str(out)])
    return out


def render_raw(spec, seg, work, index, base):
    cfr = work / f"{index}-cfr.mp4"
    normalize((base / seg["src"]).resolve(), cfr)
    _, _, duration = probe(cfr)
    start, end = seg.get("start", 0), seg.get("end", duration)
    speed = seg.get("speed", 1)
    out = work / f"{index}-seg.mp4"
    run(["-i", str(cfr), "-vf",
         f"trim={start}:{end},setpts=(PTS-STARTPTS)/{speed},fps={FPS},"
         f"scale={W}:{H}:force_original_aspect_ratio=decrease:flags=lanczos,"
         f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p",
         "-r", str(FPS), "-c:v", "libx264", "-crf", "16", str(out)])
    return out


def wrap(draw, text, fnt, max_width):
    lines, line = [], ""
    for word in text.split():
        candidate = f"{line} {word}".strip()
        if draw.textlength(candidate, font=fnt) <= max_width or not line:
            line = candidate
        else:
            lines.append(line)
            line = word
    return [*lines, line]


def render_still(spec, image, duration, work, index):
    backdrop = spec.get("backdrop", "#F2F0EB").replace("#", "0x")
    png = work / f"{index}-still.png"
    image.save(png)
    out = work / f"{index}-seg.mp4"
    run(["-loop", "1", "-i", str(png), "-vf",
         f"fade=t=in:st=0:d={FADE}:color={backdrop},"
         f"fade=t=out:st={max(duration - FADE, 0):.3f}:d={FADE}:color={backdrop},format=yuv420p",
         "-t", f"{duration:.3f}", "-r", str(FPS), "-c:v", "libx264", "-crf", "16", str(out)])
    return out


def render_card(spec, seg, work, index, base):
    canvas = Image.new("RGB", (W, H), hex_rgb(spec.get("backdrop", "#F2F0EB")))
    draw = ImageDraw.Draw(canvas)
    ink, muted = hex_rgb(spec.get("ink", "#1B1A18")), hex_rgb(spec.get("muted", "#8A8780"))
    margin, y = 110, 330 if seg.get("image") else 760
    if seg.get("eyebrow"):
        draw.text((margin, y), seg["eyebrow"].upper(), font=font(SANS, 24, spec.get("sansFont")), fill=muted)
        y += 64
    title_font = font(SERIF, 76, spec.get("titleFont"))
    for line in wrap(draw, seg.get("title", ""), title_font, W - margin * 2):
        draw.text((margin, y), line, font=title_font, fill=ink)
        y += 92
    if seg.get("caption"):
        draw.text((margin, y + 8), seg["caption"], font=font(SANS, 30, spec.get("sansFont")), fill=muted)
        y += 60
    if seg.get("image"):
        shot = Image.open((base / seg["image"]).resolve()).convert("RGB")
        box_w, box_h = W - margin * 2, H - y - 260
        ratio = min(box_w / shot.width, box_h / shot.height)
        shot = shot.resize((round(shot.width * ratio), round(shot.height * ratio)), Image.LANCZOS)
        px, py = (W - shot.width) // 2, y + 70
        shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle(
            (px, py + 16, px + shot.width, py + shot.height + 16), 20, fill=(0, 0, 0, 50))
        blurred = shadow.filter(ImageFilter.GaussianBlur(26))
        canvas.paste(blurred, (0, 0), blurred)
        corner = Image.new("L", shot.size, 0)
        ImageDraw.Draw(corner).rounded_rectangle((0, 0, shot.width - 1, shot.height - 1), 20, fill=255)
        canvas.paste(shot, (px, py), corner)
    if seg.get("footer"):
        draw.text((margin, H - 190), seg["footer"], font=font(SANS, 24, spec.get("sansFont")), fill=muted)
    return render_still(spec, canvas, seg.get("duration", 4), work, index)


def render_end(spec, seg, work, index, base):
    canvas = Image.new("RGB", (W, H), hex_rgb(spec.get("backdrop", "#F2F0EB")))
    draw = ImageDraw.Draw(canvas)
    if seg.get("logo"):
        logo = Image.open((base / seg["logo"]).resolve()).convert("RGBA")
        ratio = min(520 / logo.width, 220 / logo.height)
        logo = logo.resize((round(logo.width * ratio), round(logo.height * ratio)), Image.LANCZOS)
        canvas.paste(logo, ((W - logo.width) // 2, (H - logo.height) // 2 - 40), logo)
        text_y = (H + logo.height) // 2 + 10
    else:
        mark = font(SERIF, 104, spec.get("titleFont"))
        centered(draw, H // 2 - 90, seg.get("wordmark", "Superset"), mark, hex_rgb(spec.get("ink", "#1B1A18")))
        text_y = H // 2 + 60
    if seg.get("caption"):
        centered(draw, text_y, seg["caption"], font(SANS, 32, spec.get("sansFont")),
                 hex_rgb(spec.get("muted", "#8A8780")))
    return render_still(spec, canvas, seg.get("duration", 2.2), work, index)


def compose(spec_path):
    spec_path = Path(spec_path).resolve()
    spec, base = json.loads(spec_path.read_text()), spec_path.parent
    renderers = {"phone": render_phone, "raw": render_raw, "card": render_card, "end": render_end}
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        segments = [renderers[seg["type"]](spec, seg, work, i, base)
                    for i, seg in enumerate(spec["segments"])]
        listing = work / "concat.txt"
        listing.write_text("".join(f"file '{p}'\n" for p in segments))
        output = base / spec.get("output", "film.mp4")
        run(["-f", "concat", "-safe", "0", "-i", str(listing), "-c:v", "libx264", "-crf", "18",
             "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output)])
    _, _, duration = probe(output)
    print(f"{output}  {duration:.1f}s  {output.stat().st_size / 1e6:.1f}MB")


def sheet(src, dst):
    _, _, duration = probe(src)
    run(["-i", str(src), "-vf", f"fps=8/{duration},scale=-2:900,tile=8x1", "-frames:v", "1", str(dst)])


if __name__ == "__main__":
    commands = {"normalize": normalize, "compose": compose, "sheet": sheet}
    if len(sys.argv) < 3 or sys.argv[1] not in commands:
        sys.exit(__doc__)
    commands[sys.argv[1]](*sys.argv[2:])
