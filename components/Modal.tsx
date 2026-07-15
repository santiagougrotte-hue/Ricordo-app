"use client";

import React, { useEffect } from "react";

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-5"
      onClick={onClose}
    >
      <div
        className={`max-h-[90vh] w-full overflow-y-auto rounded-xl border border-border bg-surface p-6 ${
          wide ? "max-w-[860px]" : "max-w-[640px]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-[18px] flex items-center justify-between">
          <h3 className="text-[17px] font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 text-xl leading-none text-text3 hover:text-text"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        {children}
        {footer && (
          <div className="mt-[18px] flex justify-end gap-2 border-t border-border pt-4">{footer}</div>
        )}
      </div>
    </div>
  );
}
