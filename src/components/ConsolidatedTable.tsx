import React, { useMemo, useState, useRef } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronRight, ChevronDown, PlusSquare, MinusSquare, Pin, X, Info } from 'lucide-react';

const formatMoney = (val: number | undefined) => {
  if (val === undefined || val === null || isNaN(val) || val === 0) return '-';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
};

const formatPercent = (val: number | null | undefined, includePlus = false, zeroAsDash = false) => {
  if (val === undefined || val === null || isNaN(val)) return '-';
  if (val === 0) return zeroAsDash ? '-' : '0,0%';
  const prefix = includePlus && val > 0 ? '+' : '';
  const formatted = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(val);
  return `${prefix}${formatted}%`;
};

const calcDif = (realized: number, planned: number) => {
  return realized - planned;
};

const calcPercent = (realized: number, planned: number): number | null => {
  if (planned === 0) {
    if (realized === 0) return null;
    return realized > 0 ? 100 : -100;
  }
  return ((realized - planned) / planned) * 100;
};

const Indicator = ({ diff }: { diff: number }) => {
  if (diff === 0) return null;
  return (
    <span className={`inline-block ml-1 w-2 h-2 rounded-full ${diff < 0 ? 'bg-[#22c7ac]' : 'bg-red-500'}`} title={diff < 0 ? 'Abaixo do planejado' : 'Acima do planejado'} />
  );
};

type SortKey = 'name' | 'pa' | 'forecast' | 'realized' | 'difPA' | 'difFC' | 'pctReal';



const ContractTooltip = ({
  contractNode,
  isOpen,
  isLocked,
  onToggleLock,
  onClose,
  onMouseEnter,
  onMouseLeave
}: {
  contractNode: any;
  isOpen: boolean;
  isLocked: boolean;
  onToggleLock: () => void;
  onClose: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) => {
  const summary = useMemo(() => {
    const changesMap = new Map<string, { name: string; diff: number; absDiff: number; justifications: Set<string> }>();

    contractNode.ccs.forEach((cc: any) => {
      cc.roles.forEach((role: any) => {
        const diff = (role.forecast || 0) - (role.pa || 0);
        if (diff !== 0) {
          const isDummy = role.name.match(/^\d\.\d/);
          const displayName = isDummy ? 'FTEs (Cargo não informado no Forecast)' : role.name;
          if (!changesMap.has(displayName)) {
            changesMap.set(displayName, {
              name: displayName,
              diff: 0,
              absDiff: 0,
              justifications: new Set<string>()
            });
          }
          const item = changesMap.get(displayName)!;
          item.diff += diff;
          if (role.justification && typeof role.justification === 'string' && role.justification.trim()) {
            item.justifications.add(role.justification.trim());
          }
        }
      });
    });

    return Array.from(changesMap.values())
      .filter((item) => item.diff !== 0)
      .map((item) => ({
        ...item,
        absDiff: Math.abs(item.diff),
        justificationsList: Array.from(item.justifications)
      }))
      .sort((a, b) => b.absDiff - a.absDiff);
  }, [contractNode]);

  if (!isOpen) return null;

  const contractPA = contractNode.pa || 0;
  const contractFC = contractNode.forecast || 0;

  if (contractPA === contractFC && summary.length === 0) {
    return (
      <div
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={(e) => e.stopPropagation()}
        className="absolute left-8 top-full mt-1 w-96 bg-[#111c33] text-white text-xs rounded-xl p-3 shadow-2xl z-[100] pointer-events-auto border border-white/20 whitespace-normal text-left"
      >
        <div className="flex items-center justify-between font-bold mb-1 pb-1 border-b border-white/10">
          <span className="text-[#22c7ac]">Resumo de alterações (PA vs Baseline):</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="text-slate-400 hover:text-white p-0.5 rounded hover:bg-white/10"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="text-slate-300 text-xs">Nenhuma alteração no total de FTE deste contrato.</div>
      </div>
    );
  }

  if (summary.length === 0) return null;

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={(e) => e.stopPropagation()}
      className={`absolute left-8 top-full mt-1 w-[460px] max-w-[92vw] bg-[#111c33] text-white text-xs rounded-xl p-3.5 shadow-2xl z-[100] pointer-events-auto border ${
        isLocked ? 'border-[#22c7ac] ring-2 ring-[#22c7ac]/30' : 'border-white/20'
      } transition-all whitespace-normal text-left`}
    >
      {/* Header */}
      <div className="flex items-center justify-between font-bold mb-2 pb-2 border-b border-white/10">
        <div className="flex items-center gap-1.5">
          <span className="text-[#22c7ac]">Resumo de alterações (PA vs Baseline):</span>
          <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-slate-300 font-normal">
            {summary.length} cargo(s)
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleLock();
            }}
            className={`px-2 py-0.5 rounded text-[10px] flex items-center gap-1 font-bold transition-all ${
              isLocked
                ? 'bg-[#22c7ac] text-[#041A71] shadow-xs'
                : 'bg-white/10 hover:bg-white/20 text-slate-200'
            }`}
            title={isLocked ? "Clique para destravar pop-up" : "Travar pop-up aberto para rolar a barra e analisar com calma"}
          >
            <Pin className="w-3 h-3" />
            {isLocked ? "Travado" : "Travar"}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-white/10 transition-colors"
            title="Fechar pop-up"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Scrollable list with scrollbar */}
      <ul className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1.5">
        {summary.map((item, idx) => (
          <li key={idx} className="bg-white/5 p-2.5 rounded-lg border border-white/5 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <span className="font-bold text-white text-xs leading-snug">
                {item.name}
              </span>
              <span
                className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] shrink-0 ${
                  item.diff > 0
                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-700/50'
                    : 'bg-red-950/80 text-red-400 border border-red-700/50'
                }`}
              >
                {item.diff > 0 ? `+ Acréscimo de ${item.absDiff}` : `- Redução de ${item.absDiff}`}
              </span>
            </div>

            {/* Justificativa do motivo */}
            <div className="pt-1 text-[11px] text-slate-300 border-t border-white/5">
              <span className="font-semibold text-[#22c7ac]">Motivo / Justificativa: </span>
              {item.justificationsList && item.justificationsList.length > 0 ? (
                <span className="italic text-slate-100">{item.justificationsList.join(' | ')}</span>
              ) : (
                <span className="italic text-slate-400">Pendente de justificativa na tela de Governança.</span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Footer helper note */}
      <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400">
        <span>Role com o mouse para ver todas as alterações.</span>
        {isLocked && <span className="text-[#22c7ac] font-bold">● Pop-up travado na tela</span>}
      </div>
    </div>
  );
};

export default function ConsolidatedTable({ 
  data, 
  financialByCC, 
  variacaoByPrefix, 
  isLoading,
  theme = 'light'
}: { 
  data: any[], 
  financialByCC: any, 
  variacaoByPrefix: any, 
  isLoading?: boolean,
  theme?: 'light' | 'dark'
}) {
  const isDark = theme === 'dark';
  const [expandedContracts, setExpandedContracts] = useState<Set<string>>(new Set());
  const [expandedCCs, setExpandedCCs] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<{ key: SortKey, direction: 'asc' | 'desc' } | null>(null);

  const [lockedContract, setLockedContract] = useState<string | null>(null);
  const [hoveredContract, setHoveredContract] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnterContract = (contractKey: string) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredContract(contractKey);
  };

  const handleMouseLeaveContract = (contractKey: string) => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredContract((curr) => (curr === contractKey ? null : curr));
    }, 300);
  };

  const handleToggleLockContract = (contractKey: string) => {
    setLockedContract((prev) => (prev === contractKey ? null : contractKey));
  };

  const toggleContract = (contractKey: string) => {
    setExpandedContracts(prev => {
      const next = new Set(prev);
      if (next.has(contractKey)) next.delete(contractKey);
      else next.add(contractKey);
      return next;
    });
  };

  const toggleCC = (ccKey: string) => {
    setExpandedCCs(prev => {
      const next = new Set(prev);
      if (next.has(ccKey)) next.delete(ccKey);
      else next.add(ccKey);
      return next;
    });
  };

  const handleSort = (key: SortKey) => {
    setSortConfig(prev => {
      if (prev?.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        return null;
      }
      return { key, direction: 'asc' };
    });
  };

  const tree = useMemo(() => {
    const root = new Map<string, any>();

    const normalizeText = (s: string) => {
      return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\./g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    };

    data.forEach(item => {
      const contractKey = item.contractName || 'NÃO INFORMADO';
      const ccKey = item.costCenterCode || '';
      const ccDesc = item.costCenterDesc || '';
      const ccDescFull = `${ccKey} - ${ccDesc}`;
      
      const roleClean = normalizeText(item.roleTitle);
      const ccKeyClean = normalizeText(ccKey);
      const ccDescFullClean = normalizeText(ccDescFull);
      const ccDescClean = normalizeText(ccDesc);
      
      if (roleClean === ccKeyClean || roleClean === ccDescFullClean || roleClean === ccDescClean) {
        return;
      }

      if (!root.has(contractKey)) {
        root.set(contractKey, {
          key: contractKey,
          name: contractKey,
          pa: 0, forecast: 0, realized: 0,
          fin: { variacaoTotalPA: 0, variacaoTotalReal: 0, variacaoDif: 0 },
          ccs: new Map<string, any>()
        });
      }
      
      const contractNode = root.get(contractKey);
      
      if (!contractNode.ccs.has(ccKey)) {
        contractNode.ccs.set(ccKey, {
          key: ccKey,
          name: ccDescFull,
          pa: 0, forecast: 0, realized: 0,
          fin: { ...(financialByCC[ccKey] || { custoBrutoPA: 0, custoBrutoRealizado: 0, receitaBrutaPA: 0, receitaBrutaRealizada: 0, valorLiquidoPA: 0, valorLiquido: 0 }) },
          roles: []
        });
      }
      
      const ccNode = contractNode.ccs.get(ccKey);
      
      contractNode.pa += item.pa;
      contractNode.forecast += item.forecast;
      contractNode.realized += item.realized;
      
      ccNode.pa += item.pa;
      ccNode.forecast += item.forecast;
      ccNode.realized += item.realized;

      ccNode.roles.push({
        id: item.roleId,
        name: item.roleTitle,
        pa: item.pa,
        forecast: item.forecast,
        realized: item.realized,
        justification: item.justification
      });
    });

    const result = Array.from(root.values()).map(contractNode => {
      contractNode.difPA = calcDif(contractNode.realized, contractNode.pa);
      contractNode.difFC = calcDif(contractNode.realized, contractNode.forecast);
      contractNode.pctReal = calcPercent(contractNode.realized, contractNode.pa);
      contractNode.hasChanges = (contractNode.forecast || 0) !== (contractNode.pa || 0);
      
      // Match the contract to the variacaoByPrefix (first Cost Center code's prefix)
      let matchedPrefix = "";
      if (contractNode.ccs.size > 0) {
          const firstCC = Array.from(contractNode.ccs.keys())[0] as string;
          matchedPrefix = Object.keys(variacaoByPrefix).sort((a, b) => b.length - a.length).find(prefix => firstCC.startsWith(prefix)) || "";
      }
      
      const varData = matchedPrefix ? variacaoByPrefix[matchedPrefix] : {};
      
      contractNode.fin.variacaoTotalPA = varData.variacaoTotalPA || 0;
      contractNode.fin.variacaoTotalReal = varData.variacaoTotalReal || 0;
      contractNode.fin.variacaoDif = varData.variacaoDif || 0;
      contractNode.fin.variacaoDifPercent = varData.variacaoDifPercent || 0;
      
      const ccsArray = Array.from(contractNode.ccs.values()).map((ccNode: any) => {
        ccNode.difPA = calcDif(ccNode.realized, ccNode.pa);
        ccNode.difFC = calcDif(ccNode.realized, ccNode.forecast);
        ccNode.pctReal = calcPercent(ccNode.realized, ccNode.pa);
        
        ccNode.roles = ccNode.roles.map((r: any) => ({
          ...r,
          difPA: calcDif(r.realized, r.pa),
          difFC: calcDif(r.realized, r.forecast),
          pctReal: calcPercent(r.realized, r.pa),
        }));
        
        return ccNode;
      });
      
      contractNode.ccs = ccsArray;
      return contractNode;
    });

    if (sortConfig) {
      const { key, direction } = sortConfig;
      const sortFn = (a: any, b: any) => {
        let aVal = a[key];
        let bVal = b[key];
        if (typeof aVal === 'string') {
          return direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return direction === 'asc' ? (aVal || 0) - (bVal || 0) : (bVal || 0) - (aVal || 0);
      };
      
      result.sort(sortFn);
      
      result.forEach(contractNode => {
        contractNode.ccs.sort(sortFn);
        contractNode.ccs.forEach((ccNode: any) => {
          ccNode.roles.sort(sortFn);
        });
      });
    } else {
      result.sort((a, b) => a.key.localeCompare(b.key));
      result.forEach(contractNode => {
        contractNode.ccs.sort((a: any, b: any) => a.key.localeCompare(b.key));
        contractNode.ccs.forEach((ccNode: any) => {
          ccNode.roles.sort((a: any, b: any) => a.name.localeCompare(b.name));
        });
      });
    }

    return result;
  }, [data, sortConfig, variacaoByPrefix, financialByCC]);

  if (isLoading) { return (<div className="flex flex-col items-center justify-center h-64 text-slate-400"><div className="w-8 h-8 border-4 border-[#22c7ac] border-t-transparent rounded-full animate-spin mb-4"></div><span>Carregando dados...</span></div>); }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500">
        <p>Nenhum dado encontrado para os filtros selecionados.</p>
      </div>
    );
  }

  const SortableHeader = ({ label, sortKey, align = 'left', className = '' }: { label: string, sortKey: SortKey, align?: 'left'|'right', className?: string }) => {
    const isActive = sortConfig?.key === sortKey;
    return (
      <th 
        className={`px-4 py-3 font-bold cursor-pointer select-none transition-colors ${
          isActive ? '!bg-[#09257e] !text-white' : '!bg-[#041A71] !text-white hover:!bg-[#072280]'
        } ${className}`}
        style={{
          backgroundColor: isActive ? '#09257e' : '#041A71',
          color: '#ffffff'
        }}
        onClick={() => handleSort(sortKey)}
      >
        <div className={`flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : ''}`}>
          <span className="text-white font-bold whitespace-nowrap">{label}</span>
          {isActive ? (
            sortConfig.direction === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-[#22c7ac] shrink-0" /> : <ArrowDown className="w-3.5 h-3.5 text-[#22c7ac] shrink-0" />
          ) : (
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-300 opacity-60 group-hover:opacity-100 shrink-0" />
          )}
        </div>
      </th>
    );
  };

  return (
    <div className={`w-full overflow-x-auto rounded-xl border shadow-sm transition-colors ${
      isDark ? 'bg-[#111c33] border-slate-800' : 'bg-white border-slate-200'
    }`}>
      <table className="w-full text-sm text-left whitespace-nowrap min-w-[900px]">
        <thead className="bg-[#041A71] text-white">
          <tr className="bg-[#041A71]">
            <SortableHeader label="Contrato / Centro de Custo" sortKey="name" className="w-[340px]" />
            <th className="px-4 py-3 font-bold bg-[#041A71] text-white" style={{ backgroundColor: '#041A71', color: '#ffffff' }}>Nome do Cargo</th>
            <SortableHeader label="Total PA" sortKey="pa" align="right" className="w-24" />
            <SortableHeader label="Baseline Ajustado" sortKey="forecast" align="right" className="w-32" />
            <SortableHeader label="Total Real." sortKey="realized" align="right" className="w-24" />
            <SortableHeader label="Dif. PA" sortKey="difPA" align="right" className="w-24" />
            <SortableHeader label="Dif. Baseline" sortKey="difFC" align="right" className="w-24" />
            <SortableHeader label="% Dif. Real." sortKey="pctReal" align="right" className="w-24" />
            <th className="px-4 py-3 font-bold text-right border-l border-slate-400/30 bg-[#041A71] text-white" style={{ backgroundColor: '#041A71', color: '#ffffff' }}>Total PA (R$)</th>
            <th className="px-4 py-3 font-bold text-right bg-[#041A71] text-white" style={{ backgroundColor: '#041A71', color: '#ffffff' }}>Total Real. (R$)</th>
            <th className="px-4 py-3 font-bold text-right bg-[#041A71] text-white" style={{ backgroundColor: '#041A71', color: '#ffffff' }}>Dif. Valor Realizado</th>
            <th className="px-4 py-3 font-bold text-right bg-[#041A71] text-white" style={{ backgroundColor: '#041A71', color: '#ffffff' }}>% Dif. Valor</th>
          </tr>
        </thead>
        <tbody className={`divide-y ${isDark ? 'divide-slate-800/60 text-slate-200' : 'divide-slate-100 text-slate-700'}`}>
          {tree.map(contractNode => {
            const contractExpanded = expandedContracts.has(contractNode.key);

            return (
              <React.Fragment key={contractNode.key}>
                {/* Level 1: Contract */}
                <tr
                  className={`${isDark ? 'bg-[#131d36] hover:bg-[#182544]' : 'bg-slate-100 hover:bg-slate-200'} transition-colors cursor-pointer group relative`}
                  onClick={() => toggleContract(contractNode.key)}
                >
                  <td
                    className="px-4 py-3 relative"
                    onMouseEnter={() => handleMouseEnterContract(contractNode.key)}
                    onMouseLeave={() => handleMouseLeaveContract(contractNode.key)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className={`font-bold flex items-center gap-2 uppercase tracking-wide min-w-0 ${isDark ? 'text-white' : 'text-[#041A71]'}`}>
                        {contractExpanded
                          ? <MinusSquare className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          : <PlusSquare className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                        <span className="truncate" title={contractNode.name}>{contractNode.name}</span>
                      </div>
                      {contractNode.hasChanges && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleLockContract(contractNode.key);
                          }}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 shrink-0 transition-all ${
                            lockedContract === contractNode.key
                              ? 'bg-[#041A71] text-[#22c7ac] ring-1 ring-[#22c7ac]'
                              : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                          }`}
                          title="Clique para travar o pop-up na tela e poder rolar com o mouse"
                        >
                          <Pin className="w-2.5 h-2.5" />
                          {lockedContract === contractNode.key ? 'Travado' : 'Alterações'}
                        </button>
                      )}
                    </div>
                    <ContractTooltip
                      contractNode={contractNode}
                      isOpen={lockedContract === contractNode.key || hoveredContract === contractNode.key}
                      isLocked={lockedContract === contractNode.key}
                      onToggleLock={() => handleToggleLockContract(contractNode.key)}
                      onClose={() => {
                        setLockedContract(curr => curr === contractNode.key ? null : curr);
                        setHoveredContract(curr => curr === contractNode.key ? null : curr);
                      }}
                      onMouseEnter={() => handleMouseEnterContract(contractNode.key)}
                      onMouseLeave={() => handleMouseLeaveContract(contractNode.key)}
                    />
                  </td>
                    <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-right font-bold">{contractNode.pa ?? 0}</td>
                  <td className="px-4 py-3 text-right font-bold">{contractNode.forecast ?? 0}</td>
                  <td className="px-4 py-3 text-right font-bold">
                    <div className="flex justify-end items-center">
                      {contractNode.realized} <Indicator diff={contractNode.difPA} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-bold">
                    <div className="flex justify-end items-center">
                      {contractNode.difPA} <Indicator diff={contractNode.difPA} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-bold">
                      <div className="flex justify-end items-center">
                        {contractNode.difFC} <Indicator diff={contractNode.difFC} />
                      </div>
                    </td>
                  <td className="px-4 py-3 text-right font-bold">
                    {formatPercent(contractNode.pctReal, true)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600 font-mono font-bold border-l border-slate-200 bg-slate-200/50">{formatMoney(contractNode.fin?.variacaoTotalPA)}</td>
                  <td className="px-4 py-3 text-right text-slate-600 font-mono font-bold bg-slate-200/50">{formatMoney(contractNode.fin?.variacaoTotalReal)}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold bg-slate-200/50">
                    <div className={`flex justify-end items-center ${(contractNode.fin?.variacaoDif ?? 0) < 0 ? 'text-[#22c7ac]' : ((contractNode.fin?.variacaoDif ?? 0) > 0 ? 'text-red-600' : '')}`}>
                      {formatMoney(contractNode.fin?.variacaoDif)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-bold bg-slate-200/50">
                    <div className={`flex justify-end items-center ${(contractNode.fin?.variacaoDifPercent ?? 0) < 0 ? 'text-[#22c7ac]' : ((contractNode.fin?.variacaoDifPercent ?? 0) > 0 ? 'text-red-600' : '')}`}>
                      {formatPercent(contractNode.fin?.variacaoDifPercent, true, true)}
                    </div>
                  </td>
                </tr>

                {/* Level 2: Cost Centers */}
                {contractExpanded && contractNode.ccs.map((cc: any) => {
                  const ccExpanded = expandedCCs.has(cc.key);

                  return (
                    <React.Fragment key={cc.key}>
                      <tr
                        className={`${isDark ? 'bg-[#0f172a] hover:bg-[#16223d]' : 'bg-slate-50 hover:bg-slate-100'} transition-colors cursor-pointer`}
                        onClick={() => toggleCC(cc.key)}
                      >
                        <td className="px-4 py-3 pl-8">
                          <div className={`font-semibold flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                            {ccExpanded
                              ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                              : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                            <span className="truncate" title={cc.name}>{cc.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3"></td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-600">{cc.pa ?? 0}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-600">{cc.forecast ?? 0}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-600">
                          <div className="flex justify-end items-center">
                            {cc.realized} <Indicator diff={cc.difPA} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-600">
                          <div className="flex justify-end items-center">
                            {cc.difPA} <Indicator diff={cc.difPA} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-600">
                            <div className="flex justify-end items-center">
                              {cc.difFC} <Indicator diff={cc.difFC} />
                            </div>
                          </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-600">
                          {formatPercent(cc.pctReal, true)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-500 font-mono border-l border-slate-200 bg-slate-100/50">-</td>
                        <td className="px-4 py-3 text-right font-mono bg-slate-100/50">-</td>
                        <td className="px-4 py-3 text-right font-mono bg-slate-100/50">-</td>
                        <td className="px-4 py-3 text-right font-semibold bg-slate-100/50">-</td>
                      </tr>

                      {/* Level 3: Roles */}
                      {ccExpanded && cc.roles.map((role: any, idx: number) => {
                        return (
                          <tr
                            key={`${cc.key}_${role.id}_${idx}`}
                            className={`${isDark ? 'bg-transparent hover:bg-white/[0.04]' : 'bg-white hover:bg-slate-50'} transition-colors`}
                          >
                            <td className="px-4 py-1.5 border-l-4 border-l-transparent"></td>
                            <td className="px-4 py-1.5 text-xs font-medium text-slate-600 uppercase tracking-wide pl-6">
                              {role.name}
                            </td>
                            <td className="px-4 py-1.5 text-right text-slate-400">{role.pa ?? 0}</td>
                            <td className="px-4 py-1.5 text-right text-slate-400">{role.forecast ?? 0}</td>
                            <td className="px-4 py-1.5 text-right font-medium">
                              <div className="flex justify-end items-center">
                                {role.realized ?? 0}
                                {(role.realized > 0 || role.pa > 0) && <Indicator diff={role.difPA} />}
                              </div>
                            </td>
                            <td className="px-4 py-1.5 text-right font-medium">
                              <div className="flex justify-end items-center">
                                {role.difPA}
                                {(role.realized > 0 || role.pa > 0) && <Indicator diff={role.difPA} />}
                              </div>
                            </td>
                            <td className="px-4 py-1.5 text-right font-medium">
                                <div className="flex justify-end items-center">
                                  {role.difFC}
                                  {(role.realized > 0 || role.forecast > 0) && <Indicator diff={role.difFC} />}
                                </div>
                              </td>
                            <td className="px-4 py-1.5 text-right text-slate-400">
                              {formatPercent(role.pctReal, true)}
                            </td>
                            <td className="px-4 py-1.5 border-l border-slate-100" colSpan={4}></td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
