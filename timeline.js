// 保存最近 8 秒的状态，再倒序取出来。恢复真实记录，而不是把风反过来吹。
const timeline = {
  frames: [],
  rewinding: false,
  recordClock: 0,
  cursor: 0,
  pointerId: null,
  setup() {
    this.button = document.getElementById('rewind');
    this.label = document.getElementById('time-state');
    this.button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || this.pointerId !== null) return;
      this.pointerId = event.pointerId;
      this.button.setPointerCapture(event.pointerId);
      this.begin();
      event.preventDefault();
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.button.addEventListener(name, event => {
        if (event.pointerId === this.pointerId) this.end();
      });
    }
    this.button.addEventListener('keydown', event => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        if (!event.repeat) this.begin();
      }
    });
    this.button.addEventListener('keyup', event => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        this.end();
      }
    });
    this.button.addEventListener('blur', () => this.end());
    window.addEventListener('blur', () => this.end());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.end();
    });
  },
  begin() {
    if (this.rewinding || (this.frames.length < 2 && !memory.canRewind())) return;
    this.rewinding = true;
    this.cursor = elapsed;
    vortex.active = false;
    vortex.pointerId = null;
    previousPointer = null;
    memory.beginRewind();
    this.button.setAttribute('aria-pressed', 'true');
    this.button.textContent = '正在倒流 · 松开继续';
    this.lockControls(true);
    document.getElementById('status').textContent = '正在倒流。松开后文字停在当前状态，雨和彩雾继续向前。';
  },
  end() {
    this.pointerId = null;
    if (!this.rewinding) return;
    this.rewinding = false;
    this.recordClock = 0;
    vortex.active = false;
    vortex.pointerId = null;
    previousPointer = null;
    this.button.setAttribute('aria-pressed', 'false');
    this.button.textContent = '倒流 · 按住 T';
    memory.endRewind();
    this.lockControls(false);
    document.getElementById('status').textContent = '文字已定格，雨和彩雾继续。点按画布可重新显示整句话。';
    this.updateLabel();
  },
  lockControls(locked) {
    for (const id of ['life', 'hueSpeed', 'ink', 'change-wind', 'toggle-rain']) {
      document.getElementById(id).disabled = locked;
    }
  },
  snapshot() {
    // 每颗雾点只保存 8 个数；限制帧数，避免长时间绘画积累无界历史。
    const data = new Float32Array(particles.length * 8);
    particles.forEach((p, i) => {
      data.set([p.x, p.y, p.vx, p.vy, p.age, p.lifeScale, p.hue, p.radius], i * 8);
    });
    return { elapsed, windOffset, windTarget, data,
      settings: { ...SETTINGS },
      vortex: { x: vortex.x, y: vortex.y, strength: vortex.strength },
      weather: weather.snapshot(), hiddenWorld: hiddenWorld.snapshot() };
  },
  restore(frame) {
    elapsed = frame.elapsed;
    windOffset = frame.windOffset;
    windTarget = frame.windTarget;
    Object.assign(SETTINGS, frame.settings);
    Object.assign(vortex, frame.vortex, { active: false, pointerId: null });
    particles = [];
    for (let i = 0; i < frame.data.length; i += 8) {
      const d = frame.data;
      particles.push({ x: d[i], y: d[i+1], vx: d[i+2], vy: d[i+3],
        age: d[i+4], lifeScale: d[i+5], hue: d[i+6], radius: d[i+7] });
    }
    weather.restore(frame.weather);
    hiddenWorld.restore(frame.hiddenWorld);
    for (const id of ['life', 'hueSpeed', 'ink']) {
      document.getElementById(id).value = SETTINGS[id];
      const suffix = id === 'life' ? ' 秒' : id === 'hueSpeed' ? '° / 秒' : '%';
      document.getElementById(`${id}-value`).textContent = `${SETTINGS[id]}${suffix}`;
    }
  },
  record(seconds) {
    this.recordClock += seconds;
    if (this.recordClock < 1 / 30) return;
    this.recordClock %= 1 / 30;
    this.frames.push(this.snapshot());
    while (this.frames.length > 241 || (this.frames.length > 1 && elapsed - this.frames[0].elapsed > 8)) {
      this.frames.shift();
    }
    this.updateLabel();
  },
  rewind(seconds) {
    // 文字独立倒放完整的一轮演出，即使场景的八秒历史已经用尽，也能拼回整句。
    memory.rewind(seconds);
    this.cursor -= seconds;
    let changed = false;
    while (this.frames.length > 1 && this.frames[this.frames.length - 1].elapsed > this.cursor) {
      this.frames.pop();
      changed = true;
    }
    if (changed) this.restore(this.frames[this.frames.length - 1]);
    this.updateLabel();
  },
  updateLabel() {
    const duration = this.frames.length ? Math.max(0, elapsed - this.frames[0].elapsed) : 0;
    this.button.disabled = !this.rewinding && this.frames.length < 2 && !memory.canRewind();
    this.label.textContent = this.rewinding && this.frames.length === 1 && !memory.canRewind()
      ? '已到记忆起点 · 松开后文字保持完整'
      : `${this.rewinding ? '正在倒流' : '场景可倒流'} ${duration.toFixed(1)} 秒 · 文字可回溯 ${memory.age.toFixed(1)} 秒`;
  },
  reset() {
    this.end();
    this.recordClock = 0;
    this.frames = [this.snapshot()];
    this.updateLabel();
  },
};
