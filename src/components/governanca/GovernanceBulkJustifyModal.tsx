"use client";

import React, { useState } from "react";
import { X, ShieldCheck, UploadCloud, Check } from "lucide-react";

type BulkModalProps = {
  isOpen: boolean;
  selectedIds: string[];
  onClose: () => void;
  onSuccess: () => void;
};

export default function GovernanceBulkJustifyModal({ isOpen, selectedIds, onClose, onSuccess }: BulkModalProps) {
  const [justification, setJustification] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setJustification("");
      setNotes("");
      setFile(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!justification.trim() || selectedIds.length === 0) return;

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("ids", JSON.stringify(selectedIds));
      formData.append("justification", justification.trim());
      if (notes.trim()) formData.append("notes", notes.trim());
      if (file) formData.append("file", file);

      const res = await fetch("/api/governanca/bulk-justify", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Falha ao justificar em massa");
      onSuccess();
    } catch (err) {
      console.error(err);
      alert("Erro ao aplicar justificativa em massa.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#111c33] border border-white/10 rounded-2xl w-full max-w-lg text-slate-200 flex flex-col shadow-2xl overflow-hidden">
        <div className="flex justify-between items-center p-5 border-b border-white/10 bg-[#0a1122]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#22c7ac]" />
            <h2 className="text-lg font-bold text-white">Justificar em Massa ({selectedIds.length} selecionados)</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-sm">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">
              Justificativa Compartilhada <span className="text-red-400">*</span>
            </label>
            <textarea
              required
              rows={4}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Ex: Alteração de quadro aprovada devido à ampliação do escopo contratual a partir da competência..."
              className="w-full bg-[#0a1122] border border-white/10 rounded-xl p-3 text-white focus:border-[#22c7ac] outline-none resize-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">Observações adicionais (opcional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Ref. Chamado #40822 / Ata de Reunião com Cliente"
              className="w-full bg-[#0a1122] border border-white/10 rounded-xl p-3 text-white focus:border-[#22c7ac] outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">Evidência compartilhada (PDF, imagem, e-mail)</label>
            <div className="border-2 border-dashed border-white/10 rounded-xl p-4 text-center hover:border-white/30 transition-colors bg-[#0a1122] relative cursor-pointer">
              <input
                type="file"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <div className="flex flex-col items-center justify-center gap-1.5 text-slate-400">
                <UploadCloud className="w-6 h-6 text-[#22c7ac]" />
                <span className="text-xs font-medium">{file ? file.name : "Clique para anexar um documento a todos os registros"}</span>
              </div>
            </div>
          </div>

          <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-xs text-yellow-300">
            ℹ️ A justificativa e evidência serão gravadas individualmente em cada um dos <strong>{selectedIds.length}</strong> registros selecionados.
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-white text-xs font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !justification.trim()}
              className="px-5 py-2.5 bg-[#22c7ac] hover:bg-[#1db199] text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? "Salvando..." : <><Check className="w-4 h-4" /> Aplicar a {selectedIds.length} Itens</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
