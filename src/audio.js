// 程序化音频：无音频素材、无授权风险。WebAudio 生成冬夜钢琴/钟琴质感的
// 分层 BGM 与脚步/反馈音效。首次手势解锁；BGM 与音效独立音量；后台暂停。
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.muted = false;
    this.musicLevel = 0.45;
    this.sfxLevel = 0.48;
    this.layer = 0; // 0 开场稀疏 1 同行增层 2 点灯提升 3 读信回落
    this._timer = null;
    this._nextNoteTime = 0;
    this._beat = 0;
  }

  // 必须在用户手势里调用
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 1;
    this.master.connect(c.destination);
    this.musicBus = c.createGain();
    this.musicBus.gain.value = this.musicLevel * 0.5;
    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = this.sfxLevel;
    // 生成的混响脉冲
    this.verb = c.createConvolver();
    this.verb.buffer = this._impulse(2.2, 2.5);
    this.verbGain = c.createGain();
    this.verbGain.gain.value = 0.35;
    this.musicBus.connect(this.verb);
    this.verb.connect(this.verbGain);
    this.verbGain.connect(this.master);
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);

    // 脚步噪声缓冲
    this.noiseBuf = this._noise(0.3);

    this.enabled = true;
    this._nextNoteTime = c.currentTime + 0.1;
    this._beat = 0;
    this._timer = setInterval(() => this._schedule(), 180);

    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else if (!this.muted) this.ctx.resume();
    });
  }

  setMuted(m) {
    this.muted = m;
    if (!this.ctx) return;
    if (m) this.ctx.suspend(); else this.ctx.resume();
  }
  setMusicLevel(v) { this.musicLevel = v; if (this.musicBus) this.musicBus.gain.setTargetAtTime(v * 0.5, this.ctx.currentTime, 0.1); }
  setSfxLevel(v) { this.sfxLevel = v; if (this.sfxBus) this.sfxBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); }
  setLayer(l) { this.targetLayer = l; if(!this.ctx)this.layer=l; }

  _impulse(dur, decay) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let seed = 1234;
      for (let i = 0; i < len; i++) {
        seed = (seed * 16807) % 2147483647;
        d[i] = (seed / 2147483647 * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  _noise(dur) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let seed = 777;
    for (let i = 0; i < len; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = seed / 2147483647 * 2 - 1;
    }
    return buf;
  }

  // —— BGM：A 小调五声（A C D E G）冬夜旋律。慢速、稀疏、可预测地推进 ——
  _schedule() {
    if (!this.enabled || this.muted) return;
    const c = this.ctx;
    const BEAT = 1.08; // 读信更慢
    while (this._nextNoteTime < c.currentTime + 0.6) {
      if(this._beat%8===0 && this.targetLayer!==undefined)this.layer=this.targetLayer;
      this.layerMix=(this.layerMix??0)+((this.layer===2?1:0)-(this.layerMix??0))*.16;
      this._playBeat(this._nextNoteTime, this._beat);
      this._nextNoteTime += BEAT;
      this._beat++;
    }
  }

  _playBeat(t, beat) {
    // 固定旋律型（确定性，不用随机）：主音型 + 偶尔高音点缀
    const scale = [220, 261.63, 293.66, 329.63, 392]; // A3 C4 D4 E4 G4
    const melody = [0, -1, 2, -1, 3, -1, 1, -1, 4, -1, 2, -1, 3, -1, 1, -1];
    const idx = melody[beat % melody.length];
    if (idx >= 0) {
      const oct = 1;
      this._pluck(scale[idx] * oct, t, 0.075, 2.8);
    }
    // 层 1（同行）：每 4 拍一个轻柔五度垫
    if (this.layer >= 1 && this.layer !== 3 && beat % 8 === 0) {
      this._pad(scale[(beat / 8) % 5 | 0] / 2, t, 3.2);
    }
    // 层 2（点灯）：短促明亮的分解和声
    if (this.layer === 2) {
      const arp = [0, 2, 4, 3];
      if (beat % 2 === 0) this._bell(scale[arp[(beat / 2) % 4 | 0]] * 2, t, 0.05*this.layerMix);
    }
    // 层 3（读信）：回到稀疏，只留低音
    if (this.layer === 3 && beat % 16 === 8) {
      this._pluck(scale[0] / 2, t, 0.12, 2.5);
    }
  }

  _pluck(freq, t, gain, dur) {
    const c = this.ctx;
    const o1 = c.createOscillator();
    o1.type = 'sine'; o1.frequency.value = freq;
    const o2 = c.createOscillator();
    o2.type = 'triangle'; o2.frequency.value = freq * 2.001;
    const g = c.createGain();
    const g2 = c.createGain();
    g2.gain.value = 0.08;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.045);
    g.gain.exponentialRampToValueAtTime(0.0004, t + dur);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1300;
    o1.connect(g); o2.connect(g2); g2.connect(g);
    g.connect(lp); lp.connect(this.musicBus);
    o1.start(t); o2.start(t);
    o1.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  }

  _pad(freq, t, dur) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + dur * 0.4);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900;
    for (const mult of [1, 1.5, 2.003]) {
      const o = c.createOscillator();
      o.type = 'sine'; o.frequency.value = freq * mult;
      o.connect(g);
      o.start(t); o.stop(t + dur + 0.1);
    }
    g.connect(lp); lp.connect(this.musicBus);
  }

  _bell(freq, t, gain) {
    const c = this.ctx;
    const car = c.createOscillator();
    car.frequency.value = freq;
    const mod = c.createOscillator();
    mod.frequency.value = freq * 3.01;
    const mg = c.createGain();
    mg.gain.setValueAtTime(freq * .18, t);
    mg.gain.exponentialRampToValueAtTime(1, t + 0.4);
    mod.connect(mg); mg.connect(car.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0004, t + 1.2);
    car.connect(g); g.connect(this.musicBus);
    car.start(t); mod.start(t);
    car.stop(t + 1.3); mod.stop(t + 1.3);
  }

  // —— SFX ——
  // 脚步：who=player 稍沉，fox 轻且高。dist 用于狐狸远近衰减
  footstep(who, dist = 0) {
    if (!this.enabled) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = who === 'fox' ? 1.5 : 1.0;
    const bp = c.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.value = who === 'fox' ? 1400 : 950;
    bp.Q.value = 0.4;
    const g = c.createGain();
    const base = who === 'fox' ? 0.016 : 0.045;
    const att = 1 / (1 + dist * 0.35);
    g.gain.setValueAtTime(0.0001,t);
    g.gain.linearRampToValueAtTime(base*att,t+.025);
    g.gain.exponentialRampToValueAtTime(0.001, t + (who === 'fox' ? 0.12 : 0.20));
    src.connect(bp); bp.connect(g); g.connect(this.sfxBus);
    src.start(t);
    src.stop(t + 0.25);
  }

  chime() { // 拾起/翻面
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    this._bell(880, t, 0.05);
    this._bell(1318.5, t + 0.15, 0.025);
  }

  placeStar() { // 安放：更低更厚的一声
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    this._bell(440, t, 0.16);
    this._bell(659.3, t + 0.14, 0.12);
    this._bell(880, t + 0.3, 0.1);
  }

  lampPing(i) { // 逐盏点亮：音高递增
    if (!this.enabled) return;
    this._bell([440,523.25,587.33,659.25,783.99,880][i%6], this.ctx.currentTime, 0.025);
  }
}
