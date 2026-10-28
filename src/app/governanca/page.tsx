"use client";

import React, { useState, useEffect, Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { 
  ShieldCheck, Plus, CheckCircle, XCircle, Clock, AlertCircle, 
  FileText, Edit2, Trash2, FilterX, Eye, CheckSquare, Square, 
  UploadCloud, Sparkles, Check 
} from "lucide-react";
import GovernanceFormModal from "@/components/governanca/GovernanceFormModal";
import GovernanceDetailModal from "@/components/governanca/GovernanceDetailModal";
import GovernanceBulkJustifyModal from "@/components/governanca/GovernanceBulkJustifyModal";
import { useTheme } from "@/context/ThemeContext";
import ThemeToggle from "@/components/ThemeToggle";

function GovernancaContent() {
  const { isDark } = useTheme();
  const searchParams = useSearchParams();
  const paramContract = searchParams.get("contract");
  const paramCompetence = searchParams.get("competence");
  const paramRole = searchParams.get("role");
  const paramBatchId = searchParams.get("batchId");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<any>(null);
  const [detailRecord, setDetailRecord] = useState<any>(null);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Filters
  const [filterContract, setFilterContract] = useState(paramContract || "TODOS");
  const [filterCompetence, setFilterCompetence] = useState(paramCompetence || "TODOS");
  const [filterStatus, setFilterStatus] = useState("TODOS");
  const [filterEvidence, setFilterEvidence] = useState("TODOS");
  const [filterRole, setFilterRole] = useState(paramRole || "TODOS");
  const [filterOrigin, setFilterOrigin] = useState("TODOS"); // "TODOS" | "MANUAL" | "UPLOAD_FORECAST"
  const [filterJustificationStatus, setFilterJustificationStatus] = useState("TODOS"); // "TODOS" | "PENDENTE" | "JUSTIFICADO"
  const [filterBatchId, setFilterBatchId] = useState(paramBatchId || "TODOS");

  useEffect(() => {
    if (paramContract) setFilterContract(paramContract);
    if (paramCompetence) setFilterCompetence(paramCompetence);
    if (paramRole) setFilterRole(paramRole);
    if (paramBatchId) setFilterBatchId(paramBatchId);
  }, [paramContract, paramCompetence, paramRole, paramBatchId]);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/governanca');
      const data = await res.json();
      if (Array.isArray(data)) {
        setRecords(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const uniqueContracts = useMemo(() => Array.from(new Set(records.map(r => r.contract?.name).filter(Boolean))).sort(), [records]);
  const uniqueCompetences = useMemo(() => Array.from(new Set(records.map(r => r.competence).filter(Boolean))).sort(), [records]);
  const uniqueRoles = useMemo(() => Array.from(new Set(records.map(r => r.role?.title).filter(Boolean))).sort(), [records]);
  const uniqueBatches = useMemo(() => {
    const map = new Map<string, string>();
    records.forEach(r => {
      if (r.batch?.id && r.batch?.batchCode) {
        map.set(r.batch.id, r.batch.batchCode);
      }
    });
    return Array.from(map.entries()).map(([id, code]) => ({ id, code }));
  }, [records]);

  // Filtered records
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      if (filterContract !== "TODOS" && r.contract?.name !== filterContract) return false;
      if (filterCompetence !== "TODOS" && r.competence !== filterCompetence) return false;
      if (filterRole !== "TODOS" && r.role?.title !== filterRole) return false;
      if (filterStatus !== "TODOS" && r.status !== filterStatus) return false;
      if (filterOrigin !== "TODOS" && r.origin !== filterOrigin) return false;
      if (filterJustificationStatus !== "TODOS" && r.justificationStatus !== filterJustificationStatus) return false;
      if (filterBatchId !== "TODOS" && r.batchId !== filterBatchId) return false;
      if (filterEvidence !== "TODOS") {
        const hasEv = r.hasEvidence && r.evidences?.length > 0;
        if (filterEvidence === "SIM" && !hasEv) return false;
        if (filterEvidence === "NAO" && hasEv) return false;
      }
      return true;
    });
  }, [records, filterContract, filterCompetence, filterRole, filterStatus, filterOrigin, filterJustificationStatus, filterBatchId, filterEvidence]);

  // Compute KPIs based on filtered records (Item 13)
  const totalAlteracoes = filteredRecords.length;
  const alteracoesManuais = filteredRecords.filter(r => r.origin === 'MANUAL').length;
  const alteracoesUpload = filteredRecords.filter(r => r.origin === 'UPLOAD_FORECAST').length;
  const acrescimosFTE = filteredRecords.filter(r => r.type === 'ACRESCIMO').reduce((sum, r) => sum + r.movedQuantity, 0);
  const retiradasFTE = filteredRecords.filter(r => r.type === 'RETIRADA').reduce((sum, r) => sum + r.movedQuantity, 0);
  const saldoLiquido = acrescimosFTE - retiradasFTE;
  const pendentesJustificativa = filteredRecords.filter(r => r.justificationStatus === 'PENDENTE').length;
  const justificadas = filteredRecords.filter(r => r.justificationStatus === 'JUSTIFICADO' || r.justificationStatus === 'APROVADO').length;
  const semEvidencia = filteredRecords.filter(r => !r.hasEvidence || !r.evidences || r.evidences.length === 0).length;

  const handleApprove = async (id: string, status: string) => {
     try {
       await fetch(`/api/governanca/${id}/status`, {
         method: 'PATCH',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ status })
       });
       fetchRecords();
     } catch (e) {
       console.error("Erro ao atualizar status", e);
     }
  };

  const handleDelete = async (id: string) => {
     if (!confirm("Tem certeza que deseja excluir esta movimentação? Essa ação não pode ser desfeita e os saldos serão recalculados.")) return;
     try {
       await fetch(`/api/governanca/${id}`, { method: 'DELETE' });
       fetchRecords();
     } catch (e) {
       console.error("Erro ao deletar", e);
     }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredRecords.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredRecords.map(r => r.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const clearFilters = () => {
    setFilterContract("TODOS");
    setFilterCompetence("TODOS");
    setFilterStatus("TODOS");
    setFilterEvidence("TODOS");
    setFilterRole("TODOS");
    setFilterOrigin("TODOS");
    setFilterJustificationStatus("TODOS");
    setFilterBatchId("TODOS");
  };

  const hasActiveFilters = 
    filterContract !== "TODOS" ||
    filterCompetence !== "TODOS" ||
    filterStatus !== "TODOS" ||
    filterEvidence !== "TODOS" ||
    filterRole !== "TODOS" ||
    filterOrigin !== "TODOS" ||
    filterJustificationStatus !== "TODOS" ||
    filterBatchId !== "TODOS";

  return (
    <div className="p-6 md:p-8 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3 text-white">
            <ShieldCheck className="w-8 h-8 text-[#22c7ac]" />
            Governança de FTE
          </h1>
          <p className="text-slate-400 mt-1">Repositório central e trilha oficial de auditoria de alterações do Forecast</p>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle variant="pill" />
          <button 
            onClick={() => {
              setEditRecord(null);
              setIsModalOpen(true);
            }}
            className="bg-[#22c7ac] hover:bg-[#1da891] text-white px-4 py-2.5 rounded-lg font-medium transition-colors flex items-center gap-2 text-sm shadow-md"
          >
            <Plus className="w-4 h-4" />
            Nova Alteração Manual
          </button>
        </div>
      </div>

      {/* Cards Analíticos (Item 13) - Visual limpo preservado */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-[#111c33] border border-white/5 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="text-slate-400 text-xs font-medium">Saldo Líquido FTE</div>
          <div className={`text-2xl font-bold mt-1 ${saldoLiquido > 0 ? 'text-green-400' : saldoLiquido < 0 ? 'text-red-400' : 'text-white'}`}>
            {saldoLiquido > 0 ? '+' : ''}{saldoLiquido}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">+{acrescimosFTE} / -{retiradasFTE}</div>
        </div>

        <div className="bg-[#111c33] border border-white/5 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="text-slate-400 text-xs font-medium">Total de Alterações</div>
          <div className="text-2xl font-bold mt-1 text-white">{totalAlteracoes}</div>
          <div className="text-[11px] text-slate-500 mt-1">Registros de histórico</div>
        </div>

        <div className="bg-[#111c33] border border-white/5 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="text-slate-400 text-xs font-medium">Origem da Mudança</div>
          <div className="text-xl font-bold mt-1 text-slate-200">
            <span className="text-purple-400">{alteracoesManuais}</span> Man / <span className="text-emerald-400">{alteracoesUpload}</span> Up
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Manuais x Upload Massivo</div>
        </div>

        <div className="bg-[#111c33] border border-white/5 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="text-slate-400 text-xs font-medium">Pendente Justificativa</div>
          <div className={`text-2xl font-bold mt-1 ${pendentesJustificativa > 0 ? 'text-yellow-400' : 'text-slate-300'}`}>
            {pendentesJustificativa}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Exigem tratamento</div>
        </div>

        <div className="bg-[#111c33] border border-white/5 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="text-slate-400 text-xs font-medium">Justificados</div>
          <div className="text-2xl font-bold mt-1 text-green-400">{justificadas}</div>
          <div className="text-[11px] text-slate-500 mt-1">Com justificativa salva</div>
        </div>

        <div className="bg-[#111c33] border border-white/5 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="text-slate-400 text-xs font-medium">Sem Evidência</div>
          <div className={`text-2xl font-bold mt-1 ${semEvidencia > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
            {semEvidencia}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Sem documento anexo</div>
        </div>
      </div>

      {/* Tabela Principal */}
      <div className="bg-[#111c33] border border-white/5 rounded-xl shadow-lg overflow-hidden">
        {/* Barra de Filtros */}
        <div className="p-4 border-b border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-[#0a1122]">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-white">Histórico de Alterações</h2>
            <span className="text-xs text-slate-400 bg-white/5 px-2 py-0.5 rounded-full">
              {filteredRecords.length} resultado(s)
            </span>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {/* Origem Filter (Item 6) */}
            <select 
              value={filterOrigin}
              onChange={(e) => setFilterOrigin(e.target.value)}
              className="bg-[#111c33] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:border-[#22c7ac] outline-none"
            >
              <option value="TODOS">Todas as Origens</option>
              <option value="MANUAL">Manual</option>
              <option value="UPLOAD_FORECAST">Upload Massivo</option>
            </select>

            {/* Justification Status Filter (Item 7) */}
            <select 
              value={filterJustificationStatus}
              onChange={(e) => setFilterJustificationStatus(e.target.value)}
              className="bg-[#111c33] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:border-[#22c7ac] outline-none"
            >
              <option value="TODOS">Status Justificativa</option>
              <option value="PENDENTE">Pendente</option>
              <option value="JUSTIFICADO">Justificado</option>
            </select>

            <select 
              value={filterCompetence}
              onChange={(e) => setFilterCompetence(e.target.value)}
              className="bg-[#111c33] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:border-[#22c7ac] outline-none"
            >
              <option value="TODOS">Competência</option>
              {uniqueCompetences.map((c: any) => <option key={c} value={c}>{c}</option>)}
            </select>

            <select 
              value={filterContract}
              onChange={(e) => setFilterContract(e.target.value)}
              className="bg-[#111c33] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:border-[#22c7ac] outline-none max-w-[140px] truncate"
            >
              <option value="TODOS">Contrato</option>
              {uniqueContracts.map((c: any) => <option key={c} value={c}>{c}</option>)}
            </select>

            {uniqueBatches.length > 0 && (
              <select 
                value={filterBatchId}
                onChange={(e) => setFilterBatchId(e.target.value)}
                className="bg-[#111c33] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:border-[#22c7ac] outline-none font-mono"
              >
                <option value="TODOS">Lote de Importação</option>
                {uniqueBatches.map(b => <option key={b.id} value={b.id}>{b.code}</option>)}
              </select>
            )}

            <select 
              value={filterEvidence}
              onChange={(e) => setFilterEvidence(e.target.value)}
              className="bg-[#111c33] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:border-[#22c7ac] outline-none"
            >
              <option value="TODOS">Evidência</option>
              <option value="SIM">Com Evidência</option>
              <option value="NAO">Sem Evidência</option>
            </select>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="p-1.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition-colors text-xs flex items-center gap-1"
                title="Limpar Filtros"
              >
                <FilterX className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Barra de Ação em Massa (Item 9) */}
        {selectedIds.length > 0 && (
          <div className="bg-[#22c7ac]/10 border-b border-[#22c7ac]/30 px-5 py-2.5 flex items-center justify-between animate-fade-in">
            <span className="text-xs font-semibold text-[#22c7ac] flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              {selectedIds.length} alteraç{selectedIds.length > 1 ? 'ões' : 'ão'} selecionada(s)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedIds([])}
                className="text-xs text-slate-400 hover:text-white px-3 py-1"
              >
                Desmarcar
              </button>
              <button
                onClick={() => setIsBulkModalOpen(true)}
                className="bg-[#22c7ac] hover:bg-[#1db199] text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow"
              >
                <FileText className="w-3.5 h-3.5" />
                Justificar em Massa
              </button>
            </div>
          </div>
        )}
        
        {/* Tabela (Item 11) */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#0f192e] text-slate-400 uppercase text-[11px] tracking-wider">
              <tr>
                <th className="p-3 pl-4 w-8 text-center">
                  <button onClick={toggleSelectAll} className="text-slate-400 hover:text-white">
                    {selectedIds.length > 0 && selectedIds.length === filteredRecords.length ? (
                      <CheckSquare className="w-4 h-4 text-[#22c7ac]" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="p-3 font-medium">Competência</th>
                <th className="p-3 font-medium">Contrato / Centro</th>
                <th className="p-3 font-medium">Cargo</th>
                <th className="p-3 font-medium text-center">PA Original</th>
                <th className="p-3 font-medium text-center">FC Anterior</th>
                <th className="p-3 font-medium text-center">Novo FC</th>
                <th className="p-3 font-medium text-center">Variação</th>
                <th className="p-3 font-medium text-center">Origem</th>
                <th className="p-3 font-medium">Justificativa</th>
                <th className="p-3 font-medium text-center">Evidência</th>
                <th className="p-3 font-medium text-center">Status</th>
                <th className="p-3 pr-4 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr><td colSpan={13} className="px-6 py-8 text-center text-slate-400">Carregando dados da Governança...</td></tr>
              ) : filteredRecords.length === 0 ? (
                <tr><td colSpan={13} className="px-6 py-8 text-center text-slate-400">Nenhuma movimentação encontrada para os filtros selecionados.</td></tr>
              ) : (
                filteredRecords.map((r: any) => {
                  const isUpload = r.origin === 'UPLOAD_FORECAST';
                  const isSelected = selectedIds.includes(r.id);

                  return (
                    <tr 
                      key={r.id} 
                      className={`hover:bg-white/[0.02] transition-colors ${isSelected ? 'bg-[#22c7ac]/5' : ''}`}
                    >
                      {/* Checkbox */}
                      <td className="p-3 pl-4 text-center">
                        <button onClick={() => toggleSelect(r.id)} className="text-slate-400 hover:text-white">
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-[#22c7ac]" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* Competência */}
                      <td className="p-3 font-medium">{r.competence}</td>

                      {/* Contrato / Centro */}
                      <td className="p-3">
                        <div className="font-semibold text-white">{r.contract?.name || "N/A"}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{r.costCenter?.code || ""}</div>
                      </td>

                      {/* Cargo */}
                      <td className="p-3 font-medium text-slate-200">
                        {r.role?.title || "N/A"}
                        {r.isNewRole && <span className="ml-1.5 text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.2 rounded font-bold">Novo</span>}
                        {r.isRemovedRole && <span className="ml-1.5 text-[10px] bg-red-500/20 text-red-300 px-1.5 py-0.2 rounded font-bold">Excluído</span>}
                      </td>

                      {/* PA Original */}
                      <td className="p-3 text-center text-slate-400 font-mono">
                        {r.paQuantity ?? r.previousQuantity}
                      </td>

                      {/* Forecast Anterior */}
                      <td className="p-3 text-center text-slate-400 font-mono">
                        {r.previousForecastQuantity ?? r.previousQuantity}
                      </td>

                      {/* Novo Forecast */}
                      <td className="p-3 text-center font-bold text-white font-mono">
                        {r.currentForecastQuantity ?? r.finalQuantity}
                      </td>

                      {/* Variação */}
                      <td className="p-3 text-center">
                        <span className={`font-bold font-mono px-2 py-0.5 rounded ${
                          r.type === 'ACRESCIMO' ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'
                        }`}>
                          {r.type === 'ACRESCIMO' ? '+' : '-'}{r.movedQuantity}
                        </span>
                      </td>

                      {/* Origem Badge (Item 6) */}
                      <td className="p-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border ${
                          isUpload 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                            : 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                        }`}>
                          {isUpload ? 'Upload' : 'Manual'}
                        </span>
                      </td>

                      {/* Justificativa */}
                      <td className="p-3 max-w-[200px]">
                        <div className="truncate text-slate-300" title={r.justification}>
                          {r.justification}
                        </div>
                        {r.batch?.batchCode && (
                          <div className="text-[10px] font-mono text-slate-500 truncate" title={`Lote: ${r.batch.batchCode}`}>
                            Lote: {r.batch.batchCode}
                          </div>
                        )}
                      </td>

                      {/* Evidência */}
                      <td className="p-3 text-center">
                        {r.hasEvidence && r.evidences?.length > 0 ? (
                          <a 
                            href={r.evidences[0].filePath} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="inline-flex items-center gap-1 text-[#22c7ac] hover:underline font-medium" 
                            title={r.evidences[0].fileName}
                          >
                            <FileText className="w-3.5 h-3.5" /> Sim
                          </a>
                        ) : (
                          <span className="text-slate-500">Não</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="p-3 text-center">
                        {r.justificationStatus === 'PENDENTE' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-400/10 text-yellow-400 border border-yellow-400/20">
                            <Clock className="w-3 h-3"/> Pendente
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-400/10 text-green-400 border border-green-400/20">
                            <CheckCircle className="w-3 h-3"/> Justificado
                          </span>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="p-3 pr-4 text-right space-x-1.5 whitespace-nowrap">
                        {/* Ver Detalhes (Item 22) */}
                        <button 
                          onClick={() => setDetailRecord(r)} 
                          className="p-1 hover:bg-white/10 text-slate-300 hover:text-white rounded" 
                          title="Ver Detalhamento / Auditoria"
                        >
                          <Eye className="w-4 h-4 inline-block"/>
                        </button>

                        <button 
                          onClick={() => { setEditRecord(r); setIsModalOpen(true); }} 
                          className="p-1 hover:bg-white/10 text-blue-400 hover:text-blue-300 rounded" 
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4 inline-block"/>
                        </button>
                        <button 
                          onClick={() => handleDelete(r.id)} 
                          className="p-1 hover:bg-white/10 text-red-400 hover:text-red-300 rounded" 
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4 inline-block"/>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Criação / Edição Individual */}
      <GovernanceFormModal 
        isOpen={isModalOpen} 
        editRecord={editRecord}
        onClose={() => setIsModalOpen(false)} 
        onSuccess={() => {
          setIsModalOpen(false);
          setEditRecord(null);
          fetchRecords();
        }}
      />

      {/* Modal de Detalhamento / Trilha de Auditoria (Item 22) */}
      <GovernanceDetailModal
        isOpen={!!detailRecord}
        record={detailRecord}
        onClose={() => setDetailRecord(null)}
        onUpdate={() => {
          setDetailRecord(null);
          fetchRecords();
        }}
      />

      {/* Modal de Justificação em Massa (Item 9) */}
      <GovernanceBulkJustifyModal
        isOpen={isBulkModalOpen}
        selectedIds={selectedIds}
        onClose={() => setIsBulkModalOpen(false)}
        onSuccess={() => {
          setIsBulkModalOpen(false);
          setSelectedIds([]);
          fetchRecords();
        }}
      />
    </div>
  );
}

export default function GovernancaPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-400">Carregando Governança...</div>}>
      <GovernancaContent />
    </Suspense>
  );
}
