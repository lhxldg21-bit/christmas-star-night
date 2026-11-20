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
    this._buildNameKicker();
    this._buildLetter();
    this._buildControls();
    this._buildBadge(source);
    this._buildFade(auto);
    this.journey=this._el('button','journey-hint hide',null,'跟上小狐狸');
    this.journey.addEventListener('click', () => this.onIntent({ type: 'advance' }));
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
    this._el('p', 'cover-sub', box, '有人托小狐狸，带来一颗星星。<br>沿着雪路，有一盏灯在等你。');
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
    this.wishHint = this._el('div', 'wish-hint hide', null, '松手收好愿望，也可以轻点');
    this.wishHint.id = 'wish-hint';
    this.wishMeter = this._el('div', 'wish-meter hide');
    this.wishMeter.setAttribute('aria-hidden', 'true');
    this.wishFill = this._el('div', 'wish-fill', this.wishMeter);
    this.prompt.addEventListener('pointerdown', (event) => {
      if (event.button === 0 && this._cache.prompt === '长按许愿') {
        this.onIntent({ type: 'wish', active: true });
      }
    });
    const stopWishing = () => this.onIntent({ type: 'wish', active: false });
    this.prompt.addEventListener('pointercancel', stopWishing);
    this.prompt.addEventListener('pointerleave', stopWishing);
    this.prompt.addEventListener('pointerup', stopWishing);
    this.prompt.addEventListener('click', () => {
      const label = this.prompt.textContent;
      if (label === '拾起星星') this.onIntent({ type: 'pickup' });
      else if (label === '长按许愿') this.onIntent({ type: 'finish-wish' });
      else if (label === '走到台上') this.onIntent({ type: 'climb' });
      else if (label === '安放星星') this.onIntent({ type: 'place' });
    });
  }

  _buildInspect() {
    this.inspectPanel = this._el('div', 'inspect hide');
    const card = this._el('div', 'note-card', this.inspectPanel);
    this._el('div','note-kicker',card,'小狐狸带来的纸条');
    this.noteText=this._el('div', 'note-text', card, esc(this.config.note));
    this._el('div', 'note-sign', card, `—— ${esc(this.config.fromName)}`);
    const row = this._el('div', 'inspect-actions', this.inspectPanel);
    this.flipBtn = this._el('button', 'btn-primary small', row, '翻面看看');
    this.flipBtn.addEventListener('click', () => this.onIntent({ type: 'flip' }));
    this.goBtn = this._el('button', 'btn-ghost', row, '提着星星继续走');
    this.goBtn.addEventListener('click', () => this.onIntent({ type: 'continue' }));
    this.inspectHint = this._el('div', 'inspect-hint', this.inspectPanel, '背面好像还有一行字');
  }

  _buildToast() {
    this.toastEl = this._el('div', 'toast hide');
    this._toastTimer = null;
  }

  _buildNameKicker() {
    this.nameKicker = this._el('div', 'name-kicker hide');
  }

  setNameKicker(name) {
    if (!this.nameKicker) return;
    if (name) {
      const html = `给 <b>${esc(name)}</b> 的星星`;
      if (this.nameKicker.innerHTML !== html) this.nameKicker.innerHTML = html;
      this.nameKicker.classList.remove('hide');
    } else {
      this.nameKicker.classList.add('hide');
    }
  }

  _buildLetter() {
    this.letter = this._el('div', 'letter hide');
    this.envelope = this._el('div', 'letter-envelope', this.letter);
    this._el('p', 'envelope-to', this.envelope, `给 ${esc(this.config.toName)}`);
    const seal = this._el('button', 'letter-seal', this.envelope, '✦');
    seal.setAttribute('aria-label', '拆开这封信');
    this._el('p', 'envelope-hint', this.envelope, '点火漆拆信');
    const paper = this._el('div', 'letter-paper hide', this.letter);
    seal.addEventListener('click', () => {
      this.audio.chime();
      this.envelope.classList.add('hide');
      paper.classList.remove('hide');
      paper.scrollTop = 0;
      paper.focus({preventScroll: true});
    });
    paper.tabIndex = -1;
    // 买家整封重写时信里可能已带称呼，避免重复
    const firstLine = this.config.letter.trimStart().slice(0, 12);
    if (!firstLine.includes(this.config.toName)) {
      this._el('div', 'letter-to', paper, `${esc(this.config.toName)}：`);
    }
    const body = this._el('div', 'letter-body', paper);
    body.textContent = this.config.letter;
    const replies = this._el('div', 'reply-row letter-replies', paper);
    for (const [kind, text] of [['yes', '愿意'], ['think', '让我想想']]) {
      const choice = this._el('button', 'btn-ghost', replies, text);
      choice.addEventListener('click', () => {
        this.letter.classList.add('hide');
        this.onIntent({type: 'reply', kind});
      });
    }
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
    this._el('p','end-sub',box,'愿这一路的温柔，陪你走进下一个冬天。');
    const row = this._el('div', 'end-links', box);
    const again = this._el('a', '', row, '再走一遍');
    again.href = location.pathname + location.search + location.hash;
    again.addEventListener('click', () => location.reload());
  }

  showReply(kind, config) {
    if (!this.reply) {
      this.reply = this._el('div', 'reply');
      this._el('div', 'reply-box', this.reply);
    }
    this.reply.classList.remove('hide');
    const box = this.reply.querySelector('.reply-box');
    box.innerHTML = '';
    if (kind === 'yes') {
      this._el('div', 'reply-q', box, '灯为你亮着，路也记住了。');
      this._el('p', 'reply-sub', box, '愿这一路的温柔，陪你走进下一个冬天。');
    } else {
      this._el('div', 'reply-q', box, '没关系。灯会一直亮着。');
      this._el('p', 'reply-sub', box, '你想好了再来，狐狸和我都在。');
    }
    const row = this._el('div', 'reply-row', box);
    const save = this._el('button', 'btn-primary small', row, '保存这一刻');
    save.addEventListener('click', () => this._savePoster(config));
    const again = this._el('a', 'reply-again', row, '再走一遍');
    again.href = location.pathname + location.search + location.hash;
    again.addEventListener('click', () => location.reload());
  }

  _savePoster(config) {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const w = 1080, h = 1350;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0e1430'; ctx.fillRect(0, 0, w, h);
    const scale = Math.max(w / canvas.width, (h * 0.72) / canvas.height);
    const dw = canvas.width * scale, dh = canvas.height * scale;
    ctx.drawImage(canvas, (w - dw) / 2, 0, dw, dh);
    const grad = ctx.createLinearGradient(0, h * 0.6, 0, h);
    grad.addColorStop(0, 'rgba(14,20,48,0)'); grad.addColorStop(1, 'rgba(14,20,48,0.96)');
    ctx.fillStyle = grad; ctx.fillRect(0, h * 0.6, w, h * 0.4);
    ctx.fillStyle = '#ffd9a0'; ctx.textAlign = 'center';
    ctx.font = '600 64px "Songti SC","Noto Serif SC",serif';
    ctx.fillText(`给 ${config.toName} 的一场雪夜迎接`, w / 2, h * 0.82);
    ctx.fillStyle = '#cfd6ee'; ctx.font = '34px "Songti SC","Noto Serif SC",serif';
    ctx.fillText(config.starText, w / 2, h * 0.88);
    ctx.fillStyle = '#8b96b8'; ctx.font = '28px "Songti SC","Noto Serif SC",serif';
    ctx.fillText(`—— ${config.fromName} · ${new Date().toISOString().slice(0, 10)}`, w / 2, h * 0.93);
    const a = document.createElement('a');
    a.download = `snow-night-${config.toName}.png`;
    a.href = cv.toDataURL('image/png');
    a.click();
  }

  _buildControls() {
    const bar = this._el('details', 'sound-bar');
    this._el('summary','sound-toggle',bar,'声音');
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
    this.badge = this._el('div', 'badge hide', this.root, `样片配置 ${name} · <a href="#demo=a">A</a> / <a href="#demo=b">B</a>`);
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
    if (this._cache.prompt === label) return;
    this._cache.prompt = label;
    if (label) this.prompt.textContent = label;
    const canWish = label === '长按许愿';
    this._toggle(this.wishHint, canWish);
    if (canWish) this.prompt.setAttribute('aria-describedby', this.wishHint.id);
    else this.prompt.removeAttribute('aria-describedby');
  }

  setInspect(active, config=this.config, flipped=false, flippedOnce=false) {
    const text=flipped?config.starText:config.note;
    if(this.noteText.textContent!==text)this.noteText.textContent=text;
    this.inspectPanel.querySelector('.note-kicker').textContent=flipped?'星星背面的话':'小狐狸带来的纸条';
    if (this.flipBtn && this.goBtn) {
      this.flipBtn.className = flippedOnce ? 'btn-ghost' : 'btn-primary small';
      this.goBtn.className = flippedOnce ? 'btn-primary small' : 'btn-ghost';
      const hint = flippedOnce ? '把它收好，我们继续' : '背面好像还有一行字';
      if (this.inspectHint.textContent !== hint) this.inspectHint.textContent = hint;
    }
    this._toggle(this.inspectPanel, active);
  }

  setWishCharge(active, amount) {
    this._toggle(this.wishMeter, active);
    if (active) this.wishFill.style.transform = `scaleX(${amount})`;
  }

  setJourney(active, text) {
    if (!this.journey) return;
    if (text && this.journey.textContent !== text) this.journey.textContent = text;
    this.journey.classList.toggle('hide', !active);
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
    if (show && this.toastEl.textContent !== text) this.toastEl.textContent = text;
    if (cur === show) return;
    this.toastEl.classList.toggle('hide', !show);
  }

  resetTransient() {
    this.letter.classList.add('hide');
    this.toastEl.classList.add('hide');
    clearTimeout(this._toastTimer);
    this.setPrompt(null);
    this.setWishCharge(false, 0);
    this.setInspect(false);
    if (this.end) this.end.classList.add('hide');
    if (this.nameKicker) this.nameKicker.classList.add('hide');
    if (this.reply) this.reply.classList.add('hide');
  }

  showLetter() {
    this.letter.classList.remove('hide');
    this.envelope.classList.remove('hide');
    this.letter.querySelector('.letter-paper').classList.add('hide');
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
