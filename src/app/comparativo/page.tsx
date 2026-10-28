"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import MultiSelect from "@/components/MultiSelect";
import EvidenceModal from "@/components/comparativo/EvidenceModal";
import { isDemobilized } from "@/lib/demobilizationHelper";
import {
  TrendingUp,
  TrendingDown,
  ChevronRight,
  ChevronDown,
  FilterX,
  Maximize2,
  Minimize2,
  Info,
  FileText,
  ShieldCheck,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  HelpCircle,
  Building2,
  Briefcase,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Users,
  Search,
  RefreshCw
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  Legend,
  Cell,
  LabelList
} from "recharts";
import { useTheme } from "@/context/ThemeContext";
import ThemeToggle from "@/components/ThemeToggle";

// Format numbers in pt-BR
const formatNumber = (val: number | undefined | null) => {
  if (val === undefined || val === null || isNaN(val)) return "0";
  return new Intl.NumberFormat("pt-BR").format(Math.round(val));
};

const formatMoney = (val: number | undefined | null) => {
  if (val === undefined || val === null || isNaN(val) || val === 0) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
};

const formatMoneyCompact = (val: number | undefined | null) => {
  if (val === undefined || val === null || isNaN(val) || val <= 0) return "";
  if (val >= 1_000_000) {
    const m = val / 1_000_000;
    return `R$ ${m.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}M`;
  }
  if (val >= 1_000) {
    const k = val / 1_000;
    return `R$ ${k.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}k`;
  }
  return formatMoney(val);
};

const formatPercent = (val: number | undefined | null, forceSign = true) => {
  if (val === undefined || val === null || isNaN(val)) return "N/A";
  if (val === 0) return "0,0%";
  const prefix = forceSign && val > 0 ? "+" : "";
  const formatted = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2
  }).format(val);
  return `${prefix}${formatted}%`;
};

export default function ComparativoExecutivoPage() {
  const { isDark } = useTheme();
  // Filter Options
  const [filterOptions, setFilterOptions] = useState<{
    competences: string[];
    contracts: string[];
    contractsMetadata?: Array<{ name: string; demobilizationDate?: string | Date | null }>;
    locations: string[];
    costCenters: { id: string; code: string; description: string; contractName: string; location: string }[];
    roles: string[];
    defaultFinal?: string;
  }>({
    competences: [],
    contracts: [],
    locations: [],
    costCenters: [],
    roles: []
  });

  // Selected Filters
  const [selectedCompetence, setSelectedCompetence] = useState<string>("");
  const [selectedContracts, setSelectedContracts] = useState<string[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [chartMonths, setChartMonths] = useState<6 | 12>(12);
  const [chartMetric, setChartMetric] = useState<"fte" | "valor">("fte");

  // Data States
  const [cards, setCards] = useState<any>({
    totalPA: 0,
    totalForecast: 0,
    totalRealizado: 0,
    difPA: 0,
    difForecast: 0,
    pctPA: 0,
    pctForecast: 0
  });
  const [financial, setFinancial] = useState<{
    totalPaValor: number;
    totalForecastValor?: number;
    totalRealValor: number;
    difValor: number;
    pctDifValor: number;
  }>({
    totalPaValor: 0,
    totalForecastValor: 0,
    totalRealValor: 0,
    difValor: 0,
    pctDifValor: 0
  });
  const [topMaiores, setTopMaiores] = useState<any[]>([]);
  const [topMenores, setTopMenores] = useState<any[]>([]);
  const [evolutionChart, setEvolutionChart] = useState<any[]>([]);
  const [complementary, setComplementary] = useState<any>({
    contractsAbovePA: { count: 0, percentage: 0, totalContracts: 0 },
    contractsOnLimitPA: { count: 0, percentage: 0 },
    contractsBelowPA: { count: 0, percentage: 0 },
    excedenteFTE: { positiveSum: 0, deficitSum: 0, netBalance: 0 },
    monthlyVariation: { currentReal: 0, previousReal: 0, diff: 0, pct: 0, trend: "stable" },
    marginStatus: { margemTotalPA: 0, margemTotalForecast: 0, capacidadeNovasVagas: 0, contratosComMargem: 0, contratosRequerAnalise: 0, contratosSemMargem: 0 }
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Drill-down Expansion State: contractId or locationKey
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Governance Evidence Modal
  const [evidenceModalData, setEvidenceModalData] = useState<{
    isOpen: boolean;
    evidence: any | null;
    itemInfo: any | null;
  }>({
    isOpen: false,
    evidence: null,
    itemInfo: null
  });

  // 1. Load Filter Options
  useEffect(() => {
    fetch("/api/comparativo/filters")
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) {
          setFilterOptions(data);
          if (data.defaultFinal) {
            setSelectedCompetence(data.defaultFinal);
          } else if (data.competences?.length > 0) {
            setSelectedCompetence(data.competences[data.competences.length - 1]);
          }
        }
      })
      .catch(console.error);
  }, []);

  // 2. Fetch Executive Data when filters change
  const fetchData = () => {
    if (!selectedCompetence) return;
    setIsLoading(true);

    fetch("/api/comparativo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        competence: selectedCompetence,
        contracts: selectedContracts,
        locations: selectedLocations,
        roles: selectedRoles,
        historicalMonths: chartMonths
      })
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) {
          setCards(data.cards || {});
          setFinancial(data.financial || { totalPaValor: 0, totalRealValor: 0, difValor: 0, pctDifValor: 0 });
          setTopMaiores(data.topMaioresDesvios || []);
          setTopMenores(data.topMenoresDesvios || []);
          setEvolutionChart(data.evolutionChart || []);
          setComplementary(data.complementary || {});
        }
      })
      .catch(console.error)
      .finally(() => {
        setIsLoading(false);
        setIsRefreshing(false);
      });
  };

  useEffect(() => {
    fetchData();
  }, [selectedCompetence, selectedContracts, selectedLocations, selectedRoles, chartMonths]);

  // Handle Fullscreen Toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
      }
    }
  };

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Clear Filters
  const handleClearFilters = () => {
    if (filterOptions.defaultFinal) {
      setSelectedCompetence(filterOptions.defaultFinal);
    }
    setSelectedContracts([]);
    setSelectedLocations([]);
    setSelectedRoles([]);
  };

  // Toggle Row Expansion
  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const availableContracts = useMemo(() => {
    if (!filterOptions.contractsMetadata || !selectedCompetence) {
      return filterOptions.contracts || [];
    }
    return filterOptions.contractsMetadata
      .filter((c: any) => !isDemobilized(selectedCompetence, c.demobilizationDate))
      .map((c: any) => c.name);
  }, [filterOptions.contractsMetadata, filterOptions.contracts, selectedCompetence]);

  // Max absolute percentage among all top contracts to scale proportional deviation bars
  const maxAbsDeviation = useMemo(() => {
    let maxVal = 10;
    [...topMaiores, ...topMenores].forEach((c) => {
      if (c.pctDif && Math.abs(c.pctDif) > maxVal && !c.hasZeroPA) {
        maxVal = Math.min(Math.abs(c.pctDif), 200); // cap visual scale at 200% for aesthetic balance
      }
    });
    return maxVal;
  }, [topMaiores, topMenores]);

  // Open Evidence
  const handleOpenEvidence = (evidence: any, itemInfo: any) => {
    setEvidenceModalData({
      isOpen: true,
      evidence,
      itemInfo
    });
  };

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-200 ${isDark ? 'bg-[#0a0f1d] text-white' : 'bg-slate-50 text-slate-800'} ${isFullscreen ? 'p-3 md:p-6' : 'p-4 md:p-8'}`}>
      
      {/* 1. Header Executivo e Filtros */}
      <header className={`flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 pb-5 border-b shrink-0 ${isDark ? "border-slate-800/80" : "border-slate-200"}`}>

        <div>
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-7 bg-[#22c7ac] rounded-full shadow-lg shadow-[#22c7ac]/30" />
            <h1 className={`text-xl md:text-2xl font-black tracking-tight uppercase font-sans ${isDark ? "text-white" : "text-[#041A71]"}`}>

              Controle de FTE <span className="text-slate-400 font-light">|</span> <span className="text-[#22c7ac]">Visão Executiva</span>
            </h1>
          </div>
          <p className={`text-xs mt-1 pl-5 font-medium flex items-center gap-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>

            <span>Comparativo gerencial de efetivo para diretoria</span>
            <span className="text-slate-600">•</span>
            <span className="text-[#22c7ac] bg-[#22c7ac]/10 px-2 py-0.5 rounded text-[11px] font-semibold">
              Competência: {selectedCompetence || "Carregando..."}
            </span>
          </p>
        </div>

        {/* Filter Controls Bar */}
        <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto">
          {/* Competence Selector */}
          <div className="flex flex-col min-w-[140px]">
            <label className={`text-[11px] font-bold uppercase tracking-wider mb-1 ${isDark ? "text-slate-300" : "text-slate-600"}`}>

              Competência
            </label>
            <div className="relative">
              <select
                value={selectedCompetence}
                onChange={(e) => setSelectedCompetence(e.target.value)}
                className={`w-full text-xs md:text-sm font-semibold rounded-lg px-3 py-2 border outline-none hover:border-[#22c7ac] transition-all cursor-pointer shadow-sm appearance-none pr-8 ${isDark ? "bg-[#131d36] text-white border-slate-700/80" : "bg-white text-slate-800 border-slate-300"}`}
              >
                {(filterOptions.competences || []).map((c) => (
                  <option key={c} value={c} className={isDark ? "bg-[#111c33] text-white" : "bg-white text-slate-800"}>
                    {c} {c === filterOptions.defaultFinal ? "(Vigente)" : ""}
                  </option>
                ))}
              </select>
              <Calendar className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Contrato MultiSelect */}
          <MultiSelect
            label="Contrato"
            placeholder="Todos os Contratos"
            options={(availableContracts || []).map((c: string) => ({ label: c, value: c }))}
            selected={selectedContracts}
            onChange={setSelectedContracts}
            theme={isDark ? "dark" : "light"}
          />

          {/* Localidade MultiSelect */}
          <MultiSelect
            label="Localidade"
            placeholder="Todas as Localidades"
            options={(filterOptions.locations || []).map((l) => ({ label: l, value: l }))}
            selected={selectedLocations}
            onChange={setSelectedLocations}
            theme={isDark ? "dark" : "light"}
          />

          {/* Cargo MultiSelect */}
          <MultiSelect
            label="Cargo"
            placeholder="Todos os Cargos"
            options={(filterOptions.roles || []).map((r) => ({ label: r, value: r }))}
            selected={selectedRoles}
            onChange={setSelectedRoles}
            theme={isDark ? "dark" : "light"}
          />

          {/* Actions: Limpar Filtros & Tela Cheia */}
          <div className="flex items-end gap-1.5 pt-4 xl:pt-0">
            <button
              onClick={handleClearFilters}
              title="Limpar todos os filtros"
              className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-bold transition-all shadow-sm h-[38px] ${isDark ? "bg-[#131d36] hover:bg-slate-800 text-slate-300 hover:text-white border-slate-700/80" : "bg-white hover:bg-slate-100 text-slate-700 border-slate-300"}`}
            >
              <FilterX className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Limpar</span>
            </button>

            <button
              onClick={() => {
                setIsRefreshing(true);
                fetchData();
              }}
              title="Atualizar dados"
              className={`p-2 border rounded-lg text-xs font-bold transition-all shadow-sm h-[38px] w-[38px] flex items-center justify-center ${isDark ? "bg-[#131d36] hover:bg-slate-800 text-slate-300 hover:text-[#22c7ac] border-slate-700/80" : "bg-white hover:bg-slate-100 text-slate-700 hover:text-[#22c7ac] border-slate-300"}`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#22c7ac]' : ''}`} />
            </button>

            <ThemeToggle variant="pill" className="h-[38px]" />

            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? "Sair do Modo Executivo" : "Modo Executivo em Tela Cheia"}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm h-[38px] ${
                isFullscreen
                  ? 'bg-[#22c7ac] text-[#041A71] shadow-lg shadow-[#22c7ac]/20'
                  : (isDark ? "bg-[#162038] hover:bg-[#1c294a] text-slate-200 border border-slate-700/80" : "bg-white hover:bg-slate-100 text-slate-700 border border-slate-300")
              }`}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5 text-[#22c7ac]" />}
              <span className="hidden md:inline">{isFullscreen ? "Sair Tela Cheia" : "Modo Executivo"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Dashboard Body */}
      <main className="flex-1 flex flex-col gap-5 pt-5 pb-6">

        {/* 2. Cards de Indicadores (mesmo padrão da aba Dashboard) */}
        <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5">
          {/* Card 1: FTE PA */}
          <div className={`rounded-xl p-4 border shadow-sm flex flex-col justify-between relative overflow-hidden group transition-all ${isDark ? "bg-[#111c33] border-slate-800 text-white shadow-lg hover:border-[#3A78DE]/40" : "bg-white border-slate-200 text-slate-800 shadow-sm hover:border-[#3A78DE]/40"}`}>
            <div className={`flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>

              <span>FTE PA</span>
              <span className="w-2 h-2 rounded-full bg-[#3A78DE]" />
            </div>
            <div className={`text-3xl font-light tracking-tight my-1 ${isDark ? "text-white" : "text-slate-900"}`}>
              {isLoading ? "..." : formatNumber(cards.totalPA)}
            </div>
            <div className={`text-[11px] font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Planejado aprovado anual
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#3A78DE]/40" />
          </div>

          {/* Card 2: FTE Forecast */}
          <div className={`rounded-xl p-4 border shadow-sm flex flex-col justify-between relative overflow-hidden group transition-all ${isDark ? "bg-[#111c33] border-slate-800 text-white shadow-lg hover:border-indigo-500/40" : "bg-white border-slate-200 text-slate-800 shadow-sm hover:border-indigo-500/40"}`}>
            <div className={`flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>

              <span>FTE Forecast</span>
              <span className="w-2 h-2 rounded-full bg-indigo-400" />
            </div>
            <div className={`text-3xl font-light tracking-tight my-1 ${isDark ? "text-white" : "text-slate-900"}`}>
              {isLoading ? "..." : formatNumber(cards.totalForecast)}
            </div>
            <div className={`text-[11px] font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Baseline ajustado vigente
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-500/40" />
          </div>

          {/* Card 3: FTE Realizado */}
          <div className={`rounded-xl p-4 border shadow-sm flex flex-col justify-between relative overflow-hidden group transition-all ${isDark ? "bg-[#111c33] border-slate-800 text-white shadow-lg hover:border-[#00CE7C]/40" : "bg-white border-slate-200 text-slate-800 shadow-sm hover:border-[#00CE7C]/40"}`}>
            <div className={`flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>

              <span>FTE Realizado</span>
              <span className="w-2 h-2 rounded-full bg-[#00CE7C]" />
            </div>
            <div className={`text-3xl font-light tracking-tight my-1 ${isDark ? "text-white" : "text-slate-900"}`}>
              {isLoading ? "..." : formatNumber(cards.totalRealizado)}
            </div>
            <div className={`text-[11px] font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Efetivo ativo consolidado
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#00CE7C]/40" />
          </div>

          {/* Card 4: Dif. Real x PA */}
          <div className={`rounded-xl p-4 border shadow-sm flex flex-col justify-between relative overflow-hidden group transition-all ${isDark ? "bg-[#111c33] border-slate-800 text-white shadow-lg" : "bg-white border-slate-200 text-slate-800 shadow-sm"}`}>
            <div className={`flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>

              <span>Dif. Real x PA</span>
              {cards.difPA > 0 ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-bold">Acima</span>
              ) : cards.difPA < 0 ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">Abaixo</span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/20 text-slate-400 font-bold">Igual</span>
              )}
            </div>
            <div className={`text-3xl font-semibold tracking-tight my-1 ${
              cards.difPA > 0 ? 'text-red-400' : cards.difPA < 0 ? 'text-[#00CE7C]' : 'text-slate-300'
            }`}>
              {isLoading ? "..." : (cards.difPA > 0 ? `+${formatNumber(cards.difPA)}` : formatNumber(cards.difPA))}
            </div>
            <div className={`text-[11px] font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              {cards.difPA > 0 ? "Excesso em relação ao PA" : "Saldo em relação ao PA"}
            </div>
            <div className={`absolute bottom-0 left-0 right-0 h-1 ${cards.difPA > 0 ? 'bg-red-500/60' : cards.difPA < 0 ? 'bg-emerald-500/60' : 'bg-slate-600'}`} />
          </div>

          {/* Card 5: Dif. Real x Forecast */}
          <div className={`rounded-xl p-4 border shadow-sm flex flex-col justify-between relative overflow-hidden group transition-all ${isDark ? "bg-[#111c33] border-slate-800 text-white shadow-lg" : "bg-white border-slate-200 text-slate-800 shadow-sm"}`}>
            <div className={`flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>

              <span>Dif. Real x Forecast</span>
              {cards.difForecast > 0 ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-bold">Acima</span>
              ) : cards.difForecast < 0 ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">Abaixo</span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/20 text-slate-400 font-bold">Igual</span>
              )}
            </div>
            <div className={`text-3xl font-semibold tracking-tight my-1 ${
              cards.difForecast > 0 ? 'text-red-400' : cards.difForecast < 0 ? 'text-[#00CE7C]' : 'text-slate-300'
            }`}>
              {isLoading ? "..." : (cards.difForecast > 0 ? `+${formatNumber(cards.difForecast)}` : formatNumber(cards.difForecast))}
            </div>
            <div className={`text-[11px] font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Variação vs baseline ajustado
            </div>
            <div className={`absolute bottom-0 left-0 right-0 h-1 ${cards.difForecast > 0 ? 'bg-red-500/60' : cards.difForecast < 0 ? 'bg-emerald-500/60' : 'bg-slate-600'}`} />
          </div>

          {/* Card 6: % Variação PA */}
          <div className={`rounded-xl p-4 border shadow-sm flex flex-col justify-between relative overflow-hidden group transition-all ${isDark ? "bg-[#111c33] border-slate-800 text-white shadow-lg" : "bg-white border-slate-200 text-slate-800 shadow-sm"}`}>
            <div className={`flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>

              <span>% Variação PA</span>
              {cards.pctPA !== null && (
                cards.pctPA > 0 ? (
                  <ArrowUpRight className="w-4 h-4 text-red-400" />
                ) : cards.pctPA < 0 ? (
                  <ArrowDownRight className="w-4 h-4 text-[#00CE7C]" />
                ) : null
              )}
            </div>
            <div className={`text-3xl font-bold tracking-tight my-1 ${
              cards.pctPA > 0 ? 'text-red-400' : cards.pctPA < 0 ? 'text-[#00CE7C]' : 'text-slate-300'
            }`}>
              {isLoading ? "..." : formatPercent(cards.pctPA)}
            </div>
            <div className={`text-[11px] font-medium truncate ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Variação percentual do efetivo
            </div>
            <div className={`absolute bottom-0 left-0 right-0 h-1 ${cards.pctPA > 0 ? 'bg-red-500/60' : cards.pctPA < 0 ? 'bg-emerald-500/60' : 'bg-slate-600'}`} />
          </div>
        </section>

        {/* 3. Rankings de FTE — Principal Destaque da Página (Duas Tabelas Lado a Lado) */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* TABELA A: TOP 10 MAIORES DESVIOS */}
          <div className={`rounded-xl border flex flex-col overflow-hidden shadow-sm transition-all ${isDark ? "bg-[#111c33] border-slate-800/90 shadow-xl text-white" : "bg-white border-slate-200 text-slate-800"}`}>
            {/* Header da Tabela A */}
            <div className={`px-5 py-3.5 border-b flex items-center justify-between transition-colors ${isDark ? "bg-[#0e172a] border-slate-800/80 text-white" : "bg-slate-100 border-slate-200 text-[#041A71]"}`}>
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-md shadow-red-500/40" />
                <h3 className={`font-extrabold text-sm md:text-base tracking-wide uppercase ${isDark ? "text-white" : "text-[#041A71]"}`}>
                  TOP 10 | Maiores desvios de FTE
                </h3>
              </div>
              <span className="text-[11px] text-red-400/90 bg-red-950/60 border border-red-900/60 px-2.5 py-0.5 rounded-full font-semibold">
                Realizado &gt; PA
              </span>
            </div>

            {/* Table Content */}
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className={`font-bold border-b text-[11px] uppercase tracking-wider ${isDark ? "bg-[#0b1222] text-slate-400 border-slate-800" : "bg-slate-50 text-slate-600 border-slate-200"}`}>
                  <tr>
                    <th className="py-2.5 px-3 w-8 text-center">#</th>
                    <th className="py-2.5 px-3">Contrato</th>
                    <th className="py-2.5 px-3 text-right">PA</th>
                    <th className="py-2.5 px-3 text-right">Forecast</th>
                    <th className="py-2.5 px-3 text-right">Realizado</th>
                    <th className="py-2.5 px-3 text-right">Dif. FTE</th>
                    <th className="py-2.5 px-3 text-right min-w-[130px]">% Dif. Real.</th>
                  </tr>
                </thead>
                <tbody className={`divide-y text-xs ${isDark ? "divide-slate-800/50 text-slate-200" : "divide-slate-200 text-slate-700"}`}>
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        Carregando rankings executivos...
                      </td>
                    </tr>
                  ) : topMaiores.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-500">
                        Nenhum contrato com efetivo acima do planejado nesta competência.
                      </td>
                    </tr>
                  ) : (
                    topMaiores.map((contract) => {
                      const isExpanded = expandedRows.has(`c_${contract.contractName}`);
                      const pctVal = contract.pctDif;
                      const barWidth = Math.min(100, Math.max(5, (Math.abs(pctVal || 0) / maxAbsDeviation) * 100));

                      return (
                        <React.Fragment key={contract.contractName}>
                          {/* Level 1: Contract Row */}
                          <tr
                            onClick={() => toggleRow(`c_${contract.contractName}`)}
                            className={`group cursor-pointer transition-colors ${isDark ? "hover:bg-white/[0.04]" : "hover:bg-slate-50"} ${isExpanded ? (isDark ? "bg-white/[0.03]" : "bg-slate-50/70") : ""}`}
                          >
                            <td className="py-2.5 px-3 text-center font-bold text-slate-400 font-mono">
                              {contract.rank}º
                            </td>
                            <td className={`py-2.5 px-3 font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>
                              <div className="flex items-center gap-1.5 max-w-[220px] truncate" title={contract.contractName}>
                                {isExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0 group-hover:text-white" />
                                )}
                                <span className="truncate">{contract.contractName}</span>
                                {contract.hasZeroPA && (
                                  <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-bold shrink-0">
                                    Sem PA
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className={`py-2.5 px-3 text-right font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                              {formatNumber(contract.pa)}
                            </td>
                            <td className={`py-2.5 px-3 text-right font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                              {formatNumber(contract.forecast)}
                            </td>
                            <td className={`py-2.5 px-3 text-right font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                              {formatNumber(contract.realizado)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-red-400 font-mono">
                              +{formatNumber(contract.difFTE)}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className={`w-16 rounded-full h-1.5 overflow-hidden shrink-0 ${isDark ? "bg-slate-800" : "bg-slate-200"}`}>
                                  <div
                                    className="bg-red-500 h-full rounded-full transition-all"
                                    style={{ width: `${barWidth}%` }}
                                  />
                                </div>
                                <span className="font-bold text-red-400 w-14 font-mono text-right">
                                  {contract.hasZeroPA ? "N/A" : formatPercent(pctVal)}
                                </span>
                              </div>
                            </td>
                          </tr>

                          {/* Level 2: Localidade (Drill-Down) */}
                          {isExpanded && contract.locations?.map((loc: any) => {
                            const isLocExpanded = expandedRows.has(`l_${contract.contractName}_${loc.costCenterCode}`);
                            return (
                              <React.Fragment key={loc.costCenterCode}>
                                <tr
                                  onClick={() => toggleRow(`l_${contract.contractName}_${loc.costCenterCode}`)}
                                  className={`cursor-pointer transition-colors text-[11px] border-t ${isDark ? "bg-[#0b1221]/80 hover:bg-[#0f172a] text-slate-300 border-slate-800/40" : "bg-slate-50 hover:bg-slate-100/80 text-slate-700 border-slate-200"}`}
                                >
                                  <td className="py-2 px-3"></td>
                                  <td className="py-2 px-3 pl-8">
                                    <div className="flex items-center gap-1.5 max-w-[200px] truncate" title={`${loc.costCenterCode} - ${loc.costCenterDesc}`}>
                                      {isLocExpanded ? (
                                        <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                                      ) : (
                                        <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />
                                      )}
                                      <span className={`font-semibold truncate ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                                        {loc.locationName}
                                      </span>
                                      <span className="text-[10px] text-slate-500 font-mono">
                                        ({loc.costCenterCode})
                                      </span>
                                    </div>
                                  </td>
                                  <td className={`py-2 px-3 text-right ${isDark ? "text-slate-400" : "text-slate-600"}`}>{formatNumber(loc.pa)}</td>
                                  <td className="py-2 px-3 text-right text-slate-500">{formatNumber(loc.forecast)}</td>
                                  <td className={`py-2 px-3 text-right font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>{formatNumber(loc.realizado)}</td>
                                  <td className={`py-2 px-3 text-right font-bold font-mono ${loc.difFTE > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                                    {loc.difFTE > 0 ? `+${formatNumber(loc.difFTE)}` : formatNumber(loc.difFTE)}
                                  </td>
                                  <td className={`py-2 px-3 text-right font-mono font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                                    {loc.hasZeroPA ? "N/A" : formatPercent(loc.pctDif)}
                                  </td>
                                </tr>

                                {/* Level 3: Cargo (Drill-Down) */}
                                {isLocExpanded && loc.roles?.map((role: any, rIdx: number) => (
                                  <tr
                                    key={rIdx}
                                    className={`text-[10.5px] border-t transition-colors ${isDark ? "bg-[#070b14] text-slate-400 border-slate-800/20 hover:bg-white/[0.02]" : "bg-white text-slate-600 border-slate-100 hover:bg-slate-50"}`}
                                  >
                                    <td className="py-1.5 px-3"></td>
                                    <td className="py-1.5 px-3 pl-14">
                                      <div className="flex items-center gap-1.5">
                                        <span className={`truncate max-w-[170px] font-medium ${isDark ? "text-slate-300" : "text-slate-800"}`} title={role.roleTitle}>
                                          {role.roleTitle}
                                        </span>
                                        {role.justification && (
                                          <span
                                            className="cursor-help p-0.5 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                                            title={`Justificativa: ${role.justification}`}
                                          >
                                            <Info className="w-3 h-3" />
                                          </span>
                                        )}
                                        {role.evidence && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleOpenEvidence(role.evidence, {
                                                contractName: contract.contractName,
                                                roleTitle: role.roleTitle,
                                                competence: selectedCompetence,
                                                variation: role.difFTE
                                              });
                                            }}
                                            className="text-[#22c7ac] hover:text-white p-0.5 rounded bg-[#22c7ac]/10 hover:bg-[#22c7ac]/20"
                                            title="Ver evidência anexada"
                                          >
                                            <FileText className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                    <td className={`py-1.5 px-3 text-right ${isDark ? "text-slate-400" : "text-slate-600"}`}>{formatNumber(role.pa)}</td>
                                    <td className="py-1.5 px-3 text-right text-slate-500">{formatNumber(role.forecast)}</td>
                                    <td className={`py-1.5 px-3 text-right font-medium ${isDark ? "text-slate-300" : "text-slate-800"}`}>{formatNumber(role.realizado)}</td>
                                    <td className={`py-1.5 px-3 text-right font-mono font-bold ${role.difFTE > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                                      {role.difFTE > 0 ? `+${formatNumber(role.difFTE)}` : formatNumber(role.difFTE)}
                                    </td>
                                    <td className="py-1.5 px-3 text-right font-mono">
                                      {role.pa === 0 ? "N/A" : formatPercent(role.pctDif)}
                                    </td>
                                  </tr>
                                ))}
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer com indicação de Drill-down */}
            <div className={`px-4 py-2 border-t text-[11px] flex items-center justify-between ${isDark ? "bg-[#0b1222] border-slate-800 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
              <span>Drill-down: contrato → localidade → cargo</span>
              <span className="text-[10px] text-slate-500">Clique para expandir</span>
            </div>
          </div>

          {/* TABELA B: TOP 10 MENORES DESVIOS */}
          <div className={`rounded-xl border flex flex-col overflow-hidden shadow-sm transition-all ${isDark ? "bg-[#111c33] border-slate-800/90 shadow-xl text-white" : "bg-white border-slate-200 text-slate-800"}`}>
            {/* Header da Tabela B */}
            <div className={`px-5 py-3.5 border-b flex items-center justify-between transition-colors ${isDark ? "bg-[#0e172a] border-slate-800/80 text-white" : "bg-slate-100 border-slate-200 text-[#041A71]"}`}>
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#00CE7C] shadow-md shadow-[#00CE7C]/40" />
                <h3 className={`font-extrabold text-sm md:text-base tracking-wide uppercase ${isDark ? "text-white" : "text-[#041A71]"}`}>
                  TOP 10 | Menores desvios de FTE
                </h3>
              </div>
              <span className="text-[11px] text-emerald-400/90 bg-emerald-950/60 border border-emerald-900/60 px-2.5 py-0.5 rounded-full font-semibold">
                Realizado &lt; PA
              </span>
            </div>

            {/* Table Content */}
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className={`font-bold border-b text-[11px] uppercase tracking-wider ${isDark ? "bg-[#0b1222] text-slate-400 border-slate-800" : "bg-slate-50 text-slate-600 border-slate-200"}`}>
                  <tr>
                    <th className="py-2.5 px-3 w-8 text-center">#</th>
                    <th className="py-2.5 px-3">Contrato</th>
                    <th className="py-2.5 px-3 text-right">PA</th>
                    <th className="py-2.5 px-3 text-right">Forecast</th>
                    <th className="py-2.5 px-3 text-right">Realizado</th>
                    <th className="py-2.5 px-3 text-right">Dif. FTE</th>
                    <th className="py-2.5 px-3 text-right min-w-[130px]">% Dif. Real.</th>
                  </tr>
                </thead>
                <tbody className={`divide-y text-xs ${isDark ? "divide-slate-800/50 text-slate-200" : "divide-slate-200 text-slate-700"}`}>
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        Carregando rankings executivos...
                      </td>
                    </tr>
                  ) : topMenores.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-500">
                        Nenhum contrato com efetivo abaixo do planejado nesta competência.
                      </td>
                    </tr>
                  ) : (
                    topMenores.map((contract) => {
                      const isExpanded = expandedRows.has(`c_menor_${contract.contractName}`);
                      const pctVal = contract.pctDif;
                      const barWidth = Math.min(100, Math.max(5, (Math.abs(pctVal || 0) / maxAbsDeviation) * 100));

                      return (
                        <React.Fragment key={contract.contractName}>
                          {/* Level 1: Contract Row */}
                          <tr
                            onClick={() => toggleRow(`c_menor_${contract.contractName}`)}
                            className={`group cursor-pointer transition-colors ${isDark ? "hover:bg-white/[0.04]" : "hover:bg-slate-50"} ${isExpanded ? (isDark ? "bg-white/[0.03]" : "bg-slate-50/70") : ""}`}
                          >
                            <td className="py-2.5 px-3 text-center font-bold text-slate-400 font-mono">
                              {contract.rank}º
                            </td>
                            <td className={`py-2.5 px-3 font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>
                              <div className="flex items-center gap-1.5 max-w-[220px] truncate" title={contract.contractName}>
                                {isExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0 group-hover:text-white" />
                                )}
                                <span className="truncate">{contract.contractName}</span>
                              </div>
                            </td>
                            <td className={`py-2.5 px-3 text-right font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                              {formatNumber(contract.pa)}
                            </td>
                            <td className={`py-2.5 px-3 text-right font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                              {formatNumber(contract.forecast)}
                            </td>
                            <td className={`py-2.5 px-3 text-right font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                              {formatNumber(contract.realizado)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-[#00CE7C] font-mono">
                              {formatNumber(contract.difFTE)}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className={`w-16 rounded-full h-1.5 overflow-hidden shrink-0 ${isDark ? "bg-slate-800" : "bg-slate-200"}`}>
                                  <div
                                    className="bg-[#00CE7C] h-full rounded-full transition-all"
                                    style={{ width: `${barWidth}%` }}
                                  />
                                </div>
                                <span className="font-bold text-[#00CE7C] w-14 font-mono text-right">
                                  {formatPercent(pctVal)}
                                </span>
                              </div>
                            </td>
                          </tr>

                          {/* Level 2: Localidade (Drill-Down) */}
                          {isExpanded && contract.locations?.map((loc: any) => {
                            const isLocExpanded = expandedRows.has(`l_menor_${contract.contractName}_${loc.costCenterCode}`);
                            return (
                              <React.Fragment key={loc.costCenterCode}>
                                <tr
                                  onClick={() => toggleRow(`l_menor_${contract.contractName}_${loc.costCenterCode}`)}
                                  className={`cursor-pointer transition-colors text-[11px] border-t ${isDark ? "bg-[#0b1221]/80 hover:bg-[#0f172a] text-slate-300 border-slate-800/40" : "bg-slate-50 hover:bg-slate-100/80 text-slate-700 border-slate-200"}`}
                                >
                                  <td className="py-2 px-3"></td>
                                  <td className="py-2 px-3 pl-8">
                                    <div className="flex items-center gap-1.5 max-w-[200px] truncate" title={`${loc.costCenterCode} - ${loc.costCenterDesc}`}>
                                      {isLocExpanded ? (
                                        <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                                      ) : (
                                        <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />
                                      )}
                                      <span className={`font-semibold truncate ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                                        {loc.locationName}
                                      </span>
                                      <span className="text-[10px] text-slate-500 font-mono">
                                        ({loc.costCenterCode})
                                      </span>
                                    </div>
                                  </td>
                                  <td className={`py-2 px-3 text-right ${isDark ? "text-slate-400" : "text-slate-600"}`}>{formatNumber(loc.pa)}</td>
                                  <td className="py-2 px-3 text-right text-slate-500">{formatNumber(loc.forecast)}</td>
                                  <td className={`py-2 px-3 text-right font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>{formatNumber(loc.realizado)}</td>
                                  <td className={`py-2 px-3 text-right font-bold font-mono ${loc.difFTE < 0 ? 'text-[#00CE7C]' : 'text-slate-400'}`}>
                                    {formatNumber(loc.difFTE)}
                                  </td>
                                  <td className={`py-2 px-3 text-right font-mono font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                                    {formatPercent(loc.pctDif)}
                                  </td>
                                </tr>

                                {/* Level 3: Cargo (Drill-Down) */}
                                {isLocExpanded && loc.roles?.map((role: any, rIdx: number) => (
                                  <tr
                                    key={rIdx}
                                    className={`text-[10.5px] border-t transition-colors ${isDark ? "bg-[#070b14] text-slate-400 border-slate-800/20 hover:bg-white/[0.02]" : "bg-white text-slate-600 border-slate-100 hover:bg-slate-50"}`}
                                  >
                                    <td className="py-1.5 px-3"></td>
                                    <td className="py-1.5 px-3 pl-14">
                                      <div className="flex items-center gap-1.5">
                                        <span className={`truncate max-w-[170px] font-medium ${isDark ? "text-slate-300" : "text-slate-800"}`} title={role.roleTitle}>
                                          {role.roleTitle}
                                        </span>
                                        {role.justification && (
                                          <span
                                            className="cursor-help p-0.5 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                                            title={`Justificativa: ${role.justification}`}
                                          >
                                            <Info className="w-3 h-3" />
                                          </span>
                                        )}
                                        {role.evidence && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleOpenEvidence(role.evidence, {
                                                contractName: contract.contractName,
                                                roleTitle: role.roleTitle,
                                                competence: selectedCompetence,
                                                variation: role.difFTE
                                              });
                                            }}
                                            className="text-[#22c7ac] hover:text-white p-0.5 rounded bg-[#22c7ac]/10 hover:bg-[#22c7ac]/20"
                                            title="Ver evidência anexada"
                                          >
                                            <FileText className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                    <td className={`py-1.5 px-3 text-right ${isDark ? "text-slate-400" : "text-slate-600"}`}>{formatNumber(role.pa)}</td>
                                    <td className="py-1.5 px-3 text-right text-slate-500">{formatNumber(role.forecast)}</td>
                                    <td className={`py-1.5 px-3 text-right font-medium ${isDark ? "text-slate-300" : "text-slate-800"}`}>{formatNumber(role.realizado)}</td>
                                    <td className={`py-1.5 px-3 text-right font-mono font-bold ${role.difFTE < 0 ? 'text-[#00CE7C]' : 'text-slate-400'}`}>
                                      {formatNumber(role.difFTE)}
                                    </td>
                                    <td className="py-1.5 px-3 text-right font-mono">
                                      {formatPercent(role.pctDif)}
                                    </td>
                                  </tr>
                                ))}
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer com indicação de Drill-down */}
            <div className={`px-4 py-2 border-t text-[11px] flex items-center justify-between ${isDark ? "bg-[#0b1222] border-slate-800 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
              <span>Drill-down: contrato → localidade → cargo</span>
              <span className="text-[10px] text-slate-500">Clique para expandir</span>
            </div>
          </div>

        </section>

        {/* 4. Gráfico Comparativo — Evolução Histórica (PA x Forecast x Realizado) */}
        <section className="bg-[#111c33] rounded-xl border border-slate-800/90 shadow-xl p-5 flex flex-col">
          {/* Header do Card com Totais Financeiros (R$) e Controles */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
            <div>
              <h3 className="font-extrabold text-base text-white tracking-wide uppercase flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#22c7ac]" />
                Evolução histórica | PA x Forecast x Realizado
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Comparativo mensal de efetivo planejado, baseline ajustado e realizado (competências cronológicas)
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Total PA (R$) */}
              <div className={`rounded-xl px-3.5 py-1.5 flex items-center gap-2.5 shadow-sm border ${isDark ? "bg-[#0b1222] border-blue-900/50" : "bg-blue-50/60 border-blue-200"}`}>
                <div className="w-2 h-2 rounded-full bg-[#1d4ed8]" />
                <div>
                  <div className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">
                    Total PA (R$)
                  </div>
                  <div className={`text-xs md:text-sm font-black font-mono ${isDark ? "text-white" : "text-blue-900"}`}>
                    {isLoading ? "..." : formatMoney(financial.totalPaValor)}
                  </div>
                </div>
              </div>

              {/* Total Real (R$) */}
              <div className={`rounded-xl px-3.5 py-1.5 flex items-center gap-2.5 shadow-sm border ${isDark ? "bg-[#0b1222] border-emerald-900/50" : "bg-emerald-50/60 border-emerald-200"}`}>
                <div className="w-2 h-2 rounded-full bg-[#00CE7C]" />
                <div>
                  <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                    Total Real (R$)
                  </div>
                  <div className={`text-xs md:text-sm font-black font-mono ${isDark ? "text-white" : "text-emerald-900"}`}>
                    {isLoading ? "..." : formatMoney(financial.totalRealValor)}
                  </div>
                </div>
              </div>

              {/* Diferença Financeira */}
              <div className={`rounded-xl px-3 py-1.5 flex items-center gap-2 shadow-sm border ${isDark ? "bg-[#0b1222] border-slate-800" : "bg-slate-100/80 border-slate-200"}`}>
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Dif. Valor (R$)
                  </div>
                  <div className={`text-xs md:text-sm font-black font-mono ${
                    financial.difValor < 0 ? 'text-[#00CE7C]' : financial.difValor > 0 ? 'text-red-400' : 'text-slate-300'
                  }`}>
                    {isLoading ? "..." : `${financial.difValor > 0 ? '+' : ''}${formatMoney(financial.difValor)} (${financial.pctDifValor > 0 ? '+' : ''}${financial.pctDifValor.toFixed(1)}%)`}
                  </div>
                </div>
              </div>

              {/* Toggle de Métrica: Quantidade (FTE) vs Valor (R$) */}
              <div className={`p-0.5 rounded-lg border flex shrink-0 ${isDark ? "bg-[#0b1222] border-slate-800" : "bg-slate-100 border-slate-300"}`}>
                <button
                  type="button"
                  onClick={() => setChartMetric("fte")}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                    chartMetric === "fte"
                      ? "bg-[#22c7ac] text-[#041A71] shadow-sm"
                      : (isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900")
                  }`}
                >
                  Quantidade (FTE)
                </button>
                <button
                  type="button"
                  onClick={() => setChartMetric("valor")}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                    chartMetric === "valor"
                      ? "bg-[#22c7ac] text-[#041A71] shadow-sm"
                      : (isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900")
                  }`}
                >
                  Valor (R$)
                </button>
              </div>

              {/* Toggle 6 vs 12 Meses */}
              <div className={`p-0.5 rounded-lg border flex shrink-0 ${isDark ? "bg-[#0b1222] border-slate-800" : "bg-slate-100 border-slate-300"}`}>
                <button
                  type="button"
                  onClick={() => setChartMonths(6)}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                    chartMonths === 6
                      ? 'bg-[#22c7ac] text-[#041A71] shadow-sm'
                      : (isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900")
                  }`}
                >
                  6 Meses
                </button>
                <button
                  type="button"
                  onClick={() => setChartMonths(12)}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                    chartMonths === 12
                      ? 'bg-[#22c7ac] text-[#041A71] shadow-sm'
                      : (isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900")
                  }`}
                >
                  12 Meses
                </button>
              </div>
            </div>
          </div>

          {/* Gráfico Recharts com 3 Barras Alternáveis e Rótulos Numéricos */}
          <div className="h-72 sm:h-80 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={evolutionChart}
                margin={{ top: 22, right: 10, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#1e293b" : "#e2e8f0"} vertical={false} />
                <XAxis
                  dataKey="competence"
                  stroke={isDark ? "#64748b" : "#94a3b8"}
                  tick={{ fill: isDark ? '#94a3b8' : '#475569', fontSize: 11, fontWeight: 600 }}
                  axisLine={{ stroke: isDark ? '#334155' : '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={{ stroke: '#334155' }}
                  tickLine={false}
                  domain={[0, 'auto']}
                  tickFormatter={(v: any) => chartMetric === 'valor' ? formatMoneyCompact(v) : formatNumber(v)}
                />
                <RechartsTooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      const hasReal = data.hasRealizado;
                      const hasFin = data.valPa > 0 || data.valReal > 0;
                      return (
                        <div className="bg-[#0d1629] border border-slate-700/80 rounded-xl p-3.5 shadow-2xl text-xs space-y-2 min-w-[250px]">
                          <div className="font-bold text-white border-b border-slate-700/60 pb-1.5 flex items-center justify-between">
                            <span className="text-sm">Competência {label}</span>
                            {label === selectedCompetence && (
                              <span className="text-[10px] bg-[#22c7ac]/20 text-[#22c7ac] px-2 py-0.5 rounded font-bold">
                                Ativa
                              </span>
                            )}
                          </div>

                          {chartMetric === 'valor' ? (
                            <>
                              {/* Seção Financeira (Prioritária no Modo Valor) */}
                              <div className="space-y-1">
                                <div className="text-[10px] text-[#22c7ac] font-bold uppercase tracking-wider">
                                  Valores Financeiros (R$)
                                </div>
                                <div className="flex items-center justify-between text-slate-300">
                                  <span className="flex items-center gap-1.5 text-blue-400 font-semibold">
                                    <span className="w-2 h-2 rounded-full bg-[#1d4ed8]" /> Total PA:
                                  </span>
                                  <span className="font-mono font-bold text-white">{formatMoney(data.valPa)}</span>
                                </div>
                                <div className="flex items-center justify-between text-slate-300">
                                  <span className="flex items-center gap-1.5 text-indigo-400 font-semibold">
                                    <span className="w-2 h-2 rounded-full bg-[#6366f1]" /> Forecast (R$):
                                  </span>
                                  <span className="font-mono font-bold text-white">{formatMoney(data.valForecast)}</span>
                                </div>
                                <div className="flex items-center justify-between text-slate-300">
                                  <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                                    <span className="w-2 h-2 rounded-full bg-[#00CE7C]" /> Total Real:
                                  </span>
                                  <span className="font-mono font-bold text-white">
                                    {hasReal ? formatMoney(data.valReal) : "Não realizado"}
                                  </span>
                                </div>
                                {data.valReal > 0 && data.valPa > 0 && (
                                  <div className="flex items-center justify-between text-[11px] font-semibold pt-1 border-t border-slate-800">
                                    <span className="text-slate-400">Dif. Valor (Real - PA):</span>
                                    <span className={`font-mono font-bold ${data.difValor < 0 ? 'text-[#00CE7C]' : data.difValor > 0 ? 'text-red-400' : 'text-slate-300'}`}>
                                      {data.difValor > 0 ? '+' : ''}{formatMoney(data.difValor)}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Seção FTE (Secundária) */}
                              <div className="pt-2 border-t border-slate-700/60 space-y-1">
                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                  Quantitativo de FTE
                                </div>
                                <div className="flex items-center justify-between text-slate-400">
                                  <span>PA / Forecast / Real:</span>
                                  <span className="font-mono font-semibold text-white">
                                    {formatNumber(data.pa)} / {formatNumber(data.forecast)} / {hasReal ? formatNumber(data.realizado) : "-"}
                                  </span>
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              {/* Seção FTE (Prioritária no Modo Quantidade) */}
                              <div className="space-y-1">
                                <div className="text-[10px] text-[#22c7ac] font-bold uppercase tracking-wider">
                                  Quantitativo de FTE
                                </div>
                                <div className="flex items-center justify-between text-slate-300">
                                  <span className="flex items-center gap-1.5 text-blue-400 font-semibold">
                                    <span className="w-2 h-2 rounded-full bg-[#1d4ed8]" /> Total PA:
                                  </span>
                                  <span className="font-mono font-bold text-white">{formatNumber(data.pa)} FTEs</span>
                                </div>
                                <div className="flex items-center justify-between text-slate-300">
                                  <span className="flex items-center gap-1.5 text-indigo-400 font-semibold">
                                    <span className="w-2 h-2 rounded-full bg-[#6366f1]" /> Forecast:
                                  </span>
                                  <span className="font-mono font-bold text-white">{formatNumber(data.forecast)} FTEs</span>
                                </div>
                                <div className="flex items-center justify-between text-slate-300">
                                  <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                                    <span className="w-2 h-2 rounded-full bg-[#00CE7C]" /> Realizado:
                                  </span>
                                  <span className="font-mono font-bold text-white">
                                    {hasReal ? `${formatNumber(data.realizado)} FTEs` : "Não realizado"}
                                  </span>
                                </div>
                                {hasReal && (
                                  <div className="pt-1 flex items-center justify-between text-[11px] font-semibold border-t border-slate-800">
                                    <span className="text-slate-400">Desvio FTE (Real - PA):</span>
                                    <span className={`font-mono font-bold ${data.difFTE > 0 ? 'text-red-400' : 'text-[#00CE7C]'}`}>
                                      {data.difFTE > 0 ? `+${data.difFTE}` : data.difFTE} ({formatPercent(data.pctDif)})
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Seção Financeira (Secundária) */}
                              {hasFin && (
                                <div className="pt-2 border-t border-slate-700/60 space-y-1">
                                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                    Valores Financeiros (R$)
                                  </div>
                                  <div className="flex items-center justify-between text-slate-300">
                                    <span className="text-blue-400 font-semibold">PA (R$):</span>
                                    <span className="font-mono font-bold text-white">{formatMoney(data.valPa)}</span>
                                  </div>
                                  <div className="flex items-center justify-between text-slate-300">
                                    <span className="text-emerald-400 font-semibold">Real (R$):</span>
                                    <span className="font-mono font-bold text-white">{formatMoney(data.valReal)}</span>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />

                {/* Barra 1: PA */}
                <Bar
                  dataKey={chartMetric === "valor" ? "valPa" : "pa"}
                  name={chartMetric === "valor" ? "PA (R$)" : "PA"}
                  fill="#1d4ed8"
                  radius={[3, 3, 0, 0]}
                  barSize={chartMonths === 6 ? 24 : 13}
                >
                  <LabelList
                    dataKey={chartMetric === "valor" ? "valPa" : "pa"}
                    position="top"
                    fill="#93c5fd"
                    fontSize={chartMonths === 6 ? 9.5 : 7.5}
                    fontWeight={700}
                    formatter={(v: any) => v > 0 ? (chartMetric === "valor" ? formatMoneyCompact(v) : formatNumber(v)) : ''}
                  />
                  {evolutionChart.map((entry, index) => (
                    <Cell
                      key={`pa-${index}`}
                      fill={entry.competence === selectedCompetence ? "#3b82f6" : "#1d4ed8"}
                    />
                  ))}
                </Bar>

                {/* Barra 2: Forecast */}
                <Bar
                  dataKey={chartMetric === "valor" ? "valForecast" : "forecast"}
                  name={chartMetric === "valor" ? "Forecast (R$)" : "Forecast"}
                  fill="#6366f1"
                  radius={[3, 3, 0, 0]}
                  barSize={chartMonths === 6 ? 24 : 13}
                >
                  <LabelList
                    dataKey={chartMetric === "valor" ? "valForecast" : "forecast"}
                    position="top"
                    fill="#c7d2fe"
                    fontSize={chartMonths === 6 ? 9.5 : 7.5}
                    fontWeight={700}
                    formatter={(v: any) => v > 0 ? (chartMetric === "valor" ? formatMoneyCompact(v) : formatNumber(v)) : ''}
                  />
                  {evolutionChart.map((entry, index) => (
                    <Cell
                      key={`fc-${index}`}
                      fill={entry.competence === selectedCompetence ? "#818cf8" : "#6366f1"}
                    />
                  ))}
                </Bar>

                {/* Barra 3: Realizado */}
                <Bar
                  dataKey={chartMetric === "valor" ? "valReal" : "realizado"}
                  name={chartMetric === "valor" ? "Realizado (R$)" : "Realizado"}
                  fill="#00CE7C"
                  radius={[3, 3, 0, 0]}
                  barSize={chartMonths === 6 ? 24 : 13}
                >
                  <LabelList
                    dataKey={chartMetric === "valor" ? "valReal" : "realizado"}
                    position="top"
                    fill="#6ee7b7"
                    fontSize={chartMonths === 6 ? 9.5 : 7.5}
                    fontWeight={700}
                    formatter={(v: any) => v > 0 ? (chartMetric === "valor" ? formatMoneyCompact(v) : formatNumber(v)) : ''}
                  />
                  {evolutionChart.map((entry, index) => (
                    <Cell
                      key={`real-${index}`}
                      fill={entry.competence === selectedCompetence ? "#22c7ac" : "#00CE7C"}
                      fillOpacity={entry.hasRealizado ? 1 : 0.25}
                    />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Legenda com as Três Barras */}
          <div className="flex flex-wrap items-center justify-center gap-6 pt-3 mt-2 border-t border-slate-800 text-xs text-slate-300 font-medium">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-[#1d4ed8]" />
              <span className="font-semibold text-white">
                {chartMetric === "valor" ? "PA em R$ (Planejamento Aprovado)" : "PA (Planejamento Aprovado)"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-[#6366f1]" />
              <span className="font-semibold text-white">
                {chartMetric === "valor" ? "Forecast em R$ (Baseline Ajustado)" : "Forecast (Baseline Ajustado)"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-[#00CE7C]" />
              <span className="font-semibold text-white">
                {chartMetric === "valor" ? "Realizado em R$ (Valor Efetivo)" : "Realizado (Efetivo Ativo)"}
              </span>
            </div>
            <div className="text-slate-500 text-[11px]">
              <span>• Competência selecionada ({selectedCompetence}) em tom destacado</span>
            </div>
          </div>

          {/* Régua Mensal Consolidada de Números (FTEs e R$) */}
          <div className="mt-4 pt-3 border-t border-slate-800/80 overflow-x-auto">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Acompanhamento Numérico Consolidado por Competência</span>
              <span className="text-slate-500 font-normal">
                Modo ativo: <strong className="text-[#22c7ac]">{chartMetric === 'valor' ? 'Valores em R$' : 'Quantitativo de FTE'}</strong>
              </span>
            </div>
            <table className="w-full text-[11px] text-center border-collapse">
              <thead>
                <tr className="bg-[#0b1222] text-slate-400 font-bold border-b border-slate-800">
                  <th className="py-1.5 px-2 text-left">Métrica</th>
                  {evolutionChart.map((m) => (
                    <th
                      key={m.competence}
                      className={`py-1.5 px-2 ${m.competence === selectedCompetence ? 'text-[#22c7ac] font-black bg-[#22c7ac]/10' : ''}`}
                    >
                      {m.competence}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className={`divide-y font-mono ${isDark ? "divide-slate-800/50 text-slate-300" : "divide-slate-200 text-slate-700"}`}>
                {/* Linhas FTE */}
                <tr className={chartMetric === 'fte' ? (isDark ? 'bg-blue-950/20' : 'bg-blue-50/60') : ''}>
                  <td className="py-1 px-2 text-left font-bold text-blue-400 font-sans">PA (FTE)</td>
                  {evolutionChart.map((m) => (
                    <td key={m.competence} className={`py-1 px-2 ${m.competence === selectedCompetence ? (`font-bold ${isDark ? 'text-white' : 'text-[#041A71]'} bg-[#22c7ac]/10`) : ''}`}>
                      {formatNumber(m.pa)}
                    </td>
                  ))}
                </tr>
                <tr className={chartMetric === 'fte' ? (isDark ? 'bg-indigo-950/20' : 'bg-indigo-50/60') : ''}>
                  <td className="py-1 px-2 text-left font-bold text-indigo-400 font-sans">Forecast (FTE)</td>
                  {evolutionChart.map((m) => (
                    <td key={m.competence} className={`py-1 px-2 ${m.competence === selectedCompetence ? (`font-bold ${isDark ? 'text-white' : 'text-[#041A71]'} bg-[#22c7ac]/10`) : ''}`}>
                      {formatNumber(m.forecast)}
                    </td>
                  ))}
                </tr>
                <tr className={chartMetric === 'fte' ? (isDark ? 'bg-emerald-950/20' : 'bg-emerald-50/60') : ''}>
                  <td className="py-1 px-2 text-left font-bold text-emerald-400 font-sans">Realizado (FTE)</td>
                  {evolutionChart.map((m) => (
                    <td key={m.competence} className={`py-1 px-2 ${m.competence === selectedCompetence ? (`font-bold ${isDark ? 'text-white' : 'text-[#041A71]'} bg-[#22c7ac]/10`) : ''}`}>
                      {m.hasRealizado ? formatNumber(m.realizado) : "-"}
                    </td>
                  ))}
                </tr>
                <tr className={chartMetric === 'fte' ? (isDark ? 'bg-slate-800/30' : 'bg-slate-100/70') : ''}>
                  <td className="py-1 px-2 text-left font-bold text-slate-400 font-sans">Dif. FTE</td>
                  {evolutionChart.map((m) => (
                    <td key={m.competence} className={`py-1 px-2 font-bold ${
                      m.hasRealizado && m.difFTE !== null ? (m.difFTE > 0 ? 'text-red-400' : 'text-[#00CE7C]') : 'text-slate-500'
                    } ${m.competence === selectedCompetence ? 'bg-[#22c7ac]/5' : ''}`}>
                      {m.hasRealizado && m.difFTE !== null ? (m.difFTE > 0 ? `+${m.difFTE}` : m.difFTE) : "-"}
                    </td>
                  ))}
                </tr>

                {/* Linhas Financeiras (R$) */}
                <tr className={`border-t ${isDark ? "border-slate-800" : "border-slate-200"} ${chartMetric === 'valor' ? (isDark ? 'bg-blue-950/30 font-bold' : 'bg-blue-50/70 font-semibold') : ''}`}>
                  <td className="py-1 px-2 text-left font-bold text-blue-300 font-sans">Total PA (R$)</td>
                  {evolutionChart.map((m) => (
                    <td key={m.competence} className={`py-1 px-2 text-[10px] text-slate-300 ${m.competence === selectedCompetence ? (`font-bold ${isDark ? 'text-white' : 'text-[#041A71]'} bg-[#22c7ac]/10`) : ''}`}>
                      {m.valPa > 0 ? formatMoney(m.valPa) : "-"}
                    </td>
                  ))}
                </tr>
                <tr className={chartMetric === 'valor' ? (isDark ? 'bg-indigo-950/30 font-bold' : 'bg-indigo-50/70 font-semibold') : ''}>
                  <td className="py-1 px-2 text-left font-bold text-indigo-300 font-sans">Forecast (R$)</td>
                  {evolutionChart.map((m) => (
                    <td key={m.competence} className={`py-1 px-2 text-[10px] text-slate-300 ${m.competence === selectedCompetence ? (`font-bold ${isDark ? 'text-white' : 'text-[#041A71]'} bg-[#22c7ac]/10`) : ''}`}>
                      {m.valForecast > 0 ? formatMoney(m.valForecast) : "-"}
                    </td>
                  ))}
                </tr>
                <tr className={chartMetric === 'valor' ? (isDark ? 'bg-emerald-950/30 font-bold' : 'bg-emerald-50/70 font-semibold') : ''}>
                  <td className="py-1 px-2 text-left font-bold text-emerald-300 font-sans">Total Real (R$)</td>
                  {evolutionChart.map((m) => (
                    <td key={m.competence} className={`py-1 px-2 text-[10px] text-slate-300 ${m.competence === selectedCompetence ? (`font-bold ${isDark ? 'text-white' : 'text-[#041A71]'} bg-[#22c7ac]/10`) : ''}`}>
                      {m.valReal > 0 ? formatMoney(m.valReal) : "-"}
                    </td>
                  ))}
                </tr>
                <tr className={chartMetric === 'valor' ? (isDark ? 'bg-slate-800/40 font-bold' : 'bg-slate-100/80 font-semibold') : ''}>
                  <td className="py-1 px-2 text-left font-bold text-slate-400 font-sans">Dif. Valor (R$)</td>
                  {evolutionChart.map((m) => (
                    <td key={m.competence} className={`py-1 px-2 text-[10px] font-bold ${
                      m.difValor !== null ? (m.difValor > 0 ? 'text-red-400' : 'text-[#00CE7C]') : 'text-slate-400'
                    } ${m.competence === selectedCompetence ? 'bg-[#22c7ac]/5' : ''}`}>
                      {m.difValor !== null ? (m.difValor > 0 ? `+${formatMoney(m.difValor)}` : formatMoney(m.difValor)) : "-"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 5. Informações Gerenciais Adicionais (Linha Inferior) */}
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">

          {/* 7.1 Contratos acima do PA & Distribuição */}
          <div className={`rounded-xl p-4 border shadow-sm flex flex-col justify-between transition-all ${isDark ? "bg-[#111c33] border-slate-800 text-white shadow-lg" : "bg-white border-slate-200 text-slate-800 shadow-sm"}`}>
            <div>
              <div className={`flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                <span>Contratos Acima do PA</span>
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex items-baseline gap-2 my-1">
                <span className={`text-2xl font-bold font-mono ${isDark ? "text-white" : "text-slate-900"}`}>
                  {complementary.contractsAbovePA?.count || 0}
                </span>
                <span className="text-xs text-slate-400">
                  de {complementary.contractsAbovePA?.totalContracts || 0} contratos
                </span>
                <span className="text-xs font-bold text-amber-400 ml-auto bg-amber-500/10 px-2 py-0.5 rounded">
                  {complementary.contractsAbovePA?.percentage || 0}%
                </span>
              </div>
            </div>

            {/* Barra de Distribuição de Atenção da Carteira */}
            <div className={`mt-3 pt-3 border-t ${isDark ? "border-slate-800/80" : "border-slate-200"}`}>
              <div className="text-[11px] text-slate-400 mb-1.5 flex justify-between font-medium">
                <span>Distribuição da Carteira:</span>
                <span className="text-slate-300">
                  {complementary.contractsBelowPA?.count || 0} abaixo • {complementary.contractsOnLimitPA?.count || 0} no limite
                </span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full flex overflow-hidden">
                <div
                  className="bg-red-500 h-full transition-all"
                  style={{ width: `${complementary.contractsAbovePA?.percentage || 0}%` }}
                  title={`${complementary.contractsAbovePA?.count} contratos acima do PA`}
                />
                <div
                  className="bg-[#3A78DE] h-full transition-all"
                  style={{ width: `${complementary.contractsOnLimitPA?.percentage || 0}%` }}
                  title={`${complementary.contractsOnLimitPA?.count} contratos no limite do PA`}
                />
                <div
                  className="bg-[#00CE7C] h-full transition-all"
                  style={{ width: `${complementary.contractsBelowPA?.percentage || 0}%` }}
                  title={`${complementary.contractsBelowPA?.count} contratos abaixo do PA`}
                />
              </div>
            </div>
          </div>

          {/* 7.2 Excedente de FTE (Positivo vs Déficit) */}
          <div className={`rounded-xl p-4 border shadow-sm flex flex-col justify-between transition-all ${isDark ? "bg-[#111c33] border-slate-800 text-white shadow-lg" : "bg-white border-slate-200 text-slate-800 shadow-sm"}`}>
            <div>
              <div className={`flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                <span>Excedente vs Déficit de FTE</span>
                <Users className="w-4 h-4 text-slate-400" />
              </div>
              <div className="grid grid-cols-2 gap-2 my-1">
                <div className={`rounded-lg p-2 text-center border ${isDark ? "bg-red-950/30 border-red-900/30" : "bg-red-50 border-red-200"}`}>
                  <div className="text-[10px] text-red-400 uppercase font-bold">Excesso Acima</div>
                  <div className="text-lg font-black text-red-400 font-mono">
                    +{formatNumber(complementary.excedenteFTE?.positiveSum || 0)}
                  </div>
                </div>
                <div className={`rounded-lg p-2 text-center border ${isDark ? "bg-emerald-950/30 border-emerald-900/30" : "bg-emerald-50 border-emerald-200"}`}>
                  <div className="text-[10px] text-emerald-400 uppercase font-bold">Déficit Abaixo</div>
                  <div className="text-lg font-black text-[#00CE7C] font-mono">
                    {formatNumber(complementary.excedenteFTE?.deficitSum || 0)}
                  </div>
                </div>
              </div>
            </div>
            <div className={`mt-2 pt-2 border-t ${isDark ? "border-slate-800/80" : "border-slate-200"} flex items-center justify-between text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              <span>Saldo líquido consolidado:</span>
              <span className={`font-mono font-bold ${
                (complementary.excedenteFTE?.netBalance || 0) > 0 ? 'text-red-400' : 'text-[#00CE7C]'
              }`}>
                {(complementary.excedenteFTE?.netBalance || 0) > 0 ? `+${formatNumber(complementary.excedenteFTE?.netBalance)}` : formatNumber(complementary.excedenteFTE?.netBalance)} FTEs
              </span>
            </div>
          </div>

          {/* 7.3 Variação Entre Competências (MoM) */}
          <div className={`rounded-xl p-4 border shadow-sm flex flex-col justify-between transition-all ${isDark ? "bg-[#111c33] border-slate-800 text-white shadow-lg" : "bg-white border-slate-200 text-slate-800 shadow-sm"}`}>
            <div>
              <div className={`flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                <span>Variação Mensal (MoM)</span>
                {complementary.monthlyVariation?.trend === "up" ? (
                  <ArrowUpRight className="w-4 h-4 text-red-400" />
                ) : complementary.monthlyVariation?.trend === "down" ? (
                  <ArrowDownRight className="w-4 h-4 text-[#00CE7C]" />
                ) : null}
              </div>
              <div className="flex items-baseline gap-2 my-1">
                <span className={`text-2xl font-bold font-mono ${
                  (complementary.monthlyVariation?.diff || 0) > 0 ? 'text-red-400' : (complementary.monthlyVariation?.diff || 0) < 0 ? 'text-[#00CE7C]' : 'text-slate-300'
                }`}>
                  {(complementary.monthlyVariation?.diff || 0) > 0 ? `+${formatNumber(complementary.monthlyVariation?.diff)}` : formatNumber(complementary.monthlyVariation?.diff)} FTEs
                </span>
                <span className={`text-xs font-bold font-mono ml-auto px-2 py-0.5 rounded ${
                  (complementary.monthlyVariation?.diff || 0) > 0 ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-[#00CE7C]'
                }`}>
                  {formatPercent(complementary.monthlyVariation?.pct)}
                </span>
              </div>
            </div>
            <div className={`mt-2 pt-2 border-t ${isDark ? "border-slate-800/80" : "border-slate-200"} flex items-center justify-between text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              <span>Comparado ao mês anterior:</span>
              <span className="font-mono text-slate-200 font-medium">
                {formatNumber(complementary.monthlyVariation?.currentReal)} vs {formatNumber(complementary.monthlyVariation?.previousReal)}
              </span>
            </div>
          </div>

          {/* 7.4 Status de Margem para Contratação */}
          <div className={`rounded-xl p-4 border shadow-sm flex flex-col justify-between transition-all ${isDark ? "bg-[#111c33] border-slate-800 text-white shadow-lg" : "bg-white border-slate-200 text-slate-800 shadow-sm"}`}>
            <div>
              <div className={`flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                <span>Margem para Contratação</span>
                <ShieldCheck className="w-4 h-4 text-[#22c7ac]" />
              </div>
              <div className="flex items-baseline gap-2 my-1">
                <span className={`text-2xl font-bold font-mono ${isDark ? "text-white" : "text-slate-900"}`}>
                  {formatNumber(complementary.marginStatus?.capacidadeNovasVagas || 0)}
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  vagas seguras preliminares
                </span>
              </div>
            </div>
            <div className={`mt-2 pt-2 border-t ${isDark ? "border-slate-800/80" : "border-slate-200"} text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"} space-y-1`}>
              <div className="flex justify-between">
                <span>Contratos c/ margem segura:</span>
                <span className="font-semibold text-emerald-400">{complementary.marginStatus?.contratosComMargem || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Contratos requerem análise:</span>
                <span className="font-semibold text-amber-400">{complementary.marginStatus?.contratosRequerAnalise || 0}</span>
              </div>
            </div>
          </div>

        </section>

      </main>

      {/* Modal de Evidência de Governança */}
      <EvidenceModal
        isOpen={evidenceModalData.isOpen}
        onClose={() => setEvidenceModalData({ isOpen: false, evidence: null, itemInfo: null })}
        evidence={evidenceModalData.evidence}
        itemInfo={evidenceModalData.itemInfo}
      />
    </div>
  );
}
