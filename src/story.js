// 故事状态机：开场落到眼高 → 拾星检视 → 狐狸追光 → 同行 →
// 抵达安放 → 逐盏点灯 → 拉镜看足迹 → 信件。
// 所有状态推进只依赖固定步长 dt 与意图队列，自动脚本（capture/demo）与
// 真实点击走同一条代码路径，因此 __seek(t) 可以确定性重放整条旅程。
import * as THREE from 'three';
import { PALETTE } from './world.js';

// —— 脚印池：贴地椭圆印记，落地时生成，方向跟随朝向 ——
class FootprintPool {
  constructor(scene, world, { w, h, color, opacity, max }) {
    this.world = world;
    this.max = max;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const ctx = cv.getContext('2d');
    const stamp = (x, y, rx, ry) => {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    ctx.fillStyle = color;
    if (w < .2) {
      stamp(32, 39, 15, 13);
      for (const [x, y] of [[14, 26], [24, 17], [40, 17], [50, 26]]) stamp(x, y, 5.8, 7.5);
    } else {
      stamp(32, 23, 21, 18);
      stamp(32, 44, 16, 13);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false }),
      max,
    );
    this.mesh.count = 0;
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    this.head = 0;
    scene.add(this.mesh);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3(1, 1, 1);
  }
  spawn(x, z, yaw) {
    const y = this.world.heightAt(x, z) + 0.048;
    this._e.set(-Math.PI / 2, 0, -yaw);
    this._q.setFromEuler(this._e);
    this._m.compose(new THREE.Vector3(x, y, z), this._q, this._s);
    const i = this.head % this.max;
    this.mesh.setMatrixAt(i, this._m);
    this.head++;
    this.mesh.count = Math.min(this.head, this.max);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() {
    this.head = 0;
    this.mesh.count = 0;
  }
}

export class Story {
  constructor({ scene, world, hands, fox, star, config, audio, ui, auto }) {
    Object.assign(this, { scene, world, hands, fox, star, config, audio, ui, auto });
    this.prints = new FootprintPool(scene, world, { w: 0.22, h: 0.42, color: '#485778', opacity: .81, max: 500 });
    this.paws = new FootprintPool(scene, world, { w: 0.15, h: 0.2, color: '#495c80', opacity: .88, max: 500 });
    this.reset();
  }

  reset() {
    const w = this.world;
    this.time = 0;
    this.state = 'cover';
    this.intro = 0;
    this.look = { yaw: 0, pitch: 0 };
    this.route = [];
    this.world.starPatch.visible = false;
    this.reducedMotion = !this.auto && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.starState = 'ground';
    this.prints.clear();
    this.paws.clear();

    // 出生点：入口树枝拱下
    const start = w.path.curve.getPointAt(0.0);
    this.p = {
      pos: new THREE.Vector3(start.x, 0, start.z + .7),
      yaw: Math.PI, // 面向 -z（路径方向）
      target: null,
      stride: 0,
      side: 1,
      phase: 0,
      moving: 0,
      idleTime: 0,
    };
    this.p.pos.y = w.heightAt(this.p.pos.x, this.p.pos.z);

    const starPt = w.path.curve.getPointAt(0.06);
    this.starGroundPos = new THREE.Vector3(starPt.x - 0.55, 0, starPt.z + 0.4);
    this.starGroundPos.y = w.heightAt(this.starGroundPos.x, this.starGroundPos.z) + 0.22;

    const foxPt = w.path.curve.getPointAt(0.075);
    this.f = {
      pos: new THREE.Vector3(this.starGroundPos.x + .65, 0, foxPt.z - .15),
      yaw: 0,
      mode: 'guard',
      stride: 0,
      side: 1,
      phase: 0,
      moving: 0,
      sitting: 1,
      gagT: -1,
      offerT: -1,
      offered: false,
    };
    this.f.pos.y = w.heightAt(this.f.pos.x, this.f.pos.z);

    this.star.visible = true;
    this.star.userData.light.intensity = 2.4;
    this.star.userData.star.material.emissiveIntensity = .68;
    this.star.userData.halo.material.opacity = .12;
    this.star.position.copy(this.starGroundPos);
    this.star.rotation.set(0.15, 0.3, 0);
    this.fox.group.position.copy(this.f.pos);
    this.fox.group.rotation.y = this.f.yaw - Math.PI / 2;
    this.star.scale.setScalar(1);
    this.pickupT = -1;
    this.awakenT = -1;
    this.audio.setLayer(0);
    this.inspect = { yaw: 0.3, pitch: 0.15, anchor: new THREE.Vector3() };

    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camInit = false;
    this.pullbackT = -1;
    this.placeT = -1;
    this.placeSpot = this.world.basePos.clone().add(new THREE.Vector3(0, 0, .95));
    this.letterT = -1;
    this.fadeT = -1;
    this.lampTimer = -1;
    this.lampsLit = 0;
    this.toastUntil = -1;
    this.intents = [];
    this.autoScript = this.auto ? buildAutoScript() : [];
    // 灯与底座复位（重放/循环用）
    for (const lamp of this.world.lamps) {
      lamp.lit = 0;
      lamp.bulbMat.emissiveIntensity = .22;
      lamp.glow.material.opacity = .15;
      lamp.pool.material.opacity = .13;
      lamp.light.intensity = .22;
    }
    this.world.baseLight.intensity = 0.35;
    this.fox.pose(0, 0, 1, 0);
    for (const puff of this.fox.parts.snowPuffs) puff.visible = false;
    if (this.ui && this.ui.resetTransient) this.ui.resetTransient();
    this._syncUi();
  }

  // —— 外部意图（真实点击或自动脚本）——
  queueIntent(intent) { this.intents.push(intent); }

  _progress(pos) {
    // 沿路进度 0~1（最近采样点）
    const s = this.world.path.samples;
    let best = 0, bd = Infinity;
    for (let i = 0; i < s.length; i++) {
      const d = (s[i].x - pos.x) ** 2 + (s[i].z - pos.z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best / (s.length - 1);
  }

  update(dt) {
    this.time += dt;
    // 自动脚本到点发意图
    if (this.auto) {
      for (const a of this.autoScript) {
        if (!a.fired && this.time >= a.t) { a.fired = true; this.intents.push(a.intent); }
      }
    }
    // 处理意图
    while (this.intents.length) {
      const it = this.intents.shift();
      this._handleIntent(it);
    }

    if (this.state === 'intro' && ((this.intro += dt) >= 1.55 || this.reducedMotion)) this.state = 'walk';
    if (this.state !== 'walk' || this.p.target) {
      this.look.yaw *= Math.exp(-7 * dt);
      this.look.pitch *= Math.exp(-7 * dt);
    }
    this._updatePlayer(dt);
    this._updateFox(dt);
    this._updateStar(dt);
    this._updateBeats(dt);
    this._syncUi();
  }

  _handleIntent(it) {
    switch (it.type) {
      case 'start':
        if (this.state === 'cover') this.state = 'intro';
        break;
      case 'advance': {
        if (this.state !== 'walk' || this.p.target) break;
        if (this.starState === 'ground') {
          if (this.p.pos.distanceTo(this.starGroundPos) >= 2.2)
            this.p.target = this.starGroundPos.clone().add(new THREE.Vector3(.20, 0, 1.28));
        } else if (this.starState === 'carried') {
          const progress = this._progress(this.p.pos);
          if (progress >= .99) this.p.target = this.world.basePos.clone().add(new THREE.Vector3(0, 0, 2.35));
          else this._followRoute(Math.min(1, progress + .18));
        }
        break;
      }
      case 'route':
        if (this.state === 'walk' && this.starState === 'carried') this._followRoute(it.progress);
        break;
      case 'pickup':
        if (this.state === 'walk' && this.starState === 'ground' &&
            this.p.pos.distanceTo(this.starGroundPos) < 2.2) {
          this.state = 'pickup';
          this.starState = 'pickup';
          this.pickupT = 0;
          this.p.target = null;
          this.p.yaw = Math.atan2(this.starGroundPos.x-this.p.pos.x,this.starGroundPos.z-this.p.pos.z);
          this.pickupFrom = this.star.position.clone();
          this.inspect.yaw = 0; this.inspect.pitch = 0.0;
          this.audio.chime();
        }
        break;
      case 'flip':
        if (this.state === 'inspect') { this.inspect.yaw += Math.PI; this.audio.chime(); }
        break;
      case 'continue':
        if (this.state === 'inspect') {
          this.state = 'gag';
          this.starState = 'carried';
          this.f.mode = 'chase';
          this.f.gagT = 0;
          this.lightOrigin = this.world.starPatch.position.clone();
          const forward = new THREE.Vector3(Math.sin(this.p.yaw), 0, Math.cos(this.p.yaw));
          const side = new THREE.Vector3(-forward.z, 0, forward.x);
          this.lightEnd = this.p.pos.clone().addScaledVector(forward, 2.65).addScaledVector(side, 1.03);
          this.audio.setLayer(1);
        }
        break;
      case 'place':
        if (this.state === 'walk' && this.starState === 'carried' &&
            this.p.pos.distanceTo(this.world.basePos) < 3.7) {
          this.route.length = 0;
          this.state = 'approach-base';
          this.p.target = this.placeSpot.clone();
        }
        break;
    }
  }

  _followRoute(progress) {
    const start = Math.round(this._progress(this.p.pos) * 120);
    const end = Math.round(progress * 120);
    if (end <= start) return;
    this.route = [];
    for (let i = start + 4; i < end; i += 4) this.route.push(this.world.path.samples[i]);
    this.route.push(this.world.path.samples[end]);
    this.p.target = this.route.shift();
  }

  _updatePlayer(dt) {
    const p = this.p;
    const SPEED = 1.45, STRIDE = 0.52;
    if (p.target && (this.state === 'walk' || this.state === 'approach-base')) {
      const dx = p.target.x - p.pos.x, dz = p.target.z - p.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.08) {
        p.target = this.route.shift() ?? null;
      } else {
        const desiredYaw = Math.atan2(dx, dz);
        p.yaw = dampAngle(p.yaw, desiredYaw, 8, dt);
        const step = Math.min(SPEED * dt, dist);
        p.pos.x += dx / dist * step;
        p.pos.z += dz / dist * step;
        p.moving = Math.min(1, p.moving + dt * 6);
        p.idleTime = 0;
        p.phase += step * 3.4;
        p.stride += step;
        if (p.stride >= STRIDE) {
          p.stride -= STRIDE;
          p.side *= -1;
          const px = -Math.cos(p.yaw) * 0.11 * p.side;
          const pz = Math.sin(p.yaw) * 0.11 * p.side;
          this.prints.spawn(p.pos.x + px, p.pos.z + pz, p.yaw);
          this.audio.footstep('player', 0);
        }
      }
    } else {
      p.moving = Math.max(0, p.moving - dt * 5);
      p.idleTime += dt;
    }
    if (this.state === 'approach-base' && !p.target) {
      this.state = 'placing';
      this.starState = 'placing';
      this.placeT = 0;
      this.placeFrom = p.pos.clone().add(new THREE.Vector3(0, 1.43 + this.world.stepHeight(p.pos), -.55));
      p.yaw = Math.atan2(this.world.basePos.x - p.pos.x, this.world.basePos.z - p.pos.z);
      this.audio.placeStar();
    }
    p.pos.y = this.world.heightAt(p.pos.x, p.pos.z);
  }

  _updateFox(dt) {
    const f = this.f;
    const path = this.world.path;
    const RUN = 2.7, WALK = 1.9;
    let target = null, speed = RUN;

    if (f.mode === 'guard') {
      f.sitting = Math.min(1, f.sitting + dt * 4);
      const near = this.starState === 'ground' && this.p.pos.distanceTo(this.starGroundPos) < 3.4;
      if (near && !f.offered) {
        f.mode = 'offer';
        f.offerT = 0;
        f.sitting = .2;
      } else {
        // 看着玩家
        f.yaw = dampAngle(f.yaw, Math.atan2(this.p.pos.x - f.pos.x, this.p.pos.z - f.pos.z), 5, dt);
      }
      f.moving = Math.max(0, f.moving - dt * 5);
    } else if (f.mode === 'offer') {
      f.offerT += dt;
      f.sitting = Math.max(0, f.sitting - dt * 5);
      f.moving = 0;
      const towardStar = Math.atan2(this.starGroundPos.x - f.pos.x, this.starGroundPos.z - f.pos.z);
      f.yaw = dampAngle(f.yaw, f.offerT < 1.8 ? towardStar : Math.atan2(this.p.pos.x - f.pos.x, this.p.pos.z - f.pos.z), 6, dt);
      if (f.offerT > 1.1 || this.starState !== 'ground') {
        f.mode = 'guard';
        f.offered = true;
      }
    } else if (f.mode === 'lead') {
      const pr = Math.min(this._progress(this.p.pos) + 0.050, 0.95);
      target = path.curve.getPointAt(pr);
      const tangent = path.curve.getTangentAt(pr);
      target.add(new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(.52));
      if (this._progress(this.p.pos) > .89) f.mode = 'arrive';
      speed = 1.65;
      f.sitting = Math.max(0, f.sitting - dt * 6);
      const distToPlayer = f.pos.distanceTo(this.p.pos);
      // Stay visible as a guide. If the player pauses, wait ahead instead of
      // sprinting all the way back and making the scene feel stalled.
      if (this.p.idleTime > .75 && distToPlayer > 1.55) {
        f.mode = 'waitAhead';
      }
    } else if (f.mode === 'waitAhead') {
      f.sitting = Math.min(1, f.sitting + dt * 5);
      f.moving = Math.max(0, f.moving - dt * 6);
      f.yaw = dampAngle(f.yaw, Math.atan2(this.p.pos.x - f.pos.x, this.p.pos.z - f.pos.z), 5, dt);
      if (this.p.target) f.mode = 'lead';
    } else if (f.mode === 'chase') {
      f.gagT += dt;
      f.sitting = 0;
      const sweep = THREE.MathUtils.smoothstep(f.gagT, .3, 1.4);
      const patch = this.world.starPatch;
      patch.position.copy(this.lightOrigin).lerp(this.lightEnd, sweep);
      if (f.gagT > .42) { target = patch.position; speed = 3.4; }
      if (f.gagT > 1.45 && Math.hypot(f.pos.x - patch.position.x, f.pos.z - patch.position.z) < .28) {
        f.mode = 'peek';
        f.gagT = 0;
      }
    } else if (f.mode === 'peek') {
      f.gagT += dt;
      f.moving = 0;
      f.yaw = dampAngle(f.yaw, Math.atan2(this.p.pos.x - f.pos.x, this.p.pos.z - f.pos.z), 6, dt);
      if (f.gagT >= 1.45) f.mode = 'comeback';
    } else if (f.mode === 'comeback') {
      const side = new THREE.Vector3(-Math.cos(this.p.yaw), 0, Math.sin(this.p.yaw)).multiplyScalar(1.05);
      const ahead = new THREE.Vector3(Math.sin(this.p.yaw), 0, Math.cos(this.p.yaw)).multiplyScalar(.3);
      target = this.p.pos.clone().add(side).add(ahead);
      speed = RUN * .9;
      f.sitting = Math.max(0, f.sitting - dt * 6);
      if (f.pos.distanceTo(target) < .32) {
        f.mode = 'lead';
        this.state = 'walk';
        this.toastUntil = this.time + 3.8;
      }
    } else if (f.mode === 'arrive') {
      const b = this.world.basePos;
      target = new THREE.Vector3(b.x + 1.5, 0, b.z + 1.2);
      speed = RUN;
      if (f.pos.distanceTo(target) < 0.3) {
        f.mode = 'arrive-sit';
      }
    } else if (f.mode === 'arrive-sit') {
      f.sitting = Math.min(1, f.sitting + dt * 4);
      f.moving = Math.max(0, f.moving - dt * 5);
      f.yaw = dampAngle(f.yaw, Math.atan2(this.p.pos.x - f.pos.x, this.p.pos.z - f.pos.z), 4, dt);
    }

    if (target && f.mode !== 'peek') {
      const dx = target.x - f.pos.x, dz = target.z - f.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.06) {
        const desiredYaw = Math.atan2(dx, dz);
        f.yaw = dampAngle(f.yaw, desiredYaw, 9, dt);
        const step = Math.min(speed * dt, dist);
        f.pos.x += dx / dist * step;
        f.pos.z += dz / dist * step;
        f.moving = Math.min(1, f.moving + dt * 7);
        f.phase += step * 7.5;
        f.stride += step;
        const FSTRIDE = 0.3;
        if (f.stride >= FSTRIDE) {
          f.stride -= FSTRIDE;
          f.side *= -1;
          const px = -Math.cos(f.yaw) * 0.06 * f.side;
          const pz = Math.sin(f.yaw) * 0.06 * f.side;
          this.paws.spawn(f.pos.x + px, f.pos.z + pz, f.yaw);
          this.audio.footstep('fox', f.pos.distanceTo(this.p.pos));
        }
      } else {
        f.moving = Math.max(0, f.moving - dt * 6);
      }
    } else if (f.mode !== 'peek') {
      f.moving = Math.max(0, f.moving - dt * 6);
    }

    f.pos.y = this.world.heightAt(f.pos.x, f.pos.z);
    const g = this.fox.group;
    g.position.copy(f.pos);
    g.rotation.y = f.yaw - Math.PI / 2; // 模型朝 +x 建模
    g.rotation.z = 0;
    this.fox.pose(f.phase, f.moving, f.sitting, this.time);
    const head = this.fox.parts.headPivot;
    if (f.mode === 'offer') {
      const dip = Math.sin(Math.PI * f.offerT / 1.1);
      head.position.y -= dip * .11;
      head.rotation.z -= dip * .25;
    } else if (f.mode === 'chase') {
      const spring = Math.sin(Math.PI * THREE.MathUtils.smoothstep(f.gagT, .57, 1.35));
      g.position.y += spring * .26;
      head.rotation.z -= .15 * (1 - spring);
    } else if (f.mode === 'peek') {
      g.position.y -= .12 * (1 - THREE.MathUtils.smoothstep(f.gagT, .5, 1.4));
      this.fox.parts.tailPivot.rotation.y = Math.sin(f.gagT * 12) * .28;
    }
    for (const puff of this.fox.parts.snowPuffs) {
      puff.visible = f.mode === 'peek' && f.gagT < .78;
      if (!puff.visible) continue;
      const t = f.gagT / .78, a = puff.userData.angle;
      puff.position.set(Math.cos(a) * t * .64, .18 + Math.sin(Math.PI * t) * .42, Math.sin(a) * t * .64);
      puff.scale.setScalar(1 - .8 * t);
    }
  }

  _updateStar(dt) {
    const s = this.star;
    s.visible = this.starState !== 'carried' || (this.state === 'gag' && this.f.mode !== 'comeback');
    const targetScale = ['pickup', 'inspect', 'carried'].includes(this.starState) ? .70 : 1.16;
    const sc = s.scale.x + (targetScale - s.scale.x) * Math.min(1, 6 * dt);
    s.scale.setScalar(sc);
    const L = s.userData.light;
    const fwd=new THREE.Vector3(Math.sin(this.p.yaw),0,Math.cos(this.p.yaw));
    const focus = this.f.pos.clone();
    if (this.state === 'gag') focus.lerp(this.world.starPatch.position, .42);
    const view = focus.sub(this.p.pos).setY(0).normalize();
    const viewSide = new THREE.Vector3(-view.z, 0, view.x);
    this.inspect.anchor.copy(this.p.pos).addScaledVector(view, .96)
      .addScaledVector(viewSide, this.state === 'gag' ? -.16 : -.15)
      .add(new THREE.Vector3(0, this.state === 'gag' ? .68 : .92, 0));
    const patch = this.world.starPatch;
    patch.visible = this.state === 'inspect' || (this.state === 'gag' && this.f.mode !== 'comeback');
    patch.material.opacity = this.f.mode === 'peek' ? .76 * (1 - THREE.MathUtils.smoothstep(this.f.gagT, 0, .8)) : .76;
    if (this.state === 'inspect') {
      const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
      patch.position.copy(this.p.pos).addScaledVector(fwd, 2 + this.inspect.pitch * .45)
        .addScaledVector(side, .6 + Math.sin(this.inspect.yaw) * .55);
    }
    if (patch.visible) patch.position.y = this.world.heightAt(patch.position.x, patch.position.z) + .045;
    s.userData.halo.material.opacity=this.starState==='placed' ? .65 : .12;
    s.userData.star.material.emissiveIntensity=this.starState==='placed' ? 1.12 : .68;
    if (this.starState === 'ground') {
      L.intensity = 2.4;
      s.position.y = this.starGroundPos.y + Math.sin(this.time * 1.8) * 0.04;
      s.rotation.y = Math.atan2(this.camPos.x-s.position.x,this.camPos.z-s.position.z);
    } else if (this.starState === 'inspect') {
      s.position.lerp(this.inspect.anchor, 1 - Math.exp(-8 * dt));
      s.rotation.y = dampAngle(s.rotation.y, Math.atan2(this.camPos.x-s.position.x,this.camPos.z-s.position.z) + this.inspect.yaw, 10, dt);
      s.rotation.x += (this.inspect.pitch - s.rotation.x) * Math.min(1, 10 * dt);
      s.rotation.z *= 1 - Math.min(1, 8 * dt);
    } else if (this.starState === 'carried') {
      L.intensity += (0.7 - L.intensity) * Math.min(1, 4 * dt);
      const goal = this.inspect.anchor;
      s.position.lerp(goal, 1 - Math.exp(-6 * dt));
      const sweep = this.f.mode === 'chase' ? THREE.MathUtils.smoothstep(this.f.gagT, .30, 1.4) : 1;
      s.rotation.y = Math.atan2(this.camPos.x-s.position.x,this.camPos.z-s.position.z) + this.inspect.yaw * (1 - sweep) - sweep * .64;
      s.rotation.x = this.inspect.pitch * (1 - sweep) + sweep * .21;
    } else if (this.starState === 'placed') {
      L.intensity += (1.6 - L.intensity) * Math.min(1, 3 * dt);
      s.position.y = this.world.baseTop.y;
      s.rotation.set(0, 0, 0);
    }
  }

  _updateBeats(dt) {
    if(this.state==='pickup') {
      this.pickupT+=dt;
      const k=THREE.MathUtils.smoothstep(this.pickupT,.7,2.4);
      this.star.position.copy(this.pickupFrom).lerp(this.inspect.anchor,k);
      this.star.rotation.y=.62;
      if(this.pickupT>=2.4){this.state='inspect';this.starState='inspect';}
      return;
    }
    if(this.state==='awakening') {
      this.awakenT+=dt;
      const k=THREE.MathUtils.smoothstep(this.awakenT,.5,3.2);
      this.star.userData.star.material.emissiveIntensity=.68+k*.76;
      this.star.userData.light.intensity=.4+k*3.35;
      this.star.userData.halo.material.opacity=.1+k*.48;
      this.world.baseLight.intensity=.35+k*3;
      if(this.awakenT>=3.6){this.state='finale';this.starState='placed';this.lampTimer=0;this.pullbackT=0;this.audio.setLayer(2);}
      return;
    }
    // 安放动画
    if (this.state === 'placing') {
      this.placeT += dt;
      const k = THREE.MathUtils.smoothstep(this.placeT, .35, 2.15);
      const to = this.world.baseTop;
      this.star.rotation.set(0, 0, 0);
      const mid = this.placeFrom.clone().lerp(to, k);
      mid.y += Math.sin(k * Math.PI) * .11;
      this.star.position.copy(mid);
      this.star.userData.light.intensity = 1.1 + k * 2.2;
      if (this.placeT >= 2.15) {
        this.starState = 'awakening';
        this.state = 'awakening';
        this.awakenT = 0;
        this.lampTimer = -1;
        this.lampsLit = 0;

      }
      return;
    }
    // 点灯：从底座向外沿路逐盏
    if (this.state === 'finale') {
      if (this.lampTimer >= 0 && this.lampsLit < this.world.lamps.length) {
        this.lampTimer += dt;
        const idx = Math.floor(this.lampTimer / 0.65);
        while (this.lampsLit <= idx && this.lampsLit < this.world.lamps.length) {
          // 从离底座最近（索引大）的开始
          const lamp = this.world.lamps[this.world.lamps.length - 1 - this.lampsLit];
          lamp.lit = .001;
          this.audio.lampPing(this.lampsLit);
          this.lampsLit++;
        }
        if (this.lampsLit >= this.world.lamps.length) {
          this.lampTimer = -1;
        }
      }
      // 灯的渐变
      for (const lamp of this.world.lamps) {
        if (lamp.lit > 0 && lamp.lit < 1.01) {
          lamp.lit = Math.min(1.01, lamp.lit + dt * 1.6);
          const k = Math.min(lamp.lit, 1);
          lamp.bulbMat.emissiveIntensity = 0.06 + k * 1.6;
          lamp.glow.material.opacity = k * 0.85;
          lamp.pool.material.opacity = .13 + k * .62;
          lamp.light.intensity = .22 + k * 5.5;
        }
      }
      this.world.baseLight.intensity = 6.4;
      // 拉镜完成后出信
      if (this.pullbackT >= 0) {
        this.pullbackT += dt;
        if (this.pullbackT > 6.3 && this.letterT < 0) {
          this.letterT = 0;
          this.state = 'letter';
          this.audio.setLayer(3);
          this.ui.showLetter(this.config);
        }
      }
    }
  }

  // —— 相机 ——
  applyCamera(camera, dt) {
    const p = this.p.pos;
    const eye = p.clone().add(new THREE.Vector3(0, 1.48 + this.world.stepHeight(p) +
      (this.reducedMotion ? 0 : Math.sin(this.p.phase * 2) * .012 * this.p.moving), 0));
    if (this.state === 'pickup') eye.y -= .28 * Math.sin(Math.PI * this.pickupT / 2.4);
    const goalPos = eye.clone();
    let goalLook;
    const pr = this._progress(p);
    if (['approach-base', 'placing', 'awakening', 'finale', 'letter'].includes(this.state)) {
      goalLook = this.world.baseTop.clone().add(new THREE.Vector3(0, -.32, 0));
      if (this.state === 'placing') goalLook.lerp(this.star.position, .50);
    } else if (['pickup', 'inspect', 'gag'].includes(this.state)) {
      goalLook = this.f.pos.clone().add(new THREE.Vector3(0, .53, 0));
      if (this.world.starPatch.visible) goalLook.lerp(this.world.starPatch.position, this.state === 'inspect' ? .12 : .39);
    } else if (this.starState === 'ground') {
      goalLook = this.starGroundPos.clone().lerp(this.f.pos, .36).add(new THREE.Vector3(0, .20, 0));
    } else {
      goalLook = this.world.path.curve.getPointAt(Math.min(1, pr + .08))
        .lerp(this.f.pos, .38).add(new THREE.Vector3(0, .88, 0));
      if (pr > .9) goalLook.lerp(this.world.baseTop, .60);
    }
    if (this.state === 'cover' || this.state === 'intro') {
      const wide = this.world.path.samples[0].clone().add(new THREE.Vector3(1, 3.5, 3.9));
      const t = this.state === 'cover' ? 0 : THREE.MathUtils.smoothstep(this.intro, 0, 1.55);
      goalPos.lerp(wide, 1 - t);
      goalLook.lerp(this.world.path.curve.getPointAt(.18).add(new THREE.Vector3(0, 1, 0)), 1 - t);
    }
    if (this.pullbackT >= 0) {
      const e = this.reducedMotion ? 1 : THREE.MathUtils.smoothstep(this.pullbackT, 0, 4.8);
      const b = this.world.basePos;
      goalPos.lerp(new THREE.Vector3(b.x + (camera.aspect < .8 ? 9 : 16), 22, b.z + 40), e);
      goalLook.lerp(new THREE.Vector3(b.x, .38, b.z + 15), e);
    }
    const k = this.camInit && dt && !this.reducedMotion ? 1 - Math.exp(-7 * dt) : 1;
    this.camPos.lerp(goalPos, k);
    this.camLook.lerp(goalLook, k);
    this.camInit = true;
    camera.position.copy(this.camPos);
    camera.lookAt(this.camLook);
    camera.rotateY(this.look.yaw);
    camera.rotateX(this.look.pitch);
    this.hands.visible = ['pickup', 'inspect', 'placing'].includes(this.state) ||
      (this.state === 'gag' && this.f.mode !== 'comeback');
    if (this.hands.visible) {
      this.hands.position.copy(this.star.position);
      this.hands.scale.setScalar(this.state === 'placing' ? .97 : .74);
      this.hands.quaternion.copy(camera.quaternion);
    }
  }

  // —— UI 同步（每步调用，DOM 只在变化时写）——
  _syncUi() {
    const nearStar = this.starState === 'ground' && this.p.pos.distanceTo(this.starGroundPos) < 2.2;
    const nearBase = this.starState === 'carried' && this.p.pos.distanceTo(this.world.basePos) < 3.7;
    if (!this.ui) return;
    this.ui.setPrompt(
      this.state === 'walk' && nearStar ? '拾起星星' :
      this.state === 'walk' && nearBase ? '安放星星' : null,
    );
    this.ui.setInspect(this.state === 'inspect', this.config, Math.abs(Math.sin(this.inspect.yaw/2))>.7);
    this.ui.setJourney(
      this.state==='walk' && !this.p.target && !nearStar && !nearBase && this.time >= this.toastUntil,
      this.starState === 'ground' ? '跟着暖光走' : '跟上小狐狸',
    );
    this.ui.setToast(this.time < this.toastUntil ? this.config.walkLine : null);
  }
}

function dampAngle(a, b, lambda, dt) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-lambda * dt));
}

// —— 自动样片脚本：与真实点击同路径，确定性覆盖全部验收点 ——
function buildAutoScript() {
  const route=(t,progress)=>({t,intent:{type:'route',progress}});
  return [
    {t:.4,intent:{type:'start'}},{t:2.1,intent:{type:'advance'}},
    {t:4.4,intent:{type:'pickup'}},{t:9,intent:{type:'flip'}},
    {t:12,intent:{type:'continue'}}, route(17,.20),
    route(23,.43),route(32,.60),route(40,.75),route(46,.88),route(51,1),
    {t:56,intent:{type:'place'}},
  ];
}
