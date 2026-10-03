// Set propio de íconos: grilla 24, trazo 1.5, puntas redondas (ver brand board §04).
const PATHS = {
  caja: <path d="M3.5 8.5h17V20h-17zM2.75 4.5h18.5v4H2.75zM9.5 12h5" />,
  bolsa: <path d="M5 8.5h14l-1.1 11.5H6.1zM9 8.5V7a3 3 0 0 1 6 0v1.5" />,
  cp: (
    <>
      <path d="M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 0 1 13 0c0 5.2-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  moto: (
    <>
      <circle cx="5.5" cy="17" r="2.75" />
      <circle cx="18.5" cy="17" r="2.75" />
      <path d="M8.25 17h6.5l2.5-6H13M5.5 17l3-6h4.5M15.5 6.5h2l1.5 4.5" />
    </>
  ),
  local: <path d="M4.5 10.5V20h15v-9.5M3 10.5 5 4h14l2 6.5zM10 20v-5h4v5" />,
  freezer: <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.6 12 6.2l2.5-1.6M9.5 19.4 12 17.8l2.5 1.6" />,
  olla: <path d="M4.5 10.5h15V16a4 4 0 0 1-4 4h-7a4 4 0 0 1-4-4zM2.5 10.5h19M9.5 7c-.8-1 .8-2 0-3M14.5 7c-.8-1 .8-2 0-3" />,
  reloj: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  charla: <path d="M4.6 19.4 5.8 16A8 8 0 1 1 8.5 18.6zM9.2 9.2c.2 2.8 2.8 5.4 5.6 5.6" />,
  transfer: <path d="M4 8.5h15M15.5 5 19 8.5 15.5 12M20 15.5H5M8.5 12 5 15.5 8.5 19" />,
  efectivo: (
    <>
      <path d="M3 6.5h18v11H3z" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 9.5v5M18 9.5v5" />
    </>
  ),
  sintacc: <path d="M12 21V10M12 10c-2.4-.6-3.5-2.6-3.5-5 2.4.4 3.5 2.4 3.5 5zm0 0c2.4-.6 3.5-2.6 3.5-5-2.4.4-3.5 2.4-3.5 5zM12 15c-2.4-.6-3.5-2.6-3.5-5M12 15c2.4-.6 3.5-2.6 3.5-5M4.5 4.5l15 15" />,
  mas: <path d="M12 5v14M5 12h14" />,
  menos: <path d="M5 12h14" />,
  cerrar: <path d="M6 6l12 12M18 6 6 18" />,
  flecha: <path d="M4 12h15M13.5 6.5 19 12l-5.5 5.5" />,
  volver: <path d="M20 12H5M10.5 6.5 5 12l5.5 5.5" />,
  ok: <path d="M5 12.5 9.5 17 19 7.5" />,
  tijera: (
    <>
      <circle cx="6" cy="7" r="2.6" />
      <circle cx="6" cy="17" r="2.6" />
      <path d="M8.2 8.4 20 17M8.2 15.6 20 7" />
    </>
  ),
  basura: <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10.5 11v5M13.5 11v5" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={'icon ' + (className ?? '')} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
