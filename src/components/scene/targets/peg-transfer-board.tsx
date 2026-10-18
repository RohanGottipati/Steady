"use client";

import { RoundedBox } from "@react-three/drei";
import { SOURCE_POST, TARGET_POST } from "@/lib/exercise/peg-transfer-config";
import { FIELD_FLOOR_Z, PEG_BOARD, PEG_BOARD_TOP_Z } from "@/data/training-targets";

/** FLS-style laparoscopic pegboard. Explicitly a training board — never anatomy. */
export function PegTransferBoard() {
  const { tray, insert, decorativePegs } = PEG_BOARD;
  const insertTop = PEG_BOARD_TOP_Z + 0.004;
  return (
    <group name="peg-transfer-board">
      <RoundedBox
        args={[tray.width, tray.depth, tray.thickness]}
        radius={0.018}
        smoothness={3}
        position={[tray.center[0], tray.center[1], FIELD_FLOOR_Z + tray.thickness / 2]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#d9dee3" roughness={0.5} metalness={0.05} />
      </RoundedBox>
      <mesh position={[insert.center[0], insert.center[1], PEG_BOARD_TOP_Z + 0.002]} receiveShadow>
        <boxGeometry args={[insert.width, insert.depth, 0.004]} />
        <meshStandardMaterial color="#20262c" roughness={0.88} />
      </mesh>
      {[SOURCE_POST, TARGET_POST].map((post) => (
        <mesh key={post.id} position={[post.position.x, post.position.y, insertTop + 0.0005]}>
          <ringGeometry args={[0.042, 0.047, 36]} />
          <meshBasicMaterial color="#e2e8f0" transparent opacity={0.55} depthWrite={false} />
        </mesh>
      ))}
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[0, insert.center[1] - insert.depth / 2 + 0.03 + i * 0.048, insertTop + 0.0005]}>
          <planeGeometry args={[0.004, 0.024]} />
          <meshBasicMaterial color="#e2e8f0" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      ))}
      {decorativePegs.map(([x, y]) => (
        <group key={`${x},${y}`} position={[x, y, insertTop]}>
          <mesh position={[0, 0, 0.004]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.014, 0.016, 0.008, 16]} />
            <meshStandardMaterial color="#4b5563" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0, 0.032]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.0065, 0.0075, 0.056, 12]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.35} metalness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
