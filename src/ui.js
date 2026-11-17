// DOM 界面：封面 / 操作提示 / 检视面板 / 途中话语 / 信件 / 结束卡 / 声音控制。
// 文案全部来自配置；不出现占位括号；DOM 更新幂等（值不变不写）。
export class UI {
  constructor({ config, source, auto, onIntent, audio }) {
    this.config = config;
    this.audio = audio;
    this.onIntent = onIntent;
    this._cache = {};
    this.root = document.getElementById('ui');
    this.root.innerHTML = '';
    this._buildCover(auto);
    this._buildPrompt();
    this._buildInspect();
    this._buildToast();
    this._buildLetter();
    this._buildControls();
    this._buildBadge(source);
    this._buildFade(auto);
  }

  _el(tag, cls, parent, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    (parent || this.root).appendChild(e);
    return e;
  }

  _buildCover(auto) {
    this.cover = this._el('div', 'cover');
    const box = this._el('div', 'cover-box', this.cover);
    this._el('div', 'cover-kicker', box, '一 份 冬 日 礼 物');
    this._el('h1', 'cover-title', box, `给 ${esc(this.config.toName)} 的<br>一场雪夜迎接`);
    this._el('p', 'cover-sub', box, '有人托了一颗星星来接你。<br>路不长，跟着它走就好。');
    const btn = this._el('button', 'btn-primary', box, '开启这份礼物');
    btn.addEventListener('click', () => {
      this.audio.start();
      this.onIntent({ type: 'start' });
      this.cover.classList.add('hide');
    });
    if (auto) this.cover.style.display = 'none';
  }

  _buildPrompt() {
    this.prompt = this._el('button', 'prompt hide');
    this.prompt.addEventListener('click', () => {
      const label = this.prompt.textContent;
      if (label === '拾起星星') this.onIntent({ type: 'pickup' });
      else if (label === '安放星星') this.onIntent({ type: 'place' });
    });
  }

  _buildInspect() {
    this.inspectPanel = this._el('div', 'inspect hide');
    const card = this._el('div', 'note-card', this.inspectPanel);
    this._el('div', 'note-text', card, esc(this.config.note));
    this._el('div', 'note-sign', card, `—— ${esc(this.config.fromName)}`);
    const row = this._el('div', 'inspect-actions', this.inspectPanel);
    const flip = this._el('button', 'btn-ghost', row, '翻面看看');
    flip.addEventListener('click', () => this.onIntent({ type: 'flip' }));
    const go = this._el('button', 'btn-primary small', row, '继续走');
    go.addEventListener('click', () => this.onIntent({ type: 'continue' }));
    this._el('div', 'inspect-hint', this.inspectPanel, '拖动可以转动星星');
  }

  _buildToast() {
    this.toastEl = this._el('div', 'toast hide');
    this._toastTimer = null;
  }

  _buildLetter() {
    this.letter = this._el('div', 'letter hide');
    const paper = this._el('div', 'letter-paper', this.letter);
    // 买家整封重写时信里可能已带称呼，避免重复
    const firstLine = this.config.letter.trimStart().slice(0, 12);
    if (!firstLine.includes(this.config.toName)) {
      this._el('div', 'letter-to', paper, `${esc(this.config.toName)}：`);
    }
    const body = this._el('div', 'letter-body', paper);
    body.textContent = this.config.letter;
    const close = this._el('button', 'btn-primary small', paper, '收好这封信');
    close.addEventListener('click', () => {
      this.letter.classList.add('hide');
      this._showEnd();
    });
  }

  _showEnd() {
    if (this.end) { this.end.classList.remove('hide'); return; }
    this.end = this._el('div', 'end');
    const box = this._el('div', 'end-box', this.end);
    this._el('div', 'end-title', box, '灯亮了，路也记住了');
    this._el('p', 'end-sub', box, '这是 30–45 秒样片：拾星、检视、带路—折返—并肩、脚印与足音、点灯与信件均已跑通。<br>完整版将扩展场景与音乐分层。');
    const row = this._el('div', 'end-links', box);
    const a = this._el('a', '', row, '样片配置 A');
    a.href = '#demo=a';
    const b = this._el('a', '', row, '样片配置 B');
    b.href = '#demo=b';
    const again = this._el('a', '', row, '再走一遍');
    again.href = location.pathname + location.search;
    for (const link of [a, b, again]) link.addEventListener('click', () => location.reload());
  }

  _buildControls() {
    const bar = this._el('div', 'sound-bar');
    this.muteBtn = this._el('button', 'icon-btn', bar, '🔊');
    this.muteBtn.title = '静音 / 取消静音';
    this.muteBtn.addEventListener('click', () => {
      this.audio.start();
      const m = !this.audio.muted;
      this.audio.setMuted(m);
      this.muteBtn.textContent = m ? '🔇' : '🔊';
    });
    const mk = (label, fn, v) => {
      const wrap = this._el('label', 'vol', bar, `<span>${label}</span>`);
      const input = document.createElement('input');
      input.type = 'range'; input.min = 0; input.max = 1; input.step = 0.01; input.value = v;
      input.addEventListener('input', () => fn(Number(input.value)));
      wrap.appendChild(input);
    };
    mk('音乐', (v) => this.audio.setMusicLevel(v), this.audio.musicLevel);
    mk('音效', (v) => this.audio.setSfxLevel(v), this.audio.sfxLevel);
  }

  _buildBadge(source) {
    const name = source === 'demo-b' ? 'B' : source === 'demo-a' ? 'A' : '定制';
    this.badge = this._el('div', 'badge', this.root, `样片配置 ${name} · <a href="#demo=a">A</a> / <a href="#demo=b">B</a>`);
    this.badge.querySelectorAll('a').forEach((a) =>
      a.addEventListener('click', () => location.reload()));
  }

  _buildFade() {
    // 入场淡入只保留 canvas 侧（场景本身有暗色背景），不做墙钟 DOM 遮罩——
    // 冻结帧必须是 t 的纯函数，CSS 淡入会污染截图。
  }

  // —— 每帧同步接口（幂等）——
  setPrompt(label) {
    this._toggle(this.prompt, !!label);
    if (label && this._cache.prompt !== label) {
      this._cache.prompt = label;
      this.prompt.textContent = label;
    }
  }

  setInspect(active, config) {
    this._toggle(this.inspectPanel, active);
  }

  toast(text, secs) {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hide');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.add('hide'), secs * 1000);
  }

  setToast(text) {
    const show = !!text;
    const cur = !this.toastEl.classList.contains('hide');
    if (cur === show) return;
    if (show) this.toastEl.textContent = text;
    this.toastEl.classList.toggle('hide', !show);
  }

  resetTransient() {
    this.letter.classList.add('hide');
    this.toastEl.classList.add('hide');
    clearTimeout(this._toastTimer);
    this.setPrompt(null);
    this.setInspect(false);
    if (this.end) this.end.classList.add('hide');
  }

  showLetter() {
    this.letter.classList.remove('hide');
    this.letter.querySelector('.letter-paper').scrollTop = 0;
  }

  _toggle(el, show) {
    const key = el === this.prompt ? 'promptOn' : el === this.inspectPanel ? 'inspectOn' : '';
    const cur = !el.classList.contains('hide');
    if (cur !== show) el.classList.toggle('hide', !show);
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
