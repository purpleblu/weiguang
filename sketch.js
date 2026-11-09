// 页面上的滑杆会实时修改这些参数，一次只调一个，观察区别。
const SETTINGS = {
  size: 5,       // 光点大小
  life: 10,      // 停留时间（秒）
  hueSpeed: 18,  // 每秒沿色环转过多少度，0 表示暂停变色
  ink: 90,      // 墨感：0 是细小光点，100 是更舒展的彩色雾团
};

let particles = [];
let stage;
let previousPointer = null;
let canvasElement;
let elapsed = 0;
let showWind = false;
let windOffset = 0;
let windTarget = 0;
const vortex = { x: 0, y: 0, strength: 0, active: false, pointerId: null };
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// setup：开始时执行一次，像准备纸张和画笔。
function setup() {
  stage = document.getElementById('stage');
  const canvas = createCanvas(stage.clientWidth, stage.clientHeight);
  canvas.parent('stage');
  canvasElement = canvas.elt;
  pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
  noStroke();
  colorMode(HSB, 360, 100, 100, 1);
  hiddenWorld.setup();
  describe('彩雾随风舒展。点按画布显示整句文字，两秒后逐字碎散；按住可起旋涡。R 开关雨，按住 T 倒流并显示 VHS 效果，松开定格文字，S 截图。文字可在下方编辑。');
  memory.setup();
  weather.setup();
  effects.setup();
  timeline.setup();

  const units = { life: value => `${value} 秒`, hueSpeed: value => `${value}° / 秒`, ink: value => `${value}%` };
  for (const name of ['life', 'hueSpeed', 'ink']) {
    const input = document.getElementById(name);
    input.value = SETTINGS[name];
    document.getElementById(`${name}-value`).textContent = units[name](SETTINGS[name]);
    input.addEventListener('input', () => {
      SETTINGS[name] = Number(input.value);
      document.getElementById(`${name}-value`).textContent = units[name](SETTINGS[name]);
    });
  }

  const windButton = document.getElementById('show-wind');
  windButton.addEventListener('click', () => {
    showWind = !showWind;
    hiddenWorld.syncWindButton();
  });
  document.getElementById('change-wind').addEventListener('click', () => {
    if (timeline.rewinding) return;
    // 移到噪声地图的另一片区域，保留画布上的雾，让新风慢慢接手。
    windTarget += random(3, 8);
    if (reduceMotion) windOffset = windTarget;
    document.getElementById('status').textContent = reduceMotion
      ? '已切换风向。当前系统减少动态效果，雾的位置保持静止。'
      : '新的一阵风正在吹来，观察雾如何慢慢转向。';
  });

  // 按住时用指针做一个局部旋涡。捕获指针，避免移出画布后收不到松手事件。
  const pointerPosition = event => {
    const rect = canvasElement.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * width / rect.width,
      y: (event.clientY - rect.top) * height / rect.height };
  };
  canvasElement.addEventListener('pointerdown', event => {
    if (timeline.rewinding) return;
    if (vortex.pointerId !== null || event.button !== 0) return;
    const point = pointerPosition(event);
    Object.assign(vortex, point, { active: true, pointerId: event.pointerId });
    memory.trigger();
    previousPointer = null;
    canvasElement.setPointerCapture(event.pointerId);
    if (event.pointerType !== 'mouse') addLight(point.x, point.y);
  });

  // 用浏览器指针事件统一处理鼠标、触屏和触控笔。
  canvasElement.addEventListener('pointermove', event => {
    if (timeline.rewinding) return;
    if (vortex.pointerId !== null && event.pointerId !== vortex.pointerId) return;
    if (event.pointerType !== 'mouse' && event.buttons === 0) return;
    const point = pointerPosition(event);
    if (vortex.active) {
      vortex.x = point.x;
      vortex.y = point.y;
      // 鼠标按住时专心塑形；触屏拖动同时留雾，单指也能完整体验。
      if (event.pointerType === 'mouse') return;
    }
    const from = previousPointer || point;
    const steps = Math.min(36, Math.max(1, Math.ceil(Math.hypot(point.x - from.x, point.y - from.y) / 5)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      addLight(lerp(from.x, point.x, t), lerp(from.y, point.y, t));
    }
    previousPointer = point;
  });
  const releaseVortex = event => {
    if (event.pointerId !== undefined && event.pointerId !== vortex.pointerId) return;
    vortex.active = false;
    vortex.pointerId = null;
    previousPointer = null;
  };
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvasElement.addEventListener(eventName, releaseVortex);
  }
  window.addEventListener('blur', releaseVortex);
  canvasElement.addEventListener('pointerleave', () => { previousPointer = null; });
  document.getElementById('clear').addEventListener('click', () => {
    hiddenWorld.handleResetClick();
    particles = [];
    previousPointer = null;
    vortex.active = false;
    vortex.pointerId = null;
    vortex.strength = 0;
    memory.reset();
    weather.reset();
    timeline.reset();
    background(hiddenWorld.active ? '#030103' : '#080d17');
  });
  timeline.reset();
}

function addLight(x, y) {
  if (hiddenWorld.active) ({ x, y } = hiddenWorld.spawnPosition(x, y));
  particles.push({ x, y, vx: random(-1, 1), vy: random(-1, 0.5),
    age: 0, lifeScale: random(0.85, 1.15),
    hue: (elapsed * 40 + random(-45, 45) + 360) % 360,
    radius: SETTINGS.size * random(0.5, 1.5) });
  // 限制数量，让长时间绘画时也能保持流畅。
  if (particles.length > 2400) particles.splice(0, particles.length - 2400);
}

// draw：不断重复执行。每一帧更新位置，再画出光点。
function draw() {
  const seconds = Math.min(deltaTime / 1000, 0.05);
  if (timeline.rewinding) timeline.rewind(seconds);
  else {
    updateMist(seconds);
    if (hiddenWorld.active) hiddenWorld.updateStorm(seconds);
    else weather.update(seconds);
    memory.update(seconds);
    timeline.record(seconds);
  }
  hiddenWorld.updateEyes(seconds);
  background(hiddenWorld.active ? '#030103' : '#080d17');
  if (hiddenWorld.active) {
    push();
    hiddenWorld.applySceneShake();
    if (showWind) hiddenWorld.drawEyes();
  }
  memory.draw();
  drawMist();
  if (!hiddenWorld.active) {
    weather.draw();
    if (showWind) drawWind();
    if (vortex.strength > 0.02) drawVortex();
  } else {
    hiddenWorld.drawStorm();
    pop();
  }
  if (timeline.rewinding) effects.applyRewind();
  effects.drawTimestamp();
}

function updateMist(seconds) {
  elapsed += seconds;
  windOffset = lerp(windOffset, windTarget, 1 - Math.exp(-seconds * 0.7));
  vortex.strength = lerp(vortex.strength, vortex.active && !reduceMotion ? 1 : 0,
    1 - Math.exp(-seconds * (vortex.active ? 6 : 2.5)));
  const ink = SETTINGS.ink / 100;
  for (const p of particles) {
    p.age += seconds;
    // 色相绕色环前进：同一颗光点也会从青、蓝、紫变到粉、金。
    p.hue = (p.hue + SETTINGS.hueSpeed * seconds) % 360;
    if (!reduceMotion) {
      // 噪声像缓缓流动的水，邻近的点沿相近的方向打旋。
      const wind = windVelocity(p.x, p.y);
      const follow = 1 - Math.exp(-seconds * 2);
      p.vx = lerp(p.vx, wind.x, follow);
      p.vy = lerp(p.vy, wind.y, follow);
      p.x += p.vx * (8 + ink * 30) * seconds;
      p.y += p.vy * (8 + ink * 30) * seconds;
    }
  }
  particles = particles.filter(p => p.age < SETTINGS.life * p.lifeScale);
}

function drawMist() {
  if (hiddenWorld.active) { push(); hiddenWorld.clipFearHole(); }
  const ink = SETTINGS.ink / 100;
  for (const p of particles) {
    const progress = Math.min(1, p.age / (SETTINGS.life * p.lifeScale));
    const opacity = Math.pow(1 - progress, 1.3);
    const bloom = 1 + ink * (0.8 + progress * 7);
    // 原来的色相仍在推进；里世界只把显示范围映射到低亮度暗红色。
    const hue = hiddenWorld.active ? (350 + Math.sin(p.hue * Math.PI / 180) * 8 + 360) % 360 : p.hue;
    // 几层透明圆叠出柔软边缘；越老越舒展，中心光点逐渐融入雾中。
    fill(hue, hiddenWorld.active ? 78 : 62, hiddenWorld.active ? 34 : 96, opacity * 0.025);
    circle(p.x, p.y, p.radius * bloom * 6);
    fill(hue, hiddenWorld.active ? 78 : 57, hiddenWorld.active ? 38 : 100, opacity * 0.06);
    circle(p.x, p.y, p.radius * bloom * 3.6);
    fill(hue, hiddenWorld.active ? 76 : 48, hiddenWorld.active ? 42 : 100, opacity * 0.16 * (1 - ink * 0.65));
    circle(p.x, p.y, p.radius * bloom * 1.8);
    fill(hue, hiddenWorld.active ? 68 : 30, hiddenWorld.active ? 48 : 100, opacity * 0.85 * (1 - ink * 0.9) * (1 - ink * progress));
    circle(p.x, p.y, p.radius * (1 + ink * progress));
  }
  if (hiddenWorld.active) pop();
}

// 一张看不见的方向地图：位置和时间决定风向。
// 箭头和雾点共用这个函数，所以显示的就是驱动雾的那阵风。
function windAngle(x, y) {
  const time = reduceMotion ? 0 : elapsed * 0.08;
  return noise(x * 0.004 + windOffset, y * 0.004, time) * TWO_PI * 2;
}

function vortexRadius() {
  return Math.min(180, width * 0.32, height * 0.45);
}

function windVelocity(x, y) {
  const angle = windAngle(x, y);
  const base = { x: Math.cos(angle), y: Math.sin(angle) };
  if (hiddenWorld.active) return hiddenWorld.repelWind(x, y, base);
  const dx = x - vortex.x;
  const dy = y - vortex.y;
  const distance = Math.hypot(dx, dy);
  const radius = vortexRadius();
  if (distance >= radius || vortex.strength < 0.001) return base;
  // 越靠近边缘影响越小；中心用有限的分母，避免除零或突然加速。
  const edge = 1 - distance / radius;
  const weight = edge * edge * (3 - 2 * edge) * vortex.strength;
  const divisor = Math.max(distance, 28);
  // 切向风让雾绕圈，轻微向内的风使它卷拢。
  return {
    x: base.x * (1 - weight * 0.9) + (-dy - dx * 0.12) / divisor * weight * 3.8,
    y: base.y * (1 - weight * 0.9) + (dx - dy * 0.12) / divisor * weight * 3.8,
  };
}

function drawVortex() {
  push();
  noFill();
  stroke(170, 25, 90, vortex.strength * 0.16);
  strokeWeight(1);
  circle(vortex.x, vortex.y, vortexRadius() * 2);
  stroke(170, 20, 95, vortex.strength * 0.6);
  circle(vortex.x, vortex.y, 8);
  pop();
}

function drawWind() {
  push();
  stroke(170, 22, 86, 0.42);
  strokeWeight(1);
  // 固定四行五列，格子中心的箭头与雨读取的风格采样点一致。
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      const x = (col + 0.5) * width / 5;
      const y = (row + 0.5) * height / 4;
      const wind = windVelocity(x, y);
      const angle = Math.atan2(wind.y, wind.x);
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const tipX = x + dx * 12;
      const tipY = y + dy * 12;
      line(x - dx * 10, y - dy * 10, tipX, tipY);
      line(tipX, tipY, tipX - dx * 5 - dy * 3, tipY - dy * 5 + dx * 3);
      line(tipX, tipY, tipX - dx * 5 + dy * 3, tipY - dy * 5 - dx * 3);
    }
  }
  pop();
}

function windGridVector(x, y) {
  const gx = Math.max(0, Math.min(4, x / width * 5 - 0.5));
  const gy = Math.max(0, Math.min(3, y / height * 4 - 0.5));
  const left = Math.floor(gx), top = Math.floor(gy);
  const right = Math.min(4, left + 1), bottom = Math.min(3, top + 1);
  const sample = (col, row) => windVelocity((col + 0.5) * width / 5, (row + 0.5) * height / 4);
  const a = sample(left, top), b = sample(right, top);
  const c = sample(left, bottom), d = sample(right, bottom);
  return {
    x: lerp(lerp(a.x, b.x, gx - left), lerp(c.x, d.x, gx - left), gy - top),
    y: lerp(lerp(a.y, b.y, gx - left), lerp(c.y, d.y, gx - left), gy - top),
  };
}

function windowResized() {
  resizeCanvas(stage.clientWidth, stage.clientHeight);
  previousPointer = null;
  memory.resize();
  weather.reset();
  effects.resize();
  timeline.reset();
}
