// SF 효과음 샘플 생성기 — pure JS DSP로 WAV 파일 합성
// 실행: node generate.js
//
// 5종 × 3변형 = 15개 WAV. 각 변형은 다른 SF 사운드 디자인 접근법.

const fs = require("fs");
const path = require("path");

const SR = 44100;
const OUT_DIR = __dirname;

// =========================== WAV 인코더 ===========================
function writeWav(filename, samples) {
  // samples: Float32Array (-1..1, mono)
  const len = samples.length;
  const buf = Buffer.alloc(44 + len * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + len * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(len * 2, 40);
  for (let i = 0; i < len; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  fs.writeFileSync(path.join(OUT_DIR, filename), buf);
  console.log(`  wrote ${filename}  (${(len / SR).toFixed(2)}s, ${(buf.length / 1024).toFixed(1)}KB)`);
}

// =========================== DSP 유틸 ===========================
function makeBuf(durSec) {
  return new Float32Array(Math.ceil(durSec * SR));
}

// 시간 t에 대한 envelope 헬퍼
const env = {
  // attack-decay: 0→peak (in attack) → 0 (in decay)
  ad: (a, d, peak = 1) => (t) => {
    if (t < 0) return 0;
    if (t < a) return peak * (t / a);
    if (t < a + d) return peak * (1 - (t - a) / d);
    return 0;
  },
  // exp decay
  exp: (a, decayTime, peak = 1) => (t) => {
    if (t < 0) return 0;
    if (t < a) return peak * (t / a);
    return peak * Math.exp(-3 * (t - a) / decayTime);
  },
  // ADSR (linear)
  adsr: (a, d, s, r, total, peak = 1, sus = 0.5) => (t) => {
    if (t < 0 || t > total) return 0;
    if (t < a) return peak * (t / a);
    if (t < a + d) return peak - (peak - sus * peak) * ((t - a) / d);
    if (t < total - r) return sus * peak;
    return sus * peak * (1 - (t - (total - r)) / r);
  },
};

// 주파수/게인 envelope: 시간에 따라 변하는 값
function ramp(points) {
  // points: [[t0, v0], [t1, v1], ...]  — 선형 보간
  return (t) => {
    if (t <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      if (t <= points[i][0]) {
        const [t0, v0] = points[i - 1];
        const [t1, v1] = points[i];
        return v0 + (v1 - v0) * ((t - t0) / (t1 - t0));
      }
    }
    return points[points.length - 1][1];
  };
}

function expRamp(points) {
  // 지수 보간 (대수 곡선) — 주파수 sweep에 자연스러움
  return (t) => {
    if (t <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      if (t <= points[i][0]) {
        const [t0, v0] = points[i - 1];
        const [t1, v1] = points[i];
        const r = (t - t0) / (t1 - t0);
        return v0 * Math.pow(v1 / v0, r);
      }
    }
    return points[points.length - 1][1];
  };
}

// 오실레이터를 buf에 더함
function addOsc(buf, type, freqEnv, gainEnv, startSec = 0) {
  const startSample = Math.floor(startSec * SR);
  let phase = 0;
  for (let i = startSample; i < buf.length; i++) {
    const t = i / SR - startSec;
    if (t < 0) continue;
    const f = typeof freqEnv === "function" ? freqEnv(t) : freqEnv;
    const g = typeof gainEnv === "function" ? gainEnv(t) : gainEnv;
    let s;
    if (type === "sine") s = Math.sin(phase);
    else if (type === "square") s = Math.sin(phase) > 0 ? 1 : -1;
    else if (type === "saw") {
      const p = (phase / (2 * Math.PI)) % 1;
      s = (p < 0 ? p + 1 : p) * 2 - 1;
    } else if (type === "triangle") {
      const p = (phase / (2 * Math.PI)) % 1;
      const pp = p < 0 ? p + 1 : p;
      s = pp < 0.5 ? pp * 4 - 1 : 3 - pp * 4;
    } else s = 0;
    buf[i] += s * g;
    phase += 2 * Math.PI * f / SR;
  }
}

// 노이즈 추가
function addNoise(buf, gainEnv, startSec = 0) {
  const startSample = Math.floor(startSec * SR);
  for (let i = startSample; i < buf.length; i++) {
    const t = i / SR - startSec;
    if (t < 0) continue;
    const g = typeof gainEnv === "function" ? gainEnv(t) : gainEnv;
    buf[i] += (Math.random() * 2 - 1) * g;
  }
}

// Biquad 필터 (Robert Bristow-Johnson cookbook)
// 입력 buf를 in-place 필터링. 시간변동 freq 지원.
function biquad(buf, type, freqEnv, Q = 1) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const t = i / SR;
    const f0 = Math.max(20, Math.min(SR / 2 - 100, typeof freqEnv === "function" ? freqEnv(t) : freqEnv));
    const w0 = 2 * Math.PI * f0 / SR;
    const cosw = Math.cos(w0), sinw = Math.sin(w0);
    const alpha = sinw / (2 * Q);
    let b0, b1, b2, a0, a1, a2;
    if (type === "lowpass") {
      b0 = (1 - cosw) / 2; b1 = 1 - cosw; b2 = (1 - cosw) / 2;
      a0 = 1 + alpha; a1 = -2 * cosw; a2 = 1 - alpha;
    } else if (type === "highpass") {
      b0 = (1 + cosw) / 2; b1 = -(1 + cosw); b2 = (1 + cosw) / 2;
      a0 = 1 + alpha; a1 = -2 * cosw; a2 = 1 - alpha;
    } else { // bandpass
      b0 = alpha; b1 = 0; b2 = -alpha;
      a0 = 1 + alpha; a1 = -2 * cosw; a2 = 1 - alpha;
    }
    const x = buf[i];
    const y = (b0 / a0) * x + (b1 / a0) * x1 + (b2 / a0) * x2
            - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1; x1 = x;
    y2 = y1; y1 = y;
    buf[i] = y;
  }
  return buf;
}

// 딜레이 + 피드백 (잔향)
function applyDelay(buf, delaySec = 0.08, feedback = 0.35, mix = 0.25) {
  const dl = Math.max(1, Math.floor(delaySec * SR));
  const ring = new Float32Array(dl);
  let pos = 0;
  for (let i = 0; i < buf.length; i++) {
    const delayed = ring[pos];
    ring[pos] = buf[i] + delayed * feedback;
    buf[i] += delayed * mix;
    pos = (pos + 1) % dl;
  }
}

// 두 buf 더하기 (mix)
function mixInto(dst, src, gain = 1, startSec = 0) {
  const startSample = Math.floor(startSec * SR);
  for (let i = 0; i < src.length; i++) {
    if (startSample + i >= dst.length) break;
    dst[startSample + i] += src[i] * gain;
  }
}

// 정규화 — 클리핑 방지
function normalize(buf, peak = 0.85) {
  let max = 0;
  for (let i = 0; i < buf.length; i++) max = Math.max(max, Math.abs(buf[i]));
  if (max > 0) {
    const g = peak / max;
    for (let i = 0; i < buf.length; i++) buf[i] *= g;
  }
}

// =========================== 효과음 디자인 ===========================

// ============================================================
// SEND — 코드 입력 시 (10 변형)
// ============================================================

// 01 · LASER — 레이저 zap (square 2500→200Hz 빠른 하강 + 밴드패스 + sub 착지)
function send01() {
  const buf = makeBuf(0.35);
  const laser = makeBuf(0.22);
  addOsc(laser, "square",
    expRamp([[0, 2500], [0.04, 800], [0.2, 220]]),
    env.exp(0.001, 0.2, 0.42));
  biquad(laser, "bandpass", expRamp([[0, 2800], [0.2, 700]]), 4);
  mixInto(buf, laser, 1, 0);
  addOsc(buf, "sine",
    expRamp([[0, 90], [0.1, 50]]),
    env.exp(0.005, 0.12, 0.3), 0.1);
  applyDelay(buf, 0.06, 0.3, 0.18);
  normalize(buf, 0.85);
  return buf;
}

// 02 · BLIP — 깨끗한 디지털 사인 + 긴 잔향 (Tron 톤)
function send02() {
  const buf = makeBuf(0.7);
  addOsc(buf, "sine",
    expRamp([[0, 1200], [0.04, 1500]]),
    env.exp(0.002, 0.1, 0.32));
  addOsc(buf, "sine", 60, env.exp(0.005, 0.15, 0.18));
  applyDelay(buf, 0.15, 0.55, 0.42);
  normalize(buf, 0.85);
  return buf;
}

// 03 · TWO-STEP — sub 클릭 + 130ms 후 확인 beep
function send03() {
  const buf = makeBuf(0.5);
  addOsc(buf, "sine",
    expRamp([[0, 110], [0.08, 50]]),
    env.exp(0.001, 0.1, 0.45));
  const clk = makeBuf(0.02);
  addNoise(clk, env.exp(0.0005, 0.015, 0.4));
  biquad(clk, "highpass", 5000, 1);
  mixInto(buf, clk, 1, 0);
  addOsc(buf, "sine", 1100, env.exp(0.002, 0.12, 0.22), 0.13);
  applyDelay(buf, 0.1, 0.4, 0.28);
  normalize(buf, 0.85);
  return buf;
}

// 04 · BURST — 4단 빠른 데이터 펄스 (필터 노이즈 + 작은 톤)
function send04() {
  const buf = makeBuf(0.3);
  for (let i = 0; i < 4; i++) {
    const t = i * 0.05;
    const n = makeBuf(0.04);
    addNoise(n, env.exp(0.001, 0.025, 0.5));
    biquad(n, "bandpass", 1500 + i * 400, 5);
    mixInto(buf, n, 1, t);
    addOsc(buf, "square", 1500 + i * 200, env.exp(0.001, 0.03, 0.13), t);
  }
  applyDelay(buf, 0.05, 0.35, 0.22);
  normalize(buf, 0.85);
  return buf;
}

// 05 · WARP — 위로 솟구치는 whoosh (밴드패스 노이즈 + 상승 saw + sub)
function send05() {
  const buf = makeBuf(0.4);
  const ns = makeBuf(0.3);
  addNoise(ns, env.exp(0.05, 0.28, 0.55));
  biquad(ns, "bandpass", expRamp([[0, 400], [0.28, 4000]]), 6);
  mixInto(buf, ns, 1, 0);
  addOsc(buf, "saw",
    expRamp([[0, 200], [0.28, 1500]]),
    env.exp(0.05, 0.28, 0.16));
  addOsc(buf, "sine",
    expRamp([[0, 50], [0.3, 100]]),
    env.exp(0.05, 0.3, 0.28));
  applyDelay(buf, 0.07, 0.3, 0.2);
  normalize(buf, 0.88);
  return buf;
}

// 06 · MECH — 기계식 키보드 키프레스 (transient 클릭 + sub thunk)
function send06() {
  const buf = makeBuf(0.25);
  addOsc(buf, "sine",
    expRamp([[0, 140], [0.08, 60]]),
    env.exp(0.001, 0.1, 0.42));
  const clk = makeBuf(0.015);
  addNoise(clk, env.exp(0.0002, 0.012, 0.7));
  biquad(clk, "bandpass", 3500, 4);
  mixInto(buf, clk, 1, 0);
  applyDelay(buf, 0.04, 0.2, 0.15);
  normalize(buf, 0.85);
  return buf;
}

// 07 · STAB — 신스 saw 화음 stab (5도 디튠 + lowpass sweep)
function send07() {
  const buf = makeBuf(0.4);
  const chordBuf = makeBuf(0.3);
  const chord = [220, 330, 440];
  chord.forEach((f) => {
    [-7, 7].forEach((d) => {
      addOsc(chordBuf, "saw", f * Math.pow(2, d / 1200),
        env.exp(0.005, 0.18, 0.12));
    });
  });
  biquad(chordBuf, "lowpass", expRamp([[0, 800], [0.05, 3500], [0.25, 1200]]), 5);
  mixInto(buf, chordBuf, 1, 0);
  addOsc(buf, "sine",
    expRamp([[0, 100], [0.08, 45]]),
    env.exp(0.002, 0.1, 0.4));
  applyDelay(buf, 0.12, 0.4, 0.3);
  normalize(buf, 0.85);
  return buf;
}

// 08 · GLITCH — 빠른 freq 점프 사각파 + 모듈레이션 노이즈
function send08() {
  const buf = makeBuf(0.3);
  const glitchBuf = makeBuf(0.25);
  const tones = [800, 1500, 600, 1200, 900];
  tones.forEach((f, i) => {
    addOsc(glitchBuf, "square", f, env.exp(0.001, 0.04, 0.16), i * 0.04);
  });
  biquad(glitchBuf, "bandpass", 1100, 6);
  mixInto(buf, glitchBuf, 1, 0);
  const ns = makeBuf(0.15);
  addNoise(ns, env.exp(0.01, 0.13, 0.3));
  biquad(ns, "bandpass", expRamp([[0, 2000], [0.13, 600]]), 5);
  mixInto(buf, ns, 1, 0.05);
  applyDelay(buf, 0.04, 0.3, 0.2);
  normalize(buf, 0.85);
  return buf;
}

// 09 · RADAR — 소나 핑 (단일 사인 + 매우 긴 잔향 — 우주 공간감)
function send09() {
  const buf = makeBuf(1.0);
  addOsc(buf, "sine", 880, env.exp(0.003, 0.5, 0.3));
  addOsc(buf, "sine", 884, env.exp(0.003, 0.4, 0.18));
  addOsc(buf, "sine", 110, env.exp(0.005, 0.35, 0.14));
  applyDelay(buf, 0.18, 0.6, 0.5);
  normalize(buf, 0.85);
  return buf;
}

// 10 · KICK — 무거운 sub kick + 크리스피 top click
function send10() {
  const buf = makeBuf(0.4);
  addOsc(buf, "sine",
    expRamp([[0, 130], [0.12, 35]]),
    env.exp(0.001, 0.18, 0.55));
  const body = makeBuf(0.18);
  addOsc(body, "saw",
    expRamp([[0, 280], [0.06, 180]]),
    env.exp(0.003, 0.08, 0.15));
  biquad(body, "lowpass", expRamp([[0, 1000], [0.15, 400]]), 3);
  mixInto(buf, body, 1, 0);
  const clk = makeBuf(0.025);
  addNoise(clk, env.exp(0.0005, 0.02, 0.6));
  biquad(clk, "highpass", 6000, 2);
  mixInto(buf, clk, 1, 0);
  applyDelay(buf, 0.06, 0.25, 0.18);
  normalize(buf, 0.9);
  return buf;
}

// ============================================================
// RECEIVE — 메시지 수신 (3 변형)
// ============================================================

// RECEIVE-A: 디크립트 시퀀스 (저음 sub-thump + 노이즈 sweep + 락 클릭)
function receiveA() {
  const buf = makeBuf(0.7);
  // 노이즈 sweep (데이터 들어오는 느낌)
  const noise = makeBuf(0.35);
  addNoise(noise, env.ad(0.02, 0.32, 0.5));
  biquad(noise, "bandpass", expRamp([[0, 3500], [0.3, 700]]), 9);
  mixInto(buf, noise, 1, 0);
  // sub-thump (데이터 도착)
  addOsc(buf, "sine",
    expRamp([[0, 110], [0.22, 45]]),
    env.exp(0.003, 0.2, 0.65), 0.18);
  // 끝부분 락 클릭 (디크립트 완료)
  const clk = makeBuf(0.05);
  addNoise(clk, env.exp(0.001, 0.03, 0.4));
  biquad(clk, "highpass", 4000, 2);
  mixInto(buf, clk, 1, 0.42);
  applyDelay(buf, 0.09, 0.35, 0.25);
  normalize(buf, 0.85);
  return buf;
}

// RECEIVE-B: 홀로그램 핑 (크리스탈 종소리 + 잔향)
function receiveB() {
  const buf = makeBuf(1.2);
  // FM-like 종소리: 캐리어 + 변조용 작은 modulator를 합성
  // 단순화: 여러 사인 부분음 (1, 2.76, 5.4 — 종소리 부분음 비)
  const fund = 660;
  const partials = [
    { ratio: 1,    gain: 0.5,  decay: 0.7 },
    { ratio: 2.76, gain: 0.18, decay: 0.4 },
    { ratio: 5.4,  gain: 0.08, decay: 0.2 },
    { ratio: 0.5,  gain: 0.3,  decay: 0.9 },  // sub
  ];
  partials.forEach((p) => {
    addOsc(buf, "sine", fund * p.ratio, env.exp(0.002, p.decay, p.gain));
  });
  applyDelay(buf, 0.16, 0.55, 0.4);
  normalize(buf, 0.85);
  return buf;
}

// RECEIVE-C: 사이파이 듀얼 톤 (낮은 → 높은 두 음 + sub bass 백그라운드)
function receiveC() {
  const buf = makeBuf(0.55);
  // 낮은 톤 (200ms)
  addOsc(buf, "sine", 392, env.exp(0.005, 0.15, 0.32));
  // 높은 톤 (시간 차)
  addOsc(buf, "sine", 587, env.exp(0.005, 0.18, 0.32), 0.12);
  // sub backbone (전체)
  addOsc(buf, "sine", 65, env.adsr(0.04, 0.08, 0.4, 0.15, 0.5, 0.45, 0.6));
  applyDelay(buf, 0.13, 0.35, 0.3);
  normalize(buf, 0.85);
  return buf;
}

// ============================================================
// FANFARE — EP CLEAR (3 변형)
// ============================================================

// FANFARE-A: Inception BWAAAM — sub riser + 임팩트 + 화음 잔향
function fanfareA() {
  const buf = makeBuf(2.5);
  // sub riser
  addOsc(buf, "sine",
    expRamp([[0, 30], [0.7, 80]]),
    env.adsr(0.5, 0.1, 0.7, 1.0, 1.5, 0.9));
  // 노이즈 buildup
  const ns = makeBuf(0.7);
  addNoise(ns, env.exp(0.5, 0.18, 0.35));
  biquad(ns, "highpass", expRamp([[0, 8000], [0.6, 2000]]), 1);
  mixInto(buf, ns, 1, 0);
  // 임팩트 화음 (E2, E3, B3, E4 + 디튠)
  const padStart = 0.65;
  const chord = [82.41, 164.81, 246.94, 329.63];
  chord.forEach((f) => {
    [-7, 7].forEach((d) => {
      addOsc(buf, "saw", f * Math.pow(2, d / 1200),
        env.adsr(0.04, 0.4, 0.7, 0.9, 1.7, 0.16),
        padStart);
    });
  });
  // lowpass sweep on chord (filter automation은 이미 mix됐으니 전체 buf에 살짝)
  applyDelay(buf, 0.18, 0.42, 0.3);
  normalize(buf, 0.9);
  return buf;
}

// FANFARE-B: Tron 시스템 언락 (상승 사인 sweep + 영광스러운 bell + reverb)
function fanfareB() {
  const buf = makeBuf(2.2);
  // 상승 sweep (saw → 디지털)
  const sweep = makeBuf(0.5);
  addOsc(sweep, "saw",
    expRamp([[0, 100], [0.4, 1500]]),
    env.exp(0.02, 0.4, 0.25));
  biquad(sweep, "lowpass", expRamp([[0, 300], [0.4, 4000]]), 6);
  mixInto(buf, sweep, 1, 0);
  // 영광스러운 bell (E major 코드: E, G#, B 종소리 부분음)
  const bellStart = 0.45;
  const bellNotes = [329.63, 415.30, 493.88, 659.25];  // E4, G#4, B4, E5
  bellNotes.forEach((f, i) => {
    const startT = bellStart + i * 0.06;
    [1, 2.76].forEach((ratio) => {
      addOsc(buf, "sine", f * ratio,
        env.exp(0.002, ratio === 1 ? 1.2 : 0.5, ratio === 1 ? 0.22 : 0.08),
        startT);
    });
  });
  applyDelay(buf, 0.2, 0.5, 0.4);
  normalize(buf, 0.88);
  return buf;
}

// FANFARE-C: 사이버펑크 영웅 (sub kick + saw 화음 stab × 3)
function fanfareC() {
  const buf = makeBuf(2.0);
  // 3 stab (스타카토)
  const stabs = [0, 0.18, 0.42];
  stabs.forEach((startT) => {
    // sub kick
    addOsc(buf, "sine",
      expRamp([[0, 90], [0.1, 40]]),
      env.exp(0.002, 0.12, 0.45),
      startT);
    // saw stab (5도 쌓기)
    const chord = [110, 165, 220];  // A2, E3, A3
    chord.forEach((f) => {
      [-5, 5].forEach((d) => {
        addOsc(buf, "saw", f * Math.pow(2, d / 1200),
          env.exp(0.005, 0.15, 0.13),
          startT);
      });
    });
  });
  // 마지막 sustain pad (마무리)
  const padStart = 0.55;
  [110, 165, 220, 330].forEach((f) => {
    [-5, 5].forEach((d) => {
      addOsc(buf, "saw", f * Math.pow(2, d / 1200),
        env.adsr(0.05, 0.3, 0.5, 0.8, 1.4, 0.1),
        padStart);
    });
  });
  applyDelay(buf, 0.16, 0.4, 0.28);
  normalize(buf, 0.9);
  return buf;
}

// ============================================================
// REJECT — 코드 거부 (3 변형)
// ============================================================

// REJECT-A: 디스토피아 buzz (sub saw + 비팅 디튠)
function rejectA() {
  const buf = makeBuf(0.6);
  // sub saw 하강
  addOsc(buf, "saw",
    expRamp([[0, 85], [0.4, 55]]),
    env.exp(0.015, 0.4, 0.4));
  // 비팅 디튠 mid (불협)
  addOsc(buf, "saw",
    expRamp([[0, 277], [0.4, 166]]),
    env.exp(0.02, 0.35, 0.18));
  addOsc(buf, "saw",
    expRamp([[0, 285], [0.4, 171]]),
    env.exp(0.02, 0.35, 0.18));
  biquad(buf, "lowpass", 800, 3);
  applyDelay(buf, 0.06, 0.25, 0.18);
  normalize(buf, 0.85);
  return buf;
}

// REJECT-B: 디지털 글리치 + 짧은 buzz
function rejectB() {
  const buf = makeBuf(0.4);
  // 짧은 글리치 노이즈 (3 펄스)
  for (let i = 0; i < 3; i++) {
    const n = makeBuf(0.04);
    addNoise(n, env.exp(0.001, 0.03, 0.5));
    biquad(n, "bandpass", 800 + i * 200, 4);
    mixInto(buf, n, 1, i * 0.06);
  }
  // 마무리 sub (DENIED 임팩트)
  addOsc(buf, "sine",
    expRamp([[0, 100], [0.2, 50]]),
    env.exp(0.003, 0.22, 0.5), 0.18);
  applyDelay(buf, 0.05, 0.3, 0.2);
  normalize(buf, 0.85);
  return buf;
}

// REJECT-C: Half-Life 거부 (날카로운 high-low 두 톤)
function rejectC() {
  const buf = makeBuf(0.45);
  // tone 1 (high)
  addOsc(buf, "square", 660, env.ad(0.005, 0.1, 0.18), 0);
  // tone 2 (low)
  addOsc(buf, "square", 330, env.ad(0.005, 0.18, 0.18), 0.12);
  // sub
  addOsc(buf, "sine", 60, env.exp(0.005, 0.3, 0.4), 0.05);
  biquad(buf, "lowpass", 1500, 2);
  applyDelay(buf, 0.07, 0.35, 0.22);
  normalize(buf, 0.85);
  return buf;
}

// ============================================================
// ALARM — 타이머 종료 (3 변형)
// ============================================================

// ALARM-A: 클락슨 (saw pitch-bend × 3)
function alarmA() {
  const buf = makeBuf(1.4);
  for (let i = 0; i < 3; i++) {
    const t0 = i * 0.42;
    addOsc(buf, "saw",
      ramp([[0, 440], [0.13, 680], [0.28, 280]]),
      env.exp(0.01, 0.3, 0.32),
      t0);
    addOsc(buf, "sine",
      expRamp([[0, 80], [0.15, 45]]),
      env.exp(0.005, 0.18, 0.4),
      t0);
  }
  biquad(buf, "bandpass", 1100, 4);
  applyDelay(buf, 0.1, 0.3, 0.2);
  normalize(buf, 0.85);
  return buf;
}

// ALARM-B: 디지털 펄스 (square × 4 빠른 반복)
function alarmB() {
  const buf = makeBuf(1.2);
  for (let i = 0; i < 4; i++) {
    const t0 = i * 0.28;
    // alternating high-low
    const f = i % 2 === 0 ? 1100 : 700;
    addOsc(buf, "square", f, env.ad(0.003, 0.14, 0.25), t0);
    addOsc(buf, "sine", 80, env.exp(0.003, 0.12, 0.35), t0);
  }
  biquad(buf, "bandpass", 1000, 3);
  applyDelay(buf, 0.08, 0.25, 0.18);
  normalize(buf, 0.85);
  return buf;
}

// ALARM-C: 디스토피아 사이렌 (지속적 saw 톤이 위아래로 swing)
function alarmC() {
  const buf = makeBuf(2.0);
  // 사이렌처럼 위아래 swing하는 saw
  addOsc(buf, "saw",
    (t) => 400 + Math.sin(t * Math.PI * 2.2) * 200,  // 2.2Hz LFO
    env.adsr(0.05, 0.1, 0.8, 0.4, 1.95, 0.32));
  // sub kick on each "down" of swing
  for (let i = 0; i < 4; i++) {
    addOsc(buf, "sine",
      expRamp([[0, 80], [0.1, 45]]),
      env.exp(0.003, 0.12, 0.3),
      i * 0.45);
  }
  biquad(buf, "lowpass", 1400, 2.5);
  applyDelay(buf, 0.12, 0.3, 0.22);
  normalize(buf, 0.85);
  return buf;
}

// =========================== 실행 ===========================
console.log("SF 효과음 샘플 생성 중...");
console.log("\n[SEND]");
writeWav("send-01-laser.wav", send01());
writeWav("send-02-blip.wav", send02());
writeWav("send-03-twostep.wav", send03());
writeWav("send-04-burst.wav", send04());
writeWav("send-05-warp.wav", send05());
writeWav("send-06-mech.wav", send06());
writeWav("send-07-stab.wav", send07());
writeWav("send-08-glitch.wav", send08());
writeWav("send-09-radar.wav", send09());
writeWav("send-10-kick.wav", send10());
console.log("\n[RECEIVE]");
writeWav("receive-A-decrypt.wav", receiveA());
writeWav("receive-B-bell.wav", receiveB());
writeWav("receive-C-dualtone.wav", receiveC());
console.log("\n[FANFARE]");
writeWav("fanfare-A-bwaaam.wav", fanfareA());
writeWav("fanfare-B-tron.wav", fanfareB());
writeWav("fanfare-C-stab.wav", fanfareC());
console.log("\n[REJECT]");
writeWav("reject-A-dystopia.wav", rejectA());
writeWav("reject-B-glitch.wav", rejectB());
writeWav("reject-C-twoton.wav", rejectC());
console.log("\n[ALARM]");
writeWav("alarm-A-klaxon.wav", alarmA());
writeWav("alarm-B-pulse.wav", alarmB());
writeWav("alarm-C-siren.wav", alarmC());
console.log("\n완료.");
