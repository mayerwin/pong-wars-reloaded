package com.github.pongwarsreloaded;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import org.junit.Test;
import static org.junit.Assert.*;

public class SoundCueSamplesTest {
    @Test public void everyCueIsSmallPcmWithImmediateOnsetAndNoClipping() {
        for (int rate : new int[] {44100, 48000, 192000}) {
            for (int cue = 0; cue < SoundCueSamples.NAMES.length; cue++) {
                byte[] data = SoundCueSamples.wav(cue, rate);
                ByteBuffer wav = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN);
                assertEquals(0x46464952, wav.getInt(0));
                assertEquals(data.length - 8, wav.getInt(4));
                assertEquals(0x45564157, wav.getInt(8));
                assertEquals(1, wav.getShort(20)); // uncompressed PCM
                assertEquals(1, wav.getShort(22)); // mono
                assertEquals(rate, wav.getInt(24));
                assertEquals(16, wav.getShort(34));
                assertEquals(data.length - 44, wav.getInt(40));
                assertTrue(data.length < 1_000_000); // SoundPool decoded-sample limit
                assertEquals(0, wav.getShort(44));
                assertEquals(0, wav.getShort(data.length - 2));
                int peak = 0, earlyPeak = 0;
                for (int offset = 44; offset < data.length; offset += 2) {
                    int amplitude = Math.abs((int) wav.getShort(offset));
                    peak = Math.max(peak, amplitude);
                    if (offset < 44 + rate * .01 * 2) earlyPeak = Math.max(earlyPeak, amplitude);
                }
                assertTrue("non-silent " + SoundCueSamples.NAMES[cue], peak > 100);
                assertTrue("no clipping " + SoundCueSamples.NAMES[cue], peak < 32767);
                assertTrue("onset under 10ms " + SoundCueSamples.NAMES[cue], earlyPeak > 50);
            }
        }
    }

    @Test public void identifiersAndTimingsMatchSharedGameEvents() {
        assertEquals(12, SoundCueSamples.NAMES.length);
        assertEquals(-1, SoundCueSamples.index(null));
        assertEquals(-1, SoundCueSamples.index("unknown"));
        for (int index = 0; index < SoundCueSamples.NAMES.length; index++) {
            assertEquals(index, SoundCueSamples.index(SoundCueSamples.NAMES[index]));
        }
        assertEquals(.515, SoundCueSamples.duration(SoundCueSamples.index("start")), .000001);
        assertEquals(.07, SoundCueSamples.duration(SoundCueSamples.index("bounceDay")), .000001);
        assertEquals(1.45, SoundCueSamples.duration(SoundCueSamples.index("win")), .000001);
    }

    @Test public void rejectsInvalidCueAndRateBeforeAllocating() {
        for (int[] input : new int[][] {{-1, 48000}, {12, 48000}, {0, 0}, {0, 192001}}) {
            try {
                SoundCueSamples.wav(input[0], input[1]);
                fail("Invalid input accepted");
            } catch (IllegalArgumentException expected) { }
        }
    }
}
