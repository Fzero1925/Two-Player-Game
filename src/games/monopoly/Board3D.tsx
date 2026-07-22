import React, { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, RoundedBox, Text, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { BOARD, COLOR_HEX, TILE_TYPE_HEX, Tile } from "./board.js";
import { MonopolyState, PlayerRole } from "./logic.js";
import Die3D from "../shared/Die3D.js";

/**
 * 大富翁 3D 棋盘——纯展示层，不含任何游戏逻辑（逻辑都在 logic.ts，这个组件
 * 只读 state 来画画）。用的是 react-three-fiber + drei，不是照抄参考图那种
 * 精细写实渲染，是风格化的"卡通桌游"质感：纯几何体 + 材质配色，没有任何
 * 外部模型/贴图文件，跟之前 three.js 骰子demo是同一个技术路线，只是这次是
 * 真实项目依赖（可以用 drei 的现成组件），不是 Artifact 沙盒里那种手写版本。
 *
 * 棋盘布局复用了 2D 版本 MonopolyGame.tsx 里 `ringPosition` 的同一套公式
 * （7×7网格、24格沿边分布），保证3D版本和2D版本格子顺序/相邻关系完全一致。
 *
 * 关于中文字体（重要，不要删掉 font 这个 prop）：drei 的 <Text> 底层是
 * troika-three-text，如果不指定 font，它会在运行时自动去
 * cdn.jsdelivr.net 上按字符现拉对应语言的字体文件——这在国内网络环境下
 * 不一定连得上，会导致棋盘上的中文格子名"面板文字丢失/一直不出现"。
 * 所以这里指定了 `/fonts/board-cjk.woff2`——从 Noto Sans SC Thin(100) 里
 * 只抽取了实际用到的汉字生成的子集字体，只有10KB出头，随站点静态资源一起
 * 部署，不依赖任何第三方CDN。这份字体子集现在是大富翁和飞行棋两个3D棋盘
 * 共用的（原来文件名叫 monopoly-board-cjk.woff2，飞行棋3D化时改成了这个
 * 更中性的名字，字符集也合并了两边的用字）。以后棋盘上如果要显示新的汉字
 * （比如加新地产名），记得重新跑一遍字体子集化，不然新字会显示不出来
 * ——生成方法：先把两个 Board3D.tsx 里实际用到的汉字合并去重，写进一个
 * 文本文件，再跑 `pyftsubset <Noto Sans SC Thin 源字体> --text-file=<字符
 * 列表> --flavor=woff2 --output-file=public/fonts/board-cjk.woff2`。源字体
 * 从 `@fontsource/noto-sans-sc` 包里的
 * `files/noto-sans-sc-chinese-simplified-100-normal.woff2` 拿。
 *
 * 【健壮性】drei 的 <Text> 内部用 suspend-react 包了一层字体加载的 Promise，
 * 而这层 Promise 只有 resolve 路径、没有 reject 路径——字体文件万一加载失败
 * 或者卡住（网络问题、部署时漏拷贝了字体文件等），这个 Promise 永远不会
 * settle，会一直向上抛给最近的 Suspense 边界。MonopolyGame.tsx 里包
 * `<Board3D>` 的那层 Suspense fallback 是"3D 棋盘加载中..."——如果不在这个
 * 文件内部单独处理，字体一卡，`fallback` 会永远显示，棋盘（不只是文字，
 * 整个3D场景）就再也出不来了。所以下面每一处 <Text> 都单独包了一层
 * `<Suspense fallback={null}>`：字体卡住时，只是对应的文字标签暂时不显示，
 * 方块本身、颜色、棋子、骰子这些跟字体无关的内容不受影响，照常渲染。
 */

const RING_SIZE = 7;
const TILE_FOOTPRINT = 1.3;
const TILE_GAP = 0.1;
const TILE_HEIGHT = 0.22;
const BOARD_SIZE = BOARD.length;

function ringPosition(index: number): { row: number; col: number } {
  const n = RING_SIZE;
  if (index < n) return { row: 1, col: index + 1 };
  if (index < n + (n - 1)) return { row: index - n + 2, col: n };
  if (index < n + 2 * (n - 1)) return { row: n, col: n - (index - (n + (n - 1))) - 1 };
  return { row: n - (index - (n + 2 * (n - 1))) - 1, col: 1 };
}

function tileWorldPos(index: number): [number, number] {
  const { row, col } = ringPosition(index);
  const step = TILE_FOOTPRINT + TILE_GAP;
  const x = (col - (RING_SIZE + 1) / 2) * step;
  const z = (row - (RING_SIZE + 1) / 2) * step;
  return [x, z];
}

function tileColors(tile: Tile): { top: string; side: string } {
  if (tile.colorGroup && COLOR_HEX[tile.colorGroup]) {
    const c = COLOR_HEX[tile.colorGroup];
    return { top: c.top, side: c.side };
  }
  return TILE_TYPE_HEX[tile.type] || { top: "#e2e8f0", side: "#94a3b8" };
}

// 房主/访客的主题色——之前这套色值在 TileMesh（地产被买下后的整块着色）和
// Token3D（棋子本身）里各写了一份，两处字面量还对不上号（棋子用的是
// #3730a3/#92400e，格子边缘用的是 #312e81/#78350f，都是"深一号"但不是同一个
// 深一号）。现在统一成一个常量，两处都读这里，以后要调色只改一个地方。
const TOKEN_COLOR: Record<PlayerRole, { mid: string; dark: string }> = {
  host: { mid: "#6366f1", dark: "#3730a3" },
  guest: { mid: "#f59e0b", dark: "#92400e" },
};

interface TileMeshProps {
  tile: Tile;
  owner: PlayerRole | undefined;
  isCurrent: boolean;
}

// React.memo：棋盘固定只有24个格子，state.ownership/currentTiles 每次只会
// 变化其中一两个格子，没有变化的格子没必要在每次掷骰子后都重新执行渲染函数。
const TileMesh = React.memo(function TileMesh({ tile, owner, isCurrent }: TileMeshProps) {
  const [x, z] = tileWorldPos(tile.index);
  const { top, side } = tileColors(tile);
  // 被买下的地产：整块换成买家的主题色（跟2D版本"owner tint"是同一个意图），
  // 没被买的就用地产分组/格子类型本身的颜色。
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
      {/* 底边一圈更深的颜色，模拟"方块厚度"——跟2D版本的 border-b-4 是同一个意图。 */}
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
      <Suspense fallback={null}>
        <Text
          position={[0, TILE_HEIGHT / 2 + 0.02, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.16}
          maxWidth={TILE_FOOTPRINT - 0.15}
          textAlign="center"
          color="#1e293b"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.006}
          outlineColor="#ffffff"
          font="/fonts/board-cjk.woff2"
        >
          {tile.name}
        </Text>
      </Suspense>
    </group>
  );
});

const HOP_DURATION = 0.22; // 每格跳跃耗时（秒），多格移动就是这个数乘以经过的格数

/**
 * 棋子移动动画。之前是直接用 THREE.MathUtils.damp 把棋子"拉"向目标格子的世界
 * 坐标——多格移动（骰子点数2~12格很常见）或者从棋盘尾端绕回起点时，这种写法
 * 会让棋子抄近路斜穿过棋盘中心，而不是沿着外圈走，很不自然。
 *
 * 现在改成：每次目标格子变化时，先算出"沿棋盘外圈走更短的那一边，逐格经过
 * 哪些格子下标"（比如从格子2走到格子8，经过3/4/5/6/7/8；如果沿另一边更短则
 * 反向），再按经过的时间在这串格子之间分段插值，每段再叠加一个小跳弧（用sin
 * 曲线抬高再落下），视觉上就是"一格一格跳过去"，跟真实棋子在棋盘上挪动的直觉
 * 一致。这个逻辑完全在展示层内部，不影响 logic.ts（state 里仍然只存最终格子）。
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

    // 每一小格跳跃的弧形高度，叠加原本就有的常驻轻微浮动（呼应 token-float）。
    const hopArc = Math.sin(segT * Math.PI) * 0.16;
    g.position.y = 0.32 + hopArc + Math.sin(performance.now() / 700 + offset) * 0.03;
  });

  const [initialX, initialZ] = tileWorldPos(targetIndex);
  const color = TOKEN_COLOR[role];

  return (
    <group ref={groupRef} position={[initialX + offset, 0.32, initialZ]}>
      <mesh castShadow>
        <sphereGeometry args={[0.24, 24, 24]} />
        <meshStandardMaterial color={color.mid} roughness={0.3} metalness={0.15} />
      </mesh>
      <mesh position={[0, -0.26, 0]}>
        <cylinderGeometry args={[0.16, 0.19, 0.06, 16]} />
        <meshStandardMaterial color={color.dark} roughness={0.6} />
      </mesh>
    </group>
  );
}

export default function Board3D({ state, rolling }: { state: MonopolyState; rolling: boolean }) {
  const currentTiles = useMemo(() => {
    const s = new Set<number>();
    if (!state.winner) {
      s.add(state.economy.host.position);
      s.add(state.economy.guest.position);
    }
    return s;
  }, [state.economy.host.position, state.economy.guest.position, state.winner]);

  return (
    <div className="relative w-full aspect-square max-w-2xl mx-auto mb-6 rounded-2xl overflow-hidden raised-card border border-slate-200" style={{ touchAction: "none" }}>
      <Canvas shadows camera={{ position: [0, 9.2, 9.2], fov: 38 }} dpr={[1, 1.5]}>
        <color attach="background" args={["#eef2ff"]} />
        <fog attach="fog" args={["#eef2ff", 14, 22]} />

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
        <pointLight position={[-5, 3, -5]} intensity={0.35} color="#fbbf24" />

        {BOARD.map((tile) => (
          <TileMesh key={tile.index} tile={tile} owner={state.ownership[tile.index]} isCurrent={currentTiles.has(tile.index)} />
        ))}

        {/* 中心底座 + 标题字 */}
        <mesh position={[0, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[2.15, 48]} />
          <meshStandardMaterial color="#818cf8" roughness={0.6} />
        </mesh>
        <Suspense fallback={null}>
          <Text
            position={[0, 0.02, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.55}
            color="white"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.01}
            outlineColor="#4338ca"
            font="/fonts/board-cjk.woff2"
          >
            大富翁
          </Text>
        </Suspense>

        <Token3D role="host" targetIndex={state.economy.host.position} />
        <Token3D role="guest" targetIndex={state.economy.guest.position} />

        {/* 两颗3D骰子，摆在中心装饰和外圈格子之间的空地上（偏相机一侧，不挡
            标题字）。掷骰子按钮点下去之后，header 那两颗2D骰子和这两颗3D骰子
            是同一个 rolling 状态驱动的——rolling=true 时这里会自己转，state
            里的最终点数出来、rolling 变回 false 的瞬间才定格显示。 */}
        <Die3D value={state.lastDice ? state.lastDice[0] : null} rolling={rolling} position={[-0.36, 0.5, 2.7]} />
        <Die3D value={state.lastDice ? state.lastDice[1] : null} rolling={rolling} position={[0.36, 0.5, 2.7]} />

        <ContactShadows position={[0, -0.18, 0]} opacity={0.4} scale={13} blur={2.2} far={4} />

        <OrbitControls
          enablePan={false}
          minDistance={7}
          maxDistance={15}
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
