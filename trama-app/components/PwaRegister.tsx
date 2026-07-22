"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* offline caching is a nice-to-have, ignore registration failures */
      });
    }
  }, []);
  return null;
}
