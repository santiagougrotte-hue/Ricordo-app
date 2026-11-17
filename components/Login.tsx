"use client";

import React, { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button, Field, Input } from "@/components/ui";

type Modo = "ingresar" | "olvide" | "enviado";

export function Login() {
  const { signIn, sendReset, recovering, updatePassword } = useAuth();
  const [modo, setModo] = useState<Modo>("ingresar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function ingresar(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const err = await signIn(email, password);
    setLoading(false);
    if (err) setError(err === "Invalid login credentials" ? "El email o la contraseña no coinciden." : err);
  }

  async function pedirMail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const err = await sendReset(email);
    setLoading(false);
    if (err) setError(err);
    else setModo("enviado");
  }

  async function guardarNueva(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Usá al menos 8 caracteres.");
    if (password !== password2) return setError("Las dos contraseñas no coinciden.");
    setLoading(true);
    setError(null);
    const err = await updatePassword(password);
    setLoading(false);
    if (err) setError(err);
  }

  const marco = (titulo: string, children: React.ReactNode, onSubmit?: (e: React.FormEvent) => void) => (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-xl border border-border bg-surface p-7">
        <h1 className="mb-1 text-xl font-bold tracking-wide text-accent">Ricordo</h1>
        <p className="mb-6 text-xs text-text3">{titulo}</p>
        {error && (
          <div role="alert" className="mb-4 rounded-md border border-red/20 bg-red-dim px-3 py-2 text-[12.5px] text-red">
            {error}
          </div>
        )}
        {children}
      </form>
    </div>
  );

  if (recovering) {
    return marco(
      "Elegí tu contraseña nueva",
      <>
        <div className="flex flex-col gap-3.5">
          <Field label="Contraseña nueva">
            <Input type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </Field>
          <Field label="Repetila">
            <Input type="password" required autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
          </Field>
        </div>
        <Button type="submit" disabled={loading} className="mt-6 w-full justify-center">
          {loading ? "Guardando…" : "Guardar contraseña"}
        </Button>
      </>,
      guardarNueva
    );
  }

  if (modo === "enviado") {
    return marco(
      "Revisá tu mail",
      <>
        <p className="text-[13px] leading-relaxed text-text2">
          Si <strong className="text-text">{email}</strong> es tu usuario, te llegó un mail con un link para crear una contraseña nueva. Abrilo
          desde este mismo dispositivo. Si no lo ves, fijate en spam.
        </p>
        <Button type="button" variant="ghost" className="mt-6 w-full justify-center" onClick={() => setModo("ingresar")}>
          Volver a ingresar
        </Button>
      </>
    );
  }

  if (modo === "olvide") {
    return marco(
      "Te mandamos un link para crear una contraseña nueva",
      <>
        <Field label="Email">
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Field>
        <Button type="submit" disabled={loading} className="mt-6 w-full justify-center">
          {loading ? "Enviando…" : "Enviar link"}
        </Button>
        <button type="button" onClick={() => { setError(null); setModo("ingresar"); }} className="mt-4 w-full min-h-[36px] text-[12.5px] text-text3 hover:text-text">
          Volver
        </button>
      </>,
      pedirMail
    );
  }

  return marco(
    "Pasta Artesanal — Ingresá para continuar",
    <>
      <div className="flex flex-col gap-3.5">
        <Field label="Email">
          <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Field>
        <Field label="Contraseña">
          <Input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      </div>
      <Button type="submit" disabled={loading} className="mt-6 w-full justify-center">
        {loading ? "Ingresando…" : "Ingresar"}
      </Button>
      <button type="button" onClick={() => { setError(null); setModo("olvide"); }} className="mt-4 w-full min-h-[36px] text-[12.5px] text-text3 hover:text-text">
        ¿Olvidaste tu contraseña?
      </button>
    </>,
    ingresar
  );
}
