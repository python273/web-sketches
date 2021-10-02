const textureWidth = 512.0;
const textureHeight = 512.0;

const VERTEX_SHADER = `
precision highp float;
attribute vec4 a_position;

uniform mat4 u_matrix;
uniform sampler2D u_texture;
uniform float u_time;

varying vec2 v_pos;
varying float v_depth;

// float rand(float n){return fract(sin(n) * 43758.5453123);}
float rand(vec2 n) { 
	return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
}

void main() {
  float qwe = u_time / 100.0;
  float ht = mod(qwe - fract(qwe), 25.0);

  v_pos = a_position.xy;
  // v_depth = texture2D(u_texture, v_pos).r;
  v_depth = 0.0 + rand(
    vec2(0.0, (a_position.y * 0.99805) + a_position.x * (u_time / 1000000000.0 + 0.0001))
  ) * 1000.0;

  vec4 p = vec4(
    a_position.x * 1000.0 + rand(vec2(ht, a_position.y + a_position.x * 2.0)) * 0.1,
    a_position.y * 1000.0 + rand(vec2(ht, a_position.x + a_position.y * 2.0)) * 0.1,
    v_depth,
    1.0
  );

  gl_Position = u_matrix * p;
  gl_PointSize = 3.0 / gl_Position.w;
}
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform sampler2D u_texture;

varying vec2 v_pos;
varying float v_depth;


vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec3 c = hsv2rgb(vec3(v_depth / 1000.0, 1.0, 1.0));

  gl_FragColor = vec4(c, 1.0);
}
`;

let gl = null;
let glCanvas = null;

// Vertex information

let pointsArray;
let pointsBuffer;
let pointNumComponents;
let pointsCount;

// Rendering data shared with the scalers.

let aPointPosition;

window.addEventListener("load", startup, false);

function updateCanvasSizeToWindow(canvas, ctx) {
  const dpr = window.devicePixelRatio || 1;

  cx = window.innerWidth;
  cy = window.innerHeight;

  canvas.width = cx * dpr;
  canvas.height = cy * dpr;
  canvas.style.width = `${cx}px`;
  canvas.style.height = `${cy}px`;
}

function createCanvas(contextParams) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("webgl2", contextParams);
  updateCanvasSizeToWindow(canvas, ctx);
  document.body.appendChild(canvas);

  window.onresize = () => {
    updateCanvasSizeToWindow(canvas, ctx);
  };

  return [canvas, ctx];
}

let animationRequestID = null;
let g_xrSession = null;
let g_xrReferenceSpace = null;

async function handleXRbutton() {
  window.cancelAnimationFrame(animationRequestID);

  const xrSession = await navigator.xr.requestSession("immersive-vr");
  g_xrSession = xrSession;

  xrSession.updateRenderState({ baseLayer: new XRWebGLLayer(xrSession, gl) });

  const xrReferenceSpace = await xrSession.requestReferenceSpace("local");
  g_xrReferenceSpace = xrReferenceSpace;

  xrSession.requestAnimationFrame(xrAnimationHandler);
}
document
  .querySelector("#start-XR-button")
  .addEventListener("click", handleXRbutton, false);

// MOUSE
const mousePos = { x: 0.0, y: 0.0 };
document.addEventListener("mousemove", evt => {
  var rect = glCanvas.getBoundingClientRect();
  mousePos.x = ((evt.clientX - rect.left) / rect.width) * 2.0 - 1.0;
  mousePos.y = ((evt.clientY - rect.top) / rect.height) * 2.0 - 1.0;
});

// KEYS
const keys = {};

document.addEventListener(
  "keydown",
  evt => {
    keys[evt.code] = true;
  },
  true
);

document.addEventListener(
  "keyup",
  evt => {
    keys[evt.code] = false;
  },
  true
);

const translateInput = { x: -466, y: -496, z: 753.7 };
var previousTime = null;

const genPoints = () => {
  // Generates points to get depth data from texture
  // takes into account image aspect ratio

  const arr = new Float32Array(textureWidth * textureHeight * 2);
  const xa = 1.0 / textureWidth / 2.0;
  const ya = 1.0 / textureHeight / 2.0;

  const textureWidth2 = textureWidth * 2;

  for (let y = 0; y < textureHeight; y++) {
    for (let x = 0; x < textureWidth; x++) {
      arr[y * textureWidth2 + x * 2 + 0] = x / textureWidth + xa;
      arr[y * textureWidth2 + x * 2 + 1] = y / textureHeight + ya;
    }
  }

  return arr;
};

function startup() {
  [glCanvas, gl] = createCanvas({ alpha: false, xrCompatible: true });

  const shaderSet = [
    {
      type: gl.VERTEX_SHADER,
      code: VERTEX_SHADER
    },
    {
      type: gl.FRAGMENT_SHADER,
      code: FRAGMENT_SHADER
    }
  ];

  program = buildprogram(shaderSet);

  const pointsArray = genPoints();

  pointsBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pointsBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, pointsArray, gl.STATIC_DRAW);

  pointNumComponents = 2;
  pointsCount = pointsArray.length / pointNumComponents;

  const depthFloat32 = new Float32Array(textureWidth * textureHeight * 4);

  gl.getExtension("OES_texture_float");
  gl.getExtension("OES_texture_float_linear");

  var texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    textureWidth,
    textureHeight,
    0,
    gl.RGBA,
    gl.FLOAT,
    depthFloat32
  );

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

  window.requestAnimationFrame(flatAnimationHandler);
}

function animateScene(t, projectionMatrix, translate, transform) {
  gl.enable(gl.DEPTH_TEST);

  gl.useProgram(program);

  const textureLocation = gl.getUniformLocation(program, "u_texture");
  gl.uniform1i(textureLocation, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, pointsBuffer);

  aPointPosition = gl.getAttribLocation(program, "a_position");
  const matrixLocation = gl.getUniformLocation(program, "u_matrix");

  const uTimeLocation = gl.getUniformLocation(program, "u_time");
  gl.uniform1f(uTimeLocation, t);

  let qq = m4.scaling(0.001, 0.001, 0.001);
  qq = m4.yRotate(qq, Math.PI);

  // qq = m4.yRotate(qq, mousePos.x * Math.PI);
  // qq = m4.xRotate(qq, mousePos.y * Math.PI / 2.0);

  qq = m4.translate(qq, translate[0], translate[1], translate[2]);
  if (transform) {
    qq = m4.multiply(transform.inverse.matrix, qq);
  }
  qq = m4.multiply(projectionMatrix, qq);

  gl.uniformMatrix4fv(matrixLocation, false, qq);

  gl.enableVertexAttribArray(aPointPosition);
  gl.vertexAttribPointer(
    aPointPosition,
    pointNumComponents,
    gl.FLOAT,
    false,
    0,
    0
  );

  gl.drawArrays(gl.POINTS, 0, pointsCount);
}

function flatAnimationHandler(currentTime) {
  animationRequestID = window.requestAnimationFrame(flatAnimationHandler);

  if (previousTime === null) previousTime = currentTime;
  const delta = currentTime - previousTime;

  const X = 1.0;

  if (keys.KeyW) translateInput.z -= X * delta;
  if (keys.KeyS) translateInput.z += X * delta;
  if (keys.KeyA) translateInput.x -= X * delta;
  if (keys.KeyD) translateInput.x += X * delta;
  if (keys.ControlLeft) translateInput.y += X * delta;
  if (keys.Space) translateInput.y -= X * delta;
  // console.log(translateInput);

  var fieldOfViewRadians = degToRad(70.6);

  var aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
  var zNear = 0.01;
  var zFar = 8.0;
  var projectionMatrix = m4.perspective(
    fieldOfViewRadians,
    aspect,
    zNear,
    zFar
  );

  gl.viewport(0, 0, glCanvas.width, glCanvas.height);
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  previousTime = currentTime;
  animateScene(currentTime, projectionMatrix, [
    translateInput.x,
    translateInput.y,
    translateInput.z
  ]);
}

const xrAnimationHandler = (currentTime, xrFrame) => {
  g_xrSession.requestAnimationFrame(xrAnimationHandler);

  let viewer = xrFrame.getViewerPose(g_xrReferenceSpace);

  let glLayer = g_xrSession.renderState.baseLayer;

  gl.bindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer);

  gl.clearColor(0, 0, 0, 1.0);
  gl.clearDepth(1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // console.log(
  //   Array.from(viewer.views).map(v => v.transform.position)
  // );

  // console.log(
  //   Array.from(viewer.views).map(v => v.projectionMatrix)
  // );

  for (xrView of viewer.views) {
    const xrViewport = glLayer.getViewport(xrView);

    gl.viewport(
      xrViewport.x,
      xrViewport.y,
      xrViewport.width,
      xrViewport.height
    );

    previousTime = currentTime;
    animateScene(
      currentTime,
      xrView.projectionMatrix,
      [0, 0, 0],
      xrView.transform
    );
  }
};
