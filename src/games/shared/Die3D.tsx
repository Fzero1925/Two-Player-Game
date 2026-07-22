import React, { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";

/**
 * 3D骰子——跟两个游戏的 Board3D 同一套"风格化几何体 + 材质配色"路线，不用
 * 外部模型/贴图文件。点数用小球体（pip）摆出标准骰子六个面（1/6、2/5、3/4
 * 三组正对面之和都是7），摆点位置直接照抄了 `shared/Dice.tsx`（那颗header上
 * 用的2D骰子）里 `PIP_POSITIONS` 的标准布局，只是把百分比坐标换算成了立方体
 * 每个面自己的本地UV坐标——这样3D骰子和2D骰子长得是"同一颗骰子"的两种形态，
 * 不是重新设计了一套点数排布。
 *
 * 这是 `src/games/shared/` 下第一个依赖 three.js 的组件（Dice.tsx/Token.tsx
 * 都是纯SVG）。只能从 Board3D.tsx 里 import——那两个文件已经在各自游戏的
 * 懒加载chunk里了，这个文件跟着一起被分进同一个chunk，不会把 three.js 带进
 * 主bundle。**不要从 MonopolyGame.tsx / FlightChessGame.tsx 这些非懒加载的
 * 外壳组件直接 import 这个文件**，那样会破坏懒加载、把 three.js 拖回主bundle。
 *
 * 用法：`<Die3D value={state.lastDiceRoll} rolling={rolling} position={[x,y,z]} />`。
 * - `value` 为 `null`（还没掷过）时按1处理，跟 `shared/Dice.tsx` 的默认值规则
 *   一致。
 * - `rolling=true` 期间每帧自己转出一个不规则的翻滚动作，姿态不需要外部指定。
 * - `rolling` 从 true 变回 false 的那一刻，算一次"目标点数对应的面朝上"该
 *   转到什么姿态（`Quaternion.setFromUnitVectors`：只要把目标面的法线转到
 *   世界坐标 +Y 即可，不用逐帧手算欧拉角），然后用 slerp 平滑转过去定格，
 *   并叠加一个随机偏航角——同样是"6朝上"，每次落地朝向也不完全一样，比每次
 *   摆出一模一样的姿势更像真的在桌上弹了一下。
 */

const PIP_UV: Record<number, Array<[number, number]>> = {
  1: [[0, 0]],
  2: [
    [-1, -1],
    [1, 1],
  ],
  3: [
    [-1, -1],
    [0, 0],
    [1, 1],
  ],
  4: [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ],
  5: [
    [-1, -1],
    [1, -1],
    [0, 0],
    [-1, 1],
    [1, 1],
  ],
  6: [
    [-1, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [1, 1],
  ],
};

interface FaceDef {
  value: number;
  normal: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
}

// 面法线 + 面内两条本地坐标轴。1朝上/6朝下、2/5、3/4 分别相对，三组都是
// 正对面之和为7，标准骰子的配对规则。u/v 具体指向哪个方向不影响正确性
// （这几种点数图案本身就是对称的），只要和法线两两垂直即可。
const FACES: FaceDef[] = [
  { value: 1, normal: new THREE.Vector3(0, 1, 0), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1) },
  { value: 6, normal: new THREE.Vector3(0, -1, 0), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, -1) },
  { value: 2, normal: new THREE.Vector3(1, 0, 0), u: new THREE.Vector3(0, 0, -1), v: new THREE.Vector3(0, 1, 0) },
  { value: 5, normal: new THREE.Vector3(-1, 0, 0), u: new THREE.Vector3(0, 0, 1), v: new THREE.Vector3(0, 1, 0) },
  { value: 3, normal: new THREE.Vector3(0, 0, 1), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0) },
  { value: 4, normal: new THREE.Vector3(0, 0, -1), u: new THREE.Vector3(-1, 0, 0), v: new THREE.Vector3(0, 1, 0) },
];

const HALF = 0.28;
const PIP_RADIUS = 0.045;
const PIP_SPACING = 0.15;
const UP = new THREE.Vector3(0, 1, 0);

/** value(1-6) → 让这个面朝上所需要的目标姿态，叠加一个绕竖直轴的随机偏航角。 */
function faceUpQuaternion(value: number, yaw: number): THREE.Quaternion {
  const face = FACES.find((f) => f.value === value) || FACES[0];
  const base = new THREE.Quaternion().setFromUnitVectors(face.normal, UP);
  const spin = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  return spin.multiply(base);
}

interface Die3DProps {
  /** 1-6，还没掷过时传 null（按1处理，跟2D骰子默认值一致）。 */
  value: number | null;
  rolling: boolean;
  position?: [number, number, number];
  /** 骰子本体颜色，默认是跟2D骰子同一个米白色系；点数颜色不做定制，
   *  两个游戏统一用同一个靛蓝色，保持"这是同一颗骰子"的观感。 */
  color?: string;
}

export default function Die3D({ value, rolling, position = [0, 0, 0], color = "#fafaf9" }: Die3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const targetQuatRef = useRef(faceUpQuaternion(value ?? 1, 0));
  const wasRollingRef = useRef(rolling);
  const spinVelRef = useRef(new THREE.Vector3(2.6, 3.3, 1.9));

  useEffect(() => {
    if (!wasRollingRef.current && rolling) {
      // 每次新开始一轮翻滚，换一组转速比例，别每次都转得一模一样。
      spinVelRef.current.set(
        1.6 + Math.random() * 2.2,
        1.6 + Math.random() * 2.2,
        1.6 + Math.random() * 2.2
      );
    }
    if (wasRollingRef.current && !rolling) {
      targetQuatRef.current = faceUpQuaternion(value ?? 1, Math.random() * Math.PI * 2);
    }
    wasRollingRef.current = rolling;
  }, [rolling, value]);

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;

    if (rolling) {
      g.rotateX(spinVelRef.current.x * delta);
      g.rotateY(spinVelRef.current.y * delta);
      g.rotateZ(spinVelRef.current.z * delta);
      const bob = Math.abs(Math.sin(performance.now() / 90)) * 0.06;
      g.position.set(position[0], position[1] + bob, position[2]);
    } else {
      g.quaternion.slerp(targetQuatRef.current, 1 - Math.pow(0.001, delta));
      g.position.set(
        THREE.MathUtils.damp(g.position.x, position[0], 10, delta),
        THREE.MathUtils.damp(g.position.y, position[1], 10, delta),
        THREE.MathUtils.damp(g.position.z, position[2], 10, delta)
      );
    }
  });

  return (
    <group ref={groupRef} position={position}>
      <RoundedBox args={[HALF * 2, HALF * 2, HALF * 2]} radius={0.05} smoothness={2} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.05} />
      </RoundedBox>
      {FACES.map((face) =>
        (PIP_UV[face.value] || PIP_UV[1]).map(([u, v], i) => {
          const p = face.normal
            .clone()
            .multiplyScalar(HALF + PIP_RADIUS * 0.55)
            .add(face.u.clone().multiplyScalar(u * PIP_SPACING))
            .add(face.v.clone().multiplyScalar(v * PIP_SPACING));
          return (
            <mesh key={`${face.value}-${i}`} position={[p.x, p.y, p.z]}>
              <sphereGeometry args={[PIP_RADIUS, 12, 12]} />
              <meshStandardMaterial color="#4338ca" roughness={0.4} />
            </mesh>
          );
        })
      )}
    </group>
  );
}
