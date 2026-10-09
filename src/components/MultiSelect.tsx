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
}

export default function MultiSelect({ label, options, selected, onChange, placeholder = "Selecione..." }: MultiSelectProps) {
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

  return (
    <div className="relative flex-1 min-w-[200px]" ref={dropdownRef}>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{label}</label>
      <div 
        className="flex items-center justify-between px-3 py-2 bg-white border border-slate-200 rounded-lg cursor-pointer shadow-sm hover:border-[#22c7ac] transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="text-sm font-medium text-slate-700 truncate">
          {selected.length === 0 ? placeholder : `${selected.length} selecionado(s)`}
        </span>
        <div className="flex items-center gap-1">
          {selected.length > 0 && (
            <X 
              className="w-4 h-4 text-slate-400 hover:text-red-500 transition-colors" 
              onClick={(e) => { e.stopPropagation(); onChange([]); }} 
            />
          )}
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 min-w-[300px] max-w-[500px] mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-72 flex flex-col overflow-hidden">
          <div className="p-2 border-b border-slate-100 flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Pesquisar..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-sm outline-none text-slate-700 placeholder:text-slate-400"
            />
          </div>
          
          <div className="overflow-y-auto flex-1 p-1">
            <div 
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer rounded-lg"
              onClick={handleSelectAll}
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selected.length === options.length ? 'bg-[#22c7ac] border-[#22c7ac]' : 'border-slate-300'}`}>
                {selected.length === options.length && <Check className="w-3 h-3 text-white" />}
              </div>
              Selecionar Todos
            </div>
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-500 text-center">Nenhum resultado</div>
            ) : (
              filteredOptions.map(opt => {
                const isSelected = selected.includes(opt.value);
                return (
                  <div 
                    key={opt.value}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer rounded-lg"
                    onClick={() => toggleOption(opt.value)}
                  >
                    <div className={`w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-[#22c7ac] border-[#22c7ac]' : 'border-slate-300'}`}>
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className="text-sm leading-tight">{opt.label}</span>
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
