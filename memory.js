// 文字单独保存轨迹：松开倒流只冻结字，雨和彩雾继续运动。
const memory = {
  text: '', glyphs: [], templates: [], points: new Float32Array(0), history: [],
  age: 0, visible: false, paused: false, finished: false, recordClock: 0,
  fadeDuration: 0.8,
  get scatterStart() { return this.fadeDuration + 2; },
  entranceOpacity() {
    const t = Math.max(0, Math.min(1, this.age / this.fadeDuration));
    // 缓入缓出：开头与结尾都放慢，让字像从雾里浮出来，而非匀速变亮。
    return t * t * (3 - 2 * t);
  },
  setup() {
    const input = document.getElementById('memory-text');
    try {
      const saved = localStorage.getItem('mist-memory-text-v1');
      if (saved !== null && saved !== '有些记忆，只在风停的时候出现。') input.value = saved.slice(0, 80);
    } catch { /* 禁止本地存储时仍可编辑。 */ }
    this.text = input.value;
    input.addEventListener('input', () => {
      this.text = input.value;
      this.paintText();
      this.reset();
      try { localStorage.setItem('mist-memory-text-v1', this.text); } catch { /* 本次仍生效。 */ }
    });
    this.resize();
  },
  resize() { this.paintText(); this.reset(); },
  paintText() {
    this.glyphs = [];
    this.templates = [];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let size = Math.min(28, width * 0.06);
    let lines;
    let spacing;
    const measure = value => {
      const chars = Array.from(value);
      return chars.reduce((sum, char) => sum + ctx.measureText(char).width, 0)
        + Math.max(0, chars.length - 1) * spacing;
    };
    do {
      this.font = `300 ${size}px DengXian, "Microsoft YaHei", "PingFang SC", sans-serif`;
      ctx.font = this.font;
      spacing = size * 0.13;
      lines = [];
      let line = '';
      for (const char of Array.from(this.text)) {
        if (line && measure(line + char) > width * 0.78) { lines.push(line); line = char; }
        else line += char;
      }
      if (line) lines.push(line);
      if (lines.length * size * 1.9 <= height * 0.68 || size <= 12) break;
      size -= 1;
    } while (true);
    this.fontSize = size;
    const candidates = [];
    lines.forEach((line, row) => {
      let x = (width - measure(line)) / 2;
      const y = height / 2 + (row - (lines.length - 1) / 2) * size * 1.9;
      for (const char of Array.from(line)) {
        const glyph = { char, x, y, index: this.glyphs.length, advance: ctx.measureText(char).width + spacing };
        this.glyphs.push(glyph);
        // 每个字单独画到隐藏画布，从有笔画的像素取点；空白处不会凭空生成碎片。
        canvas.width = Math.ceil(size * 1.8);
        canvas.height = Math.ceil(size * 2.4);
        ctx.font = this.font;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        const padding = size * 0.2;
        ctx.fillText(char, padding, canvas.height / 2);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const samples = [];
        for (let py = 1; py < canvas.height; py += 2) {
          for (let px = 1; px < canvas.width; px += 2) {
            // 每个 2×2 小格取最实的笔画像素，细字横竖笔画也不容易漏采。
            let hitX = px, hitY = py, alpha = 0;
            for (let sy = py; sy < Math.min(py + 2, canvas.height); sy++) {
              for (let sx = px; sx < Math.min(px + 2, canvas.width); sx++) {
                const value = pixels[(sy * canvas.width + sx) * 4 + 3];
                if (value > alpha) { alpha = value; hitX = sx; hitY = sy; }
              }
            }
            if (alpha > 60) samples.push({ x: x + hitX - padding,
              y: y + hitY - canvas.height / 2, glyph: glyph.index });
          }
        }
        candidates.push(samples);
        x += glyph.advance;
      }
    });
    // 每个字分到采样预算，长句也能完整碎散；总碎片数不超过 2200。
    const budget = Math.max(1, Math.floor(2200 / Math.max(1, this.glyphs.length)));
    for (const samples of candidates) {
      const count = Math.min(budget, samples.length);
      for (let i = 0; i < count; i++) this.templates.push(samples[Math.floor(i * samples.length / count)]);
    }
    this.endAge = this.scatterStart + Math.max(0, this.glyphs.length - 1) * 0.045 + 4.5;
  },
  trigger() {
    this.reset();
    if (!this.text.trim()) return;
    this.visible = true;
    hiddenWorld.pickTextSwap(this.glyphs);
    this.points = new Float32Array(this.templates.length * 4);
    this.templates.forEach((point, i) => {
      const shift = hiddenWorld.active ? hiddenWorld.textOffset(point.glyph) : { x: 0, y: 0 };
      this.points.set([point.x + shift.x, point.y + shift.y,
        Math.cos(i * 2.399) * 8, Math.sin(i * 2.399) * 8], i * 4);
    });
    this.saveFrame();
  },
  update(seconds) {
    if (!this.visible || this.paused || this.finished) return;
    this.age = Math.min(this.endAge, this.age + seconds);
    this.templates.forEach((template, i) => {
      // 先淡入，完全显现后停留两秒，随后每隔 45 毫秒碎掉下一个字。
      if (this.age <= this.scatterStart + template.glyph * 0.045 || reduceMotion) return;
      const offset = i * 4;
      const wind = windVelocity(this.points[offset], this.points[offset + 1]);
      const follow = 1 - Math.exp(-seconds * 1.8);
      this.points[offset + 2] = lerp(this.points[offset + 2], wind.x * 32 + Math.cos(i * 2.399) * 5, follow);
      this.points[offset + 3] = lerp(this.points[offset + 3], wind.y * 32 + Math.sin(i * 2.399) * 5, follow);
      this.points[offset] += this.points[offset + 2] * seconds;
      this.points[offset + 1] += this.points[offset + 3] * seconds;
    });
    this.recordClock += seconds;
    if (this.recordClock >= 1 / 30 || this.age >= this.endAge) {
      this.recordClock %= 1 / 30;
      this.saveFrame();
    }
    this.finished = this.age >= this.endAge;
  },
  draw() {
    if (!this.visible) return;
    const ctx = drawingContext;
    ctx.save();
    ctx.font = this.font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const tint = ctx.createLinearGradient(width * 0.15, 0, width * 0.85, height);
    tint.addColorStop(0, hiddenWorld.active ? '#491015' : '#bac9f4');
    tint.addColorStop(0.5, hiddenWorld.active ? '#8a202a' : '#d6c6ed');
    tint.addColorStop(1, hiddenWorld.active ? '#441016' : '#a1d9dc');
    ctx.fillStyle = tint;
    ctx.shadowColor = hiddenWorld.active ? 'rgba(121,25,39,0.4)' : 'rgba(174,186,255,0.35)';
    ctx.shadowBlur = this.fontSize * 0.32;
    for (const glyph of this.glyphs) {
      const broken = Math.max(0, Math.min(1, (this.age - this.scatterStart - glyph.index * 0.045) / 0.3));
      ctx.globalAlpha = (1 - broken) * 0.85 * this.entranceOpacity();
      const shift = hiddenWorld.active ? hiddenWorld.textOffset(glyph.index) : { x: 0, y: 0 };
      if (ctx.globalAlpha > 0) ctx.fillText(glyph.char, glyph.x + shift.x, glyph.y + shift.y);
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = hiddenWorld.active ? '#78212c' : '#c5d0ef';
    this.templates.forEach((template, i) => {
      const age = this.age - this.scatterStart - template.glyph * 0.045;
      if (age <= 0 || age >= 4.5) return;
      ctx.globalAlpha = Math.min(1, age / 0.3) * Math.max(0, 1 - Math.max(0, age - 2) / 2.5) * 0.85;
      const offset = i * 4;
      ctx.beginPath();
      ctx.arc(this.points[offset], this.points[offset + 1], 0.8, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  },
  saveFrame() {
    this.history.push({ age: this.age, points: this.points.slice() });
    // 最长 80 字的一轮演出不到 11 秒；保留起点，限制历史占用。
    if (this.history.length > 330) this.history.splice(1, 1);
  },
  canRewind() { return this.history.length > 1; },
  beginRewind() {
    this.rewindCursor = this.age;
    if (!this.history.length) return;
    // 倒流最远回到整句完全显现的一刻，不让拼好的文字继续倒成透明。
    // 淡入未结束时就倒流，则保留当前浅色状态，避免突然跳亮。
    const floor = Math.min(this.age, this.fadeDuration);
    const home = this.history[0].points;
    this.history = this.history.filter(frame => frame.age >= floor);
    if (!this.history.length || this.history[0].age > floor) {
      this.history.unshift({ age: floor, points: home.slice() });
    }
  },
  rewind(seconds) {
    if (!this.canRewind()) return;
    this.rewindCursor -= seconds;
    let changed = false;
    while (this.history.length > 1 && this.history[this.history.length - 1].age > this.rewindCursor) {
      this.history.pop();
      changed = true;
    }
    if (changed) {
      const frame = this.history[this.history.length - 1];
      this.age = frame.age;
      this.points = frame.points.slice();
      this.finished = false;
    }
  },
  endRewind() {
    // 松开后冻结字的年龄、位置、透明度；下次点按才重新开始碎散。
    if (this.visible) this.paused = true;
  },
  reset() {
    this.age = 0; this.visible = false; this.paused = false; this.finished = false;
    this.points = new Float32Array(0); this.history = []; this.recordClock = 0;
  },
};
