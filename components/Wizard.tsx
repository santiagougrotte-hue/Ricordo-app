"use client";

import React, { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Alert, Button } from "@/components/ui";

export interface WizardStep {
  title: string;
  content: React.ReactNode;
  /** Return an error message to block advancing, or null if the step is valid. */
  validate?: () => string | null;
}

export function Wizard({
  open,
  onClose,
  title,
  steps,
  onFinish,
  finishLabel = "Guardar",
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  steps: WizardStep[];
  onFinish: () => void;
  finishLabel?: string;
  wide?: boolean;
}) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setStep(0);
      setError(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isFirst = step === 0;
  const isLast = step === steps.length - 1;
  const current = steps[step];

  function goNext() {
    const err = current.validate?.() ?? null;
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    if (isLast) {
      onFinish();
    } else {
      setStep((s) => s + 1);
    }
  }

  function goBack() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  function goToStep(idx: number) {
    if (idx <= step) {
      setError(null);
      setStep(idx);
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-5" onClick={onClose}>
      <div
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-modal)] ${
          wide ? "max-w-[860px]" : "max-w-[640px]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 pb-4 pt-6">
          <h3 className="text-[17px] font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-text3 hover:bg-surface2 hover:text-text" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 border-b border-border px-6 py-3.5">
          {steps.map((s, idx) => (
            <React.Fragment key={s.title}>
              {idx > 0 && (
                <div className={`h-px flex-1 ${idx <= step ? "bg-accent" : "bg-border"}`} />
              )}
              <button
                type="button"
                onClick={() => goToStep(idx)}
                disabled={idx > step}
                className="flex items-center gap-1.5 disabled:cursor-default"
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                    idx < step
                      ? "bg-accent text-white"
                      : idx === step
                      ? "border-2 border-accent text-accent"
                      : "border border-border text-text3"
                  }`}
                >
                  {idx < step ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                </span>
                <span className={`hidden text-[12px] font-medium sm:inline ${idx === step ? "text-text" : "text-text3"}`}>
                  {s.title}
                </span>
              </button>
            </React.Fragment>
          ))}
        </div>

        <div className="overflow-y-auto px-6 py-5">
          {error && <Alert kind="danger">{error}</Alert>}
          {current.content}
        </div>

        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <Button variant="ghost" onClick={isFirst ? onClose : goBack}>
            {isFirst ? (
              "Cancelar"
            ) : (
              <span className="flex items-center gap-1">
                <ChevronLeft className="h-4 w-4" /> Atrás
              </span>
            )}
          </Button>
          <span className="text-[11px] text-text3">
            Paso {step + 1} de {steps.length}
          </span>
          <Button onClick={goNext}>
            {isLast ? (
              finishLabel
            ) : (
              <span className="flex items-center gap-1">
                Siguiente <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
