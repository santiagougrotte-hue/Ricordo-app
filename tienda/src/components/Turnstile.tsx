import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error('turnstile'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export interface TurnstileHandle {
  reset: () => void;
}

/** Captcha de Cloudflare: invisible salvo que Cloudflare necesite que el cliente toque algo. */
export const Turnstile = forwardRef<TurnstileHandle, { siteKey: string; onToken: (t: string | null) => void }>(function Turnstile(
  { siteKey, onToken },
  ref,
) {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const cb = useRef(onToken);
  cb.current = onToken;

  useImperativeHandle(ref, () => ({
    reset: () => {
      cb.current(null);
      if (id.current) window.turnstile?.reset(id.current);
    },
  }));

  useEffect(() => {
    let alive = true;
    loadScript()
      .then(() => {
        if (!alive || !box.current || !window.turnstile) return;
        id.current = window.turnstile.render(box.current, {
          sitekey: siteKey,
          appearance: 'interaction-only',
          language: 'es',
          size: 'flexible',
          callback: (t: string) => cb.current(t),
          'expired-callback': () => cb.current(null),
          'error-callback': () => cb.current(null),
        });
      })
      .catch(() => cb.current(null));
    return () => {
      alive = false;
      if (id.current) window.turnstile?.remove(id.current);
      id.current = null;
    };
  }, [siteKey]);

  return <div ref={box} className="turnstile" />;
});
