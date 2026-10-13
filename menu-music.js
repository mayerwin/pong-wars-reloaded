/* Shared, offline menu music. The host owns settings and menu/lifecycle state. */
(function (root, factory) {
  const Music = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = Music;
  else root.PongMenuMusic = Music;
})(typeof globalThis === 'object' ? globalThis : this, function (root) {
  'use strict';

  const clamp = value => Math.max(0, Math.min(1, value));
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const LOAD_RETRY_MS = 3000;
  // The recording is mastered much louder than individual game sound effects.
  const MUSIC_GAIN = 0.25;

  function envelopeAt(points, time) {
    if (time <= points[0][0]) return points[0][1];
    if (time >= points[1][0]) return points[1][1];
    const [a, av] = points[0], [b, bv] = points[1];
    return av + (bv - av) * (time - a) / Math.max(0.00001, b - a);
  }

  class PongMenuMusic {
    constructor(options = {}) {
      this.enabled = options.enabled !== false;
      this.volume = finite(options.volume) ? clamp(options.volume) : 0.7;
      this.active = false;
      this.background = false;
      this.disposed = false;
      this._assetUrl = options.assetUrl || 'assets/audio/arcade-menu.mp3';
      this._loopStart = finite(options.loopStart) ? Math.max(0, options.loopStart) : 0;
      this._loopEnd = finite(options.loopEnd) ? options.loopEnd : null;
      this._contextFactory = options.audioContextFactory || (() => {
        const Context = root.AudioContext || root.webkitAudioContext;
        // Menu transitions are interactive too. A playback-sized output queue
        // can keep old music audible well after the match has visibly started.
        return Context ? new Context({ latencyHint: 'interactive' }) : null;
      });
      this._fetch = options.fetch || (root.fetch && root.fetch.bind(root));
      this._now = options.now || Date.now;
      this._setTimeout = options.setTimeout || root.setTimeout.bind(root);
      this._clearTimeout = options.clearTimeout || root.clearTimeout.bind(root);
      this._ctx = null;
      this._master = null;
      this._buffer = null;
      this._source = null;
      this._loadPending = null;
      this._loadFailedAt = null;
      this._loadAbort = null;
      this._resumePending = null;
      this._suspendPending = null;
      this._stopTimer = null;
      this._playing = false;
      this._gainEnvelope = [[0, 0], [0, 0]];
    }

    setEnabled(enabled) {
      const value = enabled === true;
      if (value === this.enabled || this.disposed) return;
      this.enabled = value;
      this._sync();
    }

    setVolume(volume) {
      if (!finite(volume) || this.disposed) return;
      const value = clamp(volume);
      if (value === this.volume) return;
      this.volume = value;
      if (this._playing && this._wanted()) this._rampMaster(this.volume * MUSIC_GAIN, 0.15);
      else this._sync();
    }

    setActive(menuOnly) {
      const value = menuOnly === true;
      if (value === this.active || this.disposed) return;
      this.active = value;
      this._sync();
    }

    // Retrying resume synchronously in the gesture is essential: Chrome can
    // leave its original autoplay resume promise pending indefinitely.
    unlock() { return this._sync(true); }

    resume() {
      if (this.disposed) return Promise.resolve(false);
      this.background = false;
      return this._sync();
    }

    suspend() {
      this.background = true;
      this._halt(0);
      return this._suspendPending || Promise.resolve();
    }

    dispose() {
      if (this.disposed) return Promise.resolve();
      this.disposed = true;
      this._halt(0);
      if (this._loadAbort) this._loadAbort.abort();
      this._loadAbort = null;
      const ctx = this._ctx;
      this._ctx = null;
      this._buffer = null;
      if (this._master) this._master.disconnect();
      this._master = null;
      try { return ctx && ctx.state !== 'closed' ? Promise.resolve(ctx.close()).catch(() => {}) : Promise.resolve(); }
      catch (_) { return Promise.resolve(); }
    }

    _wanted() { return !this.disposed && this.active && this.enabled && this.volume > 0 && !this.background; }

    _sync(fromGesture = false) {
      if (!this._wanted()) {
        this._halt(this.background || this.disposed ? 0 : !this.enabled || this.volume === 0 ? 0.03 : 0.45);
        return Promise.resolve(false);
      }
      if (!this._ctx) {
        try {
          this._ctx = this._contextFactory();
          if (!this._ctx) return Promise.resolve(false);
          this._master = this._ctx.createGain();
          this._master.gain.value = 0;
          this._master.connect(this._ctx.destination);
        } catch (_) { this._ctx = null; return Promise.resolve(false); }
      }
      // Download/decode must never delay the gesture's synchronous resume call.
      const resumed = this._resumeContext(fromGesture);
      const loaded = this._loadBuffer(fromGesture);
      this._begin();
      return Promise.all([resumed, loaded]).then(() => this._begin());
    }

    _resumeContext(fromGesture) {
      const ctx = this._ctx;
      if (!ctx || ctx.state === 'closed') return Promise.resolve(false);
      if (this._suspendPending) return this._suspendPending.then(() => {
        if (!this._wanted()) return false;
        return this._resumeContext(false);
      });
      if (ctx.state === 'running') return Promise.resolve(true);
      if (this._resumePending && !fromGesture) return this._resumePending;
      try {
        const pending = Promise.resolve(ctx.resume()).then(() => {
          if (this._ctx !== ctx) return false;
          if (!this._wanted()) { this._halt(0); return false; }
          this._begin();
          return ctx.state === 'running';
        }).catch(() => false).finally(() => {
          if (this._resumePending === pending) this._resumePending = null;
        });
        this._resumePending = pending;
        return pending;
      } catch (_) { return Promise.resolve(false); }
    }

    _loadBuffer(fromGesture) {
      if (this._buffer) return Promise.resolve(true);
      if (this._loadPending) return this._loadPending;
      if (!this._fetch || !this._ctx || this.disposed) return Promise.resolve(false);
      if (this._loadFailedAt !== null && (!fromGesture || this._now() - this._loadFailedAt < LOAD_RETRY_MS)) return Promise.resolve(false);
      const ctx = this._ctx;
      const abort = root.AbortController ? new root.AbortController() : null;
      this._loadAbort = abort;
      const pending = Promise.resolve().then(() => this._fetch(this._assetUrl, abort ? { signal: abort.signal } : {}))
        .then(response => {
          if (!response.ok) throw new Error('Menu music could not be loaded');
          return response.arrayBuffer();
        })
        .then(data => {
          if (this.disposed || this._ctx !== ctx) return null;
          return ctx.decodeAudioData(data);
        })
        .then(buffer => {
          if (this.disposed || this._ctx !== ctx) return false;
          if (!buffer || !finite(buffer.duration) || buffer.duration <= 0) throw new Error('Menu music could not be decoded');
          this._buffer = buffer;
          this._loadFailedAt = null;
          this._begin();
          return true;
        })
        .catch(() => {
          if (!this.disposed) this._loadFailedAt = this._now();
          return false;
        })
        .finally(() => {
          if (this._loadPending === pending) this._loadPending = null;
          if (this._loadAbort === abort) this._loadAbort = null;
        });
      this._loadPending = pending;
      return pending;
    }

    _begin() {
      if (!this._wanted() || !this._buffer || !this._ctx || this._ctx.state !== 'running') return false;
      if (this._playing) return true;
      if (this._stopTimer !== null) this._clearTimeout(this._stopTimer);
      this._stopTimer = null;
      if (!this._source) {
        const source = this._ctx.createBufferSource();
        source.buffer = this._buffer;
        source.loop = true;
        source.loopStart = this._loopStart < this._buffer.duration ? this._loopStart : 0;
        source.loopEnd = finite(this._loopEnd) && this._loopEnd > source.loopStart
          ? Math.min(this._loopEnd, this._buffer.duration) : this._buffer.duration;
        source.connect(this._master);
        // The decoded recording loops in the audio graph, sample-accurately;
        // there is no HTMLAudio ended/restart gap or JavaScript beat scheduler.
        source.start(0, source.loopStart);
        this._source = source;
      }
      this._playing = true;
      this._rampMaster(this.volume * MUSIC_GAIN, 0.45);
      return true;
    }

    _rampMaster(target, seconds) {
      if (!this._master || !this._ctx) return;
      const now = this._ctx.currentTime;
      const from = envelopeAt(this._gainEnvelope, now);
      const gain = this._master.gain;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(from, now);
      gain.linearRampToValueAtTime(target, now + seconds);
      this._gainEnvelope = [[now, from], [now + seconds, target]];
    }

    _stopSource() {
      const source = this._source;
      this._source = null;
      if (!source) return;
      try { source.stop(); } catch (_) { /* Already stopped. */ }
      source.disconnect();
    }

    _halt(fade) {
      this._playing = false;
      if (!this._ctx) return;
      if (this._stopTimer !== null && fade > 0 && fade >= this._gainEnvelope[1][0] - this._ctx.currentTime) return;
      if (this._stopTimer !== null) this._clearTimeout(this._stopTimer);
      this._stopTimer = null;
      if (this._ctx.state !== 'running') fade = 0;
      this._rampMaster(0, fade);
      if (fade && this._source) {
        this._stopTimer = this._setTimeout(() => {
          this._stopTimer = null;
          this._stopSource();
          this._suspendContext();
        }, fade * 1000 + 40);
      } else { this._stopSource(); this._suspendContext(); }
    }

    _suspendContext() {
      const ctx = this._ctx;
      if (!ctx || ctx.state !== 'running' || this._suspendPending || this.disposed || this._wanted()) return;
      // Do not wait for blocked autoplay; a late resume checks current state.
      try {
        this._suspendPending = Promise.resolve(ctx.suspend())
          .catch(() => {}).finally(() => { this._suspendPending = null; });
      } catch (_) { /* A closing/unsupported context is already silent. */ }
    }
  }

  return PongMenuMusic;
});
