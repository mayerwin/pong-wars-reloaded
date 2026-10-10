/* Original, procedurally composed menu music shared by web and Android hosts. */
(function (root, factory) {
  const Music = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = Music;
  else root.PongMenuMusic = Music;
})(typeof globalThis === 'object' ? globalThis : this, function (root) {
  'use strict';

  // A relaxed D-major / B-minor eight-bar phrase, with open ninths and space
  // between melody notes. All sound is synthesized locally at 88 beats/minute.
  const STEP = 60 / 88 / 4;
  const CHORDS = [
    [54, 57, 61, 64], [50, 54, 57, 61], [54, 57, 59, 62], [52, 57, 59, 61],
    [54, 57, 61, 64], [50, 54, 57, 61], [54, 57, 59, 62], [52, 57, 59, 64]
  ];
  const BASS = [38, 35, 31, 33, 38, 35, 31, 33];
  const MELODY = [
    {3: 73, 7: 76, 12: 69}, {3: 73, 10: 66},
    {3: 71, 7: 69, 12: 66}, {5: 64, 11: 69},
    {3: 73, 7: 69, 12: 76}, {5: 73, 11: 69},
    {3: 71, 10: 74}, {3: 71, 7: 69, 12: 64}
  ];
  const frequency = midi => 440 * Math.pow(2, (midi - 69) / 12);
  const clamp = value => Math.max(0, Math.min(1, value));

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

  class PongMenuMusic {
    constructor(options = {}) {
      this.enabled = options.enabled !== false;
      this.volume = typeof options.volume === 'number' && Number.isFinite(options.volume) ? clamp(options.volume) : 0.7;
      this.active = false;
      this.background = false;
      this.disposed = false;
      this._contextFactory = options.audioContextFactory || (() => {
        const Context = root.AudioContext || root.webkitAudioContext;
        return Context ? new Context({latencyHint: 'playback'}) : null;
      });
      this._setTimeout = options.setTimeout || root.setTimeout.bind(root);
      this._clearTimeout = options.clearTimeout || root.clearTimeout.bind(root);
      this._ctx = null;
      this._master = null;
      this._voices = new Set();
      this._timer = null;
      this._stopTimer = null;
      this._resumePending = null;
      this._suspendPending = null;
      this._playing = false;
      this._gainEnvelope = [[0, 0]];
      this._noise = null;
    }

    // The host owns persistence and combines the separate music preference with
    // the game's master sound switch. Volume is normalized to 0..1.
    setEnabled(enabled) {
      const value = enabled === true;
      if (value === this.enabled || this.disposed) return;
      this.enabled = value;
      this._sync();
    }

    setVolume(volume) {
      if (typeof volume !== 'number' || !Number.isFinite(volume) || this.disposed) return;
      const value = clamp(volume);
      if (value === this.volume) return;
      this.volume = value;
      if (this._playing && this._wanted()) this._rampMaster(this.volume * 0.55, 0.15);
      else this._sync();
    }

    setActive(menuOnly) {
      const value = menuOnly === true;
      if (value === this.active || this.disposed) return;
      this.active = value;
      this._sync();
    }

    // Call on first input as a fallback when a browser denies autoplay. Calling
    // this while muted/in-game never creates or resumes an AudioContext.
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
      const ctx = this._ctx;
      this._ctx = null;
      this._noise = null;
      if (this._master) this._master.disconnect();
      this._master = null;
      try { return ctx && ctx.state !== 'closed' ? Promise.resolve(ctx.close()).catch(() => {}) : Promise.resolve(); }
      catch (_) { return Promise.resolve(); }
    }

    _wanted() { return !this.disposed && this.active && this.enabled && this.volume > 0 && !this.background; }

    _sync(fromGesture = false) {
      if (!this._wanted()) {
        this._halt(this.background || this.disposed ? 0 : 0.22);
        return Promise.resolve(false);
      }
      if (!this._ctx) {
        try {
          this._ctx = this._contextFactory();
          if (!this._ctx) return Promise.resolve(false);
          this._master = this._ctx.createGain();
          this._master.gain.value = 0;
          this._master.connect(this._ctx.destination);
          this._gainEnvelope = [[this._ctx.currentTime, 0]];
        } catch (_) { this._ctx = null; return Promise.resolve(false); }
      }
      const ctx = this._ctx;
      if (ctx.state === 'closed') return Promise.resolve(false);
      if (this._suspendPending) return this._suspendPending.then(() => this._sync());
      if (ctx.state === 'running') {
        this._begin();
        return Promise.resolve(true);
      }
      // Chrome may leave the autoplay resume promise pending until a *new*
      // resume call happens inside a user gesture. Ordinary updates can share
      // the pending request, but unlock must make that new synchronous call.
      if (this._resumePending && !fromGesture) return this._resumePending;
      try {
        // resume() is called synchronously in the input handler's gesture scope.
        const pending = Promise.resolve(ctx.resume()).then(() => {
          if (this._ctx === ctx && this._wanted() && ctx.state === 'running') { this._begin(); return true; }
          if (this._ctx === ctx && !this._wanted()) this._halt(0);
          return false;
        }).catch(() => false).finally(() => {
          if (this._resumePending === pending) this._resumePending = null;
        });
        this._resumePending = pending;
        return pending;
      } catch (_) { return Promise.resolve(false); }
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

    _begin() {
      if (this._playing || !this._wanted() || !this._ctx || this._ctx.state !== 'running') return;
      if (this._stopTimer !== null) this._clearTimeout(this._stopTimer);
      this._stopTimer = null;
      this._playing = true;
      this._step = 0;
      this._next = this._ctx.currentTime + 0.04;
      this._rampMaster(this.volume * 0.55, 0.65);
      this._tick();
    }

    _tick() {
      this._timer = null;
      if (!this._playing || !this._wanted()) return;
      if (this._ctx.state !== 'running') { this._halt(0); return; }
      const now = this._ctx.currentTime;
      // After a stalled JS thread, skip elapsed notes instead of bursting them.
      if (this._next < now - 0.1) {
        const skipped = Math.ceil((now + 0.025 - this._next) / STEP);
        this._step = (this._step + skipped) % 128;
        this._next += skipped * STEP;
      }
      while (this._next < now + 0.16) {
        this._schedule(this._step, this._next);
        this._step = (this._step + 1) % 128;
        this._next += STEP;
      }
      this._timer = this._setTimeout(() => this._tick(), 50);
    }

    _halt(fade) {
      if (this._timer !== null) this._clearTimeout(this._timer);
      this._timer = null;
      this._playing = false;
      if (!this._ctx) return;
      // Repeated mute/input events must not keep postponing suspension.
      if (this._stopTimer !== null && fade > 0) return;
      if (this._stopTimer !== null) this._clearTimeout(this._stopTimer);
      this._stopTimer = null;
      if (this._ctx.state !== 'running') fade = 0;
      this._rampMaster(0, fade);
      const now = this._ctx.currentTime;
      for (const voice of this._voices) {
        const value = envelopeAt(voice.envelope, now);
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(value, now);
        voice.gain.gain.linearRampToValueAtTime(0, now + fade);
        voice.envelope = [[now, value], [now + fade, 0]];
        try { voice.source.stop(now + fade + 0.01); } catch (_) { /* Already ended. */ }
      }
      if (fade && this._voices.size) {
        this._stopTimer = this._setTimeout(() => {
          this._stopTimer = null;
          this._clearVoices();
          this._suspendContext();
        }, fade * 1000 + 40);
      } else { this._clearVoices(); this._suspendContext(); }
    }

    _suspendContext() {
      const ctx = this._ctx;
      if (!ctx || ctx.state !== 'running' || this._suspendPending || this.disposed || this._wanted()) return;
      // Never wait for an autoplay-blocked resume to settle before suspending.
      // Its own completion handler reconciles a late resume with current state.
      try {
        this._suspendPending = Promise.resolve(ctx.suspend())
          .catch(() => {}).finally(() => { this._suspendPending = null; });
      } catch (_) { /* A closing/unsupported context is already silent. */ }
    }

    _releaseVoice(voice) {
      if (!this._voices.delete(voice)) return;
      voice.source.onended = null;
      for (const node of voice.nodes) node.disconnect();
    }

    _clearVoices() {
      for (const voice of [...this._voices]) {
        try { voice.source.stop(this._ctx ? this._ctx.currentTime : 0); } catch (_) { /* Already ended. */ }
        this._releaseVoice(voice);
      }
    }

    _voice(type, midi, at, duration, peak, attack, release, cutoff, pan = 0) {
      const ctx = this._ctx, source = type === 'noise' ? ctx.createBufferSource() : ctx.createOscillator();
      if (type === 'noise') {
        if (!this._noise) {
          this._noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.12), ctx.sampleRate);
          const data = this._noise.getChannelData(0);
          let seed = 0x706f6e67;
          for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; data[i] = seed / 2147483648 - 1; }
        }
        source.buffer = this._noise;
      } else {
        source.type = type === 'kick' ? 'sine' : type;
        source.frequency.setValueAtTime(type === 'kick' ? 110 : frequency(midi), at);
        if (type === 'kick') source.frequency.exponentialRampToValueAtTime(48, at + duration);
      }
      const filter = ctx.createBiquadFilter(), gain = ctx.createGain();
      filter.type = type === 'noise' ? 'bandpass' : 'lowpass';
      filter.frequency.value = cutoff;
      filter.Q.value = 0.5;
      const envelope = [[at, 0], [at + attack, peak], [at + duration - release, peak * 0.72], [at + duration, 0]];
      gain.gain.value = 0;
      gain.gain.setValueAtTime(0, at);
      for (const [time, value] of envelope.slice(1)) gain.gain.linearRampToValueAtTime(value, time);
      source.connect(filter); filter.connect(gain);
      const nodes = [source, filter, gain];
      if (ctx.createStereoPanner) {
        const panner = ctx.createStereoPanner(); panner.pan.value = pan;
        gain.connect(panner); panner.connect(this._master); nodes.push(panner);
      } else gain.connect(this._master);
      const voice = {source, gain, nodes, envelope};
      this._voices.add(voice);
      source.onended = () => this._releaseVoice(voice);
      source.start(at);
      source.stop(at + duration + 0.015);
    }

    _schedule(step, at) {
      const bar = Math.floor(step / 16), beat = step % 16;
      if (beat === 0) CHORDS[bar].forEach((note, i) => this._voice('triangle', note, at, STEP * 17, 0.018, 0.38, 0.6, 1000, (i - 1.5) * 0.13));
      if (beat === 0 || beat === 6 || beat === 12) this._voice('triangle', BASS[bar] + (beat === 6 ? 12 : 0), at, STEP * 2.8, beat === 6 ? 0.045 : 0.075, 0.012, 0.18, 420);
      if (beat === 0 || beat === 8) this._voice('kick', 0, at, 0.18, 0.09, 0.008, 0.14, 650);
      if (beat === 4 || beat === 12) this._voice('noise', 0, at, 0.075, 0.012, 0.003, 0.06, 5200, 0.12);
      if (MELODY[bar][beat]) this._voice('triangle', MELODY[bar][beat], at, STEP * 4.5, 0.045, 0.012, 0.62, 1700, bar % 2 ? -0.16 : 0.16);
    }
  }

  return PongMenuMusic;
});
