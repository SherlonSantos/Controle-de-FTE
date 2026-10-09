"use client";

import React, { useState } from "react";
import { X, ShieldCheck, FileText, CheckCircle, Clock, AlertCircle, UploadCloud, Calendar, User, Hash, Layers } from "lucide-react";

type DetailModalProps = {
  isOpen: boolean;
  record: any;
  onClose: () => void;
  onUpdate: () => void;
};

export default function GovernanceDetailModal({ isOpen, record, onClose, onUpdate }: DetailModalProps) {
  const [justification, setJustification] = useState("");
  const [isEditingJustification, setIsEditingJustification] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  React.useEffect(() => {
    if (record) {
      setJustification(record.justification || "");
      setIsEditingJustification(false);
      setFile(null);
    }
  }, [record]);

  if (!isOpen || !record) return null;

  const handleSaveJustification = async () => {
    if (!justification.trim()) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/governanca/${record.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          justification,
          justificationStatus: 'JUSTIFICADO',
        }),
      });

      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        await fetch(`/api/governanca/${record.id}/evidence`, {
          method: 'POST',
          body: formData,
        });
      }

      setIsEditingJustification(false);
      onUpdate();
    } catch (e) {
      console.error(e);
      alert("Erro ao salvar justificativa.");
    } finally {
      setIsSaving(false);
    }
  };

  const isUpload = record.origin === 'UPLOAD_FORECAST';

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#111c33] border border-white/10 rounded-2xl w-full max-w-3xl text-slate-200 flex flex-col max-h-[90vh] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-white/10 bg-[#0a1122]">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${isUpload ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'}`}>
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">Detalhamento da Movimentação</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide border ${
                  isUpload 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                    : 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                }`}>
                  {isUpload ? 'Upload Massivo' : 'Alteração Manual'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Trilha de auditoria e governança oficial de FTE</p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {/* Seção 1: Identificação */}
          <div className="bg-[#0a1122] rounded-xl p-4 border border-white/5 space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#22c7ac]" /> 1. Identificação da Posição
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-1">
              <div>
                <span className="text-xs text-slate-500">Competência</span>
                <div className="font-semibold text-white mt-0.5">{record.competence}</div>
              </div>
              <div>
                <span className="text-xs text-slate-500">Contrato</span>
                <div className="font-semibold text-white mt-0.5">{record.contract?.name || "N/A"}</div>
              </div>
              <div>
                <span className="text-xs text-slate-500">Centro de Custo</span>
                <div className="font-semibold text-white mt-0.5 font-mono text-xs">{record.costCenter?.code || "N/A"}</div>
                <div className="text-xs text-slate-400 truncate" title={record.costCenter?.description}>{record.costCenter?.description}</div>
              </div>
              <div>
                <span className="text-xs text-slate-500">Cargo Mestre (ID: {record.role?.id?.slice(0, 8)})</span>
                <div className="font-semibold text-[#22c7ac] mt-0.5">{record.role?.title || "N/A"}</div>
              </div>
            </div>
          </div>

          {/* Seção 2: Quantitativos */}
          <div className="bg-[#0a1122] rounded-xl p-4 border border-white/5 space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Hash className="w-4 h-4 text-[#22c7ac]" /> 2. Análise Quantitativa e Variação
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1 text-center">
              <div className="bg-[#111c33] p-3 rounded-lg border border-white/5">
                <span className="text-xs text-slate-400">PA Original</span>
                <div className="text-xl font-bold text-white mt-1">{record.paQuantity ?? record.previousQuantity}</div>
              </div>
              <div className="bg-[#111c33] p-3 rounded-lg border border-white/5">
                <span className="text-xs text-slate-400">Forecast Anterior</span>
                <div className="text-xl font-bold text-slate-300 mt-1">{record.previousForecastQuantity ?? record.previousQuantity}</div>
              </div>
              <div className="bg-[#111c33] p-3 rounded-lg border border-white/5">
                <span className="text-xs text-slate-400">Forecast Atual</span>
                <div className="text-xl font-bold text-[#22c7ac] mt-1">{record.currentForecastQuantity ?? record.finalQuantity}</div>
              </div>
              <div className="bg-[#111c33] p-3 rounded-lg border border-white/5">
                <span className="text-xs text-slate-400">Variação Versão</span>
                <div className={`text-xl font-bold mt-1 ${record.type === 'ACRESCIMO' ? 'text-green-400' : 'text-red-400'}`}>
                  {record.type === 'ACRESCIMO' ? '+' : '-'}{record.movedQuantity}
                </div>
              </div>
              <div className="bg-[#111c33] p-3 rounded-lg border border-white/5">
                <span className="text-xs text-slate-400">Desvio PA x FC</span>
                <div className="text-xl font-bold text-yellow-400 mt-1">
                  {(record.currentForecastQuantity ?? record.finalQuantity) - (record.paQuantity ?? record.previousQuantity) > 0 ? '+' : ''}
                  {(record.currentForecastQuantity ?? record.finalQuantity) - (record.paQuantity ?? record.previousQuantity)}
                </div>
              </div>
            </div>
            {record.isNewRole && (
              <div className="text-xs bg-blue-500/10 text-blue-400 p-2 rounded-lg border border-blue-500/20">
                ✨ <strong>Inclusão de Cargo:</strong> Esta posição não existia na base de referência anterior.
              </div>
            )}
            {record.isRemovedRole && (
              <div className="text-xs bg-red-500/10 text-red-400 p-2 rounded-lg border border-red-500/20">
                ⚠️ <strong>Exclusão de Cargo:</strong> Esta posição foi totalmente zerada nesta versão.
              </div>
            )}
          </div>

          {/* Seção 3: Governança & Justificativa */}
          <div className="bg-[#0a1122] rounded-xl p-4 border border-white/5 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#22c7ac]" /> 3. Governança e Justificativa
              </h3>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                record.justificationStatus === 'PENDENTE'
                  ? 'bg-yellow-400/10 text-yellow-400 border border-yellow-400/30'
                  : 'bg-green-400/10 text-green-400 border border-green-400/30'
              }`}>
                {record.justificationStatus === 'PENDENTE' ? 'Pendente de Justificativa' : 'Justificado'}
              </span>
            </div>

            {isEditingJustification ? (
              <div className="space-y-3 pt-1">
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  className="w-full bg-[#111c33] border border-white/10 rounded-lg p-3 text-white focus:border-[#22c7ac] outline-none h-24"
                  placeholder="Informe a justificativa técnica/operacional..."
                />
                
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 px-3 py-2 bg-[#111c33] border border-white/10 hover:border-white/20 rounded-lg text-xs cursor-pointer text-slate-300">
                    <UploadCloud className="w-4 h-4 text-[#22c7ac]" />
                    <span>{file ? file.name : "Anexar Evidência (PDF, imagem, e-mail)"}</span>
                    <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  </label>
                  
                  <button
                    onClick={handleSaveJustification}
                    disabled={isSaving || !justification.trim()}
                    className="bg-[#22c7ac] hover:bg-[#1db199] text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors ml-auto disabled:opacity-50"
                  >
                    {isSaving ? "Salvando..." : "Salvar Justificativa"}
                  </button>
                  <button
                    onClick={() => setIsEditingJustification(false)}
                    className="text-slate-400 hover:text-white text-xs px-3 py-2"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="pt-1 space-y-3">
                <div className="bg-[#111c33] p-3 rounded-lg border border-white/5 text-slate-300">
                  {record.justification || <span className="text-slate-500 italic">Nenhuma justificativa informada.</span>}
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Evidência:</span>
                    {record.hasEvidence && record.evidences?.length > 0 ? (
                      <a
                        href={record.evidences[0].filePath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[#22c7ac] hover:underline flex items-center gap-1 font-medium"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        {record.evidences[0].fileName}
                      </a>
                    ) : (
                      <span className="text-xs text-slate-500">Nenhuma evidência anexada</span>
                    )}
                  </div>

                  <button
                    onClick={() => setIsEditingJustification(true)}
                    className="text-xs text-[#22c7ac] hover:underline font-bold"
                  >
                    {record.justificationStatus === 'PENDENTE' ? 'Justificar Agora' : 'Editar Justificativa'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Seção 4: Auditoria & Rastreabilidade */}
          <div className="bg-[#0a1122] rounded-xl p-4 border border-white/5 space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#22c7ac]" /> 4. Trilha de Auditoria
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-1 text-xs">
              <div>
                <span className="text-slate-500">Lote de Importação:</span>
                <div className="font-mono text-slate-300 mt-0.5">{record.batch?.batchCode || "Alteração Direta"}</div>
              </div>
              <div>
                <span className="text-slate-500">Arquivo de Origem:</span>
                <div className="text-slate-300 mt-0.5 truncate" title={record.batch?.fileName || "Interface Web"}>
                  {record.batch?.fileName || "Interface Web"}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Registrado por:</span>
                <div className="text-slate-300 mt-0.5">{record.requester?.name || "Sistema"}</div>
              </div>
              <div>
                <span className="text-slate-500">Data de Registro:</span>
                <div className="text-slate-300 mt-0.5">
                  {record.createdAt ? new Date(record.createdAt).toLocaleString('pt-BR') : "N/A"}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Justificado por:</span>
                <div className="text-slate-300 mt-0.5">
                  {record.justifierUser?.name || (record.justificationStatus === 'JUSTIFICADO' ? (record.requester?.name || "Gestor") : "Pendente")}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Data da Justificativa:</span>
                <div className="text-slate-300 mt-0.5">
                  {record.justificationDate ? new Date(record.justificationDate).toLocaleString('pt-BR') : "Pendente"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-[#111c33] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-bold transition-colors"
          >
            Fechar Detalhes
          </button>
        </div>
      </div>
    </div>
  );
}
