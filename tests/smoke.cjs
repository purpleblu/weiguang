// 无第三方依赖的行为回归检查；画布由轻量桩替代，不代替浏览器视觉验收。
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
function environment(reduced = false, storageBlocked = false) {
  let clock = 0;
  const elements = new Map(), contexts = [], saved = new Map();
  const stats = { lines: 0, randomCalls: 0, screenshots: [], ellipses: [], holeClips: 0, tapeBands: 0 };
  class Element {
    constructor(id) {
      this.id = id; this.events = {}; this.tagName = 'DIV';
      this.value = id === 'memory-text' ? '窗外的雨把夜色泡得很软，我陷在被窝里氤氲着潮湿的心事。' : '';
      this.clientWidth = 720; this.clientHeight = 400;
      this.textContent = id === 'world-description' ? '让雨随风，让字碎成光，也让时间沿来路退回。' : id;
      this.classes = new Set();
      this.classList = { toggle: (name, force) => { if (force) this.classes.add(name); else this.classes.delete(name); }, contains: name => this.classes.has(name) };
    }
    addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
    fire(type, event = {}) { event.preventDefault ||= () => {}; for (const fn of this.events[type] || []) fn(event); }
    setAttribute(name, value) { this[name] = value; }
    getAttribute(name) { return this[name] ?? null; }
    setPointerCapture(id) { this.capturedPointer = id; }
    getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; }
  }
  function makeContext() {
    const stack = [];
    const context = {
      words: [], inks: [], font: '20px serif', globalAlpha: 1, filter: 'none', lastWord: '',
      setTransform() {}, clearRect() {},
      save() { stack.push(Object.fromEntries(Object.entries(this).filter(([, v]) => typeof v !== 'function' && !Array.isArray(v)))); },
      restore() { Object.assign(this, stack.pop() || {}); },
      measureText(text) { return { width: Array.from(text).length * Number(this.font.match(/([\d.]+)px/)[1]) }; },
      fillText(text, x, y) { assert([x, y].every(Number.isFinite)); this.words.push(text); this.inks.push({text, alpha:this.globalAlpha}); this.lastWord = text; },
      createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
      putImageData(image) { assert(image.data instanceof Uint8ClampedArray); },
      getImageData(x, y, w, h) {
        const data = new Uint8ClampedArray(w * h * 4);
        // 固定的稀疏笔画夹具：用于检查仅采样有墨迹的像素，而非绘制矩形点阵。
        if (this.lastWord.trim()) for (let py = Math.floor(h * .3); py < h * .7; py++) {
          for (let px = 6; px < w * .6; px++) if (px % 5 === 1 || py % 7 === 2) data[(py * w + px) * 4 + 3] = 255;
        }
        return { data };
      },
      createRadialGradient(...values) { assert(values.every(Number.isFinite)); return { addColorStop(t) { assert(t >= 0 && t <= 1); } }; },
      createLinearGradient(...values) { assert(values.every(Number.isFinite)); return { addColorStop(t) { assert(t >= 0 && t <= 1); } }; },
      beginPath() {}, fill() {}, stroke() {}, drawImage(...args) { if (args.length === 9) stats.tapeBands++; },
      closePath() {}, clip(rule) { if (rule === 'evenodd') stats.holeClips++; },
      translate(...v) { assert(v.every(Number.isFinite)); }, scale(...v) { assert(v.every(Number.isFinite)); },
      quadraticCurveTo(...v) { assert(v.every(Number.isFinite)); }, rect(...v) { assert(v.every(Number.isFinite)); },
      arc(...v) { assert(v.every(Number.isFinite)); },
      moveTo(...v) { assert(v.every(Number.isFinite)); }, lineTo(...v) { assert(v.every(Number.isFinite)); },
      ellipse(...v) { assert(v.every(Number.isFinite)); stats.ellipses.push(v); },
      fillRect(...v) { assert(v.every(Number.isFinite)); },
    };
    contexts.push(context); return context;
  }
  const element = id => { if (!elements.has(id)) elements.set(id, new Element(id)); return elements.get(id); };
  const canvas = element('canvas'), win = new Element('window'), doc = new Element('document');
  win.devicePixelRatio = 2; win.matchMedia = () => ({ matches: reduced });
  doc.getElementById = element;
  doc.body = element('body');
  doc.createElement = () => { const ctx = makeContext(); return { width: 300, height: 150, getContext: () => ctx }; };
  const screen = makeContext();
  const context = {
    Math, Float32Array, Uint8ClampedArray, window: win, document: doc, performance: { now: () => clock },
    localStorage: {
      getItem(k) { if (storageBlocked) throw Error('blocked'); return saved.get(k) ?? null; },
      setItem(k, v) { if (storageBlocked) throw Error('blocked'); saved.set(k, v); },
    },
    HSB: 1, TWO_PI: Math.PI * 2, deltaTime: 1000 / 60,
    createCanvas(w, h) { context.width = w; context.height = h; canvas.width = w; canvas.height = h; return { parent() {}, elt: canvas }; },
    resizeCanvas(w, h) { context.width = w; context.height = h; canvas.width = w * 2; canvas.height = h * 2; },
    pixelDensity(n) { canvas.width = context.width * n; canvas.height = context.height * n; },
    random(a, b) { stats.randomCalls++; return b === undefined ? a / 2 : (a + b) / 2; },
    lerp: (a, b, t) => a + (b - a) * t,
    noise: (x, y, t) => .5 + Math.sin(x + y + t) * .2,
    noStroke() {}, noFill() {}, colorMode() {}, describe() {}, background() {}, push() {}, pop() {}, strokeWeight() {},
    fill(...v) { assert(v.every(Number.isFinite)); }, stroke(...v) { assert(v.every(Number.isFinite)); },
    circle(...v) { assert(v.every(Number.isFinite)); }, line(...v) { assert(v.every(Number.isFinite)); stats.lines++; },
    drawingContext: screen,
    saveCanvas(...args) { stats.screenshots.push(args); },
  };
  vm.createContext(context);
  const run = code => vm.runInContext(code, context);
  for (const file of ['hidden-world.js', 'memory.js', 'weather.js', 'effects.js', 'timeline.js', 'sketch.js']) run(fs.readFileSync(path.join(root, file), 'utf8'));
  run('setup()');
  const frames = n => run(`for (let i = 0; i < ${n}; i++) draw()`);
  const key = (code, type = 'keydown', target = element('body'), extra = {}) => doc.fire(type, { code, target, repeat: false, ...extra });
  return { run, frames, element, canvas, win, doc, stats, screen, key, saved, setClock: value => { clock = value; } };
}
const point = { pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, clientX: 360, clientY: 200 };

// 雨：左右风、落地水纹、关闭后收尾，且不改变彩雾与原随机序列。
const rain = environment();
rain.key('KeyR'); assert(rain.run('weather.enabled'));
rain.key('KeyR', 'keydown', undefined, { repeat: true }); assert(rain.run('weather.enabled'));
rain.run('windAngle = () => 0; addLight(100, 100)');
const mistBefore = rain.run('JSON.stringify(particles)'), callsBefore = rain.stats.randomCalls;
rain.run('for (let i=0;i<30;i++) weather.update(1/60)');
assert(rain.run('weather.drops.length > 0 && weather.drops.every(d => d.vx > 0 && d.vy > 0)'));
assert.equal(rain.run('JSON.stringify(particles)'), mistBefore);
assert.equal(rain.stats.randomCalls, callsBefore);
rain.run('windAngle = () => Math.PI; for (let i=0;i<80;i++) weather.update(1/60)');
assert(rain.run('weather.drops.some(d => d.vx < 0)'));
rain.run('weather.enabled=false; weather.drops=[{x:300,y:height-5,vx:0,vy:320,speed:320,length:12,alpha:.2}];weather.ripples=[];weather.update(.02);weather.draw()');
assert.equal(rain.run('weather.ripples.length'), 1);
const smallRadius = rain.stats.ellipses.at(-1)[2];
rain.run('weather.update(.5);weather.draw()'); assert(rain.stats.ellipses.at(-1)[2] > smallRadius);
rain.run('weather.update(.7)'); assert.equal(rain.run('weather.ripples.length'), 0);
const arrowBefore = rain.stats.lines; rain.run('drawWind()'); assert.equal(rain.stats.lines - arrowBefore, 60, '4x5 箭头，每个三段线');

// 文字：柔和淡入，完整停留两秒，再逐字碎散；倒流后冻结在半路。
const env = environment(), { run, frames, canvas, element, key } = env;
assert.equal(element('rewind').disabled, true);
frames(3); assert.equal(run('memory.visible'), false);
canvas.fire('pointermove', { ...point, buttons: 0 });
canvas.fire('pointerdown', point); canvas.fire('pointerup', point);
assert(run('memory.visible && memory.age === 0 && memory.templates.length > 0'));
const home = run('JSON.stringify(Array.from(memory.points))');
run('memory.draw()');
assert(!env.screen.inks.some(ink => ink.text === '窗'), '点按瞬间文字完全透明');
frames(15);
const shallow = env.screen.inks.filter(ink => ink.text === '窗').at(-1).alpha;
assert(shallow > 0 && shallow < 0.85);
frames(15);
const middle = env.screen.inks.filter(ink => ink.text === '窗').at(-1).alpha;
assert(middle > shallow && middle < 0.85, '透明度逐步增加');
frames(30);
assert.equal(env.screen.inks.filter(ink => ink.text === '窗').at(-1).alpha, 0.85);
frames(100); assert.equal(run('JSON.stringify(Array.from(memory.points))'), home);
assert.equal(run('effects.frames'), 0, '正常播放不绘制 VHS');
frames(22);
assert.notEqual(run('JSON.stringify(Array.from(memory.points))'), home);
assert(run('memory.templates.some((t,i) => t.glyph === memory.glyphs.length-1 && memory.points[i*4] === Math.fround(t.x))'), '最后的字尚未轮到碎散');
frames(100);
const future = run('elapsed'), textFuture = run('memory.age');
const oldFrames = run('timeline.frames.slice()');
key('KeyT'); assert(run('timeline.rewinding'));
frames(30);
assert(run('elapsed') < future - .4 && run('memory.age') < textFuture - .4);
assert(run('effects.frames > 0'));
const recorded = run('timeline.frames[timeline.frames.length-1]');
assert(oldFrames.includes(recorded));
assert.equal(run('particles[0].x'), recorded.data[0]);
assert.equal(run('particles[0].hue'), recorded.data[6]);
assert.equal(run('memory.points[0]'), run('memory.history[memory.history.length-1].points[0]'));
key('KeyT', 'keyup'); assert(run('memory.paused && !timeline.rewinding'));
const frozen = run('JSON.stringify(Array.from(memory.points))'), frozenAge = run('memory.age'), vhsFrames = run('effects.frames');
const sceneTime = run('elapsed'); frames(60);
assert.equal(run('JSON.stringify(Array.from(memory.points))'), frozen);
assert.equal(run('memory.age'), frozenAge); assert(run('elapsed') > sceneTime + .9);
assert.equal(run('effects.frames'), vhsFrames, '松键当帧后不再绘制 VHS');
assert.equal(env.screen.filter, 'none');
key('KeyT'); frames(360); key('KeyT', 'keyup');
assert.equal(run('memory.age'), run('memory.fadeDuration'));
assert.equal(run('JSON.stringify(Array.from(memory.points))'), home);
frames(60); assert.equal(run('memory.age'), run('memory.fadeDuration'), '拼好的整句持续定格');
canvas.fire('pointerdown', point); canvas.fire('pointerup', point);
assert(run('!memory.paused && memory.age===0'));
frames(700); assert(run('memory.finished && memory.history.length<=330'));
const textPathCount = run('memory.history.length');
frames(650); assert.equal(run('memory.history.length'), textPathCount, '文字散完后的空闲时间不冲掉回家路径');
key('KeyT'); frames(700); key('KeyT', 'keyup'); assert.equal(run('memory.age'), run('memory.fadeDuration'));

// 快捷键与截图：打字、组合键、IME 不触发；松键焦点变更不会卡住。
const input = element('memory-text'); input.tagName = 'INPUT';
const rainState = run('weather.enabled'), shotCount = env.stats.screenshots.length;
key('KeyR', 'keydown', input); key('KeyS', 'keydown', input); key('KeyT', 'keydown', input);
assert.equal(run('weather.enabled'), rainState); assert.equal(env.stats.screenshots.length, shotCount); assert(!run('timeline.rewinding'));
key('KeyR', 'keydown', undefined, { isComposing: true }); key('KeyS', 'keydown', undefined, { ctrlKey: true });
assert.equal(run('weather.enabled'), rainState); assert.equal(env.stats.screenshots.length, shotCount);
key('KeyS'); assert.equal(env.stats.screenshots.at(-1)[0], canvas); assert.equal(env.stats.screenshots.at(-1)[2], 'png');
frames(30); key('KeyT'); frames(3); key('KeyS');
assert(run('timeline.rewinding')); key('KeyT', 'keyup', input); assert(!run('timeline.rewinding'));
assert.equal(run('effects.formatTime(3661)'), '01:01:01');
assert.equal(run('effects.formatTime(60)'), '00:01:00');
assert.equal(run('effects.formatTime(-1)'), '00:00:00');
const state = run('JSON.stringify({particles, rain:weather.drops, seed:weather.seed})'), rng = env.stats.randomCalls;
run('effects.applyRewind()');
assert.equal(run('JSON.stringify({particles, rain:weather.drops, seed:weather.seed})'), state);
assert.equal(env.stats.randomCalls, rng);
assert(run('effects.noiseImage.data.every((v,i,a)=>i%4===3 ? v<=12 : v===a[i-i%4])'), '低透明度灰阶噪声');

// 雨与场景都从同一记录恢复；原粒子上限、历史上限、失焦释放、清空和缩放。
key('KeyR'); frames(150); const weatherFrames = run('timeline.frames.slice()');
key('KeyT'); frames(30);
const weatherRecord = run('timeline.frames[timeline.frames.length-1]');
assert(weatherFrames.includes(weatherRecord));
assert.equal(run('weather.drops.length*7'), weatherRecord.weather.drops.length);
if (weatherRecord.weather.drops.length) assert.equal(run('weather.drops[0].x'), weatherRecord.weather.drops[0]);
env.win.fire('blur'); assert(!run('timeline.rewinding'));
frames(15); key('KeyT'); env.doc.hidden = true; env.doc.fire('visibilitychange'); assert(!run('timeline.rewinding'));
frames(650); assert(run('timeline.frames.length<=241 && elapsed-timeline.frames[0].elapsed<=8.00001'));
run('for(let i=0;i<5000;i++) addLight(10,10)'); assert.equal(run('particles.length'), 2400);
input.value = '字'.repeat(80); input.fire('input'); assert(run('memory.templates.length<=2200'));
assert.equal(run('memory.visible'), false);
canvas.fire('pointerdown', point); canvas.fire('pointercancel', point); assert(!run('vortex.active'));
element('clear').fire('click'); assert(run('particles.length===0 && weather.drops.length===0 && memory.history.length===0 && timeline.frames.length===1'));
assert.equal(run('memory.text.length'), 80);
element('stage').clientWidth = 300; run('windowResized()'); assert.equal(run('effects.buffer.width'), 600);
assert.equal(run('timeline.frames.length'), 1);
const quiet = environment(true, true);
quiet.element('memory-text').value = '仍然可以编辑'; quiet.element('memory-text').fire('input');
quiet.canvas.fire('pointerdown', { ...point, pointerType: 'touch' }); quiet.frames(30);
assert.equal(quiet.run('vortex.strength'), 0); assert(quiet.run('memory.visible'));
quiet.canvas.fire('pointercancel', point); assert(!quiet.run('vortex.active'));
console.log('PASS: wind-driven rain/ripples/isolation, 4x5 grid, 2s letter scatter, exact path rewind and freeze/retrigger, idle path retention, rewind-only VHS, timestamp, screenshot, safe shortcuts, caps, lifecycle, resize, reduced motion');

// 里世界：固定五连点窗口、二十只眼睛、雷电、排斥、字的坐标交换与坏时间。
const inner = environment();
const clickReset = time => { inner.setClock(time); inner.element('clear').fire('click'); };
[0, 600, 1200, 1800, 2401].forEach(clickReset);
assert.equal(inner.run('hiddenWorld.active'), false, '五下总耗时超过两秒，不能切换');
assert.equal(inner.run('hiddenWorld.resetClicks.length'), 1);
inner.run('hiddenWorld.resetClicks=[]');
inner.key('KeyR');
const rainBeforeEntry = inner.run('weather.enabled');
const description = inner.element('world-description').textContent;
const pointerHint = inner.element('pointer-hint').textContent;
const shortcutHint = inner.element('shortcut-hint').textContent;
const sourceText = inner.element('memory-text').value;
[3000, 3500, 4000, 4500, 5000].forEach(clickReset);
assert(inner.run('hiddenWorld.active'), '恰好两秒的五下可进入');
assert.equal(inner.run('hiddenWorld.resetClicks.length'), 0, '切换后清空计数，不复用同一组点击');
assert(inner.doc.body.classList.contains('inner-world'));
assert.equal(inner.run('hiddenWorld.eyes.length'), 20);
assert.equal(inner.run('showWind'), true);
assert.equal(inner.element('show-wind').textContent, '隐藏眼睛');
assert.equal(inner.element('toggle-rain').textContent, '停雷 · R');
assert(inner.run('new Set(hiddenWorld.eyes.map(eye=>eye.blinkAt)).size > 15'));
clickReset(5010);
assert(inner.run('hiddenWorld.active && hiddenWorld.resetClicks.length===1'), '切换后的额外一下不会立刻弹回表世界');

// 凝视向右、停留闭眼、移开睁眼；单眼的随机眨眼周期不会同步到其他眼睛。
inner.canvas.fire('pointermove', { ...point, buttons: 0, clientX: 650, clientY: 300 });
inner.frames(30);
assert(inner.run('hiddenWorld.eyes[0].gazeX > 0 && hiddenWorld.eyes[0].gazeY > 0'));
inner.run('hiddenWorld.eyes.forEach(eye=>eye.blinkAt=10000)');
inner.canvas.fire('pointermove', { ...point, buttons: 0, clientX: 72, clientY: 50 });
inner.frames(210);
assert(inner.run('hiddenWorld.eyes[0].closure > .95'));
inner.canvas.fire('pointermove', { ...point, buttons: 0, clientX: 650, clientY: 300 });
inner.frames(60);
assert(inner.run('hiddenWorld.eyes[0].closure < .05'));
inner.run('hiddenWorld.eyes[0].blinkAt=hiddenWorld.visualTime');
inner.frames(6); assert(inner.run('hiddenWorld.eyes[0].closure > .25'));
inner.frames(45); assert(inner.run('hiddenWorld.eyes[0].closure < .1'));
const arrowLines = inner.stats.lines;
inner.frames(3); assert.equal(inner.stats.lines, arrowLines, '里世界不绘制风向箭头');

// 没有雨；雷电的历史也能恢复，R 只切换里世界的雷而不修改表世界雨开关。
inner.run('hiddenWorld.nextStorm=hiddenWorld.stormTime+.001');
inner.frames(1);
assert(inner.run('hiddenWorld.flash > .2 && hiddenWorld.bolt.length === 10'));
assert(inner.run('hiddenWorld.nextStorm-hiddenWorld.stormTime >= 3.5'));
assert.equal(inner.run('weather.drops.length'), 0);
assert.equal(inner.run('weather.ripples.length'), 0);
const stormSnapshot = inner.run('hiddenWorld.snapshot()');
// 恢复已记录的雷电状态。
inner.run('hiddenWorld.flash=.12;globalThis.savedStorm=hiddenWorld.snapshot();hiddenWorld.flash=0;hiddenWorld.restore(savedStorm)');
assert.equal(inner.run('hiddenWorld.flash'), .12);
assert(stormSnapshot.bolt.length === 10);
inner.key('KeyR'); assert.equal(inner.run('hiddenWorld.thunderEnabled'), false);
assert.equal(inner.run('weather.enabled'), rainBeforeEntry);
inner.key('KeyR'); assert.equal(inner.run('hiddenWorld.thunderEnabled'), true);

inner.run('windAngle=()=>0');
inner.canvas.fire('pointerdown', { ...point, clientX: 360, clientY: 200 });
inner.canvas.fire('pointerup', point);
assert(inner.run('windVelocity(350,200).x < 0 && windVelocity(370,200).x > 0'));
assert(inner.run('windVelocity(360,190).y < 0 && windVelocity(360,210).y > 0'));
assert(inner.run('Number.isFinite(windVelocity(360,200).x)'));
inner.run('addLight(hiddenWorld.pointer.x,hiddenWorld.pointer.y)');
assert(inner.run('Math.hypot(particles.at(-1).x-hiddenWorld.pointer.x,particles.at(-1).y-hiddenWorld.pointer.y)>=hiddenWorld.fearRadius()*.42-.001'));
inner.frames(1); assert(inner.stats.holeClips > 0);

// 字符数据和输入值不变，仅两处显示坐标改变；碎片的起点与交换后的笔画一致。
assert.equal(inner.element('memory-text').value, sourceText);
assert.equal(inner.run('memory.text'), sourceText);
assert.equal(inner.run('memory.glyphs.map(g=>g.char).join(\'\')'), sourceText);
assert(inner.run('hiddenWorld.textSwap.length===2 && hiddenWorld.textSwap[0].index!==hiddenWorld.textSwap[1].index'));
assert(inner.run('memory.templates.every((t,i)=>memory.points[i*4]===Math.fround(t.x+hiddenWorld.textOffset(t.glyph).x) && memory.points[i*4+1]===Math.fround(t.y+hiddenWorld.textOffset(t.glyph).y))'));
const swappedHome = inner.run('JSON.stringify(Array.from(memory.history[0].points))');
inner.frames(250);
inner.key('KeyT'); inner.frames(30);
const broken = inner.screen.words.at(-1).split(':').map(Number);
assert(broken[0]>=25 && broken[1]>=61 && broken[2]>=70);
inner.key('KeyS'); assert.equal(inner.stats.screenshots.at(-1)[0], inner.canvas);
inner.run('hiddenWorld.visualTime=3/7;effects.applyRewind()');
assert(inner.stats.tapeBands > 0);
inner.frames(360); inner.key('KeyT', 'keyup'); inner.frames(1);
assert.equal(inner.screen.words.at(-1), inner.run('effects.formatTime(elapsed)'), '松键立即恢复正常时间');
assert.equal(inner.run('JSON.stringify(Array.from(memory.points))'), swappedHome);
assert.equal(inner.run('memory.age'), inner.run('memory.fadeDuration'));
assert.equal(inner.element('memory-text').value, sourceText);

// 另一组独立五连点退出：表世界风向显示、雨开关、提示、鼠标旋涡和正常字色恢复。
[8000, 8200, 8400, 8600, 8800].forEach(clickReset);
assert.equal(inner.run('hiddenWorld.active'), false);
assert(!inner.doc.body.classList.contains('inner-world'));
assert.equal(inner.run('showWind'), false);
assert.equal(inner.run('weather.enabled'), rainBeforeEntry);
assert.equal(inner.element('world-description').textContent, description);
assert.equal(inner.element('pointer-hint').textContent, pointerHint);
assert.equal(inner.element('shortcut-hint').textContent, shortcutHint);
assert.equal(inner.element('toggle-rain').textContent, '停雨 · R');
assert.equal(inner.run('hiddenWorld.resetClicks.length'), 0);
inner.canvas.fire('pointerdown', point); inner.frames(30);
assert.equal(inner.run('hiddenWorld.textSwap.length'), 0);
assert(inner.run('Math.abs(windVelocity(370,200).y)>0.1'), '恢复表世界切向旋涡');
assert(inner.run('weather.drops.length>0'), '回表世界后雨照常下');
console.log('PASS: hidden-world five-click window and restoration, 20 gaze/blink/hover eyes, thunder without rain, radial fear/hole, coordinate-only text swap with rewind, broken timestamp/tape jam and normal recovery');
