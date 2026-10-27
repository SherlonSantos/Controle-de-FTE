"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Database, FileSpreadsheet, UploadCloud, Download, TerminalSquare, Loader2, Search, TableProperties, ChevronDown, ChevronRight, Plus, Check, X, Save, Trash2, ShieldCheck, ArrowRight, CheckCircle2 } from "lucide-react";
import MultiSelect from "@/components/MultiSelect";
import Papa from "papaparse";
import * as XLSX from "xlsx";

export default function ImportacaoPage() {
  const [activeTab, setActiveTab] = useState("importacao");
  const [importType, setImportType] = useState("ativos");
  const [competence, setCompetence] = useState("");
  const [file, setFile] = useState<File | null>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>(["$ Aguardando arquivo para processamento..."]);
  const [forecastSummary, setForecastSummary] = useState<any | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Consolidated View State
  const [filterCompetence, setFilterCompetence] = useState("07/2026");
  const [filterCostCenter, setFilterCostCenter] = useState("");
  const [summaryData, setSummaryData] = useState<any[]>([]);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  
  // CC x Contrato State
  const [desmobData, setDesmobData] = useState<any[]>([]);
  const [desmobLoading, setDesmobLoading] = useState(false);
  
  const [ccSearch, setCcSearch] = useState("");
  const [editingCcId, setEditingCcId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ description: "", contractName: "" });
  const [showNewCcForm, setShowNewCcForm] = useState(false);
  const [newCcForm, setNewCcForm] = useState({ code: "", description: "", contractName: "" });
  const [selectedCcIds, setSelectedCcIds] = useState<string[]>([]);

  const [ccContratoData, setCcContratoData] = useState<any[]>([]);
  const [isLoadingCcContrato, setIsLoadingCcContrato] = useState(false);

  // Categorization State
  const [categorizationData, setCategorizationData] = useState<any[]>([]);
  const [categorizationChanges, setCategorizationChanges] = useState<Map<string, {contractType: string, type: string}>>(new Map());
  const [isSavingCategorization, setIsSavingCategorization] = useState(false);
  const [isLoadingCategorization, setIsLoadingCategorization] = useState(false);
  const [selectedCCs, setSelectedCCs] = useState<Set<string>>(new Set());
  const [categorizationFilterCCs, setCategorizationFilterCCs] = useState<string[]>([]);
  
  const [availableStatuses, setAvailableStatuses] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (code: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleStatus = (status: string) => {
    setSelectedStatuses(prev => {
      if (prev.includes(status)) return prev.filter(s => s !== status);
      return [...prev, status];
    });
  };

  const [newRoleForm, setNewRoleForm] = useState<{ccId: string, roleTitle: string} | null>(null);
  const [pendingForecastChanges, setPendingForecastChanges] = useState<Map<string, {costCenterId: string, roleId: string, monthIndex: number, value: number}>>(new Map());
  const [pendingForecastDeletions, setPendingForecastDeletions] = useState<Map<string, {costCenterId: string, roleId: string}>>(new Map());
  const [isSavingForecast, setIsSavingForecast] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleForecastUpdate = (ccId: string, roleId: string, mIdx: number, val: number) => {
    const key = `${ccId}_${roleId}`;
    setSummaryData(prev => prev.map(item => {
      if (item.id === key && item.months) {
        const newMonths = [...item.months];
        newMonths[mIdx] = val;
        return { ...item, months: newMonths };
      }
      return item;
    }));
    // Queue the change instead of saving immediately
    const changeKey = `${ccId}_${roleId}_${mIdx}`;
    setPendingForecastChanges(prev => {
      const next = new Map(prev);
      next.set(changeKey, { costCenterId: ccId, roleId, monthIndex: mIdx, value: val });
      return next;
    });
    setSaveSuccess(false);
  };

  const handleForecastDelete = (ccId: string, roleId: string) => {
    const key = `${ccId}_${roleId}`;
    setSummaryData(prev => prev.filter(item => item.id !== key));
    
    setPendingForecastChanges(prev => {
      const next = new Map(prev);
      for (const [k, v] of next.entries()) {
        if (v.costCenterId === ccId && v.roleId === roleId) {
          next.delete(k);
        }
      }
      return next;
    });

    setPendingForecastDeletions(prev => {
      const next = new Map(prev);
      next.set(key, { costCenterId: ccId, roleId });
      return next;
    });
    setSaveSuccess(false);
  };

  const handleSaveForecast = async () => {
    if (pendingForecastChanges.size === 0 && pendingForecastDeletions.size === 0) return;
    setIsSavingForecast(true);
    try {
      const promises = Array.from(pendingForecastChanges.values()).map(change =>
        fetch('/api/forecast/update', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            year: filterCompetence,
            costCenterId: change.costCenterId,
            roleId: change.roleId,
            monthIndex: change.monthIndex,
            value: change.value
          })
        })
      );
      const deletePromises = Array.from(pendingForecastDeletions.values()).map(del =>
        fetch('/api/forecast/update', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            year: filterCompetence,
            costCenterId: del.costCenterId,
            roleId: del.roleId
          })
        })
      );
      await Promise.all([...promises, ...deletePromises]);
      setPendingForecastChanges(new Map());
      setPendingForecastDeletions(new Map());
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Save forecast error:', err);
    } finally {
      setIsSavingForecast(false);
    }
  };

  const handleAddRoleSubmit = async (e: React.FormEvent, ccId: string) => {
    e.preventDefault();
    if (!newRoleForm || !newRoleForm.roleTitle.trim()) return;

    try {
      const res = await fetch('/api/forecast/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: filterCompetence,
          costCenterId: ccId,
          roleTitle: newRoleForm.roleTitle.toUpperCase()
        })
      });
      const data = await res.json();
      if (data.success) {
        setNewRoleForm(null);
        setIsLoadingSummary(true);
        const res2 = await fetch(`/api/forecast/summary?competence=${filterCompetence}`);
        const data2 = await res2.json();
        setSummaryData(data2.summary || []);
        setIsLoadingSummary(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if ((activeTab === "consolidado" || activeTab === "pa" || activeTab === "forecast" || activeTab === "financeiro" || activeTab === "variacao") && filterCompetence) {
      setIsLoadingSummary(true);
      if (activeTab === "consolidado") {
        const statusesQuery = selectedStatuses.length > 0 ? `&statuses=${encodeURIComponent(selectedStatuses.join(','))}` : '';
        fetch(`/api/ativos/summary?competence=${filterCompetence}${statusesQuery}`)
          .then(res => res.json())
          .then(data => {
            if (data.summary) setSummaryData(data.summary);
            else setSummaryData([]);
            if (data.availableStatuses) setAvailableStatuses(data.availableStatuses);
          })
          .catch(err => {
            console.error(err);
            setSummaryData([]);
          })
          .finally(() => setIsLoadingSummary(false));
      } else if (activeTab === "pa") {
        fetch(`/api/pa/summary?competence=${filterCompetence}`)
          .then(res => res.json())
          .then(data => {
            if (data.summary) setSummaryData(data.summary);
            else setSummaryData([]);
            setAvailableStatuses([]);
          })
          .catch(err => {
            console.error(err);
            setSummaryData([]);
          })
          .finally(() => setIsLoadingSummary(false));
      } else if (activeTab === "forecast") {
        fetch(`/api/forecast/summary?competence=${filterCompetence}`)
          .then(res => res.json())
          .then(data => {
            if (data.summary) setSummaryData(data.summary);
            else setSummaryData([]);
            setAvailableStatuses([]);
          })
          .catch(err => {
            console.error(err);
            setSummaryData([]);
          })
          .finally(() => setIsLoadingSummary(false));
      } else if (activeTab === "financeiro") {
        fetch(`/api/financial/summary?competence=${filterCompetence}`)
          .then(res => res.json())
          .then(data => {
            if (data.summary) setSummaryData(data.summary);
            else setSummaryData([]);
            setAvailableStatuses([]);
          })
          .catch(err => {
            console.error(err);
            setSummaryData([]);
          })
          .finally(() => setIsLoadingSummary(false));
      } else if (activeTab === "variacao") {
        fetch(`/api/variacao/summary?competence=${filterCompetence}`)
          .then(res => res.json())
          .then(data => {
            if (data.summary) setSummaryData(data.summary);
            else setSummaryData([]);
            setAvailableStatuses([]);
          })
          .catch(err => {
            console.error(err);
            setSummaryData([]);
          })
          .finally(() => setIsLoadingSummary(false));
      }
    } else if (activeTab === "categorizacao") {
      setIsLoadingCategorization(true);
      fetch('/api/costcenter/categorize')
        .then(res => res.json())
        .then(data => setCategorizationData(data))
        .catch(err => console.error(err))
        .finally(() => setIsLoadingCategorization(false));
    } else if (activeTab === "desmobilizacao") {
      setDesmobLoading(true);
      fetch('/api/contract/demobilize')
        .then(res => res.json())
        .then(data => setDesmobData(data))
        .catch(console.error)
        .finally(() => setDesmobLoading(false));
    }
    
    if (activeTab === "cc_contrato_view") {
      fetchCcContrato();
    }
  }, [activeTab, filterCompetence, selectedStatuses]);

  
  
  const fetchCcContrato = async () => {
    setIsLoadingCcContrato(true);
    try {
      const res = await fetch('/api/costcenter/all');
      const data = await res.json();
      setCcContratoData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingCcContrato(false);
    }
  };

  const handleEditCcStart = (cc: any) => {
    setEditingCcId(cc.id);
    setEditForm({ description: cc.description || "", contractName: cc.contractName || "" });
  };

  const handleEditCcSave = async (id: string) => {
    try {
      const res = await fetch('/api/costcenter/manage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...editForm })
      });
      if (res.ok) {
        setEditingCcId(null);
        fetchCcContrato();
      } else {
        const error = await res.json();
        alert("Erro: " + error.error);
      }
    } catch (e) {
      console.error(e);
      alert("Erro inesperado ao salvar.");
    }
  };

  
  
  
  


  const handleExportExcel = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    let exportData: any[] = [];
    let filename = "exportacao.xlsx";

    if (activeTab === "cc_contrato_view") {
      exportData = ccContratoData.map(cc => ({
        "Código CC": cc.code,
        "Descrição": cc.description,
        "Contrato Mapeado": cc.contractName
      }));
      filename = "CC_x_Contrato.xlsx";
    } else if (activeTab === "desmobilizacao") {
      exportData = desmobData.map(d => ({
        "Contrato": d.name,
        "Data de Desmobilização": d.demobilizationDate ? new Date(d.demobilizationDate).toLocaleDateString('pt-BR', {month: '2-digit', year: 'numeric'}) : "Ativo"
      }));
      filename = "Desmobilizacao.xlsx";
    } else if (activeTab === "categorizacao") {
      exportData = categorizationData.map(c => ({
        "Código CC": c.code,
        "Descrição": c.description,
        "Contrato Mapeado": c.contractName,
        "Categorização Atual": c.type || "NÃO INFORMADO"
      }));
      filename = "Categorizacao_CC.xlsx";
    } else if (activeTab === "financeiro") {
      exportData = matrixData.map(row => ({
        "Código": row.costCenterCode,
        "Descrição Completa": row.costCenterDesc,
        "Contrato": row.contractType || '-',
        "Tipo": row.type || 'Custo',
        "Conta Contábil": row.metric,
        "Cenário": row.scenario,
        "Competência": row.competence,
        "Valor": Number(row.value) || 0
      }));
      filename = "Base_Financeira.xlsx";
    } else if (activeTab === "variacao") {
      summaryData.forEach((row: any) => {
        exportData.push({
          "Grupo": row.isOverhead ? "Custos Indiretos" : "Contratos Operacionais",
          "Contrato / Centro de Custo": row.contractName || row.name,
          "Código CC": row.contractName ? row.contractName.split('-')[0].replace(/\./g, '').trim() : '',
          "Centro de Custo": row.costCenter?.description || '-',
          "FTE (PA)": row.ftePa,
          "Valor (PA)": row.valPa,
          "FTE (Real)": row.fteReal,
          "Valor (Real)": row.valReal,
          "FTE (Var)": row.fteVar,
          "Valor (Var)": row.valVar
        });
      });
      filename = "Base_Variacao.xlsx";
    } else if (activeTab === "consolidado" || activeTab === "pa" || activeTab === "forecast") {
      matrixData.forEach(row => {
        row.roles.forEach((r: any) => {
          const obj: any = {
            "Código CC": row.code,
            "Descrição": row.desc,
            "Contrato": row.contractType,
            "Cargo": r.title
          };
          const months = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
          months.forEach((m, idx) => {
            obj[m] = activeTab === "consolidado" ? (r.months?.[idx] || 0) : (r.months?.[idx] || 0);
          });
          obj["Qtd/Valor Total"] = activeTab === "consolidado" ? r.headcount : r.months?.reduce((a: number,b: number) => a+b, 0);
          exportData.push(obj);
        });
      });
      filename = `Base_${activeTab}.xlsx`;
    }

    
    if (exportData.length === 0) {
      alert("Nenhum dado para exportar.");
      return;
    }

    try {
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
      XLSX.writeFile(workbook, filename);
    } catch (err: any) {
      console.error(err);
      alert("Erro ao exportar: " + err.message);
    }
  };

  const handleBulkDeleteCc = async () => {
    if (selectedCcIds.length === 0) return;
    if (!confirm(`Tem certeza que deseja excluir ${selectedCcIds.length} Centro(s) de Custo(s)?`)) return;
    try {
      const res = await fetch('/api/costcenter/manage', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedCcIds })
      });
      if (res.ok) {
        setSelectedCcIds([]);
        fetchCcContrato();
      } else {
        const error = await res.json();
        alert("Erro: " + error.error);
      }
    } catch (e) {
      console.error(e);
      alert("Erro inesperado ao excluir em massa.");
    }
  };

  const handleDeleteCc = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este Centro de Custo?")) return;
    try {
      const res = await fetch(`/api/costcenter/manage?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchCcContrato();
      } else {
        const error = await res.json();
        alert("Erro: " + error.error);
      }
    } catch (e) {
      console.error(e);
      alert("Erro inesperado ao excluir.");
    }
  };

  const handleNewCcSave = async () => {
    if (!newCcForm.code || !newCcForm.contractName) {
      alert("Código e Contrato são obrigatórios.");
      return;
    }
    try {
      const res = await fetch('/api/costcenter/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCcForm)
      });
      if (res.ok) {
        setShowNewCcForm(false);
        setNewCcForm({ code: "", description: "", contractName: "" });
        fetchCcContrato();
      } else {
        const error = await res.json();
        alert("Erro: " + error.error);
      }
    } catch (e) {
      console.error(e);
      alert("Erro inesperado ao criar.");
    }
  };

  const handleDesmobUpdate = async (contractId: string, dateStr: string) => {
    try {
      let dDate = null;
      if (dateStr) {
        const [yyyy, mm] = dateStr.split('-');
        dDate = new Date(parseInt(yyyy, 10), parseInt(mm, 10) - 1, 1).toISOString();
      }
      
      const res = await fetch('/api/contract/demobilize', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId, demobilizationDate: dDate })
      });
      if (res.ok) {
        const data = await fetch('/api/contract/demobilize').then(r => r.json());
        setDesmobData(data);
      }
    } catch(err) {
      console.error(err);
    }
  };

  const handleSaveCategorization = async () => {
    if (categorizationChanges.size === 0) return;
    setIsSavingCategorization(true);
    try {
      const updates = Array.from(categorizationChanges.entries()).map(([id, changes]) => ({
        id,
        ...changes
      }));
      await fetch('/api/costcenter/categorize', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates })
      });
      setCategorizationChanges(new Map());
      setSelectedCCs(new Set());
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      
      // Refresh data
      const res = await fetch('/api/costcenter/categorize');
      const data = await res.json();
      setCategorizationData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingCategorization(false);
    }
  };

  const matrixData = React.useMemo(() => {
    const map = new Map<string, any>();
    
    const lowerFilter = filterCostCenter.toLowerCase();
    const filteredData = summaryData.filter(item => {
      const code = item.costCenterCode || item.contractName || '';
      const desc = item.costCenterDesc || item.costCenter?.description || '';
      const normalizedCode = code.split('-')[0].replace(/\./g, '').trim();
      
      return !filterCostCenter || 
        code.toLowerCase().includes(lowerFilter) || 
        desc.toLowerCase().includes(lowerFilter) ||
        normalizedCode.toLowerCase().includes(lowerFilter)
    });

    if (activeTab === "financeiro" || activeTab === "variacao") {
      return filteredData;
    }

    filteredData.forEach(item => {
      if (!map.has(item.costCenterCode)) {
        map.set(item.costCenterCode, {
          id: item.costCenterId,
          code: item.costCenterCode,
          desc: item.costCenterDesc,
            contractType: item.contractType,
          totalHeadcount: 0,
          totalMonths: [0,0,0,0,0,0,0,0,0,0,0,0],
          roles: []
        });
      }
      const cc = map.get(item.costCenterCode);
      if (item.headcount !== undefined) {
         cc.totalHeadcount += item.headcount;
      }
      if (item.months !== undefined) {
         for(let i=0; i<12; i++) cc.totalMonths[i] += item.months[i];
      }
      cc.roles.push({
        id: item.id,
        roleId: item.roleId,
        title: item.roleTitle || (item.metric ? `${item.metric} - ${item.scenario}` : ''),
        headcount: item.headcount,
        months: item.months
      });
    });
    return Array.from(map.values()).sort((a,b) => a.code.localeCompare(b.code));
  }, [summaryData, filterCostCenter]);

  const filteredCategorizationData = React.useMemo(() => {
    return categorizationData.filter(cc => 
      categorizationFilterCCs.length === 0 || categorizationFilterCCs.includes(cc.id)
    );
  }, [categorizationData, categorizationFilterCCs]);

  const totalGeral = React.useMemo(() => {
    return matrixData.reduce((acc, row) => acc + (row.totalHeadcount || 0), 0);
  }, [matrixData]);

  const totalGeralMonths = React.useMemo(() => {
    const t = [0,0,0,0,0,0,0,0,0,0,0,0];
    matrixData.forEach(row => {
       if (row.totalMonths) {
          for(let i=0; i<12; i++) t[i] += row.totalMonths[i];
       }
    });
    return t;
  }, [matrixData]);

  const addLog = (msg: string) => {
    setLogs((prev) => {
      const newLogs = [...prev, `$ ${msg}`];
      setTimeout(() => {
        if (terminalRef.current) {
          terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
      }, 50);
      return newLogs;
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      addLog(`Arquivo selecionado: ${selected.name} (${(selected.size / 1024 / 1024).toFixed(2)} MB)`);
      
      // Attempt to auto-fill competence if pattern matches Lista_Ativos_MM.YYYY
      const match = selected.name.match(/(\d{2})\.(\d{4})/);
      if (match) {
        setCompetence(`${match[1]}/${match[2]}`);
        addLog(`Competência detectada automaticamente: ${match[1]}/${match[2]}`);
      }
    }
  };

  const handleImport = async () => {
    if (!file) {
      alert("Por favor, selecione um arquivo primeiro.");
      return;
    }
    if (!competence) {
      alert("Por favor, preencha a competência (MM/YYYY).");
      return;
    }

    setIsProcessing(true);
    addLog(`Iniciando importação de ${importType === 'ativos' ? 'Lista de Ativos' : (importType === 'pa' ? 'Base do PA' : (importType === 'forecast' ? 'Base Forecast' : (importType === 'financeiro' ? 'Base Financeira' : 'Base de Variação FTE')))} para ${competence}...`);
    addLog("Registrando histórico de importação no banco de dados...");
    
    const getBaseTypeEnum = () => {
        if (importType === 'ativos') return 'ATIVOS';
        if (importType === 'pa') return 'PA';
        if (importType === 'forecast') return 'FORECAST';
        if (importType === 'financeiro') return 'FINANCEIRO';
        if (importType === 'variacao') return 'VARIACAO';
        if (importType === 'cc_contrato') return 'CC_CONTRATO';
        return 'ATIVOS';
    };

    try {
      setForecastSummary(null);
      const resInit = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'createHistory', 
          baseType: getBaseTypeEnum(), 
          competence,
          fileName: file?.name
        })
      });
      const dataInit = await resInit.json();
      if (dataInit.error) throw new Error(dataInit.error);
      
      const importId = dataInit.id;
      const importBatchId = dataInit.batchId;
      const importBatchCode = dataInit.batchCode;
      const importVersionId = dataInit.versionId;

      addLog(`ID de Importação gerado: ${importId}`);
      if (importBatchCode) {
        addLog(`🏷️ Lote de Governança criado: ${importBatchCode}`);
      }
      
      const processJsonData = async (data: any[]) => {
        let finalData = data;

        if (importType === 'ativos') {
          // Deduplicate by Matrícula: when the same employee appears multiple times
          // in the same file (e.g., once as "Atividade Normal" and once as "Rescisão"),
          // we prioritize the ACTIVE status so the employee is correctly counted as productive.
          // Status priority: Atividade Normal > Afastamento > Férias > Rescisão
          const statusPriority: Record<string, number> = {
            'Atividade Normal': 4,
            'Afastamento': 3,
            'Férias': 2,
            'Rescisão': 1,
          };
          const dedupMap = new Map<string, any>();
          let duplicatesFound = 0;
          data.forEach(row => {
            const reg = String(row['Matrícula'] || '').trim();
            if (!reg) return;
            const status = row['Tipo de Situação'] || 'Ativo';
            if (!dedupMap.has(reg)) {
              dedupMap.set(reg, row);
            } else {
              duplicatesFound++;
              const existing = dedupMap.get(reg);
              const existingPriority = statusPriority[existing['Tipo de Situação']] ?? 0;
              const newPriority = statusPriority[status] ?? 0;
              // Keep the row with the higher-priority (more active) status
              if (newPriority > existingPriority) {
                dedupMap.set(reg, row);
              }
            }
          });
          finalData = Array.from(dedupMap.values());
          if (duplicatesFound > 0) {
            addLog(`⚠️ ${duplicatesFound} linha(s) duplicada(s) encontrada(s) e resolvidas por prioridade de situação.`);
          }
        }

        if (importType === 'pa' || importType === 'forecast') {
          addLog("Agregando cargos repetidos no mesmo centro de custo...");
          const map = new Map<string, any>();
          data.forEach(row => {
            const roleTitle = row['Descrição Cargo'] || row['Cargo'] || 'NÃO INFORMADO';
            const ccCode = String(row['Código CC'] || row['Código do Centro de Custo'] || '999999').trim();
            const key = `${ccCode}_${roleTitle}`;
            if (!map.has(key)) {
              map.set(key, { ...row });
            } else {
              const existing = map.get(key);
              const months = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
              months.forEach(m => {
                const val = parseFloat(row[m]);
                if (!isNaN(val)) {
                  existing[m] = (parseFloat(existing[m]) || 0) + val;
                }
              });
            }
          });
          finalData = Array.from(map.values());
        }
        
        addLog(`Leitura concluída. ${finalData.length} registros únicos preparados para envio.`);
        addLog("Iniciando envio em lotes (500 registros/lote) para o servidor...");
        
        const batchSize = 500;
        let validRecords = 0;
        let errorRecords = 0;

        for (let i = 0; i < finalData.length; i += batchSize) {
          const batch = finalData.slice(i, i + batchSize);
          addLog(`Enviando lote ${Math.floor(i/batchSize) + 1} de ${Math.ceil(finalData.length/batchSize)}...`);
          
          const resBatch = await fetch('/api/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              action: 'processBatch', 
              baseType: getBaseTypeEnum(), 
              importId, 
              competence, 
              batch,
              versionId: importVersionId 
            })
          });
          const res = await resBatch.json();
          if (res.success && res.count !== undefined) {
            validRecords += res.count;
          } else {
            errorRecords += batch.length;
            addLog(`Erro no lote ${Math.floor(i/batchSize) + 1}: ${res.error}`);
          }
        }

        addLog("Finalizando importação e calculando conciliação com Governança...");
        const resFinish = await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'finishImport', 
            importId, 
            validRecords, 
            errorRecords,
            batchId: importBatchId,
            versionId: importVersionId
          })
        });
        const finishData = await resFinish.json();
        
        addLog(`Importação CONCLUÍDA com sucesso!`);
        addLog(`✅ Registros válidos inseridos/atualizados: ${validRecords}`);

        if (finishData.diffSummary) {
          setForecastSummary(finishData.diffSummary);
          addLog(`📊 Conciliação Forecast concluída: ${finishData.diffSummary.diffCount} alterações identificadas.`);
        }
        
        setIsProcessing(false);
        setFile(null);
      };

      if (importType === 'ativos') {
        addLog("Lendo arquivo no navegador (Client-side PapaParse)...");
        const reader = new FileReader();
        reader.onload = async (e) => {
          const text = e.target?.result as string;
          const lines = text.split(/\r?\n/);
          let csvContent = text;
          if (lines.length > 0 && lines[0].includes('Colaboradores')) {
             lines.shift();
             csvContent = lines.join('\n');
          }
          Papa.parse(csvContent, {
            header: true,
            delimiter: ";",
            skipEmptyLines: true,
            complete: async (results: any) => {
              await processJsonData(results.data);
            },
            error: (error: any) => {
              addLog(`❌ Erro no parsing do CSV: ${error.message}`);
              setIsProcessing(false);
            }
          });
        };
        reader.readAsText(file, 'ISO-8859-1');
      } else {
        addLog("Lendo arquivo no navegador (Client-side XLSX)...");
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            if (importType === 'financeiro') {
              addLog("Realizando transposição (unpivot) das abas Receita e Custos...");
              const outData: any[] = [];
              
              ['Receita', 'Custos'].forEach(sheetName => {
                if (!workbook.Sheets[sheetName]) {
                  addLog(`⚠️ Aba '${sheetName}' não encontrada na planilha.`);
                  return;
                }
                const ws = workbook.Sheets[sheetName];
                const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
                
                if (rawData.length > 2) {
                  const scenarios = rawData[0];
                  const dates = rawData[1];
                  for (let r = 2; r < rawData.length; r++) {
                    const row = rawData[r];
                    if (!row || !row[0]) continue;
                    const costCenter = String(row[0]);
                    const metric = String(row[1] || 'NÃO INFORMADO');
                    for (let c = 2; c < row.length; c++) {
                      if (row[c] !== undefined && row[c] !== null && row[c] !== '') {
                        let scenario = scenarios[c];
                        if (!scenario) scenario = 'NÃO INFORMADO';
                        if (String(scenario).toUpperCase().includes('PA')) scenario = 'PA';
                        else if (String(scenario).toUpperCase().includes('REALIZADO')) scenario = 'Realizado';
                        else scenario = String(scenario).trim();
                        
                        const dateCode = dates[c];
                        let compStr = '01/1900';
                        if (typeof dateCode === 'number') {
                          const date = new Date(Math.round((dateCode - 25569) * 86400 * 1000));
                          const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
                          const yyyy = date.getUTCFullYear();
                          compStr = `${mm}/${yyyy}`;
                        } else if (typeof dateCode === 'string') {
                           compStr = dateCode;
                        }
                        
                        outData.push({
                          costCenter,
                          type: sheetName === 'Receita' ? 'Receita' : 'Custo',
                          metric,
                          scenario,
                          competence: compStr,
                          value: Number(row[c])
                        });
                      }
                    }
                  }
                }
              });
              await processJsonData(outData);
            } else if (importType === 'variacao') {
              addLog("Realizando leitura da base de variação...");
              const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
              const outData = [];
              if (rawData.length > 10) {
                 let pastTotalContratos = false;
                 for (let r = 10; r < rawData.length; r++) {
                   const row = rawData[r];
                   if (!row || !row[1]) continue;
                   const contractName = String(row[1]).trim();
                   if (!contractName || contractName.toUpperCase().includes('CONSOLIDADO')) continue;
                   
                   if (contractName.toUpperCase().includes('TOTAL DOS CONTRATOS')) {
                     pastTotalContratos = true;
                     continue;
                   }
                   if (contractName.toUpperCase().includes('TOTAL OVERHEAD')) {
                     continue;
                   }

                   outData.push({
                     contractName,
                     competence: competence,
                     ftePa: Number(row[5]) || 0,
                     valPa: Number(row[6]) || 0,
                     fteReal: Number(row[7]) || 0,
                     valReal: Number(row[8]) || 0,
                     fteVar: Number(row[10]) || 0,
                     valVar: Number(row[12]) || 0,
                     isOverhead: pastTotalContratos
                   });
                 }
              }
              await processJsonData(outData);
            } else {
              const json = XLSX.utils.sheet_to_json(worksheet); await processJsonData(json);
            }
          } catch (error: any) {
            addLog(`❌ Erro no parsing do XLSX: ${error.message}`);
            setIsProcessing(false);
          }
        };
        reader.readAsArrayBuffer(file);
      }
      
    } catch (error: any) {
      addLog(`❌ Falha crítica: ${error.message}`);
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-transparent">
      <header className="bg-[#111c33] h-16 flex items-center px-8 border-b border-white/5 shadow-sm z-10">
        <h1 className="text-xl font-bold text-white">Administração do Sistema</h1>
      </header>

      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-6xl mx-auto space-y-8">
          
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#22c7ac]/10 text-[#22c7ac] flex items-center justify-center shrink-0">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Administração e Importação</h2>
              <p className="text-slate-400 mt-1">Faça o upload das bases mensais e gerencie as configurações do sistema de FTEs.</p>
            </div>
          </div>

          <div className="border-b border-white/10">
            <nav className="flex space-x-8">
              <button 
                onClick={() => setActiveTab("importacao")}
                className={`pb-4 text-sm font-bold border-b-2 transition-colors ${activeTab === "importacao" ? "border-[#22c7ac] text-[#22c7ac]" : "border-transparent text-slate-500 hover:text-slate-300"}`}
              >
                <div className="flex items-center gap-2"><UploadCloud className="w-4 h-4"/> Upload de Bases</div>
              </button>
              <button 
                onClick={() => setActiveTab("consolidado")}
                className={`pb-4 text-sm font-bold border-b-2 transition-colors ${activeTab === "consolidado" ? "border-[#22c7ac] text-[#22c7ac]" : "border-transparent text-slate-500 hover:text-slate-300"}`}
              >
                <div className="flex items-center gap-2"><TableProperties className="w-4 h-4"/> Base Consolidada</div>
              </button>
              <button 
                onClick={() => setActiveTab("pa")}
                className={`pb-4 text-sm font-bold border-b-2 transition-colors ${activeTab === "pa" ? "border-[#22c7ac] text-[#22c7ac]" : "border-transparent text-slate-500 hover:text-slate-300"}`}
              >
                <div className="flex items-center gap-2"><TableProperties className="w-4 h-4"/> Base PA</div>
              </button>
              <button 
                onClick={() => setActiveTab("forecast")}
                className={`pb-4 text-sm font-bold border-b-2 transition-colors ${activeTab === "forecast" ? "border-[#22c7ac] text-[#22c7ac]" : "border-transparent text-slate-500 hover:text-slate-300"}`}
              >
                <div className="flex items-center gap-2"><TerminalSquare className="w-4 h-4"/> Base Forecast</div>
              </button>
              <button 
                onClick={() => setActiveTab("financeiro")}
                className={`pb-4 text-sm font-bold border-b-2 transition-colors ${activeTab === "financeiro" ? "border-[#22c7ac] text-[#22c7ac]" : "border-transparent text-slate-500 hover:text-slate-300"}`}
              >
                <div className="flex items-center gap-2"><TableProperties className="w-4 h-4"/> Base Financeira</div>
              </button>
              <button 
                onClick={() => setActiveTab("variacao")}
                className={`pb-4 text-sm font-bold border-b-2 transition-colors ${activeTab === "variacao" ? "border-[#22c7ac] text-[#22c7ac]" : "border-transparent text-slate-500 hover:text-slate-300"}`}
              >
                <div className="flex items-center gap-2"><TableProperties className="w-4 h-4"/> Base Variação FTE</div>
              </button>
              <button 
                onClick={() => setActiveTab("categorizacao")}
                className={`pb-4 text-sm font-bold border-b-2 transition-colors ${activeTab === "categorizacao" ? "border-[#22c7ac] text-[#22c7ac]" : "border-transparent text-slate-500 hover:text-slate-300"}`}
              >
                <div className="flex items-center gap-2"><TableProperties className="w-4 h-4"/> Categorização CC</div>
              </button>
              <button 
                onClick={() => setActiveTab("cc_contrato_view")}
                className={`pb-4 text-sm font-bold border-b-2 transition-colors ${activeTab === "cc_contrato_view" ? "border-[#22c7ac] text-[#22c7ac]" : "border-transparent text-slate-500 hover:text-slate-300"}`}
              >
                <div className="flex items-center gap-2"><TableProperties className="w-4 h-4"/> CC x Contrato</div>
              </button>
              <button 
                  onClick={() => setActiveTab("desmobilizacao")}
                  className={`pb-4 text-sm font-bold border-b-2 transition-colors ${activeTab === "desmobilizacao" ? "border-[#22c7ac] text-[#22c7ac]" : "border-transparent text-slate-500 hover:text-slate-300"}`}
                >
                  <div className="flex items-center gap-2"><TableProperties className="w-4 h-4"/> Desmobilização</div>
                </button>
              </nav>
          </div>

          {activeTab === "importacao" && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-[#111c33] rounded-2xl border border-white/5 shadow-sm p-6 flex flex-col">
                  <div className="flex items-center gap-2 justify-between mb-6 w-full">
                    <div className="flex items-center gap-2">
                      <UploadCloud className="w-5 h-5 text-[#22c7ac]" />
                      <h3 className="font-bold text-white">Upload de Bases (XLSX / CSV)</h3>
                    </div>
                    <button 
                      type="button"
                      onClick={() => {
                        let headers: string[] = [];
                        let filename = "";
                    
                        if (importType === "ativos") {
                        headers = [
                          "Cargo",
                          "Código do Centro de Custo",
                          "Centro de Custo",
                          "Matrícula",
                          "Colaborador",
                          "CPF",
                          "Tipo de Situação"
                        ];
                        filename = "Modelo_Base_Realizada.xlsx";
                      } else if (importType === "pa" || importType === "forecast") {
                        headers = [
                          "Descrição Cargo",
                          "Código CC",
                          "Detalhe CC",
                          "JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"
                        ];
                        filename = `Modelo_Base_${importType.toUpperCase()}.xlsx`;
                      } else if (importType === "financeiro") {
                        headers = [
                          "costCenter",
                          "type",
                          "metric",
                          "scenario",
                          "competence",
                          "value"
                        ];
                        filename = "Modelo_Base_Financeira.xlsx";
                      }
                  
                      const worksheet = XLSX.utils.aoa_to_sheet([headers]);
                      const workbook = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(workbook, worksheet, "Modelo");
                      XLSX.writeFile(workbook, filename);
                    }}
                    className="bg-[#22c7ac]/20 hover:bg-[#22c7ac]/30 text-[#22c7ac] px-4 py-2 flex items-center gap-2 rounded-lg font-bold text-sm transition-colors border border-[#22c7ac]/30 ml-auto"
                  >
                    <Download className="w-4 h-4" /> Baixar Modelo
                  </button>

</div>

              <div className="space-y-6 flex-1 flex flex-col">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                    Selecione o tipo de importação
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <button 
                      onClick={() => setImportType("ativos")}
                      className={`py-3 px-4 rounded-lg text-sm font-bold border transition-colors ${importType === "ativos" ? "border-[#22c7ac] bg-[#22c7ac]/10 text-[#22c7ac] shadow-sm" : "border-white/10 bg-transparent text-slate-400 hover:bg-white/5"}`}
                    >
                      Lista de Ativos
                    </button>
                    <button 
                      onClick={() => setImportType("pa")}
                      className={`py-3 px-4 rounded-lg text-sm font-bold border transition-colors ${importType === "pa" ? "border-[#22c7ac] bg-[#22c7ac]/10 text-[#22c7ac] shadow-sm" : "border-white/10 bg-transparent text-slate-400 hover:bg-white/5"}`}
                    >
                      Base do PA
                    </button>
                    <button 
                      onClick={() => setImportType("forecast")}
                      className={`py-3 px-4 rounded-lg text-sm font-bold border transition-colors ${importType === "forecast" ? "border-[#22c7ac] bg-[#22c7ac]/10 text-[#22c7ac] shadow-sm" : "border-white/10 bg-transparent text-slate-400 hover:bg-white/5"}`}
                    >
                      Base Forecast
                    </button>
                    <button 
                      onClick={() => setImportType("financeiro")}
                      className={`py-3 px-4 rounded-lg text-sm font-bold border transition-colors ${importType === "financeiro" ? "border-[#22c7ac] bg-[#22c7ac]/10 text-[#22c7ac] shadow-sm" : "border-white/10 bg-transparent text-slate-400 hover:bg-white/5"}`}
                    >
                      Base Financeira
                    </button>
                    <button 
                      onClick={() => setImportType("variacao")}
                      className={`py-3 px-4 rounded-lg text-sm font-bold border transition-colors ${importType === "variacao" ? "border-[#22c7ac] bg-[#22c7ac]/10 text-[#22c7ac] shadow-sm" : "border-white/10 bg-transparent text-slate-400 hover:bg-white/5"}`}
                    >
                      Variação FTE
                    </button>
                    <button 
                      onClick={() => setImportType("cc_contrato")}
                      className={`py-3 px-4 rounded-lg text-sm font-bold border transition-colors ${importType === "cc_contrato" ? "border-[#22c7ac] bg-[#22c7ac]/10 text-[#22c7ac] shadow-sm" : "border-white/10 bg-transparent text-slate-400 hover:bg-white/5"}`}
                    >
                      CC x Contrato
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    {(importType === 'pa' || importType === 'forecast') ? 'Ano do Planejamento' : 'Competência (MM/YYYY)'}
                  </label>
                  <input 
                    type="text" 
                    placeholder={(importType === 'pa' || importType === 'forecast') ? 'YYYY' : 'MM/YYYY'}
                    value={competence}
                    onChange={(e) => setCompetence(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-white/10 bg-black/20 text-white focus:outline-none focus:ring-2 focus:ring-[#22c7ac] focus:border-transparent font-medium"
                  />
                </div>

                <div className="relative border-2 border-dashed border-white/10 rounded-xl p-8 flex flex-col items-center justify-center text-center hover:border-[#22c7ac] hover:bg-[#22c7ac]/5 transition-colors cursor-pointer group flex-1 min-h-[200px]">
                  <input 
                    type="file" 
                    accept=".csv, .xlsx"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <FileSpreadsheet className="w-10 h-10 text-slate-500 group-hover:text-[#22c7ac] mb-3 transition-colors" />
                  <span className="font-bold text-slate-400 group-hover:text-[#22c7ac] transition-colors">
                    {file ? file.name : "Clique ou arraste a planilha"}
                  </span>
                  <span className="text-xs text-slate-500 mt-1">
                    {importType === 'ativos' ? 'Apenas arquivos .csv (Latin1) nesta fase' : 'Apenas arquivos .xlsx'}
                  </span>
                </div>

                <button 
                  onClick={handleImport}
                  disabled={isProcessing || !file}
                  className="w-full py-4 bg-[#22c7ac] hover:bg-[#1db199] text-white font-bold rounded-xl shadow-sm transition-colors uppercase tracking-wider text-sm disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                >
                  {isProcessing ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Importando...</>
                  ) : (
                    "Iniciar Importação"
                  )}
                </button>
              </div>
            </div>

            <div className="bg-black/40 rounded-2xl shadow-lg border border-white/5 flex flex-col overflow-hidden min-h-[500px]">
              <div className="bg-[#111c33] px-4 py-3 flex items-center gap-2 border-b border-white/5">
                <TerminalSquare className="w-4 h-4 text-[#22c7ac]" />
                <span className="text-slate-300 font-mono text-sm">Terminal do Servidor</span>
              </div>
              <div ref={terminalRef} className="p-4 font-mono text-sm text-[#22c7ac] flex-1 overflow-auto space-y-1">
                {logs.map((log, idx) => (
                  <div key={idx} className={log.includes("Erro") || log.includes("Falha") ? "text-red-400" : ""}>
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Forecast Import Summary & Reconciliation Modal/Card (Item 15) */}
          {forecastSummary && (
            <div className="bg-[#111c33] border-2 border-[#22c7ac]/40 rounded-2xl p-6 shadow-2xl animate-fade-in space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-[#22c7ac]/10 flex items-center justify-center text-[#22c7ac] border border-[#22c7ac]/30">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                      Upload Concluído com Sucesso
                    </h3>
                    <p className="text-sm text-slate-400">
                      Lote de Governança: <span className="text-[#22c7ac] font-mono font-bold">{forecastSummary.batchCode}</span>
                    </p>
                  </div>
                </div>

                <Link
                  href={`/governanca?batchId=${forecastSummary.batchId}`}
                  className="bg-[#22c7ac] hover:bg-[#1db199] text-white px-5 py-3 rounded-xl font-bold transition-all shadow-lg flex items-center gap-2 text-sm uppercase tracking-wider"
                >
                  <ShieldCheck className="w-5 h-5" />
                  Ir para Governança
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              {/* Grid of KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="bg-[#0a1122] border border-white/5 p-4 rounded-xl">
                  <div className="text-xs text-slate-400 font-medium">Registros Processados</div>
                  <div className="text-2xl font-bold text-white mt-1">{forecastSummary.totalProcessed}</div>
                </div>
                <div className="bg-[#0a1122] border border-white/5 p-4 rounded-xl">
                  <div className="text-xs text-slate-400 font-medium">Cargos Analisados</div>
                  <div className="text-2xl font-bold text-white mt-1">{forecastSummary.rolesAnalyzed}</div>
                </div>
                <div className="bg-[#0a1122] border border-white/5 p-4 rounded-xl">
                  <div className="text-xs text-slate-400 font-medium">Sem Alteração</div>
                  <div className="text-2xl font-bold text-slate-400 mt-1">{forecastSummary.unchangedCount}</div>
                </div>
                <div className="bg-[#0a1122] border border-white/5 p-4 rounded-xl">
                  <div className="text-xs text-slate-400 font-medium">Alterações Identificadas</div>
                  <div className="text-2xl font-bold text-yellow-400 mt-1">{forecastSummary.diffCount}</div>
                </div>
                <div className="bg-[#0a1122] border border-white/5 p-4 rounded-xl">
                  <div className="text-xs text-slate-400 font-medium">Diferença Líquida</div>
                  <div className={`text-2xl font-bold mt-1 ${forecastSummary.netDelta > 0 ? 'text-green-400' : forecastSummary.netDelta < 0 ? 'text-red-400' : 'text-white'}`}>
                    {forecastSummary.netDelta > 0 ? '+' : ''}{forecastSummary.netDelta} FTE
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#0a1122] border border-green-500/20 p-3 rounded-xl flex items-center justify-between">
                  <span className="text-xs text-slate-300">Acréscimos</span>
                  <span className="text-lg font-bold text-green-400">+{forecastSummary.additionsCount}</span>
                </div>
                <div className="bg-[#0a1122] border border-red-500/20 p-3 rounded-xl flex items-center justify-between">
                  <span className="text-xs text-slate-300">Retiradas</span>
                  <span className="text-lg font-bold text-red-400">-{forecastSummary.withdrawalsCount}</span>
                </div>
                <div className="bg-[#0a1122] border border-blue-500/20 p-3 rounded-xl flex items-center justify-between">
                  <span className="text-xs text-slate-300">Novos Cargos</span>
                  <span className="text-lg font-bold text-blue-400">{forecastSummary.newRolesCount}</span>
                </div>
                <div className="bg-[#0a1122] border border-orange-500/20 p-3 rounded-xl flex items-center justify-between">
                  <span className="text-xs text-slate-300">Pendentes Justificativa</span>
                  <span className="text-lg font-bold text-yellow-400">{forecastSummary.pendingJustificationCount}</span>
                </div>
              </div>
            </div>
          )}
          </div>
          )}

          
            {activeTab === "desmobilizacao" && (
              <div className="bg-[#111c33] rounded-2xl border border-white/5 shadow-sm overflow-hidden min-h-[500px]">
                <div className="p-6 border-b border-white/5 flex justify-between items-start">
                  <div><h3 className="font-bold text-white flex items-center gap-2">
                    <TableProperties className="w-5 h-5 text-[#22c7ac]" />
                    Desmobilização de Contratos
                  </h3>
                  <p className="text-sm text-slate-400 mt-2">Defina uma data a partir da qual o contrato não será mais considerado nos cálculos (PA, Forecast, Financeiro, Dashboard, etc).</p>
                  </div>
                  
<button type="button" onClick={handleExportExcel} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 flex items-center gap-2 rounded-lg font-bold text-sm transition-colors border border-white/10">
  <Download className="w-4 h-4" /> Exportar para Excel
</button>

                </div>
                {desmobLoading ? (
                  <div className="p-6 text-slate-400">Carregando...</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-white/5 text-slate-400">
                        <tr>
                          <th className="px-6 py-4 font-semibold">Contrato</th>
                          <th className="px-6 py-4 font-semibold">Data de Desmobilização (Mês/Ano)</th>
                          <th className="px-6 py-4 font-semibold">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-slate-300">
                        {desmobData.map((contract) => {
                          const dateVal = contract.demobilizationDate ? new Date(contract.demobilizationDate).toISOString().slice(0,7) : '';
                          return (
                            <tr key={contract.id} className="hover:bg-white/5 transition-colors">
                              <td className="px-6 py-3 font-bold text-white">{contract.name}</td>
                              <td className="px-6 py-3">
                                <input 
                                  type="month" 
                                  className="bg-black/20 border border-white/10 rounded-lg px-3 py-1.5 text-white"
                                  defaultValue={dateVal}
                                  onChange={(e) => handleDesmobUpdate(contract.id, e.target.value)}
                                />
                              </td>
                              <td className="px-6 py-3">
                                {contract.demobilizationDate ? (
                                  <button onClick={() => handleDesmobUpdate(contract.id, '')} className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded hover:bg-red-500/30">Remover</button>
                                ) : (
                                  <span className="text-xs text-slate-500">Ativo</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            
            {activeTab === "cc_contrato_view" && (
              <div className="bg-[#111c33] rounded-2xl border border-white/5 shadow-sm p-6 flex flex-col min-h-[500px]">
                <div className="flex items-center justify-between gap-3 mb-6">
                  <div className="flex items-center gap-3">
                    <TableProperties className="w-6 h-6 text-[#22c7ac]" />
                    <div>
                      <h3 className="font-bold text-lg text-white">Tabela CC x Contrato</h3>
                      <p className="text-sm text-slate-400">Gerenciamento de Centros de Custo (De x Para).</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={handleExportExcel} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 flex items-center gap-2 rounded-lg font-bold text-sm transition-colors border border-white/10">
                      <Download className="w-4 h-4" /> Exportar para Excel
                    </button>
                    {selectedCcIds.length > 0 && (
                      <button 
                        type="button"
                        onClick={handleBulkDeleteCc}
                        className="bg-red-500/20 text-red-400 border border-red-500/30 px-4 py-2 flex items-center gap-2 rounded-lg font-bold text-sm hover:bg-red-500/30 transition-colors"
                      >
                        Excluir Selecionados ({selectedCcIds.length})
                      </button>
                    )}
                    <button 
                      type="button"
                      onClick={() => setShowNewCcForm(true)}
                      className="bg-[#22c7ac] text-[#041A71] px-4 py-2 flex items-center gap-2 rounded-lg font-bold text-sm hover:bg-[#1db098] transition-colors"
                    >
                      + Novo CC
                    </button>
                  </div>
                </div>
                
                <div className="mb-4">
                  <input 
                    type="text" 
                    placeholder="Filtrar por nome do Contrato ou Código CC..." 
                    value={ccSearch}
                    onChange={(e) => setCcSearch(e.target.value)}
                    className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-[#22c7ac]"
                  />
                </div>

                {isLoadingCcContrato ? (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                    <Loader2 className="w-8 h-8 animate-spin text-[#22c7ac] mb-4" />
                    <span>Carregando dados...</span>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-[#041A71] text-white">
                        <tr>
                          <th className="px-4 py-4 w-[50px] rounded-tl-lg text-center">
                            <input 
                              type="checkbox"
                              checked={ccContratoData.length > 0 && selectedCcIds.length === ccContratoData.length}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedCcIds(ccContratoData.map(cc => cc.id));
                                else setSelectedCcIds([]);
                              }}
                              className="w-4 h-4 rounded border-white/20 bg-black/20 text-[#22c7ac] focus:ring-[#22c7ac] cursor-pointer"
                            />
                          </th>
                          <th className="px-6 py-4 font-bold w-[150px]">Código CC</th>
                          <th className="px-6 py-4 font-bold">Descrição do Centro de Custo</th>
                          <th className="px-6 py-4 font-bold">Contrato Mapeado</th>
                          <th className="px-6 py-4 font-bold rounded-tr-lg w-[140px] text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-slate-300">
                        {showNewCcForm && (
                          <tr className="bg-white/5">
                              <td className="px-4 py-3"></td>
                              <td className="px-6 py-3">
                                <input 
                                  type="text" 
                                  value={newCcForm.code} 
                                  onChange={e => setNewCcForm({...newCcForm, code: e.target.value})} 
                                  className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-white" 
                                  placeholder="Ex: 0174"
                                />
                              </td>
                              <td className="px-6 py-3">
                                <input 
                                  type="text" 
                                  value={newCcForm.description} 
                                  onChange={e => setNewCcForm({...newCcForm, description: e.target.value})} 
                                  className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-white" 
                                  placeholder="Ex: DIRETORIA"
                                />
                              </td>
                              <td className="px-6 py-3">
                                <input 
                                  type="text" 
                                  value={newCcForm.contractName} 
                                  onChange={e => setNewCcForm({...newCcForm, contractName: e.target.value})} 
                                  className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-white" 
                                  placeholder="Ex: MATRIZ"
                                />
                              </td>
                              <td className="px-6 py-3 flex gap-2">
                                <button onClick={handleNewCcSave} className="text-[#22c7ac] hover:text-[#1db098] font-bold text-sm">Salvar</button>
                                <button onClick={() => setShowNewCcForm(false)} className="text-slate-400 hover:text-white font-bold text-sm">Cancelar</button>
                              </td>
                            </tr>
                        )}
                        {ccContratoData
                          .filter(cc => 
                             !ccSearch || 
                             cc.contractName?.toLowerCase().includes(ccSearch.toLowerCase()) || 
                             cc.code?.toLowerCase().includes(ccSearch.toLowerCase())
                          )
                          .map((cc) => (
                          <tr key={cc.id} className="hover:bg-white/5 transition-colors group">
                            
<td className="px-6 py-3">
  <input 
    type="checkbox" 
    checked={selectedCcIds.includes(cc.id)}
    onChange={(e) => {
      if (e.target.checked) setSelectedCcIds([...selectedCcIds, cc.id]);
      else setSelectedCcIds(selectedCcIds.filter(id => id !== cc.id));
    }}
    className="w-4 h-4 rounded border-white/20 bg-black/20 text-[#22c7ac] focus:ring-[#22c7ac] cursor-pointer"
  />
</td>
<td className="px-6 py-3 font-mono text-[#22c7ac]">{cc.code}</td>

                            <td className="px-6 py-3">
                              {editingCcId === cc.id ? (
                                <input 
                                  type="text" 
                                  value={editForm.description} 
                                  onChange={e => setEditForm({...editForm, description: e.target.value})} 
                                  className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-white" 
                                />
                              ) : (
                                cc.description
                              )}
                            </td>
                            <td className="px-6 py-3 font-bold text-white">
                              {editingCcId === cc.id ? (
                                <input 
                                  type="text" 
                                  value={editForm.contractName} 
                                  onChange={e => setEditForm({...editForm, contractName: e.target.value.toUpperCase()})} 
                                  className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-white" 
                                />
                              ) : (
                                cc.contractName
                              )}
                            </td>
                            <td className="px-6 py-3 flex items-center gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                              {editingCcId === cc.id ? (
                                <>
                                  <button onClick={() => handleEditCcSave(cc.id)} className="text-[#22c7ac] hover:text-white text-xs font-bold bg-[#22c7ac]/20 px-2 py-1 rounded">OK</button>
                                  <button onClick={() => setEditingCcId(null)} className="text-slate-400 hover:text-white text-xs bg-white/10 px-2 py-1 rounded">X</button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => handleEditCcStart(cc)} className="text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-white/10 text-xs">Editar</button>
                                  <button onClick={() => handleDeleteCc(cc.id)} className="text-red-400 hover:text-white px-2 py-1 rounded hover:bg-red-500/20 text-xs">Excluir</button>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === "desmobilizacao" && (
              <div className="bg-[#111c33] rounded-2xl border border-white/5 shadow-sm overflow-hidden min-h-[500px]">
                <div className="p-6 border-b border-white/5">
                  <h3 className="font-bold text-white flex items-center gap-2">
                    <TableProperties className="w-5 h-5 text-[#22c7ac]" />
                    Desmobilização de Contratos
                  </h3>
                  <p className="text-sm text-slate-400 mt-2">Defina uma data a partir da qual o contrato não será mais considerado nos cálculos (PA, Forecast, Financeiro, Dashboard, etc).</p>
                </div>
                {desmobLoading ? (
                  <div className="p-6 text-slate-400">Carregando...</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-white/5 text-slate-400">
                        <tr>
                          <th className="px-6 py-4 font-semibold">Contrato</th>
                          <th className="px-6 py-4 font-semibold">Data de Desmobilização (Mês/Ano)</th>
                          <th className="px-6 py-4 font-semibold">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-slate-300">
                        {desmobData.map((contract) => {
                          const dateVal = contract.demobilizationDate ? new Date(contract.demobilizationDate).toISOString().slice(0,7) : '';
                          return (
                            <tr key={contract.id} className="hover:bg-white/5 transition-colors">
                              <td className="px-6 py-3 font-bold text-white">{contract.name}</td>
                              <td className="px-6 py-3">
                                <input 
                                  type="month" 
                                  className="bg-black/20 border border-white/10 rounded-lg px-3 py-1.5 text-white"
                                  defaultValue={dateVal}
                                  onChange={(e) => handleDesmobUpdate(contract.id, e.target.value)}
                                />
                              </td>
                              <td className="px-6 py-3">
                                {contract.demobilizationDate ? (
                                  <button onClick={() => handleDesmobUpdate(contract.id, '')} className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded hover:bg-red-500/30">Remover</button>
                                ) : (
                                  <span className="text-xs text-slate-500">Ativo</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}



          {activeTab === "categorizacao" && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div className="flex items-center gap-3">
                  <TableProperties className="w-6 h-6 text-[#041A71]" />
                  <div>
                    <h3 className="font-bold text-lg text-[#041A71]">Categorização de Centros de Custo</h3>
                    <p className="text-sm text-slate-500">Defina o faturamento e tipo de operação de cada Centro de Custo.</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-[300px]">
                    <MultiSelect 
                      label="Filtrar por CC"
                      placeholder="Todos os Centros de Custo"
                      options={categorizationData.map(cc => ({ label: `${cc.code} - ${cc.description}`, value: cc.id }))}
                      selected={categorizationFilterCCs}
                      onChange={setCategorizationFilterCCs}
                    />
                  </div>
                  {saveSuccess && (
                    <span className="text-sm text-[#22c7ac] font-bold flex items-center gap-1">
                      <Check className="w-4 h-4" /> Salvo com sucesso!
                    </span>
                  )}
                  <button
                    onClick={handleSaveCategorization}
                    disabled={categorizationChanges.size === 0 || isSavingCategorization}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[#22c7ac] hover:bg-[#1db199] text-white font-bold rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSavingCategorization ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Salvar Alterações
                  </button>
                </div>
              </div>
              
              {isLoadingCategorization ? (
                <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin text-[#22c7ac] mb-4" />
                  <p>Carregando Centros de Custo...</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  {/* Mass Edit Toolbar */}
                  {selectedCCs.size > 0 && (
                    <div className="bg-[#041A71]/5 p-4 border-b border-slate-200 flex items-center justify-between">
                      <div className="text-sm font-bold text-[#041A71]">
                        {selectedCCs.size} selecionado{selectedCCs.size > 1 ? 's' : ''}
                      </div>
                      <div className="flex items-center gap-4">
                        <select 
                          onChange={(e) => {
                            const val = e.target.value;
                            if (!val) return;
                            setCategorizationChanges(prev => {
                              const next = new Map(prev);
                              selectedCCs.forEach(id => {
                                const cc = categorizationData.find(c => c.id === id);
                                const currentType = next.get(id)?.type ?? cc?.type ?? '';
                                next.set(id, { contractType: val, type: currentType });
                              });
                              return next;
                            });
                            e.target.value = "";
                            setSaveSuccess(false);
                          }}
                          className="border-slate-200 rounded-md p-2 text-sm text-slate-700 bg-white shadow-sm focus:ring-[#22c7ac] focus:border-[#22c7ac] outline-none border"
                        >
                          <option value="">Alterar Faturamento (FTE/Fixo)...</option>
                          <option value="FTE">FTE</option>
                          <option value="Fixo">Fixo</option>
                          <option value="Volume">Volume</option>
                        </select>
                        
                        <select 
                          onChange={(e) => {
                            const val = e.target.value;
                            if (!val) return;
                            setCategorizationChanges(prev => {
                              const next = new Map(prev);
                              selectedCCs.forEach(id => {
                                const cc = categorizationData.find(c => c.id === id);
                                const currentContractType = next.get(id)?.contractType ?? cc?.contractType ?? '';
                                next.set(id, { contractType: currentContractType, type: val });
                              });
                              return next;
                            });
                            e.target.value = "";
                            setSaveSuccess(false);
                          }}
                          className="border-slate-200 rounded-md p-2 text-sm text-slate-700 bg-white shadow-sm focus:ring-[#22c7ac] focus:border-[#22c7ac] outline-none border"
                        >
                          <option value="">Alterar Tipo...</option>
                          <option value="Operação">Operação</option>
                          <option value="Backoffice">Backoffice</option>
                          <option value="Indiretos">Indiretos</option>
                        </select>

                        <button 
                          onClick={() => setSelectedCCs(new Set())}
                          className="text-sm text-slate-500 hover:text-slate-700 font-medium"
                        >
                          Limpar seleção
                        </button>
                      </div>
                    </div>
                  )}
                  <table className="w-full text-sm text-left">
                    <thead className="bg-[#041A71] text-white">
                      <tr>
                        <th className="px-4 py-3 font-bold w-12">
                          <input 
                            type="checkbox" 
                            checked={filteredCategorizationData.length > 0 && selectedCCs.size === filteredCategorizationData.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedCCs(new Set(filteredCategorizationData.map(cc => cc.id)));
                              } else {
                                setSelectedCCs(new Set());
                              }
                            }}
                            className="rounded border-slate-300 text-[#22c7ac] focus:ring-[#22c7ac] cursor-pointer"
                          />
                        </th>
                        <th className="px-4 py-3 font-bold">Código</th>
                        <th className="px-4 py-3 font-bold">Descrição</th>
                        <th className="px-4 py-3 font-bold w-64">Contrato</th>
                        <th className="px-4 py-3 font-bold w-64">Tipo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {filteredCategorizationData.map(cc => {
                        const pendingChange = categorizationChanges.get(cc.id);
                        const contractType = pendingChange?.contractType ?? cc.contractType ?? '';
                        const type = pendingChange?.type ?? cc.type ?? '';

                        return (
                          <tr key={cc.id} className={`hover:bg-slate-50 transition-colors ${selectedCCs.has(cc.id) ? 'bg-[#041A71]/5' : ''}`}>
                            <td className="px-4 py-3">
                              <input 
                                type="checkbox" 
                                checked={selectedCCs.has(cc.id)}
                                onChange={(e) => {
                                  const next = new Set(selectedCCs);
                                  if (e.target.checked) next.add(cc.id);
                                  else next.delete(cc.id);
                                  setSelectedCCs(next);
                                }}
                                className="rounded border-slate-300 text-[#22c7ac] focus:ring-[#22c7ac] cursor-pointer"
                              />
                            </td>
                            <td className="px-4 py-3 font-medium">{cc.code}</td>
                            <td className="px-4 py-3 text-slate-500">{cc.description}</td>
                            <td className="px-4 py-3">
                              <select 
                                value={contractType}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCategorizationChanges(prev => {
                                    const next = new Map(prev);
                                    next.set(cc.id, { contractType: val, type: type });
                                    return next;
                                  });
                                  setSaveSuccess(false);
                                }}
                                className="w-full border-slate-200 rounded-md p-2 text-sm text-slate-700 focus:ring-[#22c7ac] focus:border-[#22c7ac] outline-none border"
                              >
                                <option value="">Selecione...</option>
                                <option value="FTE">FTE</option>
                                <option value="Fixo">Fixo</option>
                                <option value="Volume">Volume</option>
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <select 
                                value={type}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCategorizationChanges(prev => {
                                    const next = new Map(prev);
                                    next.set(cc.id, { contractType: contractType, type: val });
                                    return next;
                                  });
                                  setSaveSuccess(false);
                                }}
                                className="w-full border-slate-200 rounded-md p-2 text-sm text-slate-700 focus:ring-[#22c7ac] focus:border-[#22c7ac] outline-none border"
                              >
                                <option value="">Selecione...</option>
                                <option value="Backoffice">Backoffice</option>
                                <option value="Operação">Operação</option>
                                <option value="Planejamento">Planejamento</option>
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {(activeTab === "consolidado" || activeTab === "pa" || activeTab === "forecast" || activeTab === "financeiro" || activeTab === "variacao") && (
            <div className="bg-[#111c33] rounded-2xl border border-white/5 shadow-sm p-6 flex flex-col min-h-[500px]">
              
              <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2">
                  <TableProperties className="w-5 h-5 text-[#22c7ac]" />
                  <h3 className="font-bold text-white">
                    {activeTab === "consolidado" && "Consolidado por Centro de Custo e Cargo"}
                    {activeTab === "pa" && "Planejamento (PA) por Centro de Custo e Cargo"}
                    {activeTab === "forecast" && "Forecast por Centro de Custo e Cargo"}
                    {activeTab === "financeiro" && "Base Financeira por Centro de Custo"}
                  </h3>
                </div>
                
                <div className="flex flex-wrap items-center gap-4">
                  
                  {activeTab === "consolidado" && availableStatuses.length > 0 && (
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-bold text-slate-400">Situação:</label>
                      <div className="flex flex-wrap gap-2">
                        {availableStatuses.map(status => (
                          <button 
                            key={status}
                            onClick={() => toggleStatus(status)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                              selectedStatuses.length === 0 || selectedStatuses.includes(status) 
                                ? 'bg-[#22c7ac]/10 text-[#22c7ac] border border-[#22c7ac]/30 shadow-sm' 
                                : 'bg-black/20 text-slate-500 border border-white/5 hover:border-white/10'
                            }`}
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pl-4 border-l border-white/10">
                    <label className="text-sm font-bold text-slate-400">Centro de Custo:</label>
                    <div className="relative">
                      <input 
                        type="text" 
                        value={filterCostCenter}
                        onChange={(e) => setFilterCostCenter(e.target.value)}
                        placeholder="Buscar CC..."
                        className="w-40 px-3 py-2 pl-9 rounded-lg border border-white/10 bg-black/20 text-white focus:outline-none focus:ring-2 focus:ring-[#22c7ac] text-sm font-medium"
                      />
                      <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pl-4 border-l border-white/10">
                    <label className="text-sm font-bold text-slate-400">Competência:</label>
                    <div className="relative">
                      <input 
                        type="text" 
                        value={filterCompetence}
                        onChange={(e) => setFilterCompetence(e.target.value)}
                        placeholder="MM/YYYY"
                        className="w-32 px-3 py-2 pl-9 rounded-lg border border-white/10 bg-black/20 text-white focus:outline-none focus:ring-2 focus:ring-[#22c7ac] text-sm font-medium"
                      />
                      <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    </div>
                  </div>

                  {activeTab === "forecast" && (
                    <div className="flex items-center gap-3 pl-4 border-l border-white/10">
                      {(pendingForecastChanges.size > 0 || pendingForecastDeletions.size > 0) && (
                        <span className="text-xs font-bold text-amber-400 animate-pulse">
                          {pendingForecastChanges.size + pendingForecastDeletions.size} alteração(ões) não salva(s)
                        </span>
                      )}
                      {saveSuccess && (
                        <span className="flex items-center gap-1 text-xs font-bold text-[#22c7ac]">
                          <Check className="w-3 h-3" /> Salvo!
                        </span>
                      )}
                      <button
                        onClick={handleSaveForecast}
                        disabled={isSavingForecast || (pendingForecastChanges.size === 0 && pendingForecastDeletions.size === 0)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                          (pendingForecastChanges.size > 0 || pendingForecastDeletions.size > 0)
                            ? 'bg-[#22c7ac] text-black hover:bg-[#1eb39a] shadow-lg shadow-[#22c7ac]/20'
                            : 'bg-white/5 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        {isSavingForecast ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        Salvar Forecast
                      </button>
                    </div>
                  )}

                </div>
              </div>

              <div className="flex-1 overflow-auto rounded-xl border border-white/5 bg-black/20">
                {isLoadingSummary ? (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                    <Loader2 className="w-8 h-8 animate-spin text-[#22c7ac] mb-4" />
                    <span>Carregando base consolidada...</span>
                  </div>
                ) : matrixData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                    <Database className="w-12 h-12 mb-4 opacity-20" />
                    <p>Nenhuma informação encontrada para {filterCompetence}.</p>
                  </div>
                ) : (
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-[#111c33] border-b border-white/10 sticky top-0 z-10 shadow-sm">
                      {activeTab === "financeiro" ? (
                        <tr>
                          <th className="px-6 py-4 font-bold text-white">Código</th>
                          <th className="px-6 py-4 font-bold text-white">Descrição Completa</th>
                          <th className="px-6 py-4 font-bold text-white">Contrato</th>
                          <th className="px-6 py-4 font-bold text-white">Tipo</th>
                          <th className="px-6 py-4 font-bold text-white">Conta Contábil</th>
                          <th className="px-6 py-4 font-bold text-white">Cenário</th>
                          <th className="px-6 py-4 font-bold text-white">Competência</th>
                          <th className="px-6 py-4 font-bold text-white text-right">Valor</th>
                        </tr>
                      ) : activeTab === "variacao" ? (
                        <tr>
                          <th className="px-6 py-4 font-bold text-white">Contrato / Centro de Custo</th>
                          <th className="px-6 py-4 font-bold text-white">Cód. CC</th>
                          <th className="px-6 py-4 font-bold text-white">Centro de Custo</th>
                          <th className="px-6 py-4 font-bold text-white">Contrato</th>
                          <th className="px-6 py-4 font-bold text-white text-right">FTE (PA)</th>
                          <th className="px-6 py-4 font-bold text-white text-right">Valor (PA)</th>
                          <th className="px-6 py-4 font-bold text-white text-right">FTE (Real)</th>
                          <th className="px-6 py-4 font-bold text-white text-right">Valor (Real)</th>
                          <th className="px-6 py-4 font-bold text-white text-right">FTE (Var)</th>
                          <th className="px-6 py-4 font-bold text-white text-right">Valor (Var)</th>
                        </tr>
                      ) : (
                        <tr>
                          <th className="px-4 py-4 w-12"></th>
                          <th className="px-6 py-4 font-bold text-white">Cód. CC</th>
                          <th className="px-6 py-4 font-bold text-white">Centro de Custo</th>
                          <th className="px-6 py-4 font-bold text-white">Contrato</th>
                          {activeTab === "consolidado" ? (
                            <th className="px-6 py-4 font-bold text-white text-right">Qtd Colaboradores</th>
                          ) : (
                            <>
                              {['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'].map(m => (
                                 <th key={m} className="px-3 py-4 font-bold text-white text-right text-xs w-16">{m}</th>
                              ))}
                            </>
                          )}
                        </tr>
                      )}
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {activeTab === "financeiro" ? (
                        <>
                        {matrixData.slice(0, 300).map((row: any) => (
                          <tr key={row.id} className="hover:bg-white/[0.04] transition-colors">
                            <td className="px-6 py-4 font-medium">{row.costCenterCode}</td>
                            <td className="px-6 py-4 text-slate-400">{row.costCenterDesc}</td>
                            <td className="px-6 py-4 font-medium text-white">{row.contractType || '-'}</td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded text-xs font-bold ${row.type === 'Receita' ? 'bg-[#22c7ac]/20 text-[#22c7ac]' : 'bg-red-500/20 text-red-400'}`}>
                                {row.type || 'Custo'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-slate-400">{row.metric}</td>
                            <td className="px-6 py-4 text-slate-400">{row.scenario}</td>
                            <td className="px-6 py-4 text-slate-400">{row.competence}</td>
                            <td className="px-6 py-4 text-right font-medium font-mono text-[#22c7ac]">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(row.value) || 0)}
                            </td>
                          </tr>
                        ))}
                        </>
                      ) : activeTab === "variacao" ? (
                        <>
                          {summaryData.filter((r: any) => !r.isOverhead).length > 0 && (
                            <tr><td colSpan={9} className="px-6 py-2 bg-white/5 font-bold text-[#22c7ac] text-xs uppercase tracking-wider">Contratos Operacionais</td></tr>
                          )}
                          {summaryData.filter((r: any) => !r.isOverhead).map((row: any) => (
                            <tr key={row.id} className="hover:bg-white/[0.04] transition-colors">
                              <td className="px-6 py-3 font-medium">{row.contractName}</td>
                              <td className="px-6 py-3 font-mono text-slate-300">{row.contractName ? row.contractName.split('-')[0].replace(/\./g, '').trim() : ''}</td>
                              <td className="px-6 py-3 text-slate-400">{row.costCenter?.description || '-'}</td>
                              <td className="px-6 py-3 font-medium text-white">{row.costCenter?.operation?.contract?.name || '-'}</td>
                              <td className="px-6 py-3 text-right">{row.ftePa}</td>
                              <td className="px-6 py-3 text-right text-slate-400">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.valPa)}</td>
                              <td className="px-6 py-3 text-right">{row.fteReal}</td>
                              <td className="px-6 py-3 text-right text-slate-400">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.valReal)}</td>
                              <td className="px-6 py-3 text-right font-bold font-mono" style={{color: row.fteVar < 0 ? '#ef4444' : (row.fteVar > 0 ? '#22c7ac' : 'inherit')}}>{row.fteVar}</td>
                              <td className="px-6 py-3 text-right font-bold font-mono" style={{color: row.valVar < 0 ? '#ef4444' : (row.valVar > 0 ? '#22c7ac' : 'inherit')}}>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.valVar)}</td>
                            </tr>
                          ))}
                          
                          {summaryData.filter((r: any) => r.isOverhead).length > 0 && (
                            <tr><td colSpan={9} className="px-6 py-2 bg-white/5 font-bold text-amber-500 text-xs uppercase tracking-wider mt-4">Custos Indiretos / Overhead</td></tr>
                          )}
                          {summaryData.filter((r: any) => r.isOverhead).map((row: any) => (
                            <tr key={row.id} className="hover:bg-white/[0.04] transition-colors">
                              <td className="px-6 py-3 font-medium">{row.contractName}</td>
                              <td className="px-6 py-3 font-mono text-slate-300">{row.contractName ? row.contractName.split('-')[0].replace(/\./g, '').trim() : ''}</td>
                              <td className="px-6 py-3 text-slate-400">{row.costCenter?.description || '-'}</td>
                              <td className="px-6 py-3 font-medium text-white">{row.costCenter?.operation?.contract?.name || '-'}</td>
                              <td className="px-6 py-3 text-right">{row.ftePa}</td>
                              <td className="px-6 py-3 text-right text-slate-400">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.valPa)}</td>
                              <td className="px-6 py-3 text-right">{row.fteReal}</td>
                              <td className="px-6 py-3 text-right text-slate-400">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.valReal)}</td>
                              <td className="px-6 py-3 text-right font-bold font-mono" style={{color: row.fteVar < 0 ? '#ef4444' : (row.fteVar > 0 ? '#22c7ac' : 'inherit')}}>{row.fteVar}</td>
                              <td className="px-6 py-3 text-right font-bold font-mono" style={{color: row.valVar < 0 ? '#ef4444' : (row.valVar > 0 ? '#22c7ac' : 'inherit')}}>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.valVar)}</td>
                            </tr>
                          ))}
                        </>
                      ) : (
                      matrixData.map((row) => (
                        <React.Fragment key={row.code}>
                          <tr 
                            onClick={() => toggleRow(row.code)}
                            className="hover:bg-white/[0.04] transition-colors cursor-pointer group"
                          >
                            <td className="px-4 py-4 text-slate-500 group-hover:text-[#22c7ac] transition-colors">
                              {expandedRows.has(row.code) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </td>
                            <td className="px-6 py-4 font-bold text-white">{row.code}</td>
                            <td className="px-6 py-4 font-bold text-slate-200">{row.desc}</td>
                            <td className="px-6 py-4 font-bold text-white">{row.contractType || '-'}</td>
                            {activeTab === "consolidado" ? (
                               <td className="px-6 py-4 text-right font-bold text-[#22c7ac] text-base">{row.totalHeadcount}</td>
                            ) : (
                               <>
                                 {row.totalMonths.map((val: number, idx: number) => (
                                    <td key={idx} className="px-3 py-4 text-right font-bold text-[#22c7ac] text-sm">{val > 0 ? val : '-'}</td>
                                 ))}
                               </>
                            )}
                          </tr>
                          {expandedRows.has(row.code) && row.roles.map((r: any) => (
                            <tr key={r.id} className="bg-black/40 hover:bg-black/20 transition-colors group/role">
                              <td className="px-4 py-3"></td>
                              <td className="px-6 py-3"></td>
                                                            <td className="px-6 py-3"></td>
                              <td className="px-6 py-3 text-slate-400 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-1.5 h-1.5 rounded-full bg-slate-600"></div>
                                  {r.title}
                                </div>
                                {activeTab === "forecast" && (
                                  <button
                                    onClick={() => handleForecastDelete(row.id, r.roleId)}
                                    className="p-1 text-slate-500 hover:text-red-400 opacity-0 group-hover/role:opacity-100 transition-all rounded hover:bg-white/10"
                                    title="Excluir Cargo"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </td>
                              {activeTab === "consolidado" ? (
                                 <td className="px-6 py-3 text-right font-medium text-slate-300">{r.headcount}</td>
                              ) : (
                                 <>
                                   {r.months.map((val: number, idx: number) => (
                                      <td key={idx} className="px-3 py-3 text-right">
                                        {activeTab === "forecast" ? (
                                          <input
                                            type="number"
                                            value={val}
                                            onChange={(e) => handleForecastUpdate(row.id, r.roleId, idx, parseInt(e.target.value) || 0)}
                                            className="w-14 px-1 py-1 bg-black/30 border border-white/10 rounded text-right text-slate-300 focus:outline-none focus:ring-1 focus:ring-[#22c7ac] text-xs"
                                          />
                                        ) : (
                                          <span className="font-medium text-slate-400 text-xs">{val > 0 ? val : '-'}</span>
                                        )}
                                      </td>
                                   ))}
                                 </>
                              )}
                            </tr>
                          ))}
                          {expandedRows.has(row.code) && activeTab === "forecast" && (
                            <tr className="bg-black/40 border-t border-white/5">
                              <td colSpan={3} className="px-10 py-3">
                                {newRoleForm?.ccId === row.id ? (
                                  <form onSubmit={(e) => handleAddRoleSubmit(e, row.id)} className="flex items-center gap-2">
                                    <input
                                      autoFocus
                                      type="text"
                                      placeholder="Nome do novo cargo..."
                                      value={newRoleForm?.roleTitle || ""}
                                      onChange={e => setNewRoleForm({...newRoleForm!, roleTitle: e.target.value})}
                                      className="px-3 py-1.5 bg-black/40 border border-white/10 rounded text-sm text-white focus:outline-none focus:border-[#22c7ac]"
                                    />
                                    <button type="submit" className="p-1.5 bg-[#22c7ac] text-black rounded hover:bg-[#1eb39a] transition-colors"><Check className="w-4 h-4"/></button>
                                    <button type="button" onClick={() => setNewRoleForm(null)} className="p-1.5 bg-white/10 text-white rounded hover:bg-white/20 transition-colors"><X className="w-4 h-4"/></button>
                                  </form>
                                ) : (
                                  <button onClick={() => setNewRoleForm({ ccId: row.id, roleTitle: '' })} className="flex items-center gap-1.5 text-xs font-bold text-[#22c7ac] hover:text-[#1eb39a] transition-colors">
                                    <Plus className="w-3 h-3" /> Adicionar Novo Cargo
                                  </button>
                                )}
                              </td>
                              <td colSpan={12}></td>
                            </tr>
                          )}
                        </React.Fragment>
                      )))}
                    </tbody>
                    {activeTab !== "financeiro" && (
                      <tfoot className="bg-[#22c7ac]/10 border-t border-[#22c7ac]/30">
                        <tr>
                          <td className="px-4 py-4"></td>
                          <td className="px-6 py-4 font-bold text-white uppercase tracking-wider" colSpan={2}>
                            Total Geral (Filtrado)
                          </td>
                          {activeTab === "consolidado" ? (
                             <td className="px-6 py-4 text-right font-black text-[#22c7ac] text-lg">
                               {totalGeral}
                             </td>
                          ) : (
                             <>
                               {totalGeralMonths.map((val: number, idx: number) => (
                                  <td key={idx} className="px-3 py-4 text-right font-bold text-[#22c7ac] text-sm">{val > 0 ? val : '-'}</td>
                               ))}
                             </>
                          )}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                )}
              </div>

            </div>
          )}

        </div>
      </main>
    </div>
  );
}
