"use client";

import React, { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button, Field, Input } from "@/components/ui";

export function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const err = await signIn(email, password);
    setLoading(false);
    if (err) setError(err);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-border bg-surface p-7">
        <h1 className="mb-1 text-xl font-bold tracking-wide text-accent">Ricordo</h1>
        <p className="mb-6 text-xs text-text3">Pasta Artesanal — Ingresá para continuar</p>

        {error && (
          <div className="mb-4 rounded-md border border-red/20 bg-red-dim px-3 py-2 text-[12.5px] text-red">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3.5">
          <Field label="Email">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Field>
          <Field label="Contraseña">
            <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>

        <Button type="submit" disabled={loading} className="mt-6 w-full justify-center">
          {loading ? "Ingresando…" : "Ingresar"}
        </Button>
      </form>
    </div>
  );
}
