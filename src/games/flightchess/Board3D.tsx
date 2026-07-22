import React, { Suspense, useEffect, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import {
  TRACK_LENGTH,
  HOME_STRETCH_LENGTH,
  PIECES_PER_COLOR,
  COLORS,
  COLOR_START_INDEX,
  COLOR_LABEL,
  COLOR_SHADES,
  PieceColor,
} from "./board.js";
import { FlightChessState, PlayerRole } from "./logic.js";
import Die3D from "../shared/Die3D.js";

/**
 * 飞行棋 3D 棋盘——纯展示层，不含任何游戏逻辑（逻辑都在 logic.ts，这个组件
 * 只读 state 来画画，跟 monopoly/Board3D.tsx 是同一个原则）。技术路线跟大富翁
 * 完全一致（three.js + R3F + drei，风格化几何体+材质配色，不引入外部模型/
 * 贴图文件；懒加载，见 FlightChessGame.tsx 里的 React.lazy），这里不重复
 * 说明技术选型理由，只记录这个棋盘自己的布局设计、以及哪些地方跟大富翁
 * 那份 Board3D 不一样。
 *
 * 布局设计（和2D圆形跑道版本的空间关系保持一致，玩过2D版本的人能直接
 * 认出"这是同一个棋盘"）：
 *  - 共享跑道：24格沿一个圆环排列，角度公式跟 FlightChessGame.tsx 里
 *    trackCirclePercent 用的是同一个（cell/24*2π − π/2，从"上方"开始顺时针），
 *    以后如果要对照2D/3D布局，格子角度是对得上的。
 *  - 到家小路：每个颜色一根"辐条"，角度固定在该颜色起飞格的角度上，半径
 *    从环外沿朝圆心方向递减——对应规则上"棋子跑完一整圈、快经过自己起飞格
 *    时拐进专属小路"，辐条从起飞格延伸向圆心，空间上和规则叙事对得上。
 *  - 营地：每个颜色在环外侧（比跑道半径更大一圈）有一个2×2小停机坪，停放
 *    最多4颗还没起飞的棋子——这是2D版本没有的，2D只在玩家卡片里用文字列
 *    "营地：1、3"。3D这版把营地也摆进了场景，营地/跑道/到家小路/到家四种
 *    状态都有对应的3D坐标，不是2D的简单复刻。
 *  - 棋子移动动画：每颗棋子自己的 step 是单调递增的整数（-1=营地，
 *    0..23=共享跑道，24..29=到家小路，不会绕圈），所以直接从"旧step+1"
 *    逐格hop到"新step"即可，比大富翁棋子还简单——不需要像共享跑道格子那样
 *    判断"顺时针/逆时针哪边近"。起飞（-1→0）和被撞回营地（N→-1）这两种
 *    跨区域跳变，跟大富翁机会卡传送同样处理：直接原地出现/消失，没有
 *    "沿一条线走"的中间态可言。
 *  - 中文字体：跟大富翁共用同一份 /fonts/board-cjk.woff2 子集字体（见
 *    monopoly/Board3D.tsx 顶部注释里字体子集化的说明和重新生成方法），
 *    这个文件用到的新增字是"飞行棋红蓝绿黄"，已经包含在子集里。
 *  - 【健壮性】原因同样写在 monopoly/Board3D.tsx 顶部注释里：drei 的 <Text>
 *    字体加载失败/卡住时会一直向上抛，抛到 FlightChessGame.tsx 里包
 *    `<Board3D>` 的 Suspense 就再也回不来，整个棋盘（不只是文字）会卡在
 *    "3D 棋盘加载中..."出不来。所以下面每一处 <Text> 都单独包了一层
 *    `<Suspense fallback={null}>` 兜底。
 */

const RING_RADIUS = 4.3;
const CELL_DIAMETER = 0.62;
const CELL_HEIGHT = 0.16;
const HOME_SPOKE_STEP = 0.58;
const BASE_RADIUS = RING_RADIUS + 1.4;
const BASE_SPREAD = 0.4;
const HOP_DURATION = 0.16; // 每一步（跑道格或到家小路格）耗时（秒）

function ringAngle(cell: number): number {
  return (cell / TRACK_LENGTH) * Math.PI * 2 - Math.PI / 2;
}

function ringWorldPos(cell: number): [number, number] {
  const a = ringAngle(cell);
  return [Math.cos(a) * RING_RADIUS, Math.sin(a) * RING_RADIUS];
}

function homeStretchWorldPos(color: PieceColor, i: number): [number, number] {
  const a = ringAngle(COLOR_START_INDEX[color]);
  const radius = RING_RADIUS - (i + 1) * HOME_SPOKE_STEP;
  return [Math.cos(a) * radius, Math.sin(a) * radius];
}

/** 棋子自己的 step（0..29）→ 世界坐标。营地（step === -1）不归这个函数管，
 *  营地位置还需要"停机坪第几格"这个额外信息，见 baseSlotWorldPos。 */
function pieceStepWorldPos(color: PieceColor, step: number): [number, number] {
  if (step < TRACK_LENGTH) return ringWorldPos((COLOR_START_INDEX[color] + step) % TRACK_LENGTH);
  return homeStretchWorldPos(color, step - TRACK_LENGTH);
}

const BASE_SLOT_LOCAL: Array<[number, number]> = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

/** 每个颜色的营地是环外侧的一个2×2小停机坪。用"该颜色起飞角度"算出一组
 *  局部基向量（径向/切向），再用这组基向量摆4个格子——这样无论颜色在圆环
 *  哪个方位，停机坪都朝"背离圆心"的方向自然展开，不用为4个方位各写一套
 *  坐标。 */
function baseSlotWorldPos(color: PieceColor, slot: number): [number, number] {
  const a = ringAngle(COLOR_START_INDEX[color]);
  const radial: [number, number] = [Math.cos(a), Math.sin(a)];
  const tangent: [number, number] = [-Math.sin(a), Math.cos(a)];
  const [rSign, tSign] = BASE_SLOT_LOCAL[slot % 4];
  return [
    Math.cos(a) * BASE_RADIUS + radial[0] * rSign * BASE_SPREAD + tangent[0] * tSign * BASE_SPREAD,
    Math.sin(a) * BASE_RADIUS + radial[1] * rSign * BASE_SPREAD + tangent[1] * tSign * BASE_SPREAD,
  ];
}

/** 同一格子/到家小路如果不止一颗棋子重叠（同色2颗恰好同 step，或者不同色
 *  棋子在共享跑道上恰好同格），用棋子在自己颜色内的编号（0..3，跟棋子上
 *  显示的数字标签是同一个编号）做一个很小的固定错位，平时几乎看不出来，
 *  真的重叠时能把棋子分开、不会叠成一坨看不清。营地不需要这个——营地4个
 *  停机坪本来就是各占一个坑，不会重叠。*/
const MICRO_OFFSETS: Array<[number, number]> = [
  [-0.09, -0.09],
  [0.09, -0.09],
  [-0.09, 0.09],
  [0.09, 0.09],
];

const RingCell = React.memo(function RingCell({ cell }: { cell: number }) {
  const [x, z] = ringWorldPos(cell);
  const safeColor = (Object.keys(COLOR_START_INDEX) as PieceColor[]).find(
    (c) => COLOR_START_INDEX[c] === cell
  );
  const shade = safeColor ? COLOR_SHADES[safeColor] : null;

  return (
    <group position={[x, 0, z]}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[CELL_DIAMETER / 2, CELL_DIAMETER / 2, CELL_HEIGHT, 24]} />
        <meshStandardMaterial color={shade ? shade.light : "#f8fafc"} roughness={0.55} />
      </mesh>
      <mesh position={[0, -CELL_HEIGHT / 2 - 0.01, 0]}>
        <cylinderGeometry args={[CELL_DIAMETER / 2 - 0.02, CELL_DIAMETER / 2 - 0.02, 0.02, 24]} />
        <meshStandardMaterial color={shade ? shade.dark : "#cbd5e1"} />
      </mesh>
      {/* 四个起飞格用一个小三棱锥当"旗标"，跟2D版本的星标是同一个意图 */}
      {shade && (
        <mesh position={[0, CELL_HEIGHT / 2 + 0.1, 0]} castShadow>
          <coneGeometry args={[0.11, 0.2, 4]} />
          <meshStandardMaterial color={shade.dark} roughness={0.4} />
        </mesh>
      )}
    </group>
  );
});

const HomeStretchCell = React.memo(function HomeStretchCell({
  color,
  i,
}: {
  color: PieceColor;
  i: number;
}) {
  const [x, z] = homeStretchWorldPos(color, i);
  const shade = COLOR_SHADES[color];
  return (
    <group position={[x, 0, z]}>
      <mesh receiveShadow>
        <cylinderGeometry args={[CELL_DIAMETER / 2 - 0.05, CELL_DIAMETER / 2 - 0.05, CELL_HEIGHT * 0.85, 20]} />
        <meshStandardMaterial color={shade.light} roughness={0.6} />
      </mesh>
      <mesh position={[0, -CELL_HEIGHT * 0.45, 0]}>
        <cylinderGeometry args={[CELL_DIAMETER / 2 - 0.07, CELL_DIAMETER / 2 - 0.07, 0.02, 20]} />
        <meshStandardMaterial color={shade.mid} />
      </mesh>
    </group>
  );
});

const BasePad = React.memo(function BasePad({ color, slot }: { color: PieceColor; slot: number }) {
  const [x, z] = baseSlotWorldPos(color, slot);
  const shade = COLOR_SHADES[color];
  return (
    <mesh position={[x, -0.03, z]} receiveShadow>
      <cylinderGeometry args={[0.22, 0.22, 0.04, 16]} />
      <meshStandardMaterial color={shade.light} roughness={0.75} transparent opacity={0.85} />
    </mesh>
  );
});

interface FlightPieceProps {
  color: PieceColor;
  step: number; // -1 = 营地，0..29 = 在路径上（含到家）
  pieceIndex: number; // 在 state.pieces[role] 里的下标，0..7
}

function FlightPiece3D({ color, step, pieceIndex }: FlightPieceProps) {
  const groupRef = useRef<THREE.Group>(null);
  const colorSlot = pieceIndex % PIECES_PER_COLOR;
  const micro = MICRO_OFFSETS[colorSlot];

  // 本次要经过的一串 step 值（不含起点，含终点）。棋子自己的 step 只会
  // 单调递增，直接从"旧step+1"数到"新step"即可。
  const pathRef = useRef<number[]>([]);
  const fromStepRef = useRef(step);
  const prevStepRef = useRef(step);
  const elapsedRef = useRef(0);

  useEffect(() => {
    if (step === prevStepRef.current) return;
    const from = prevStepRef.current;
    prevStepRef.current = step;
    if (step === -1 || from === -1) {
      // 起飞 / 被撞回营地：没有可以逐格插值的中间态，清空路径，
      // 下面的 useFrame 会直接摆到新位置。
      pathRef.current = [];
      return;
    }
    const path: number[] = [];
    for (let s = from + 1; s <= step; s++) path.push(s);
    pathRef.current = path;
    fromStepRef.current = from;
    elapsedRef.current = 0;
  }, [step]);

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;
    const bob = Math.sin(performance.now() / 700 + colorSlot) * 0.03;

    if (step === -1) {
      const [bx, bz] = baseSlotWorldPos(color, colorSlot);
      g.position.set(bx, 0.26 + bob, bz);
      return;
    }

    const path = pathRef.current;
    if (path.length === 0) {
      const [px, pz] = pieceStepWorldPos(color, step);
      g.position.set(px + micro[0], 0.26 + bob, pz + micro[1]);
      return;
    }

    const totalDuration = path.length * HOP_DURATION;
    elapsedRef.current = Math.min(elapsedRef.current + delta, totalDuration);
    const t = elapsedRef.current / totalDuration;
    const segFloat = t * path.length;
    const segIndex = Math.min(Math.floor(segFloat), path.length - 1);
    const segT = Math.max(0, Math.min(1, segFloat - segIndex));
    const fromStepVal = segIndex === 0 ? fromStepRef.current : path[segIndex - 1];
    const toStepVal = path[segIndex];

    const [fx, fz] = pieceStepWorldPos(color, fromStepVal);
    const [tx, tz] = pieceStepWorldPos(color, toStepVal);
    const eased = segT * segT * (3 - 2 * segT); // smoothstep，起停更柔和
    const hopArc = Math.sin(segT * Math.PI) * 0.14;
    g.position.set(fx + (tx - fx) * eased + micro[0], 0.26 + hopArc + bob, fz + (tz - fz) * eased + micro[1]);
  });

  const [initX, initZ] = step === -1 ? baseSlotWorldPos(color, colorSlot) : pieceStepWorldPos(color, step);
  const shade = COLOR_SHADES[color];
  const offX = step === -1 ? 0 : micro[0];
  const offZ = step === -1 ? 0 : micro[1];

  return (
    <group ref={groupRef} position={[initX + offX, 0.26, initZ + offZ]}>
      <mesh castShadow>
        <sphereGeometry args={[0.2, 20, 20]} />
        <meshStandardMaterial color={shade.mid} roughness={0.3} metalness={0.15} />
      </mesh>
      <mesh position={[0, -0.22, 0]}>
        <cylinderGeometry args={[0.13, 0.16, 0.05, 14]} />
        <meshStandardMaterial color={shade.dark} roughness={0.6} />
      </mesh>
    </group>
  );
}

export default function Board3D({ state, rolling }: { state: FlightChessState; rolling: boolean }) {
  const allPieces = (["host", "guest"] as PlayerRole[]).flatMap((role) =>
    state.pieces[role].map((piece, pieceIndex) => ({ role, piece, pieceIndex }))
  );

  return (
    <div
      className="relative w-full aspect-square max-w-2xl mx-auto mb-6 rounded-2xl overflow-hidden raised-card border border-slate-200"
      style={{ touchAction: "none" }}
    >
      <Canvas shadows camera={{ position: [0, 11.5, 11.5], fov: 40 }} dpr={[1, 1.5]}>
        <color attach="background" args={["#f3e8ff"]} />
        <fog attach="fog" args={["#f3e8ff", 16, 27]} />

        <ambientLight intensity={0.78} />
        <directionalLight
          position={[5, 9, 4]}
          intensity={1.1}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-8}
          shadow-camera-right={8}
          shadow-camera-top={8}
          shadow-camera-bottom={-8}
        />
        <pointLight position={[-5, 3, -5]} intensity={0.3} color="#c4b5fd" />

        {/* 环形跑道底盘：垫在24个跑道格子下面的一整圈圆环，视觉上把它们连成
            一条环形跑道，而不是24个孤立的小圆片。 */}
        <mesh position={[0, -0.12, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <ringGeometry args={[RING_RADIUS - CELL_DIAMETER / 2 - 0.05, RING_RADIUS + CELL_DIAMETER / 2 + 0.05, 64]} />
          <meshStandardMaterial color="#ddd6fe" roughness={0.7} />
        </mesh>

        {Array.from({ length: TRACK_LENGTH }, (_, cell) => (
          <RingCell key={`ring-${cell}`} cell={cell} />
        ))}

        {COLORS.map((color) =>
          Array.from({ length: HOME_STRETCH_LENGTH }, (_, i) => (
            <HomeStretchCell key={`home-${color}-${i}`} color={color} i={i} />
          ))
        )}

        {COLORS.map((color) =>
          Array.from({ length: PIECES_PER_COLOR }, (_, slot) => (
            <BasePad key={`base-${color}-${slot}`} color={color} slot={slot} />
          ))
        )}

        {/* 中心底座 + 标题字，跟大富翁棋盘中心的装饰是同一个语言 */}
        <mesh position={[0, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[0.85, 40]} />
          <meshStandardMaterial color="#8b5cf6" roughness={0.6} />
        </mesh>
        <Suspense fallback={null}>
          <Text
            position={[0, 0.02, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.34}
            color="white"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.008}
            outlineColor="#6d28d9"
            font="/fonts/board-cjk.woff2"
          >
            飞行棋
          </Text>
        </Suspense>

        {COLORS.map((color) => {
          const a = ringAngle(COLOR_START_INDEX[color]);
          const labelRadius = RING_RADIUS + 0.75;
          return (
            <Suspense fallback={null} key={`label-${color}`}>
              <Text
                position={[Math.cos(a) * labelRadius, 0.05, Math.sin(a) * labelRadius]}
                rotation={[-Math.PI / 2, 0, 0]}
                fontSize={0.24}
                color={COLOR_SHADES[color].dark}
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.005}
                outlineColor="#ffffff"
                font="/fonts/board-cjk.woff2"
              >
                {COLOR_LABEL[color]}
              </Text>
            </Suspense>
          );
        })}

        {allPieces.map(({ role, piece, pieceIndex }) => (
          <FlightPiece3D key={`${role}-${pieceIndex}`} color={piece.color} step={piece.step} pieceIndex={pieceIndex} />
        ))}

        {/* 3D骰子，摆在红色/蓝色到家小路中间的空地上（四根辐条之间正好有四块
            空地，选了离相机较近的这一块）。跟 header 那颗2D骰子共用同一个
            rolling 状态：rolling=true 时自己转，state.lastDiceRoll 出来、
            rolling 变回 false 的瞬间定格。 */}
        <Die3D value={state.lastDiceRoll} rolling={rolling} position={[1.55, 0.5, -1.55]} />

        <ContactShadows position={[0, -0.18, 0]} opacity={0.35} scale={14} blur={2.4} far={4} />

        <OrbitControls
          enablePan={false}
          minDistance={8}
          maxDistance={19}
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
