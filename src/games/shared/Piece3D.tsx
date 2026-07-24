import React from "react";

/**
 * 3D棋子造型——跟两个 Board3D 同一套"风格化几何体+材质配色"路线，不用外部
 * 模型文件。之前大富翁/飞行棋两边的3D棋子都只是"一个球坐在一个小圆柱底座
 * 上"，太抽象、不太像个"棋子"。这次换成经典棋类的"pawn"轮廓：宽底座（站得
 * 稳）+ 上窄下宽的锥形躯干 + 一圈颈环细节 + 球形头，从任何角度看都有清晰的
 * 剪影，辨识度更高。
 *
 * 纯展示组件，不含任何动画/状态逻辑——两个游戏各自的 Token3D/FlightPiece3D
 * 负责算"这一帧应该在哪个位置"，算完了直接把这个组件摆过去当"棋子长什么
 * 样"用。
 */

interface Piece3DProps {
  /** 躯干/头部主色 */
  colorMid: string;
  /** 底座/颈环用的深一号颜色 */
  colorDark: string;
  /** 整体缩放，默认1（大富翁用默认大小，飞行棋棋子更多、稍微缩小一些） */
  scale?: number;
  castShadow?: boolean;
}

export default function Piece3D({ colorMid, colorDark, scale = 1, castShadow = true }: Piece3DProps) {
  return (
    <group scale={scale}>
      {/* 底座 */}
      <mesh position={[0, 0.04, 0]} castShadow={castShadow} receiveShadow>
        <cylinderGeometry args={[0.22, 0.26, 0.08, 20]} />
        <meshStandardMaterial color={colorDark} roughness={0.55} />
      </mesh>
      {/* 躯干：上窄下宽的锥形柱体，站姿更像"棋子"而不是一根柱子 */}
      <mesh position={[0, 0.22, 0]} castShadow={castShadow}>
        <cylinderGeometry args={[0.1, 0.17, 0.28, 20]} />
        <meshStandardMaterial color={colorMid} roughness={0.35} metalness={0.1} />
      </mesh>
      {/* 颈部细节环，打破"两段柱体直接拼接"的生硬感 */}
      <mesh position={[0, 0.365, 0]}>
        <torusGeometry args={[0.1, 0.022, 8, 20]} />
        <meshStandardMaterial color={colorDark} roughness={0.4} />
      </mesh>
      {/* 头部 */}
      <mesh position={[0, 0.475, 0]} castShadow={castShadow}>
        <sphereGeometry args={[0.135, 20, 20]} />
        <meshStandardMaterial color={colorMid} roughness={0.3} metalness={0.15} />
      </mesh>
    </group>
  );
}
