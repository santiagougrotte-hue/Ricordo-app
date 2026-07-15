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

type SetData = (updater: RicordoData | ((d: RicordoData) => RicordoData)) => void;

interface StoreCtx {
  data: RicordoData;
  setData: SetData;
  resetToEmpty: () => void;
  reloadSeed: () => void;
  ready: boolean;
}

const Ctx = createContext<StoreCtx | null>(null);

function loadInitial(): RicordoData {
  if (typeof window === "undefined") return emptyData();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...emptyData(), ...JSON.parse(raw) };
  } catch {
    /* ignore corrupt storage */
  }
  return mapBackupToRicordoData(backupSeed);
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setDataState] = useState<RicordoData>(() => emptyData());
  const [ready, setReady] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Load from localStorage post-mount (SSR has no window) — must stay in an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDataState(loadInitial());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        /* storage full/unavailable */
      }
    }, 150);
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
    <Ctx.Provider value={{ data, setData, resetToEmpty, reloadSeed, ready }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStore(): StoreCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
