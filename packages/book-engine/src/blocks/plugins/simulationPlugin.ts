import { z } from 'zod';
import type { BlockCleanupFn, BlockMountContext, InteractiveBlockPlugin } from '../types';

const SimulationParamSchema = z.object({
  key: z.string().min(1),
  labelAr: z.string().min(1),
  unit: z.string().default(''),
  min: z.number(),
  max: z.number(),
  step: z.number().positive().default(1),
  defaultValue: z.number(),
});

export const SimulationBlockPayloadSchema = z.object({
  preset: z
    .enum(['projectile', 'pendulum', 'ideal_gas', 'wave_interference', 'function_plotter'])
    .default('projectile'),
  descriptionAr: z.string().optional(),
  curveFormula: z.string().optional(),
  parameters: z.array(SimulationParamSchema).default([
    { key: 'velocity', labelAr: 'السرعة الابتدائية', unit: 'م/ث', min: 5, max: 40, step: 1, defaultValue: 22 },
    { key: 'angle', labelAr: 'زاوية الإطلاق', unit: '°', min: 15, max: 80, step: 1, defaultValue: 45 },
    { key: 'gravity', labelAr: 'الجاذبية', unit: 'م/ث²', min: 1.6, max: 15, step: 0.2, defaultValue: 9.8 },
  ]),
});

export type SimulationBlockPayload = z.infer<typeof SimulationBlockPayloadSchema>;

function evalSafeCurve(expr: string, x: number, params: Record<string, number>): number {
  const safeScope: Record<string, number | ((v: number) => number)> = {
    x,
    pi: Math.PI,
    e: Math.E,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    abs: Math.abs,
    sqrt: (v: number) => Math.sqrt(Math.max(0, v)),
    a: params.a ?? params.amplitude ?? 1,
    b: params.b ?? params.frequency ?? 1,
    c: params.c ?? params.phase ?? 0,
  };
  const tokens = expr.match(/\d+(?:\.\d+)?|[a-zA-Z_]+|[()+\-*/^]/g);
  if (!tokens) return 0;

  let pos = 0;
  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  const parsePrimary = (): number => {
    const t = peek();
    if (!t) return 0;
    if (t === '(') {
      consume();
      const val = parseAddSub();
      if (peek() === ')') consume();
      return val;
    }
    if (t === '-') {
      consume();
      return -parsePrimary();
    }
    if (/^\d/.test(t)) {
      consume();
      return Number(t);
    }
    consume();
    const entry = safeScope[t.toLowerCase()];
    if (typeof entry === 'function' && peek() === '(') {
      consume();
      const arg = parseAddSub();
      if (peek() === ')') consume();
      return entry(arg);
    }
    return typeof entry === 'number' ? entry : 0;
  };

  const parsePow = (): number => {
    const base = parsePrimary();
    if (peek() === '^') {
      consume();
      return Math.pow(base, parsePow());
    }
    return base;
  };

  const parseMulDiv = (): number => {
    let left = parsePow();
    while (peek() === '*' || peek() === '/') {
      const op = consume();
      const right = parsePow();
      left = op === '*' ? left * right : right === 0 ? 0 : left / right;
    }
    return left;
  };

  const parseAddSub = (): number => {
    let left = parseMulDiv();
    while (peek() === '+' || peek() === '-') {
      const op = consume();
      const right = parseMulDiv();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  };

  return parseAddSub();
}

function mountSimulation(
  container: HTMLElement,
  payload: SimulationBlockPayload,
  _ctx: BlockMountContext
): BlockCleanupFn {
  const values: Record<string, number> = {};
  for (const p of payload.parameters) {
    values[p.key] = p.defaultValue;
  }

  const canvas = document.createElement('canvas');
  canvas.className = 'darb-sim-canvas';
  canvas.setAttribute('data-testid', 'simulationCanvas');

  const metricsWrap = document.createElement('div');
  metricsWrap.className = 'darb-sim-metrics';

  const slidersWrap = document.createElement('div');
  slidersWrap.style.display = 'flex';
  slidersWrap.style.flexDirection = 'column';
  slidersWrap.style.gap = '4px';

  const actionsRow = document.createElement('div');
  actionsRow.className = 'darb-blk-row';

  let running = true;
  let simTime = 0;

  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'darb-blk-btn active';
  playBtn.textContent = '⏸️ إيقاف المحاكاة';

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'darb-blk-btn';
  resetBtn.textContent = '🔄 إعادة';

  actionsRow.append(playBtn, resetBtn);
  if (payload.descriptionAr) {
    const desc = document.createElement('span');
    desc.style.fontSize = '10.8px';
    desc.style.opacity = '0.85';
    desc.textContent = payload.descriptionAr;
    actionsRow.appendChild(desc);
  }

  container.append(canvas, metricsWrap, slidersWrap, actionsRow);

  const sliderListeners: Array<() => void> = [];
  for (const p of payload.parameters) {
    const row = document.createElement('div');
    row.className = 'darb-blk-slider-row';

    const label = document.createElement('span');
    label.style.minWidth = '105px';
    label.textContent = `${p.labelAr}: ${values[p.key]} ${p.unit}`;

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(p.min);
    input.max = String(p.max);
    input.step = String(p.step);
    input.value = String(values[p.key]);

    const onInput = () => {
      values[p.key] = Number(input.value);
      label.textContent = `${p.labelAr}: ${values[p.key]} ${p.unit}`;
    };
    input.addEventListener('input', onInput);
    sliderListeners.push(() => input.removeEventListener('input', onInput));

    row.append(label, input);
    slidersWrap.appendChild(row);
  }

  const drawFrame = () => {
    const w = Math.max(220, canvas.clientWidth || 340);
    const h = Math.max(100, canvas.clientHeight || 132);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const c2d = canvas.getContext('2d');
    if (!c2d) return;

    c2d.clearRect(0, 0, w, h);
    c2d.strokeStyle = 'rgba(148,163,184,0.16)';
    c2d.lineWidth = 1;
    for (let x = 0; x < w; x += 28) {
      c2d.beginPath();
      c2d.moveTo(x, 0);
      c2d.lineTo(x, h);
      c2d.stroke();
    }
    for (let y = 0; y < h; y += 28) {
      c2d.beginPath();
      c2d.moveTo(0, y);
      c2d.lineTo(w, y);
      c2d.stroke();
    }

    const metricTags: string[] = [];

    if (payload.preset === 'projectile') {
      const v0 = values.velocity ?? 22;
      const deg = values.angle ?? 45;
      const g = values.gravity ?? 9.8;
      const rad = (deg * Math.PI) / 180;
      const vx = v0 * Math.cos(rad);
      const vy = v0 * Math.sin(rad);
      const totalT = Math.max(0.1, (2 * vy) / g);
      const range = vx * totalT;
      const maxH = (vy * vy) / (2 * g);
      const groundY = h - 16;
      const scaleX = (w - 40) / Math.max(10, range);
      const scaleY = (h - 32) / Math.max(5, maxH * 1.15);
      const scale = Math.min(scaleX, scaleY);

      c2d.strokeStyle = '#38bdf8';
      c2d.lineWidth = 2.2;
      c2d.beginPath();
      for (let i = 0; i <= 50; i++) {
        const t = (i / 50) * totalT;
        const px = 20 + vx * t * scale;
        const py = groundY - (vy * t - 0.5 * g * t * t) * scale;
        if (i === 0) c2d.moveTo(px, py);
        else c2d.lineTo(px, py);
      }
      c2d.stroke();

      const tNow = simTime % totalT;
      const bx = 20 + vx * tNow * scale;
      const by = groundY - (vy * tNow - 0.5 * g * tNow * tNow) * scale;
      c2d.fillStyle = '#facc15';
      c2d.beginPath();
      c2d.arc(bx, by, 6, 0, Math.PI * 2);
      c2d.fill();

      metricTags.push(`المدى: ${range.toFixed(1)} م`, `أقصى ارتفاع: ${maxH.toFixed(1)} م`, `زمن الطيران: ${totalT.toFixed(2)} ث`);
    } else if (payload.preset === 'pendulum') {
      const len = values.length ?? 1.5;
      const maxAngle = ((values.angle ?? 30) * Math.PI) / 180;
      const g = values.gravity ?? 9.8;
      const omega = Math.sqrt(g / Math.max(0.2, len));
      const period = (2 * Math.PI) / omega;
      const theta = maxAngle * Math.cos(omega * simTime);
      const pivotX = w / 2;
      const pivotY = 14;
      const pxLen = Math.min(h - 32, len * 42);
      const bobX = pivotX + Math.sin(theta) * pxLen;
      const bobY = pivotY + Math.cos(theta) * pxLen;

      c2d.strokeStyle = '#d4af37';
      c2d.lineWidth = 2.5;
      c2d.beginPath();
      c2d.moveTo(pivotX, pivotY);
      c2d.lineTo(bobX, bobY);
      c2d.stroke();

      c2d.fillStyle = '#38bdf8';
      c2d.beginPath();
      c2d.arc(bobX, bobY, 10, 0, Math.PI * 2);
      c2d.fill();

      metricTags.push(`الزمن الدوري T: ${period.toFixed(2)} ث`, `الزاوية الحالية: ${((theta * 180) / Math.PI).toFixed(1)}°`);
    } else if (payload.preset === 'ideal_gas') {
      const temp = values.temperature ?? 300;
      const vol = values.volume ?? 10;
      const moles = values.moles ?? 1.5;
      const R = 8.314;
      const pressure = (moles * R * temp) / Math.max(1, vol);
      const count = Math.min(28, Math.round(moles * 8));
      const speed = Math.sqrt(temp / 200);
      const boxW = Math.min(w - 30, (vol / 20) * (w - 30) + 60);
      const startX = (w - boxW) / 2;

      c2d.strokeStyle = '#d4af37';
      c2d.lineWidth = 2;
      c2d.strokeRect(startX, 12, boxW, h - 24);

      c2d.fillStyle = '#38bdf8';
      for (let i = 0; i < count; i++) {
        const rx = Math.abs(Math.sin(simTime * speed * (1 + i * 0.13) + i * 1.7));
        const ry = Math.abs(Math.cos(simTime * speed * (1 + i * 0.11) + i * 2.3));
        c2d.beginPath();
        c2d.arc(startX + 8 + rx * (boxW - 16), 20 + ry * (h - 40), 3.5, 0, Math.PI * 2);
        c2d.fill();
      }

      metricTags.push(`الضغط (P): ${(pressure / 1000).toFixed(2)} kPa`, `PV = nRT`, `الجزيئات: ${count}`);
    } else if (payload.preset === 'wave_interference') {
      const amp = values.amplitude ?? 22;
      const freq = values.frequency ?? 2;
      const midY = h / 2;
      c2d.strokeStyle = '#38bdf8';
      c2d.lineWidth = 2;
      c2d.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const k = (x / w) * Math.PI * 2 * freq;
        const y = midY + Math.sin(k - simTime * 3) * amp + Math.sin(k * 1.5 + simTime * 2) * (amp * 0.55);
        if (x === 0) c2d.moveTo(x, y);
        else c2d.lineTo(x, y);
      }
      c2d.stroke();
      metricTags.push(`السعة: ${amp} px`, `التردد: ${freq} Hz`);
    } else {
      const expr = payload.curveFormula || 'a * sin(b * x + c)';
      const midY = h / 2;
      c2d.strokeStyle = '#4ade80';
      c2d.lineWidth = 2.2;
      c2d.beginPath();
      for (let px = 0; px <= w; px += 4) {
        const xVal = ((px - w / 2) / w) * 10;
        const yVal = evalSafeCurve(expr, xVal, values);
        const py = midY - yVal * (h * 0.16);
        if (px === 0) c2d.moveTo(px, py);
        else c2d.lineTo(px, py);
      }
      c2d.stroke();
      metricTags.push(`الدالة: y = ${expr}`);
    }

    metricsWrap.innerHTML = metricTags.map((t) => `<span class="darb-sim-metric">${t}</span>`).join('');
  };

  let rafId: number | null = null;
  let lastTs = 0;
  const loop = (ts: number) => {
    if (lastTs) {
      const dt = Math.min(0.05, (ts - lastTs) / 1000);
      if (running) simTime += dt;
    }
    lastTs = ts;
    drawFrame();
    rafId = window.requestAnimationFrame(loop);
  };
  drawFrame();
  rafId = window.requestAnimationFrame(loop);

  const onPlayToggle = () => {
    running = !running;
    playBtn.textContent = running ? '⏸️ إيقاف المحاكاة' : '▶ تشغيل المحاكاة';
    playBtn.classList.toggle('active', running);
  };
  const onReset = () => {
    simTime = 0;
    drawFrame();
  };
  playBtn.addEventListener('click', onPlayToggle);
  resetBtn.addEventListener('click', onReset);

  return () => {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
    playBtn.removeEventListener('click', onPlayToggle);
    resetBtn.removeEventListener('click', onReset);
    for (const off of sliderListeners) off();
  };
}

export const simulationPlugin: InteractiveBlockPlugin<SimulationBlockPayload> = {
  type: 'simulation',
  labelAr: 'مختبر محاكاة علمي',
  descriptionAr: 'محاكاة فيزيائية/كيميائية/رياضية تفاعلية مدفوعة بالمعاملات والرسوم الفورية',
  icon: '⚗️',
  schema: SimulationBlockPayloadSchema,
  examplePayload: {
    preset: 'projectile',
    descriptionAr: 'تغيير السرعة الابتدائية وزاوية الإطلاق والجاذبية لحساب المدى',
    parameters: [
      { key: 'velocity', labelAr: 'السرعة الابتدائية', unit: 'م/ث', min: 5, max: 40, step: 1, defaultValue: 22 },
      { key: 'angle', labelAr: 'زاوية الإطلاق', unit: '°', min: 15, max: 80, step: 1, defaultValue: 45 },
      { key: 'gravity', labelAr: 'تسارع الجاذبية', unit: 'م/ث²', min: 1.6, max: 15, step: 0.2, defaultValue: 9.8 },
    ],
  },
  extractSearchText: (p) =>
    [p.preset, p.descriptionAr ?? '', ...p.parameters.map((x) => x.labelAr)].join(' '),
  mountInline: mountSimulation,
  mountFullscreen: mountSimulation,
};
