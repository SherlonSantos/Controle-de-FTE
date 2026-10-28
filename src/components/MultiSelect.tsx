"use client";

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';

interface Option {
  label: string;
  value: string;
}

interface MultiSelectProps {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  theme?: 'light' | 'dark';
}

export default function MultiSelect({ label, options, selected, onChange, placeholder = "Selecione...", theme = "light" }: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter(o => o.label.toLowerCase().includes(searchTerm.toLowerCase()));

  const toggleOption = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter(v => v !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  const handleSelectAll = () => {
    if (selected.length === options.length) {
      onChange([]);
    } else {
      onChange(options.map(o => o.value));
    }
  };

  const isDark = theme === 'dark';

  return (
    <div className="relative flex-1 min-w-[160px] md:min-w-[190px]" ref={dropdownRef}>
      <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>
        {label}
      </label>
      <div 
        className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer shadow-sm transition-all border ${
          isDark 
            ? 'bg-[#131d36] border-slate-700/80 hover:border-[#22c7ac] text-white' 
            : 'bg-white border-slate-200 hover:border-[#22c7ac] text-slate-700'
        }`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={`text-xs md:text-sm font-medium truncate ${isDark ? 'text-white' : 'text-slate-700'}`}>
          {selected.length === 0 ? placeholder : `${selected.length} selecionado(s)`}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {selected.length > 0 && (
            <X 
              className="w-3.5 h-3.5 text-slate-400 hover:text-red-500 transition-colors" 
              onClick={(e) => { e.stopPropagation(); onChange([]); }} 
            />
          )}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''} ${isDark ? 'text-slate-400' : 'text-slate-400'}`} />
        </div>
      </div>

      {isOpen && (
        <div className={`absolute z-50 min-w-[280px] max-w-[460px] mt-1.5 rounded-xl shadow-2xl border max-h-72 flex flex-col overflow-hidden animate-in fade-in-50 zoom-in-95 duration-100 ${
          isDark 
            ? 'bg-[#111c33] border-slate-700 text-white shadow-black/60' 
            : 'bg-white border-slate-200 text-slate-800 shadow-xl'
        }`}>
          <div className={`p-2 border-b flex items-center gap-2 ${isDark ? 'border-slate-800 bg-[#0d1629]' : 'border-slate-100 bg-slate-50/50'}`}>
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Pesquisar..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full text-xs md:text-sm outline-none bg-transparent ${isDark ? 'text-white placeholder:text-slate-500' : 'text-slate-700 placeholder:text-slate-400'}`}
              autoFocus
            />
          </div>
          
          <div className="overflow-y-auto flex-1 p-1">
            <div 
              className={`flex items-center gap-2 px-3 py-2 text-xs md:text-sm font-semibold cursor-pointer rounded-lg transition-colors ${
                isDark ? 'hover:bg-white/10 text-slate-200' : 'hover:bg-slate-50 text-slate-700'
              }`}
              onClick={handleSelectAll}
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                selected.length === options.length 
                  ? 'bg-[#22c7ac] border-[#22c7ac]' 
                  : (isDark ? 'border-slate-600' : 'border-slate-300')
              }`}>
                {selected.length === options.length && <Check className="w-3 h-3 text-[#041A71] font-bold" />}
              </div>
              Selecionar Todos ({options.length})
            </div>
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-3 text-xs text-slate-400 text-center">Nenhum resultado encontrado</div>
            ) : (
              filteredOptions.map(opt => {
                const isSelected = selected.includes(opt.value);
                return (
                  <div 
                    key={opt.value}
                    className={`flex items-center gap-2 px-3 py-2 text-xs md:text-sm cursor-pointer rounded-lg transition-colors ${
                      isDark ? 'hover:bg-white/10 text-slate-200' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                    onClick={() => toggleOption(opt.value)}
                  >
                    <div className={`w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center transition-colors ${
                      isSelected 
                        ? 'bg-[#22c7ac] border-[#22c7ac]' 
                        : (isDark ? 'border-slate-600' : 'border-slate-300')
                    }`}>
                      {isSelected && <Check className="w-3 h-3 text-[#041A71] font-bold" />}
                    </div>
                    <span className="leading-tight truncate" title={opt.label}>{opt.label}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
