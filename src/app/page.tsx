"use client";

import React, { useState, useEffect } from "react";
import MultiSelect from "@/components/MultiSelect";
import ConsolidatedTable from "@/components/ConsolidatedTable";
import { Loader2, FilterX, Info, ArrowUp, ArrowDown } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import ThemeToggle from "@/components/ThemeToggle";

export default function Home() {
  const { isDark } = useTheme();
  const [filterOptions, setFilterOptions] = useState<any>({ competences: [], costCenters: [], statuses: [] });
  const [selectedCompetences, setSelectedCompetences] = useState<string[]>([]);
  const [selectedCostCenters, setSelectedCostCenters] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedContractTypes, setSelectedContractTypes] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedBillingTypes, setSelectedBillingTypes] = useState<string[]>([]);
  
  const [summaryData, setSummaryData] = useState<any[]>([]);
  const [financialByCC, setFinancialByCC] = useState<Record<string, any>>({});
  const [variacaoByPrefix, setvariacaoByPrefix] = useState<Record<string, any>>({});
  const [totals, setTotals] = useState({ pa: 0, forecast: 0, realized: 0 });
  const [financialData, setFinancialData] = useState({
    custoBrutoPA: 0, custoBrutoRealizado: 0, custoLiquido: 0,
    receitaBrutaPA: 0, receitaBrutaRealizada: 0, receitaBrutaLiquida: 0, valorLiquido: 0, valorLiquidoPA: 0,
    variacaoTotalPA: 0, variacaoTotalReal: 0, variacaoDif: 0, variacaoDifPercent: 0
  });
  const [isLoading, setIsLoading] = useState(true);

  // Load filter options on mount
  useEffect(() => {
    fetch('/api/dashboard/filters')
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setFilterOptions(data);
          
            // Default selection
            if (data.competences.length > 0) {
              if (data.latestActiveCompetence && data.competences.includes(data.latestActiveCompetence)) {
                setSelectedCompetences([data.latestActiveCompetence]);
              } else {
                setSelectedCompetences([data.competences[0]]);
              }
            }

          if (data.statuses.length > 0) {
            setSelectedStatuses(data.statuses.filter((s: string) => s !== 'Rescisão'));
          }
        }
      })
      .catch(console.error);
  }, []);

  // Update dynamic contract types and cost centers when selected competence changes
  useEffect(() => {
    if (selectedCompetences.length === 0) return;
    fetch(`/api/dashboard/filters?competence=${selectedCompetences[0]}`)
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setFilterOptions((prev: any) => ({
            ...prev,
            costCenters: data.costCenters || prev.costCenters,
            contractTypes: data.contractTypes || prev.contractTypes,
            types: data.types || prev.types
          }));
        }
      })
      .catch(console.error);
  }, [selectedCompetences]);

  // Fetch summary when filters change
  useEffect(() => {
    if (filterOptions.competences.length === 0) return; // Wait for initial load

    setIsLoading(true);
    Promise.all([
      fetch('/api/dashboard/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competences: selectedCompetences,
          costCenters: selectedCostCenters,
          statuses: selectedStatuses,
          contractTypes: selectedContractTypes,
          types: selectedTypes
        })
      }),
      fetch('/api/dashboard/financial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competences: selectedCompetences, costCenters: selectedCostCenters, contractTypes: selectedContractTypes, types: selectedTypes, statuses: selectedStatuses, billingTypes: selectedBillingTypes })
      })
    ])
    .then(([summaryRes, finRes]) => Promise.all([summaryRes.json(), finRes.json()]))
    .then(([summaryData, finData]) => {
      if (!summaryData.error) {
        setSummaryData(summaryData.summary);
        setTotals(summaryData.totals);
        setFinancialByCC(summaryData.financialByCC || {});
          setvariacaoByPrefix(summaryData.variacaoByPrefix || {});
      }
      if (!finData.error) {
        setFinancialData(finData);
      }
    })
    .catch(console.error)
    .finally(() => setIsLoading(false));
  }, [selectedCompetences, selectedCostCenters, selectedStatuses, selectedContractTypes, selectedTypes, selectedBillingTypes, filterOptions.competences]);

  
  const dynamicCostCenters = (filterOptions.costCenters || []).filter((c: any) => {
    if (selectedContractTypes.length === 0) return true;
    return selectedContractTypes.includes(c.contractName);
  });

  const handleClearFilters = () => {
    setSelectedCompetences(filterOptions.competences.length > 0 ? [filterOptions.competences[0]] : []);
    setSelectedCostCenters([]);
    setSelectedStatuses(filterOptions.statuses.filter((s: string) => s !== 'Rescisão'));
    setSelectedContractTypes([]);
    setSelectedTypes([]);
  };

  // Calculations
  const difPA = totals.realized - totals.pa;
  const difFC = totals.realized - totals.forecast;
  
  const pctPA = totals.pa === 0 ? (totals.realized === 0 ? 0 : null) : ((totals.realized - totals.pa) / totals.pa) * 100;
  const pctFC = totals.forecast === 0 ? (totals.realized === 0 ? 0 : null) : ((totals.realized - totals.forecast) / totals.forecast) * 100;

  // Format percent
  const formatPct = (val: number | null) => val === null ? "Sem Base" : `${Math.round(val)}%`;

  const formatMoney = (val: number) => {
    if (val === 0) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Color logic
  const getCardColor = (val: number) => {
    if (val === 0) return 'text-[#22c7ac]'; // Verde
    if (val > 0) return 'text-red-500'; // Vermelho
    return 'text-amber-500'; // Laranja
  };
  
  const getFinColorCusto = (val: number) => {
    if (val === 0) return 'text-[#22c7ac]'; 
    if (val > 0) return 'text-red-500'; // Realizado acima do PA (ruim)
    return 'text-[#22c7ac]'; // Realizado abaixo do PA (bom)
  };
  
  const getFinColorReceita = (val: number) => {
    if (val === 0) return 'text-slate-600'; 
    if (val > 0) return 'text-[#22c7ac]'; // Receita acima (bom)
    return 'text-red-500'; // Receita abaixo (ruim)
  };

  return (
    <main className={`flex-1 flex flex-col h-screen overflow-hidden transition-colors duration-200 ${isDark ? 'bg-[#0a0f1d] text-white' : 'bg-slate-50 text-slate-900'}`}>
      {/* Header and Filters (Fixed Top) */}
      <div className={`px-4 py-4 md:px-8 md:py-6 flex-shrink-0 z-20 shadow-sm border-b transition-colors ${
        isDark ? 'bg-[#111c33] border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <h2 className={`text-xl md:text-2xl font-bold mb-4 md:mb-6 ${isDark ? 'text-white' : 'text-[#041A71]'}`}>
          Controle de Efetivo | FTE
        </h2>
        
        <div className="flex flex-col xl:flex-row gap-4 md:gap-6 justify-between items-start xl:items-end">
          <div className="flex flex-wrap gap-4 flex-1">
            <MultiSelect 
              label="Centro de Custo"
              placeholder="Todos"
              options={dynamicCostCenters.map((c: any) => ({ label: `${c.code} - ${c.name}`, value: c.id }))}
              selected={selectedCostCenters}
              onChange={setSelectedCostCenters}
              theme={isDark ? "dark" : "light"}
            />
            <MultiSelect 
              label="Competência"
              placeholder="Nenhuma"
              options={filterOptions.competences.map((c: string) => ({ label: c, value: c }))}
              selected={selectedCompetences}
              onChange={setSelectedCompetences}
              theme={isDark ? "dark" : "light"}
            />
            <MultiSelect 
              label="Contrato"
              placeholder="Todos"
              options={(filterOptions.contractTypes || []).map((c: string) => ({ label: c, value: c }))}
              selected={selectedContractTypes}
              onChange={setSelectedContractTypes}
              theme={isDark ? "dark" : "light"}
            />
            <MultiSelect 
              label="Tipo"
              placeholder="Todos"
              options={(filterOptions.types || []).map((c: string) => ({ label: c, value: c }))}
              selected={selectedTypes}
              onChange={setSelectedTypes}
              theme={isDark ? "dark" : "light"}
            />
            <MultiSelect 
              label="Tipo de Situação"
              placeholder="Todas"
              options={filterOptions.statuses.map((c: string) => ({ label: c, value: c }))}
              selected={selectedStatuses}
              onChange={setSelectedStatuses}
              theme={isDark ? "dark" : "light"}
            />
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle variant="pill" className="h-[38px] mb-0.5" />
            <button 
              onClick={handleClearFilters}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm whitespace-nowrap h-[38px] mb-0.5 ${
                isDark 
                  ? 'bg-[#162038] hover:bg-[#1c294a] text-slate-200 border border-slate-700/80' 
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              <FilterX className="w-4 h-4" /> Limpar Filtros
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-auto p-4 md:p-8 flex flex-col gap-6 md:gap-8">
        
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4 flex-shrink-0">
          <div className={`rounded-xl p-5 border shadow-sm flex flex-col items-center justify-center text-center transition-colors ${
            isDark ? 'bg-[#111c33] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <span className={`text-xs font-bold mb-2 uppercase tracking-wide ${isDark ? 'text-slate-300' : 'text-[#041A71]'}`}>Total PA</span>
            <span className={`text-3xl font-light ${isDark ? 'text-white' : 'text-slate-700'}`}>{totals.pa}</span>
          </div>
          <div className={`rounded-xl p-5 border shadow-sm flex flex-col items-center justify-center text-center transition-colors ${
            isDark ? 'bg-[#111c33] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <span className={`text-xs font-bold mb-2 uppercase tracking-wide ${isDark ? 'text-slate-300' : 'text-[#041A71]'}`}>Baseline Ajustado</span>
            <span className={`text-3xl font-light ${isDark ? 'text-white' : 'text-slate-700'}`}>{totals.forecast}</span>
          </div>
          <div className={`rounded-xl p-5 border shadow-sm flex flex-col items-center justify-center text-center transition-colors ${
            isDark ? 'bg-[#111c33] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <span className={`text-xs font-bold mb-2 uppercase tracking-wide ${isDark ? 'text-slate-300' : 'text-[#041A71]'}`}>Realizado</span>
            <span className={`text-3xl font-light ${isDark ? 'text-white' : 'text-slate-700'}`}>{totals.realized}</span>
          </div>
          <div className={`rounded-xl p-5 border shadow-sm flex flex-col items-center justify-center text-center transition-colors ${
            isDark ? 'bg-[#111c33] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <span className={`text-xs font-bold mb-2 uppercase tracking-wide ${isDark ? 'text-slate-300' : 'text-[#041A71]'}`}>Realizado (Real. - PA)</span>
            <span className={`text-3xl font-medium ${getCardColor(difPA)}`}>{difPA > 0 ? `+${difPA}` : difPA}</span>
          </div>
          <div className={`rounded-xl p-5 border shadow-sm flex flex-col items-center justify-center text-center transition-colors ${
            isDark ? 'bg-[#111c33] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <span className={`text-xs font-bold mb-2 uppercase tracking-wide ${isDark ? 'text-slate-300' : 'text-[#041A71]'}`}>Realizado (Real. - Ajust.)</span>
            <span className={`text-3xl font-medium ${getCardColor(difFC)}`}>{difFC > 0 ? `+${difFC}` : difFC}</span>
          </div>
          <div className={`rounded-xl p-5 border shadow-sm flex flex-col items-center justify-center text-center transition-colors ${
            isDark ? 'bg-[#111c33] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <span className={`text-xs font-bold mb-2 uppercase tracking-wide ${isDark ? 'text-slate-300' : 'text-[#041A71]'}`}>% Realizado PA</span>
            <span className={`text-3xl font-light ${isDark ? 'text-white' : 'text-slate-700'}`}>{formatPct(pctPA)}</span>
          </div>
          <div className={`rounded-xl p-5 border shadow-sm flex flex-col items-center justify-center text-center transition-colors ${
            isDark ? 'bg-[#111c33] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <span className={`text-xs font-bold mb-2 uppercase tracking-wide ${isDark ? 'text-slate-300' : 'text-[#041A71]'}`}>% Realizado Baseline</span>
            <span className={`text-3xl font-light ${isDark ? 'text-white' : 'text-slate-700'}`}>{formatPct(pctFC)}</span>
          </div>
        </div>

        {/* Variação FTE (Financeiro) */}
        <div className="flex flex-col gap-4">
          <h3 className={`text-lg font-bold mb-2 ${isDark ? 'text-white' : 'text-[#041A71]'}`}>
            Indicadores Financeiros (Variação FTE)
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Total PA */}
            <div className={`rounded-xl p-5 border shadow-sm flex flex-col justify-center transition-colors ${
              isDark ? 'bg-[#111c33] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
            }`}>
              <div className="text-sm font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                Total PA (R$)
                <Info className="w-3 h-3 text-slate-400"  />
              </div>
              <div className={`text-2xl font-mono font-bold ${isDark ? 'text-blue-400' : 'text-[#041A71]'}`}>
                {formatMoney(financialData.variacaoTotalPA)}
              </div>
            </div>

            {/* Total Realizado */}
            <div className={`rounded-xl p-5 border shadow-sm flex flex-col justify-center transition-colors ${
              isDark ? 'bg-[#111c33] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
            }`}>
              <div className="text-sm font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                Total Real. (R$)
                <Info className="w-3 h-3 text-slate-400"  />
              </div>
              <div className={`text-2xl font-mono font-bold ${isDark ? 'text-emerald-400' : 'text-[#041A71]'}`}>
                {formatMoney(financialData.variacaoTotalReal)}
              </div>
            </div>

            {/* Diferença Valor */}
            <div className={`rounded-xl p-5 border shadow-sm flex flex-col justify-center relative overflow-hidden transition-colors ${
              isDark ? 'bg-[#111c33] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
            }`}>
              <div className="text-sm font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                Dif. Valor (Real - PA)
                <Info className="w-3 h-3 text-slate-400"  />
              </div>
              <div className={`text-2xl font-mono font-bold ${financialData.variacaoDif < 0 ? 'text-[#22c7ac]' : (financialData.variacaoDif > 0 ? 'text-red-500' : (isDark ? 'text-white' : 'text-slate-800'))}`}>
                {formatMoney(financialData.variacaoDif)}
              </div>
              {financialData.variacaoDif !== 0 && (
                <div className={`absolute top-0 right-0 h-full w-2 ${financialData.variacaoDif < 0 ? 'bg-[#22c7ac]' : 'bg-red-500'}`} />
              )}
            </div>

            {/* % Diferença */}
            <div className={`rounded-xl p-5 border shadow-sm flex flex-col justify-center transition-colors ${
              isDark ? 'bg-[#111c33] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
            }`}>
              <div className="text-sm font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                % Dif. Valor
                <Info className="w-3 h-3 text-slate-400"  />
              </div>
              <div className="flex items-center gap-3">
                <div className={`text-3xl font-mono font-black ${financialData.variacaoDifPercent < 0 ? 'text-[#22c7ac]' : (financialData.variacaoDifPercent > 0 ? 'text-red-500' : (isDark ? 'text-white' : 'text-slate-800'))}`}>
                  {financialData.variacaoDifPercent > 0 ? '+' : ''}{financialData.variacaoDifPercent.toFixed(1)}%
                </div>
                {financialData.variacaoDifPercent !== 0 && (
                  <div className={`flex items-center justify-center p-1.5 rounded-full ${financialData.variacaoDifPercent < 0 ? 'bg-[#22c7ac]/10 text-[#22c7ac]' : 'bg-red-500/10 text-red-500'}`}>
                    {financialData.variacaoDifPercent < 0 ? <ArrowDown className="w-5 h-5" /> : <ArrowUp className="w-5 h-5" />}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Matrix Table */}
        <div className="flex-1 min-h-[400px]">
          <ConsolidatedTable 
            data={summaryData} 
            financialByCC={financialByCC} 
            variacaoByPrefix={variacaoByPrefix} 
            isLoading={isLoading} 
            theme={isDark ? "dark" : "light"}
          />
        </div>
      </div>
    </main>
  );
}
