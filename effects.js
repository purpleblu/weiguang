// VHS 是最后一层视觉处理，不修改任何粒子的坐标或历史。
const effects = {
  seed: 19791, frames: 0, rewindKeyHeld: false,
  setup() {
    this.buffer = document.createElement('canvas');
    this.noise = document.createElement('canvas');
    this.resize();
    document.getElementById('screenshot').addEventListener('click', () => this.screenshot());
    document.addEventListener('keydown', event => {
      const tag = event.target?.tagName?.toLowerCase();
      if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey
        || ['input', 'textarea', 'select'].includes(tag) || event.target?.isContentEditable) return;
      const key = event.code || `Key${(event.key || '').toUpperCase()}`;
      if (key === 'KeyT') {
        event.preventDefault();
        if (!event.repeat) { this.rewindKeyHeld = true; timeline.begin(); }
      } else if (!event.repeat && key === 'KeyR') weather.toggle();
      else if (!event.repeat && key === 'KeyS') { event.preventDefault(); this.screenshot(); }
    });
    // 松键时即使焦点已进输入框，也结束倒流，避免按键状态卡住。
    document.addEventListener('keyup', event => {
      if ((event.code === 'KeyT' || event.key?.toLowerCase() === 't') && this.rewindKeyHeld) {
        this.rewindKeyHeld = false;
        timeline.end();
      }
    });
    window.addEventListener('blur', () => { this.rewindKeyHeld = false; });
  },
  resize() {
    this.buffer.width = canvasElement.width;
    this.buffer.height = canvasElement.height;
    this.noise.width = Math.max(1, Math.ceil(width / 3));
    this.noise.height = Math.max(1, Math.ceil(height / 3));
    this.noiseImage = this.noise.getContext('2d').createImageData(this.noise.width, this.noise.height);
  },
  applyRewind() {
    const ctx = drawingContext;
    const copy = this.buffer.getContext('2d');
    copy.clearRect(0, 0, this.buffer.width, this.buffer.height);
    copy.drawImage(canvasElement, 0, 0);
    ctx.save();
    ctx.filter = 'saturate(0.65) contrast(0.97)';
    ctx.drawImage(this.buffer, 0, 0, width, height);
    ctx.filter = 'none';
    // 给每个像素写相同的 RGB 和低透明度，得到淡灰白噪点。
    // 使用独立随机数，所以开关 VHS 不会改变雾或雨的随机轨迹。
    const data = this.noiseImage.data;
    for (let i = 0; i < data.length; i += 4) {
      this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
      const value = 105 + (this.seed & 127);
      data[i] = value; data[i + 1] = value; data[i + 2] = value;
      data[i + 3] = (this.seed >>> 16) % 13;
    }
    this.noise.getContext('2d').putImageData(this.noiseImage, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.noise, 0, 0, width, height);
    ctx.fillStyle = 'rgba(214,224,244,0.035)';
    for (let y = this.frames % 4; y < height; y += 4) ctx.fillRect(0, y, width, 1);
    const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.18,
      width / 2, height / 2, Math.hypot(width, height) * 0.52);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.30)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    if (hiddenWorld.active) hiddenWorld.drawTapeJam(this.buffer);
    this.frames++;
  },
  formatTime(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60]
      .map(value => String(value).padStart(2, '0')).join(':');
  },
  drawTimestamp() {
    const ctx = drawingContext;
    ctx.save();
    ctx.font = '12px Consolas, monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4;
    // elapsed 被历史帧恢复，时间戳便随场景倒走，无需另一只独立时钟。
    const text = hiddenWorld.active && timeline.rewinding ? hiddenWorld.brokenTimestamp() : this.formatTime(elapsed);
    ctx.fillText(text, width - 18, height - 14);
    ctx.restore();
  },
  screenshot() {
    saveCanvas(canvasElement, `微光-${this.formatTime(elapsed).replaceAll(':', '-')}`, 'png');
  },
};
