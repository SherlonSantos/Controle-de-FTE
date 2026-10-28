"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, UploadCloud, LogOut, Key, Menu, X, ShieldCheck, GitCompare } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

export default function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState<number>(0);

  useEffect(() => {
    const fetchPending = () => {
      fetch('/api/governanca/pending-count')
        .then(res => res.json())
        .then(data => {
          if (typeof data?.count === 'number') setPendingCount(data.count);
        })
        .catch(() => {});
    };

    fetchPending();
    const interval = setInterval(fetchPending, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, [pathname]);

  const navItems = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Comparativo de FTEs", href: "/comparativo", icon: GitCompare },
    { 
      name: "Governança de FTE", 
      href: "/governanca", 
      icon: ShieldCheck, 
      badge: pendingCount > 0 ? pendingCount : null 
    },
    { name: "Administração", href: "/importacao", icon: UploadCloud },
  ];

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="md:hidden flex items-center justify-between bg-[#111c33] text-white p-4 shrink-0 shadow-md">
        <div className="flex items-center gap-2">
          <span className="text-[#22c7ac] font-bold text-xl">MRO</span>
          <span className="font-semibold text-white/90">FTE</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle variant="icon" />
          <button onClick={() => setIsMobileOpen(true)} className="p-2 text-slate-300 hover:text-white">
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar Area */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 transform ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
        md:relative md:translate-x-0 
        ${isCollapsed ? 'md:w-20' : 'md:w-64'} 
        w-64
        transition-all duration-300 bg-[#111c33] text-white flex flex-col min-h-screen shadow-2xl md:shadow-lg
      `}>
        {/* Logo Area */}
        <div className={`h-16 flex items-center ${isCollapsed ? 'md:justify-center' : 'justify-between px-4'} border-b border-white/5`}>
          {(!isCollapsed || isMobileOpen) && (
            <div className="flex items-center gap-2 overflow-hidden whitespace-nowrap">
              <span className="text-[#22c7ac] font-bold text-xl">MRO</span>
              <span className="font-semibold text-white/90">Controle de FTE</span>
            </div>
          )}
          
          <div className="flex gap-2">
            <button 
              onClick={() => setIsMobileOpen(false)} 
              className="md:hidden p-2 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white transition-colors"
              title="Fechar Menu"
            >
              <X className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setIsCollapsed(!isCollapsed)} 
              className="hidden md:block p-2 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white transition-colors"
              title="Alternar Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className={`flex-1 py-6 ${isCollapsed ? 'md:px-2 px-4' : 'px-4'} space-y-2 overflow-y-auto`}>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMobileOpen(false)}
                title={isCollapsed ? item.name : undefined}
                className={`flex items-center ${isCollapsed ? 'md:justify-center' : 'justify-between'} px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[#22c7ac] text-white"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className="w-5 h-5 min-w-[20px]" />
                  {(!isCollapsed || isMobileOpen) && <span className="truncate">{item.name}</span>}
                </div>
                {item.badge && (!isCollapsed || isMobileOpen) && (
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs px-2 py-0.5 rounded-full font-bold">
                    {item.badge}
                  </span>
                )}
                {item.badge && isCollapsed && (
                  <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-amber-400 rounded-full" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer Area */}
        <div className={`p-4 border-t border-white/10 ${isCollapsed ? 'md:px-2' : ''}`}>
          <div className="mb-2">
            {isCollapsed ? (
              <div className="flex justify-center">
                <ThemeToggle variant="icon" />
              </div>
            ) : (
              <ThemeToggle variant="pill" className="w-full justify-start" />
            )}
          </div>
          <div className="space-y-1">
            <button title={isCollapsed ? "Alterar senha" : undefined} className={`flex items-center ${isCollapsed ? 'md:justify-center' : 'gap-3'} px-4 py-2 w-full text-left text-sm text-slate-300 hover:bg-white/10 rounded-lg transition-colors`}>
              <Key className="w-4 h-4 min-w-[16px]" /> 
              {(!isCollapsed || isMobileOpen) && "Alterar senha"}
            </button>
            <button title={isCollapsed ? "Sair" : undefined} className={`flex items-center ${isCollapsed ? 'md:justify-center' : 'gap-3'} px-4 py-2 w-full text-left text-sm text-slate-300 hover:bg-white/10 rounded-lg transition-colors`}>
              <LogOut className="w-4 h-4 min-w-[16px]" /> 
              {(!isCollapsed || isMobileOpen) && "Sair"}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
