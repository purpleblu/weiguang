// 雨只读取风向，不写入彩雾或旋涡；独立随机数避免干扰原粒子的随机序列。
const weather = {
  enabled: false, drops: [], ripples: [], spawnClock: 0, seed: 8147,
  setup() {
    document.getElementById('toggle-rain').addEventListener('click', () => this.toggle());
    this.syncButton();
  },
  random(min, max) {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return min + this.seed / 4294967296 * (max - min);
  },
  toggle() {
    if (timeline.rewinding) return;
    if (hiddenWorld.active) { hiddenWorld.toggleThunder(); return; }
    this.enabled = !this.enabled;
    this.syncButton();
  },
  syncButton() {
    const button = document.getElementById('toggle-rain');
    if (hiddenWorld.active) {
      button.setAttribute('aria-pressed', String(hiddenWorld.thunderEnabled));
      button.textContent = hiddenWorld.thunderEnabled ? '停雷 · R' : '打雷 · R';
      return;
    }
    button.setAttribute('aria-pressed', String(this.enabled));
    button.textContent = this.enabled ? '停雨 · R' : '下雨 · R';
  },
  update(seconds) {
    if (this.enabled) {
      this.spawnClock += seconds * 85;
      while (this.spawnClock >= 1) {
        this.spawnClock -= 1;
        if (this.drops.length >= 240) break;
        const speed = this.random(280, 440);
        this.drops.push({ x: this.random(-width * 0.15, width * 1.15), y: this.random(-45, -4),
          vx: 0, vy: speed, speed, length: this.random(11, 23), alpha: this.random(0.13, 0.32) });
      }
      this.spawnClock = Math.min(1, this.spawnClock);
    } else this.spawnClock = 0;
    for (const ripple of this.ripples) ripple.age += seconds;
    this.ripples = this.ripples.filter(ripple => ripple.age < 1.1);
    const live = [];
    for (const drop of this.drops) {
      const beforeX = drop.x;
      const beforeY = drop.y;
      // 相邻风格的向量平滑混合，再叠加下落速度；雨随风倾斜，但仍保持向下落。
      const wind = windGridVector(drop.x, drop.y);
      const follow = 1 - Math.exp(-seconds * 4);
      drop.vx = lerp(drop.vx, Math.max(-180, Math.min(180, wind.x * 105)), follow);
      drop.vy = lerp(drop.vy, Math.max(140, drop.speed + wind.y * 65), follow);
      drop.x += drop.vx * seconds;
      drop.y += drop.vy * seconds;
      if (drop.y >= height - 4) {
        const t = Math.max(0, Math.min(1, (height - 4 - beforeY) / Math.max(0.001, drop.y - beforeY)));
        const x = lerp(beforeX, drop.x, t);
        if (x >= 0 && x <= width) this.ripples.push({ x, y: height - 4, age: 0 });
      } else if (drop.x > -100 && drop.x < width + 100) live.push(drop);
    }
    this.drops = live;
    if (this.ripples.length > 120) this.ripples.splice(0, this.ripples.length - 120);
  },
  draw() {
    const ctx = drawingContext;
    ctx.save();
    ctx.lineWidth = 0.8;
    for (const drop of this.drops) {
      const speed = Math.hypot(drop.vx, drop.vy) || 1;
      ctx.strokeStyle = `rgba(178,203,231,${drop.alpha})`;
      ctx.beginPath();
      ctx.moveTo(drop.x - drop.vx / speed * drop.length, drop.y - drop.vy / speed * drop.length);
      ctx.lineTo(drop.x, drop.y);
      ctx.stroke();
    }
    for (const ripple of this.ripples) {
      const progress = ripple.age / 1.1;
      const radius = 2 + progress * 27;
      // 扁椭圆逐渐扩大、变透明，表现雨滴落地后晕开的水纹。
      ctx.strokeStyle = `rgba(180,204,230,${0.2 * Math.pow(1 - progress, 1.5)})`;
      ctx.beginPath();
      ctx.ellipse(ripple.x, ripple.y, radius, radius * 0.17, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  },
  snapshot() {
    const drops = new Float32Array(this.drops.length * 7);
    this.drops.forEach((d, i) => drops.set([d.x, d.y, d.vx, d.vy, d.speed, d.length, d.alpha], i * 7));
    const ripples = new Float32Array(this.ripples.length * 3);
    this.ripples.forEach((r, i) => ripples.set([r.x, r.y, r.age], i * 3));
    return { enabled: this.enabled, seed: this.seed, spawnClock: this.spawnClock, drops, ripples };
  },
  restore(frame) {
    this.enabled = frame.enabled; this.seed = frame.seed; this.spawnClock = frame.spawnClock;
    this.drops = []; this.ripples = [];
    for (let i = 0; i < frame.drops.length; i += 7) {
      const d = frame.drops;
      this.drops.push({ x: d[i], y: d[i+1], vx: d[i+2], vy: d[i+3], speed: d[i+4], length: d[i+5], alpha: d[i+6] });
    }
    for (let i = 0; i < frame.ripples.length; i += 3) {
      this.ripples.push({ x: frame.ripples[i], y: frame.ripples[i+1], age: frame.ripples[i+2] });
    }
    this.syncButton();
  },
  reset() { this.drops = []; this.ripples = []; this.spawnClock = 0; },
};
