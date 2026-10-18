import { FIELD_FOCUS, ROOM, type Triple } from "@/data/scene-layout";
import { group } from "./primitives";
import { buildSurgicalLight } from "./SurgicalLight";

const HUB: Triple = [0, ROOM.height, -1.25];
const DOME_A: Triple = [-0.82, 2.06, -1.45];
const DOME_B: Triple = [0.92, 2.14, -1.78];

/** Pair of surgical lights aimed at the training field. Only one casts shadows. */
export function buildSurgicalLights(shadows: boolean) {
  return group(
    [
      buildSurgicalLight({
        hub: HUB,
        dome: DOME_A,
        target: FIELD_FOCUS,
        intensity: 8,
        castShadow: shadows,
      }),
      buildSurgicalLight({
        hub: HUB,
        dome: DOME_B,
        target: FIELD_FOCUS,
        armDrop: 0.78,
        intensity: 6,
      }),
    ],

    { name: "surgical-lights" },
  );
}
