import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

/** Panel modal sobre <dialog> nativo: atrapa el foco, cierra con Esc y deja el fondo inerte. */
export function Sheet({ open, onClose, title, side = 'right', children, footer }: {
  open: boolean; onClose: () => void; title: string; side?: 'right' | 'bottom'; children: ReactNode; footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      document.documentElement.classList.add('no-scroll');
    } else if (!open && d.open) {
      d.close();
    }
    if (!open) document.documentElement.classList.remove('no-scroll');
  }, [open]);
  useEffect(() => () => document.documentElement.classList.remove('no-scroll'), []);

  return (
    <dialog
      ref={ref}
      className={`sheet sheet-${side}`}
      aria-label={title}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // click en el velo
      }}
    >
      <div className="sheet-panel">
        <header className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <Icon name="cerrar" />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </div>
    </dialog>
  );
}
