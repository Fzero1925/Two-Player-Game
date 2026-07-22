import React from "react";
import { Link, Outlet } from "react-router-dom";
import { isSupabaseMode } from "../lib/roomManager.js";
import { Gamepad2 } from "lucide-react";

/**
 * Shared header + footer for every route.
 * The logo/title is now a real <Link to="/">, so clicking it always
 * takes you back to the lobby — this was the main "点击没反应" bug.
 */
export default function Layout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-indigo-500/20 selection:text-indigo-900">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(79,70,229,0.06),transparent_45%),radial-gradient(circle_at_100%_20%,rgba(139,92,246,0.05),transparent_40%)] pointer-events-none" />

      <header className="border-b border-slate-200 relative z-10 backdrop-blur-md bg-white/90">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group" title="返回大厅">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-100 group-hover:bg-indigo-700 transition">
              <Gamepad2 className="text-white" size={20} />
            </div>
            <div>
              <h1 className="text-lg font-display font-semibold tracking-tight text-slate-800">
                DUO<span className="text-indigo-600">PLAY</span>
              </h1>
              <span className="text-[10px] text-slate-500 block font-medium uppercase tracking-wider">
                Two-Player Game Hub
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-slate-100 border border-slate-200 rounded-full text-xs">
              <div className={`w-2 h-2 rounded-full ${isSupabaseMode ? "bg-indigo-500" : "bg-emerald-500"}`} />
              <span className="text-slate-600 font-medium">
                {isSupabaseMode ? "Supabase 云联机" : "本地直连引擎"}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-grow container mx-auto px-4 py-8 relative z-10 max-w-7xl">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-slate-400 text-xs mt-auto bg-white/40">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p>© 2026 双人休闲游乐场. 技术驱动，代码简洁，支持高可扩展性。</p>
          <div className="flex gap-4">
            <span className="hover:text-slate-600 cursor-pointer">服务协议</span>
            <span className="hover:text-slate-600 cursor-pointer">隐私声明</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
