"use client";
import { configureRoomRenderer } from "@/lib/ui/room-renderer";
import { Component, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { RoomScenery, TrainingField, RoomCamera } from "./room-environment";
import { ExerciseTargets } from "./exercise-targets";
import { PracticeNeedle } from "./operating-room";
import { Instrument } from "./instrument";
class PreviewBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p className="p-8 text-sm text-white/70">
        3D preview unavailable. You can still browse the skills library.
      </p>
    ) : (
      this.props.children
    );
  }
}
export default function RoomPreviewCanvas() {
  return (
    <PreviewBoundary>
      <Canvas
        frameloop="demand"
        shadows="percentage"
        onCreated={({ gl }) => {
          configureRoomRenderer(gl);
        }}
        camera={{ fov: 46, near: 0.05, far: 40 }}
        dpr={[1, 1.5]}
        fallback={
          <p className="p-8 text-white/60">
            Enable WebGL for the room preview.
          </p>
        }
        aria-label="Demonstration of the Steady operating room"
      >
        <RoomCamera landing />
        <RoomScenery />
        <TrainingField>
          <ExerciseTargets />
          <PracticeNeedle />
          <group position={[-0.5, -0.1, 0]}>
            <Instrument side="left" />
          </group>
          <group position={[0.5, -0.1, 0]}>
            <Instrument side="right" />
          </group>
        </TrainingField>
      </Canvas>
    </PreviewBoundary>
  );
}
