// 里世界的状态只在这里管理；所有入口先检查 active，表世界继续走原来的分支。
const hiddenWorld = {
  active: false,
  resetClicks: [],
  visualTime: 0,
  eyeSeed: 71839,
  stormSeed: 92817,
  eyes: [],
  pointer: { x: 0, y: 0, seen: false, inside: false, armed: false },
  textSwap: [],
  thunderEnabled: true,
  stormTime: 0,
  nextStorm: 3,
  flash: 0,
  bolt: [],
  branches: [],
  setup() {
    this.surfaceDescription = document.getElementById('world-description').textContent;
    this.surfaceAria = stage.getAttribute('aria-label');
    this.surfacePointerHint = document.getElementById('pointer-hint').textContent;
    this.surfaceShortcutHint = document.getElementById('shortcut-hint').textContent;
    const track = event => {
      const rect = canvasElement.getBoundingClientRect();
      const x = (event.clientX - rect.left) * width / rect.width;
      const y = (event.clientY - rect.top) * height / rect.height;
      if (Number.isFinite(x) && Number.isFinite(y)) {
        Object.assign(this.pointer, { x, y, seen: true, inside: x >= 0 && x <= width && y >= 0 && y <= height });
      }
    };
    canvasElement.addEventListener('pointermove', track);
    window.addEventListener('pointermove', track);
    canvasElement.addEventListener('pointerdown', event => {
      track(event);
      if (event.button === 0 && this.active && !timeline.rewinding) this.pointer.armed = true;
    });
    canvasElement.addEventListener('pointerleave', () => { this.pointer.inside = false; });
    window.addEventListener('blur', () => { this.pointer.inside = false; });
  },
  random(kind, min, max) {
    const key = `${kind}Seed`;
    this[key] = (Math.imul(this[key], 1664525) + 1013904223) >>> 0;
    return min + this[key] / 4294967296 * (max - min);
  },
  handleResetClick(now = performance.now()) {
    // 固定两秒窗口，从第一下开始计时；超时重新数，普通点击仍由原清空逻辑处理。
    if (!this.resetClicks.length || now < this.resetClicks[0] || now - this.resetClicks[0] > 2000) {
      this.resetClicks = [now];
    } else this.resetClicks.push(now);
    if (this.resetClicks.length < 5) return false;
    this.resetClicks = []; // 第五下只切换一次，不重复使用刚才的点击。
    this.active = !this.active;
    this.pointer.armed = false;
    this.textSwap = [];
    if (this.active) {
      this.surfaceShowWind = showWind;
      showWind = true;
      this.visualTime = 0;
      this.thunderEnabled = true;
      this.stormTime = 0;
      this.nextStorm = this.random('storm', 2.5, 5);
      this.flash = 0;
      this.bolt = [];
      this.branches = [];
      this.makeEyes();
    } else showWind = this.surfaceShowWind;
    this.syncUI();
    return true;
  },
  syncWindButton() {
    const button = document.getElementById('show-wind');
    button.setAttribute('aria-pressed', String(showWind));
    button.textContent = this.active ? (showWind ? '隐藏眼睛' : '看见眼睛') : (showWind ? '隐藏风向' : '看见风向');
  },
  syncUI() {
    document.body.classList.toggle('inner-world', this.active);
    document.getElementById('world-description').textContent = this.active
      ? '风仍在吹。只是这一次，有什么在黑暗里看着你。'
      : this.surfaceDescription;
    stage.setAttribute('aria-label', this.active
      ? '里世界画布：二十只眼睛追随鼠标，停留会闭眼。点按显示暗红文字，粒子避开鼠标，R 开关雷电，T 倒流，S 截图。'
      : this.surfaceAria);
    document.getElementById('pointer-hint').textContent = this.active
      ? '点按显字 · 鼠标靠近，暗红粒子退散' : this.surfacePointerHint;
    document.getElementById('shortcut-hint').textContent = this.active
      ? 'R：开关雷电 · 按住 T：卡带倒流 · S：截图。输入框编辑时不触发快捷键。'
      : this.surfaceShortcutHint;
    this.syncWindButton();
    weather.syncButton();
  },
  makeEyes() {
    this.eyes = [];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 5; col++) {
        this.eyes.push({ row, col, gazeX: 0, gazeY: 0, closure: 0, hoverTime: 0,
          blinkStart: -10, blinkAt: this.visualTime + this.random('eye', 0.5, 6) });
      }
    }
  },
  eyeGeometry(eye) {
    return { x: (eye.col + 0.5) * width / 5, y: (eye.row + 0.5) * height / 4,
      rx: Math.min(40, width / 5 * 0.29), ry: Math.min(18, height / 4 * 0.20) };
  },
  updateEyes(seconds) {
    if (!this.active) return;
    this.visualTime += seconds;
    for (const eye of this.eyes) {
      const { x, y, rx, ry } = this.eyeGeometry(eye);
      const dx = this.pointer.x - x, dy = this.pointer.y - y;
      const distance = Math.hypot(dx, dy) || 1;
      // 朝向由“眼睛中心到鼠标”的向量决定，再限制瞳孔移动量，防止眼珠跑出眼框。
      const reach = Math.min(1, distance / 110);
      const gazeX = this.pointer.seen ? dx / distance * rx * 0.35 * reach : 0;
      const gazeY = this.pointer.seen ? dy / distance * ry * 0.35 * reach : 0;
      const follow = 1 - Math.exp(-seconds * 10);
      eye.gazeX = lerp(eye.gazeX, gazeX, follow);
      eye.gazeY = lerp(eye.gazeY, gazeY, follow);
      const hovered = this.pointer.inside && (dx / rx) ** 2 + (dy / ry) ** 2 <= 1;
      eye.hoverTime = hovered ? eye.hoverTime + seconds : 0;
      if (this.visualTime >= eye.blinkAt) {
        eye.blinkStart = this.visualTime;
        eye.blinkAt = this.visualTime + this.random('eye', 2.2, 7);
      }
      const blinkAge = this.visualTime - eye.blinkStart;
      const blink = blinkAge >= 0 && blinkAge < 0.28 ? Math.sin(blinkAge / 0.28 * Math.PI) ** 2 : 0;
      const hover = Math.max(0, Math.min(1, (eye.hoverTime - 0.8) / 1.8));
      const target = Math.max(blink, hover * hover * (3 - 2 * hover));
      eye.closure = lerp(eye.closure, target, 1 - Math.exp(-seconds * (blink ? 24 : 5)));
    }
  },
  drawEyes() {
    const ctx = drawingContext;
    const light = this.flash / 0.24;
    for (const eye of this.eyes) {
      const { x, y, rx, ry } = this.eyeGeometry(eye);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, Math.max(0.025, 1 - eye.closure));
      ctx.beginPath();
      ctx.moveTo(-rx, 0);
      ctx.quadraticCurveTo(0, -ry * 1.7, rx, 0);
      ctx.quadraticCurveTo(0, ry * 1.7, -rx, 0);
      ctx.closePath();
      ctx.fillStyle = `rgba(${Math.round(52 + light * 110)},${Math.round(31 + light * 90)},${Math.round(36 + light * 90)},0.8)`;
      ctx.strokeStyle = `rgba(146,61,69,${0.35 + light * 0.45})`;
      ctx.lineWidth = 1;
      ctx.fill(); ctx.stroke(); ctx.clip();
      ctx.fillStyle = `rgba(${Math.round(95 + light * 95)},22,34,0.95)`;
      ctx.beginPath();
      ctx.ellipse(eye.gazeX, eye.gazeY, ry * 0.7, ry * 0.78, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#030103';
      ctx.beginPath();
      ctx.ellipse(eye.gazeX, eye.gazeY, Math.max(1.2, ry * 0.18), ry * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(227,182,185,${0.25 + light * 0.65})`;
      ctx.beginPath(); ctx.arc(eye.gazeX - 2, eye.gazeY - 3, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  },
  toggleThunder() { this.thunderEnabled = !this.thunderEnabled; weather.syncButton(); },
  updateStorm(seconds) {
    this.stormTime += seconds;
    this.flash = Math.max(0, this.flash - seconds);
    if (!this.thunderEnabled || this.stormTime < this.nextStorm) return;
    this.flash = 0.24;
    this.nextStorm = this.stormTime + this.random('storm', 3.5, 7);
    const startX = this.random('storm', width * 0.2, width * 0.8);
    this.bolt = [{ x: startX, y: 0 }];
    const length = this.random('storm', height * 0.6, height * 0.95);
    for (let i = 1; i <= 9; i++) {
      this.bolt.push({ x: startX + this.random('storm', -45, 45), y: length * i / 9 });
    }
    this.branches = [3, 6].map(index => [this.bolt[index],
      { x: this.bolt[index].x + this.random('storm', -60, 60), y: this.bolt[index].y + 28 }]);
  },
  applySceneShake() {
    if (reduceMotion) return;
    const jam = timeline.rewinding ? (Math.floor(this.visualTime * 7) % 3 === 0 ? 2.5 : 0.3) : 0;
    const amount = this.flash / 0.24 * 2 + jam;
    drawingContext.translate(Math.sin(this.visualTime * 83) * amount, Math.cos(this.visualTime * 97) * amount);
  },
  drawStorm() {
    if (this.flash <= 0) return;
    const ctx = drawingContext;
    const light = this.flash / 0.24;
    ctx.save();
    // 每次只闪一小段，且相隔数秒；减少动态效果时降低亮度并关闭震动。
    ctx.fillStyle = `rgba(219,205,217,${light * (reduceMotion ? 0.045 : 0.14)})`;
    ctx.fillRect(-5, -5, width + 10, height + 10);
    ctx.strokeStyle = `rgba(235,211,226,${light * 0.9})`;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#ab687e'; ctx.shadowBlur = 10;
    for (const path of [this.bolt, ...this.branches]) {
      if (!path.length) continue;
      ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y);
      for (const point of path.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
    ctx.restore();
  },
  pickTextSwap(glyphs) {
    this.textSwap = [];
    if (!this.active) return;
    const eligible = glyphs.filter(glyph => /[\p{L}\p{N}]/u.test(glyph.char));
    if (eligible.length < 2) return;
    const a = eligible[Math.floor(this.random('eye', 0, eligible.length))];
    const different = eligible.filter(glyph => glyph.index !== a.index && glyph.char !== a.char);
    const rest = different.length ? different : eligible.filter(glyph => glyph.index !== a.index);
    const b = rest[Math.floor(this.random('eye', 0, rest.length))];
    // 只交换两个显示槽位；字符、输入内容和语义顺序的数据不动。
    const dx = b.x + b.advance / 2 - a.x - a.advance / 2;
    const dy = b.y - a.y;
    this.textSwap = [{ index: a.index, x: dx, y: dy }, { index: b.index, x: -dx, y: -dy }];
  },
  textOffset(index) { return this.textSwap.find(swap => swap.index === index) || { x: 0, y: 0 }; },
  fearRadius() { return Math.min(180, width * 0.32, height * 0.45); },
  fearIsActive() { return this.active && this.pointer.armed && this.pointer.inside && !reduceMotion; },
  repelWind(x, y, base) {
    if (!this.fearIsActive()) return base;
    // 不再使用绕中心的切向速度，而是叠加从鼠标指向粒子的径向速度；离鼠标越近越害怕。
    const dx = x - this.pointer.x, dy = y - this.pointer.y;
    const distance = Math.hypot(dx, dy);
    const edge = Math.max(0, 1 - distance / this.fearRadius());
    const weight = edge * edge * (3 - 2 * edge);
    if (distance < 0.01) return { x: 5, y: 0 };
    return { x: base.x * (1 - weight) + dx / distance * weight * 5,
      y: base.y * (1 - weight) + dy / distance * weight * 5 };
  },
  spawnPosition(x, y) {
    if (!this.fearIsActive()) return { x, y };
    const dx = x - this.pointer.x, dy = y - this.pointer.y;
    const distance = Math.hypot(dx, dy);
    const radius = this.fearRadius() * 0.42;
    if (distance >= radius) return { x, y };
    const angle = distance > 0.1 ? Math.atan2(dy, dx) : this.random('eye', 0, Math.PI * 2);
    return { x: this.pointer.x + Math.cos(angle) * radius, y: this.pointer.y + Math.sin(angle) * radius };
  },
  clipFearHole() {
    if (!this.fearIsActive()) return;
    // 只裁掉彩雾层的中心区域，保留后面的眼睛和文字，形成真正空出来的洞。
    const ctx = drawingContext;
    ctx.beginPath(); ctx.rect(0, 0, width, height);
    ctx.moveTo(this.pointer.x + this.fearRadius() * 0.29, this.pointer.y);
    ctx.arc(this.pointer.x, this.pointer.y, this.fearRadius() * 0.29, 0, Math.PI * 2);
    ctx.clip('evenodd');
  },
  brokenTimestamp() {
    const n = reduceMotion ? 0 : Math.floor(this.visualTime * 8);
    return [25 + n % 65, 61 + n * 7 % 39, 70 + n * 13 % 30].map(value => String(value).padStart(2, '0')).join(':');
  },
  drawTapeJam(source) {
    if (reduceMotion || Math.floor(this.visualTime * 7) % 3 !== 0) return;
    const ctx = drawingContext;
    const y = Math.floor(height * (0.2 + Math.sin(this.visualTime * 5) * 0.12));
    const scale = source.height / height;
    ctx.save(); ctx.globalAlpha = 0.7;
    // 横向错开一小条画面，像卡带；它只改变渲染，不改变倒流记录。
    ctx.drawImage(source, 0, y * scale, source.width, 7 * scale, 8, y, width, 7);
    ctx.restore();
  },
  snapshot() {
    if (!this.active) return null;
    return { stormTime: this.stormTime, nextStorm: this.nextStorm, flash: this.flash,
      stormSeed: this.stormSeed, thunderEnabled: this.thunderEnabled,
      bolt: this.bolt.map(point => ({ ...point })), branches: this.branches.map(path => path.map(point => ({ ...point }))) };
  },
  restore(frame) {
    if (!this.active || !frame) return;
    Object.assign(this, frame);
    weather.syncButton();
  },
};
