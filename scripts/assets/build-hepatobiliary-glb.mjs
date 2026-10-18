#!/usr/bin/env node
/**
 * Builds public/models/patient/hepatobiliary-anatomy.glb from BodyParts3D (DBCLS) OBJ meshes.
 *
 * License: BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0
 * International (https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html). See docs/ASSET_LICENSES.md.
 *
 * Usage:
 *   node scripts/assets/build-hepatobiliary-glb.mjs [--source <dir with FJ*.obj>]
 * Without --source the official part_of OBJ archive (~65 MB) is downloaded into .cache/bodyparts3d/.
 *
 * Output convention (glTF, metres): +X = patient left, +Y = superior, +Z = anterior.
 * The origin is the gallbladder/cystic-duct junction (Calot's triangle region).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Document, NodeIO } from "@gltf-transform/core";
import { KHRMeshQuantization } from "@gltf-transform/extensions";
import { dedup, prune, quantize, simplifyPrimitive, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ARCHIVE_URL = "https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/partof_BP3D_4.0_obj_99.zip";
const OUTPUT = path.join(ROOT, "public/models/patient/hepatobiliary-anatomy.glb");

/** Organ → BodyParts3D element files (part_of build, version 4.0) plus display material. */
const ORGANS = [
  {
    name: "liver",
    // Caudate lobe and hepatovenous segments II–VIII form the parenchyma surface.
    files: ["FJ2816", "FJ2818", "FJ2819", "FJ2820", "FJ2821", "FJ2822", "FJ2409", "FJ2823", "FJ2824"],
    ratio: 0.12,
    color: [0.36, 0.12, 0.09],
    roughness: 0.42,
  },
  { name: "gallbladder", files: ["FJ2817"], ratio: 0.6, color: [0.33, 0.42, 0.2], roughness: 0.32 },
  { name: "cystic_duct", files: ["FJ3080"], ratio: 1, color: [0.68, 0.66, 0.38], roughness: 0.4 },
  {
    name: "common_hepatic_duct",
    files: ["FJ3079", "FJ3096", "FJ3123"],
    ratio: 0.6,
    color: [0.62, 0.62, 0.36],
    roughness: 0.4,
  },
  { name: "hepatic_artery", files: ["FJ3078", "FJ3081"], ratio: 1, color: [0.62, 0.08, 0.09], roughness: 0.35 },
  { name: "portal_vein", files: ["FJ1853"], ratio: 0.5, color: [0.2, 0.24, 0.45], roughness: 0.38 },
];

function sourceDir() {
  const flag = process.argv.indexOf("--source");
  if (flag !== -1 && process.argv[flag + 1]) return path.resolve(process.argv[flag + 1]);
  const cache = path.join(ROOT, ".cache/bodyparts3d");
  const extracted = path.join(cache, "partof_BP3D_4.0_obj_99");
  if (existsSync(path.join(extracted, "FJ2817.obj"))) return extracted;
  mkdirSync(cache, { recursive: true });
  const zip = path.join(cache, "partof_BP3D_4.0_obj_99.zip");
  console.log(`Downloading ${ARCHIVE_URL}`);
  execFileSync("curl", ["-fsSL", "-o", zip, ARCHIVE_URL], { stdio: "inherit" });
  execFileSync("unzip", ["-q", "-o", zip, "-d", cache], { stdio: "inherit" });
  return extracted;
}

/** Minimal triangle OBJ reader: positions (mm, BodyParts3D frame) and face indices. */
function readObj(file) {
  const positions = [];
  const indices = [];
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line.startsWith("v ")) {
      const [, x, y, z] = line.trim().split(/\s+/).map(Number);
      // BodyParts3D: +X patient left, +Y posterior, +Z superior (mm) → glTF metres.
      positions.push(x / 1000, z / 1000, -y / 1000);
    } else if (line.startsWith("f ")) {
      const face = line.trim().split(/\s+/).slice(1).map(token => Number.parseInt(token, 10) - 1);
      for (let i = 1; i + 1 < face.length; i++) indices.push(face[0], face[i], face[i + 1]);
    }
  }
  return { positions, indices };
}

function mergeFiles(dir, files) {
  const positions = [];
  const indices = [];
  for (const id of files) {
    const part = readObj(path.join(dir, `${id}.obj`));
    const offset = positions.length / 3;
    positions.push(...part.positions);
    for (const index of part.indices) indices.push(index + offset);
  }
  return { positions, indices };
}

function centroid(parts) {
  const sum = [0, 0, 0];
  let count = 0;
  for (const { positions } of parts) {
    for (let i = 0; i < positions.length; i += 3) {
      sum[0] += positions[i];
      sum[1] += positions[i + 1];
      sum[2] += positions[i + 2];
      count++;
    }
  }
  return sum.map(value => value / count);
}

/** Area-weighted smooth vertex normals (gltf-transform's normals() emits flat normals). */
function smoothNormals(document, buffer, prim) {
  const position = prim.getAttribute("POSITION").getArray();
  const index = prim.getIndices().getArray();
  const normal = new Float32Array(position.length);
  for (let i = 0; i < index.length; i += 3) {
    const [a, b, c] = [index[i] * 3, index[i + 1] * 3, index[i + 2] * 3];
    const e1 = [position[b] - position[a], position[b + 1] - position[a + 1], position[b + 2] - position[a + 2]];
    const e2 = [position[c] - position[a], position[c + 1] - position[a + 1], position[c + 2] - position[a + 2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) normal[v + k] += n[k];
  }
  for (let i = 0; i < normal.length; i += 3) {
    const length = Math.hypot(normal[i], normal[i + 1], normal[i + 2]) || 1;
    normal[i] /= length;
    normal[i + 1] /= length;
    normal[i + 2] /= length;
  }
  return document.createAccessor().setType("VEC3").setArray(normal).setBuffer(buffer);
}

async function main() {
  const dir = sourceDir();
  const geometry = ORGANS.map(organ => ({ organ, ...mergeFiles(dir, organ.files) }));
  const pivot = centroid(geometry.filter(({ organ }) => organ.name === "gallbladder" || organ.name === "cystic_duct"));

  const document = new Document();
  document.createExtension(KHRMeshQuantization).setRequired(true);
  const buffer = document.createBuffer();
  const scene = document.createScene("hepatobiliary-anatomy");
  const root = document.createNode("hepatobiliary-anatomy");
  scene.addChild(root);
  const simplifyTargets = [];

  for (const { organ, positions, indices } of geometry) {
    const local = Float32Array.from(positions, (value, i) => value - pivot[i % 3]);
    const position = document.createAccessor(`${organ.name}-position`).setType("VEC3").setArray(local).setBuffer(buffer);
    const index = document.createAccessor(`${organ.name}-index`).setType("SCALAR").setArray(Uint32Array.from(indices)).setBuffer(buffer);
    const material = document
      .createMaterial(organ.name)
      .setBaseColorFactor([...organ.color, 1])
      .setRoughnessFactor(organ.roughness)
      .setMetallicFactor(0);
    const primitive = document.createPrimitive().setAttribute("POSITION", position).setIndices(index).setMaterial(material);
    const mesh = document.createMesh(organ.name).addPrimitive(primitive);
    root.addChild(document.createNode(organ.name).setMesh(mesh));
    simplifyTargets.push({ mesh, ratio: organ.ratio });
  }

  await document.transform(weld());
  await MeshoptSimplifier.ready;
  // Per-organ ratios keep thin ducts/vessels intact while reducing the dense liver parenchyma.
  for (const { mesh, ratio } of simplifyTargets) {
    if (ratio >= 1) continue;
    for (const prim of mesh.listPrimitives()) {
      simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error: 0.0008, lockBorder: false });
    }
  }
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) prim.setAttribute("NORMAL", smoothNormals(document, buffer, prim));
  }
  await document.transform(dedup(), prune(), quantize({ quantizePosition: 14, quantizeNormal: 10 }));

  mkdirSync(path.dirname(OUTPUT), { recursive: true });
  const glb = await new NodeIO().registerExtensions([KHRMeshQuantization]).writeBinary(document);
  writeFileSync(OUTPUT, glb);
  let triangles = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) triangles += (prim.getIndices()?.getCount() ?? 0) / 3;
  }
  console.log(`Wrote ${path.relative(ROOT, OUTPUT)} (${(glb.byteLength / 1024).toFixed(1)} KiB, ${triangles} triangles)`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
