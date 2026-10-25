/* Original 2x artwork traced to paths. Collision shapes are rectangles. */
(async () => {
  'use strict';
  const { World, STEP } = DependencyPhysics;
  const world = new World();
  const sound = new DependencySound();
  world.onImpact = m => sound.impact(m, world.time);
  // Remembered resting layout. Rebuild animates from the live pose back to this.
  const home = world.blocks.map(b => ({ x: b.x, y: b.y }));
  // Explosion pivot: the bottom edge centre of the lowest block (the foundation).
  const base = world.blocks.reduce((low, b) => b.y + b.height / 2 > low.y + low.height / 2 ? b : low);
  const pivot = { x: base.x, y: base.y + base.height / 2 };
  const rebuild = { active: false, start: 0, from: [], explode: [], delays: [] };
  const FLY_MS = 380, STAGGER_MS = 240, SETTLE_MS = 180;
  const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  const easeOut = t => 1 - (1 - t) ** 3;
  const svg = document.querySelector('#scene');
  const blocks = document.querySelector('#blocks');
  const shapes = document.querySelector('#collision-shapes');
  const tether = document.querySelector('#tether');
  const showShapes = document.querySelector('#show-shapes');
  const soundControl = document.querySelector('#sound');
  const motionControl = document.querySelector('#motion');
  const controlStatus = document.querySelector('#control-status');
  const phone = navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
  const defaultSound = !phone;
  let soundRequest = 0, soundPending = false;
  function showControlStatus(message = '') {
    controlStatus.textContent = message;
    controlStatus.hidden = !message;
  }
  const motion = new DependencyMotion(world, message => {
    motionControl.checked = false;
    showControlStatus(message);
  });
  document.querySelector('#motion-option').hidden = !phone;
  motionControl.checked = false;
  soundControl.checked = defaultSound;
  sound.setEnabled(defaultSound);
  showShapes.checked = false;
  function soundUnavailable() {
    soundControl.checked = false;
    sound.setEnabled(false);
    showControlStatus('Audio is paused or blocked. Check Sound to try again.');
  }
  sound.onStateChange = state => {
    if (sound.active && sound.enabled && !soundPending && state !== 'running') soundUnavailable();
  };
  async function enableSound(playback) {
    const request = ++soundRequest;
    soundPending = true;
    sound.setEnabled(true);
    showControlStatus();
    let timeout;
    const running = await Promise.race([
      sound.unlock(playback),
      new Promise(resolve => { timeout = setTimeout(() => resolve(sound.context?.state === 'running'), 1000); }),
    ]);
    clearTimeout(timeout);
    if (request !== soundRequest) return;
    soundPending = false;
    if (running) soundControl.checked = true;
    else soundUnavailable();
  }
  function updateAudioFocus() {
    const active = !document.hidden && document.hasFocus();
    sound.setActive(active);
    if (!active) motion.recalibrate();
    else if (sound.enabled && sound.context && sound.context.state !== 'running' && !soundPending) soundUnavailable();
  }
  window.addEventListener('focus', updateAudioFocus);
  window.addEventListener('blur', () => sound.setActive(false));
  window.addEventListener('pagehide', () => {
    sound.setActive(false);
    motion.recalibrate();
  });
  document.addEventListener('visibilitychange', updateAudioFocus);
  updateAudioFocus();
  window.addEventListener('pageshow', () => {
    if (rebuild.active) finishRebuild();
    showShapes.checked = false;
    shapes.setAttribute('hidden', '');
    ++soundRequest; soundPending = false;
    soundControl.checked = defaultSound;
    sound.setEnabled(defaultSound);
    motionControl.checked = false;
    motion.stop();
    showControlStatus();
    updateAudioFocus();
  });
  const response = await fetch('dependency-optimized.svg');
  if (!response.ok) throw new Error(`Artwork request failed: ${response.status}`);
  const artwork = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
  document.querySelector('#lettering').replaceWith(document.importNode(artwork.querySelector('#lettering'), true));
  const sourceBlocks = artwork.querySelector('#blocks');
  for (const attr of sourceBlocks.attributes) {
    if (attr.name !== 'id') blocks.setAttribute(attr.name, attr.value);
  }
  const ns = 'http://www.w3.org/2000/svg';
  let paths = [], rectangles = [], pointerId = null, accumulator = 0, previousTime = null;

  function resizeScene() {
    const { width, height } = svg.getBoundingClientRect();
    if (!width || !height) return;
    // Keep the original drawing's proportions, anchor the floor at the bottom,
    // and expose the whole available world instead of clipping to comic edges.
    const scale = Math.min(Math.max(1, width - 24) / 385, Math.max(1, height - 24) / 469);
    const worldWidth = width / scale, worldHeight = height / scale;
    svg.setAttribute('viewBox', `${192.5 - worldWidth / 2} ${469 - worldHeight + 8 / scale} ${worldWidth} ${worldHeight}`);
  }
  new ResizeObserver(resizeScene).observe(svg);
  resizeScene();

  function element(tag, attrs, parent) {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    parent.append(node);
    return node;
  }

  function build() {
    blocks.replaceChildren(); shapes.replaceChildren();
    paths = world.blocks.map(b => {
      const p = element('g', { class: 'block', 'data-id': b.id, 'aria-label': b.label }, blocks);
      // The drawing stays in its original coordinates. This local offset attaches
      // it to a physics body without rescaling or simplifying any of its paths.
      const local = element('g', { transform: `translate(${-b.x} ${-b.y})` }, p);
      local.append(document.importNode(sourceBlocks.querySelector(`#block-${b.id}`), true));
      return p;
    });
    rectangles = world.blocks.map(b => element('rect', { x: -b.width / 2, y: -b.height / 2, width: b.width, height: b.height }, shapes));
    render();
  }

  function render() {
    world.blocks.forEach((b, i) => {
      const transform = `translate(${b.x.toFixed(4)} ${b.y.toFixed(4)}) rotate(${(b.angle * 180 / Math.PI).toFixed(4)})`;
      paths[i].setAttribute('transform', transform);
      if (!shapes.hasAttribute('hidden')) rectangles[i].setAttribute('transform', transform);
    });
    if (world.joint) {
      const j = world.joint, p = j.body.worldPoint(j.local);
      tether.firstElementChild.setAttribute('d', `M${p.x} ${p.y} L${j.target.x} ${j.target.y}`);
      tether.lastElementChild.setAttribute('cx', p.x);
      tether.lastElementChild.setAttribute('cy', p.y);
    }
  }

  function pointerPosition(event) {
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse());
  }

  function release() {
    const captured = pointerId;
    world.release(); pointerId = null;
    if (captured !== null && svg.hasPointerCapture(captured)) svg.releasePointerCapture(captured);
    svg.classList.remove('dragging');
    paths.forEach(p => p.classList.remove('grabbed'));
    tether.setAttribute('hidden', '');
  }

  svg.addEventListener('pointerdown', event => {
    if (rebuild.active) return;
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const p = pointerPosition(event);
    const id = event.target.closest('[data-id]')?.getAttribute('data-id');
    const body = id ? world.blocks[Number(id) - 1] : world.pick(p.x, p.y);
    if (!body) return;
    if (sound.enabled && sound.context?.state !== 'running') enableSound(false);
    event.preventDefault(); pointerId = event.pointerId;
    svg.setPointerCapture(pointerId);
    world.grab(body, p.x, p.y);
    paths[body.id - 1].classList.add('grabbed');
    svg.classList.add('dragging'); tether.removeAttribute('hidden'); render();
  });
  svg.addEventListener('pointermove', event => {
    if (event.pointerId === pointerId && world.joint) world.joint.target = pointerPosition(event);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    svg.addEventListener(type, event => { if (event.pointerId === pointerId) release(); });
  }
  window.addEventListener('blur', release);

  function animateRebuild(now) {
    const t = now - rebuild.start;
    world.blocks.forEach((_, i) => {
      const from = rebuild.from[i], out = rebuild.explode[i], h = home[i];
      let x, y, angle;
      if (t < FLY_MS) {
        const p = easeInOut(t / FLY_MS);
        x = from.x + (out.x - from.x) * p;
        y = from.y + (out.y - from.y) * p;
        // De-rotate on the way out, so every block waits upright to return.
        angle = from.angle * (1 - p);
      } else {
        // Each block waits its turn, bottom of the stack first, then settles upright.
        const q = Math.min(1, Math.max(0, (t - FLY_MS - rebuild.delays[i]) / SETTLE_MS));
        const p = easeOut(q);
        x = out.x + (h.x - out.x) * p;
        y = out.y + (h.y - out.y) * p;
        angle = 0;
      }
      const transform = `translate(${x.toFixed(4)} ${y.toFixed(4)}) rotate(${(angle * 180 / Math.PI).toFixed(4)})`;
      paths[i].setAttribute('transform', transform);
      if (!shapes.hasAttribute('hidden')) rectangles[i].setAttribute('transform', transform);
    });
    return t >= FLY_MS + STAGGER_MS + SETTLE_MS;
  }

  function finishRebuild() {
    rebuild.active = false;
    svg.classList.remove('rebuilding');
    release(); sound.clear(); world.reset(); motion.recalibrate(); accumulator = 0; build();
    document.querySelector('#announcement').textContent = `Tower rebuilt. All ${world.blocks.length} blocks are balanced and physics is running.`;
  }

  function reset() {
    if (rebuild.active) return;
    release(); sound.clear();
    rebuild.active = true;
    rebuild.start = performance.now();
    rebuild.from = world.blocks.map(b => ({ x: b.x, y: b.y, angle: b.angle }));
    // orig_pos is measured from the foundation's bottom edge centre. Each block
    // flies out to 1.08x that offset, then returns to the exact saved pose.
    rebuild.explode = home.map(h => ({
      x: pivot.x + (h.x - pivot.x) * 1.08,
      y: pivot.y + (h.y - pivot.y) * 1.08,
    }));
    const order = world.blocks.map((_, i) => i).sort((a, b) => home[b].y - home[a].y);
    const last = order.length - 1;
    rebuild.delays = new Array(order.length);
    order.forEach((index, rank) => { rebuild.delays[index] = last ? rank / last * STAGGER_MS : 0; });
    svg.classList.add('rebuilding');
  }
  document.querySelector('#reset').addEventListener('click', reset);
  window.addEventListener('keydown', event => {
    if (event.key.toLowerCase() === 'r' && !event.metaKey && !event.ctrlKey && !event.altKey && !event.repeat && !/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) reset();
    if (event.key === 'Escape') release();
    if (event.key.toLowerCase() === 'c' && !event.metaKey && !event.ctrlKey && !event.altKey && !event.repeat) {
      showShapes.checked = !showShapes.checked; updateShapes();
    }
  });
  function updateShapes() {
    shapes.toggleAttribute('hidden', !showShapes.checked); render();
  }
  showShapes.addEventListener('change', updateShapes);
  soundControl.addEventListener('change', () => {
    if (soundControl.checked) enableSound(true);
    else {
      ++soundRequest; soundPending = false;
      sound.setEnabled(false);
      showControlStatus();
    }
  });
  motionControl.addEventListener('change', async () => {
    showControlStatus();
    if (!motionControl.checked) { motion.stop(); return; }
    try {
      await motion.enable();
    } catch (error) {
      motionControl.checked = false;
      motion.stop();
      showControlStatus(error.message || 'Motion permission could not be enabled.');
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    release();
    if (rebuild.active) finishRebuild();
  });

  function frame(now) {
    if (previousTime !== null) accumulator += Math.min((now - previousTime) / 1000, 0.1);
    previousTime = now;
    if (rebuild.active) {
      if (animateRebuild(now)) finishRebuild();
    } else {
      // Fixed substeps keep the result independent of display refresh rate.
      // The cap only discards time lost to background tabs / a stalled browser.
      const pageActive = !document.hidden && document.hasFocus();
      while (accumulator >= STEP) { motion.apply(STEP, pageActive); world.step(); accumulator -= STEP; }
      sound.flush(svg.viewBox.baseVal);
      sound.motion(world.blocks, svg.viewBox.baseVal);
      render();
    }
    requestAnimationFrame(frame);
  }
  build(); requestAnimationFrame(frame);
  // Useful for inspecting the live solver in the browser console.
  window.dependency = { world, reset };
})().catch(error => {
  console.error(error);
  const notice = document.querySelector('#announcement');
  notice.classList.remove('sr-only');
  notice.textContent = location.protocol === 'file:'
    ? 'Open this sketch through a local web server to load its artwork.'
    : 'Could not load the artwork. Please reload.';
});
