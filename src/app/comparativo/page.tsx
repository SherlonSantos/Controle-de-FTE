"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import MultiSelect from "@/components/MultiSelect";
import EvidenceModal from "@/components/comparativo/EvidenceModal";
import {
  GitCompare,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  FileText,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  FilterX,
  Loader2,
  Sparkles,
  Search,
  Download,
  ShieldCheck,
  Building2,
  MapPin,
  Briefcase,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Calculator,
  SlidersHorizontal,
  HelpCircle,
  RotateCcw
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid
} from "recharts";

export default function ComparativoPage() {
  // Navigation Mode Tab
  const [activeTab, setActiveTab] = useState<"evolucao" | "margem">("evolucao");

  // Filter Options from API
  const [filterOptions, setFilterOptions] = useState<{
    competences: string[];
    activeCompetences?: string[];
    contracts: string[];
    locations: string[];
    costCenters: { id: string; code: string; description: string; contractName: string; location: string }[];
    roles: string[];
    defaultInitial?: string;
    defaultFinal?: string;
  }>({
    competences: [],
    contracts: [],
    locations: [],
    costCenters: [],
    roles: []
  });

  // Selected Filter States
  const [initialCompetence, setInitialCompetence] = useState<string>("");
  const [finalCompetence, setFinalCompetence] = useState<string>("");
  const [scenario, setScenario] = useState<"Realizado" | "PA" | "Forecast">("Realizado");
  const [selectedContracts, setSelectedContracts] = useState<string[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [selectedCostCenters, setSelectedCostCenters] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedMovementTypes, setSelectedMovementTypes] = useState<string[]>([]);

  // Data States for Tab 1: Evolução
  const [kpis, setKpis] = useState<any>({
    totalInitial: 0,
    totalFinal: 0,
    variation: 0,
    pctVariation: 0,
    additions: 0,
    reductions: 0,
    netBalance: 0,
    contractsChangedCount: 0,
    locationsChangedCount: 0,
    rolesChangedCount: 0,
    unjustifiedChangesCount: 0,
    alteredPercentage: 0
  });
  const [evolutionChartData, setEvolutionChartData] = useState<any[]>([]);
  const [contractChartData, setContractChartData] = useState<any[]>([]);
  const [locationTree, setLocationTree] = useState<any[]>([]);
  const [rankings, setRankings] = useState<{
    byContract: { increases: any[]; reductions: any[] };
    byLocation: { increases: any[]; reductions: any[] };
    byRole: { increases: any[]; reductions: any[] };
  }>({
    byContract: { increases: [], reductions: [] },
    byLocation: { increases: [], reductions: [] },
    byRole: { increases: [], reductions: [] }
  });
  const [roleComposition, setRoleComposition] = useState<any[]>([]);
  const [insights, setInsights] = useState<string[]>([]);
  const [detailedItems, setDetailedItems] = useState<any[]>([]);

  // Data States for Tab 2: Análise de Margem para Aprovação de Vagas
  const [marginCards, setMarginCards] = useState<any>({
    totalPA: 0,
    totalForecast: 0,
    totalRealizado: 0,
    margemTotalPA: 0,
    margemTotalForecast: 0,
    margemSeguraTotal: 0,
    capacidadeNovasVagas: 0,
    contratosComMargem: 0,
    contratosRequerAnalise: 0,
    contratosSemMargem: 0,
    contratosAcimaPA: 0,
    contratosAcimaForecast: 0
  });
  const [marginContracts, setMarginContracts] = useState<any[]>([]);
  const [marginDetailed, setMarginDetailed] = useState<any[]>([]);
  const [marginAlerts, setMarginAlerts] = useState<any[]>([]);
  const [marginSortCriteria, setMarginSortCriteria] = useState<string>("maior_margem");
  const [marginStatusFilter, setMarginStatusFilter] = useState<string>("TODOS");

  // Margin Simulator Interactive States
  const [simulatedVagasMap, setSimulatedVagasMap] = useState<Record<string, number>>({});
  const [globalSimVagas, setGlobalSimVagas] = useState<number>(1);
  const [globalSimSelectedId, setGlobalSimSelectedId] = useState<string>("");

  const [isLoading, setIsLoading] = useState<boolean>(true);

  // UI States
  const [rankingTab, setRankingTab] = useState<"contract" | "location" | "role">("contract");
  const [expandedContracts, setExpandedContracts] = useState<Set<string>>(new Set());
  const [expandedLocations, setExpandedLocations] = useState<Set<string>>(new Set());
  const [expandedMarginContracts, setExpandedMarginContracts] = useState<Set<string>>(new Set());
  const [expandedMarginLocations, setExpandedMarginLocations] = useState<Set<string>>(new Set());
  const [tableSearch, setTableSearch] = useState<string>("");
  const [onlyChanges, setOnlyChanges] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 15;

  // Evidence Modal State
  const [modalEvidence, setModalEvidence] = useState<any>(null);
  const [modalItemInfo, setModalItemInfo] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // 1. Fetch initial filters
  useEffect(() => {
    fetch("/api/comparativo/filters")
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) {
          setFilterOptions(data);
          if (data.defaultInitial) setInitialCompetence(data.defaultInitial);
          if (data.defaultFinal) setFinalCompetence(data.defaultFinal);
        }
      })
      .catch(console.error);
  }, []);

  // 2. Fetch Comparative Data (Evolução)
  useEffect(() => {
    if (!initialCompetence || !finalCompetence) return;

    setIsLoading(true);
    fetch("/api/comparativo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        initialCompetence,
        finalCompetence,
        scenario,
        contracts: selectedContracts,
        locations: selectedLocations,
        costCenters: selectedCostCenters,
        roles: selectedRoles,
        movementTypes: selectedMovementTypes
      })
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) {
          setKpis(data.kpis || {});
          setEvolutionChartData(data.evolutionChartData || []);
          setContractChartData(data.contractChartData || []);
          setLocationTree(data.locationTree || []);
          setRankings(data.rankings || { byContract: { increases: [], reductions: [] }, byLocation: { increases: [], reductions: [] }, byRole: { increases: [], reductions: [] } });
          setRoleComposition(data.roleComposition || []);
          setInsights(data.insights || []);
          setDetailedItems(data.detailedItems || []);
          setCurrentPage(1);
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [
    initialCompetence,
    finalCompetence,
    scenario,
    selectedContracts,
    selectedLocations,
    selectedCostCenters,
    selectedRoles,
    selectedMovementTypes
  ]);

  // 3. Fetch Margin Analysis Data
  useEffect(() => {
    const compToAnalyze = finalCompetence || initialCompetence;
    if (!compToAnalyze) return;

    fetch("/api/comparativo/margem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        competence: compToAnalyze,
        contracts: selectedContracts,
        locations: selectedLocations,
        costCenters: selectedCostCenters,
        roles: selectedRoles
      })
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) {
          setMarginCards(data.cards || {});
          setMarginContracts(data.contractSummary || []);
          setMarginDetailed(data.detailedItems || []);
          setMarginAlerts(data.alerts || []);
          if (data.detailedItems?.length > 0 && !globalSimSelectedId) {
            setGlobalSimSelectedId(data.detailedItems[0].id);
          }
        }
      })
      .catch(console.error);
  }, [
    finalCompetence,
    initialCompetence,
    selectedContracts,
    selectedLocations,
    selectedCostCenters,
    selectedRoles
  ]);

  // Clear filters
  const handleClearFilters = () => {
    if (filterOptions.defaultInitial) setInitialCompetence(filterOptions.defaultInitial);
    if (filterOptions.defaultFinal) setFinalCompetence(filterOptions.defaultFinal);
    setSelectedContracts([]);
    setSelectedLocations([]);
    setSelectedCostCenters([]);
    setSelectedRoles([]);
    setSelectedMovementTypes([]);
    setTableSearch("");
    setOnlyChanges(false);
    setSimulatedVagasMap({});
    setMarginSortCriteria("maior_margem");
    setMarginStatusFilter("TODOS");
  };

  // Location Tree toggle helpers (Evolução)
  const toggleContractExpand = (cName: string) => {
    setExpandedContracts((prev) => {
      const next = new Set(prev);
      if (next.has(cName)) next.delete(cName);
      else next.add(cName);
      return next;
    });
  };

  const toggleLocationExpand = (lKey: string) => {
    setExpandedLocations((prev) => {
      const next = new Set(prev);
      if (next.has(lKey)) next.delete(lKey);
      else next.add(lKey);
      return next;
    });
  };

  // Margin Contracts Tree toggle helpers
  const toggleMarginContractExpand = (cName: string) => {
    setExpandedMarginContracts((prev) => {
      const next = new Set(prev);
      if (next.has(cName)) next.delete(cName);
      else next.add(cName);
      return next;
    });
  };

  const toggleMarginLocationExpand = (lKey: string) => {
    setExpandedMarginLocations((prev) => {
      const next = new Set(prev);
      if (next.has(lKey)) next.delete(lKey);
      else next.add(lKey);
      return next;
    });
  };

  // Filtered detailed items for Tab 1 (Evolução)
  const filteredDetailedItems = useMemo(() => {
    let list = detailedItems;
    if (onlyChanges) {
      list = list.filter((i) => i.variation !== 0);
    }
    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase().trim();
      list = list.filter(
        (i) =>
          i.contractName.toLowerCase().includes(q) ||
          i.location.toLowerCase().includes(q) ||
          i.roleTitle.toLowerCase().includes(q) ||
          i.costCenterCode.toLowerCase().includes(q) ||
          i.costCenterDesc.toLowerCase().includes(q) ||
          (i.justification && i.justification.toLowerCase().includes(q))
      );
    }
    return list;
  }, [detailedItems, onlyChanges, tableSearch]);

  const totalPages = Math.ceil(filteredDetailedItems.length / pageSize) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredDetailedItems.slice(start, start + pageSize);
  }, [filteredDetailedItems, currentPage, pageSize]);

  // Processed Detailed Items for Tab 2 (Margem + Simulação)
  const processedMarginItems = useMemo(() => {
    let list = marginDetailed.map((item) => {
      const vagasSolicitadas = simulatedVagasMap[item.id] || 0;
      const realProjetado = item.realizado + vagasSolicitadas;
      const margemPAProjetada = item.pa - realProjetado;
      const margemFCProjetada = item.forecast - realProjetado;
      const margemSeguraProjetada = Math.min(margemPAProjetada, margemFCProjetada);

      let statusProjetado: "APROVADO" | "REQUER ANÁLISE" | "SEM MARGEM";
      let msgProjetada = "";

      if (vagasSolicitadas === 0) {
        statusProjetado = item.statusConsolidado;
        msgProjetada = item.motivoAnalise;
      } else {
        if (realProjetado <= item.pa && realProjetado <= item.forecast) {
          statusProjetado = "APROVADO";
          msgProjetada = `Após aprovação das ${vagasSolicitadas} vaga(s), o quadro permanecerá dentro do PA e Forecast.`;
        } else if (realProjetado > item.pa && realProjetado > item.forecast) {
          statusProjetado = "SEM MARGEM";
          msgProjetada = `A aprovação de ${vagasSolicitadas} vaga(s) ultrapassa tanto o PA quanto o Forecast.`;
        } else {
          statusProjetado = "REQUER ANÁLISE";
          if (realProjetado <= item.pa) {
            msgProjetada = `A aprovação mantém o quadro dentro do PA, porém ultrapassa o Forecast em ${Math.abs(margemFCProjetada)} FTE(s).`;
          } else {
            msgProjetada = `A aprovação mantém o quadro dentro do Forecast, porém ultrapassa o PA em ${Math.abs(margemPAProjetada)} FTE(s).`;
          }
        }
      }

      return {
        ...item,
        vagasSolicitadas,
        realProjetado,
        margemPAProjetada,
        margemFCProjetada,
        margemSeguraProjetada,
        statusProjetado,
        msgProjetada
      };
    });

    // Filter by Status
    if (marginStatusFilter !== "TODOS") {
      list = list.filter((i) => i.statusProjetado === marginStatusFilter);
    }

    // Text search
    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase().trim();
      list = list.filter(
        (i) =>
          i.contractName.toLowerCase().includes(q) ||
          i.location.toLowerCase().includes(q) ||
          i.roleTitle.toLowerCase().includes(q) ||
          i.costCenterCode.toLowerCase().includes(q)
      );
    }

    // Sort criteria
    list.sort((a, b) => {
      switch (marginSortCriteria) {
        case "maior_margem":
          return b.margemSeguraProjetada - a.margemSeguraProjetada;
        case "menor_margem":
          return a.margemSeguraProjetada - b.margemSeguraProjetada;
        case "sem_margem":
          return (a.statusProjetado === "SEM MARGEM" ? 0 : 1) - (b.statusProjetado === "SEM MARGEM" ? 0 : 1);
        case "acima_pa":
          return a.margemPAProjetada - b.margemPAProjetada;
        case "acima_fc":
          return a.margemFCProjetada - b.margemFCProjetada;
        default:
          return b.margemSegura - a.margemSegura;
      }
    });

    return list;
  }, [marginDetailed, simulatedVagasMap, marginStatusFilter, tableSearch, marginSortCriteria]);

  const totalPagesMargin = Math.ceil(processedMarginItems.length / pageSize) || 1;
  const paginatedMarginItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return processedMarginItems.slice(start, start + pageSize);
  }, [processedMarginItems, currentPage, pageSize]);

  // Selected item for the Global Quick Simulator
  const globalSimItem = useMemo(() => {
    return marginDetailed.find((i) => i.id === globalSimSelectedId) || (marginDetailed[0] || null);
  }, [marginDetailed, globalSimSelectedId]);

  const globalSimResult = useMemo(() => {
    if (!globalSimItem) return null;
    const realProjetado = globalSimItem.realizado + globalSimVagas;
    const margemPA = globalSimItem.pa - realProjetado;
    const margemFC = globalSimItem.forecast - realProjetado;
    const margemSegura = Math.min(margemPA, margemFC);

    let status: "APROVADO" | "REQUER ANÁLISE" | "SEM MARGEM";
    let msg = "";

    if (realProjetado <= globalSimItem.pa && realProjetado <= globalSimItem.forecast) {
      status = "APROVADO";
      msg = `Após a aprovação das ${globalSimVagas} vaga(s), o quadro permanecerá dentro dos limites de PA e Forecast.`;
    } else if (realProjetado > globalSimItem.pa && realProjetado > globalSimItem.forecast) {
      status = "SEM MARGEM";
      msg = `A aprovação das ${globalSimVagas} vaga(s) ultrapassaria tanto o PA quanto o Forecast/Baseline.`;
    } else {
      status = "REQUER ANÁLISE";
      if (realProjetado <= globalSimItem.pa) {
        msg = `A aprovação mantém o quadro dentro do PA, porém ultrapassa o Forecast em ${Math.abs(margemFC)} FTE(s).`;
      } else {
        msg = `A aprovação mantém o quadro dentro do Forecast, porém ultrapassa o PA em ${Math.abs(margemPA)} FTE(s).`;
      }
    }

    return {
      realProjetado,
      margemPA,
      margemFC,
      margemSegura: Math.max(0, margemSegura),
      status,
      msg,
      statusPA: realProjetado < globalSimItem.pa ? "Dentro do limite" : realProjetado === globalSimItem.pa ? "No limite" : "Acima do limite",
      statusFC: realProjetado < globalSimItem.forecast ? "Dentro do limite" : realProjetado === globalSimItem.forecast ? "No limite" : "Acima do limite"
    };
  }, [globalSimItem, globalSimVagas]);

  // Export to CSV (Evolução)
  const handleExportCSV = () => {
    if (filteredDetailedItems.length === 0) return;
    const headers = [
      "Competência Inicial", "Competência Final", "Contrato", "Localidade",
      "Centro de Custo", "Descrição CC", "Cargo", "Quantidade Inicial",
      "Quantidade Final", "Variação FTE", "Variação %", "Tipo Movimentação",
      "Justificativa", "Responsável", "Data Alteração", "Status Governança"
    ];

    const rows = filteredDetailedItems.map((i) => [
      i.initialCompetence, i.finalCompetence, `"${i.contractName}"`, `"${i.location}"`,
      `"${i.costCenterCode}"`, `"${i.costCenterDesc}"`, `"${i.roleTitle}"`,
      i.qtyInitial, i.qtyFinal, i.variation, `${i.pctVariation.toFixed(1)}%`,
      `"${i.movementType}"`, `"${(i.justification || "").replace(/"/g, '""')}"`,
      `"${i.responsible || ""}"`, i.changeDate ? new Date(i.changeDate).toLocaleDateString("pt-BR") : "",
      `"${i.governanceStatus}"`
    ]);

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Comparativo_FTE_${initialCompetence}_vs_${finalCompetence}.csv`;
    link.click();
  };

  // Export to CSV (Margem)
  const handleExportMarginCSV = () => {
    if (processedMarginItems.length === 0) return;
    const headers = [
      "Competência", "Contrato", "Localidade", "Centro de Custo", "Cargo",
      "FTE PA", "FTE Forecast", "FTE Realizado", "Margem PA", "Margem Forecast",
      "Margem Segura", "Vagas Solicitadas", "Realizado Projetado", "Margem PA Projetada",
      "Margem Forecast Projetada", "Limitante", "Status PA", "Status Forecast",
      "Status Consolidado", "Status Projetado", "Justificativa Governança"
    ];

    const rows = processedMarginItems.map((i) => [
      i.competence, `"${i.contractName}"`, `"${i.location}"`, `"${i.costCenterCode}"`,
      `"${i.roleTitle}"`, i.pa, i.forecast, i.realizado, i.margemPA, i.margemForecast,
      i.margemSegura, i.vagasSolicitadas, i.realProjetado, i.margemPAProjetada,
      i.margemFCProjetada, `"${i.limitante}"`, `"${i.statusPA}"`, `"${i.statusForecast}"`,
      `"${i.statusConsolidado}"`, `"${i.statusProjetado}"`,
      `"${(i.justification || "").replace(/"/g, '""')}"`
    ]);

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Analise_Margem_FTE_${finalCompetence || initialCompetence}.csv`;
    link.click();
  };

  const openEvidence = (item: any) => {
    if (!item.evidence) return;
    setModalEvidence(item.evidence);
    setModalItemInfo({
      contractName: item.contractName,
      roleTitle: item.roleTitle,
      competence: item.finalCompetence || item.competence,
      variation: item.variation,
      justification: item.justification,
      responsible: item.responsible
    });
    setIsModalOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "APROVADO":
        return "bg-emerald-100 text-emerald-800 border-emerald-300 font-bold";
      case "REQUER ANÁLISE":
        return "bg-amber-100 text-amber-800 border-amber-300 font-bold";
      case "SEM MARGEM":
        return "bg-red-100 text-red-800 border-red-300 font-bold";
      default:
        return "bg-slate-100 text-slate-700 border-slate-300 font-semibold";
    }
  };

  const getLimitanteBadge = (lim: string) => {
    switch (lim) {
      case "PA":
        return "text-[#041A71] bg-blue-50 border-blue-200";
      case "Forecast":
        return "text-[#1da891] bg-teal-50 border-teal-200";
      case "Ambos":
        return "text-red-700 bg-red-50 border-red-200 font-bold";
      default:
        return "text-slate-500 bg-slate-100 border-slate-200";
    }
  };

  return (
    <main className="flex-1 flex flex-col h-screen bg-slate-50 overflow-hidden font-sans text-slate-900">
      {/* 1. Header & Filters (Fixed Top) */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 md:px-8 md:py-4 flex-shrink-0 z-20 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#041A71] text-white rounded-xl shadow-sm">
              <GitCompare className="w-6 h-6 text-[#22c7ac]" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-[#041A71] tracking-tight">
                Comparativo de FTEs
              </h1>
              <p className="text-xs text-slate-500">
                Análise analítica de evolução e margem executiva para aprovação de vagas
              </p>
            </div>
          </div>

          {/* Master View Switcher Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-xl border border-slate-200 shadow-inner">
            <button
              onClick={() => setActiveTab("evolucao")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === "evolucao"
                  ? "bg-[#041A71] text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
              }`}
            >
              <TrendingUp className="w-4 h-4 text-[#22c7ac]" />
              Evolução &amp; Comparativo
            </button>
            <button
              onClick={() => setActiveTab("margem")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all relative ${
                activeTab === "margem"
                  ? "bg-[#041A71] text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
              }`}
            >
              <CheckCircle2 className="w-4 h-4 text-[#22c7ac]" />
              Análise de Margem para Vagas
              <span className="ml-1 px-1.5 py-0.2 bg-[#22c7ac] text-[#041A71] text-[9px] font-black rounded-full uppercase">
                Novo
              </span>
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="flex flex-col xl:flex-row gap-3 items-start xl:items-end justify-between">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-3 flex-1 w-full">
            {/* Competência Inicial (only for Evolução) */}
            {activeTab === "evolucao" && (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#041A71] uppercase tracking-wider">
                  Comp. Inicial
                </label>
                <select
                  value={initialCompetence}
                  onChange={(e) => setInitialCompetence(e.target.value)}
                  className="h-[38px] px-3 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#22c7ac] shadow-sm"
                >
                  {filterOptions.competences.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Competência Final / Competência de Análise */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-[#041A71] uppercase tracking-wider">
                {activeTab === "evolucao" ? "Comp. Final" : "Competência"}
              </label>
              <select
                value={finalCompetence}
                onChange={(e) => setFinalCompetence(e.target.value)}
                className="h-[38px] px-3 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#22c7ac] shadow-sm"
              >
                {filterOptions.competences.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Contrato */}
            <MultiSelect
              label="Contrato"
              placeholder="Todos"
              options={filterOptions.contracts.map((c) => ({ label: c, value: c }))}
              selected={selectedContracts}
              onChange={setSelectedContracts}
            />

            {/* Localidade */}
            <MultiSelect
              label="Localidade"
              placeholder="Todas"
              options={filterOptions.locations.map((l) => ({ label: l, value: l }))}
              selected={selectedLocations}
              onChange={setSelectedLocations}
            />

            {/* Centro de Custo */}
            <MultiSelect
              label="Centro de Custo"
              placeholder="Todos"
              options={filterOptions.costCenters
                .filter((cc) => selectedContracts.length === 0 || selectedContracts.includes(cc.contractName))
                .map((cc) => ({ label: `${cc.code} - ${cc.description}`, value: cc.id }))}
              selected={selectedCostCenters}
              onChange={setSelectedCostCenters}
            />

            {/* Cargo */}
            <MultiSelect
              label="Cargo"
              placeholder="Todos"
              options={filterOptions.roles.map((r) => ({ label: r, value: r }))}
              selected={selectedRoles}
              onChange={setSelectedRoles}
            />

            {/* Cenário ou Tipo de Movimentação (Evolução) */}
            {activeTab === "evolucao" ? (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-[#041A71] uppercase tracking-wider">
                    Cenário
                  </label>
                  <select
                    value={scenario}
                    onChange={(e: any) => setScenario(e.target.value)}
                    className="h-[38px] px-3 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#22c7ac] shadow-sm"
                  >
                    <option value="Realizado">Realizado (Efetivo)</option>
                    <option value="PA">PA (Planejado)</option>
                    <option value="Forecast">Forecast (Ajustado)</option>
                  </select>
                </div>

                <MultiSelect
                  label="Movimentação"
                  placeholder="Todas"
                  options={[
                    { label: "Acréscimo", value: "Acréscimo" },
                    { label: "Redução", value: "Redução" },
                    { label: "Inclusão de cargo", value: "Inclusão de cargo" },
                    { label: "Exclusão de cargo", value: "Exclusão de cargo" },
                    { label: "Sem alteração", value: "Sem alteração" }
                  ]}
                  selected={selectedMovementTypes}
                  onChange={setSelectedMovementTypes}
                />
              </>
            ) : (
              /* Status Filter for Margin Analysis */
              <div className="flex flex-col gap-1 col-span-2">
                <label className="text-[11px] font-bold text-[#041A71] uppercase tracking-wider">
                  Status de Aprovação
                </label>
                <select
                  value={marginStatusFilter}
                  onChange={(e) => setMarginStatusFilter(e.target.value)}
                  className="h-[38px] px-3 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#22c7ac] shadow-sm"
                >
                  <option value="TODOS">Todos os Status</option>
                  <option value="APROVADO">Aprovados (Com Margem Dupla)</option>
                  <option value="REQUER ANÁLISE">Requer Análise (Margem Parcial)</option>
                  <option value="SEM MARGEM">Sem Margem (Acima/Limite)</option>
                </select>
              </div>
            )}

            {/* Clear Filters Button */}
            <div className="flex items-end">
              <button
                onClick={handleClearFilters}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors shadow-sm h-[38px]"
                title="Limpar todos os filtros"
              >
                <FilterX className="w-3.5 h-3.5 text-slate-500" />
                Limpar
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Scrollable Body */}
      <div className="flex-1 overflow-auto p-4 md:p-8 flex flex-col gap-6 md:gap-8">
        {/* Loading Indicator */}
        {isLoading && (
          <div className="bg-[#041A71]/5 border border-[#041A71]/10 rounded-xl p-3 flex items-center justify-center gap-2 text-xs font-semibold text-[#041A71] animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin text-[#22c7ac]" />
            Carregando e processando bases integradas...
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 1: EVOLUÇÃO & COMPARATIVO ENTRE COMPETÊNCIAS                          */}
        {/* ========================================================================= */}
        {activeTab === "evolucao" && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12 gap-3 flex-shrink-0">
              <div className="col-span-2 bg-white rounded-xl p-4 shadow-sm border border-slate-200 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  FTE {initialCompetence}
                </span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-3xl font-light text-slate-800">{kpis.totalInitial}</span>
                  <span className="text-xs text-slate-400 font-medium">Inicial</span>
                </div>
              </div>

              <div className="col-span-2 bg-white rounded-xl p-4 shadow-sm border border-slate-200 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  FTE {finalCompetence}
                </span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-3xl font-light text-slate-800">{kpis.totalFinal}</span>
                  <span className="text-xs text-slate-400 font-medium">Final</span>
                </div>
              </div>

              <div className="col-span-2 bg-white rounded-xl p-4 shadow-sm border border-slate-200 flex flex-col justify-between relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Variação de FTE
                  </span>
                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                    kpis.variation > 0 ? "bg-emerald-50 text-emerald-700" : kpis.variation < 0 ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"
                  }`}>
                    {kpis.pctVariation > 0 ? "+" : ""}{kpis.pctVariation.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className={`text-3xl font-black ${
                    kpis.variation > 0 ? "text-[#22c7ac]" : kpis.variation < 0 ? "text-red-500" : "text-slate-700"
                  }`}>
                    {kpis.variation > 0 ? `+${kpis.variation}` : kpis.variation}
                  </span>
                  {kpis.variation > 0 ? <ArrowUpRight className="w-6 h-6 text-[#22c7ac]" /> : kpis.variation < 0 ? <ArrowDownRight className="w-6 h-6 text-red-500" /> : <Minus className="w-5 h-5 text-slate-400" />}
                </div>
              </div>

              <div className="col-span-2 bg-white rounded-xl p-4 shadow-sm border border-slate-200 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Acréscimos</span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-3xl font-bold text-emerald-600">+{kpis.additions}</span>
                  <span className="text-xs text-emerald-600/80 font-medium">Entradas</span>
                </div>
              </div>

              <div className="col-span-2 bg-white rounded-xl p-4 shadow-sm border border-slate-200 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Reduções</span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-3xl font-bold text-red-500">-{kpis.reductions}</span>
                  <span className="text-xs text-red-500/80 font-medium">Saídas</span>
                </div>
              </div>

              <div className="col-span-2 bg-white rounded-xl p-4 shadow-sm border border-slate-200 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Saldo Líquido</span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className={`text-3xl font-black ${
                    kpis.netBalance > 0 ? "text-[#22c7ac]" : kpis.netBalance < 0 ? "text-red-500" : "text-slate-700"
                  }`}>
                    {kpis.netBalance > 0 ? `+${kpis.netBalance}` : kpis.netBalance}
                  </span>
                  <span className="text-xs text-slate-400 font-medium">Acrésc. - Reduç.</span>
                </div>
              </div>

              <div className="col-span-3 bg-white rounded-xl p-4 shadow-sm border border-slate-200 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-[#041A71]" />
                  Contratos Alterados
                </span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-bold text-[#041A71]">{kpis.contractsChangedCount}</span>
                  <span className="text-xs text-slate-400">de {filterOptions.contracts.length} contratos</span>
                </div>
              </div>

              <div className="col-span-3 bg-white rounded-xl p-4 shadow-sm border border-slate-200 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-[#041A71]" />
                  Localidades Alteradas
                </span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-bold text-[#041A71]">{kpis.locationsChangedCount}</span>
                  <span className="text-xs text-slate-400">de {filterOptions.locations.length} locais</span>
                </div>
              </div>

              <div className="col-span-2 bg-white rounded-xl p-4 shadow-sm border border-slate-200 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Briefcase className="w-3.5 h-3.5 text-[#041A71]" />
                  Cargos Alterados
                </span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-bold text-[#041A71]">{kpis.rolesChangedCount}</span>
                  <span className="text-xs text-slate-400">cargos distintos</span>
                </div>
              </div>

              <div className="col-span-2 bg-white rounded-xl p-4 shadow-sm border border-slate-200 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-[#041A71]" />
                  % Quadro Alterado
                </span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-mono font-bold text-[#041A71]">
                    {kpis.alteredPercentage.toFixed(1)}%
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">Estabilidade</span>
                </div>
              </div>

              <div className="col-span-2 bg-amber-50/80 border border-amber-300 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  Sem Justificativa
                </span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-bold text-amber-900">{kpis.unjustifiedChangesCount}</span>
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-200/60 px-2 py-0.5 rounded-full">
                    Governança pendente
                  </span>
                </div>
              </div>
            </div>

            {/* Insights Automáticos */}
            {insights.length > 0 && (
              <div className="bg-gradient-to-r from-[#041A71]/5 via-[#22c7ac]/10 to-transparent rounded-2xl p-5 border border-[#041A71]/15 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 bg-[#041A71] text-[#22c7ac] rounded-lg">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-[#041A71] uppercase tracking-wide">
                    Principais Movimentações do Período
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {insights.map((insight, idx) => (
                    <div
                      key={idx}
                      className="bg-white/90 backdrop-blur-sm p-3 rounded-xl border border-slate-200 shadow-xs flex items-start gap-2.5 text-xs text-slate-700"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-[#22c7ac] mt-1.5 shrink-0" />
                      <span className="leading-relaxed">{insight}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Gráfico Principal de Evolução */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <h2 className="text-base md:text-lg font-bold text-[#041A71]">
                    Evolução Histórica do Quadro de FTEs
                  </h2>
                  <p className="text-xs text-slate-500">
                    Quantidade total de FTEs (barras) e percentual de variação em relação ao mês anterior (linha)
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs font-semibold text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-[#041A71]" />
                    Total de FTEs
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-1 bg-[#22c7ac] rounded-full" />
                    % Variação Mês Anterior
                  </div>
                </div>
              </div>

              <div className="w-full h-80 pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={evolutionChartData} margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="competence" stroke="#64748b" fontSize={12} tickLine={false} />
                    <YAxis yAxisId="left" stroke="#64748b" fontSize={12} tickLine={false} />
                    <YAxis yAxisId="right" orientation="right" unit="%" stroke="#22c7ac" fontSize={12} tickLine={false} domain={["auto", "auto"]} />
                    <RechartsTooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-[#111c33] text-white p-4 rounded-xl shadow-xl text-xs space-y-2 border border-white/10 max-w-xs">
                              <div className="font-bold text-sm text-[#22c7ac] border-b border-white/10 pb-1">
                                Competência: {label}
                              </div>
                              <div className="space-y-1 text-slate-200">
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">Total FTEs:</span>
                                  <span className="font-bold text-white">{data.totalFte}</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">Variação % vs anterior:</span>
                                  <span className={data.pctVariation > 0 ? "text-emerald-400 font-bold" : data.pctVariation < 0 ? "text-red-400 font-bold" : "text-slate-300"}>
                                    {data.pctVariation !== null ? `${data.pctVariation > 0 ? "+" : ""}${data.pctVariation}%` : "Início"}
                                  </span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">Acréscimos:</span>
                                  <span className="text-emerald-400 font-medium">+{data.additions}</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">Reduções:</span>
                                  <span className="text-red-400 font-medium">-{data.reductions}</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">Saldo Líquido:</span>
                                  <span className="font-bold text-white">{data.netBalance > 0 ? `+${data.netBalance}` : data.netBalance}</span>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar yAxisId="left" dataKey="totalFte" fill="#041A71" radius={[6, 6, 0, 0]} maxBarSize={48} />
                    <Line yAxisId="right" type="monotone" dataKey="pctVariation" stroke="#22c7ac" strokeWidth={3} dot={{ fill: "#22c7ac", r: 4 }} activeDot={{ r: 6 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Comparativo por Contrato & Rankings */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Contrato Horizontal */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="text-base font-bold text-[#041A71] flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-[#22c7ac]" />
                      Comparativo por Contrato
                    </h3>
                    <span className="text-xs font-semibold text-slate-400">
                      {initialCompetence} vs {finalCompetence}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mb-4">
                    Variação absoluta de FTE por contrato no período selecionado
                  </p>
                </div>

                <div className="w-full h-80 overflow-y-auto pr-2 space-y-3">
                  {contractChartData.map((c) => {
                    const isPos = c.variation > 0;
                    const isNeg = c.variation < 0;
                    const maxAbs = Math.max(...contractChartData.map((x) => Math.abs(x.variation))) || 1;
                    const widthPct = Math.min(100, Math.round((Math.abs(c.variation) / maxAbs) * 100));

                    return (
                      <div key={c.contract} className="group relative bg-slate-50 hover:bg-slate-100 p-3 rounded-xl border border-slate-200 transition-colors">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-bold text-slate-800 truncate max-w-[220px]" title={c.contract}>
                            {c.contract}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400 font-mono text-[11px]">
                              {c.qtyInitial} → {c.qtyFinal}
                            </span>
                            <span className={`font-mono font-black px-2 py-0.5 rounded text-xs ${
                              isPos ? "bg-emerald-50 text-[#22c7ac]" : isNeg ? "bg-red-50 text-red-600" : "bg-slate-200 text-slate-600"
                            }`}>
                              {isPos ? `+${c.variation}` : c.variation} ({c.pctVariation > 0 ? "+" : ""}{c.pctVariation}%)
                            </span>
                          </div>
                        </div>

                        <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden flex">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isPos ? "bg-[#22c7ac]" : isNeg ? "bg-red-500" : "bg-slate-400"
                            }`}
                            style={{ width: `${Math.max(5, widthPct)}%` }}
                          />
                        </div>

                        <div className="hidden group-hover:block absolute left-4 right-4 bottom-full mb-2 bg-[#111c33] text-white p-3 rounded-xl shadow-2xl z-30 text-xs border border-white/10 pointer-events-none">
                          <div className="font-bold text-[#22c7ac] mb-1">{c.contract}</div>
                          <div className="grid grid-cols-2 gap-2 text-slate-300 text-[11px]">
                            <div>FTE Inicial: <b className="text-white">{c.qtyInitial}</b></div>
                            <div>FTE Final: <b className="text-white">{c.qtyFinal}</b></div>
                            <div>Principal cargo: <span className="text-white font-medium">{c.topRole}</span></div>
                            <div>Principal local: <span className="text-white font-medium">{c.topLocation}</span></div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Rankings */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <h3 className="text-base font-bold text-[#041A71] flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-[#22c7ac]" />
                      Ranking de Maiores Movimentações
                    </h3>
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
                      {(["contract", "location", "role"] as const).map((tab) => (
                        <button
                          key={tab}
                          onClick={() => setRankingTab(tab)}
                          className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                            rankingTab === tab ? "bg-white text-[#041A71] shadow-xs" : "text-slate-500 hover:text-slate-900"
                          }`}
                        >
                          {tab === "contract" ? "Contrato" : tab === "location" ? "Localidade" : "Cargo"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mb-4">
                    Maiores variações positivas e negativas por {rankingTab === "contract" ? "contrato" : rankingTab === "location" ? "localidade" : "cargo"}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 h-80 overflow-y-auto">
                  <div className="bg-emerald-50/40 p-4 rounded-xl border border-emerald-100 flex flex-col">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 mb-3 uppercase tracking-wider">
                      <ArrowUpRight className="w-4 h-4 text-[#22c7ac]" />
                      Maiores Aumentos
                    </div>
                    <div className="space-y-2 overflow-y-auto flex-1">
                      {(rankingTab === "contract" ? rankings.byContract.increases : rankingTab === "location" ? rankings.byLocation.increases : rankings.byRole.increases).map((item: any, idx: number) => (
                        <div key={idx} className="bg-white p-2.5 rounded-lg border border-emerald-100 shadow-xs flex items-center justify-between text-xs">
                          <div className="truncate max-w-[150px]" title={item.name}>
                            <span className="font-bold text-slate-800">{idx + 1}. {item.name}</span>
                            <div className="text-[10px] text-slate-400 font-mono">{item.qtyInitial} → {item.qtyFinal}</div>
                          </div>
                          <span className="font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                            +{item.delta}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-red-50/40 p-4 rounded-xl border border-red-100 flex flex-col">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-red-800 mb-3 uppercase tracking-wider">
                      <ArrowDownRight className="w-4 h-4 text-red-500" />
                      Maiores Reduções
                    </div>
                    <div className="space-y-2 overflow-y-auto flex-1">
                      {(rankingTab === "contract" ? rankings.byContract.reductions : rankingTab === "location" ? rankings.byLocation.reductions : rankings.byRole.reductions).map((item: any, idx: number) => (
                        <div key={idx} className="bg-white p-2.5 rounded-lg border border-red-100 shadow-xs flex items-center justify-between text-xs">
                          <div className="truncate max-w-[150px]" title={item.name}>
                            <span className="font-bold text-slate-800">{idx + 1}. {item.name}</span>
                            <div className="text-[10px] text-slate-400 font-mono">{item.qtyInitial} → {item.qtyFinal}</div>
                          </div>
                          <span className="font-mono font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">
                            {item.delta}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Drill-Down por Localidade */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h3 className="text-base md:text-lg font-bold text-[#041A71] flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-[#22c7ac]" />
                    Comparativo Hierárquico por Localidade (Drill-down)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Contrato → Localidade → Cargo para identificar onde ocorreram as alterações
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const allC = new Set(locationTree.map((c) => c.name));
                      const allL = new Set<string>();
                      locationTree.forEach((c) => {
                        c.locations?.forEach((l: any) => allL.add(`${c.name}__${l.name}`));
                      });
                      setExpandedContracts(allC);
                      setExpandedLocations(allL);
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                  >
                    Expandir Todos
                  </button>
                  <button
                    onClick={() => {
                      setExpandedContracts(new Set());
                      setExpandedLocations(new Set());
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                  >
                    Recolher Todos
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#111c33] text-white uppercase text-[11px] font-bold tracking-wider">
                    <tr>
                      <th className="px-5 py-3.5">Estrutura (Contrato &gt; Localidade &gt; Cargo)</th>
                      <th className="px-5 py-3.5 text-right">Inicial</th>
                      <th className="px-5 py-3.5 text-right">Final</th>
                      <th className="px-5 py-3.5 text-right">Variação Absoluta</th>
                      <th className="px-5 py-3.5 text-right">Variação %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {locationTree.map((c) => {
                      const isCExpanded = expandedContracts.has(c.name);
                      const isCPos = c.variation > 0;
                      const isCNeg = c.variation < 0;

                      return (
                        <React.Fragment key={c.name}>
                          <tr
                            onClick={() => toggleContractExpand(c.name)}
                            className="bg-slate-100/90 hover:bg-slate-200/80 cursor-pointer font-bold transition-colors"
                          >
                            <td className="px-5 py-3 flex items-center gap-2 text-slate-900">
                              {isCExpanded ? <ChevronDown className="w-4 h-4 text-[#041A71] shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                              <Building2 className="w-4 h-4 text-[#041A71] shrink-0" />
                              <span className="text-sm">{c.name}</span>
                              <span className="text-[10px] text-slate-500 font-normal ml-2">({c.locations?.length || 0} localidades)</span>
                            </td>
                            <td className="px-5 py-3 text-right font-mono text-sm">{c.qtyInitial}</td>
                            <td className="px-5 py-3 text-right font-mono text-sm">{c.qtyFinal}</td>
                            <td className="px-5 py-3 text-right font-mono text-sm">
                              <span className={isCPos ? "text-[#22c7ac]" : isCNeg ? "text-red-600" : "text-slate-500"}>
                                {isCPos ? `+${c.variation}` : c.variation}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right font-mono text-xs text-slate-500">{c.pctVariation > 0 ? "+" : ""}{c.pctVariation}%</td>
                          </tr>

                          {isCExpanded &&
                            c.locations?.map((loc: any) => {
                              const lKey = `${c.name}__${loc.name}`;
                              const isLExpanded = expandedLocations.has(lKey);
                              const isLPos = loc.variation > 0;
                              const isLNeg = loc.variation < 0;

                              return (
                                <React.Fragment key={lKey}>
                                  <tr
                                    onClick={() => toggleLocationExpand(lKey)}
                                    className="bg-slate-50 hover:bg-slate-100/90 cursor-pointer transition-colors"
                                  >
                                    <td className="px-5 py-2.5 pl-10 flex items-center gap-2 text-slate-800">
                                      {isLExpanded ? <ChevronDown className="w-3.5 h-3.5 text-[#22c7ac] shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                                      <MapPin className="w-3.5 h-3.5 text-[#22c7ac] shrink-0" />
                                      <span className="font-semibold text-xs">{loc.name}</span>
                                    </td>
                                    <td className="px-5 py-2.5 text-right font-mono text-xs">{loc.qtyInitial}</td>
                                    <td className="px-5 py-2.5 text-right font-mono text-xs">{loc.qtyFinal}</td>
                                    <td className="px-5 py-2.5 text-right font-mono text-xs">
                                      <span className={isLPos ? "text-emerald-600 font-bold" : isLNeg ? "text-red-600 font-bold" : "text-slate-500"}>
                                        {isLPos ? `+${loc.variation}` : loc.variation}
                                      </span>
                                    </td>
                                    <td className="px-5 py-2.5 text-right font-mono text-xs text-slate-500">{loc.pctVariation > 0 ? "+" : ""}{loc.pctVariation}%</td>
                                  </tr>

                                  {isLExpanded &&
                                    loc.roles?.map((role: any, rIdx: number) => (
                                      <tr key={rIdx} className="hover:bg-white transition-colors">
                                        <td className="px-5 py-2 pl-16 text-slate-600 flex items-center gap-2">
                                          <Briefcase className="w-3 h-3 text-slate-400 shrink-0" />
                                          <span>{role.name}</span>
                                        </td>
                                        <td className="px-5 py-2 text-right font-mono text-xs">{role.qtyInitial}</td>
                                        <td className="px-5 py-2 text-right font-mono text-xs">{role.qtyFinal}</td>
                                        <td className="px-5 py-2 text-right font-mono text-xs">
                                          <span className={role.variation > 0 ? "text-emerald-600 font-bold" : role.variation < 0 ? "text-red-600 font-bold" : "text-slate-400"}>
                                            {role.variation > 0 ? `+${role.variation}` : role.variation}
                                          </span>
                                        </td>
                                        <td className="px-5 py-2 text-right font-mono text-xs text-slate-400">{role.pctVariation > 0 ? "+" : ""}{role.pctVariation}%</td>
                                      </tr>
                                    ))}
                                </React.Fragment>
                              );
                            })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tabela Detalhada das Alterações */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col gap-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h3 className="text-base md:text-lg font-bold text-[#041A71] flex items-center gap-2">
                    <FileText className="w-5 h-5 text-[#22c7ac]" />
                    Detalhamento das Alterações de FTE
                  </h3>
                  <p className="text-xs text-slate-500">
                    Rastreabilidade completa com justificativas, evidências e status de Governança
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar na tabela..."
                      value={tableSearch}
                      onChange={(e) => {
                        setTableSearch(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#22c7ac]"
                    />
                  </div>

                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                    <input
                      type="checkbox"
                      checked={onlyChanges}
                      onChange={(e) => {
                        setOnlyChanges(e.target.checked);
                        setCurrentPage(1);
                      }}
                      className="rounded text-[#041A71] focus:ring-[#22c7ac]"
                    />
                    Apenas Alterados
                  </label>

                  <button
                    onClick={handleExportCSV}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#041A71] hover:bg-[#031355] text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Exportar
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#111c33] text-white uppercase text-[11px] font-bold tracking-wider">
                    <tr>
                      <th className="px-4 py-3.5">Contrato</th>
                      <th className="px-4 py-3.5">Localidade</th>
                      <th className="px-4 py-3.5">Centro de Custo</th>
                      <th className="px-4 py-3.5">Cargo</th>
                      <th className="px-3 py-3.5 text-right">Inicial</th>
                      <th className="px-3 py-3.5 text-right">Final</th>
                      <th className="px-3 py-3.5 text-right">Variação</th>
                      <th className="px-3 py-3.5 text-right">Variação %</th>
                      <th className="px-4 py-3.5 text-center">Tipo Movimento</th>
                      <th className="px-4 py-3.5">Justificativa</th>
                      <th className="px-4 py-3.5 text-center">Evidência</th>
                      <th className="px-4 py-3.5 text-center">Status</th>
                      <th className="px-4 py-3.5 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {paginatedItems.map((item) => {
                      const isPos = item.variation > 0;
                      const isNeg = item.variation < 0;
                      const isPending = item.governanceStatus === "Governança pendente";

                      return (
                        <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-800">{item.contractName}</td>
                          <td className="px-4 py-3 text-slate-600">{item.location}</td>
                          <td className="px-4 py-3 text-slate-600 font-mono text-[11px]">{item.costCenterCode}</td>
                          <td className="px-4 py-3 font-medium text-slate-900">{item.roleTitle}</td>
                          <td className="px-3 py-3 text-right font-mono text-slate-700">{item.qtyInitial}</td>
                          <td className="px-3 py-3 text-right font-mono text-slate-700">{item.qtyFinal}</td>
                          <td className="px-3 py-3 text-right font-mono font-bold">
                            <span className={isPos ? "text-emerald-600" : isNeg ? "text-red-600" : "text-slate-400"}>
                              {isPos ? `+${item.variation}` : item.variation}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-slate-500">{item.pctVariation > 0 ? "+" : ""}{item.pctVariation.toFixed(1)}%</td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] bg-slate-100 border border-slate-200 font-semibold">
                              {item.movementType}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 truncate max-w-[160px]" title={item.justification}>
                            {item.justification || "-"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {item.evidence ? (
                              <button
                                onClick={() => openEvidence(item)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[#041A71] hover:text-[#22c7ac] underline decoration-[#22c7ac]"
                              >
                                <FileText className="w-3.5 h-3.5 text-[#22c7ac]" />
                                Visualizar
                              </button>
                            ) : (
                              <span className="text-slate-400 text-[11px]">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {isPending ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                Governança pendente
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Aprovado
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {item.variation !== 0 ? (
                              <Link
                                href={`/governanca?contract=${encodeURIComponent(item.contractName)}&competence=${encodeURIComponent(item.finalCompetence)}&role=${encodeURIComponent(item.roleTitle)}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-[#041A71] hover:text-white text-[#041A71] rounded-lg text-[11px] font-bold transition-colors shadow-2xs"
                              >
                                Ver Governança
                                <ExternalLink className="w-3 h-3" />
                              </Link>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-slate-500 pt-2">
                <div>
                  Mostrando <b className="text-slate-800">{paginatedItems.length}</b> de{" "}
                  <b className="text-slate-800">{filteredDetailedItems.length}</b> registros
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-lg text-xs font-semibold"
                  >
                    Anterior
                  </button>
                  <span className="font-semibold text-slate-700">
                    Página {currentPage} de {totalPages}
                  </span>
                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-lg text-xs font-semibold"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: NOVA FUNCIONALIDADE — ANÁLISE DE MARGEM PARA APROVAÇÃO DE VAGAS   */}
        {/* ========================================================================= */}
        {activeTab === "margem" && (
          <div className="flex flex-col gap-6 md:gap-8 animate-fade-in">
            {/* Alertas Automáticos (Section 16) */}
            {marginAlerts.length > 0 && (
              <div className="space-y-2">
                {marginAlerts.map((alt, idx) => (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs font-semibold shadow-xs ${
                      alt.type === "danger"
                        ? "bg-red-50 text-red-800 border-red-200"
                        : alt.type === "warning"
                        ? "bg-amber-50 text-amber-800 border-amber-200"
                        : "bg-emerald-50 text-emerald-800 border-emerald-200"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {alt.type === "danger" ? (
                        <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                      ) : alt.type === "warning" ? (
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      )}
                      <span>{alt.message}</span>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-white/60">
                      {alt.type === "danger" ? "Crítico" : alt.type === "warning" ? "Alerta" : "Conforme"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Cards de Capacidade Executiva (Section 7, 8, 17) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-12 gap-3 flex-shrink-0">
              {/* Card Destaque: Capacidade para Novas Vagas (Section 8) */}
              <div className="col-span-2 sm:col-span-3 lg:col-span-4 bg-gradient-to-br from-[#041A71] to-[#0d2a8a] text-white rounded-2xl p-5 shadow-md flex flex-col justify-between relative overflow-hidden">
                <div className="flex items-center justify-between z-10">
                  <span className="text-xs font-bold text-[#22c7ac] uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-[#22c7ac]" />
                    Capacidade para Novas Vagas
                  </span>
                  <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded font-mono text-slate-300">
                    Global Seguro
                  </span>
                </div>
                <div className="my-2 z-10">
                  <div className="text-4xl font-black text-white">
                    {marginCards.capacidadeNovasVagas} <span className="text-lg font-light text-[#22c7ac]">FTE(s)</span>
                  </div>
                  <p className="text-xs text-slate-200 mt-1 leading-snug">
                    {marginCards.capacidadeNovasVagas > 0
                      ? `É possível acrescentar até ${marginCards.capacidadeNovasVagas} FTEs mantendo o quadro simultaneamente dentro do PA e Forecast.`
                      : "Não existe margem simultânea disponível em PA e Forecast para novas aprovações imediatas."}
                  </p>
                </div>
                <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-[#22c7ac]/10 rounded-full blur-xl pointer-events-none" />
              </div>

              {/* FTE PA */}
              <div className="col-span-2 sm:col-span-3 lg:col-span-2 bg-white rounded-xl p-4 shadow-sm border border-slate-200 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">FTE PA</span>
                <div className="mt-2">
                  <span className="text-2xl font-black text-[#041A71]">{marginCards.totalPA}</span>
                  <div className="text-[11px] text-slate-500 mt-0.5">Planejado</div>
                </div>
              </div>

              {/* FTE Forecast */}
              <div className="col-span-2 sm:col-span-3 lg:col-span-2 bg-white rounded-xl p-4 shadow-sm border border-slate-200 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">FTE Forecast</span>
                <div className="mt-2">
                  <span className="text-2xl font-black text-[#041A71]">{marginCards.totalForecast}</span>
                  <div className="text-[11px] text-slate-500 mt-0.5">Baseline Ajustado</div>
                </div>
              </div>

              {/* FTE Realizado */}
              <div className="col-span-2 sm:col-span-3 lg:col-span-2 bg-white rounded-xl p-4 shadow-sm border border-slate-200 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">FTE Realizado</span>
                <div className="mt-2">
                  <span className="text-2xl font-black text-slate-800">{marginCards.totalRealizado}</span>
                  <div className="text-[11px] text-slate-500 mt-0.5">Efetivo Atual</div>
                </div>
              </div>

              {/* Margem PA */}
              <div className="col-span-2 sm:col-span-3 lg:col-span-2 bg-white rounded-xl p-4 shadow-sm border border-slate-200 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Margem PA</span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className={`text-2xl font-black ${marginCards.margemTotalPA >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {marginCards.margemTotalPA >= 0 ? `+${marginCards.margemTotalPA}` : marginCards.margemTotalPA}
                  </span>
                  <span className="text-[10px] text-slate-400">PA - Real</span>
                </div>
              </div>

              {/* Margem Forecast */}
              <div className="col-span-2 sm:col-span-3 lg:col-span-3 bg-white rounded-xl p-4 shadow-sm border border-slate-200 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Margem Forecast</span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className={`text-2xl font-black ${marginCards.margemTotalForecast >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {marginCards.margemTotalForecast >= 0 ? `+${marginCards.margemTotalForecast}` : marginCards.margemTotalForecast}
                  </span>
                  <span className="text-[10px] text-slate-400">FC - Real</span>
                </div>
              </div>

              {/* Margem Segura Total */}
              <div className="col-span-2 sm:col-span-3 lg:col-span-3 bg-white rounded-xl p-4 shadow-sm border border-slate-200 flex flex-col justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Margem Segura</span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className={`text-2xl font-black ${marginCards.margemSeguraTotal >= 0 ? "text-[#22c7ac]" : "text-red-500"}`}>
                    {marginCards.margemSeguraTotal >= 0 ? `+${marginCards.margemSeguraTotal}` : marginCards.margemSeguraTotal}
                  </span>
                  <span className="text-[10px] text-slate-400">MÍN(PA; FC)</span>
                </div>
              </div>

              {/* Contratos com Margem (Aprovados) */}
              <div className="col-span-2 sm:col-span-3 lg:col-span-2 bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Com Margem</span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-bold text-emerald-900">{marginCards.contratosComMargem}</span>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-200/50 px-2 py-0.5 rounded">Aprovados</span>
                </div>
              </div>

              {/* Contratos Requer Análise */}
              <div className="col-span-2 sm:col-span-3 lg:col-span-2 bg-amber-50/70 border border-amber-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">Requer Análise</span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-bold text-amber-900">{marginCards.contratosRequerAnalise}</span>
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-200/50 px-2 py-0.5 rounded">Parcial</span>
                </div>
              </div>

              {/* Contratos Sem Margem */}
              <div className="col-span-2 sm:col-span-3 lg:col-span-2 bg-red-50/70 border border-red-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                <span className="text-[11px] font-bold text-red-800 uppercase tracking-wider">Sem Margem</span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-bold text-red-900">{marginCards.contratosSemMargem}</span>
                  <span className="text-[10px] font-bold text-red-700 bg-red-200/50 px-2 py-0.5 rounded">Esgotado</span>
                </div>
              </div>
            </div>

            {/* Simulador Interativo de Vagas (Section 6, 13, 18) */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#041A71] text-white rounded-xl">
                    <Calculator className="w-5 h-5 text-[#22c7ac]" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#041A71] flex items-center gap-2">
                      Simulador de Aprovação de Novas Vagas
                    </h3>
                    <p className="text-xs text-slate-500">
                      Simule o impacto imediato da aprovação de vagas no quadro sem alterar o banco de dados
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setSimulatedVagasMap({})}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Redefinir Simulações
                </button>
              </div>

              {/* Global Simulator Controls */}
              {globalSimItem && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
                  <div className="flex-1 space-y-1">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Selecionar Posição para Simular:
                    </label>
                    <select
                      value={globalSimSelectedId}
                      onChange={(e) => setGlobalSimSelectedId(e.target.value)}
                      className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-[#22c7ac]"
                    >
                      {marginDetailed.slice(0, 100).map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.contractName} | {i.roleTitle} | {i.location} (Real: {i.realizado} / PA: {i.pa} / FC: {i.forecast})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Vagas Solicitadas:
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          max="50"
                          value={globalSimVagas}
                          onChange={(e) => setGlobalSimVagas(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-20 h-10 px-3 bg-white border border-slate-300 rounded-lg font-mono font-bold text-sm text-center text-[#041A71]"
                        />
                        <button
                          onClick={() => {
                            if (globalSimSelectedId) {
                              setSimulatedVagasMap((prev) => ({
                                ...prev,
                                [globalSimSelectedId]: globalSimVagas
                              }));
                            }
                          }}
                          className="h-10 px-4 bg-[#041A71] hover:bg-[#031355] text-white rounded-lg text-xs font-bold shadow-xs transition-colors whitespace-nowrap"
                        >
                          Aplicar na Tabela
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Simulation Result Card (Antes vs Depois) */}
              {globalSimItem && globalSimResult && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-gradient-to-br from-slate-50 to-slate-100 p-4 rounded-xl border border-slate-200">
                  {/* Antes */}
                  <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs space-y-1 text-xs">
                    <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Cenário Atual (Antes)</span>
                    <div className="flex justify-between font-mono"><span>Realizado:</span><b className="text-slate-800">{globalSimItem.realizado} FTEs</b></div>
                    <div className="flex justify-between font-mono"><span>PA:</span><span className="text-slate-600">{globalSimItem.pa} FTEs</span></div>
                    <div className="flex justify-between font-mono"><span>Forecast:</span><span className="text-slate-600">{globalSimItem.forecast} FTEs</span></div>
                    <div className="pt-1 border-t border-slate-100 flex justify-between font-bold">
                      <span>Status Atual:</span>
                      <span className={`px-2 py-0.2 rounded text-[10px] ${getStatusBadge(globalSimItem.statusConsolidado)}`}>
                        {globalSimItem.statusConsolidado}
                      </span>
                    </div>
                  </div>

                  {/* Depois */}
                  <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs space-y-1 text-xs">
                    <span className="font-bold text-[#041A71] uppercase tracking-wider text-[10px]">Projetado (+{globalSimVagas} vagas)</span>
                    <div className="flex justify-between font-mono"><span>Real Projetado:</span><b className="text-[#041A71] font-bold">{globalSimResult.realProjetado} FTEs</b></div>
                    <div className="flex justify-between font-mono"><span>Margem PA:</span><b className={globalSimResult.margemPA >= 0 ? "text-emerald-600" : "text-red-600"}>{globalSimResult.margemPA >= 0 ? `+${globalSimResult.margemPA}` : globalSimResult.margemPA}</b></div>
                    <div className="flex justify-between font-mono"><span>Margem FC:</span><b className={globalSimResult.margemFC >= 0 ? "text-emerald-600" : "text-red-600"}>{globalSimResult.margemFC >= 0 ? `+${globalSimResult.margemFC}` : globalSimResult.margemFC}</b></div>
                    <div className="pt-1 border-t border-slate-100 flex justify-between font-bold">
                      <span>Margem Segura:</span>
                      <b className="text-[#22c7ac]">{globalSimResult.margemSegura} FTEs</b>
                    </div>
                  </div>

                  {/* Limites Individuais */}
                  <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs space-y-2 text-xs flex flex-col justify-center">
                    <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Aderência Individual</span>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Status PA:</span>
                      <span className="font-bold text-slate-800">{globalSimResult.statusPA}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Status Forecast:</span>
                      <span className="font-bold text-slate-800">{globalSimResult.statusFC}</span>
                    </div>
                  </div>

                  {/* Resultado da Decisão */}
                  <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs flex flex-col justify-between">
                    <div>
                      <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Decisão Simulada</span>
                      <div className="mt-1">
                        <span className={`inline-block px-3 py-1 rounded-lg text-xs font-black border ${getStatusBadge(globalSimResult.status)}`}>
                          {globalSimResult.status}
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug mt-2 italic">
                      {globalSimResult.msg}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Visão Resumida por Contrato com Drill-Down (Section 11) */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <h3 className="text-base md:text-lg font-bold text-[#041A71] flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-[#22c7ac]" />
                    Visão de Capacidade por Contrato (Drill-down)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Contrato → Localidade → Cargo com avaliação simultânea de limites de PA e Forecast
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#111c33] text-white uppercase text-[11px] font-bold tracking-wider">
                    <tr>
                      <th className="px-5 py-3.5">Estrutura (Contrato &gt; Localidade &gt; Cargo)</th>
                      <th className="px-4 py-3.5 text-right">PA</th>
                      <th className="px-4 py-3.5 text-right">Forecast</th>
                      <th className="px-4 py-3.5 text-right">Realizado</th>
                      <th className="px-4 py-3.5 text-right">Margem PA</th>
                      <th className="px-4 py-3.5 text-right">Margem Forecast</th>
                      <th className="px-4 py-3.5 text-right">Margem Segura</th>
                      <th className="px-4 py-3.5 text-center">Limitante</th>
                      <th className="px-4 py-3.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {marginContracts.map((c) => {
                      const isCExpanded = expandedMarginContracts.has(c.name);

                      return (
                        <React.Fragment key={c.name}>
                          <tr
                            onClick={() => toggleMarginContractExpand(c.name)}
                            className="bg-slate-100/90 hover:bg-slate-200/80 cursor-pointer font-bold transition-colors"
                          >
                            <td className="px-5 py-3 flex items-center gap-2 text-slate-900">
                              {isCExpanded ? <ChevronDown className="w-4 h-4 text-[#041A71] shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                              <Building2 className="w-4 h-4 text-[#041A71] shrink-0" />
                              <span className="text-sm">{c.name}</span>
                              <span className="text-[10px] text-slate-500 font-normal ml-2">({c.locations?.length || 0} localidades)</span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs text-slate-700">{c.pa}</td>
                            <td className="px-4 py-3 text-right font-mono text-xs text-slate-700">{c.forecast}</td>
                            <td className="px-4 py-3 text-right font-mono text-xs text-slate-900 font-bold">{c.realizado}</td>
                            <td className={`px-4 py-3 text-right font-mono text-xs font-bold ${c.margemPA >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                              {c.margemPA >= 0 ? `+${c.margemPA}` : c.margemPA}
                            </td>
                            <td className={`px-4 py-3 text-right font-mono text-xs font-bold ${c.margemForecast >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                              {c.margemForecast >= 0 ? `+${c.margemForecast}` : c.margemForecast}
                            </td>
                            <td className={`px-4 py-3 text-right font-mono text-xs font-black ${c.margemSegura >= 0 ? "text-[#22c7ac]" : "text-red-600"}`}>
                              {c.margemSegura >= 0 ? `+${c.margemSegura}` : c.margemSegura}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-0.5 rounded text-[10px] border ${getLimitanteBadge(c.limitante)}`}>
                                {c.limitante}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2.5 py-1 rounded-full text-[10px] border ${getStatusBadge(c.status)}`}>
                                {c.status}
                              </span>
                            </td>
                          </tr>

                          {isCExpanded &&
                            c.locations?.map((loc: any) => {
                              const lKey = `${c.name}__${loc.name}`;
                              const isLExpanded = expandedMarginLocations.has(lKey);

                              return (
                                <React.Fragment key={lKey}>
                                  <tr
                                    onClick={() => toggleMarginLocationExpand(lKey)}
                                    className="bg-slate-50 hover:bg-slate-100/90 cursor-pointer transition-colors"
                                  >
                                    <td className="px-5 py-2.5 pl-10 flex items-center gap-2 text-slate-800">
                                      {isLExpanded ? <ChevronDown className="w-3.5 h-3.5 text-[#22c7ac] shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                                      <MapPin className="w-3.5 h-3.5 text-[#22c7ac] shrink-0" />
                                      <span className="font-semibold text-xs">{loc.name}</span>
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-mono text-xs">{loc.pa}</td>
                                    <td className="px-4 py-2.5 text-right font-mono text-xs">{loc.forecast}</td>
                                    <td className="px-4 py-2.5 text-right font-mono text-xs font-bold">{loc.realizado}</td>
                                    <td className={`px-4 py-2.5 text-right font-mono text-xs ${loc.margemPA >= 0 ? "text-emerald-600 font-bold" : "text-red-600 font-bold"}`}>
                                      {loc.margemPA >= 0 ? `+${loc.margemPA}` : loc.margemPA}
                                    </td>
                                    <td className={`px-4 py-2.5 text-right font-mono text-xs ${loc.margemForecast >= 0 ? "text-emerald-600 font-bold" : "text-red-600 font-bold"}`}>
                                      {loc.margemForecast >= 0 ? `+${loc.margemForecast}` : loc.margemForecast}
                                    </td>
                                    <td className={`px-4 py-2.5 text-right font-mono text-xs font-black ${loc.margemSegura >= 0 ? "text-[#22c7ac]" : "text-red-600"}`}>
                                      {loc.margemSegura >= 0 ? `+${loc.margemSegura}` : loc.margemSegura}
                                    </td>
                                    <td className="px-4 py-2.5 text-center text-slate-400 text-[10px]">-</td>
                                    <td className="px-4 py-2.5 text-center">
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] border ${getStatusBadge(loc.status)}`}>
                                        {loc.status}
                                      </span>
                                    </td>
                                  </tr>

                                  {isLExpanded &&
                                    loc.roles?.map((r: any, rIdx: number) => (
                                      <tr key={rIdx} className="hover:bg-white transition-colors">
                                        <td className="px-5 py-2 pl-16 text-slate-600 flex items-center gap-2">
                                          <Briefcase className="w-3 h-3 text-slate-400 shrink-0" />
                                          <span>{r.name}</span>
                                        </td>
                                        <td className="px-4 py-2 text-right font-mono text-xs">{r.pa}</td>
                                        <td className="px-4 py-2 text-right font-mono text-xs">{r.forecast}</td>
                                        <td className="px-4 py-2 text-right font-mono text-xs font-semibold">{r.realizado}</td>
                                        <td className={`px-4 py-2 text-right font-mono text-xs ${r.margemPA >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                          {r.margemPA >= 0 ? `+${r.margemPA}` : r.margemPA}
                                        </td>
                                        <td className={`px-4 py-2 text-right font-mono text-xs ${r.margemForecast >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                          {r.margemForecast >= 0 ? `+${r.margemForecast}` : r.margemForecast}
                                        </td>
                                        <td className={`px-4 py-2 text-right font-mono text-xs font-bold ${r.margemSegura >= 0 ? "text-[#22c7ac]" : "text-red-600"}`}>
                                          {r.margemSegura >= 0 ? `+${r.margemSegura}` : r.margemSegura}
                                        </td>
                                        <td className="px-4 py-2 text-center text-xs">
                                          <span className={`px-1.5 py-0.2 rounded text-[9px] border ${getLimitanteBadge(r.limitante)}`}>
                                            {r.limitante}
                                          </span>
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                          <span className={`px-2 py-0.5 rounded-full text-[10px] border ${getStatusBadge(r.status)}`}>
                                            {r.status}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                </React.Fragment>
                              );
                            })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tabela de Apoio à Aprovação: Análise de Capacidade de FTE (Section 10, 12, 14, 15) */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col gap-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h3 className="text-base md:text-lg font-bold text-[#041A71] flex items-center gap-2">
                    <SlidersHorizontal className="w-5 h-5 text-[#22c7ac]" />
                    Tabela de Apoio: Análise de Capacidade de FTE
                  </h3>
                  <p className="text-xs text-slate-500">
                    Simulação linha a linha de vagas solicitadas, identificação de limites e consulta de Governança
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                  {/* Sorting Select */}
                  <select
                    value={marginSortCriteria}
                    onChange={(e) => setMarginSortCriteria(e.target.value)}
                    className="h-9 px-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-[#22c7ac]"
                  >
                    <option value="maior_margem">Maior Margem Disponível</option>
                    <option value="menor_margem">Menor Margem</option>
                    <option value="sem_margem">Contratos/Cargos Sem Margem</option>
                    <option value="acima_pa">Acima do PA</option>
                    <option value="acima_fc">Acima do Forecast</option>
                  </select>

                  <div className="relative flex-1 sm:w-56">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filtrar por cargo ou contrato..."
                      value={tableSearch}
                      onChange={(e) => {
                        setTableSearch(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-[#22c7ac]"
                    />
                  </div>

                  <button
                    onClick={handleExportMarginCSV}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#041A71] hover:bg-[#031355] text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Exportar
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#111c33] text-white uppercase text-[11px] font-bold tracking-wider">
                    <tr>
                      <th className="px-4 py-3.5">Contrato</th>
                      <th className="px-4 py-3.5">Localidade</th>
                      <th className="px-4 py-3.5">Cargo</th>
                      <th className="px-2 py-3.5 text-right">PA</th>
                      <th className="px-2 py-3.5 text-right">Forecast</th>
                      <th className="px-2 py-3.5 text-right">Real</th>
                      <th className="px-2.5 py-3.5 text-right">Margem PA</th>
                      <th className="px-2.5 py-3.5 text-right">Margem FC</th>
                      <th className="px-2.5 py-3.5 text-right">Margem Segura</th>
                      <th className="px-3 py-3.5 text-center bg-blue-950/40">Vagas Solicitadas</th>
                      <th className="px-2.5 py-3.5 text-right bg-blue-950/40">Real Projetado</th>
                      <th className="px-3 py-3.5 text-center">Limitante</th>
                      <th className="px-3 py-3.5 text-center">Status Projetado</th>
                      <th className="px-4 py-3.5 text-right">Governança</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {paginatedMarginItems.map((item) => {
                      const hasVagas = item.vagasSolicitadas > 0;

                      return (
                        <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-800">{item.contractName}</td>
                          <td className="px-4 py-3 text-slate-600">{item.location}</td>
                          <td className="px-4 py-3 font-medium text-slate-900">{item.roleTitle}</td>
                          <td className="px-2 py-3 text-right font-mono text-slate-700">{item.pa}</td>
                          <td className="px-2 py-3 text-right font-mono text-slate-700">{item.forecast}</td>
                          <td className="px-2 py-3 text-right font-mono font-bold text-slate-900">{item.realizado}</td>
                          <td className={`px-2.5 py-3 text-right font-mono ${item.margemPA >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {item.margemPA >= 0 ? `+${item.margemPA}` : item.margemPA}
                          </td>
                          <td className={`px-2.5 py-3 text-right font-mono ${item.margemForecast >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {item.margemForecast >= 0 ? `+${item.margemForecast}` : item.margemForecast}
                          </td>
                          <td className={`px-2.5 py-3 text-right font-mono font-bold ${item.margemSegura >= 0 ? "text-[#22c7ac]" : "text-red-600"}`}>
                            {item.margemSegura >= 0 ? `+${item.margemSegura}` : item.margemSegura}
                          </td>

                          {/* Interactive Vagas Solicitadas Input */}
                          <td className="px-3 py-2 text-center bg-blue-50/40">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={item.vagasSolicitadas || ""}
                              placeholder="0"
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setSimulatedVagasMap((prev) => ({
                                  ...prev,
                                  [item.id]: val
                                }));
                              }}
                              className={`w-16 h-8 px-2 font-mono font-bold text-xs text-center rounded-lg border transition-all ${
                                hasVagas
                                  ? "bg-white border-[#041A71] text-[#041A71] shadow-xs"
                                  : "bg-white/80 border-slate-300 text-slate-600"
                              }`}
                            />
                          </td>

                          {/* Realizado Projetado */}
                          <td className="px-2.5 py-3 text-right font-mono font-bold bg-blue-50/40">
                            <span className={hasVagas ? "text-[#041A71]" : "text-slate-500"}>
                              {item.realProjetado}
                            </span>
                          </td>

                          {/* Limitante */}
                          <td className="px-3 py-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] border ${getLimitanteBadge(item.limitante)}`}>
                              {item.limitante}
                            </span>
                          </td>

                          {/* Status Projetado with Tooltip (Section 12) */}
                          <td className="px-3 py-3 text-center relative group">
                            <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] border cursor-help ${getStatusBadge(item.statusProjetado)}`}>
                              {item.statusProjetado}
                            </span>

                            {/* Tooltip on Hover */}
                            <div className="hidden group-hover:block absolute right-4 bottom-full mb-2 bg-[#111c33] text-white p-4 rounded-xl shadow-2xl z-40 text-xs border border-white/10 w-80 text-left pointer-events-none">
                              <div className="font-bold text-[#22c7ac] mb-1.5 pb-1 border-b border-white/10 flex justify-between">
                                <span>Avaliação de Margem</span>
                                <span className="text-white">{item.statusProjetado}</span>
                              </div>
                              <div className="space-y-1 text-slate-300 text-[11px]">
                                <div><b className="text-white">Contrato:</b> {item.contractName}</div>
                                <div><b className="text-white">Localidade:</b> {item.location}</div>
                                <div><b className="text-white">Cargo:</b> {item.roleTitle}</div>
                                <div className="pt-1.5 grid grid-cols-3 gap-1 border-t border-white/10 text-center font-mono">
                                  <div className="bg-white/5 p-1 rounded">PA: <b className="text-white">{item.pa}</b></div>
                                  <div className="bg-white/5 p-1 rounded">FC: <b className="text-white">{item.forecast}</b></div>
                                  <div className="bg-white/5 p-1 rounded">Real: <b className="text-white">{item.realizado}</b></div>
                                </div>
                                <div className="grid grid-cols-3 gap-1 text-center font-mono text-[10px]">
                                  <div className={item.margemPA >= 0 ? "text-emerald-400" : "text-red-400"}>M.PA: {item.margemPA}</div>
                                  <div className={item.margemForecast >= 0 ? "text-emerald-400" : "text-red-400"}>M.FC: {item.margemForecast}</div>
                                  <div className="text-[#22c7ac] font-bold">Segura: {item.margemSegura}</div>
                                </div>
                                <div className="mt-2 pt-1 border-t border-white/10 italic text-slate-200">
                                  {item.msgProjetada}
                                </div>
                                {item.justification && (
                                  <div className="mt-1 pt-1 border-t border-white/10 text-[10px]">
                                    <span className="text-[#22c7ac] font-semibold">Última Governança: </span>
                                    {item.justification}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Link para Governança (Section 15) */}
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <Link
                              href={`/governanca?contract=${encodeURIComponent(item.contractName)}&competence=${encodeURIComponent(item.competence)}&role=${encodeURIComponent(item.roleTitle)}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-[#041A71] hover:text-white text-[#041A71] rounded-lg text-[11px] font-bold transition-colors shadow-2xs"
                              title="Consultar e auditar na Governança com este contrato e cargo pré-selecionados"
                            >
                              Consultar
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination for Margin Table */}
              <div className="flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-slate-500 pt-2">
                <div>
                  Mostrando <b className="text-slate-800">{paginatedMarginItems.length}</b> de{" "}
                  <b className="text-slate-800">{processedMarginItems.length}</b> posições avaliadas
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-lg text-xs font-semibold"
                  >
                    Anterior
                  </button>
                  <span className="font-semibold text-slate-700">
                    Página {currentPage} de {totalPagesMargin}
                  </span>
                  <button
                    disabled={currentPage >= totalPagesMargin}
                    onClick={() => setCurrentPage((p) => Math.min(totalPagesMargin, p + 1))}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-lg text-xs font-semibold"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Evidence Preview Modal */}
      <EvidenceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        evidence={modalEvidence}
        itemInfo={modalItemInfo}
      />
    </main>
  );
}
