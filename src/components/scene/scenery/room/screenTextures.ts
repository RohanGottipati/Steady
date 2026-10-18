import * as THREE from "three";

/**
 * Static canvas-drawn screen textures (vitals, endoscope, PACS…). Drawn once, cached,
 * and rendered with unlit materials so monitors read as glowing displays at zero per-frame cost.
 */
export type ScreenKind =
  | "vitals"
  | "endoscope"
  | "anesthesia"
  | "pacs"
  | "status"
  | "clock"
  | "esu"
  | "pump";

const MONO = '"Geist Mono", ui-monospace, Menlo, monospace';
const SANS = "Geist, ui-sans-serif, system-ui, sans-serif";
const materialCache = new Map<ScreenKind, THREE.MeshBasicMaterial>();

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function createTexture(w: number, h: number, draw: Draw) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

type WaveKind = "ecg" | "pleth" | "art" | "co2" | "paw";

function waveValue(kind: WaveKind, ph: number) {
  if (kind === "ecg") {
    if (ph < 0.1) return Math.sin((ph / 0.1) * Math.PI) * 0.12;
    if (ph < 0.16) return 0;
    if (ph < 0.18) return -0.15;
    if (ph < 0.21) return 1;
    if (ph < 0.24) return -0.35;
    if (ph < 0.4) return 0;
    if (ph < 0.55) return Math.sin(((ph - 0.4) / 0.15) * Math.PI) * 0.25;
    return 0;
  }
  if (kind === "pleth") {
    const main = Math.pow(Math.max(0, Math.sin(ph * Math.PI * 2)), 1.4) * 0.85;
    const notch =
      ph > 0.55 && ph < 0.7
        ? Math.sin(((ph - 0.55) / 0.15) * Math.PI) * 0.12
        : 0;
    return main + notch - 0.35;
  }
  if (kind === "art") {
    const v =
      ph < 0.18
        ? Math.sin(((ph / 0.18) * Math.PI) / 2) * 0.9
        : 0.9 * Math.exp(-(ph - 0.18) * 3.2);
    return v + (ph > 0.32 && ph < 0.4 ? 0.08 : 0) - 0.35;
  }
  if (kind === "paw") {
    return ph < 0.35
      ? Math.min(1, ph / 0.12) * 0.75 - 0.35
      : ph < 0.45
        ? 0.4 - ((ph - 0.35) / 0.1) * 0.75
        : -0.35;
  }
  const v =
    ph < 0.1
      ? (ph / 0.1) * 0.8
      : ph < 0.5
        ? 0.8
        : ph < 0.58
          ? 0.8 - ((ph - 0.5) / 0.08) * 0.8
          : 0;
  return v - 0.4;
}

function drawWave(
  ctx: CanvasRenderingContext2D,
  kind: WaveKind,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  cycles = 4,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i <= w; i += 2) {
    const ph = ((i / w) * cycles) % 1;
    const py = y + h / 2 - waveValue(kind, ph) * h * 0.42;
    if (i === 0) ctx.moveTo(x + i, py);
    else ctx.lineTo(x + i, py);
  }
  ctx.stroke();
}

const drawers: Record<ScreenKind, [number, number, Draw]> = {
  vitals: [
    1024,
    640,
    (ctx, w, h) => {
      ctx.fillStyle = "#03090c";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#0c1a21";
      ctx.fillRect(0, 0, w, 44);
      ctx.font = `600 20px ${MONO}`;
      ctx.fillStyle = "#8fb3c4";
      ctx.fillText("OR 3 · BED 1 · ADULT", 18, 29);
      ctx.textAlign = "right";
      ctx.fillText("STEADY SKILLS LAB  09:41", w - 18, 29);
      ctx.textAlign = "left";
      const rows: {
        label: string;
        color: string;
        value: string;
        unit: string;
        wave: WaveKind;
      }[] = [
        {
          label: "ECG II",
          color: "#3ef08a",
          value: "72",
          unit: "HR bpm",
          wave: "ecg",
        },
        {
          label: "PLETH",
          color: "#38d6f5",
          value: "98",
          unit: "SpO₂ %",
          wave: "pleth",
        },
        {
          label: "ART",
          color: "#ff5f5f",
          value: "118/76",
          unit: "mmHg (90)",
          wave: "art",
        },
        {
          label: "CO₂",
          color: "#f5d13b",
          value: "35",
          unit: "EtCO₂",
          wave: "co2",
        },
      ];

      const rowH = (h - 60) / rows.length;
      rows.forEach((r, i) => {
        const y = 52 + i * rowH;
        ctx.strokeStyle = "#11222b";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y + rowH);
        ctx.lineTo(w, y + rowH);
        ctx.stroke();
        ctx.font = `600 18px ${MONO}`;
        ctx.fillStyle = r.color;
        ctx.fillText(r.label, 18, y + 24);
        drawWave(
          ctx,
          r.wave,
          18,
          y + 26,
          w * 0.6,
          rowH - 34,
          r.color,
          r.wave === "co2" ? 2 : 4,
        );
        ctx.font = `700 ${r.value.length > 3 ? 54 : 74}px ${SANS}`;
        ctx.textAlign = "right";
        ctx.fillText(r.value, w - 24, y + rowH - 26);
        ctx.font = `500 18px ${MONO}`;
        ctx.globalAlpha = 0.75;
        ctx.fillText(r.unit, w - 24, y + 26);
        ctx.globalAlpha = 1;
        ctx.textAlign = "left";
      });
    },
  ],

  endoscope: [
    1024,
    600,
    (ctx, w, h) => {
      ctx.fillStyle = "#040608";
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 270, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "#5a1e22";
      ctx.fillRect(0, 0, w, h);
      const blobs: [number, number, number, number, string][] = [
        [430, 260, 210, 120, "#7f3131"],
        [600, 340, 180, 110, "#97443d"],
        [480, 380, 140, 70, "#b45a4c"],
        [560, 230, 120, 60, "#c46e5d"],
        [520, 300, 60, 24, "#e2a08b"],
        [470, 215, 30, 10, "#f5d6c8"],
        [610, 330, 24, 8, "#f5d6c8"],
      ];

      blobs.forEach(([x, y, rx, ry, c]) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, -0.3, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = "#9aa4ab";
      ctx.beginPath();
      ctx.moveTo(w, h);
      ctx.lineTo(w, h - 60);
      ctx.lineTo(560, 300);
      ctx.lineTo(545, 320);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#d4dbe0";
      ctx.beginPath();
      ctx.moveTo(560, 300);
      ctx.lineTo(520, 280);
      ctx.lineTo(545, 320);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.font = `600 20px ${MONO}`;
      ctx.fillStyle = "#9fe3ff";
      ctx.fillText("LAP CAM 1 · 30°", 24, 36);
      ctx.textAlign = "right";
      ctx.fillText("00:12:41", w - 24, 36);
      ctx.fillText("4K", w - 24, h - 24);
    },
  ],

  anesthesia: [
    768,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = "#041014";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#0d2027";
      ctx.fillRect(0, 0, w, 40);
      ctx.font = `600 18px ${MONO}`;
      ctx.fillStyle = "#7fd4e8";
      ctx.fillText("VENT · VCV", 16, 27);
      drawWave(ctx, "paw", 16, 60, w * 0.62, 150, "#f5d13b", 3);
      drawWave(ctx, "co2", 16, 230, w * 0.62, 120, "#7fd4e8", 2);
      const vals = [
        ["VT", "450"],
        ["RR", "12"],
        ["PEEP", "5"],
        ["FiO₂", "50%"],
        ["SEVO", "2.0"],
      ];

      vals.forEach(([k, v], i) => {
        const y = 80 + i * 82;
        ctx.font = `500 16px ${MONO}`;
        ctx.fillStyle = "#7fa3b0";
        ctx.fillText(k, w * 0.7, y);
        ctx.font = `700 40px ${SANS}`;
        ctx.fillStyle = i === 4 ? "#f5d13b" : "#e8f6fb";
        ctx.fillText(v, w * 0.7, y + 40);
      });
    },
  ],

  pacs: [
    1024,
    576,
    (ctx, w, h) => {
      ctx.fillStyle = "#020303";
      ctx.fillRect(0, 0, w, h);
      [0, 1].forEach((p) => {
        const ox = 40 + p * (w / 2);
        const cx = ox + w / 4 - 40;
        ctx.fillStyle = "#0d0f10";
        ctx.fillRect(ox, 40, w / 2 - 80, h - 80);
        ctx.fillStyle = "#2b2e30";
        ctx.beginPath();
        ctx.ellipse(cx - 70, 290, 70, 150, 0.08, 0, Math.PI * 2);
        ctx.ellipse(cx + 70, 290, 70, 150, -0.08, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#b9bcbd";
        ctx.fillRect(cx - 12, 90, 24, 400);
        ctx.strokeStyle = "#8d9192";
        ctx.lineWidth = 6;
        for (let r = 0; r < 8; r++) {
          const y = 150 + r * 38;
          ctx.beginPath();
          ctx.ellipse(
            cx,
            y,
            150 - r * 4,
            34,
            0,
            Math.PI * 1.05,
            Math.PI * 1.95,
          );
          ctx.stroke();
        }
        ctx.fillStyle = "#5c6061";
        ctx.beginPath();
        ctx.ellipse(cx + 30, 350, 60, 70, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `500 16px ${MONO}`;
        ctx.fillStyle = "#c9d1d4";
        ctx.fillText(
          p === 0 ? "PA CHEST · ID 0412" : "LAT · ID 0412",
          ox + 14,
          64,
        );
      });
    },
  ],

  status: [
    1024,
    640,
    (ctx, w, h) => {
      ctx.fillStyle = "#0c1a23";
      ctx.fillRect(0, 0, w, h);
      ctx.font = `700 46px ${SANS}`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText("OR 3 · Skills Lab", 40, 80);
      ctx.font = `500 22px ${MONO}`;
      ctx.fillStyle = "#7fb5d6";
      ctx.fillText("SAT 17 OCT 2026", 40, 118);
      const rows: [string, string, string][] = [
        ["08:00", "Needle passing drill", "#2fd38a"],
        ["09:30", "Peg transfer · practice", "#62a9e6"],
        ["11:00", "Suturing fundamentals", "#f2a93b"],
        ["13:30", "Knot tying · assessment", "#62a9e6"],
      ];

      rows.forEach(([t, label, c], i) => {
        const y = 190 + i * 92;
        ctx.fillStyle = "#132632";
        ctx.fillRect(40, y - 46, w - 80, 76);
        ctx.font = `600 26px ${MONO}`;
        ctx.fillStyle = "#9fc4da";
        ctx.fillText(t, 64, y);
        ctx.font = `600 30px ${SANS}`;
        ctx.fillStyle = "#f2f7fa";
        ctx.fillText(label, 210, y);
        ctx.fillStyle = c;
        ctx.fillRect(w - 110, y - 22, 40, 16);
      });
    },
  ],

  clock: [
    256,
    256,
    (ctx, w) => {
      const c = w / 2;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(c, c, 124, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1c2328";
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2;
        const long = i % 5 === 0;
        ctx.lineWidth = long ? 6 : 2;
        ctx.beginPath();
        ctx.moveTo(
          c + Math.sin(a) * (long ? 92 : 104),
          c - Math.cos(a) * (long ? 92 : 104),
        );
        ctx.lineTo(c + Math.sin(a) * 114, c - Math.cos(a) * 114);
        ctx.stroke();
      }
      const hand = (a: number, len: number, wdt: number, col: string) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = wdt;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.lineTo(c + Math.sin(a) * len, c - Math.cos(a) * len);
        ctx.stroke();
      };
      hand((9.68 / 12) * Math.PI * 2, 60, 9, "#1c2328");
      hand((41 / 60) * Math.PI * 2, 90, 6, "#1c2328");
      hand((12 / 60) * Math.PI * 2, 100, 2.5, "#d13b3b");
    },
  ],

  esu: [
    256,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = "#071012";
      ctx.fillRect(0, 0, w, h);
      ctx.font = `700 44px ${SANS}`;
      ctx.fillStyle = "#ffd54a";
      ctx.fillText("35", 18, 62);
      ctx.fillStyle = "#5ab8ff";
      ctx.fillText("30", 140, 62);
      ctx.font = `600 16px ${MONO}`;
      ctx.fillStyle = "#9fb3bc";
      ctx.fillText("CUT W", 18, 100);
      ctx.fillText("COAG W", 140, 100);
    },
  ],

  pump: [
    256,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = "#062026";
      ctx.fillRect(0, 0, w, h);
      ctx.font = `700 46px ${SANS}`;
      ctx.fillStyle = "#7ff0e0";
      ctx.fillText("125", 20, 70);
      ctx.font = `600 18px ${MONO}`;
      ctx.fillText("mL/h", 120, 70);
      ctx.fillStyle = "#9fc4c9";
      ctx.fillText("NaCl 0.9%", 20, 106);
    },
  ],
};

export function getScreenMaterial(kind: ScreenKind) {
  const cached = materialCache.get(kind);
  if (cached) return cached;
  const [w, h, draw] = drawers[kind];
  const mat = new THREE.MeshBasicMaterial({
    map: createTexture(w, h, draw),
    toneMapped: false,
  });
  materialCache.set(kind, mat);
  return mat;
}
