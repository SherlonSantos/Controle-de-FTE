"use client";

import React from "react";
import { X, FileText, ExternalLink, Download, AlertCircle } from "lucide-react";

interface EvidenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  evidence: {
    fileName: string;
    filePath: string;
    fileType?: string;
  } | null;
  itemInfo?: {
    contractName?: string;
    roleTitle?: string;
    competence?: string;
    variation?: number;
    justification?: string;
    responsible?: string;
  } | null;
}

export default function EvidenceModal({ isOpen, onClose, evidence, itemInfo }: EvidenceModalProps) {
  if (!isOpen || !evidence) return null;

  const isImage = 
    evidence.fileType?.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|svg)$/i.test(evidence.filePath) ||
    /\.(png|jpe?g|gif|webp|svg)$/i.test(evidence.fileName);

  const isPdf = 
    evidence.fileType === "application/pdf" ||
    /\.pdf$/i.test(evidence.filePath) ||
    /\.pdf$/i.test(evidence.fileName);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#111c33] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#22c7ac]/20 text-[#22c7ac] rounded-lg">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-snug">Evidência Formal de Governança</h3>
              <p className="text-xs text-slate-300 truncate max-w-md">{evidence.fileName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Item context banner */}
        {itemInfo && (
          <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <div>
              <span className="font-semibold text-[#041A71]">Contrato:</span> {itemInfo.contractName || '-'} |{" "}
              <span className="font-semibold text-[#041A71]">Cargo:</span> {itemInfo.roleTitle || '-'}
            </div>
            <div>
              <span className="font-semibold text-[#041A71]">Competência:</span> {itemInfo.competence || '-'} |{" "}
              <span className="font-semibold text-[#041A71]">Variação:</span>{" "}
              <span className={itemInfo.variation && itemInfo.variation > 0 ? "text-[#22c7ac] font-bold" : "text-red-500 font-bold"}>
                {itemInfo.variation && itemInfo.variation > 0 ? `+${itemInfo.variation}` : itemInfo.variation} FTEs
              </span>
            </div>
          </div>
        )}

        {/* Content Viewer */}
        <div className="flex-1 overflow-auto p-6 flex flex-col items-center justify-center bg-slate-100 min-h-[360px]">
          {isImage ? (
            <div className="flex flex-col items-center justify-center">
              <img
                src={evidence.filePath}
                alt={evidence.fileName}
                className="max-h-[60vh] max-w-full rounded-lg shadow-md object-contain border border-slate-200 bg-white"
              />
            </div>
          ) : isPdf ? (
            <div className="w-full h-[60vh]">
              <iframe
                src={evidence.filePath}
                title={evidence.fileName}
                className="w-full h-full rounded-lg border border-slate-300 bg-white shadow-inner"
              />
            </div>
          ) : (
            <div className="text-center p-8 bg-white rounded-xl shadow-sm border border-slate-200 max-w-md">
              <div className="w-16 h-16 bg-[#041A71]/10 text-[#041A71] rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8" />
              </div>
              <h4 className="font-bold text-slate-800 mb-1">{evidence.fileName}</h4>
              <p className="text-xs text-slate-500 mb-6">
                Este tipo de arquivo pode ser visualizado ou baixado diretamente pelo link abaixo.
              </p>
              <a
                href={evidence.filePath}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#041A71] hover:bg-[#031355] text-white rounded-lg text-sm font-semibold shadow transition-colors"
              >
                <Download className="w-4 h-4" /> Baixar Documento
              </a>
            </div>
          )}
        </div>

        {/* Justification note if available */}
        {itemInfo?.justification && (
          <div className="px-6 py-3 bg-white border-t border-slate-200 text-xs text-slate-700">
            <span className="font-bold text-slate-800">Justificativa da Governança: </span>
            <span className="italic">{itemInfo.justification}</span>
            {itemInfo.responsible && (
              <span className="block text-slate-500 mt-0.5">Responsável: {itemInfo.responsible}</span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between">
          <a
            href={evidence.filePath}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#041A71] hover:text-[#22c7ac] transition-colors"
          >
            <ExternalLink className="w-4 h-4" /> Abrir arquivo original em nova aba
          </a>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
