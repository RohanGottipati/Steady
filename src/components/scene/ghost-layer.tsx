"use client";

import { forwardRef, useEffect, useMemo } from "react";
import {
  BufferGeometry,
  CatmullRomCurve3,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  TubeGeometry,
  Vector3,
} from "three";
import type { GhostSnapshot } from "@/lib/exercise/ghost-playback";
import type { GhostTrailData } from "@/lib/exercise/ghost-reference";
import { TIP_OFFSET, type Pose } from "@/lib/simulation/tool-simulation";
import type { Vec3 } from "@/types";

const GHOST_OPACITY = 0.5;

function applyPose(group: Group, pose: Pose) {
  group.position.set(pose.position.x, pose.position.y, pose.position.z);
  group.quaternion.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);
}

function updateJaws(group: Group, jawClosed: boolean) {
  for (const [name, sign] of [
    ["jaw-left", -1],
    ["jaw-right", 1],
  ] as const) {
    const jaw = group.getObjectByName(name);
    if (jaw) {
      jaw.rotation.z = jawClosed ? 0 : sign * -0.24;
      jaw.position.x = jawClosed ? sign * 0.006 : 0;
    }
  }
}

function setLinePoints(line: Line, points: readonly Vec3[]) {
  const coords = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    coords[i * 3] = points[i].x;
    coords[i * 3 + 1] = points[i].y;
    coords[i * 3 + 2] = points[i].z;
  }
  line.geometry.setAttribute("position", new Float32BufferAttribute(coords, 3));
  line.geometry.computeBoundingSphere();
}

function updateTubeGeometry(mesh: Mesh, points: readonly Vec3[]) {
  if (points.length < 2) return;
  const vectors = points.map(p => new Vector3(p.x, p.y, p.z + 0.01));
  const curve = new CatmullRomCurve3(vectors);
  const nextGeo = new TubeGeometry(curve, Math.min(96, Math.max(24, points.length)), 0.0055, 8, false);
  mesh.geometry.dispose();
  mesh.geometry = nextGeo;
}

export function updateGhostLayer(
  root: Group | null,
  snapshot: GhostSnapshot | null,
  trailData?: GhostTrailData,
) {
  if (!root) return;
  if (!snapshot || !snapshot.visible) {
    root.visible = false;
    return;
  }

  root.visible = true;

  const showBothTools = snapshot.referenceId === "peg-transfer-reference-v1";
  const leftGroup = root.getObjectByName("ghost-left-instrument");
  if (leftGroup instanceof Group) {
    leftGroup.visible = showBothTools || snapshot.activeSide === "left";
    applyPose(leftGroup, snapshot.leftPose);
    updateJaws(leftGroup, snapshot.leftTool.jawClosed);
  }

  const rightGroup = root.getObjectByName("ghost-right-instrument");
  if (rightGroup instanceof Group) {
    const showRight = showBothTools || snapshot.activeSide === "right";
    rightGroup.visible = showRight;
    applyPose(rightGroup, showBothTools ? snapshot.rightPose : showRight ? snapshot.leftPose : snapshot.rightPose);
    updateJaws(rightGroup, showBothTools ? snapshot.rightTool.jawClosed : snapshot.leftTool.jawClosed);
  }

  const needleGroup = root.getObjectByName("ghost-needle");
  if (needleGroup instanceof Group) {
    needleGroup.visible = !showBothTools && snapshot.needleHeldBy !== null;
    if (snapshot.needleHeldBy !== null) {
      applyPose(needleGroup, snapshot.needlePose);
    }
  }

  const leftTip = root.getObjectByName("ghost-left-tip");
  if (leftTip) {
    leftTip.visible = true;
    leftTip.position.set(
      snapshot.leftTool.tipPosition.x,
      snapshot.leftTool.tipPosition.y,
      snapshot.leftTool.tipPosition.z + 0.03,
    );
  }

  const rightTip = root.getObjectByName("ghost-right-tip");
  if (rightTip) {
    rightTip.visible = false;
    rightTip.position.set(
      snapshot.rightTool.tipPosition.x,
      snapshot.rightTool.tipPosition.y,
      snapshot.rightTool.tipPosition.z,
    );
  }

  const trailGroup = root.getObjectByName("ghost-trail-group");
  if (trailGroup instanceof Group) {
    trailGroup.visible = snapshot.showTrail;
    const rightLine = trailGroup.getObjectByName("right-ghost-trail");
    if (rightLine) rightLine.visible = showBothTools;
    if (trailData && trailGroup.userData.referenceId !== snapshot.referenceId) {
      const leftLine = trailGroup.getObjectByName("left-ghost-trail");
      if (leftLine instanceof Line) {
        setLinePoints(leftLine, trailData.leftTipPoints);
      }
      if (rightLine instanceof Line) {
        setLinePoints(rightLine, trailData.rightTipPoints);
      }
      const tubeMesh = trailGroup.getObjectByName("ghost-path-tube");
      if (tubeMesh instanceof Mesh) {
        updateTubeGeometry(tubeMesh, trailData.leftTipPoints);
      }
      trailGroup.userData.referenceId = snapshot.referenceId;
    }
  }
}

function GhostInstrument({ side }: { side: "left" | "right" }) {
  const accent = side === "left" ? "#38bdf8" : "#fbbf24";
  const bodyColor = side === "left" ? "#bae6fd" : "#fde68a";
  return (
    <group name={`ghost-${side}-instrument`} renderOrder={14}>
      {side === "left" ? (
        <>
          {[-1, 1].map(sign => (
            <group key={sign}>
              <mesh position={[sign * 0.025, 0.025, 0]} rotation={[0, 0, sign * 0.045]}>
                <boxGeometry args={[0.018, 0.49, 0.025]} />
                <meshStandardMaterial
                  color={bodyColor}
                  emissive={accent}
                  emissiveIntensity={0.6}
                  transparent
                  opacity={GHOST_OPACITY}
                  depthWrite={false}
                />
              </mesh>
            </group>
          ))}
          <mesh position={[0, -0.21, 0]}>
            <boxGeometry args={[0.068, 0.03, 0.027]} />
            <meshStandardMaterial
              color={accent}
              emissive={accent}
              emissiveIntensity={0.75}
              transparent
              opacity={GHOST_OPACITY + 0.1}
              depthWrite={false}
            />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[0, 0.115, 0]}>
            <boxGeometry args={[0.021, 0.31, 0.025]} />
            <meshStandardMaterial
              color={bodyColor}
              emissive={accent}
              emissiveIntensity={0.6}
              transparent
              opacity={GHOST_OPACITY}
              depthWrite={false}
            />
          </mesh>
          <mesh position={[0, -0.035, 0]}>
            <boxGeometry args={[0.11, 0.1, 0.045]} />
            <meshStandardMaterial
              color={bodyColor}
              emissive={accent}
              emissiveIntensity={0.5}
              transparent
              opacity={GHOST_OPACITY}
              depthWrite={false}
            />
          </mesh>
          <mesh position={[0.065, -0.16, 0]} rotation={[0, 0, 0.38]}>
            <boxGeometry args={[0.065, 0.22, 0.047]} />
            <meshStandardMaterial
              color={bodyColor}
              emissive={accent}
              emissiveIntensity={0.5}
              transparent
              opacity={GHOST_OPACITY}
              depthWrite={false}
            />
          </mesh>
          <mesh position={[0, 0.025, 0]}>
            <boxGeometry args={[0.055, 0.025, 0.04]} />
            <meshStandardMaterial
              color={accent}
              emissive={accent}
              emissiveIntensity={0.75}
              transparent
              opacity={GHOST_OPACITY + 0.1}
              depthWrite={false}
            />
          </mesh>
        </>
      )}
      {[-1, 1].map(sign => (
        <group
          key={sign}
          name={sign < 0 ? "jaw-left" : "jaw-right"}
          position={[0, TIP_OFFSET.y - 0.08, 0]}
        >
          <mesh position={[0, 0.04, 0]}>
            <boxGeometry args={[0.012, 0.08, side === "left" ? 0.018 : 0.027]} />
            <meshStandardMaterial
              color="#ffffff"
              emissive={accent}
              emissiveIntensity={0.85}
              transparent
              opacity={GHOST_OPACITY + 0.15}
              depthWrite={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export const GhostLayer = forwardRef<Group>(function GhostLayer(_, ref) {
  const needleCurve = useMemo(
    () =>
      new CatmullRomCurve3(
        Array.from({ length: 25 }, (_, i) => {
          const angle = (i / 24 - 0.5) * Math.PI * 1.4;
          return new Vector3(0.13 * Math.sin(angle), 0.13 * (Math.cos(angle) - 1), 0);
        }),
      ),
    [],
  );

  const { leftLine, rightLine } = useMemo(() => {
    const leftGeo = new BufferGeometry();
    const leftMat = new LineBasicMaterial({
      color: "#38bdf8",
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    const lLine = new Line(leftGeo, leftMat);
    lLine.name = "left-ghost-trail";
    lLine.renderOrder = 8;

    const rightGeo = new BufferGeometry();
    const rightMat = new LineBasicMaterial({
      color: "#fbbf24",
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const rLine = new Line(rightGeo, rightMat);
    rLine.name = "right-ghost-trail";
    rLine.renderOrder = 8;

    return { leftLine: lLine, rightLine: rLine };
  }, []);

  useEffect(() => {
    return () => {
      leftLine.geometry.dispose();
      if (leftLine.material instanceof LineBasicMaterial) leftLine.material.dispose();
      rightLine.geometry.dispose();
      if (rightLine.material instanceof LineBasicMaterial) rightLine.material.dispose();
    };
  }, [leftLine, rightLine]);

  return (
    <group ref={ref} visible={false} name="ghost-layer">
      <group name="ghost-trail-group">
        <primitive object={leftLine} />
        <primitive object={rightLine} />
        <mesh name="ghost-path-tube" renderOrder={9}>
          <bufferGeometry />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.32} depthWrite={false} />
        </mesh>
      </group>
      <GhostInstrument side="left" />
      <GhostInstrument side="right" />
      <group name="ghost-needle" visible={false} renderOrder={15}>
        <mesh>
          <tubeGeometry args={[needleCurve, 24, 0.009, 6, false]} />
          <meshStandardMaterial
            color="#e0f2fe"
            emissive="#38bdf8"
            emissiveIntensity={0.8}
            transparent
            opacity={0.65}
            depthWrite={false}
          />
        </mesh>
      </group>
      <group name="ghost-left-tip" renderOrder={16}>
        <mesh>
          <sphereGeometry args={[0.016, 12, 10]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.9} depthTest={false} depthWrite={false} />
        </mesh>
        <mesh>
          <ringGeometry args={[0.028, 0.036, 24]} />
          <meshBasicMaterial color="#7dd3fc" transparent opacity={0.85} depthTest={false} depthWrite={false} />
        </mesh>
      </group>
      <mesh name="ghost-right-tip" visible={false} renderOrder={9}>
        <sphereGeometry args={[0.013, 10, 8]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.6} depthWrite={false} />
      </mesh>
    </group>
  );
});
