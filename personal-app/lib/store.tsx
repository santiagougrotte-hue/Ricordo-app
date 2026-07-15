"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { emptyData, STORAGE_KEY, type AppData } from "./types";
import { supabase, supabaseConfigured } from "./supabase";

type SetData = (updater: AppData | ((d: AppData) => AppData)) => void;
export type SyncStatus = "local" | "syncing" | "synced" | "error";

interface StoreCtx {
  data: AppData;
  setData: SetData;
  resetToEmpty: () => void;
  ready: boolean;
  syncStatus: SyncStatus;
}

const Ctx = createContext<StoreCtx | null>(null);
const ROW_ID = "main";

function loadFromLocalStorage(): AppData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...emptyData(), ...JSON.parse(raw) };
  } catch {
    /* ignore corrupt storage */
  }
  return null;
}

function saveToLocalStorage(data: AppData) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* storage full/unavailable */
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setDataState] = useState<AppData>(() => emptyData());
  const [ready, setReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(supabaseConfigured ? "syncing" : "local");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushed = useRef<string | null>(null);

  // Initial load: local cache first for instant paint, then Supabase (source of truth).
  useEffect(() => {
    const local = loadFromLocalStorage();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial hydration, SSR has no window/localStorage
    if (local) setDataState(local);

    const client = supabase;
    if (!supabaseConfigured || !client) {
      setReady(true);
      return;
    }

    let cancelled = false;
    client
      .from("personal_app_state")
      .select("data")
      .eq("id", ROW_ID)
      .maybeSingle()
      .then(async ({ data: row, error }) => {
        if (cancelled) return;
        if (error) {
          setSyncStatus("error");
          setReady(true);
          return;
        }
        if (row?.data) {
          const remote = { ...emptyData(), ...(row.data as Partial<AppData>) };
          setDataState(remote);
          lastPushed.current = JSON.stringify(remote);
        } else {
          // First run: seed the shared row from whatever this device has locally.
          const seed = local ?? emptyData();
          setDataState(seed);
          lastPushed.current = JSON.stringify(seed);
          await client.from("personal_app_state").upsert({ id: ROW_ID, data: seed, updated_at: new Date().toISOString() });
        }
        setSyncStatus("synced");
        setReady(true);
      });

    const channel = client
      .channel("personal_app_state_changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "personal_app_state", filter: `id=eq.${ROW_ID}` },
        (payload) => {
          const incoming = payload.new?.data as AppData | undefined;
          if (!incoming) return;
          const serialized = JSON.stringify(incoming);
          if (serialized === lastPushed.current) return; // echo of our own write
          lastPushed.current = serialized;
          setDataState({ ...emptyData(), ...incoming });
          saveToLocalStorage(incoming);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      client.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      saveToLocalStorage(data);
      if (supabaseConfigured && supabase) {
        const serialized = JSON.stringify(data);
        if (serialized === lastPushed.current) return;
        lastPushed.current = serialized;
        setSyncStatus("syncing");
        const { error } = await supabase
          .from("personal_app_state")
          .upsert({ id: ROW_ID, data, updated_at: new Date().toISOString() });
        setSyncStatus(error ? "error" : "synced");
      }
    }, 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [data, ready]);

  const setData = useCallback<SetData>((updater) => {
    setDataState((prev) => (typeof updater === "function" ? (updater as (d: AppData) => AppData)(prev) : updater));
  }, []);

  const resetToEmpty = useCallback(() => setDataState(emptyData()), []);

  return (
    <Ctx.Provider value={{ data, setData, resetToEmpty, ready, syncStatus }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStore(): StoreCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
