import { useLocation } from 'react-router-dom';
import { useStore } from '../state/store';
import { whatsappLink } from '../lib/whatsapp';
import { PASTA_LABEL } from '../lib/types';

/** Logo de WhatsApp (glifo oficial simplificado). */
export function WhatsAppLogo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M16 3C8.8 3 3 8.7 3 15.8c0 2.5.7 4.9 2 7L3 29l6.4-2c2 1.1 4.3 1.7 6.6 1.7 7.2 0 13-5.7 13-12.8S23.2 3 16 3zm0 23.4c-2.1 0-4.1-.6-5.9-1.6l-.4-.3-3.8 1.2 1.2-3.7-.3-.4a10.4 10.4 0 0 1-1.7-5.8c0-5.8 4.8-10.5 10.8-10.5S26.8 10 26.8 15.8 22 26.4 16 26.4zm5.9-7.9c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2l-1 1.2c-.2.2-.4.2-.7.1a8.8 8.8 0 0 1-4.4-3.8c-.3-.6.3-.5.9-1.7.1-.2 0-.4 0-.5l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.8s1.2 3.3 1.4 3.5c.2.2 2.4 3.6 5.8 5 2.2.9 3 1 4.1.8.7-.1 1.9-.8 2.2-1.5.3-.7.3-1.4.2-1.5-.1-.2-.3-.3-.7-.4z"
      />
    </svg>
  );
}

/** Botón flotante para hacer preguntas por WhatsApp. El mensaje se adapta a la página (por ejemplo, el gusto que estás mirando). */
export function WhatsAppButton() {
  const { settings, products } = useStore();
  const { pathname } = useLocation();
  if (!settings) return null;
  const slug = /^\/cajas\/([^/]+)/.exec(pathname)?.[1];
  const product = slug ? products.find((p) => p.slug === slug) : undefined;
  const text = product
    ? `Hola Ricordo! Tengo una consulta sobre los ${PASTA_LABEL[product.pastaType].toLowerCase()} de ${product.name.toLowerCase()}.`
    : pathname === '/checkout'
      ? 'Hola Ricordo! Tengo una duda con mi pedido.'
      : 'Hola Ricordo! Tengo una consulta.';
  const href = whatsappLink(settings.whatsappPhone, text);
  if (!href) return null;
  return (
    <aside aria-label="Consultas por WhatsApp">
    <a className="wa-fab" href={href} target="_blank" rel="noopener noreferrer" aria-label="¿Dudas? Escribinos por WhatsApp (se abre en una pestaña nueva)">
      <span className="wa-fab-logo"><WhatsAppLogo size={26} /></span>
      <span className="wa-fab-text"><b>¿Dudas?</b> Escribinos</span>
    </a>
    </aside>
  );
}
