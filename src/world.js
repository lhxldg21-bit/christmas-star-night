// 世界构建：微缩雪夜场景。奶油白雪地 + 蓝紫夜色 + 琥珀灯光 + 少量莓红。
// 所有随机性走传入的 rand()，保证每次构建一致、可重复截图。
import * as THREE from 'three';

export const PALETTE = {
  snow: 0xf3eee6,
  snowShade: 0xdfe4f2,
  nightTop: 0x0e1430,
  nightHorizon: 0x27325e,
  amber: 0xffb45e,
  starAmber: 0xffd27a,
  berry: 0xb03048,
  pine: 0x2c4a44,
  pineSnow: 0xe9ecf4,
  bark: 0x4a3a33,
  stone: 0x8a8fa3,
  foxRust: 0xc97b4a,
  cream: 0xf5e8d8,
  coatBlue: 0x4a5a8a,
};

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, flatShading: true, ...opts });
}

// 路径：从起点（狐狸与星星旁）到小院底座。短路线，一眼能望到头。
export function makePath() {
  const pts = [
    new THREE.Vector3(-2.0, 0, 9.0),
    new THREE.Vector3(-3.4, 0, 4.2),
    new THREE.Vector3(-1.2, 0, -1.6),
    new THREE.Vector3(1.4, 0, -6.8),
    new THREE.Vector3(0.2, 0, -11.4),
  ];
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4);
  const samples = curve.getSpacedPoints(120);
  const length = curve.getLength();
  return { curve, samples, length };
}

// 地形高度：平缓起伏，路径走廊压平。纯函数，构建期调用。
function makeHeightField(path) {
  const hills = [
    { x: -9, z: 2, r: 7, h: 0.9 },
    { x: 8, z: -3, r: 8, h: 1.1 },
    { x: -7, z: -10, r: 6, h: 0.7 },
    { x: 10, z: 8, r: 9, h: 0.8 },
    { x: 3, z: 14, r: 7, h: 0.6 },
  ];
  function distToPath(x, z) {
    let d = Infinity;
    for (const p of path.samples) {
      const dx = p.x - x, dz = p.z - z;
      const dd = dx * dx + dz * dz;
      if (dd < d) d = dd;
    }
    return Math.sqrt(d);
  }
  return function height(x, z) {
    let h = 0;
    for (const k of hills) {
      const dx = x - k.x, dz = z - k.z;
      const d2 = (dx * dx + dz * dz) / (k.r * k.r);
      if (d2 < 1) h += k.h * (1 - d2) * (1 - d2);
    }
    h += 0.08 * Math.sin(x * 0.7) * Math.cos(z * 0.55);
    const dp = distToPath(x, z);
    const flat = THREE.MathUtils.smoothstep(dp, 0.9, 3.2); // 路径 1.8m 内全平
    return h * flat;
  };
}

export function buildWorld(scene, rand) {
  const world = { lamps: [], glowDecals: [] };
  const path = makePath();
  world.path = path;
  const heightAt = makeHeightField(path);
  world.heightAt = heightAt;

  // —— 地面：半径足够大，任何合法机位看不到边缘 ——
  const SEG = 96, SIZE = 260;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cSnow = new THREE.Color(PALETTE.snow);
  const cShade = new THREE.Color(PALETTE.snowShade);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const d = distFromOrigin(x, z);
    // 远处轻微偏蓝，近处奶白；路径上略压暗便于读脚印
    tmp.copy(cSnow).lerp(cShade, THREE.MathUtils.clamp(d / 120, 0, 0.55));
    let dp = Infinity;
    if (d < 30) {
      for (const p of path.samples) {
        const dd = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (dd < dp) dp = dd;
      }
      dp = Math.sqrt(dp);
      if (dp < 1.4) tmp.lerp(cShade, 0.35 * (1 - dp / 1.4));
    }
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 0, flatShading: true,
  }));
  ground.receiveShadow = true;
  scene.add(ground);
  world.ground = ground;

  buildSky(scene, world, rand);
  buildPines(scene, world, rand, heightAt, path);
  buildSnowDrifts(scene, rand, heightAt, path);
  buildLamps(scene, world, path, heightAt);
  buildCourtyard(scene, world, heightAt);
  buildDistantHills(scene, rand);
  world.snow = buildSnowfall(scene, rand);
  return world;
}

function distFromOrigin(x, z) { return Math.sqrt(x * x + z * z); }

// —— 天空：渐变穹顶 + 星点 + 月亮 ——
function buildSky(scene, world, rand) {
  const skyGeo = new THREE.SphereGeometry(190, 24, 12);
  const top = new THREE.Color(PALETTE.nightTop);
  const hor = new THREE.Color(PALETTE.nightHorizon);
  const cols = new Float32Array(skyGeo.attributes.position.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < skyGeo.attributes.position.count; i++) {
    const y = skyGeo.attributes.position.getY(i) / 190;
    c.copy(hor).lerp(top, THREE.MathUtils.smoothstep(y, -0.05, 0.6));
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  }));
  sky.renderOrder = -10;
  scene.add(sky);

  // 星点
  const N = 420;
  const starPos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2;
    const el = 0.18 + rand() * 1.2;
    const r = 175;
    starPos[i * 3] = Math.cos(a) * Math.cos(el) * r;
    starPos[i * 3 + 1] = Math.sin(el) * r;
    starPos[i * 3 + 2] = Math.sin(a) * Math.cos(el) * r;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xfff6e0, size: 1.1, sizeAttenuation: false, fog: false,
    transparent: true, opacity: 0.85, depthWrite: false,
  }));
  scene.add(stars);

  // 月亮：柔光圆盘
  const moonTex = makeGlowTexture('#fff3d6', '#fff3d600');
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({
    map: moonTex, fog: false, depthWrite: false, transparent: true, opacity: 0.95,
  }));
  moon.position.set(-70, 85, -120);
  moon.scale.setScalar(34);
  scene.add(moon);
}

function makeGlowTexture(inner, outer) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// —— 松树：参数化一族，实例化渲染。树干 + 三层雪盖锥体合并为两棵 InstancedMesh ——
function buildPines(scene, world, rand, heightAt, path) {
  const trunkGeo = new THREE.CylinderGeometry(0.09, 0.16, 0.7, 6);
  trunkGeo.translate(0, 0.35, 0);
  const tiers = [];
  const tierSpec = [
    [0.95, 0.9, 0.55],
    [0.72, 0.75, 1.15],
    [0.48, 0.6, 1.68],
  ];
  for (const [r, h, y] of tierSpec) {
    const cone = new THREE.ConeGeometry(r, h, 7);
    cone.translate(0, y, 0);
    tiers.push(cone);
  }
  const foliGeo = mergeGeos(tiers);

  const placements = [];
  for (let i = 0; i < 90 && placements.length < 46; i++) {
    const a = rand() * Math.PI * 2;
    const r = 7 + rand() * 55;
    const x = Math.cos(a) * r, z = Math.sin(a) * r - 4;
    let dp = Infinity;
    for (const p of path.samples) {
      const dd = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (dd < dp) dp = dd;
    }
    if (Math.sqrt(dp) < 3.4) continue; // 让开路径
    if (Math.abs(x) < 5 && z < -9 && z > -22) continue; // 让开小院
    placements.push({ x, z, s: 0.8 + rand() * 1.6, rot: rand() * Math.PI * 2 });
  }
  const trunkMat = mat(PALETTE.bark);
  const foliMat = mat(PALETTE.pine);
  // 雪盖：同一几何、浅色、略放大上浮，形成积雪感
  const snowMat = mat(PALETTE.pineSnow);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, placements.length);
  const folis = new THREE.InstancedMesh(foliGeo, foliMat, placements.length);
  const snows = new THREE.InstancedMesh(foliGeo, snowMat, placements.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  placements.forEach((p, i) => {
    const y = heightAt(p.x, p.z) - 0.05;
    q.setFromAxisAngle(v.set(0, 1, 0), p.rot);
    m.compose(new THREE.Vector3(p.x, y, p.z), q, sc.setScalar(p.s));
    trunks.setMatrixAt(i, m);
    folis.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(p.x, y + 0.10 * p.s, p.z), q, sc.setScalar(p.s * 1.04));
    snows.setMatrixAt(i, m);
  });
  trunks.castShadow = folis.castShadow = true;
  folis.receiveShadow = true;
  scene.add(trunks, folis, snows);
}

function mergeGeos(geos) {
  // 手动合并（都是非索引化前的索引几何，转非索引拼接）
  let total = 0;
  const nonIndexed = geos.map((g) => g.toNonIndexed());
  for (const g of nonIndexed) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const norm = new Float32Array(total * 3);
  let off = 0;
  for (const g of nonIndexed) {
    pos.set(g.attributes.position.array, off * 3);
    norm.set(g.attributes.normal.array, off * 3);
    off += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  return out;
}

// —— 雪堆与石头：半埋的压扁球，制造地形厚度与使用痕迹 ——
function buildSnowDrifts(scene, rand, heightAt, path) {
  const driftGeo = new THREE.SphereGeometry(1, 8, 6);
  const driftMat = mat(PALETTE.snow);
  const rockGeo = new THREE.DodecahedronGeometry(0.5, 0);
  const rockMat = mat(PALETTE.stone);
  const drifts = new THREE.InstancedMesh(driftGeo, driftMat, 26);
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 10);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  let di = 0, ri = 0;
  for (let i = 0; i < 60 && (di < 26 || ri < 10); i++) {
    const a = rand() * Math.PI * 2, r = 3 + rand() * 24;
    const x = Math.cos(a) * r, z = Math.sin(a) * r - 3;
    let dp = Infinity;
    for (const p of path.samples) {
      const dd = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (dd < dp) dp = dd;
    }
    if (Math.sqrt(dp) < 2.2) continue;
    const y = heightAt(x, z);
    q.setFromAxisAngle(up, rand() * Math.PI * 2);
    if (di < 26 && rand() < 0.75) {
      const s = 0.5 + rand() * 1.3;
      m.compose(new THREE.Vector3(x, y - s * 0.55, z), q, new THREE.Vector3(s, s * 0.5, s));
      drifts.setMatrixAt(di++, m);
    } else if (ri < 10) {
      const s = 0.3 + rand() * 0.5;
      m.compose(new THREE.Vector3(x, y + s * 0.25, z), q, new THREE.Vector3(s, s * 0.8, s));
      rocks.setMatrixAt(ri++, m);
    }
  }
  drifts.count = di; rocks.count = ri;
  drifts.receiveShadow = rocks.castShadow = true;
  scene.add(drifts, rocks);
}

// —— 路灯：沿路交替排布。灯罩发光 + 地面光晕贴片，真点光只留终点两盏 ——
function buildLamps(scene, world, path, heightAt) {
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.07, 1.7, 6);
  const capGeo = new THREE.ConeGeometry(0.22, 0.24, 6);
  const bulbGeo = new THREE.SphereGeometry(0.11, 8, 6);
  const poleMat = mat(0x3a3340);
  const capMat = mat(0x2e2836);
  const glowTex = makeGlowTexture('#ffbf6ecc', '#ffb45e00');
  const poolTex = makeGlowTexture('#ffc98a55', '#ffc98a00');

  for (let i = 0; i < 6; i++) {
    const t = 0.14 + i * 0.14;
    const p = path.curve.getPointAt(Math.min(t, 0.97));
    const tangent = path.curve.getTangentAt(Math.min(t, 0.97));
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(i % 2 === 0 ? 1.35 : -1.35);
    const x = p.x + side.x, z = p.z + side.z;
    const y = heightAt(x, z);
    const g = new THREE.Group();
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 0.85;
    pole.castShadow = true;
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = 1.82;
    const bulbMat = new THREE.MeshStandardMaterial({
      color: PALETTE.amber, roughness: 0.4, emissive: PALETTE.amber, emissiveIntensity: 0.06,
    });
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.y = 1.68;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, transparent: true, opacity: 0, depthWrite: false,
    }));
    glow.position.y = 1.68;
    glow.scale.setScalar(1.6);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({
      map: poolTex, transparent: true, opacity: 0, depthWrite: false,
    }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.03;
    g.add(pole, cap, bulb, glow, pool);
    g.position.set(x, y, z);
    scene.add(g);
    world.lamps.push({ group: g, bulbMat, glow, pool, lit: 0 });
  }
}

// —— 小院：石墙弧、底座、远处暖窗小屋剪影、两棵近景松 ——
function buildCourtyard(scene, world, heightAt) {
  const g = new THREE.Group();
  const wallMat = mat(PALETTE.stone);
  const wallGeo = new THREE.BoxGeometry(1.1, 0.55, 0.4);
  const cx = 0.2, cz = -14.2;
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.15 + (i / 8) * 0.7); // 朝北半弧，开口向南（来路）
    const x = cx + Math.cos(a) * 5.2;
    const z = cz - Math.sin(a) * 4.2;
    const w = new THREE.Mesh(wallGeo, wallMat);
    w.position.set(x, heightAt(x, z) + 0.28, z);
    w.rotation.y = -a + Math.PI / 2;
    w.castShadow = w.receiveShadow = true;
    g.add(w);
  }
  // 底座：三层石台 + 顶部星座
  const baseMat = mat(0x9aa0b5);
  const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.0, 0.35, 8), baseMat);
  const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.5, 8), baseMat);
  const b3 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 0.8, 8), baseMat);
  const by = heightAt(cx, cz);
  b1.position.set(cx, by + 0.17, cz);
  b2.position.set(cx, by + 0.6, cz);
  b3.position.set(cx, by + 1.25, cz);
  b1.castShadow = b2.castShadow = b3.castShadow = true;
  b1.receiveShadow = true;
  g.add(b1, b2, b3);
  world.baseTop = new THREE.Vector3(cx, by + 1.72, cz);
  world.basePos = new THREE.Vector3(cx, by, cz);
  // 底座常亮点光（安放后增强）
  const baseLight = new THREE.PointLight(PALETTE.starAmber, 0.35, 10, 1.6);
  baseLight.position.copy(world.baseTop).add(new THREE.Vector3(0, 0.4, 0));
  g.add(baseLight);
  world.baseLight = baseLight;

  // 远景小屋剪影：深色体块 + 暖窗
  const houseMat = mat(0x232b47);
  const house = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.6, 3.4), houseMat);
  body.position.y = 1.3;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.8, 4), mat(0x1b2238));
  roof.position.y = 3.5;
  roof.rotation.y = Math.PI / 4;
  house.add(body, roof);
  const winMat = new THREE.MeshStandardMaterial({
    color: 0xffc98a, emissive: 0xffb45e, emissiveIntensity: 0.9, roughness: 0.5,
  });
  for (const [wx, wy] of [[-1.1, 1.3], [0.7, 1.3], [-0.2, 2.1]]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.6), winMat);
    win.position.set(wx, wy, 1.71);
    house.add(win);
  }
  house.position.set(-7.5, heightAt(-7.5, -25), -25);
  house.rotation.y = 0.35;
  g.add(house);

  scene.add(g);
  world.courtyard = g;
}

// —— 远景体量：雾外的深色山脊与松树剪影环 ——
function buildDistantHills(scene, rand) {
  const hillMat = new THREE.MeshBasicMaterial({ color: 0x1c2547, fog: true });
  const geo = new THREE.SphereGeometry(1, 10, 7);
  const hills = new THREE.InstancedMesh(geo, hillMat, 14);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rand() * 0.3;
    const r = 95 + rand() * 45;
    const s = 26 + rand() * 30;
    q.setFromAxisAngle(up, rand() * Math.PI);
    m.compose(
      new THREE.Vector3(Math.cos(a) * r, -s * 0.55, Math.sin(a) * r),
      q,
      new THREE.Vector3(s, s * 0.5, s),
    );
    hills.setMatrixAt(i, m);
  }
  scene.add(hills);
}

// —— 落雪：解析式位置（纯时间函数），恒定 1400 粒，镜头周围循环包裹 ——
function buildSnowfall(scene, rand) {
  const N = 1400;
  const pos = new Float32Array(N * 3);
  const seeds = new Float32Array(N * 4); // x0, z0, speed, phase
  for (let i = 0; i < N; i++) {
    seeds[i * 4] = (rand() - 0.5) * 70;
    seeds[i * 4 + 1] = (rand() - 0.5) * 70;
    seeds[i * 4 + 2] = 0.55 + rand() * 0.75;
    seeds[i * 4 + 3] = rand() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.055, transparent: true, opacity: 0.8,
    depthWrite: false, sizeAttenuation: true,
  }));
  pts.frustumCulled = false;
  scene.add(pts);
  const H = 16;
  return {
    points: pts,
    update(t, cx, cz) {
      const arr = geo.attributes.position.array;
      for (let i = 0; i < N; i++) {
        const x0 = seeds[i * 4], z0 = seeds[i * 4 + 1], sp = seeds[i * 4 + 2], ph = seeds[i * 4 + 3];
        const y = H - ((t * sp + ph * 3) % H);
        arr[i * 3] = cx + x0 + Math.sin(t * 0.7 + ph) * 0.6;
        arr[i * 3 + 1] = y;
        arr[i * 3 + 2] = cz + z0 + Math.cos(t * 0.5 + ph * 1.7) * 0.5;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
