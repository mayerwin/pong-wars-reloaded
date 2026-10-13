/* Short, original UI cues. An injected AudioContext remains owned by the game. */
(function (root, factory) {
  const Feedback = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = Feedback;
  else root.PongFeedback = Feedback;
})(typeof globalThis === 'object' ? globalThis : this, function (root) {
  'use strict';
  const clamp = value => Math.max(0, Math.min(1, value));
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  // [frequency, delay, duration, peak gain]; brief attacks and releases soften
  // the arcade timbre, and each cue stays below gameplay sound-effect levels.
  const CUES = {
    navigate: [[740, 0, 0.045, 0.035]],
    confirm: [[523.25, 0, 0.09, 0.065], [783.99, 0.075, 0.11, 0.055]],
    back: [[587.33, 0, 0.075, 0.05], [392, 0.065, 0.11, 0.045]],
    pause: [[440, 0, 0.085, 0.05], [329.63, 0.075, 0.12, 0.04]],
    resume: [[392, 0, 0.08, 0.05], [587.33, 0.06, 0.12, 0.05]],
    start: [[261.63, 0, 0.14, 0.07], [329.63, 0.105, 0.14, 0.065],
      [392, 0.21, 0.14, 0.065], [523.25, 0.315, 0.2, 0.075]],
    success: [[659.25, 0, 0.09, 0.055], [783.99, 0.075, 0.09, 0.055], [1046.5, 0.15, 0.14, 0.05]],
  };
  const COOLDOWN = { navigate: 85, confirm: 160, back: 160, pause: 180, resume: 180, start: 520, success: 250 };
  const PENDING_LIFETIME_MS = 180;
  function envelopeAt(points, time) {
    if (time <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      if (time <= points[i][0]) {
        const [a, av] = points[i - 1], [b, bv] = points[i];
        return av + (bv - av) * (time - a) / Math.max(0.00001, b - a);
      }
    }
    return points[points.length - 1][1];
  }

  class PongFeedback {
    constructor(options = {}) {
      this.enabled = options.enabled !== false;
      this.volume = finite(options.volume) ? clamp(options.volume) : 0.7;
      this.background = false;
      this.disposed = false;
      this._ownsContext = !options.audioContextFactory;
      this._contextFactory = options.audioContextFactory || (() => {
        const Context = root.AudioContext || root.webkitAudioContext;
        return Context ? new Context({ latencyHint: 'interactive' }) : null;
      });
      // Android can provide preloaded native effects. It owns their lifecycle;
      // this class still owns the same cue throttling and start suppression.
      this._nativePlay = typeof options.nativePlay === 'function' ? options.nativePlay : null;
      this._nativeReady = typeof options.nativeReady === 'function' ? options.nativeReady : null;
      this._now = options.now || (() => root.performance ? root.performance.now() : Date.now());
      this._setTimeout = options.setTimeout || root.setTimeout.bind(root);
      this._clearTimeout = options.clearTimeout || root.clearTimeout.bind(root);
      this._ctx = null;
      this._master = null;
      this._voices = new Set();
      this._pending = null;
      this._resumePending = null;
      this._suspendPending = null;
      this._suspendTimer = null;
      this._lastCueAt = new Map();
      this._startUntil = -Infinity;
    }

    setEnabled(enabled) {
      if (this.disposed) return;
      this.enabled = enabled === true;
      if (!this.enabled) { this._pending = null; this._cancelAll(); }
    }

    setVolume(volume) {
      if (!finite(volume) || this.disposed) return;
      this.volume = clamp(volume);
      if (!this.volume) { this._pending = null; this._cancelAll(); }
      if (this._master) {
        const gain = this._master.gain, now = this._ctx.currentTime;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(gain.value, now);
        gain.linearRampToValueAtTime(this.volume, now + 0.03);
      }
    }

    unlock() {
      if (!this._wanted()) return Promise.resolve(false);
      try { if (this._nativeReady && this._nativeReady()) return Promise.resolve(true); } catch (_) { }
      if (!this._ensureContext()) return Promise.resolve(false);
      return this._resumeContext(true);
    }

    play(kind) {
      if (!Object.prototype.hasOwnProperty.call(CUES, kind) || !this._wanted()) return Promise.resolve(false);
      const now = this._now();
      if ((kind === 'navigate' || kind === 'confirm') && now < this._startUntil) return Promise.resolve(false);
      if (now - (this._lastCueAt.get(kind) ?? -Infinity) < COOLDOWN[kind]) return Promise.resolve(false);
      let nativePlayed = false;
      try { nativePlayed = !!this._nativePlay && this._nativePlay(kind, this.volume) === true; } catch (_) { }
      if (!nativePlayed && !this._ensureContext()) return Promise.resolve(false);
      this._lastCueAt.set(kind, now);
      if (kind === 'start') {
        this._startUntil = now + COOLDOWN.start;
        this._cancelKinds(['navigate', 'confirm']);
      } else this._cancelKinds([kind]);
      if (nativePlayed) {
        this._pending = null;
        return Promise.resolve(true);
      }
      // One pending cue, replaced by the latest action. An old blocked autoplay
      // promise must not replay a trail of navigation sounds after a gesture.
      const request = { kind, at: now, played: false };
      this._pending = request;
      if (this._ctx.state === 'running' && !this._suspendPending) {
        this._flushPending();
        return Promise.resolve(request.played);
      }
      return this._resumeContext(true).then(() => request.played);
    }

    suspend() {
      this.background = true;
      this._pending = null;
      this._cancelAll();
      if (this._ownsContext && this._ctx && this._ctx.state === 'running' && this._suspendTimer === null) {
        this._suspendTimer = this._setTimeout(() => {
          this._suspendTimer = null;
          if (!this.background || this.disposed) return;
          try {
            this._suspendPending = Promise.resolve(this._ctx.suspend()).catch(() => {})
              .finally(() => { this._suspendPending = null; });
          } catch (_) { /* Already closing. */ }
        }, 30);
      }
      return Promise.resolve();
    }

    resume() {
      if (this.disposed) return Promise.resolve(false);
      this.background = false;
      if (this._suspendTimer !== null) this._clearTimeout(this._suspendTimer);
      this._suspendTimer = null;
      // Foregrounding alone does not allocate an effects context or play a cue.
      return this._wanted() && this._ctx ? this._resumeContext(false) : Promise.resolve(false);
    }

    dispose() {
      if (this.disposed) return Promise.resolve();
      this.disposed = true;
      this._pending = null;
      if (this._suspendTimer !== null) this._clearTimeout(this._suspendTimer);
      this._suspendTimer = null;
      for (const voice of [...this._voices]) this._release(voice, true);
      const ctx = this._ctx;
      this._ctx = null;
      if (this._master) this._master.disconnect();
      this._master = null;
      if (!this._ownsContext || !ctx || ctx.state === 'closed') return Promise.resolve();
      try { return Promise.resolve(ctx.close()).catch(() => {}); }
      catch (_) { return Promise.resolve(); }
    }

    _wanted() { return !this.disposed && this.enabled && this.volume > 0 && !this.background; }

    _ensureContext() {
      if (this._ctx) return this._ctx.state !== 'closed';
      try {
        this._ctx = this._contextFactory();
        if (!this._ctx || this._ctx.state === 'closed') return false;
        this._master = this._ctx.createGain();
        this._master.gain.value = this.volume;
        this._master.connect(this._ctx.destination);
        return true;
      } catch (_) { this._ctx = null; return false; }
    }

    _resumeContext(fromGesture) {
      const ctx = this._ctx;
      if (!ctx || ctx.state === 'closed' || !this._wanted()) return Promise.resolve(false);
      if (this._suspendPending) return this._suspendPending.then(() => this._resumeContext(false));
      if (ctx.state === 'running') { this._flushPending(); return Promise.resolve(true); }
      if (this._resumePending && !fromGesture) return this._resumePending;
      try {
        const pending = Promise.resolve(ctx.resume()).then(() => {
          if (this._ctx !== ctx || !this._wanted()) return false;
          this._flushPending();
          return ctx.state === 'running';
        }).catch(() => false).finally(() => {
          if (this._resumePending === pending) this._resumePending = null;
        });
        this._resumePending = pending;
        return pending;
      } catch (_) { return Promise.resolve(false); }
    }

    _flushPending() {
      const request = this._pending;
      if (!request || !this._wanted() || !this._ctx || this._ctx.state !== 'running') return;
      this._pending = null;
      if (this._now() - request.at > PENDING_LIFETIME_MS) return;
      try {
        for (const note of CUES[request.kind]) this._note(request.kind, ...note);
        request.played = true;
      } catch (_) { this._cancelKinds([request.kind]); }
    }

    _note(kind, frequency, delay, duration, peak) {
      // A burst of different actions cannot accumulate an unbounded voice graph.
      while (this._voices.size >= 12) this._release(this._voices.values().next().value, true);
      const ctx = this._ctx, oscillator = ctx.createOscillator(), gain = ctx.createGain();
      const start = ctx.currentTime + delay, end = start + duration;
      const envelope = [[start, 0], [start + 0.006, peak], [end - 0.012, peak * 0.28], [end, 0]];
      oscillator.type = kind === 'navigate' ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start);
      for (const [time, value] of envelope.slice(1)) gain.gain.linearRampToValueAtTime(value, time);
      oscillator.connect(gain); gain.connect(this._master);
      const voice = { kind, oscillator, gain, envelope, cancelled: false, cleanupTimer: null };
      this._voices.add(voice);
      oscillator.onended = () => this._release(voice);
      oscillator.start(start); oscillator.stop(end + 0.004);
      // onended follows the audio clock. A cold device can report "running"
      // while currentTime stays at zero during hardware startup; wall-clock
      // cleanup would otherwise disconnect the first cue before it is heard.
      // Explicit cancellation/disposal and the voice limit still bound resources.
    }

    _cancelKinds(kinds) {
      for (const voice of [...this._voices]) if (kinds.includes(voice.kind)) this._cancel(voice);
    }

    _cancelAll() { for (const voice of [...this._voices]) this._cancel(voice); }

    _cancel(voice) {
      if (voice.cancelled || !this._ctx) return;
      voice.cancelled = true;
      const now = this._ctx.currentTime;
      if (now <= voice.envelope[0][0]) { this._release(voice, true); return; }
      const gain = voice.gain.gain;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(envelopeAt(voice.envelope, now), now);
      gain.linearRampToValueAtTime(0, now + 0.012);
      try { voice.oscillator.stop(now + 0.015); } catch (_) { /* Already ended. */ }
      if (voice.cleanupTimer !== null) this._clearTimeout(voice.cleanupTimer);
      voice.cleanupTimer = this._setTimeout(() => this._release(voice), 40);
    }

    _release(voice, stop = false) {
      if (!this._voices.delete(voice)) return;
      if (voice.cleanupTimer !== null) this._clearTimeout(voice.cleanupTimer);
      voice.oscillator.onended = null;
      if (stop) { try { voice.oscillator.stop(); } catch (_) { /* Already ended. */ } }
      voice.oscillator.disconnect(); voice.gain.disconnect();
    }
  }
  return PongFeedback;
});
