// 入口：渲染器 / 灯光 / 主循环 / 截图契约（__seek / __capture / __restore）。
// 时间模型：storyClock 驱动故事与雪；自动模式（capture 或 ?auto=1）按
// DURATION 循环重放整条旅程，因此 t=0 与 t=DURATION 像素一致。
import * as THREE from 'three';
import { loadConfig } from './config.js';
import { buildWorld, PALETTE } from './world.js';
import { buildMittens, buildFox, buildStar } from './characters.js';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';
import { Story } from './story.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

window.__SCENE_READY__ = false;
window.__SCENE_ERROR__ = null;
const params = new URLSearchParams(location.search);
const CAPTURE_MODE = params.get('capture') === '1';
window.__CAPTURE_MODE__ = CAPTURE_MODE;
const T_PARAM = params.get('t');
const AUTO = CAPTURE_MODE || params.get('auto') === '1';
const CAPTURE_WIDTH = CAPTURE_MODE ? Number(params.get('vw')) || 0 : 0;
const CAPTURE_HEIGHT = CAPTURE_MODE ? Number(params.get('vh')) || 0 : 0;
const FIXED_CAPTURE_VIEWPORT = CAPTURE_WIDTH > 0 && CAPTURE_HEIGHT > 0;
const VIEW_WIDTH = FIXED_CAPTURE_VIEWPORT ? CAPTURE_WIDTH : innerWidth;
const VIEW_HEIGHT = FIXED_CAPTURE_VIEWPORT ? CAPTURE_HEIGHT : innerHeight;

const SEED = 20261225;
function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);

const DURATION = 92; // 自动样片一整趟的时长（秒）

const SKY = new THREE.Color(PALETTE.nightHorizon);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(FIXED_CAPTURE_VIEWPORT ? 1 : Math.min(devicePixelRatio, 2));
renderer.setSize(VIEW_WIDTH, VIEW_HEIGHT);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);
if (FIXED_CAPTURE_VIEWPORT) {
  document.documentElement.style.width = `${VIEW_WIDTH}px`;
  document.documentElement.style.height = `${VIEW_HEIGHT}px`;
  document.body.style.width = `${VIEW_WIDTH}px`;
  document.body.style.height = `${VIEW_HEIGHT}px`;
  renderer.domElement.style.position = 'absolute';
  const uiRoot = document.getElementById('ui');
  uiRoot.style.position = 'absolute';
  uiRoot.style.width = `${VIEW_WIDTH}px`;
  uiRoot.style.height = `${VIEW_HEIGHT}px`;
}
if (CAPTURE_MODE) {
  // 截图模式：DOM 状态必须是 t 的纯函数，墙钟动画/过渡一律关闭
  const st = document.createElement('style');
  st.textContent = '*{animation:none!important;transition:none!important}';
  document.head.appendChild(st);
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.nightTop);
scene.fog = new THREE.Fog(SKY, 10, 66);

function fovFor(aspect) { return 63 + (49 - 63) * THREE.MathUtils.clamp((aspect - 0.45) / 0.55, 0, 1); }
const camera = new THREE.PerspectiveCamera(fovFor(VIEW_WIDTH / VIEW_HEIGHT), VIEW_WIDTH / VIEW_HEIGHT, 0.07, 420);

// —— 灯光：冷月为主，琥珀点光为辅 ——
scene.add(new THREE.HemisphereLight(0xa3a6df, 0x777096, 0.66));
const moonLight = new THREE.DirectionalLight(0xb6c9ff, 1.10);
moonLight.position.set(-17, 25, -22);
moonLight.target.position.set(0, 0, -10);
scene.add(moonLight.target);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
moonLight.shadow.camera.left = -28;
moonLight.shadow.camera.right = 28;
moonLight.shadow.camera.top = 28;
moonLight.shadow.camera.bottom = -28;
moonLight.shadow.camera.far = 80;
moonLight.shadow.radius = 4;
moonLight.shadow.normalBias = .035;
moonLight.shadow.bias = -0.0008;
scene.add(moonLight);
const fill = new THREE.DirectionalLight(0xa1abeb, 0.34);
fill.position.set(12, 8, -16);
scene.add(fill);

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uGrid: { value: new THREE.Vector2() },
    uVignette: { value: 0.17 },
    uShadow: { value: new THREE.Vector3(0.93, 0.96, 1.06) },
    uHighlight: { value: new THREE.Vector3(1.05, 1.0, 0.94) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: [
    'uniform sampler2D tDiffuse; uniform float uVignette; uniform vec2 uGrid;',
    'uniform vec3 uShadow,uHighlight; varying vec2 vUv;',
    'void main(){',
    '  vec2 cell = floor(vUv * uGrid);',
    '  vec4 c = texture2D(tDiffuse, (cell + 0.5) / uGrid);',
    '  float l = dot(c.rgb, vec3(0.2126,0.7152,0.0722));',
    '  c.rgb *= mix(uShadow, uHighlight, smoothstep(0.25, 0.85, l));',
    '  vec2 d = vUv - 0.5;',
    '  c.rgb *= mix(1.0, (1.0 - smoothstep(0.3, 0.9, length(d))), uVignette);',
    '  vec2 tile = mod(cell, 2.0);',
    '  float dither = (tile.x * 2.0 + tile.y * (3.0 - 4.0 * tile.x)) / 4.0;',
    '  c.rgb = floor(clamp(c.rgb, 0.0, 1.0) * 37.0 + dither + 0.125) / 37.0;',
    '  gl_FragColor = c;',
    '}',
  ].join('\n'),
};
const composer = new EffectComposer(renderer);
composer.setPixelRatio(renderer.getPixelRatio());
composer.setSize(VIEW_WIDTH, VIEW_HEIGHT);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(VIEW_WIDTH, VIEW_HEIGHT), 0.42, 0.55, 0.50);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
const gradePass = new ShaderPass(GradeShader);
function updatePixelGrid(width, height) {
  const pixelSize = width < 600 ? 1.8 : 2.65;
  gradePass.uniforms.uGrid.value.set(Math.ceil(width / pixelSize), Math.ceil(height / pixelSize));
}
updatePixelGrid(VIEW_WIDTH, VIEW_HEIGHT);
composer.addPass(gradePass);
renderer.info.autoReset = false;

// —— 世界与角色 ——
const world = buildWorld(scene, rand);
const { config, source } = loadConfig();
const hands = buildMittens();
const fox = buildFox();
fox.group.scale.setScalar(.94); // 夜里雪地上要读得出同伴
const star = buildStar(config);
scene.add(hands, fox.group, star);

const audio = new AudioEngine();
const story = new Story({
  scene, world, hands, fox, star, config, audio,
  auto: AUTO,
  ui: null,
});
const ui = new UI({
  config, source, auto: AUTO, audio,
  onIntent: (it) => story.queueIntent(it),
});
story.ui = ui;
story.reset();

// 按住即走、松开即停；走路时也能拖拽转头；点星星本体可拾取，点狐狸有反应。
const surface = renderer.domElement;
surface.style.touchAction = 'none';
let pointer = null;
const clamp = THREE.MathUtils.clamp;
const rad = THREE.MathUtils.degToRad;
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pickAt(clientX, clientY) {
  const rect = surface.getBoundingClientRect();
  ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (story.canLightLantern() && raycaster.intersectObject(world.courtyardLantern.bulb).length) return 'lantern';
  if (raycaster.intersectObject(star.userData.star).length) return 'star';
  if (raycaster.intersectObject(fox.group, true).length) return 'fox';
  return null;
}
surface.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || event.button !== 0 || !['walk', 'inspect'].includes(story.state)) return;
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false,
    mode: story.state, t: performance.now(), yaw: story.look.yaw, pitch: story.look.pitch,
    starYaw: story.inspect.yaw, starPitch: story.inspect.pitch };
  if (story.state === 'walk') {
    pointer.hit = pickAt(event.clientX, event.clientY);
    pointer.wish = pointer.hit === 'star' && story.canPlace();
    if (pointer.wish) story.queueIntent({type: 'wish', active: true});
  }
  story.lookActive = true;
  surface.setPointerCapture(event.pointerId);
});
surface.addEventListener('pointermove', (event) => {
  if (pointer?.id !== event.pointerId || story.state !== pointer.mode) return;
  const x = event.clientX - pointer.x, y = event.clientY - pointer.y;
  if (Math.hypot(x, y) < 8 && !pointer.dragged) return;
  pointer.dragged = true;
  story.holdWalk = false;
  if (pointer.wish) {
    pointer.wish = false;
    story.queueIntent({type: 'wish', active: false});
  }
  if (pointer.mode === 'inspect') {
    story.inspect.yaw = pointer.starYaw + x * .012;
    story.inspect.pitch = clamp(pointer.starPitch + y * .008, -.9, .9);
  } else {
    story.look.yaw = clamp(pointer.yaw + x * .0045, -rad(60), rad(60));
    story.look.pitch = clamp(pointer.pitch + y * .004, -rad(25), rad(20));
  }
});
surface.addEventListener('pointerup', (event) => {
  if (pointer?.id !== event.pointerId) return;
  story.holdWalk = false;
  story.lookActive = false;
  const quick = !pointer.dragged && (performance.now() - pointer.t < 200);
  if (pointer.wish) {
    story.queueIntent({type: 'wish', active: false});
    if (!pointer.dragged) story.queueIntent({type: 'place'});
  } else if (quick && pointer.mode === 'walk' && story.state === 'walk') {
    const hit = pickAt(event.clientX, event.clientY);
    if (hit === 'star' && story.starState === 'ground') story.queueIntent({ type: 'pickup' });
    else if (hit === 'lantern') story.queueIntent({ type: 'light-lantern' });
    else if (hit === 'fox') story.queueIntent({ type: 'foxTap' });
    else story.queueIntent({ type: 'advance' });
  }
  pointer = null;
});
surface.addEventListener('lostpointercapture', () => {
  if (pointer?.wish) story.queueIntent({type: 'wish', active: false});
  pointer = null;
  story.holdWalk = false;
  story.lookActive = false;
});

// —— 主循环：固定步长推进故事，雪是时间的解析函数 ——
const hud = document.getElementById('hud');
const clock = new THREE.Clock();
const STEP = 1 / 60;
let acc = 0, storyClock = 0;
let paused = CAPTURE_MODE || T_PARAM !== null;

function simulate(t) {
  story.reset();
  const steps = Math.round(t / STEP);
  for (let i = 0; i < steps; i++) {
    story.update(STEP);
    story.applyCamera(camera, STEP);
  }
  if (steps === 0) story.applyCamera(camera, STEP); // t=0 也要落好初始机位
  world.snow.update(t, camera.position.x, camera.position.z);
  world.sparkle.update(t);
}

function draw() {
  const pb = story.pullbackT;
  const fk = pb >= 0 ? (story.reducedMotion ? 1 : THREE.MathUtils.smoothstep(pb, 0, 4.8)) : 0;
  scene.fog.near = 10 + 12 * fk;
  scene.fog.far = 66 + 44 * fk;
  for (const material of world.ridgeMaterials) material.opacity = 1 - fk;
  const lighting = THREE.MathUtils.smoothstep(story.awakenT, .45, 3.6);
  bloomPass.strength = THREE.MathUtils.lerp(.19, .42, Math.max(lighting, story.wishGlow * .85));
  renderer.toneMappingExposure = 1.05 + 0.08 * fk;
  renderer.info.reset();
  composer.render();
  document.body.dataset.stage = story.state;
  document.body.dataset.fox = story.f.mode;
  document.body.dataset.gag = story.f.gagT.toFixed(2);
  window.__INFO__ = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
  hud.style.display = params.has('debug') && !paused ? '' : 'none';
  if (!paused) hud.textContent = `t ${storyClock.toFixed(1)}s · calls ${renderer.info.render.calls} · tris ${renderer.info.render.triangles}`;
}

function animate() {
  if (pointer?.mode === 'walk' && !pointer.dragged && !pointer.wish && !pointer.hit &&
      performance.now() - pointer.t >= 200) story.holdWalk = true;
  const dt = Math.min(clock.getDelta(), 0.1);
  acc += dt;
  while (acc >= STEP) {
    acc -= STEP;
    storyClock += STEP;
    if (AUTO && storyClock >= DURATION) {
      storyClock -= DURATION;
      story.reset();
    }
    story.update(STEP);
    story.applyCamera(camera, STEP);
  }
  world.snow.update(storyClock, camera.position.x, camera.position.z);
  world.sparkle.update(storyClock);
  draw();
}

window.__seek = (t) => {
  window.__SCENE_READY__ = false;
  const v = Number(t);
  renderer.setAnimationLoop(null);
  paused = true;
  acc = 0;
  storyClock = Number.isFinite(v) && v > 0 ? v % DURATION : 0;
  simulate(storyClock);
  draw();
  window.__SCENE_READY__ = true;
};
window.__play = () => {
  if (CAPTURE_MODE) return;
  paused = false;
  clock.getDelta();
  renderer.setAnimationLoop(animate);
};
let captureState = null;
window.__capture = (t = storyClock) => {
  if (captureState) throw new Error('Capture already active');
  captureState = { storyClock, paused };
  window.__seek(t);
};
window.__restore = () => {
  if (!captureState) return;
  const s = captureState;
  captureState = null;
  paused = s.paused;
  storyClock = s.storyClock;
  simulate(storyClock);
  draw();
  clock.getDelta();
  renderer.setAnimationLoop(paused ? null : animate);
};

addEventListener('resize', () => {
  if (FIXED_CAPTURE_VIEWPORT) return;
  camera.aspect = innerWidth / innerHeight;
  camera.fov = fovFor(camera.aspect);
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  updatePixelGrid(innerWidth, innerHeight);
  if (paused) {
    window.__SCENE_READY__ = false;
    draw();
    window.__SCENE_READY__ = true;
  }
});

async function startScene() {
  if (paused) window.__seek(T_PARAM ?? 0);
  else {
    story.applyCamera(camera, 0);
    world.snow.update(0, camera.position.x, camera.position.z);
    world.sparkle.update(0);
    draw();
    window.__SCENE_READY__ = true;
    renderer.setAnimationLoop(animate);
  }
}
startScene().catch((error) => {
  renderer.setAnimationLoop(null);
  window.__SCENE_READY__ = false;
  window.__SCENE_ERROR__ = String((error && error.stack) || error);
});
