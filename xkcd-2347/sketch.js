/* Original 2x artwork traced to paths. Collision shapes are rectangles. */
(async () => {
  'use strict';
  const { World, STEP } = DependencyPhysics;
  const world = new World();
  const svg = document.querySelector('#scene');
  const blocks = document.querySelector('#blocks');
  const shapes = document.querySelector('#collision-shapes');
  const tether = document.querySelector('#tether');
  const showShapes = document.querySelector('#show-shapes');
  showShapes.checked = false;
  window.addEventListener('pageshow', () => {
    showShapes.checked = false;
    shapes.setAttribute('hidden', '');
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
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const p = pointerPosition(event);
    const id = event.target.closest('[data-id]')?.getAttribute('data-id');
    const body = id ? world.blocks[Number(id) - 1] : world.pick(p.x, p.y);
    if (!body) return;
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

  function reset() {
    release(); world.reset(); accumulator = 0; build();
    document.querySelector('#announcement').textContent = `Tower rebuilt. All ${world.blocks.length} blocks are balanced and physics is running.`;
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

  function frame(now) {
    if (previousTime !== null) accumulator += Math.min((now - previousTime) / 1000, 0.1);
    previousTime = now;
    // Fixed substeps keep the result independent of display refresh rate.
    // The cap only discards time lost to background tabs / a stalled browser.
    while (accumulator >= STEP) { world.step(); accumulator -= STEP; }
    render(); requestAnimationFrame(frame);
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
