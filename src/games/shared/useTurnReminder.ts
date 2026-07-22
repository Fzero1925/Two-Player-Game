import { useEffect, useRef, useState } from "react";

const ORIGINAL_TITLE = typeof document !== "undefined" ? document.title : "";

/**
 * "轮到你了"提醒——做的是"不改动后端架构、纯前端就能做到的最大程度"：
 *
 *  1. 标签页标题闪烁：不需要任何权限，只要标签页还开着（哪怕没在前台/被切到
 *     了别的标签页），轮到你、且这个标签页当前不是焦点时，标题会在原标题和
 *     "🔴 轮到你了"之间每秒跳一次；切回来的瞬间（focus/visibilitychange）
 *     立刻恢复原标题，不用等下一次interval。
 *  2. 系统通知：需要用户自己点一次"开启提醒"按钮授权（不会在组件挂载时就
 *     自动弹权限请求——浏览器现在对没有用户主动触发的权限请求越来越不友好，
 *     体验也差，而且大概率被直接拒绝）。授权之后，轮到你、且标签页不在前台
 *     时会弹一条系统通知，点击通知会自动切回并聚焦这个标签页。同一次"轮到我"
 *     只弹一次，不会每秒重复弹。
 *
 *  没有做、以后如果需要再单独做的：应用/浏览器整个关掉之后依然能收到提醒的
 *  "真推送"（Web Push + Service Worker + 后端在对方走完一步棋之后主动发送）。
 *  那需要新增一张 Supabase 表存推送订阅、一个新的 serverless function、外加
 *  VAPID 密钥管理，是完全不同量级的工作，不属于这一版。
 *
 *  用法：`const { permission, requestPermission } = useTurnReminder(myTurn, "大富翁");`
 *  `permission` 是 `"default" | "granted" | "denied" | "unsupported"`，可以用来
 *  决定"开启提醒"按钮要不要显示、显示成什么状态。
 */
export function useTurnReminder(isMyTurn: boolean, gameLabel: string) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    typeof window === "undefined" || typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (!isMyTurn) {
      notifiedRef.current = false;
      document.title = ORIGINAL_TITLE;
      return;
    }

    let flashOn = false;
    const flashInterval = window.setInterval(() => {
      const away = document.hidden || !document.hasFocus();
      if (!away) return;

      flashOn = !flashOn;
      document.title = flashOn ? "🔴 轮到你了" : ORIGINAL_TITLE;

      // 系统通知放在这个每秒都会重新判断一次"标签页是否不在前台"的循环里，
      // 而不是只在 effect 刚跑起来的那一刻判断一次——否则"轮到你的瞬间你
      // 正好在看着屏幕（所以没弹），过一会儿才切走"这种情况会永远漏掉通知，
      // 只有标题闪烁在生效。notifiedRef 保证同一次"轮到我"最多弹一次。
      if (!notifiedRef.current && permission === "granted" && typeof Notification !== "undefined") {
        notifiedRef.current = true;
        const n = new Notification("轮到你了", { body: gameLabel, tag: "duoplay-turn" });
        n.onclick = () => {
          window.focus();
          n.close();
        };
      }
    }, 1000);

    const resetOnFocus = () => {
      if (!document.hidden && document.hasFocus()) {
        flashOn = false;
        document.title = ORIGINAL_TITLE;
      }
    };
    window.addEventListener("focus", resetOnFocus);
    document.addEventListener("visibilitychange", resetOnFocus);

    return () => {
      window.clearInterval(flashInterval);
      window.removeEventListener("focus", resetOnFocus);
      document.removeEventListener("visibilitychange", resetOnFocus);
      document.title = ORIGINAL_TITLE;
    };
  }, [isMyTurn, permission, gameLabel]);

  const requestPermission = () => {
    if (typeof Notification === "undefined") return;
    Notification.requestPermission().then((p) => setPermission(p));
  };

  return { permission, requestPermission };
}
