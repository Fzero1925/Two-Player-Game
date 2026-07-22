import React from "react";
import { Bell, BellRing, BellOff } from "lucide-react";

interface TurnReminderToggleProps {
  permission: NotificationPermission | "unsupported";
  onRequest: () => void;
}

/**
 * 配合 useTurnReminder 用的小开关，放在游戏页头部状态区就行。三种状态：
 * 还没问过 → 一个可点的"开启提醒"按钮；已经同意 → 一个纯展示的已开启标签；
 * 被拒绝 → 提示要去浏览器设置里手动开（JS层面没法重新弹权限请求）。
 * 浏览器不支持 Notification API 时直接不渲染，不占地方。
 */
export default function TurnReminderToggle({ permission, onRequest }: TurnReminderToggleProps) {
  if (permission === "unsupported") return null;

  if (permission === "granted") {
    return (
      <span
        title="轮到你时会弹系统通知（标签页切走了也能看到）"
        className="flex items-center gap-1 text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-lg font-semibold whitespace-nowrap"
      >
        <BellRing size={12} />
        提醒已开启
      </span>
    );
  }

  if (permission === "denied") {
    return (
      <span
        title="通知权限被拒绝了，需要在浏览器设置里手动开启"
        className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg font-semibold whitespace-nowrap"
      >
        <BellOff size={12} />
        提醒被拒绝
      </span>
    );
  }

  return (
    <button
      onClick={onRequest}
      title="轮到你时弹系统通知（标签页切走了也能看到）"
      className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-indigo-600 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 px-2 py-1 rounded-lg font-semibold whitespace-nowrap transition-colors"
    >
      <Bell size={12} />
      开启提醒
    </button>
  );
}
