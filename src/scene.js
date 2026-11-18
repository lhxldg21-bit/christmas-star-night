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

const DURATION = 84; // 自动样片一整趟的时长（秒）

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

const camera = new THREE.PerspectiveCamera(VIEW_WIDTH < VIEW_HEIGHT ? 63 : 49, VIEW_WIDTH / VIEW_HEIGHT, 0.07, 420);

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

// 点按前进，拖动检视星星或在停步时看向两侧。
const surface = renderer.domElement;
surface.style.touchAction = 'none';
let pointer = null;
const clamp = THREE.MathUtils.clamp;
const rad = THREE.MathUtils.degToRad;
surface.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || event.button !== 0 || !['walk', 'inspect'].includes(story.state)) return;
  if (story.state === 'walk' && story.p.target) return;
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false,
    mode: story.state, yaw: story.look.yaw, pitch: story.look.pitch,
    starYaw: story.inspect.yaw, starPitch: story.inspect.pitch };
  surface.setPointerCapture(event.pointerId);
});
surface.addEventListener('pointermove', (event) => {
  if (pointer?.id !== event.pointerId || story.state !== pointer.mode) return;
  const x = event.clientX - pointer.x, y = event.clientY - pointer.y;
  if (Math.hypot(x, y) < 8 && !pointer.dragged) return;
  pointer.dragged = true;
  if (pointer.mode === 'inspect') {
    story.inspect.yaw = pointer.starYaw + x * .012;
    story.inspect.pitch = clamp(pointer.starPitch + y * .008, -.9, .9);
  } else {
    story.look.yaw = clamp(pointer.yaw + x * .0045, -rad(25), rad(25));
    story.look.pitch = clamp(pointer.pitch + y * .004, -rad(15), rad(10));
  }
});
surface.addEventListener('pointerup', (event) => {
  if (pointer?.id !== event.pointerId) return;
  if (!pointer.dragged && pointer.mode === 'walk' && story.state === 'walk') story.queueIntent({ type: 'advance' });
  pointer = null;
});
surface.addEventListener('lostpointercapture', () => { pointer = null; });

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
}

function draw() {
  renderer.render(scene, camera);
  document.body.dataset.stage = story.state;
  document.body.dataset.fox = story.f.mode;
  document.body.dataset.gag = story.f.gagT.toFixed(2);
  window.__INFO__ = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
  hud.style.display = params.has('debug') && !paused ? '' : 'none';
  if (!paused) hud.textContent = `t ${storyClock.toFixed(1)}s · calls ${renderer.info.render.calls} · tris ${renderer.info.render.triangles}`;
}

function animate() {
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
  camera.fov = innerWidth < innerHeight ? 63 : 49;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
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
