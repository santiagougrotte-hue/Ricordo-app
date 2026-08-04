"use client";

import React, { useRef, useState } from "react";
import { Paperclip, X, FileText } from "lucide-react";
import type { Adjunto } from "@/lib/types";

const MAX_BYTES = 4 * 1024 * 1024;

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileAttach({
  value,
  onChange,
  label,
  accept = "image/*,application/pdf",
}: {
  value?: Adjunto;
  onChange: (a: Adjunto | undefined) => void;
  label?: string;
  accept?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File) {
    if (file.size > MAX_BYTES) {
      setError("El archivo supera los 4MB. Elegí uno más liviano.");
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      onChange({ nombre: file.name, tipo: file.type, tamano: file.size, data: reader.result as string });
    };
    reader.readAsDataURL(file);
  }

  return (
    <div>
      {label && <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-text3">{label}</label>}
      {value ? (
        <div className="flex items-center gap-2.5 rounded-md border border-border bg-surface2/40 p-2">
          {value.tipo.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element -- base64 data URL, not an optimizable remote asset
            <img src={value.data} alt={value.nombre} className="h-10 w-10 shrink-0 rounded object-cover" />
          ) : (
            <FileText className="h-8 w-8 shrink-0 text-text3" />
          )}
          <a
            href={value.data}
            download={value.nombre}
            className="flex-1 truncate text-[12.5px] text-text2 hover:text-accent"
            title={value.nombre}
          >
            {value.nombre}
            <span className="ml-1.5 text-text3">({formatSize(value.tamano)})</span>
          </a>
          <button type="button" onClick={() => onChange(undefined)} className="shrink-0 text-red hover:text-red/70" aria-label="Quitar adjunto">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-[12.5px] text-text3 hover:border-accent hover:text-accent"
        >
          <Paperclip className="h-3.5 w-3.5" /> Adjuntar archivo
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      {error && <p className="mt-1 text-[11px] text-red">{error}</p>}
    </div>
  );
}
