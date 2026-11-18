// 角色：低多边形参数化人物与狐狸。动画全部是相位的纯函数，可确定性复现。
import * as THREE from 'three';
import { PALETTE } from './world.js';

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, flatShading: true, ...opts });
}

// —— 星星：五角挤出形，挂签写"给 TA"，背面短句。检视时可旋转翻面 ——
export function buildStar(config) {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  const R = 0.23, r = 0.10;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const rad = i % 2 === 0 ? R : r;
    const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1 });
  geo.center();
  const starMat = new THREE.MeshStandardMaterial({
    color: PALETTE.starAmber, roughness: 0.35, metalness: 0.1,
    emissive: PALETTE.starAmber, emissiveIntensity: 0.25,
  });
  const star = new THREE.Mesh(geo, starMat);
  const facets = [];
  for (let i = 0; i < 10; i++) {
    const edge = (j) => {
      const a = j * Math.PI / 5 + Math.PI / 2, r = j % 2 === 0 ? R : .10;
      return [Math.cos(a) * r, Math.sin(a) * r, .024];
    };
    facets.push(0, 0, .105, ...edge(i), ...edge(i + 1));
  }
  const facetsGeo = new THREE.BufferGeometry();
  facetsGeo.setAttribute('position', new THREE.Float32BufferAttribute(facets, 3));
  facetsGeo.computeVertexNormals();
  const tones = [0xffda81, 0xffbd59, 0xffedaa, 0xf5a64e, 0xffcf6e];
  const colors = new Float32Array(90);
  for (let i = 0; i < 10; i++) {
    const color = new THREE.Color(tones[i % tones.length]);
    for (let j = 0; j < 3; j++) color.toArray(colors, (i * 3 + j) * 3);
  }
  facetsGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  group.add(new THREE.Mesh(facetsGeo, new THREE.MeshBasicMaterial({ vertexColors: true })));
  star.castShadow = true;
  group.add(star);

  // 背面短句：Canvas 纹理小牌
  const tag = makeTextPlate(config.starText, 256, 128, '#7a4a12', '#ffdf9e');
  tag.position.z = -0.045;
  tag.rotation.y = Math.PI;
  tag.scale.setScalar(0.9);
  tag.visible = false;
  group.add(tag);

  // 挂签：给 TA
  const hang = makeTextPlate(`给 ${config.toName}`, 256, 80, '#f3eee6', '#5a4a6a');
  hang.position.set(0, -0.24, 0.01);
  hang.scale.set(0.55, 0.55 * 0.31, 1);
  hang.visible = false;
  group.add(hang);

  const light = new THREE.PointLight(PALETTE.starAmber, 1.1, 7, 1.7);
  group.add(light);

  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const ctx = cv.getContext('2d'), grad = ctx.createRadialGradient(64,64,2,64,64,64);
  grad.addColorStop(0,'#fff0c2aa'); grad.addColorStop(.25,'#ffcb6633'); grad.addColorStop(1,'#ffcb6600');
  ctx.fillStyle=grad;ctx.fillRect(0,0,128,128);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv),transparent:true,depthWrite:false,opacity:.15,blending:THREE.AdditiveBlending}));
  halo.scale.setScalar(1.6);group.add(halo);
  group.userData.halo = halo;
  group.userData.star = star;
  group.userData.light = light;
  return group;
}

function makeTextPlate(text, w, h, bg, fg) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, w, h, 18);
  ctx.fill();
  ctx.fillStyle = fg;
  const fontSize = Math.floor(h * 0.24);
  ctx.font = `500 ${fontSize}px "Songti SC", "Noto Serif SC", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // 简单换行：最多 3 行，放不下才省略
  const maxChars = Math.max(4, Math.floor((w - 28) / fontSize));
  const lines = [];
  let rest = text;
  while (rest.length > maxChars && lines.length < 2) {
    lines.push(rest.slice(0, maxChars));
    rest = rest.slice(maxChars);
  }
  lines.push(rest.length > maxChars ? rest.slice(0, maxChars - 1) + '…' : rest);
  const lh = fontSize * 1.35;
  const y0 = h / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((ln, i) => ctx.fillText(ln, w / 2, y0 + i * lh));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.34 * (h / w)),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
  );
  return mesh;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// —— 人物：蓝大衣 + 莓红围巾，冬夜剪影感 ——
export function buildMittens() {
  const group = new THREE.Group();
  const wool = mat(0x444458, { flatShading: false });
  const cuff = mat(0x70677b);
  const sleeve = mat(0x303950);
  const ellipsoid = new THREE.SphereGeometry(1, 12, 8);
  for (const side of [-1, 1]) {
    const wrist = new THREE.Group();
    wrist.position.set(side * .145, -.115, .045);
    wrist.rotation.z = side * .34;
    const palm = new THREE.Mesh(ellipsoid, wool);
    palm.scale.set(.068, .105, .053);
    const thumb = new THREE.Mesh(ellipsoid, wool);
    thumb.position.set(-side * .052, .024, -.018);
    thumb.scale.set(.03, .061, .031);
    const trim = new THREE.Mesh(new THREE.CylinderGeometry(.067, .070, .055, 10), cuff);
    trim.position.y = -.095;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(.064, .093, .28, 10), sleeve);
    arm.position.y = -.245;
    wrist.add(arm, trim, palm, thumb);
    group.add(wrist);
  }
  group.visible = false;
  return group;
}

export function buildFox() {
  const g = new THREE.Group();
  const rust = mat(0xe28c4e, {flatShading:false, emissive:0x673616, emissiveIntensity:.12});
  const cream = mat(0xffebce, {flatShading:false});
  const dark = mat(0x5a3a28);

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), rust);
  body.scale.set(1.22,0.70,0.65);
  body.position.y = 0.3;
  body.castShadow = true;
  const chest = new THREE.Mesh(new THREE.SphereGeometry(.13,8,6), cream);
  chest.scale.set(.6,1,.88);chest.position.set(0.2, 0.3, 0);

  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(.135, .026, 6, 14),
    mat(PALETTE.berry),
  );
  collar.rotation.y = Math.PI / 2;
  collar.position.set(.15, .38, 0);
  const bell = new THREE.Mesh(new THREE.SphereGeometry(.032, 7, 5), mat(0xd7b36c));
  bell.position.set(.11, .245, 0);

  const headPivot = new THREE.Group();
  headPivot.position.set(0.3, 0.42, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.167, 12, 8), rust);
  head.scale.set(1.02, .99, 1.17);
  headPivot.scale.setScalar(1.15);
  head.castShadow = true;
  const snout = new THREE.Mesh(new THREE.SphereGeometry(.097, 14, 10), cream);
  snout.scale.set(.62, 1.04, 1.32);
  snout.rotation.z=-Math.PI/2;
  snout.position.set(0.135, -0.044, 0);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), mat(0x2d2430));
  nose.position.set(.225, -.023, 0);
  const earL = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.18, 4), rust);
  const earR = earL.clone();
  earL.position.set(-0.03, 0.16, -0.085);
  earR.position.set(-0.03, 0.16, 0.085);
  for (const side of [-1,1]) {
    const lining = new THREE.Mesh(new THREE.ConeGeometry(.046, .127, 3), mat(0xe4a098));
    lining.position.set(.013, .176, side * .081);
    headPivot.add(lining);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.025,12,8),mat(0x202b36));
    eye.scale.set(.90,1.10,.83); eye.position.set(.128,.035,side*.117); headPivot.add(eye);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(.006,6,4),mat(0xffffff));
    shine.position.set(.145,.046,side*.127);headPivot.add(shine);
  }
  headPivot.add(head, snout, nose, earL, earR);

  // A small puff burst makes the nose-snow gag legible even in a still frame.
  const snowPuffs = [];
  const puffGeo = new THREE.SphereGeometry(.045, 7, 5);
  const puffMat = mat(0xf8fbff, { roughness: 1 });
  for (let i = 0; i < 8; i++) {
    const puff = new THREE.Mesh(puffGeo, puffMat);
    puff.visible = false;
    puff.userData.angle = (i / 8) * Math.PI * 2;
    puff.userData.lift = .028 + (i % 3) * .018;
    g.add(puff);
    snowPuffs.push(puff);
  }

  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.24, 0.34, 0);
  const tail = new THREE.Mesh(new THREE.SphereGeometry(.18,8,6), rust);
  tail.scale.set(1.75,.92,.89);tail.position.x = -0.20;
  const tailTip = new THREE.Mesh(new THREE.SphereGeometry(.115,8,6), cream);
  tailTip.scale.set(1.33,1.08,1.06);tailTip.position.x = -0.43;
  tail.castShadow = true;
  tailPivot.add(tail, tailTip);
  tailPivot.rotation.z = 0.5;

  const legs = [];
  for (const [lx, lz] of [[0.16, -0.08], [0.16, 0.08], [-0.16, -0.08], [-0.16, 0.08]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.06), dark);
    leg.geometry.translate(0, -0.09, 0);
    leg.position.set(lx, 0.22, lz);
    legs.push(leg);
    g.add(leg);
  }
  collar.position.y = .31;
  g.add(body, chest, collar, bell, headPivot, tailPivot);
  return {
    group: g,
    parts: { body, headPivot, tailPivot, legs, snowPuffs },
    // gait：步频相位；moving 0~1；sitting：坐下姿态权重
    pose(phase, moving, sitting, t) {
      const swing = 0.7 * moving;
      legs[0].rotation.z = Math.sin(phase) * swing;
      legs[1].rotation.z = Math.sin(phase + Math.PI) * swing;
      legs[2].rotation.z = Math.sin(phase + Math.PI) * swing;
      legs[3].rotation.z = Math.sin(phase) * swing;
      body.position.y = 0.3 + Math.abs(Math.sin(phase)) * 0.03 * moving - sitting * 0.1;
      body.rotation.z = sitting * 0.35;
      headPivot.position.y = 0.42 - sitting * 0.04 + Math.sin(t * 1.8) * 0.006;
      headPivot.rotation.z = sitting * 0.15;
      headPivot.rotation.y = 0;
      tailPivot.rotation.z = -.18 - sitting * .25;
      tailPivot.rotation.y = Math.sin(t * (moving > 0.1 ? 6 : 2.2)) * (moving > 0.1 ? 0.25 : 0.12);
    },
  };
}
