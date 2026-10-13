package com.github.pongwarsreloaded;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/** Small original effects rendered once at startup, never in the input path. */
final class SoundCueSamples {
    static final String[] NAMES = { "navigate", "confirm", "back", "pause", "resume", "start", "success",
        "bounceDay", "bounceNight", "racket", "powerup", "win" };
    // frequency, offset, length, peak; matches the web game's original cues.
    private static final double[][][] NOTES = {
        {{740, 0, .045, .035}},
        {{523.25, 0, .09, .065}, {783.99, .075, .11, .055}},
        {{587.33, 0, .075, .05}, {392, .065, .11, .045}},
        {{440, 0, .085, .05}, {329.63, .075, .12, .04}},
        {{392, 0, .08, .05}, {587.33, .06, .12, .05}},
        {{261.63, 0, .14, .07}, {329.63, .105, .14, .065}, {392, .21, .14, .065}, {523.25, .315, .2, .075}},
        {{659.25, 0, .09, .055}, {783.99, .075, .09, .055}, {1046.5, .15, .14, .05}},
        {{440, 0, .07, .1}}, {{330, 0, .07, .1}}, {{280, 0, .1, .18}},
        {{500, 0, .12, .13}, {650, .07, .12, .13}, {800, .14, .12, .13}},
        {{261.63, 0, 1, .22}, {329.63, .15, 1, .22}, {392, .3, 1, .22}, {523.25, .45, 1, .22}},
    };

    static int index(String name) {
        for (int i = 0; i < NAMES.length; i++) if (NAMES[i].equals(name)) return i;
        return -1;
    }

    static double duration(int index) {
        double end = 0;
        for (double[] note : NOTES[index]) end = Math.max(end, note[1] + note[2]);
        return end;
    }

    static byte[] wav(int index, int sampleRate) {
        if (index < 0 || index >= NAMES.length || sampleRate < 8000 || sampleRate > 192000) {
            throw new IllegalArgumentException("Invalid cue or sample rate");
        }
        int frames = (int) Math.ceil(duration(index) * sampleRate) + 1;
        ByteBuffer buffer = ByteBuffer.allocate(44 + frames * 2).order(ByteOrder.LITTLE_ENDIAN);
        buffer.putInt(0x46464952).putInt(36 + frames * 2).putInt(0x45564157); // RIFF, WAVE
        buffer.putInt(0x20746d66).putInt(16).putShort((short) 1).putShort((short) 1); // PCM mono
        buffer.putInt(sampleRate).putInt(sampleRate * 2).putShort((short) 2).putShort((short) 16);
        buffer.putInt(0x61746164).putInt(frames * 2);
        for (int frame = 0; frame < frames; frame++) {
            double time = frame / (double) sampleRate, value = 0;
            for (double[] note : NOTES[index]) {
                double t = time - note[1], length = note[2], peak = note[3];
                if (t <= 0 || t >= length) continue;
                double phase = 2 * Math.PI * note[0] * t;
                // A finite odd-harmonic triangle avoids the aliasing of a naive
                // geometric triangle; all harmonics stay below Nyquist.
                double wave = Math.sin(phase);
                if ((index >= 1 && index <= 6) || index == 9 || index == 10) {
                    wave = 0;
                    for (int harmonic = 1; harmonic <= 31 && harmonic * note[0] < sampleRate / 2.0; harmonic += 2) {
                        wave += ((harmonic & 3) == 1 ? 1 : -1) * Math.sin(phase * harmonic) / (harmonic * harmonic);
                    }
                    wave *= 8 / (Math.PI * Math.PI);
                }
                double envelope;
                if (index < 7) {
                    if (t < .006) envelope = peak * t / .006;
                    else if (t < length - .012) envelope = peak * (1 - .72 * (t - .006) / (length - .018));
                    else envelope = peak * .28 * (length - t) / .012;
                } else if (index == 11) {
                    envelope = t < .05 ? peak * t / .05 : peak * Math.pow(.001 / peak, (t - .05) / (length - .05));
                } else {
                    envelope = peak * Math.pow(.001 / peak, t / length);
                }
                // Finish at zero instead of leaving a truncation click.
                envelope *= Math.min(1, (length - t) / .002);
                value += wave * envelope;
            }
            buffer.putShort((short) Math.round(Math.max(-1, Math.min(1, value)) * 32767));
        }
        return buffer.array();
    }
    private SoundCueSamples() { }
}
