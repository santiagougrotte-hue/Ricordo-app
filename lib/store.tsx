"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { emptyData, STORAGE_KEY, type RicordoData } from "./types";
import { mapBackupToRicordoData } from "./seed";
import backupSeed from "./data/backup-seed.json";
import { supabase, supabaseConfigured } from "./supabase";

type SetData = (updater: RicordoData | ((d: RicordoData) => RicordoData)) => void;
export type SyncStatus = "local" | "syncing" | "synced" | "error";

interface StoreCtx {
  data: RicordoData;
  setData: SetData;
  resetToEmpty: () => void;
  reloadSeed: () => void;
  ready: boolean;
  syncStatus: SyncStatus;
}

const Ctx = createContext<StoreCtx | null>(null);
const ROW_ID = "main";

function loadFromLocalStorage(): RicordoData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...emptyData(), ...JSON.parse(raw) };
  } catch {
    /* ignore corrupt storage */
  }
  return null;
}

function saveToLocalStorage(data: RicordoData) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* storage full/unavailable */
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setDataState] = useState<RicordoData>(() => emptyData());
  const [ready, setReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(supabaseConfigured ? "syncing" : "local");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushed = useRef<string | null>(null);
  // True from the moment a local edit happens until it's confirmed pushed to Supabase.
  // Guards against a lagging realtime echo of an older save overwriting a newer local edit.
  const pendingSave = useRef(false);

  // Initial load: local cache first for instant paint, then Supabase (source of truth).
  useEffect(() => {
    const local = loadFromLocalStorage();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial hydration, SSR has no window/localStorage
    if (local) setDataState(local);

    const client = supabase;
    if (!supabaseConfigured || !client) {
      if (!local) setDataState(mapBackupToRicordoData(backupSeed));
      setReady(true);
      return;
    }

    let cancelled = false;
    client
      .from("app_state")
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
          const remote = { ...emptyData(), ...(row.data as Partial<RicordoData>) };
          setDataState(remote);
          lastPushed.current = JSON.stringify(remote);
        } else {
          // First run: seed the shared row from whatever this device has locally.
          const seed = local ?? mapBackupToRicordoData(backupSeed);
          setDataState(seed);
          lastPushed.current = JSON.stringify(seed);
          await client.from("app_state").upsert({ id: ROW_ID, data: seed, updated_at: new Date().toISOString() });
        }
        setSyncStatus("synced");
        setReady(true);
      });

    const channel = client
      .channel("app_state_changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "app_state", filter: `id=eq.${ROW_ID}` },
        (payload) => {
          // A local edit is queued or in flight: our own upcoming push will supersede
          // this event, so applying it now would revert the not-yet-saved local change.
          if (pendingSave.current) return;
          const incoming = payload.new?.data as RicordoData | undefined;
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
    pendingSave.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      saveToLocalStorage(data);
      if (supabaseConfigured && supabase) {
        const serialized = JSON.stringify(data);
        if (serialized !== lastPushed.current) {
          lastPushed.current = serialized;
          setSyncStatus("syncing");
          const { error } = await supabase
            .from("app_state")
            .upsert({ id: ROW_ID, data, updated_at: new Date().toISOString() });
          setSyncStatus(error ? "error" : "synced");
        }
      }
      pendingSave.current = false;
    }, 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [data, ready]);

  const setData = useCallback<SetData>((updater) => {
    setDataState((prev) => (typeof updater === "function" ? (updater as (d: RicordoData) => RicordoData)(prev) : updater));
  }, []);

  const resetToEmpty = useCallback(() => setDataState(emptyData()), []);
  const reloadSeed = useCallback(() => setDataState(mapBackupToRicordoData(backupSeed)), []);

  return (
    <Ctx.Provider value={{ data, setData, resetToEmpty, reloadSeed, ready, syncStatus }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStore(): StoreCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
