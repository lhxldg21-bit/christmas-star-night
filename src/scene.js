// 入口：渲染器 / 灯光 / 主循环 / 截图契约（__seek / __capture / __restore）。
// 时间模型：storyClock 驱动故事与雪；自动模式（capture 或 ?auto=1）按
// DURATION 循环重放整条旅程，因此 t=0 与 t=DURATION 像素一致。
import * as THREE from 'three';
import { loadConfig } from './config.js';
import { buildWorld, PALETTE } from './world.js';
import { buildPlayer, buildFox, buildStar } from './characters.js';
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

const DURATION = 46; // 自动样片一整趟的时长（秒）

const SKY = new THREE.Color(PALETTE.nightHorizon);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);
if (CAPTURE_MODE) {
  // 截图模式：DOM 状态必须是 t 的纯函数，墙钟动画/过渡一律关闭
  const st = document.createElement('style');
  st.textContent = '*{animation:none!important;transition:none!important}';
  document.head.appendChild(st);
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.nightTop);
scene.fog = new THREE.Fog(SKY, 26, 110);

const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 420);

// —— 灯光：冷月为主，琥珀点光为辅 ——
scene.add(new THREE.HemisphereLight(0x8fa1d8, 0x2a2530, 0.75));
const moonLight = new THREE.DirectionalLight(0xb9c8ff, 1.0);
moonLight.position.set(-18, 30, 12);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
moonLight.shadow.camera.left = -28;
moonLight.shadow.camera.right = 28;
moonLight.shadow.camera.top = 28;
moonLight.shadow.camera.bottom = -28;
moonLight.shadow.camera.far = 80;
moonLight.shadow.bias = -0.0008;
scene.add(moonLight);
const fill = new THREE.DirectionalLight(0x6a76b8, 0.25);
fill.position.set(12, 8, -16);
scene.add(fill);

// —— 世界与角色 ——
const world = buildWorld(scene, rand);
const { config, source } = loadConfig();
const player = buildPlayer();
const fox = buildFox();
fox.group.scale.setScalar(1.28); // 夜里雪地上要读得出同伴
const star = buildStar(config);
scene.add(player.group, fox.group, star);

const audio = new AudioEngine();
const story = new Story({
  scene, world, player, fox, star, config, audio,
  auto: AUTO,
  ui: null,
});
const ui = new UI({
  config, source, auto: AUTO, audio,
  onIntent: (it) => story.queueIntent(it),
});
story.ui = ui;
story.reset();

// —— 输入：点击/触摸移动；检视拖动旋转 ——
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let dragging = false;
let lastX = 0, lastY = 0;
renderer.domElement.style.touchAction = 'none';
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (story.state === 'inspect') {
    dragging = true;
    lastX = e.clientX; lastY = e.clientY;
    return;
  }
  if (story.state !== 'walk') return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObject(world.ground, false)[0];
  if (hit) story.queueIntent({ type: 'move', x: hit.point.x, z: hit.point.z });
});
addEventListener('pointermove', (e) => {
  if (!dragging || story.state !== 'inspect') return;
  story.inspect.yaw += (e.clientX - lastX) * 0.012;
  story.inspect.pitch = THREE.MathUtils.clamp(story.inspect.pitch + (e.clientY - lastY) * 0.008, -0.9, 0.9);
  lastX = e.clientX; lastY = e.clientY;
});
addEventListener('pointerup', () => { dragging = false; });

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
  window.__INFO__ = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
  hud.style.display = paused ? 'none' : '';
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
  camera.aspect = innerWidth / innerHeight;
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
