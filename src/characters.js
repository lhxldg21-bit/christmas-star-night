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
export function buildPlayer() {
  const g = new THREE.Group();
  const coat = mat(PALETTE.coatBlue);
  const dark = mat(0x2c3247);
  const skin = mat(0xf2d7bd);
  const berry = mat(PALETTE.berry);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.26, 0.62, 8), coat);
  body.position.y = 0.62;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 7), skin);
  head.position.y = 1.12;
  head.castShadow = true;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.22, 8), berry);
  hat.position.y = 1.28;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.05, 8), mat(PALETTE.cream));
  brim.position.y = 1.19;
  // 围巾：颈圈 + 垂条（垂条单独动画）
  const scarfRing = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.05, 6, 10), berry);
  scarfRing.position.y = 0.98;
  scarfRing.rotation.x = Math.PI / 2;
  const scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, 0.03), berry);
  scarfTail.position.set(0.1, 0.82, -0.16);
  scarfTail.castShadow = true;

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.34, 0.12), dark);
  const legR = legL.clone();
  legL.position.set(-0.09, 0.17, 0);
  legR.position.set(0.09, 0.17, 0);
  const makeArm=(side)=>{
    const arm=new THREE.Group();arm.position.set(side*.19,.9,0);
    const upper=new THREE.Mesh(new THREE.CylinderGeometry(.065,.07,.22,8),coat);upper.position.y=-.11;
    const elbow=new THREE.Group();elbow.position.y=-.21;
    const fore=new THREE.Mesh(new THREE.CylinderGeometry(.06,.065,.23,8),coat);fore.position.y=-.115;
    const mitten=new THREE.Mesh(new THREE.SphereGeometry(.072,8,6),mat(PALETTE.cream));mitten.position.y=-.23;
    const shoulder=new THREE.Mesh(new THREE.SphereGeometry(.075,8,6),coat);
    elbow.add(fore,mitten);arm.add(upper,elbow,shoulder);arm.userData.elbow=elbow;
    return arm;
  };
  const armL=makeArm(-1),armR=makeArm(1);
  // Each limb owns its geometry; translating a shared clone twice displaced both legs.
  legR.geometry=legL.geometry.clone();
  for(const leg of [legL,legR]){leg.geometry.translate(0,-.15,0);leg.position.y=.34;leg.castShadow=true;}
  g.add(body, head, hat, brim, scarfRing, scarfTail, legL, legR, armL, armR);
  return {
    group: g,
    limbs: { legL, legR, armL, armR, scarfTail, body, head },
    // phase：步态相位；moving 0~1 淡入摆臂
    pose(phase, moving, t) {
      const s = Math.sin(phase), c = Math.sin(phase + Math.PI);
      legL.rotation.x = s * 0.55 * moving;
      legR.rotation.x = c * 0.55 * moving;
      armL.rotation.x = c * 0.4 * moving;
      armL.userData.elbow.rotation.x=0;armR.userData.elbow.rotation.x=0;
      armR.rotation.x = s * 0.4 * moving;
      body.position.y = 0.62 + Math.abs(Math.sin(phase)) * 0.035 * moving;
      head.position.y = 1.12 + Math.abs(Math.sin(phase)) * 0.03 * moving;
      scarfTail.rotation.x = 0.25 + Math.sin(t * 2.1) * 0.12 + moving * 0.35;
      // 待机呼吸
      if (moving < 0.05) body.scale.y = 1 + Math.sin(t * 1.4) * 0.008;
    },
  };
}

// —— 狐狸：琥珀锈色，奶油胸与尾尖。腿/尾/头可动 ——
export function buildFox() {
  const g = new THREE.Group();
  const rust = mat(PALETTE.foxRust);
  const cream = mat(PALETTE.cream);
  const dark = mat(0x5a3a28);

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), rust);
  body.scale.set(1.22,0.70,0.65);
  body.position.y = 0.3;
  body.castShadow = true;
  const chest = new THREE.Mesh(new THREE.SphereGeometry(.13,8,6), cream);
  chest.scale.set(.6,1,.88);chest.position.set(0.2, 0.3, 0);

  const headPivot = new THREE.Group();
  headPivot.position.set(0.3, 0.42, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), rust);
  head.castShadow = true;
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.20, 6), cream);
  snout.rotation.z=-Math.PI/2;
  snout.position.set(0.14, -0.03, 0);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), dark);
  nose.position.set(0.21, -0.02, 0);
  const earL = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.18, 4), rust);
  const earR = earL.clone();
  earL.position.set(-0.03, 0.16, -0.085);
  earR.position.set(-0.03, 0.16, 0.085);
  for (const side of [-1,1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.019,8,6),mat(0x202b36));
    eye.position.set(.07,.025,side*.125); headPivot.add(eye);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(.006,6,4),mat(0xffffff));
    shine.position.set(.078,.031,side*.14);headPivot.add(shine);
  }
  const snowball = new THREE.Mesh(new THREE.SphereGeometry(.062,8,6),mat(0xffffff));
  snowball.position.set(.21,.04,0);snowball.visible=false;headPivot.add(snowball);
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
  tail.scale.set(1.5,.7,.7);tail.position.x = -0.18;
  const tailTip = new THREE.Mesh(new THREE.SphereGeometry(.115,8,6), cream);
  tailTip.scale.set(1.15,.75,.75);tailTip.position.x = -0.38;
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
  g.add(body, chest, headPivot, tailPivot);
  return {
    group: g,
    parts: { body, headPivot, tailPivot, legs, nose, snowball, snowPuffs },
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
      tailPivot.rotation.z = 0.5 + sitting * 0.5;
      tailPivot.rotation.y = Math.sin(t * (moving > 0.1 ? 6 : 2.2)) * (moving > 0.1 ? 0.25 : 0.12);
    },
    // 雪落鼻尖后的甩头
    shakeHead(k) {
      headPivot.rotation.y = Math.sin(k * Math.PI * 5) * 0.5 * (1 - k);
      headPivot.rotation.z = Math.sin(k * Math.PI * 3) * 0.25 * (1 - k);
    },
  };
}
