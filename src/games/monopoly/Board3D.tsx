import React, { useEffect, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, RoundedBox, Html, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { BOARD, COLOR_HEX, TILE_TYPE_HEX, Tile, TileType } from "./board.js";
import { MonopolyState, PlayerRole } from "./logic.js";
import Die3D from "../shared/Die3D.js";
import Piece3D from "../shared/Piece3D.js";

/**
 * 大富翁真3D棋盘（2026-07 二次重写）。风格化几何体 + 材质配色，不引入任何
 * 外部模型/贴图文件——所有形状（地块、建筑、图标、棋子、骰子）都是
 * three.js 内置几何体拼出来的。
 *
 * 【文字为什么改用 Html，不用 drei 的 <Text>】第一版用的是 drei 的
 * <Text>（底层是 troika-three-text），本地字体子集文件只要有一次加载失败
 * 或卡住，这个组件的字体加载 Promise 就会永远不 settle（troika 的
 * preloadFont 回调只有成功路径），一路网上抛到最近的 Suspense，导致整个
 * 棋盘卡在"加载中"出不来——这是实际发生过的线上问题。改成 drei 的
 * <Html>（把真实DOM元素按3D坐标投影贴在Canvas上）之后，文字用的是浏览器
 * 自己的字体栈，不存在"加载"这一步，也就没有这一整类故障模式了；副作用是
 * label 现在是"广告牌"式的（始终朝向相机，不随棋盘旋转），但对地产名这种
 * UI标签来说，永远朝向摄像机反而是更好的可读性。
 *
 * 【棋子】用共享的 Piece3D（见 shared/Piece3D.tsx）——棋子造型跟飞行棋
 * 3D棋盘共用同一份，颜色各自传各自的主题色。
 *
 * 【地产升级/建筑】houseLevel（0~3，来自 state.houseLevel）决定地块上有
 * 没有建筑、建筑多大——0级是空地皮，1~2级是绿色小房子（依次变高变大），
 * 3级是红色带尖塔的"酒店"，颜色沿用经典大富翁"绿房子/红酒店"的配色直觉，
 * 不跟房主的主题色绑定（房主色只体现在地块本身的染色上，建筑颜色统一
 * 表示"这块地升到几级"，两个信号分开读，不会互相干扰）。
 *
 * 【非地产格图标】起点/机会/税务/监狱/免费停车/进监狱 各给了一个抽象的
 * 几何体图标（八面体、锥体、硬币叠等），不是写实图标，是延续"风格化几何体"
 * 这条路线的抽象表达，让棋盘不再是"纯色块"，一眼能大致分清格子类型。
 */

const RING_SIZE = 7;
const TILE_FOOTPRINT = 1.3;
const TILE_GAP = 0.1;
const TILE_HEIGHT = 0.22;
const BOARD_SIZE = BOARD.length;

function ringPosition(index: number): { row: number; col: number } {
  const side = Math.floor(index / (RING_SIZE - 1));
  const offset = index % (RING_SIZE - 1);
  if (side === 0) return { row: 1, col: 1 + offset };
  if (side === 1) return { row: 1 + offset, col: RING_SIZE };
  if (side === 2) return { row: RING_SIZE, col: RING_SIZE - offset };
  return { row: RING_SIZE - offset, col: 1 };
}

function tileWorldPos(index: number): [number, number] {
  const { row, col } = ringPosition(index);
  const step = TILE_FOOTPRINT + TILE_GAP;
  const x = (col - (RING_SIZE + 1) / 2) * step;
  const z = (row - (RING_SIZE + 1) / 2) * step;
  return [x, z];
}

function tileColors(tile: Tile): { top: string; side: string } {
  if (tile.type === "property" && tile.colorGroup) {
    const hex = COLOR_HEX[tile.colorGroup];
    if (hex) return { top: hex.top, side: hex.side };
  }
  const accent = TILE_TYPE_HEX[tile.type];
  if (accent) return accent;
  return { top: "#f8fafc", side: "#cbd5e1" };
}

// 房主/访客的主题色——TileMesh（地产被买下后的整块着色）和 Token3D
// （棋子本身）共用同一份，避免两处各写一份、色值还对不上号。
const TOKEN_COLOR: Record<PlayerRole, { mid: string; dark: string }> = {
  host: { mid: "#6366f1", dark: "#3730a3" },
  guest: { mid: "#f59e0b", dark: "#92400e" },
};

/** 地产升级建筑——0级不渲染任何东西（空地皮），1/2级是绿房子（依次变大），
 *  3级是带尖塔的红色"酒店"。颜色统一用经典大富翁的"绿房子/红酒店"配色，
 *  不跟房主主题色绑定。 */
function UpgradeBuilding({ level }: { level: number }) {
  if (level <= 0) return null;
  const bodyHeight = [0, 0.16, 0.24, 0.32][Math.min(level, 3)];
  const bodySize = 0.3 + level * 0.045;
  const isHotel = level >= 3;
  const bodyColor = isHotel ? "#b91c1c" : "#16a34a";
  const roofColor = isHotel ? "#7f1d1d" : "#166534";
  const roofHeight = 0.16 + level * 0.01;

  return (
    <group position={[0, TILE_HEIGHT / 2, 0]}>
      <mesh position={[0, bodyHeight / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[bodySize, bodyHeight, bodySize]} />
        <meshStandardMaterial color={bodyColor} roughness={0.55} />
      </mesh>
      <mesh position={[0, bodyHeight + roofHeight / 2, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[bodySize * 0.74, roofHeight, 4]} />
        <meshStandardMaterial color={roofColor} roughness={0.6} />
      </mesh>
      {isHotel && (
        <mesh position={[0, bodyHeight + roofHeight + 0.11, 0]} castShadow>
          <coneGeometry args={[0.045, 0.22, 8]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.3} metalness={0.5} />
        </mesh>
      )}
    </group>
  );
}

/** 非地产格的抽象图标——风格化几何体，不是写实图标，只是让每种格子类型
 *  有独立于颜色之外的、看轮廓也能分辨的形状。 */
function TileIcon({ type }: { type: TileType }) {
  const y = TILE_HEIGHT / 2 + 0.12;
  if (type === "go") {
    return (
      <mesh position={[0, y, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.2, 0.32, 3]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} metalness={0.15} />
      </mesh>
    );
  }
  if (type === "chance") {
    return (
      <mesh position={[0, y, 0]} rotation={[0, Math.PI / 6, 0]} castShadow>
        <octahedronGeometry args={[0.19, 0]} />
        <meshStandardMaterial color="#f5f3ff" roughness={0.25} metalness={0.2} />
      </mesh>
    );
  }
  if (type === "tax") {
    return (
      <group position={[0, TILE_HEIGHT / 2 + 0.02, 0]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0, i * 0.05 + 0.03, 0]} castShadow>
            <cylinderGeometry args={[0.15 - i * 0.008, 0.15 - i * 0.008, 0.045, 22]} />
            <meshStandardMaterial color="#fecdd3" roughness={0.35} metalness={0.35} />
          </mesh>
        ))}
      </group>
    );
  }
  if (type === "jail") {
    return (
      <group position={[0, TILE_HEIGHT / 2 + 0.13, 0]}>
        {[-0.13, -0.045, 0.045, 0.13].map((dx, i) => (
          <mesh key={i} position={[dx, 0, 0]} castShadow>
            <boxGeometry args={[0.03, 0.24, 0.24]} />
            <meshStandardMaterial color="#f1f5f9" roughness={0.5} metalness={0.3} />
          </mesh>
        ))}
      </group>
    );
  }
  if (type === "free_parking") {
    return (
      <mesh position={[0, y, 0]} castShadow>
        <torusGeometry args={[0.15, 0.045, 12, 24]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} metalness={0.2} />
      </mesh>
    );
  }
  if (type === "go_to_jail") {
    return (
      <mesh position={[0, y, 0]} rotation={[Math.PI, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.19, 0.3, 3]} />
        <meshStandardMaterial color="#ffedd5" roughness={0.3} metalness={0.15} />
      </mesh>
    );
  }
  return null;
}

interface TileMeshProps {
  tile: Tile;
  owner: PlayerRole | undefined;
  isCurrent: boolean;
  houseLevel: number;
}

// React.memo：棋盘固定只有24个格子，state.ownership/houseLevel/currentTiles
// 每次只会变化其中一两个格子，没有变化的格子没必要在每次掷骰子后都重新
// 执行渲染函数。
const TileMesh = React.memo(function TileMesh({ tile, owner, isCurrent, houseLevel }: TileMeshProps) {
  const [x, z] = tileWorldPos(tile.index);
  const { top, side } = tileColors(tile);
  // 被买下的地产：整块换成买家的主题色，没被买的就用地产分组/格子类型
  // 本身的颜色。
  const ownerHex = owner ? TOKEN_COLOR[owner].mid : null;
  const ownerEdgeHex = owner ? TOKEN_COLOR[owner].dark : null;

  return (
    <group position={[x, 0, z]}>
      <RoundedBox
        args={[TILE_FOOTPRINT, TILE_HEIGHT, TILE_FOOTPRINT]}
        radius={0.06}
        smoothness={2}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={ownerHex || top} roughness={0.55} metalness={0.08} />
      </RoundedBox>
      {/* 底边一圈更深的颜色，模拟"方块厚度" */}
      <mesh position={[0, -TILE_HEIGHT / 2 - 0.01, 0]}>
        <boxGeometry args={[TILE_FOOTPRINT - 0.04, 0.02, TILE_FOOTPRINT - 0.04]} />
        <meshStandardMaterial color={ownerEdgeHex || side} />
      </mesh>
      {/* 当前有棋子停留的格子，加一圈淡淡的高亮描边 */}
      {isCurrent && (
        <mesh position={[0, TILE_HEIGHT / 2 + 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[TILE_FOOTPRINT * 0.42, TILE_FOOTPRINT * 0.5, 32]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.7} />
        </mesh>
      )}

      {tile.type === "property" && <UpgradeBuilding level={houseLevel} />}
      {tile.type !== "property" && <TileIcon type={tile.type} />}

      <Html position={[0, TILE_HEIGHT / 2 + 0.02, 0]} center style={{ pointerEvents: "none" }}>
        <div className="flex flex-col items-center gap-0.5 select-none" style={{ width: 92 }}>
          <div className="text-[10px] font-bold text-slate-800 bg-white/90 px-1.5 py-0.5 rounded-md leading-tight text-center shadow-sm">
            {tile.name}
          </div>
          {tile.price !== undefined && (
            <div className="text-[8.5px] font-semibold text-slate-500 bg-white/75 px-1.5 rounded-b-md leading-tight">
              ¥{tile.price}
              {houseLevel > 0 && <span className="text-emerald-600"> · Lv{houseLevel}</span>}
            </div>
          )}
        </div>
      </Html>
    </group>
  );
});

const HOP_DURATION = 0.22; // 每格跳跃耗时（秒），多格移动就是这个数乘以经过的格数

/**
 * 棋子移动动画。目标格子变化时，先算出"沿棋盘外圈走更短的那一边，逐格
 * 经过哪些格子下标"，再按经过的时间在这串格子之间分段插值，每段叠加一个
 * 小跳弧，视觉上是"一格一格跳过去"，而不是直接在3D空间里damp成一条直线
 * （那样多格移动、或者从棋盘尾端绕回起点时，棋子会贴着棋盘中央斜穿过去，
 * 很不自然）。这个逻辑完全在展示层内部，不影响 logic.ts。
 */
function Token3D({ role, targetIndex }: { role: PlayerRole; targetIndex: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const offset = role === "host" ? -0.32 : 0.32;

  const pathRef = useRef<number[]>([targetIndex]);
  const fromIndexRef = useRef(targetIndex);
  const prevTargetRef = useRef(targetIndex);
  const elapsedRef = useRef(0);

  useEffect(() => {
    if (targetIndex === prevTargetRef.current) return;
    const from = prevTargetRef.current;
    const forwardSteps = (targetIndex - from + BOARD_SIZE) % BOARD_SIZE;
    const backwardSteps = BOARD_SIZE - forwardSteps;
    const steps = Math.min(forwardSteps, backwardSteps);
    const dir = forwardSteps <= backwardSteps ? 1 : -1;
    const path: number[] = [];
    for (let i = 1; i <= steps; i++) {
      path.push((from + dir * i + BOARD_SIZE * 2) % BOARD_SIZE);
    }
    pathRef.current = path.length ? path : [targetIndex];
    fromIndexRef.current = from;
    prevTargetRef.current = targetIndex;
    elapsedRef.current = 0;
  }, [targetIndex]);

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;

    const path = pathRef.current;
    const totalDuration = path.length * HOP_DURATION;
    elapsedRef.current = Math.min(elapsedRef.current + delta, totalDuration);
    const t = totalDuration > 0 ? elapsedRef.current / totalDuration : 1;
    const segFloat = t * path.length;
    const segIndex = Math.min(Math.floor(segFloat), path.length - 1);
    const segT = Math.max(0, Math.min(1, segFloat - segIndex));
    const fromTile = segIndex === 0 ? fromIndexRef.current : path[segIndex - 1];
    const toTile = path[segIndex];

    const [fx, fz] = tileWorldPos(fromTile);
    const [tx, tz] = tileWorldPos(toTile);
    const eased = segT * segT * (3 - 2 * segT); // smoothstep，起停更柔和
    g.position.x = fx + (tx - fx) * eased + offset;
    g.position.z = fz + (tz - fz) * eased;

    const hopArc = Math.sin(segT * Math.PI) * 0.16;
    g.position.y = TILE_HEIGHT / 2 + hopArc + Math.sin(performance.now() / 700 + offset) * 0.03;
  });

  const [initialX, initialZ] = tileWorldPos(targetIndex);
  const color = TOKEN_COLOR[role];

  return (
    <group ref={groupRef} position={[initialX + offset, TILE_HEIGHT / 2, initialZ]}>
      <Piece3D colorMid={color.mid} colorDark={color.dark} scale={1.15} />
    </group>
  );
}

export default function Board3D({ state, rolling }: { state: MonopolyState; rolling: boolean }) {
  return (
    <div
      className="relative w-full aspect-square max-w-2xl mx-auto mb-6 rounded-2xl overflow-hidden raised-card border border-slate-200"
      style={{ touchAction: "none" }}
    >
      <Canvas shadows camera={{ position: [0, 9.2, 9.2], fov: 38 }} dpr={[1, 1.5]}>
        <color attach="background" args={["#eef2ff"]} />
        <fog attach="fog" args={["#eef2ff", 13, 22]} />

        <ambientLight intensity={0.75} />
        <directionalLight
          position={[5, 8, 4]}
          intensity={1.15}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-7}
          shadow-camera-right={7}
          shadow-camera-top={7}
          shadow-camera-bottom={-7}
        />
        <pointLight position={[-4, 3, -4]} intensity={0.25} color="#a5b4fc" />

        {BOARD.map((tile) => (
          <TileMesh
            key={tile.index}
            tile={tile}
            owner={state.ownership[tile.index]}
            isCurrent={tile.index === state.economy.host.position || tile.index === state.economy.guest.position}
            houseLevel={state.houseLevel[tile.index] || 0}
          />
        ))}

        <Token3D role="host" targetIndex={state.economy.host.position} />
        <Token3D role="guest" targetIndex={state.economy.guest.position} />

        {/* 中心底座 + 标题，用 Html 而不是 <Text>（理由见文件顶部说明） */}
        <mesh position={[0, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[2.15, 48]} />
          <meshStandardMaterial color="#818cf8" roughness={0.6} />
        </mesh>
        <Html position={[0, 0.02, 0]} center style={{ pointerEvents: "none" }}>
          <div className="text-white font-black text-2xl tracking-wide select-none" style={{ textShadow: "0 2px 8px rgba(67,56,202,0.6)" }}>
            大富翁
          </div>
        </Html>

        {/* 两颗3D骰子，摆在中心装饰和外圈格子之间的空地上（偏相机一侧，
            不挡标题）。跟 header 的2D骰子共用同一个 rolling 状态。 */}
        <Die3D value={state.lastDice ? state.lastDice[0] : null} rolling={rolling} position={[-0.36, 0.5, 2.7]} />
        <Die3D value={state.lastDice ? state.lastDice[1] : null} rolling={rolling} position={[0.36, 0.5, 2.7]} />

        <ContactShadows position={[0, -0.18, 0]} opacity={0.4} scale={13} blur={2.2} far={4} />

        <OrbitControls
          enablePan={false}
          minDistance={7}
          maxDistance={16}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2.25}
        />
      </Canvas>
      <p className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-slate-400 bg-white/80 px-2.5 py-1 rounded-full pointer-events-none">
        拖动旋转视角 · 双指/滚轮缩放
      </p>
    </div>
  );
}
