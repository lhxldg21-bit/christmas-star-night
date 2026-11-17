// 故事状态机：封面 → 拾星检视 → 狐狸带路/折返/等候 → 雪落鼻尖 → 并肩 →
// 抵达安放 → 逐盏点灯 → 拉镜看足迹 → 信件。
// 所有状态推进只依赖固定步长 dt 与意图队列，自动脚本（capture/demo）与
// 真实点击走同一条代码路径，因此 __seek(t) 可以确定性重放整条旅程。
import * as THREE from 'three';
import { PALETTE } from './world.js';

const STEP = 1 / 60;

// —— 脚印池：贴地椭圆印记，落地时生成，方向跟随朝向 ——
class FootprintPool {
  constructor(scene, world, { w, h, color, opacity, max }) {
    this.world = world;
    this.max = max;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const ctx = cv.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.save();
    ctx.translate(32, 32);
    ctx.scale(1, 0.62);
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false }),
      max,
    );
    this.mesh.count = 0;
    this.mesh.renderOrder = 1;
    this.head = 0;
    scene.add(this.mesh);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3(1, 1, 1);
  }
  spawn(x, z, yaw) {
    const y = this.world.heightAt(x, z) + 0.025;
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
  constructor({ scene, world, player, fox, star, config, audio, ui, auto }) {
    Object.assign(this, { scene, world, player, fox, star, config, audio, ui, auto });
    this.prints = new FootprintPool(scene, world, { w: 0.22, h: 0.42, color: 'rgba(48,68,104,1)', opacity: 1, max: 500 });
    this.paws = new FootprintPool(scene, world, { w: 0.15, h: 0.2, color: 'rgba(70,91,137,0.9)', opacity: 0.95, max: 500 });
    this.reset();
  }

  reset() {
    const w = this.world;
    this.time = 0;
    this.state = this.auto ? 'walk' : 'cover'; // capture/demo 自动跳过封面
    this.starState = 'ground';
    this.prints.clear();
    this.paws.clear();

    // 出生点：入口树枝拱下
    const start = w.path.curve.getPointAt(0.0);
    this.p = {
      pos: new THREE.Vector3(start.x, 0, start.z + 1.6),
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
      pos: new THREE.Vector3(foxPt.x + 1.05, 0, foxPt.z - 0.15),
      yaw: 0,
      mode: 'guard',
      stride: 0,
      side: 1,
      phase: 0,
      moving: 0,
      sitting: 1,
      waitTimer: 0,
      gagDone: false,
      gagT: -1,
      hideT: 0,
      returnedOnce: false,
      offerT: -1,
      offered: false,
    };
    this.f.pos.y = w.heightAt(this.f.pos.x, this.f.pos.z);

    this.star.position.copy(this.starGroundPos);
    this.star.rotation.set(0.15, 0.3, 0);
    this.player.group.position.copy(this.p.pos);
    this.player.group.rotation.y = this.p.yaw;
    this.fox.group.position.copy(this.f.pos);
    this.fox.group.rotation.y = this.f.yaw - Math.PI / 2;
    this.starScale = 1;
    this.star.scale.setScalar(1);
    this.pickupT = -1;
    this.awakenT = -1;
    this.audio.setLayer(0);
    this.inspect = { yaw: 0.3, pitch: 0.15, anchor: new THREE.Vector3(), active: false };

    this.camMode = 'follow';
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camInit = false;
    this.pullbackT = -1;
    this.placeT = -1;
    this.placeSpot = this.world.basePos.clone().add(new THREE.Vector3(0, 0, 2.15));
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
      lamp.bulbMat.emissiveIntensity = 0.06;
      lamp.glow.material.opacity = 0;
      lamp.pool.material.opacity = 0;
    }
    this.world.baseLight.intensity = 0.35;
    this.fox.parts.headPivot.rotation.set(0, 0, 0);
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

    this._updatePlayer(dt);
    this._updateFox(dt);
    this._updateStar(dt);
    this._updateBeats(dt);
    this._syncUi();
  }

  _handleIntent(it) {
    switch (it.type) {
      case 'start':
        if (this.state === 'cover') { this.state = 'walk'; this.audio.setLayer(0); }
        break;
      case 'route': {
        const point=this.world.path.curve.getPointAt(it.progress);
        this._handleIntent({type:'move',x:point.x,z:point.z});
        break;
      }
      case 'approach':
        this._handleIntent({type:'move',x:this.starGroundPos.x-0.7,z:this.starGroundPos.z+0.6});
        break;
      case 'move':
        if (this.state === 'walk') {
          // 限定可行走范围：以路径（含底座）为中心的走廊，超出则压回边缘
          const corridor = this.world.path.samples.concat([this.world.basePos]);
          let bd = Infinity, bx = it.x, bz = it.z;
          for (const s of corridor) {
            const d = (s.x - it.x) ** 2 + (s.z - it.z) ** 2;
            if (d < bd) { bd = d; bx = s.x; bz = s.z; }
          }
          bd = Math.sqrt(bd);
          const R = 3.0;
          let x = it.x, z = it.z;
          if (bd > R) {
            x = bx + ((it.x - bx) / bd) * R;
            z = bz + ((it.z - bz) / bd) * R;
          }
          this.p.target = new THREE.Vector3(x, 0, z);
        }
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
          this.inspect.active = true;
          this.inspect.yaw = 0; this.inspect.pitch = 0.0;
          this.audio.chime();
        }
        break;
      case 'flip':
        if (this.state === 'inspect') { this.inspect.yaw += Math.PI; this.audio.chime(); }
        break;
      case 'continue':
        if (this.state === 'inspect') {
          this.state = 'walk';
          this.starState = 'carried';
          this.inspect.active = false;
          if (this.f.mode === 'guard') this.f.mode = 'lead';
          this.p.target=this.world.path.curve.getPointAt(.19);
          this.audio.setLayer(1);
        }
        break;
      case 'place':
        if (this.state === 'walk' && this.starState === 'carried' &&
            this.p.pos.distanceTo(this.world.basePos) < 3.5) {
          this.state = 'approach-base';
          this.p.target = this.placeSpot.clone();
        }
        break;
    }
  }

  _updatePlayer(dt) {
    const p = this.p;
    const SPEED = 1.45, STRIDE = 0.52;
    if (p.target && (this.state === 'walk' || this.state === 'approach-base')) {
      const dx = p.target.x - p.pos.x, dz = p.target.z - p.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.08) {
        p.target = null;
      } else {
        const desiredYaw = Math.atan2(dx, dz);
        p.yaw = dampAngle(p.yaw, desiredYaw, 8, dt);
        const step = Math.min(SPEED * dt, dist);
        p.pos.x += Math.sin(p.yaw) * step;
        p.pos.z += Math.cos(p.yaw) * step;
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
      this.placeFrom = this.star.position.clone();
      p.yaw = Math.atan2(this.world.basePos.x - p.pos.x, this.world.basePos.z - p.pos.z);
      this.audio.placeStar();
    }
    p.pos.y = this.world.heightAt(p.pos.x, p.pos.z);
    const g = this.player.group;
    g.position.copy(p.pos);
    g.rotation.y = p.yaw;
    this.player.pose(p.phase, p.moving, this.time);
    const arms=this.player.limbs;
    if (this.state==='pickup') {
      const reach=Math.sin(Math.min(this.pickupT/2.4,1)*Math.PI);
      g.position.y-=reach*.19;
      arms.body.rotation.x=reach*.32;
      arms.armL.rotation.x=-reach*1.3;
      arms.armR.rotation.x=-reach*1.3;
    } else if (this.state === 'placing') {
      arms.body.rotation.x = .14 * THREE.MathUtils.smoothstep(this.placeT, .2, 1.2);
      arms.armL.rotation.x = -.78;
      arms.armR.rotation.x = -.78;
      arms.armL.userData.elbow.rotation.x = -1.12;
      arms.armR.userData.elbow.rotation.x = -1.12;
    } else {
      arms.body.rotation.x=0;
      if (this.starState==='inspect'||this.starState==='carried') {
        arms.armL.rotation.x=-.55;arms.armR.rotation.x=-.55;
        arms.armL.userData.elbow.rotation.x=-1.35;arms.armR.userData.elbow.rotation.x=-1.35;
      }
    }
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
      if (f.offerT > 2.75) {
        f.mode = 'guard';
        f.offered = true;
      }
    } else if (f.mode === 'lead') {
      const pr = Math.min(this._progress(this.p.pos) + 0.16, 0.95);
      target = path.curve.getPointAt(pr);
      speed = RUN;
      f.sitting = Math.max(0, f.sitting - dt * 6);
      const distToPlayer = f.pos.distanceTo(this.p.pos);
      // 跑太远了，或玩家停下太久 → 折返
      if (distToPlayer > 5.2 || (this.p.idleTime > 1.6 && distToPlayer > 3)) {
        f.mode = 'return';
      }
    } else if (f.mode === 'return') {
      target = this.p.pos.clone();
      const away = new THREE.Vector3().subVectors(f.pos, this.p.pos).setY(0);
      if (away.lengthSq() > 0.001) target.add(away.normalize().multiplyScalar(1.1));
      speed = RUN;
      if (f.pos.distanceTo(target) < 0.35) {
        f.mode = 'wait';
        f.waitTimer = 0;
        f.returnedOnce = true;
      }
    } else if (f.mode === 'wait') {
      f.sitting = Math.min(1, f.sitting + dt * 4);
      f.moving = Math.max(0, f.moving - dt * 5);
      f.yaw = dampAngle(f.yaw, Math.atan2(this.p.pos.x - f.pos.x, this.p.pos.z - f.pos.z), 5, dt);
      if (this.p.moving > 0.5) f.mode = 'lead';
    } else if (f.mode === 'hide') {
      f.hideT += dt;
      target = this.world.foxHidePos.clone();
      speed = RUN * 1.72;
      f.sitting = Math.max(0, f.sitting - dt * 8);
      if (f.pos.distanceTo(target) < .24) {
        f.mode = 'gag';
        f.gagT = 0;
        this.state = 'gag';
      }
    } else if (f.mode === 'gag') {
      f.gagT += dt;
      f.sitting = Math.max(0, f.sitting - dt * 6);
      f.moving = 0;
      f.yaw = dampAngle(f.yaw, Math.atan2(this.p.pos.x - f.pos.x, this.p.pos.z - f.pos.z), 4, dt);

      if (f.gagT >= 6.4) {
        this.state = 'walk';
        f.mode = 'alongside';
        this.toastUntil = this.time + 3.6;
      }
    } else if (f.mode === 'alongside') {
      const side = new THREE.Vector3(-Math.cos(this.p.yaw), 0, Math.sin(this.p.yaw)).multiplyScalar(1.05);
      const ahead = new THREE.Vector3(Math.sin(this.p.yaw), 0, Math.cos(this.p.yaw)).multiplyScalar(0.35);
      target = this.p.pos.clone().add(side).add(ahead);
      speed = this.p.moving > 0.1 ? Math.max(WALK, Math.min(RUN, this.p.moving * 2.2)) : WALK;
      f.sitting = this.p.moving > 0.1 ? Math.max(0, f.sitting - dt * 6) : Math.min(1, f.sitting + dt * 3);
      if (this._progress(this.p.pos) > 0.88) f.mode = 'arrive';
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

    if (target && f.mode !== 'gag') {
      const dx = target.x - f.pos.x, dz = target.z - f.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.06) {
        const desiredYaw = Math.atan2(dx, dz);
        f.yaw = dampAngle(f.yaw, desiredYaw, 9, dt);
        const step = Math.min(speed * dt, dist);
        f.pos.x += Math.sin(f.yaw) * step;
        f.pos.z += Math.cos(f.yaw) * step;
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
    } else if (f.mode !== 'gag') {
      f.moving = Math.max(0, f.moving - dt * 6);
    }

    // 狐狸先冲到弯道雪堆后，再探头完成落雪表演。
    if (!f.gagDone && f.mode === 'lead' && this._progress(this.p.pos) > 0.445) {
      f.gagDone = true;
      f.mode = 'hide';
      f.hideT = 0;
    }

    f.pos.y = this.world.heightAt(f.pos.x, f.pos.z);
    const g = this.fox.group;
    g.position.copy(f.pos);
    g.rotation.y = f.yaw - Math.PI / 2; // 模型朝 +x 建模
    this.fox.pose(f.phase, f.moving, f.sitting, this.time);
    const ball=this.fox.parts.snowball;
    ball.visible = f.mode === 'gag' && f.gagT > .45 && f.gagT < 3.25;
    for (const puff of this.fox.parts.snowPuffs) {
      const age = f.gagT - 1.75;
      puff.visible = f.mode === 'gag' && age > 0 && age < 3.55;
      if (puff.visible) {
        const k = age / 3.55;
        const a = puff.userData.angle;
        const radius = .2 + k * .32;
        puff.position.set(
          .39 + Math.cos(a) * radius,
          .5 + puff.userData.lift + k * (.24 + Math.sin(a) * .08),
          Math.sin(a) * radius,
        );
        puff.scale.setScalar((1 - k * .55) * (.72 + (a % .7)));
      }
    }
    if (f.mode === 'offer') {
      const sniff = THREE.MathUtils.smoothstep(f.offerT, .65, 1.85);
      const retreat = THREE.MathUtils.smoothstep(f.offerT, 2.05, 2.75);
      this.fox.parts.headPivot.position.x = .3 + sniff * .085 - retreat * .085;
      this.fox.parts.headPivot.position.y = .42 - sniff * .09 + retreat * .09;
      this.fox.parts.headPivot.rotation.z = -.22 * sniff + .22 * retreat;
    } else if (f.mode==='gag') {
      const peek = THREE.MathUtils.smoothstep(f.gagT, 0, .72);
      this.fox.parts.headPivot.position.y = .42 + peek * .12;
      this.fox.parts.headPivot.rotation.y = Math.sin(f.gagT * 1.4) * .18 * (1 - peek);
      if (f.gagT < 1.9) {
        const drop = THREE.MathUtils.smoothstep(f.gagT, .45, 1.75);
        ball.position.y = .04 + (1 - drop) * 1.05;
        this.fox.parts.headPivot.rotation.z = .08 + Math.sin(drop * Math.PI) * .16;
      } else if (f.gagT < 3.45) {
        this.fox.shakeHead((f.gagT - 1.9) / 1.55);
      } else if (f.gagT < 5.15) {
        const joy = THREE.MathUtils.smoothstep(f.gagT, 3.25, 3.7) * (1 - THREE.MathUtils.smoothstep(f.gagT, 4.8, 5.15));
        g.position.y += Math.abs(Math.sin((f.gagT - 3.25) * Math.PI * 1.8)) * .55 * joy;
        g.rotation.z = Math.sin((f.gagT - 3.25) * Math.PI * 1.8) * .25 * joy;
        this.fox.parts.tailPivot.rotation.y = Math.sin(f.gagT * 13) * .36;
      } else {
        this.fox.parts.headPivot.rotation.z = -.08;
        this.fox.parts.tailPivot.rotation.y = Math.sin(f.gagT * 4) * .2;
      }
    } else {
      this.fox.parts.headPivot.position.x = .3;
      this.fox.parts.headPivot.position.y = .42;
    }
  }

  _updateStar(dt) {
    const s = this.star;
    const targetScale = this.starState === 'placed' ? 1.45 : 1;
    const sc = s.scale.x + (targetScale - s.scale.x) * Math.min(1, 6 * dt);
    s.scale.setScalar(sc);
    const L = s.userData.light;
    const fwd=new THREE.Vector3(Math.sin(this.p.yaw),0,Math.cos(this.p.yaw));
    this.inspect.anchor.copy(this.p.pos).addScaledVector(fwd,.34).add(new THREE.Vector3(0,.97,0));
    s.userData.halo.material.opacity=this.starState==='placed' ? .65 : .12;
    s.userData.star.material.emissiveIntensity=this.starState==='placed' ? 1.8 : .25;
    if (this.starState === 'ground') {
      L.intensity = 1.1;
      s.position.y = this.starGroundPos.y + Math.sin(this.time * 1.8) * 0.04;
      s.rotation.y = Math.atan2(this.camPos.x-s.position.x,this.camPos.z-s.position.z);
    } else if (this.starState === 'inspect') {
      s.position.lerp(this.inspect.anchor, 1 - Math.exp(-8 * dt));
      s.rotation.y = dampAngle(s.rotation.y, Math.atan2(this.camPos.x-s.position.x,this.camPos.z-s.position.z) + this.inspect.yaw, 10, dt);
      s.rotation.x += (this.inspect.pitch - s.rotation.x) * Math.min(1, 10 * dt);
      s.rotation.z *= 1 - Math.min(1, 8 * dt);
    } else if (this.starState === 'carried') {
      L.intensity += (0.7 - L.intensity) * Math.min(1, 4 * dt);
      const side=new THREE.Vector3(Math.cos(this.p.yaw),0,-Math.sin(this.p.yaw));
      const goal = this.inspect.anchor.clone().addScaledVector(side,-.28);
      goal.y-=.05;
      s.position.lerp(goal, 1 - Math.exp(-6 * dt));
      s.rotation.y=Math.atan2(this.camPos.x-s.position.x,this.camPos.z-s.position.z);
      s.rotation.x *= 1 - Math.min(1, 5 * dt);
    } else if (this.starState === 'placed') {
      L.intensity += (1.6 - L.intensity) * Math.min(1, 3 * dt);
      s.position.y = this.world.baseTop.y + 0.34 + Math.sin(this.time * 1.5) * 0.035;
      s.rotation.y=.5+Math.sin(this.time*.6)*.12;
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
      this.star.userData.star.material.emissiveIntensity=.22+k*.88;
      this.star.userData.light.intensity=.4+k*3.35;
      this.star.userData.halo.material.opacity=.1+k*.48;
      this.world.baseLight.intensity=.35+k*3;
      if(this.awakenT>=3.6){this.state='finale';this.starState='placed';this.lampTimer=0;this.audio.setLayer(2);}
      return;
    }
    // 安放动画
    if (this.state === 'placing') {
      this.placeT += dt;
      const k = THREE.MathUtils.smoothstep(this.placeT, .35, 2.15);
      const to = this.world.baseTop.clone().add(new THREE.Vector3(0, .34, 0));
      const mid = this.placeFrom.clone().lerp(to, k);
      mid.y += Math.sin(k * Math.PI) * .42;
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
          this.pullbackT = 0;
        }
      }
      // 灯的渐变
      for (const lamp of this.world.lamps) {
        if (lamp.lit > 0 && lamp.lit < 1.01) {
          lamp.lit = Math.min(1.01, lamp.lit + dt * 1.6);
          const k = Math.min(lamp.lit, 1);
          lamp.bulbMat.emissiveIntensity = 0.06 + k * 1.6;
          lamp.glow.material.opacity = k * 0.85;
          lamp.pool.material.opacity = k * 0.75;
        }
      }
      this.world.baseLight.intensity = 2.8;
      // 拉镜完成后出信
      if (this.pullbackT >= 0) {
        this.pullbackT += dt;
        if (this.pullbackT > 5.3 && this.letterT < 0) {
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
    const k = dt ? 1 - Math.exp(-3.2 * dt) : 1;
    let goalPos, goalLook;
    if (this.state === 'inspect' || this.state==='pickup') {
      const center=this.p.pos.clone().lerp(this.f.pos,.52);
      const axis=new THREE.Vector3().subVectors(this.f.pos,this.p.pos).setY(0).normalize();
      const side=new THREE.Vector3(-axis.z,0,axis.x);
      goalPos=center.clone().addScaledVector(side,5.35).add(new THREE.Vector3(0,2.15,0));
      goalLook=center.add(new THREE.Vector3(0,.92,0));
    } else if(this.state==='gag') {
      const axis=new THREE.Vector3().subVectors(this.f.pos,this.p.pos).setY(0).normalize();
      const side=new THREE.Vector3(-axis.z,0,axis.x);
      goalPos=this.f.pos.clone().addScaledVector(axis,-4.25).addScaledVector(side,1.25).add(new THREE.Vector3(0,1.65,0));
      goalLook=this.f.pos.clone().add(new THREE.Vector3(0,.52,0));
    } else if(['placing','awakening'].includes(this.state) || (this.state==='finale' && this.pullbackT<0)) {
      goalPos=this.world.basePos.clone().add(new THREE.Vector3(3.4,2.5,8));
      goalLook=this.world.baseTop.clone().add(new THREE.Vector3(-.4,-.1,1.2));
    } else if ((this.state === 'finale' || this.state === 'letter') && this.pullbackT >= 0) {
      // 拉镜：升到能看见整条路、两串足迹与小院的广角
      const t = Math.min(this.pullbackT / 4.8, 1);
      const e = t * t * (3 - 2 * t);
      const b = this.world.basePos;
      const near = this.p.pos.clone().add(new THREE.Vector3(0, 2.9, 4.4));
      const far = new THREE.Vector3(b.x + 14, 18, b.z + 30);
      goalPos = near.lerp(far, e);
      goalLook = new THREE.Vector3(b.x, 1.0, b.z).lerp(new THREE.Vector3(1.0, 0.1, -17), e);
    } else {
      // 跟随：路径方向后上方，半固定
      const pr = Math.max(0.02, this._progress(this.p.pos));
      const tangent = this.world.path.curve.getTangentAt(Math.min(pr, 0.99));
      if (pr < .13 && this.starState === 'ground') {
        const center = this.p.pos.clone().lerp(this.starGroundPos, .46);
        const back = tangent.clone().multiplyScalar(-5.1);
        back.y = 2.45;
        back.x += .55;
        goalPos = center.clone().add(back);
        goalLook = center.add(new THREE.Vector3(0, .62, 0));
      } else {
        const back = tangent.clone().multiplyScalar(-4.8);
        back.y = 2.65;
        back.x += 2.75;
        goalPos = this.p.pos.clone().add(back);
        goalLook = this.p.pos.clone().add(tangent.clone().multiplyScalar(2.4)).add(new THREE.Vector3(0, 0.78, 0));
      }
    }
    const framing=THREE.MathUtils.clamp(.82/camera.aspect,1,1.7);
    goalPos.sub(goalLook).multiplyScalar(framing).add(goalLook);
    if (!this.camInit) {
      this.camPos.copy(goalPos);
      this.camLook.copy(goalLook);
      this.camInit = true;
    } else {
      this.camPos.lerp(goalPos, k);
      this.camLook.lerp(goalLook, k);
    }
    camera.position.copy(this.camPos);
    camera.lookAt(this.camLook);
  }

  // —— UI 同步（每步调用，DOM 只在变化时写）——
  _syncUi() {
    const nearStar = this.starState === 'ground' && this.p.pos.distanceTo(this.starGroundPos) < 2.2;
    const nearBase = this.starState === 'carried' && this.p.pos.distanceTo(this.world.basePos) < 2.65;
    if (!this.ui) return;
    this.ui.setPrompt(
      this.state === 'walk' && nearStar ? '拾起星星' :
      this.state === 'walk' && nearBase ? '安放星星' : null,
    );
    this.ui.setInspect(this.state === 'inspect', this.config, Math.abs(Math.sin(this.inspect.yaw/2))>.7);
    this.ui.setJourney(
      this.state==='walk' && !nearStar && !nearBase && this.time >= this.toastUntil,
      this.starState === 'ground' ? '轻点雪路，朝前方那团暖光走' : '轻点雪路，跟着小狐狸慢慢走',
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
    {t:.4,intent:{type:'start'}},{t:.8,intent:{type:'approach'}},
    {t:4.4,intent:{type:'pickup'}},{t:9,intent:{type:'flip'}},
    {t:12,intent:{type:'continue'}}, route(12.5,.20),
    route(19,.43),route(24,.60),route(36,.72),route(44,.88),route(49,.99),
    {t:56,intent:{type:'place'}},
  ];
}
