/* Opt-in phone tilt and shake, calibrated to the posture when enabled. */
(() => {
  'use strict';
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  class PhoneMotion {
    constructor(world, onError) {
      this.world = world;
      this.onError = onError;
      this.enabled = false;
      this.request = 0;
      this.handle = this.handle.bind(this);
      this.recalibrate = this.recalibrate.bind(this);
      this.recalibrate();
    }

    async enable() {
      const request = ++this.request;
      if (!window.isSecureContext) throw new Error('Accelerometer needs HTTPS.');
      if (!window.DeviceMotionEvent) throw new Error('Motion sensors are unavailable in this browser.');
      // Safari requires this call directly inside the checkbox's user gesture.
      if (typeof DeviceMotionEvent.requestPermission === 'function') {
        let permission;
        try { permission = await DeviceMotionEvent.requestPermission(); }
        catch (error) { if (request !== this.request) return false; throw error; }
        if (request !== this.request) return false;
        if (permission !== 'granted') throw new Error('Motion permission was denied.');
      }
      if (request !== this.request) return false;
      this.enabled = true;
      this.recalibrate();
      window.addEventListener('devicemotion', this.handle);
      window.addEventListener('orientationchange', this.recalibrate);
      screen.orientation?.addEventListener('change', this.recalibrate);
      this.waiting = setTimeout(() => {
        if (this.enabled && !this.lastSample) {
          this.stop();
          this.onError('No motion data. Check the browser’s motion permissions.');
        }
      }, 2500);
      return true;
    }

    stop() {
      ++this.request;
      this.enabled = false;
      clearTimeout(this.waiting);
      window.removeEventListener('devicemotion', this.handle);
      window.removeEventListener('orientationchange', this.recalibrate);
      screen.orientation?.removeEventListener('change', this.recalibrate);
      this.recalibrate();
    }

    recalibrate() {
      this.baseline = null;
      this.lastSample = 0;
      this.target = { x: 0, y: 0 };
      this.gravitySample = null;
      this.tiltForce = { x: 0, y: 0 };
      this.shakeTarget = { x: 0, y: 0 };
      this.shakeForce = { x: 0, y: 0 };
      this.world.acceleration.x = this.world.acceleration.y = 0;
    }

    handle(event) {
      if (!this.enabled || document.hidden || !document.hasFocus()) return;
      const g = event.accelerationIncludingGravity;
      if (!g || !Number.isFinite(g.x) || !Number.isFinite(g.y)) return;
      const angle = (screen.orientation?.angle ?? window.orientation ?? 0) * Math.PI / 180;
      const c = Math.cos(angle), s = Math.sin(angle);
      const x = g.x * c - g.y * s, y = -g.x * s - g.y * c;
      const now = performance.now();
      const linear = event.acceleration;
      const hasLinear = linear && Number.isFinite(linear.x) && Number.isFinite(linear.y);
      let shakeX, shakeY;
      if (hasLinear) {
        shakeX = linear.x * c - linear.y * s;
        shakeY = -linear.x * s - linear.y * c;
        this.gravitySample = { x: x - shakeX, y: y - shakeY };
      } else {
        // Devices without gravity-compensated acceleration get a high-pass
        // shake signal and a slower gravity estimate from the raw accelerometer.
        if (!this.gravitySample) this.gravitySample = { x, y };
        const dt = this.lastSample ? Math.min(0.1, (now - this.lastSample) / 1000) : 1 / 60;
        const amount = 1 - Math.exp(-dt / 0.18);
        this.gravitySample.x += (x - this.gravitySample.x) * amount;
        this.gravitySample.y += (y - this.gravitySample.y) * amount;
        shakeX = x - this.gravitySample.x;
        shakeY = y - this.gravitySample.y;
      }
      if (!this.baseline) {
        // Proper-acceleration signs differ in older iOS implementations. Infer
        // the polarity from the initial upright / face-up resting posture.
        const sign = Math.abs(this.gravitySample.y) > 2 ? Math.sign(this.gravitySample.y) : -(Math.sign(g.z) || 1);
        this.baseline = { ...this.gravitySample, sign };
      }
      const deadzone = value => Math.abs(value) < 0.18 ? 0 : value;
      const scale = this.world.gravity / 9.81;
      this.target.x = clamp(deadzone((this.gravitySample.x - this.baseline.x) * this.baseline.sign) * scale, -900, 900);
      this.target.y = clamp(deadzone((this.gravitySample.y - this.baseline.y) * this.baseline.sign) * scale, -900, 900);
      const jolt = value => Math.abs(value) < 0.5 ? 0 : clamp(value * this.baseline.sign * scale * 8, -3600, 3600);
      this.shakeTarget.x = jolt(shakeX);
      this.shakeTarget.y = jolt(shakeY);
      this.lastSample = now;
      clearTimeout(this.waiting);
    }

    apply(dt, active) {
      if (!this.enabled || !active || !this.lastSample || performance.now() - this.lastSample > 500) {
        this.world.acceleration.x = this.world.acceleration.y = 0;
        return;
      }
      const amount = 1 - Math.exp(-dt / 0.06);
      const quick = 1 - Math.exp(-dt / 0.008);
      const freshness = Math.exp(-Math.max(0, performance.now() - this.lastSample - 25) / 50);
      for (const axis of ['x', 'y']) {
        this.tiltForce[axis] += (this.target[axis] - this.tiltForce[axis]) * amount;
        this.shakeForce[axis] += (this.shakeTarget[axis] * freshness - this.shakeForce[axis]) * quick;
        this.world.acceleration[axis] = this.tiltForce[axis] + this.shakeForce[axis];
      }
    }
  }

  globalThis.DependencyMotion = PhoneMotion;
})();
