// 世界构建：微缩雪夜场景。奶油白雪地 + 蓝紫夜色 + 琥珀灯光 + 少量莓红。
// 所有随机性走传入的 rand()，保证每次构建一致、可重复截图。
import * as THREE from 'three';

export const PALETTE = {
  snow: 0xe8ecf4,
  snowShade: 0xdfe4f2,
  nightTop: 0x0b1026,
  nightHorizon: 0x615782,
  amber: 0xffb45e,
  starAmber: 0xffd27a,
  berry: 0xb03048,
  pine: 0x2a5549,
  pineSnow: 0xe9ecf4,
  bark: 0x4b3e45,
  stone: 0x8a8fa3,
  foxRust: 0xd98444,
  cream: 0xf5e8d8,
  coatBlue: 0x566f83,
};

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, flatShading: true, ...opts });
}

// S 形林间雪路：转折与树群逐步揭示远处小院。
export function makePath() {
  const pts = [
    new THREE.Vector3(-2.0, 0, 9.0),
    new THREE.Vector3(-4.8, 0, 1.2),
    new THREE.Vector3(-5.7, 0, -5.0),
    new THREE.Vector3(-1.4, 0, -10.3),
    new THREE.Vector3(6.3, 0, -15.7),
    new THREE.Vector3(4.9, 0, -20.5),
    new THREE.Vector3(0.2, 0, -22.8),
  ];
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4);
  const samples = curve.getSpacedPoints(120);
  const length = curve.getLength();
  return { curve, samples, length };
}

// 地形高度：平缓起伏，路径走廊压平。纯函数，构建期调用。
function makeHeightField(path, playSnow) {
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
    const bank = Math.max(0, 1 - ((x - playSnow.x) / 1.1) ** 2 - ((z - playSnow.z) / 1.5) ** 2);
    return h * flat + .13 * bank * bank;
  };
}

export function buildWorld(scene, rand) {
  const world = { lamps: [], glowDecals: [] };
  const path = makePath();
  world.path = path;
  const playSnow = path.curve.getPointAt(.324);
  const bend = path.curve.getTangentAt(.324);
  playSnow.addScaledVector(new THREE.Vector3(-bend.z, 0, bend.x), 1.28);
  const heightAt = makeHeightField(path, playSnow);
  world.playSnow = playSnow;
  world.heightAt = heightAt;

  // —— 地面：半径足够大，任何合法机位看不到边缘 ——
  const SEG = 130, SIZE = 150;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cSnow = new THREE.Color(PALETTE.snow);
  const cShade = new THREE.Color(PALETTE.snowShade);
  const tmp = new THREE.Color();
  // Keep the trail tessellation and stretch the outskirts beyond the crane view.
  const extend = (v) => v + Math.sign(v) * 94 * (Math.max(0, Math.abs(v) - 44) / 31) ** 2;
  for (let i = 0; i < pos.count; i++) {
    const x = extend(pos.getX(i)), z = extend(pos.getZ(i));
    pos.setX(i, x);
    pos.setZ(i, z);
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
    vertexColors: true, roughness: 1, metalness: 0,
  }));
  ground.receiveShadow = true;
  scene.add(ground);
  world.ground = ground;
  const trailVertices=[],trailIndices=[],trailColors=[];
  const trailTint = new THREE.Color(0x97a0c3);
  for(let i=0;i<=160;i++){
    const t=i/160, point=path.curve.getPointAt(t), tangent=path.curve.getTangentAt(t);
    for(const side of [-1,-.69,.69,1]){
      const width = .94 + .10 * Math.sin(i * .31 + side) + .07 * Math.cos(i * .19);
      const x=point.x-tangent.z*width*side,z=point.z+tangent.x*width*side;
      trailVertices.push(x,heightAt(x,z)+.020,z);
      trailColors.push(trailTint.r, trailTint.g, trailTint.b, Math.abs(side) === 1 ? 0 : .41);
    }
    if(i<160) for(let j=0;j<3;j++){const k=i*4+j;trailIndices.push(k,k+4,k+1,k+1,k+4,k+5);}
  }
  const trailGeo=new THREE.BufferGeometry();trailGeo.setAttribute('position',new THREE.Float32BufferAttribute(trailVertices,3));trailGeo.setAttribute('color',new THREE.Float32BufferAttribute(trailColors,4));trailGeo.setIndex(trailIndices);trailGeo.computeVertexNormals();
  const trail=new THREE.Mesh(trailGeo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,transparent:true,depthWrite:false,side:THREE.DoubleSide}));trail.receiveShadow=true;scene.add(trail);

  const beamGeo = new THREE.PlaneGeometry(2.4, 1.65, 10, 8);
  beamGeo.rotateX(-Math.PI / 2);
  world.starPatch = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
    map: makeGlowTexture('#ffcf90cc', '#ffbd6b00'),
    transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  world.starPatch.visible = false;
  scene.add(world.starPatch);
  const entrance = path.curve.getPointAt(.072);
  const entranceTangent = path.curve.getTangentAt(.072);
  entrance.addScaledVector(new THREE.Vector3(-entranceTangent.z, 0, entranceTangent.x), -1.76);
  entrance.y = heightAt(entrance.x, entrance.z);
  makeLowLantern(scene, entrance, .73).setGlow(.42);
  buildSky(scene, world, rand);
  buildPines(scene, world, rand, heightAt, path);
  buildLamps(scene, world, path, heightAt);
  buildCourtyard(scene, world, heightAt);
  world.ridgeMaterials = buildDistantHills(scene, rand);
  world.snow = buildSnowfall(scene, rand);
  world.sparkle = buildSparkle(scene, rand, heightAt);
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
    map: makeGlowTexture('#fff6e0', '#fff6e000'), color: 0xfff6e0, size: 1.1, sizeAttenuation: false, fog: false,
    transparent: true, opacity: 0.85, depthWrite: false,
  }));
  scene.add(stars);

  // 月亮：柔光圆盘
  const moonTex = makeGlowTexture('#c0c7f089', '#b8c0f000');
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({
    map: moonTex, fog: false, depthWrite: false, transparent: true, opacity: 0.95,
  }));
  moon.position.set(-8, 15, -82);
  moon.scale.setScalar(12);
  scene.add(moon);
  const disk = new THREE.Mesh(new THREE.SphereGeometry(1.4, 18, 12), new THREE.MeshBasicMaterial({color:0xffefd4, fog:false, toneMapped:false}));
  disk.position.copy(moon.position).z += .25;
  scene.add(disk);
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
  const tiers = [], caps = [];
  const tierSpec = [
    [0.85, 1.1, 0.65],
    [0.69, 1.0, 1.18],
    [0.48, .85, 1.68],
    [0.27, .65, 2.05],
  ];
  for (const [r, h, y] of tierSpec) {
    const profile = (snow) => {
      const geo = new THREE.LatheGeometry([
        new THREE.Vector2(0, -.51), new THREE.Vector2(.72, -.50),
        new THREE.Vector2(1, -.36), new THREE.Vector2(.77, -.19),
        new THREE.Vector2(.44, .11), new THREE.Vector2(0, .55),
      ], 7);
      const v = geo.attributes.position;
      for (let i = 0; i < v.count; i++) {
        const angle = Math.atan2(v.getZ(i), v.getX(i));
        const wiggle = 1 + .12 * Math.sin(angle * 3 + y * 5);
        const low = v.getY(i);
        const x = v.getX(i) * r * wiggle, z = v.getZ(i) * r * wiggle;
        const lift = snow ? .07 + .13 * (1 + Math.sin(angle * 3 + y)) * Math.max(0, .4 - low) : 0;
        const lean = y * .09 + low * .1;
        v.setXYZ(i, x * (snow ? .91 : 1) + lean, y + h * low + lift, z * (snow ? .91 : 1));
      }
      geo.computeVertexNormals();
      return geo;
    };
    tiers.push(profile(false));
    caps.push(profile(true));
  }
  const foliGeo = mergeGeos(tiers);

  const placements = [
    {x:-10.8,z:8,s:1.8,rot:0.3},{x:6.5,z:6,s:2.0,rot:1.2},
    {x:-9,z:0,s:3.1,rot:0.4},{x:3.6,z:-1,s:2.0,rot:0.6},
    {x:-7,z:-12,s:2.8,rot:0.9},{x:7.5,z:-12,s:3.3,rot:0.2},
    {x:-4.5,z:-22,s:2.8,rot:0.5},{x:8,z:-25,s:3.5,rot:0.8},
    {x:-4,z:-34,s:2.15,rot:.4}, {x:1,z:-38,s:1.85,rot:.75}, {x:5,z:-35,s:2.35,rot:1.9},
    {x:-8,z:-33,s:2.45,rot:2.6}, {x:8,z:-39,s:3,rot:1.2}
  ];
  const hideTree = path.curve.getPointAt(.21);
  const hideTangent = path.curve.getTangentAt(.21);
  hideTree.addScaledVector(new THREE.Vector3(-hideTangent.z, 0, hideTangent.x), 1.58);
  placements.push({x: hideTree.x, z: hideTree.z, s: 1.78, rot: .38, bendScreen: true});
  // Hero pines create successive "gates" without closing the walk corridor.
  for (const [t, side, s, tilt] of [
    [.19, -1, 1.22, .12], [.29, 1, 1.8, -.08],
    [.48, -1, 1.55, .16], [.66, 1, 1.75, -.12],
    [.82, -1, 1.9, .08],
  ]) {
    const p = path.curve.getPointAt(t);
    const tangent = path.curve.getTangentAt(t);
    placements.push({
      x: p.x - tangent.z * 4.25 * side,
      z: p.z + tangent.x * 4.25 * side,
      s, rot: t * 9 + tilt, hero: true,
    });
  }
  for (let i = 0; i < 240 && placements.length < 76; i++) {
    const a = rand() * Math.PI * 2;
    const r = 7 + rand() * 55;
    const x = Math.cos(a) * r, z = Math.sin(a) * r - 4;
    let dp = Infinity;
    for (const p of path.samples) {
      const dd = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (dd < dp) dp = dd;
    }
    if (Math.sqrt(dp) < (z > 0 ? 5.0 : 3.4)) continue; // 让开路径
    if (Math.abs(x) < 5 && z < -9 && z > -32) continue; // 让开小院
    placements.push({ x, z, s: 0.8 + rand() * 1.6, rot: rand() * Math.PI * 2 });
  }
  const trunkMat = mat(PALETTE.bark);
  const foliMat = mat(PALETTE.pine, { emissive: 0x28304e, emissiveIntensity: .32 });
  // 雪盖：同一几何、浅色、略放大上浮，形成积雪感
  const snowMat = mat(PALETTE.pineSnow, { flatShading: false });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, placements.length);
  const folis = new THREE.InstancedMesh(foliGeo, foliMat, placements.length);
  const snows = new THREE.InstancedMesh(mergeGeos(caps), snowMat, placements.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  placements.forEach((p, i) => {
    // Keep the entire canopy clear of the travelling camera corridor.
    let nearest=path.samples[0], d=Infinity;
    for(const pt of path.samples){const dd=Math.hypot(p.x-pt.x,p.z-pt.z);if(dd<d){d=dd;nearest=pt;}}
    const clear=p.bendScreen ? 1.58 : p.hero ? 3.7 : 4.65+p.s*.16;
    if(d<clear){p.x=nearest.x+(p.x-nearest.x)/d*clear;p.z=nearest.z+(p.z-nearest.z)/d*clear;}
    const y = heightAt(p.x, p.z) - 0.05;
    q.setFromAxisAngle(v.set(0, 1, 0), p.rot);
    m.compose(new THREE.Vector3(p.x, y, p.z), q, sc.setScalar(p.s));
    trunks.setMatrixAt(i, m);
    folis.setMatrixAt(i, m);
    snows.setMatrixAt(i, m);
    const shade = new THREE.Color().setRGB(.72 + .28 * (i % 5) / 4, .78 + .22 * (i % 5) / 4, .93);
    folis.setColorAt(i, shade);
    snows.setColorAt(i, shade);
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

// —— 路灯：沿路交替排布。灯罩发光 + 地面光晕贴片，真点光只留终点两盏 ——
function buildLamps(scene, world, path, heightAt) {
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.07, 1.7, 6);
  const capGeo = new THREE.CylinderGeometry(.15, .29, .16, 4);
  const bulbGeo = new THREE.BoxGeometry(.23, .25, .23);
  const poleMat = mat(0x3a3340);
  const capMat = mat(0x2e2836);
  const glowTex = makeGlowTexture('#ffbf6ecc', '#ffb45e00');
  const poolTex = makeGlowTexture('#ffae60b8', '#ffa14a00');

  for (let i = 0; i < 6; i++) {
    const t = 0.26 + i * 0.137;
    const p = path.curve.getPointAt(Math.min(t, 0.97));
    const tangent = path.curve.getTangentAt(Math.min(t, 0.97));
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(i % 2 === 0 ? 3.25 : -2.5);
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
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(4.25, 4.25), new THREE.MeshBasicMaterial({
      map: poolTex, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.06;
    const frameGeo = new THREE.BoxGeometry(.037, .29, .037);
    for (const dx of [-.123, .123]) for (const dz of [-.123, .123]) {
      const frame = new THREE.Mesh(frameGeo, capMat);
      frame.position.set(dx, 1.68, dz);
      g.add(frame);
    }
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(.31, .06, .31), capMat);
    shelf.position.y = 1.54;
    const light = new THREE.PointLight(PALETTE.amber, .22, 5, 1.7);
    light.position.set(0, 1.55, .15);
    g.add(pole, cap, bulb, glow, pool, shelf, light);
    g.position.set(x, y, z);
    g.scale.setScalar(0.82);
    scene.add(g);
    world.lamps.push({ group: g, bulbMat, glow, pool, light, lit: 0 });
  }
}

function makeLowLantern(scene, position, scale = 1) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.scale.setScalar(scale);
  const metal = mat(0x4f3a4a);
  const glass = mat(0xffce8e, { emissive: 0xffaf56, emissiveIntensity: 0 });
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(.27, .25, .27), glass);
  bulb.position.y = .36;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(.09, .22, .14, 4), metal);
  cap.position.y = .55;
  const base = new THREE.Mesh(new THREE.BoxGeometry(.32, .22, .32), metal);
  base.position.y = .11;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture('#ffc7759c', '#ffb45e00'), transparent: true, depthWrite: false,
  }));
  halo.position.copy(bulb.position);
  halo.scale.setScalar(1.2);
  const glow = new THREE.PointLight(0xffbb73, 0, 2.6, 2);
  glow.position.copy(bulb.position);
  group.add(base, bulb, cap, halo, glow);
  scene.add(group);
  return {
    bulb,
    position: position.clone().addScaledVector(bulb.position, scale),
    setGlow(amount) {
      glass.emissiveIntensity = .04 + amount * 2.3;
      halo.material.opacity = amount * .66;
      glow.intensity = amount * .72;
    },
  };
}

// —— 小院：石墙弧、底座、远处暖窗小屋剪影、两棵近景松 ——
function buildCourtyard(scene, world, heightAt) {
  const g = new THREE.Group();
  const wallMat = mat(0xaab3be);
  const wallGeo = new THREE.BoxGeometry(1.32, 0.58, 0.42);
  const cx = 0.2, cz = -28.2;
  const foxX = cx + .88, foxZ = cz + 2.74;
  world.gateFox = new THREE.Vector3(foxX, heightAt(foxX, foxZ), foxZ);
  for (let i = 0; i < 12; i++) {
    const a = Math.PI * (0.10 + (i / 11) * 0.80); // 朝北半弧，开口向南（来路）
    const x = cx + Math.cos(a) * 4.75;
    const z = cz - Math.sin(a) * 3.8;
    const w = new THREE.Mesh(wallGeo, wallMat);
    w.position.set(x, heightAt(x, z) + 0.31, z);
    w.rotation.y = a + Math.PI / 2;
    w.castShadow = w.receiveShadow = true;
    g.add(w);
    const snowCap=new THREE.Mesh(new THREE.BoxGeometry(1.37,.09,.47),mat(PALETTE.snow));
    snowCap.position.copy(w.position);snowCap.position.y+=.30;snowCap.rotation.copy(w.rotation);g.add(snowCap);
  }
  const by = heightAt(cx, cz);
  const stone = mat(0x6f7891), trim = mat(0xb2b8ca), socket = mat(0x393648);
  const block = (w, h, d, x, y, z, material = stone) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(cx + x, by + y, cz + z);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };
  for (let i = 0; i < 3; i++) {
    const height = (i + 1) * .24;
    block(3.5 - i * .30, height, 2.26 - i * .43, 0, height / 2, 1.12 - i * .28);
  }
  for (const side of [-1, 1]) {
    block(.82, .28, .99, side * 1.20, .86, 0, trim);
    const pillar = block(.62, 2.32, .71, side * 1.18, 2.06, 0);
    pillar.rotation.z = side * .08;
    block(.68, .18, .79, side * 1.06, 3.22, 0, trim);
    const arch = block(.52, 1.37, .72, side * .58, 3.58, 0);
    arch.rotation.z = side * .83;
  }
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(.51, .56, .20, 10), trim);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(cx, by + 3, cz - .17);
  g.add(ring);
  const recess = new THREE.Mesh(new THREE.CylinderGeometry(.39, .39, .075, 10), socket);
  recess.rotation.x = Math.PI / 2;
  recess.position.set(cx, by + 3, cz - .055);
  g.add(recess);
  world.baseTop = new THREE.Vector3(cx, by + 3, cz + .028);
  world.basePos = new THREE.Vector3(cx, by, cz);
  const festiveLights = [];
  const warmGlass = (color, delay) => {
    const material = mat(0x826955, { emissive: color, emissiveIntensity: .04 });
    festiveLights.push({material, delay});
    return material;
  };
  const needles = mat(0x245444), frost = mat(0xc9d5e1);
  const ornamentLights = [warmGlass(0xffba58, .02), warmGlass(0xf17b79, .13), warmGlass(0x7acdb2, .23)];
  const bulbGeo = new THREE.SphereGeometry(.067, 8, 6);
  // 三层枝桠贴着石柱展开，中间留出望向窗灯的通道。
  for (let tier = 0; tier < 3; tier++) {
    const width = 1.94 - tier * .44, y = 1.48 + tier * .65;
    for (const side of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(side * .38, y + .9);
      shape.lineTo(side * width, y - .18);
      shape.lineTo(side * (width - .25), y - .08);
      shape.lineTo(side * (width - .35), y - .21);
      shape.lineTo(side * .39, y + .18);
      shape.closePath();
      const bough = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {depth:.32, bevelEnabled:false}), needles);
      bough.position.set(cx, by, cz + .12);
      g.add(bough);
      for (const [i, u] of [.25,.55,.85].entries()) {
        const bulb = new THREE.Mesh(bulbGeo, ornamentLights[(tier + i + (side < 0 ? 1 : 0)) % 3]);
        bulb.position.set(cx + side * (.4 + (width - .4) * u), by + y + .21 - .32 * u, cz + .49);
        g.add(bulb);
      }
    }
  }
  const ribbon = mat(0xd3a867);
  for (const [x, z, size, color] of [
    [-2.45, 1.0, .52, 0x953d58], [-2.95, .3, .39, 0x355f57], [2.55, .45, .47, 0x48658c],
  ]) {
    const parcel = new THREE.Group();
    parcel.position.set(cx + x, heightAt(cx + x, cz + z), cz + z);
    parcel.rotation.y = x * .21;
    const box = new THREE.Mesh(new THREE.BoxGeometry(size, size * .72, size), mat(color));
    box.position.y = size * .36;
    parcel.add(box);
    for (const angle of [0, Math.PI / 2]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(size * .21, size * .75, size * 1.015), ribbon);
      band.position.y = size * .37;
      band.rotation.y = angle;
      parcel.add(band);
    }
    g.add(parcel);
  }
  const homes = [[-2.7,-6,.18],[.2,-8.3,-.09],[3.0,-6.6,-.19]];
  homes.forEach(([x,z,angle], i) => {
    const home = new THREE.Group();
    home.position.set(cx + x, heightAt(cx + x, cz + z), cz + z);
    home.rotation.y = angle;
    const wood = mat([0x81474e,0x90664e,0x556d61][i]);
    const windows = warmGlass([0xffae53,0xffcf88,0xffae73][i], .25 + i * .19);
    const panel = (w,h,d,x,y,z,m) => {
      const part = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);
      part.position.set(x,y,z);
      home.add(part);
      return part;
    };
    panel(2.25,1.65,1.78,0,.825,0,wood);
    panel(.45,1.15,.07,0,.575,.91,mat(0x503737));
    for (const s of [-1,1]) {
      panel(1.55,.18,2.16,s*.62,1.90,0,frost).rotation.z = -s * .49;
      panel(.56,.65,.06,s*.65,.84,.91,windows);
      panel(.055,.66,.04,s*.65,.84,.96,wood);
    }
    g.add(home);
  });
  world.setChristmasLights = progress => {
    for (const { material, delay } of festiveLights)
      material.emissiveIntensity = .04 + 3.2 * THREE.MathUtils.smoothstep(progress, delay, delay + .23);
  };
  world.stepHeight = ({ x, z }) => {
    if (Math.abs(x - cx) > 1.35 || z < cz + .4 || z > cz + 2.38) return 0;
    return .72 * THREE.MathUtils.clamp((cz + 2.38 - z) / 1.3, 0, 1);
  };
  // 底座常亮点光（安放后增强）
  const baseLight = new THREE.PointLight(PALETTE.starAmber, 0.35, 10, 1.1);
  baseLight.position.copy(world.baseTop).add(new THREE.Vector3(0, -.4, .75));
  g.add(baseLight);
  world.baseLight = baseLight;

  const root = new THREE.Vector3(cx + 3.05, heightAt(cx + 3.05, cz - 1.45), cz - 1.45);
  const trunk = mat(0x514754), barkGeo = new THREE.CylinderGeometry(.11, .19, 1, 6);
  const up = new THREE.Vector3(0, 1, 0);
  const branch = (from, to, width) => {
    const a = root.clone().add(new THREE.Vector3(...from));
    const b = root.clone().add(new THREE.Vector3(...to));
    const axis = b.clone().sub(a);
    const mesh = new THREE.Mesh(barkGeo, trunk);
    mesh.position.copy(a).lerp(b, .5);
    mesh.scale.set(width, axis.length(), width);
    mesh.quaternion.setFromUnitVectors(up, axis.normalize());
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
  };
  branch([0, 0, 0], [.19, 2.18, -.18], 1.65);
  branch([.19, 2.18, -.18], [-.24, 3.84, -.34], 1.26);
  branch([-.24, 3.84, -.34], [-1.30, 4.40, -.47], .86);
  branch([-1.30, 4.40, -.47], [-2.37, 4.62, -.52], .55);
  branch([-1.30, 4.40, -.47], [-1.48, 4.99, -.73], .38);
  branch([-.24, 3.84, -.34], [.52, 4.77, -.75], .48);
  branch([.19, 2.18, -.18], [.98, 3.33, -.38], .70);
  branch([.98, 3.33, -.38], [1.26, 4.10, -.21], .44);
  branch([.98, 3.33, -.38], [1.65, 3.57, -.88], .36);

  scene.add(g);
  world.courtyard = g;
}

// —— 远景体量：雾外的深色山脊与松树剪影环 ——
function buildDistantHills(scene, rand) {
  const geo = new THREE.SphereGeometry(1, 10, 7);
  const near = new THREE.Color(0x2c4459), far = new THREE.Color(PALETTE.nightHorizon);
  const layers = [
    { r: 78, n: 8, s: 24, k: 0.25 },
    { r: 104, n: 9, s: 30, k: 0.5 },
    { r: 132, n: 10, s: 38, k: 0.74 },
  ];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const materials = [];
  for (const L of layers) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, depthWrite: false });
    materials.push(mat);
    const hills = new THREE.InstancedMesh(geo, mat, L.n);
    const col = new THREE.Color().copy(near).lerp(far, L.k);
    for (let i = 0; i < L.n; i++) {
      const a = (i / L.n) * Math.PI * 2 + rand() * 0.4;
      const r = L.r + rand() * 18;
      const s = L.s + rand() * 16;
      q.setFromAxisAngle(up, rand() * Math.PI);
      m.compose(new THREE.Vector3(Math.cos(a) * r, -s * 0.16, Math.sin(a) * r), q, new THREE.Vector3(s, s * 0.5, s));
      hills.setMatrixAt(i, m);
      hills.setColorAt(i, col);
    }
    scene.add(hills);
  }
  return materials;
}

// —— 落雪：解析式位置（纯时间函数），恒定 1400 粒，镜头周围循环包裹 ——
function buildSparkle(scene, rand, heightAt) {
  const layers = [];
  for (let L = 0; L < 2; L++) {
    const N = 260;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = rand() * Math.PI * 2, r = 2 + rand() * 26;
      const x = Math.cos(a) * r, z = Math.sin(a) * r - 6;
      pos[i * 3] = x; pos[i * 3 + 1] = heightAt(x, z) + 0.02; pos[i * 3 + 2] = z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      map: makeGlowTexture('#fff6e0', '#fff6e000'), color: 0xfff2cf, size: 0.05,
      transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    pts.frustumCulled = false;
    scene.add(pts);
    layers.push(pts);
  }
  return {
    update(t) {
      layers[0].material.opacity = 0.18 + 0.4 * Math.max(0, Math.sin(t * 1.7));
      layers[1].material.opacity = 0.18 + 0.4 * Math.max(0, Math.sin(t * 1.7 + Math.PI));
    },
  };
}

function buildSnowfall(scene, rand) {
  const N = 900;
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
    map: makeGlowTexture('#ffffff', '#ffffff00'), color: 0xffffff, size: 0.055, transparent: true, opacity: 0.8,
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
