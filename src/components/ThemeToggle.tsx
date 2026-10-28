"use client";

import React from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

interface ThemeToggleProps {
  variant?: "pill" | "icon";
  className?: string;
  showLabel?: boolean;
}

export default function ThemeToggle({
  variant = "pill",
  className = "",
  showLabel = true,
}: ThemeToggleProps) {
  const { isDark, toggleTheme } = useTheme();

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        title={isDark ? "Alternar para Modo Claro" : "Alternar para Modo Noturno"}
        aria-label={isDark ? "Alternar para Modo Claro" : "Alternar para Modo Noturno"}
        className={`p-2 rounded-lg border transition-all duration-200 flex items-center justify-center cursor-pointer shadow-sm ${
          isDark
            ? "bg-[#131d36] hover:bg-[#1a2748] text-amber-300 border-slate-700/80 hover:border-amber-400/50"
            : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-[#22c7ac]"
        } ${className}`}
      >
        {isDark ? (
          <Sun className="w-4 h-4 text-amber-400 animate-spin-slow transition-transform hover:rotate-45" />
        ) : (
          <Moon className="w-4 h-4 text-indigo-600 transition-transform hover:-rotate-12" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? "Alternar para Modo Claro" : "Alternar para Modo Noturno"}
      aria-label={isDark ? "Alternar para Modo Claro" : "Alternar para Modo Noturno"}
      className={`group flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all duration-200 cursor-pointer shadow-sm select-none ${
        isDark
          ? "bg-[#131d36] hover:bg-[#1b294a] text-slate-200 border-slate-700/80 hover:border-amber-400/40"
          : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-[#22c7ac]"
      } ${className}`}
    >
      <div className={`p-1 rounded-md transition-colors ${
        isDark ? "bg-amber-500/10 text-amber-400" : "bg-indigo-50 text-indigo-600"
      }`}>
        {isDark ? (
          <Sun className="w-3.5 h-3.5" />
        ) : (
          <Moon className="w-3.5 h-3.5" />
        )}
      </div>
      {showLabel && (
        <span className="truncate">
          {isDark ? "Modo Noturno" : "Modo Claro"}
        </span>
      )}
    </button>
  );
}
