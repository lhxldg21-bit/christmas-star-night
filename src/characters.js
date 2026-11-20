// 角色：低多边形参数化人物与狐狸。动画全部是相位/时间的纯函数，可确定性复现。
// Lane A（光遇道）：光滑着色 + 顶点色渐变 + 自发光泛光；星星被做成「狐狸送达的包裹」
// （蝴蝶结 / 折信纸 / 火漆星章 / 会摆动的挂签），让「上面有东西」一眼可读。
import * as THREE from 'three';
import { PALETTE } from './world.js';

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, flatShading: true, ...opts });
}

function paintGradient(geo, bottomHex, topHex, axis = 'y', lo = -1, hi = 1) {
  const pos = geo.attributes.position;
  const cb = new THREE.Color(bottomHex), ct = new THREE.Color(topHex), tmp = new THREE.Color();
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = axis === 'y' ? pos.getY(i) : axis === 'x' ? pos.getX(i) : pos.getZ(i);
    const k = THREE.MathUtils.clamp((v - lo) / (hi - lo), 0, 1);
    tmp.copy(cb).lerp(ct, k);
    arr[i * 3] = tmp.r; arr[i * 3 + 1] = tmp.g; arr[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

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
      const a = j * Math.PI / 5 + Math.PI / 2, rr = j % 2 === 0 ? R : .10;
      return [Math.cos(a) * rr, Math.sin(a) * rr, .024];
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

  const berry = mat(PALETTE.berry, { flatShading: false, roughness: .6 });
  const paper = mat(0xf6ecd9, { flatShading: false, roughness: .95 });

  const bow = new THREE.Group();
  const loopGeo = new THREE.TorusGeometry(.045, .017, 6, 12);
  for (const side of [-1, 1]) {
    const loop = new THREE.Mesh(loopGeo, berry);
    loop.scale.set(1, .72, .42);
    loop.position.set(side * .05, 0, 0);
    loop.rotation.y = side * .5;
    bow.add(loop);
  }
  const knot = new THREE.Mesh(new THREE.SphereGeometry(.026, 8, 6), berry);
  knot.scale.set(1, .85, .8);
  bow.add(knot);
  const bowTails = [];
  for (const side of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(.022, .10, .006), berry);
    tail.geometry.translate(0, -.05, 0);
    tail.position.set(side * .018, -.02, .004);
    tail.rotation.z = side * .28;
    bow.add(tail);
    bowTails.push(tail);
  }
  bow.position.set(0, R + .015, .03);
  group.add(bow);

  const note = new THREE.Group();
  const sheet = new THREE.Mesh(new THREE.BoxGeometry(.17, .115, .006), paper);
  const fold = new THREE.Mesh(new THREE.BoxGeometry(.17, .03, .006), mat(0xe7d9bf, { flatShading: false }));
  fold.position.set(0, .058, .004); fold.rotation.x = -.5;
  const seal = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, .007, 12), berry);
  seal.rotation.x = Math.PI / 2; seal.position.set(.045, -.028, .006);
  const sealStar = new THREE.Mesh(new THREE.CircleGeometry(.012, 5), mat(0xffe2a7, { flatShading: false }));
  sealStar.position.set(.045, -.028, .011);
  note.add(sheet, fold, seal, sealStar);
  note.position.set(-.16, -.20, .05);
  note.rotation.set(-.18, .35, .12);
  group.add(note);

  const tagPivot = new THREE.Group();
  tagPivot.position.set(.12, -.20, .03);
  const string = new THREE.Mesh(new THREE.CylinderGeometry(.004, .004, .12, 5), berry);
  string.position.y = -.06;
  const hang = makeTextPlate(`给 ${config.toName}`, 256, 96, '#f6ecd9', '#5a4a6a');
  hang.scale.set(.62, .62 * (96 / 256) * 2.0, 1);
  hang.position.y = -.165;
  tagPivot.add(string, hang);
  group.add(tagPivot);

  const tag = makeTextPlate(config.starText, 256, 128, '#7a4a12', '#ffdf9e');
  tag.position.z = -0.045;
  tag.rotation.y = Math.PI;
  tag.scale.setScalar(0.9);
  group.add(tag);

  const light = new THREE.PointLight(PALETTE.starAmber, 1.1, 7, 1.7);
  group.add(light);

  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const ctx = cv.getContext('2d'), grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, '#fff0c2aa'); grad.addColorStop(.25, '#ffcb6633'); grad.addColorStop(1, '#ffcb6600');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 128, 128);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, opacity: .15, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(1.6); group.add(halo);
  const fxCanvas = document.createElement('canvas');
  fxCanvas.width = fxCanvas.height = 256;
  const fx = fxCanvas.getContext('2d');
  const sweep = fx.createConicGradient?.(0, 128, 128) ?? fx.createLinearGradient(20, 20, 236, 236);
  for (const [stop, color] of [[0, '#ffd98a'], [.27, '#9fe0d0'], [.54, '#bda4e9'], [.8, '#ff9fb9'], [1, '#ffd98a']]) {
    sweep.addColorStop(stop, color);
  }
  fx.strokeStyle = sweep;
  fx.beginPath();
  fx.arc(128, 128, 108, 0, Math.PI * 2);
  fx.globalAlpha = .18;
  fx.lineWidth = 11;
  fx.stroke();
  fx.globalAlpha = .82;
  fx.lineWidth = 3;
  fx.stroke();
  const texture = new THREE.CanvasTexture(fxCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const ring = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, transparent: true, opacity: 0, depthWrite: false,
  }));
  ring.visible = false;
  group.add(ring);

  const dotGeo = new THREE.IcosahedronGeometry(.022, 0);
  const sparks = Array.from({length: 10}, (_, i) => {
    const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({
      color: [0xffd98a, 0x9fe0d0, 0xbda4e9, 0xff9fb9][i % 4],
      transparent: true, opacity: 0, depthWrite: false,
    }));
    dot.visible = false;
    group.add(dot);
    return dot;
  });
  group.userData = { halo, star, light, bow, bowTails, note, tagPivot, hang, tag, ring, sparks };
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
  const fontSize = Math.floor(h * 0.26);
  ctx.font = `500 ${fontSize}px "Songti SC", "Noto Serif SC", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
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
  return new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.34 * (h / w)),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
  );
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x + w, y + h, x, y, r);
  ctx.arcTo(x + w, y, x + r, y, r);
  ctx.closePath();
}

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
    const palm = new THREE.Mesh(ellipsoid, wool); palm.scale.set(.068, .105, .053);
    const thumb = new THREE.Mesh(ellipsoid, wool); thumb.position.set(-side * .052, .024, -.018); thumb.scale.set(.03, .061, .031);
    const trim = new THREE.Mesh(new THREE.CylinderGeometry(.067, .070, .055, 10), cuff); trim.position.y = -.095;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(.064, .093, .28, 10), sleeve); arm.position.y = -.245;
    wrist.add(arm, trim, palm, thumb);
    group.add(wrist);
  }
  group.visible = false;
  return group;
}

export function buildFox() {
  const g = new THREE.Group();
  const rust = mat(0xe28c4e, { flatShading: false, emissive: 0x673616, emissiveIntensity: .12 });
  const cream = mat(0xffebce, { flatShading: false });
  const dark = mat(0x5a3a28);

  const bodyGeo = paintGradient(new THREE.SphereGeometry(0.24, 12, 10), 0xffebce, 0xd9743a, 'y', -.24, .20);
  const bodyMat = mat(0xffffff, { flatShading: false, vertexColors: true, emissive: 0x673616, emissiveIntensity: .10 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.scale.set(1.22, 0.70, 0.65);
  body.position.y = 0.3;
  body.castShadow = true;
  const chest = new THREE.Mesh(new THREE.SphereGeometry(.13, 8, 6), cream);
  chest.scale.set(.6, 1, .88); chest.position.set(0.2, 0.3, 0);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(.135, .026, 6, 14), mat(PALETTE.berry));
  collar.rotation.y = Math.PI / 2;
  const pendant = new THREE.Group();
  pendant.position.x = .293;
  const clasp = new THREE.Mesh(new THREE.CylinderGeometry(.009, .009, .065, 5), mat(PALETTE.berry));
  clasp.position.y = .052;
  const bell = new THREE.Mesh(new THREE.SphereGeometry(.042, 9, 7),
    mat(0xf8bf62, { emissive: 0xb27127, emissiveIntensity: .35 }));
  pendant.add(clasp, bell);
  collar.position.x = .211;

  const headPivot = new THREE.Group();
  headPivot.position.set(0.3, 0.42, 0);
  headPivot.scale.setScalar(1.15);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.167, 14, 10), rust);
  head.scale.set(1.02, .99, 1.17);
  head.castShadow = true;
  const snout = new THREE.Mesh(new THREE.SphereGeometry(.097, 14, 10), cream);
  snout.scale.set(.62, 1.04, 1.32); snout.rotation.z = -Math.PI / 2; snout.position.set(0.135, -0.044, 0);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), mat(0x2d2430));
  nose.position.set(.225, -.023, 0);
  // Split the ear face into an outer rim and an inset color on the same surface.
  const earGeo = new THREE.BufferGeometry();
  const earVertices = [
    [.05, -.047, -.073], [.05, -.047, .073], [.008, .165, 0],
    [.040, -.018, -.046], [.040, -.018, .046], [.016, .105, 0], [-.098, -.047, 0],
  ];
  earGeo.setAttribute('position', new THREE.Float32BufferAttribute(earVertices.flat(), 3));
  earGeo.setIndex([0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4, 2, 0, 3, 2, 3, 5,
    0, 6, 1, 1, 6, 2, 2, 6, 0, 3, 4, 5]);
  earGeo.addGroup(0, 27, 0);
  earGeo.addGroup(27, 3, 1);
  earGeo.computeVertexNormals();
  const earL = new THREE.Mesh(earGeo, [rust, mat(0xd88b7a, { side: THREE.DoubleSide })]);
  earL.material = [rust.clone(), earL.material[1]];
  earL.material[0].side = THREE.DoubleSide;
  const earR = earL.clone();
  earL.position.set(-.026, .123, -.108);
  earR.position.set(-.026, .123, .108);
  const eyes = [], shines = [], ears = [earL, earR];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.025, 12, 8), mat(0x202b36));
    eye.scale.set(.90, 1.10, .83); eye.position.set(.128, .035, side * .117);
    headPivot.add(eye); eyes.push(eye);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(.006, 6, 4), mat(0xffffff));
    shine.position.set(.145, .046, side * .127);
    headPivot.add(shine); shines.push(shine);
  }
  const noseSnow = new THREE.Mesh(new THREE.IcosahedronGeometry(.035, 0), mat(0xf4f4f9));
  noseSnow.position.set(.208, .008, .018);
  noseSnow.scale.set(1.1, .65, 1);
  noseSnow.visible = false;
  headPivot.add(head, snout, nose, earL, earR, noseSnow);

  const snowPuffs = [];
  const puffGeo = new THREE.SphereGeometry(.045, 7, 5);
  const puffMat = mat(0xf8fbff, { roughness: 1 });
  for (let i = 0; i < 8; i++) {
    const puff = new THREE.Mesh(puffGeo, puffMat);
    puff.visible = false;
    puff.userData.angle = (i / 8) * Math.PI * 2;
    puff.userData.lift = .028 + (i % 3) * .018;
    g.add(puff); snowPuffs.push(puff);
  }

  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.24, 0.34, 0);
  const tail = new THREE.Mesh(new THREE.SphereGeometry(.18, 10, 8), rust);
  tail.scale.set(1.75,.92,.89);tail.position.x = -0.20;
  const tailTip = new THREE.Mesh(new THREE.SphereGeometry(.115,8,6), cream);
  tailTip.scale.set(1.33,1.08,1.06);tailTip.position.x = -0.43;
  tail.castShadow = true;
  tailPivot.add(tail, tailTip);
  tailPivot.rotation.z = 0.5;

  const legs = [];
  for (const [lx, lz] of [[0.16, -0.08], [0.16, 0.08], [-0.16, -0.08], [-0.16, 0.08]]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.03, .16, 3, 6), dark);
    leg.geometry.translate(0, -.11, 0);
    leg.position.set(lx, 0.22, lz);
    legs.push(leg); g.add(leg);
  }
  collar.position.y = .31;
  g.add(body, chest, collar, pendant, headPivot, tailPivot);
  return {
    group: g,
    parts: { body, headPivot, tailPivot, legs, snowPuffs, noseSnow, eyes, shines, ears, bell },
    pose(phase, moving, sitting, t) {
      const offsets = [0, Math.PI, Math.PI * .82, Math.PI * 1.82];
      for (let i = 0; i < legs.length; i++) {
        const cycle = phase + offsets[i];
        const front = i < 2;
        legs[i].rotation.z = Math.sin(cycle) * .50 * moving + sitting * (front ? .48 : -.66);
        legs[i].position.y = .22 - sitting * (front ? .02 : .06) +
          Math.max(0, Math.cos(cycle)) * .042 * moving;
      }
      const bob = (1 - Math.cos(phase * 2)) * .007 * moving;
      body.position.y = .3 + bob - sitting * .09;
      body.rotation.z = sitting * .19;
      chest.position.y = .3 + bob - sitting * .04;
      collar.position.y = .31 + bob - sitting * .04;
      pendant.position.y = .202 + bob - sitting * .035;
      pendant.rotation.x = Math.sin(phase) * .24 * moving;
      headPivot.position.y = .42 + bob * .4 - sitting * .02 + Math.sin(t * 1.8) * .006;
      headPivot.rotation.z = sitting * 0.12;
      headPivot.rotation.y = 0;
      tailPivot.rotation.z = -.18 - sitting * .25;
      tailPivot.rotation.y = Math.sin(t * 2.2) * .12 * (1 - moving) + Math.sin(phase) * .17 * moving;
      const bp = (t * 0.9 + 0.37) % 3.4;
      const blink = bp < 0.12 ? 0.12 : 1;
      for (const eye of eyes) eye.scale.set(.90, 1.10 * blink, .83);
      for (const sh of shines) sh.visible = blink > 0.5;
      const twitch = Math.sin(t * 0.7) > 0.985 ? Math.sin(t * 40) * .18 : 0;
      earL.rotation.x = twitch; earR.rotation.x = -twitch * .7;
    },
  };
}
