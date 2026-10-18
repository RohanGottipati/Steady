import { buildOperatingTable } from "./OperatingTable";
import { buildAnesthesiaMachine } from "./room/AnesthesiaMachine";
import { buildBackTable } from "./room/BackTable";
import { buildBoomMonitor } from "./room/BoomMonitor";
import { buildCabinetry } from "./room/Cabinets";
import { buildEquipmentBoom } from "./room/EquipmentBoom";
import { buildInstrumentCart } from "./room/InstrumentCart";
import { buildIVStand } from "./room/IVStand";
import { buildLaparoscopicTower } from "./room/LaparoscopicTower";
import { buildMayoStand } from "./room/MayoStand";
import { freezeStatic, group } from "./room/primitives";
import { buildRoomShell } from "./room/RoomShell";
import { buildSurgicalLights } from "./room/SurgicalLights";
import { buildUtilityEquipment } from "./room/UtilityEquipment";
import { buildWallEquipment } from "./room/WallEquipment";

/**
 * Builds the full OR. All scenery matrices are frozen (no per-frame cost).
 * Mount the training field into `table` afterwards — it keeps its own dynamic matrices.
 */
export function buildOperatingRoom(shadows: boolean) {
  const root = group(
    [
      buildRoomShell(),
      buildSurgicalLights(shadows),
      buildBoomMonitor(),
      buildEquipmentBoom(),
      buildLaparoscopicTower(),
      buildAnesthesiaMachine(),
      buildMayoStand(),
      buildInstrumentCart(),
      buildBackTable(),
      buildCabinetry(),
      buildIVStand(),
      buildWallEquipment(),
      buildUtilityEquipment(),
    ],

    { name: "operating-room" },
  );
  const table = buildOperatingTable();
  root.add(table);
  freezeStatic(root);
  return { root, table };
}
