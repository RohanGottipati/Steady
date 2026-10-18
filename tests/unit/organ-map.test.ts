import { describe, expect, it } from "vitest";
import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial } from "three";
import {
  buildOrganMap,
  cloneSceneWithMaterials,
  highlightOrgan,
  normalizeOrganName,
} from "@/components/scene/targets/organ-map";

describe("normalizeOrganName", () => {
  it.each([
    ["liver", "liver"],
    ["Cystic_Duct", "cystic-duct"],
    ["common_hepatic_duct.001", "bile-duct"],
    ["Gall Bladder_1", "gallbladder"],
    ["hepatic_artery", "hepatic-artery"],
    ["portal_vein", "portal-vein"],
    ["Scene", null],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeOrganName(input)).toBe(expected);
  });
});

function scene() {
  const root = new Group();
  root.name = "Scene";
  const material = new MeshStandardMaterial({ color: "#884422" });
  const liver = new Mesh(new BoxGeometry(), material);
  liver.name = "liver";
  const ductParent = new Group();
  ductParent.name = "cystic_duct";
  const duct = new Mesh(new BoxGeometry(), material);
  ductParent.add(duct);
  const other = new Mesh(new BoxGeometry(), material);
  other.name = "table";
  root.add(liver, ductParent, other);
  return { root, material };
}

describe("buildOrganMap", () => {
  it("maps named meshes and unnamed meshes under named nodes", () => {
    const { root } = scene();
    const organs = buildOrganMap(root);
    expect([...organs.keys()].sort()).toEqual(["cystic-duct", "liver"]);
    expect(organs.get("cystic-duct")).toHaveLength(1);
  });
});

describe("cloneSceneWithMaterials + highlightOrgan", () => {
  it("highlights a cloned organ without mutating the shared source material", () => {
    const { root, material } = scene();
    const clone = cloneSceneWithMaterials(root);
    const liver = buildOrganMap(clone).get("liver")!;
    expect(liver[0].material).not.toBe(material);
    expect(liver[0].geometry).toBe((root.children[0] as Mesh).geometry);

    highlightOrgan(liver, true);
    const highlighted = liver[0].material as MeshStandardMaterial;
    expect(highlighted.emissiveIntensity).toBeGreaterThan(0);
    expect(material.emissiveIntensity).toBe(1);
    expect(material.emissive.equals(new Color(0, 0, 0))).toBe(true);

    highlightOrgan(liver, false);
    expect(highlighted.emissiveIntensity).toBe(0);
  });
});
