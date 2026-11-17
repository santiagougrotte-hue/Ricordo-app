"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "./supabase";

interface AuthCtx {
  session: Session | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  /** Manda el mail para crear una contraseña nueva (vuelve a esta misma dirección). */
  sendReset: (email: string) => Promise<string | null>;
  /** true al volver del link del mail: hay que pedir la contraseña nueva antes de entrar. */
  recovering: boolean;
  updatePassword: (password: string) => Promise<string | null>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabaseConfigured);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!supabase) return "Supabase no está configurado.";
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  const sendReset = async (email: string) => {
    if (!supabase) return "Supabase no está configurado.";
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    return error ? error.message : null;
  };

  const updatePassword = async (password: string) => {
    if (!supabase) return "Supabase no está configurado.";
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) setRecovering(false);
    return error ? error.message : null;
  };

  return (
    <Ctx.Provider value={{ session, ready, signIn, signOut, sendReset, recovering, updatePassword }}>{children}</Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
