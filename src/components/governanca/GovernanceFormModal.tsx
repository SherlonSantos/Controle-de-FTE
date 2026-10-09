"use client";

import React, { useState, useEffect } from "react";
import { X, UploadCloud, FileText, ChevronRight, Check, ShieldCheck } from "lucide-react";

type ModalProps = {
  isOpen: boolean;
  editRecord?: any;
  onClose: () => void;
  onSuccess: () => void;
};

type ContextItem = {
  costCenterId: string;
  costCenterName: string;
  roleId: string;
  roleName: string;
  plannedFte: number;
  adjustedFte: number;
};

export default function GovernanceFormModal({ isOpen, editRecord, onClose, onSuccess }: ModalProps) {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form State
  const [competence, setCompetence] = useState("");
  const [contractId, setContractId] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [type, setType] = useState("ACRESCIMO");
  const [movedQuantity, setMovedQuantity] = useState(1);
  const [justification, setJustification] = useState("");
  const [file, setFile] = useState<File | null>(null);
  
  // Data State
  const [contracts, setContracts] = useState<any[]>([]);
  const [contextData, setContextData] = useState<ContextItem[]>([]);
  
  useEffect(() => {
    if (isOpen) {
      fetch('/api/contract').then(res => res.json()).then(data => {
         if (Array.isArray(data)) setContracts(data);
      }).catch(e => console.error(e));
      
      if (editRecord) {
        setCompetence(editRecord.competence || "");
        setContractId(editRecord.contractId || "");
        setCostCenterId(editRecord.costCenterId || "");
        setRoleId(editRecord.roleId || "");
        setType(editRecord.type || "ACRESCIMO");
        setMovedQuantity(editRecord.movedQuantity || 1);
        setJustification(editRecord.justification || "");
      } else {
        setCompetence("");
        setContractId("");
        setCostCenterId("");
        setRoleId("");
        setType("ACRESCIMO");
        setMovedQuantity(1);
        setJustification("");
      }
      setStep(1);
      setFile(null);
    }
  }, [isOpen, editRecord]);

  useEffect(() => {
    if (competence && contractId) {
      fetch(`/api/governanca/context?competence=${competence}&contractId=${contractId}`)
        .then(res => res.json())
        .then(data => {
           if (Array.isArray(data)) setContextData(data);
        })
        .catch(e => console.error(e));
    } else {
      setContextData([]);
    }
  }, [competence, contractId]);

  const availableCostCenters = Array.from(new Set(contextData.map(c => c.costCenterId)))
    .map(id => contextData.find(c => c.costCenterId === id));

  const availableRolesRaw = contextData.filter(c => c.costCenterId === costCenterId);
  const availableRoles = Array.from(new Map(availableRolesRaw.map(r => [r.roleId, r])).values());

  const selectedContext = availableRoles.find(r => r.roleId === roleId);
  const currentQuantity = selectedContext?.adjustedFte || 0;
  
  let finalQuantity = currentQuantity;
  if (type === 'ACRESCIMO') finalQuantity += Number(movedQuantity);
  if (type === 'RETIRADA') finalQuantity -= Number(movedQuantity);
  if (type === 'CORRECAO') finalQuantity = Number(movedQuantity);

  const handleSubmit = async () => {
    if (!competence || !contractId || !roleId || !justification) return;
    setIsSubmitting(true);
    try {
      const payload = {
        competence,
        contractId,
        costCenterId: costCenterId || null,
        roleId,
        type,
        previousQuantity: currentQuantity,
        movedQuantity,
        justification
      };

      const url = editRecord ? `/api/governanca/${editRecord.id}` : '/api/governanca';
      const method = editRecord ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("Falha ao salvar");
      const record = await res.json();

      if (file && record.id) {
        const formData = new FormData();
        formData.append('file', file);
        await fetch(`/api/governanca/${record.id}/evidence`, {
          method: 'POST',
          body: formData
        });
      }

      onSuccess();
    } catch (e) {
      console.error(e);
      alert("Ocorreu um erro ao salvar.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-[#111c33] border border-white/10 rounded-xl w-full max-w-2xl text-slate-200 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b border-white/10">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#22c7ac]" />
            {editRecord ? "Editar Solicitação de Governança" : "Nova Solicitação de Governança"}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-md">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Step 1: Contexto */}
          <div className="space-y-4">
            <h3 className="font-semibold text-white">1. Seleção de Contexto</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm">Competência</label>
                <input 
                  type="text" 
                  placeholder="Ex: 01/2026"
                  className="w-full bg-[#0a1122] border border-white/10 rounded-lg p-2 focus:border-[#22c7ac] outline-none"
                  value={competence}
                  onChange={e => setCompetence(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm">Contrato</label>
                <select 
                  className="w-full bg-[#0a1122] border border-white/10 rounded-lg p-2 focus:border-[#22c7ac] outline-none"
                  value={contractId}
                  onChange={e => setContractId(e.target.value)}
                >
                  <option value="">Selecione...</option>
                  {/* Se API de contratos nao existir, isso ficará vazio. 
                      Para o MVP, a API /api/contract/list ou o endpoint de suporte precisará retornar. */}
                  {contracts.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                  {contracts.length === 0 && <option value="" disabled>Nenhum contrato encontrado</option>}
                </select>
              </div>
              
              <div className="space-y-1">
                <label className="text-sm">Centro de Custo</label>
                <select 
                  className="w-full bg-[#0a1122] border border-white/10 rounded-lg p-2 focus:border-[#22c7ac] outline-none disabled:opacity-50"
                  value={costCenterId}
                  onChange={e => setCostCenterId(e.target.value)}
                  disabled={!contractId || availableCostCenters.length === 0}
                >
                  <option value="">Selecione...</option>
                  {availableCostCenters.map((cc: any) => (
                    <option key={cc?.costCenterId} value={cc?.costCenterId}>{cc?.costCenterName}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-sm">Cargo</label>
                <select 
                  className="w-full bg-[#0a1122] border border-white/10 rounded-lg p-2 focus:border-[#22c7ac] outline-none disabled:opacity-50"
                  value={roleId}
                  onChange={e => setRoleId(e.target.value)}
                  disabled={!costCenterId || availableRoles.length === 0}
                >
                  <option value="">Selecione...</option>
                  {availableRoles.map((r: any) => (
                    <option key={r.roleId} value={r.roleId}>{r.roleName}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Step 2: Movimentação */}
          {selectedContext && (
            <div className="space-y-4 pt-4 border-t border-white/10">
              <h3 className="font-semibold text-white">2. Detalhes da Alteração</h3>
              
              {/* Resumo Visual */}
              <div className="flex items-center justify-between bg-[#0a1122] p-4 rounded-lg border border-white/5">
                <div className="text-center">
                  <div className="text-sm text-slate-400">PA Atual</div>
                  <div className="text-2xl font-bold">{currentQuantity}</div>
                </div>
                <ChevronRight className="w-6 h-6 text-slate-500" />
                <div className="text-center">
                  <div className="text-sm text-slate-400">Movimentação</div>
                  <div className={`text-2xl font-bold ${type === 'ACRESCIMO' ? 'text-green-400' : type === 'RETIRADA' ? 'text-red-400' : 'text-blue-400'}`}>
                    {type === 'ACRESCIMO' ? '+' : type === 'RETIRADA' ? '-' : ''}{movedQuantity}
                  </div>
                </div>
                <ChevronRight className="w-6 h-6 text-slate-500" />
                <div className="text-center">
                  <div className="text-sm text-slate-400">Qtd. Final</div>
                  <div className="text-2xl font-bold text-[#22c7ac]">{finalQuantity}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm">Tipo de Alteração</label>
                  <select 
                    className="w-full bg-[#0a1122] border border-white/10 rounded-lg p-2 focus:border-[#22c7ac] outline-none"
                    value={type}
                    onChange={e => setType(e.target.value)}
                  >
                    <option value="ACRESCIMO">Acréscimo</option>
                    <option value="RETIRADA">Retirada</option>
                    <option value="CORRECAO">Correção</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm">Quantidade</label>
                  <input 
                    type="number" 
                    min="1"
                    className="w-full bg-[#0a1122] border border-white/10 rounded-lg p-2 focus:border-[#22c7ac] outline-none"
                    value={movedQuantity}
                    onChange={e => setMovedQuantity(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm">Justificativa <span className="text-red-400">*</span></label>
                <textarea 
                  className="w-full bg-[#0a1122] border border-white/10 rounded-lg p-2 focus:border-[#22c7ac] outline-none h-24 resize-none"
                  placeholder="Motivo da alteração..."
                  value={justification}
                  onChange={e => setJustification(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm">Evidência (Opcional)</label>
                <div className="border-2 border-dashed border-white/10 rounded-lg p-4 text-center hover:border-white/30 transition-colors bg-[#0a1122] relative">
                  <input 
                    type="file" 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={e => setFile(e.target.files?.[0] || null)}
                  />
                  <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                    <UploadCloud className="w-8 h-8" />
                    <span>{file ? file.name : "Clique ou arraste o arquivo aqui"}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-[#111c33] rounded-b-xl">
          <button 
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-slate-300 hover:bg-white/10 transition-colors"
          >
            Cancelar
          </button>
          <button 
            onClick={handleSubmit}
            disabled={!selectedContext || !justification || movedQuantity <= 0 || isSubmitting}
            className="px-4 py-2 rounded-lg bg-[#22c7ac] text-white hover:bg-[#1da891] transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Enviando..." : <><Check className="w-4 h-4" /> Confirmar Solicitação</>}
          </button>
        </div>
      </div>
    </div>
  );
}
