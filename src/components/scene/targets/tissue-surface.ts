import { CanvasTexture, PlaneGeometry, RepeatWrapping, SRGBColorSpace, type Texture } from "three";

export interface TissueIncision {
  /** Pad-relative incision line (x) and extent along y. */
  x: number;
  yStart: number;
  yEnd: number;
  depth: number;
  halfWidth: number;
}

export interface TissueSurfaceSpec {
  width: number;
  depth: number;
  height: number;
  incision?: TissueIncision;
}

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Height of the raised skin surface above the dermis top at pad-relative (x, y). Zero at the rim. */
export function tissueSurfaceHeight(spec: TissueSurfaceSpec, x: number, y: number): number {
  const u = Math.abs(x) / (spec.width / 2);
  const v = Math.abs(y) / (spec.depth / 2);
  const r = Math.pow(Math.pow(u, 6) + Math.pow(v, 6), 1 / 6);
  if (r >= 1) return 0;
  const shoulder = 1 - smoothstep(0.8, 1, r);
  let z = spec.height * shoulder * (0.8 + 0.2 * (1 - r * r));
  const cut = spec.incision;
  if (cut && y >= cut.yStart && y <= cut.yEnd) {
    const along = (y - cut.yStart) / (cut.yEnd - cut.yStart);
    const taper = Math.sin(Math.PI * along) ** 0.5;
    const dx = x - cut.x;
    z -= cut.depth * taper * Math.exp(-((dx / cut.halfWidth) ** 2));
    z += cut.depth * 0.25 * taper * Math.exp(-(((Math.abs(dx) - cut.halfWidth * 2.2) / cut.halfWidth) ** 2));
  }
  return z;
}

/** Raised skin sheet in the local XY plane (+Z up), centred on the pad. */
export function buildTissueSurfaceGeometry(spec: TissueSurfaceSpec, segmentsX = 120, segmentsY = 80) {
  const geometry = new PlaneGeometry(spec.width, spec.depth, segmentsX, segmentsY);
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    position.setZ(i, tissueSurfaceHeight(spec, position.getX(i), position.getY(i)));
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function hash(x: number, y: number) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Tileable value noise with integer period. */
function noise(x: number, y: number, period: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
  const w = (n: number) => ((n % period) + period) % period;
  const a = hash(w(xi), w(yi)), b = hash(w(xi + 1), w(yi));
  const c = hash(w(xi), w(yi + 1)), d = hash(w(xi + 1), w(yi + 1));
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number, base: number) {
  let sum = 0, amp = 0.5, freq = 1;
  for (let o = 0; o < 4; o++) {
    sum += amp * noise(x * base * freq, y * base * freq, base * freq);
    amp *= 0.5;
    freq *= 2;
  }
  return sum;
}

export interface TissueTextures {
  map: Texture;
  bump: Texture;
}

const cache = new Map<string, TissueTextures | null>();

/**
 * Procedural skin/tissue textures (colour + bump), generated once per tint and cached for the
 * page lifetime. Returns null where 2D canvas is unavailable (SSR/tests).
 */
export function tissueTextures(tint: readonly [number, number, number], key: string): TissueTextures | null {
  if (cache.has(key)) return cache.get(key)!;
  let result: TissueTextures | null = null;
  if (typeof document !== "undefined" && !/jsdom/i.test(globalThis.navigator?.userAgent ?? "")) {
    const size = 256;
    const colour = document.createElement("canvas");
    const bump = document.createElement("canvas");
    colour.width = colour.height = bump.width = bump.height = size;
    const cctx = colour.getContext("2d"), bctx = bump.getContext("2d");
    if (cctx && bctx) {
      const cImage = cctx.createImageData(size, size), bImage = bctx.createImageData(size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = x / size, v = y / size;
          const mottling = fbm(u, v, 6);
          const blotch = noise(u * 3, v * 3, 3);
          const fine = fbm(u, v, 48);
          const pore = hash(x, y) > 0.985 ? 1 : 0;
          const shade = 0.88 + 0.18 * mottling - 0.06 * pore;
          const i = (y * size + x) * 4;
          cImage.data[i] = Math.min(255, tint[0] * shade + 14 * blotch);
          cImage.data[i + 1] = Math.min(255, tint[1] * shade - 6 * blotch);
          cImage.data[i + 2] = Math.min(255, tint[2] * shade - 4 * blotch);
          cImage.data[i + 3] = 255;
          const height = 140 + 70 * (fine - 0.5) + 30 * (mottling - 0.5) - 90 * pore;
          bImage.data[i] = bImage.data[i + 1] = bImage.data[i + 2] = Math.max(0, Math.min(255, height));
          bImage.data[i + 3] = 255;
        }
      }
      cctx.putImageData(cImage, 0, 0);
      bctx.putImageData(bImage, 0, 0);
      const map = new CanvasTexture(colour);
      map.colorSpace = SRGBColorSpace;
      const bumpTexture = new CanvasTexture(bump);
      for (const texture of [map, bumpTexture]) {
        texture.wrapS = texture.wrapT = RepeatWrapping;
        texture.repeat.set(2, 2);
        texture.anisotropy = 4;
      }
      result = { map, bump: bumpTexture };
    }
  }
  cache.set(key, result);
  return result;
}
