/** Hueco neutro para una foto real: dice qué foto va. Nunca ilustraciones. */
export function Placeholder({ note, ratio = '4 / 5', tape = true, className }: { note: string; ratio?: string; tape?: boolean; className?: string }) {
  return (
    <div className={'ph ' + (className ?? '')} style={{ aspectRatio: ratio }} role="img" aria-label={`Foto pendiente: ${note}`}>
      {tape && <span className="tape" aria-hidden="true" />}
      <span className="ph-note" aria-hidden="true">
        foto real: {note}
      </span>
    </div>
  );
}
