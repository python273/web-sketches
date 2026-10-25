/* Short knocks and motion-driven air, synthesized with the Web Audio API. */
(() => {
  'use strict';
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  class ImpactSound {
    constructor() {
      this.enabled = true;
      this.context = null;
      this.pending = [];
      this.voices = new Set();
    }

    unlock() {
      if (!this.enabled) return;
      // Create/resume only inside a pointer or checkbox gesture.
      try {
        if (!this.context) {
          const Audio = window.AudioContext || window.webkitAudioContext;
          if (!Audio) return;
          const ctx = this.context = new Audio();
          this.master = ctx.createGain();
          this.master.gain.value = 0.8;
          const limiter = ctx.createDynamicsCompressor();
          limiter.threshold.value = -14;
          limiter.knee.value = 8;
          limiter.ratio.value = 20;
          limiter.attack.value = 0.0003;
          limiter.release.value = 0.09;
          this.master.connect(limiter).connect(ctx.destination);
          this.noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.12), ctx.sampleRate);
          const samples = this.noise.getChannelData(0);
          for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

          const source = ctx.createBufferSource();
          const airBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
          const airSamples = airBuffer.getChannelData(0);
          for (let i = 0; i < airSamples.length; i++) airSamples[i] = Math.random() * 2 - 1;
          source.buffer = airBuffer;
          source.loop = true;
          const highpass = ctx.createBiquadFilter();
          highpass.type = 'highpass'; highpass.frequency.value = 250; highpass.Q.value = 0.5;
          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass'; filter.frequency.value = 1100; filter.Q.value = 0.5;
          const gain = ctx.createGain(); gain.gain.value = 0;
          const pan = ctx.createStereoPanner();
          source.connect(highpass).connect(filter).connect(gain).connect(pan).connect(this.master);
          source.start();
          this.air = { source, filter, gain, pan };
        }
        if (this.context.state === 'suspended') this.context.resume().catch(() => {});
      } catch {
        // Audio support or device availability must never interrupt the sketch.
        this.enabled = false;
      }
    }

    setEnabled(enabled) {
      this.enabled = enabled;
      if (!enabled) this.clear();
      if (this.context) {
        this.master.gain.setTargetAtTime(enabled ? 0.8 : 0, this.context.currentTime, 0.01);
      }
    }

    impact(m, time) {
      if (!this.enabled || this.context?.state !== 'running') return;
      const { a, b } = m;
      const mass = 1 / (a.invMass + b.invMass);
      const energy = Math.sqrt(mass) * m.approachSpeed;
      const small = a.fixed || (!b.fixed && a.mass > b.mass) ? b : a;
      const bodyArea = a.fixed ? b.width * b.height : b.fixed ? a.width * a.height
        : Math.max(a.width * a.height, b.width * b.height);
      this.pending.push({ time, energy, area: small.width * small.height,
        bodyArea,
        x: m.contacts[0].x, y: m.contacts[0].y });
    }

    flush(view) {
      const hits = this.pending;
      this.pending = [];
      if (!this.enabled || this.context?.state !== 'running') return;
      const now = this.context.currentTime + 0.025;
      const firstTime = hits[0]?.time || 0;
      for (const hit of hits) {
        if (hit.x < view.x || hit.x > view.x + view.width || hit.y < view.y) continue;
        const pan = clamp(2 * (hit.x - view.x) / view.width - 1, -0.9, 0.9);
        // Preserve substep timing instead of starting a whole frame's impacts
        // simultaneously. Every visible impact can play, without a count cap.
        this.play(hit, pan, now + 0.002 + hit.time - firstTime);
      }
    }

    play(hit, pan, at) {
      const ctx = this.context;
      // Leave enough time for graph updates to reach the audio thread. A late
      // source can otherwise start after its gain's attack has already elapsed.
      at = Math.max(at, ctx.currentTime + 0.015);
      const strength = clamp(Math.sqrt(hit.energy / 4000), 0, 1);
      const peak = 0.65 * strength;
      const size = Math.sqrt(hit.area);
      const hardness = clamp(hit.energy / 6500, 0, 1);
      const duration = 0.022 + Math.min(size, 80) * 0.00012 + hardness * 0.06;
      const output = ctx.createStereoPanner();
      output.pan.value = pan;
      output.connect(this.master);
      const voice = { sources: [], nodes: [output] };
      this.voices.add(voice);

      // Keep the existing contact click.
      const noise = ctx.createBufferSource();
      const highpass = ctx.createBiquadFilter();
      const filter = ctx.createBiquadFilter();
      const envelope = ctx.createGain();
      envelope.gain.value = 0;
      noise.buffer = this.noise;
      highpass.type = 'highpass'; highpass.frequency.value = 90; highpass.Q.value = 0.5;
      filter.type = 'lowpass'; filter.frequency.value = clamp(1600 / hit.area ** 0.18, 280, 760); filter.Q.value = 0.5;
      envelope.gain.setValueAtTime(0.00001, at);
      envelope.gain.linearRampToValueAtTime(Math.max(0.00002, peak), at + 0.0025);
      envelope.gain.exponentialRampToValueAtTime(0.00001, at + duration);
      noise.connect(highpass).connect(filter).connect(envelope).connect(output);
      noise.start(at, Math.random() * 0.03); noise.stop(at + duration + 0.006);
      voice.sources.push(noise); voice.nodes.push(noise, highpass, filter, envelope);
      voice.envelopes = [envelope];

      // The larger participating block supplies a low, short-lived body beneath
      // the click. The floor has no resonant area of its own.
      const bodyArea = hit.bodyArea || hit.area;
      const weight = clamp(Math.log2(1 + bodyArea / 80) / 7, 0, 1);
      const bodyDuration = 0.055 + weight * 0.035 + hardness * 0.04;
      const thud = ctx.createOscillator();
      const thudGain = ctx.createGain();
      thudGain.gain.value = 0;
      if (!this.bodyWaves) {
        this.bodyWaves = [0, Math.PI / 2, Math.PI, Math.PI * 1.5].map(phase =>
          ctx.createPeriodicWave(new Float32Array([0, Math.cos(phase)]), new Float32Array([0, Math.sin(phase)])));
      }
      thud.setPeriodicWave(this.bodyWaves[Math.floor(Math.random() * this.bodyWaves.length)]);
      thud.frequency.value = clamp(900 / bodyArea ** 0.25, 65, 190) * (0.98 + Math.random() * 0.04);
      thudGain.gain.setValueAtTime(0.00001, at);
      thudGain.gain.exponentialRampToValueAtTime(Math.max(0.00002, strength * 0.42 * (0.35 + weight * 0.65)), at + 0.003);
      thudGain.gain.exponentialRampToValueAtTime(0.00001, at + bodyDuration);
      thud.connect(thudGain).connect(output);
      thud.start(at); thud.stop(at + bodyDuration + 0.006);
      voice.sources.push(thud); voice.nodes.push(thud, thudGain); voice.envelopes.push(thudGain);
      let remaining = voice.sources.length;
      for (const source of voice.sources) source.onended = () => {
        if (--remaining === 0) {
          for (const node of voice.nodes) node.disconnect();
          this.voices.delete(voice);
        }
      };
    }

    clear() {
      this.pending.length = 0;
      if (!this.context) return;
      const now = this.context.currentTime, end = now + 0.018;
      this.air?.gain.gain.setTargetAtTime(0, now, 0.04);
      for (const voice of this.voices) {
        for (const envelope of voice.envelopes) {
          envelope.gain.cancelScheduledValues(now);
          envelope.gain.setTargetAtTime(0, now, 0.004);
        }
        for (const source of voice.sources) source.stop(end);
      }
    }

    motion(blocks, view) {
      if (!this.enabled || this.context?.state !== 'running' || !this.air) return;
      let energy = 0, position = 0, fastest = 0;
      for (const b of blocks) {
        if (b.x + b.ex < view.x || b.x - b.ex > view.x + view.width || b.y + b.ey < view.y) continue;
        const rotationalSpeed = Math.abs(b.omega) * Math.hypot(b.width, b.height) / 4;
        const speed = Math.hypot(b.vx, b.vy) + rotationalSpeed;
        const weight = (b.width * b.height) ** 0.4 * Math.max(0, speed - 330) ** 2;
        energy += weight; position += b.x * weight; fastest = Math.max(fastest, speed);
      }
      const now = this.context.currentTime;
      const level = Math.min(0.00875, Math.sqrt(energy) * 0.00002);
      this.air.gain.gain.setTargetAtTime(level, now, level > this.air.gain.gain.value ? 0.04 : 0.12);
      this.air.filter.frequency.setTargetAtTime(Math.min(3600, 1100 + fastest * 2.5), now, 0.08);
      if (energy) this.air.pan.pan.setTargetAtTime(clamp(2 * (position / energy - view.x) / view.width - 1, -0.8, 0.8), now, 0.08);
    }
  }

  globalThis.DependencySound = ImpactSound;
})();
