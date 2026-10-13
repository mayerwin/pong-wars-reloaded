package com.github.pongwarsreloaded;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.SoundPool;
import android.os.SystemClock;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Set;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/** Predecoded short game sounds bypass the WebView's audio output queue. */
final class NativeAudio {
    private static final int MAX_STREAMS = 12;
    private static final int MAX_LOAD_ATTEMPTS = 3;
    private final ScheduledExecutorService loader = Executors.newSingleThreadScheduledExecutor();
    private final int[] sounds = new int[SoundCueSamples.NAMES.length];
    private final int[] loadAttempts = new int[SoundCueSamples.NAMES.length];
    private final Set<Integer> loaded = new HashSet<>();
    private final Map<Integer, File> loadingFiles = new HashMap<>();
    private final Map<Integer, Integer> loadingIndices = new HashMap<>();
    private final ArrayList<Stream> streams = new ArrayList<>();
    private SoundPool pool;
    private boolean active;
    private boolean released;
    private int plays;
    private int failures;
    private final int sampleRate;
    private final File directory;
    private String lastLoadError = "";

    NativeAudio(Context context) {
        sampleRate = outputRate(context);
        directory = new File(context.getCacheDir(), "game-audio-v1");
        try {
            pool = new SoundPool.Builder().setMaxStreams(MAX_STREAMS)
                .setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_GAME)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()).build();
            pool.setOnLoadCompleteListener((source, sound, status) -> {
                synchronized (NativeAudio.this) {
                    if (released) return;
                    Integer index = loadingIndices.remove(sound);
                    removeFile(loadingFiles.remove(sound));
                    if (index == null) return;
                    if (status == 0) loaded.add(sound);
                    else loadFailed(index, "decoder status " + status);
                }
            });
            loader.execute(() -> {
                for (int index = 0; index < sounds.length; index++) loadCue(index);
            });
        } catch (RuntimeException failure) {
            failures++;
            if (pool != null) pool.release();
            pool = null;
        }
    }

    private static int outputRate(Context context) {
        try {
            AudioManager manager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            int rate = Integer.parseInt(manager.getProperty(AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE));
            if (rate >= 8000 && rate <= 192000) return rate;
        } catch (RuntimeException ignored) { /* An HDMI route need not report a property. */ }
        return 48000;
    }

    private void loadCue(int index) {
        synchronized (this) {
            if (released || pool == null || loaded.contains(sounds[index]) || loadAttempts[index] >= MAX_LOAD_ATTEMPTS) return;
            loadAttempts[index]++;
        }
        File file = null;
        boolean loading = false;
        try {
            if (!directory.isDirectory() && !directory.mkdirs() && !directory.isDirectory()) throw new IOException("Audio cache unavailable");
            // A recreated Activity can overlap the previous loader briefly;
            // unique files prevent either pool reading a partially rewritten cue.
            file = File.createTempFile(SoundCueSamples.NAMES[index] + "-", ".wav", directory);
            try (FileOutputStream output = new FileOutputStream(file)) {
                output.write(SoundCueSamples.wav(index, sampleRate));
            }
            synchronized (this) {
                if (released || pool == null) return;
                sounds[index] = pool.load(file.getAbsolutePath(), 1);
                if (sounds[index] == 0) loadFailed(index, "load returned zero");
                else {
                    loadingFiles.put(sounds[index], file);
                    loadingIndices.put(sounds[index], index);
                    loading = true;
                }
            }
        } catch (IOException | RuntimeException failure) {
            loadFailed(index, failure.getClass().getSimpleName());
        } finally {
            if (!loading) removeFile(file);
        }
    }

    private synchronized void loadFailed(int index, String detail) {
        if (released || pool == null) return;
        failures++;
        lastLoadError = SoundCueSamples.NAMES[index] + ": " + detail;
        Log.w("PongNativeAudio", "Preload " + lastLoadError + ", attempt " + loadAttempts[index]);
        int oldSound = sounds[index];
        sounds[index] = 0;
        if (oldSound != 0) { loaded.remove(oldSound); pool.unload(oldSound); }
        // A busy decoder on a cold TV can reject an otherwise valid short WAV.
        // Retry preparation only, never replay the input event that fell back.
        if (loadAttempts[index] < MAX_LOAD_ATTEMPTS) {
            loader.schedule(() -> loadCue(index), 500L * loadAttempts[index], TimeUnit.MILLISECONDS);
        }
    }

    private static void removeFile(File file) {
        if (file != null && file.exists() && !file.delete()) file.deleteOnExit();
    }

    synchronized boolean isReady() {
        if (released || pool == null) return false;
        for (int sound : sounds) if (sound == 0 || !loaded.contains(sound)) return false;
        return true;
    }

    /** False requests immediate web fallback; no sound is ever queued for later. */
    synchronized boolean playSound(String cue, double volume) {
        int index = SoundCueSamples.index(cue);
        if (released || pool == null || index < 0) return false;
        if (!active || !Double.isFinite(volume) || volume <= 0) return true;
        int sound = sounds[index];
        if (sound == 0 || !loaded.contains(sound)) return false;
        long now = SystemClock.uptimeMillis();
        for (Iterator<Stream> iterator = streams.iterator(); iterator.hasNext();) {
            Stream stream = iterator.next();
            boolean cancel = index < 7 && (stream.cue == index || index == 5 && (stream.cue == 0 || stream.cue == 1));
            if (cancel) {
                pool.stop(stream.id);
                iterator.remove();
            }
        }
        int priority = index >= 7 && index <= 9 ? 1 : 2;
        if (streams.size() >= MAX_STREAMS) {
            Stream victim = null;
            for (Stream stream : streams) {
                if (stream.end <= now) { victim = stream; break; }
                if (victim == null || stream.priority < victim.priority) victim = stream;
            }
            if (victim.end > now && victim.priority > priority) return true;
            pool.stop(victim.id);
            streams.remove(victim);
        }
        float gain = (float) Math.min(1, volume);
        int stream = pool.play(sound, gain, gain, priority, 0, 1);
        // A saturated mixer drops a current effect instead of putting it into
        // another backend with a different delay (or playing it much later).
        if (stream == 0) { failures++; return true; }
        streams.add(new Stream(stream, index, priority, now + (long) Math.ceil(SoundCueSamples.duration(index) * 1000) + 20));
        plays++;
        return true;
    }

    synchronized void setActive(boolean value) {
        active = value && !released;
        if (!active) stopAll();
    }

    synchronized void stopAll() {
        if (pool != null) {
            // Let SoundPool pause its real active streams, independent of our
            // nominal-duration estimates during a slow output-device startup.
            // We retain up to MAX_STREAMS ids and stop them all; autoResume is
            // never called, so old effects cannot restart on foregrounding.
            pool.autoPause();
            for (Stream stream : streams) pool.stop(stream.id);
        }
        streams.clear();
    }

    synchronized String diagnostics() {
        long now = SystemClock.uptimeMillis();
        int activeStreams = 0;
        for (Stream stream : streams) if (stream.end > now) activeStreams++;
        int retries = 0;
        StringBuilder missing = new StringBuilder();
        for (int index = 0; index < sounds.length; index++) {
            retries += Math.max(0, loadAttempts[index] - 1);
            if (sounds[index] == 0 || !loaded.contains(sounds[index])) {
                if (missing.length() > 0) missing.append(',');
                missing.append('"').append(SoundCueSamples.NAMES[index]).append('"');
            }
        }
        return "{\"backend\":\"Android SoundPool\",\"ready\":" + isReady()
            + ",\"active\":" + active + ",\"loaded\":" + loaded.size()
            + ",\"total\":" + sounds.length + ",\"sampleRate\":" + sampleRate
            + ",\"activeStreams\":" + activeStreams
            + ",\"loadRetries\":" + retries + ",\"missingCues\":[" + missing + "]"
            + ",\"lastLoadError\":\"" + lastLoadError + "\""
            + ",\"plays\":" + plays + ",\"failures\":" + failures + "}";
    }

    synchronized void release() {
        if (released) return;
        released = true;
        active = false;
        stopAll();
        loader.shutdownNow();
        if (pool != null) { pool.release(); pool = null; }
        for (File file : loadingFiles.values()) removeFile(file);
        loadingFiles.clear();
        loadingIndices.clear();
        loaded.clear();
    }

    private static final class Stream {
        final int id, cue, priority;
        final long end;
        Stream(int id, int cue, int priority, long end) { this.id = id; this.cue = cue; this.priority = priority; this.end = end; }
    }
}
