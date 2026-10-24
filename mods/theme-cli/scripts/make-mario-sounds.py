#!/usr/bin/env python3
"""Write four chiptune clips in the style of a Mario game, for a theme's `sounds` block.

Usage: make-mario-sounds.py --out DIR

Writes start.wav, working.wav, success.wav and error.wav into DIR. Each is a short tune
played on square-wave voices, made here from note numbers: no sample from any game is used.
The tunes only echo the feel of the originals (coin, overworld, flagpole, defeat).

Only the standard library is needed.
"""

import argparse
import math
import struct
import wave
from pathlib import Path

RATE = 22050
REST = None


def hz(note):
    """MIDI note number to frequency. 69 is A4."""
    return 440.0 * 2 ** ((note - 69) / 12)


def voice(notes, beat, duty=0.5, level=0.3, decay=6.0):
    """Square-wave samples for (note, beats) pairs. A note fades out over its length."""
    out = []
    for note, beats in notes:
        count = int(RATE * beat * beats)
        if note is REST:
            out.extend([0.0] * count)
            continue

        step = hz(note) / RATE
        for i in range(count):
            phase = (i * step) % 1.0
            wave_value = 1.0 if phase < duty else -1.0
            held = i / count
            # A short attack stops the click; the decay gives the plucked, bleepy shape.
            attack = min(1.0, i / (RATE * 0.004))
            out.append(wave_value * level * attack * math.exp(-decay * held))

    return out


def mix(*tracks):
    size = max(len(t) for t in tracks)
    out = [0.0] * size
    for track in tracks:
        for i, sample in enumerate(track):
            out[i] += sample

    return out


def write(path, samples):
    peak = max(1.0, max(abs(s) for s in samples))
    # Fade the last 20 ms so a loop or a stop does not click.
    tail = int(RATE * 0.02)
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(RATE)
        frames = bytearray()
        for i, s in enumerate(samples):
            fade = min(1.0, (len(samples) - i) / tail)
            frames += struct.pack("<h", int(32767 * 0.9 * fade * s / peak))
        f.writeframes(bytes(frames))


def start():
    """A coin: two quick high notes, the second held."""
    return voice([(83, 0.5), (88, 3.0)], 0.07, duty=0.5, level=0.35, decay=3.0)


def working():
    """An overworld-style bounce in C, about 4 seconds, built to loop without a seam."""
    e, c, g, g_low = 76, 72, 79, 67
    lead = [
        (e, 1), (e, 1), (REST, 1), (e, 1), (REST, 1), (c, 1), (e, 1), (REST, 1),
        (g, 2), (REST, 2), (g_low, 2), (REST, 2),
        (c, 1.5), (REST, 0.5), (g_low, 1.5), (REST, 0.5), (64, 1.5), (REST, 0.5),
        (69, 1), (71, 1), (70, 0.5), (69, 1), (g_low, 1), (e, 1), (g, 1), (81, 1), (77, 1), (79, 1), (REST, 1),
    ]
    # The bass takes the off-beats, an octave and a half down.
    bass = [(REST, 0.5), (48, 0.5)] * 14 + [(REST, 0.5), (43, 0.5)] * 8
    return mix(
        voice(lead, 0.11, duty=0.25, level=0.22, decay=2.5),
        voice(bass, 0.11, duty=0.5, level=0.18, decay=4.0),
    )


def success():
    """A flagpole-style run up the chord, then a held top note."""
    run = [(55, 1), (60, 1), (64, 1), (67, 1), (72, 1), (76, 1), (79, 1), (76, 1),
           (56, 1), (60, 1), (63, 1), (68, 1), (72, 1), (75, 1), (80, 1), (75, 1),
           (58, 1), (62, 1), (65, 1), (70, 1), (74, 1), (77, 1), (82, 1), (83, 1)]
    ending = [(84, 2), (79, 1), (84, 4)]
    return mix(
        voice(run + ending, 0.06, duty=0.5, level=0.3, decay=1.5),
        voice([(REST, len(run)), (60, 2), (55, 1), (60, 4)], 0.06, duty=0.25, level=0.18, decay=1.5),
    )


def error():
    """A stumble down: a short pause, a wobble, then a slide to the floor."""
    notes = [(71, 1), (77, 1), (REST, 1), (77, 1), (77, 1), (76, 1), (74, 1), (72, 2), (REST, 1),
             (64, 1), (60, 1), (55, 1), (52, 3)]
    return voice(notes, 0.09, duty=0.5, level=0.34, decay=2.5)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", required=True, help="folder to write the four clips into")
    args = parser.parse_args()

    out = Path(args.out).expanduser()
    out.mkdir(parents=True, exist_ok=True)
    for name, make in (("start", start), ("working", working), ("success", success), ("error", error)):
        samples = make()
        write(out / f"{name}.wav", samples)
        print(f"{name}.wav {len(samples) / RATE:.2f}s")


if __name__ == "__main__":
    main()
