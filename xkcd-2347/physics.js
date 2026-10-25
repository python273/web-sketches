/* A small, always-awake 2D rigid-body solver. No libraries, sleeping, pins, or
 * special rules for the initial stack: only the floor has infinite mass. */
(() => {
  'use strict';

  const cross = (ax, ay, bx, by) => ax * by - ay * bx;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const STEP = 1 / 240;
  const SKIN = 0.035;

  // x, y, width, height, label. Coordinates follow the original comic.
  const layout = [
    [20, 453, 234, 16, 'The foundation'],
    [35, 431, 195, 22, 'The platform'],
    [51, 420, 58, 11], [60, 404, 44, 16],
    [192, 404, 7, 27, 'The dependency'],
    [55, 392, 154, 12], [44, 341, 173, 51],
    [38, 227, 88, 114], [131, 306, 91, 35],
    [130, 269, 98, 37], [42, 210, 74, 17],
    [47, 190, 14, 20], [71, 196, 12, 14], [89, 189, 26, 21],
    [91, 144, 22, 45], [95.2, 127.3, 4.8, 16.7], [105, 117, 6, 27],
    [89.5, 122, 13, 5.3], [100.5, 106.5, 14.5, 10.5],
    [101, 97, 6, 9.5], [111, 97.5, 5, 9],
    [42.5, 182, 29.5, 8], [40.5, 175, 6, 7], [50, 167, 7, 15],
    [62, 171, 4, 11], [44, 160.5, 19, 6.5], [49, 131, 5, 29.5],
    [50, 119, 3, 12], [58, 149.5, 9, 11], [58, 140.5, 9, 9],
    [77, 180, 4, 16],
    [152, 213, 22, 56], [169, 201, 8, 12], [159, 187, 6, 26],
    [153, 170, 18, 17], [185, 196, 25, 73], [190, 181, 12, 15],
    [193, 170, 8, 11], [145, 157, 64, 13],
    [161, 116, 33, 41], [201, 135, 12, 22], [205, 121, 4, 14],
    [143.5, 146, 10, 11], [147.5, 131.5, 5, 14.5], [144, 125, 10, 6.5],
    [161, 106, 15, 10], [176, 106, 6, 10], [183, 106, 15, 10],
    [168, 94, 24, 12],
    [170, 80, 4, 14], [179, 83, 3.5, 11], [186, 84, 4, 10],
    [216, 249, 13, 20], [219, 233, 5, 16], [214, 223.5, 15, 9.5],
    [215, 215, 4, 8.5], [225, 217, 4, 6.5],
    [134, 258, 13, 11], [138, 236, 5, 22], [135, 230, 11, 6],
    [138, 223, 3, 7], [133, 252, 4, 6],
  ];

  class Body {
    constructor(id, x, y, width, height, label, fixed = false) {
      Object.assign(this, { id, x: x + width / 2, y: y + height / 2,
        width, height, label: label || 'A piece of modern infrastructure',
        angle: 0, vx: 0, vy: 0, omega: 0, fixed });
      this.mass = width * height;
      this.invMass = fixed ? 0 : 1 / this.mass;
      this.invI = fixed ? 0 : 12 / (this.mass * (width * width + height * height));
      this.update();
    }
    update() {
      this.c = Math.cos(this.angle);
      this.s = Math.sin(this.angle);
      this.ex = (Math.abs(this.c) * this.width + Math.abs(this.s) * this.height) / 2;
      this.ey = (Math.abs(this.s) * this.width + Math.abs(this.c) * this.height) / 2;
    }
    localPoint(x, y) {
      const dx = x - this.x, dy = y - this.y;
      return { x: this.c * dx + this.s * dy, y: -this.s * dx + this.c * dy };
    }
    worldPoint(p) {
      return { x: this.x + this.c * p.x - this.s * p.y,
        y: this.y + this.s * p.x + this.c * p.y };
    }
    contains(x, y) {
      const p = this.localPoint(x, y);
      return Math.abs(p.x) <= this.width / 2 && Math.abs(p.y) <= this.height / 2;
    }
  }

  function face(b, nx, ny) {
    const du = nx * b.c + ny * b.s;
    const dv = -nx * b.s + ny * b.c;
    let x, y, depth, half, id;
    if (Math.abs(du) > Math.abs(dv)) {
      const sign = du > 0 ? 1 : -1;
      x = b.c * sign; y = b.s * sign;
      depth = b.width / 2; half = b.height / 2; id = sign > 0 ? 0 : 1;
    } else {
      const sign = dv > 0 ? 1 : -1;
      x = -b.s * sign; y = b.c * sign;
      depth = b.height / 2; half = b.width / 2; id = sign > 0 ? 2 : 3;
    }
    return { nx: x, ny: y, x: b.x + x * depth, y: b.y + y * depth,
      tx: -y, ty: x, half, id };
  }

  function clip(points, nx, ny, offset, id) {
    const d0 = points[0].x * nx + points[0].y * ny - offset;
    const d1 = points[1].x * nx + points[1].y * ny - offset;
    const out = [];
    if (d0 <= 0) out.push(points[0]);
    if (d1 <= 0) out.push(points[1]);
    if (d0 * d1 < 0) {
      const t = d0 / (d0 - d1);
      out.push({ x: points[0].x + t * (points[1].x - points[0].x),
        y: points[0].y + t * (points[1].y - points[0].y), id });
    }
    return out;
  }

  function collide(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dx) > a.ex + b.ex + SKIN || Math.abs(dy) > a.ey + b.ey + SKIN) return null;
    const axes = [[a.c, a.s], [-a.s, a.c], [b.c, b.s], [-b.s, b.c]];
    let separation = -Infinity, axis = 0, nx = 0, ny = 0;
    for (let i = 0; i < 4; i++) {
      const [x, y] = axes[i];
      const ra = (Math.abs(x * a.c + y * a.s) * a.width + Math.abs(-x * a.s + y * a.c) * a.height) / 2;
      const rb = (Math.abs(x * b.c + y * b.s) * b.width + Math.abs(-x * b.s + y * b.c) * b.height) / 2;
      const distance = dx * x + dy * y;
      const s = Math.abs(distance) - ra - rb;
      if (s > SKIN) return null;
      // A little hysteresis avoids swapping the reference face on parallel boxes.
      if (s > separation + 0.005) {
        separation = s; axis = i;
        const sign = distance >= 0 ? 1 : -1;
        nx = x * sign; ny = y * sign;
      }
    }
    const reference = axis < 2 ? a : b;
    const incident = axis < 2 ? b : a;
    const sign = axis < 2 ? 1 : -1;
    const r = face(reference, nx * sign, ny * sign);
    const f = face(incident, -r.nx, -r.ny);
    let points = [
      { x: f.x - f.tx * f.half, y: f.y - f.ty * f.half, id: 0 },
      { x: f.x + f.tx * f.half, y: f.y + f.ty * f.half, id: 1 },
    ];
    const mid = r.tx * r.x + r.ty * r.y;
    points = clip(points, r.tx, r.ty, mid + r.half, 2);
    if (points.length < 2) return null;
    points = clip(points, -r.tx, -r.ty, -mid + r.half, 3);
    const contacts = [];
    for (const p of points) {
      const s = (p.x - r.x) * r.nx + (p.y - r.y) * r.ny;
      if (s > SKIN) continue;
      const x = p.x - r.nx * s / 2, y = p.y - r.ny * s / 2;
      contacts.push({ x, y, separation: s, id: `${axis < 2 ? 0 : 1}:${r.id}:${f.id}:${p.id}`,
        normalImpulse: 0, tangentImpulse: 0,
        localA: a.localPoint(x, y), localB: b.localPoint(x, y) });
    }
    return contacts.length ? { a, b, nx, ny, contacts, reference, referenceAngle: reference.angle } : null;
  }

  function impulse(a, b, p, ix, iy) {
    a.vx -= ix * a.invMass; a.vy -= iy * a.invMass;
    a.omega -= cross(p.rax, p.ray, ix, iy) * a.invI;
    b.vx += ix * b.invMass; b.vy += iy * b.invMass;
    b.omega += cross(p.rbx, p.rby, ix, iy) * b.invI;
  }

  function relativeVelocity(a, b, p) {
    return { x: b.vx - b.omega * p.rby - a.vx + a.omega * p.ray,
      y: b.vy + b.omega * p.rbx - a.vy - a.omega * p.rax };
  }

  class World {
    constructor() { this.reset(); }
    reset() {
      this.floor = new Body(0, -5e6, 469, 1e7, 100, 'Floor', true);
      this.blocks = layout.map((r, i) => new Body(i + 1, ...r));
      this.bodies = [this.floor, ...this.blocks];
      this.cache = new Map(); this.joint = null; this.steps = 0; this.time = 0;
      this.gravity = 300; this.manifolds = [];
    }
    pick(x, y) {
      return [...this.blocks].reverse().find(b => b.contains(x, y)) || null;
    }
    grab(body, x, y) {
      this.joint = { body, local: body.localPoint(x, y), target: { x, y }, ix: 0, iy: 0 };
    }
    release() { this.joint = null; }

    prepareJoint(dt) {
      const j = this.joint;
      if (!j) return;
      const b = j.body, p = b.worldPoint(j.local);
      j.rx = p.x - b.x; j.ry = p.y - b.y;
      const frequency = 2 * Math.PI * 6;
      const stiffness = b.mass * frequency * frequency;
      const damping = 2 * b.mass * 0.85 * frequency;
      j.gamma = 1 / (dt * (damping + dt * stiffness));
      const beta = dt * stiffness * j.gamma;
      j.bx = (p.x - j.target.x) * beta; j.by = (p.y - j.target.y) * beta;
      const k11 = b.invMass + b.invI * j.ry * j.ry + j.gamma;
      const k12 = -b.invI * j.rx * j.ry;
      const k22 = b.invMass + b.invI * j.rx * j.rx + j.gamma;
      const det = k11 * k22 - k12 * k12;
      j.m11 = k22 / det; j.m12 = -k12 / det; j.m22 = k11 / det;
      j.maxImpulse = Math.max(b.mass, 300) * this.gravity * 80 * dt;
      b.vx += j.ix * b.invMass; b.vy += j.iy * b.invMass;
      b.omega += cross(j.rx, j.ry, j.ix, j.iy) * b.invI;
    }
    solveJoint() {
      const j = this.joint;
      if (!j) return;
      const b = j.body;
      const cx = b.vx - b.omega * j.ry + j.bx + j.gamma * j.ix;
      const cy = b.vy + b.omega * j.rx + j.by + j.gamma * j.iy;
      const oldX = j.ix, oldY = j.iy;
      j.ix -= j.m11 * cx + j.m12 * cy;
      j.iy -= j.m12 * cx + j.m22 * cy;
      const length = Math.hypot(j.ix, j.iy);
      if (length > j.maxImpulse) { j.ix *= j.maxImpulse / length; j.iy *= j.maxImpulse / length; }
      const ix = j.ix - oldX, iy = j.iy - oldY;
      b.vx += ix * b.invMass; b.vy += iy * b.invMass;
      b.omega += cross(j.rx, j.ry, ix, iy) * b.invI;
    }

    step(dt = STEP) {
      // Every body receives gravity on every substep, including at rest.
      for (const b of this.blocks) {
        b.vy += this.gravity * dt;
        const drag = 1 / (1 + 0.025 * dt);
        b.vx *= drag; b.vy *= drag; b.omega *= drag;
      }
      const manifolds = [], cache = new Map();
      for (let i = 0; i < this.bodies.length; i++) {
        for (let k = i + 1; k < this.bodies.length; k++) {
          const a = this.bodies[i], b = this.bodies[k];
          const m = collide(a, b);
          if (!m) continue;
          const key = `${a.id}:${b.id}`, previous = this.cache.get(key);
          m.approachSpeed = 0;
          for (const p of m.contacts) {
            p.rax = p.x - a.x; p.ray = p.y - a.y;
            p.rbx = p.x - b.x; p.rby = p.y - b.y;
            p.rnA = cross(p.rax, p.ray, m.nx, m.ny);
            p.rnB = cross(p.rbx, p.rby, m.nx, m.ny);
            const rtA = p.rax * m.nx + p.ray * m.ny;
            const rtB = p.rbx * m.nx + p.rby * m.ny;
            p.kn = a.invMass + b.invMass + a.invI * p.rnA ** 2 + b.invI * p.rnB ** 2;
            p.mt = 1 / (a.invMass + b.invMass + a.invI * rtA ** 2 + b.invI * rtB ** 2);
            const v = relativeVelocity(a, b, p);
            const vn = v.x * m.nx + v.y * m.ny;
            m.approachSpeed = Math.max(m.approachSpeed, -vn);
            p.bias = vn < -25 ? -0.06 * vn : 0;
            const old = previous && previous.nx * m.nx + previous.ny * m.ny > 0.95
              ? previous.contacts.find(q => q.id === p.id) : null;
            if (old) { p.normalImpulse = old.normalImpulse; p.tangentImpulse = old.tangentImpulse; }
          }
          if (m.contacts.length === 2) {
            const [p, q] = m.contacts;
            m.k12 = a.invMass + b.invMass + a.invI * p.rnA * q.rnA + b.invI * p.rnB * q.rnB;
            m.det = p.kn * q.kn - m.k12 * m.k12;
            m.blockSolve = p.kn * p.kn < 1000 * m.det;
          }
          manifolds.push(m); cache.set(key, m);
        }
      }
      this.manifolds = manifolds;
      for (const m of manifolds) {
        for (const p of m.contacts) {
          impulse(m.a, m.b, p, m.nx * p.normalImpulse - m.ny * p.tangentImpulse,
            m.ny * p.normalImpulse + m.nx * p.tangentImpulse);
        }
      }
      this.prepareJoint(dt);
      for (let iteration = 0; iteration < 32; iteration++) {
        this.solveJoint();
        for (const m of manifolds) this.solveVelocity(m);
      }
      // Report actual impacts, not the continuous impulses supporting a stack.
      if (this.onImpact) {
        for (const m of manifolds) {
          if (m.approachSpeed > 18 && m.contacts.some(p => p.normalImpulse > 0)) this.onImpact(m);
        }
      }
      for (const b of this.blocks) {
        b.x += b.vx * dt; b.y += b.vy * dt; b.angle += b.omega * dt; b.update();
      }
      // Separate position impulses correct penetration without injecting energy.
      for (let iteration = 0; iteration < 10; iteration++) {
        for (const m of manifolds) this.solvePosition(m);
      }
      this.cache = cache; this.steps++; this.time += dt;
    }

    solveVelocity(m) {
      const { a, b, nx, ny, contacts } = m;
      if (m.blockSolve) {
        const [p, q] = contacts;
        const vp = relativeVelocity(a, b, p), vq = relativeVelocity(a, b, q);
        const b1 = vp.x * nx + vp.y * ny - p.bias - p.kn * p.normalImpulse - m.k12 * q.normalImpulse;
        const b2 = vq.x * nx + vq.y * ny - q.bias - m.k12 * p.normalImpulse - q.kn * q.normalImpulse;
        let x = (m.k12 * b2 - q.kn * b1) / m.det;
        let y = (m.k12 * b1 - p.kn * b2) / m.det;
        let valid = x >= 0 && y >= 0;
        if (!valid) { x = 0; y = -b2 / q.kn; valid = y >= 0 && m.k12 * y + b1 >= 0; }
        if (!valid) { y = 0; x = -b1 / p.kn; valid = x >= 0 && m.k12 * x + b2 >= 0; }
        if (!valid) { x = 0; y = 0; valid = b1 >= 0 && b2 >= 0; }
        if (valid) {
          impulse(a, b, p, nx * (x - p.normalImpulse), ny * (x - p.normalImpulse));
          impulse(a, b, q, nx * (y - q.normalImpulse), ny * (y - q.normalImpulse));
          p.normalImpulse = x; q.normalImpulse = y;
        }
      } else {
        for (const p of contacts) {
          const v = relativeVelocity(a, b, p), old = p.normalImpulse;
          p.normalImpulse = Math.max(0, old + (p.bias - v.x * nx - v.y * ny) / p.kn);
          impulse(a, b, p, nx * (p.normalImpulse - old), ny * (p.normalImpulse - old));
        }
      }
      for (const p of contacts) {
        const v = relativeVelocity(a, b, p), old = p.tangentImpulse;
        const limit = 0.65 * p.normalImpulse;
        p.tangentImpulse = clamp(old - (-v.x * ny + v.y * nx) * p.mt, -limit, limit);
        const d = p.tangentImpulse - old;
        impulse(a, b, p, -ny * d, nx * d);
      }
    }

    solvePosition(m) {
      const { a, b } = m;
      const delta = m.reference.angle - m.referenceAngle;
      const c = Math.cos(delta), s = Math.sin(delta);
      const nx = c * m.nx - s * m.ny, ny = s * m.nx + c * m.ny;
      for (const p of m.contacts) {
        const pa = a.worldPoint(p.localA), pb = b.worldPoint(p.localB);
        const separation = (pb.x - pa.x) * nx + (pb.y - pa.y) * ny + p.separation;
        const correction = clamp(0.25 * (separation + 0.006), -1.5, 0);
        const rax = pa.x - a.x, ray = pa.y - a.y;
        const rbx = pb.x - b.x, rby = pb.y - b.y;
        const ra = cross(rax, ray, nx, ny), rb = cross(rbx, rby, nx, ny);
        const amount = -correction / (a.invMass + b.invMass + a.invI * ra * ra + b.invI * rb * rb);
        a.x -= nx * amount * a.invMass; a.y -= ny * amount * a.invMass;
        a.angle -= amount * ra * a.invI;
        b.x += nx * amount * b.invMass; b.y += ny * amount * b.invMass;
        b.angle += amount * rb * b.invI;
        a.update(); b.update();
      }
    }
  }

  globalThis.DependencyPhysics = { World, STEP, layout };
})();
