// Capa de movimiento (chunk aparte, se carga cuando el navegador está libre).
// Tres gestos del brand board, cada uno con su curva: sellar, apoyar (papel), anotar (lápiz).
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CustomEase } from 'gsap/CustomEase';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger, CustomEase);
CustomEase.create('sello', 'M0,0 C0.55,-0.3 0.25,1.45 1,1');
CustomEase.create('papel', 'M0,0 C0.16,0.84 0.3,1 1,1');
CustomEase.create('lapiz', 'M0,0 C0.6,0.05 0.35,0.95 1,1');

let lenis: Lenis | null = null;

/** Scroll suave. Se frena solo cuando hay un panel abierto (html.no-scroll). */
export function initSmoothScroll(): void {
  if (lenis) return;
  lenis = new Lenis({ lerp: 0.11, anchors: { offset: -120 }, prevent: (node) => !!node.closest?.('dialog') });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis?.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  new MutationObserver(() => {
    if (document.documentElement.classList.contains('no-scroll')) lenis?.stop();
    else lenis?.start();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  (window as Window & { __lenis?: Lenis }).__lenis = lenis;
}

type Kind = 'paper' | 'stamp' | 'hand' | 'rise';

// Solo opacidad y transform (nunca visibility): lo que espera su animación sigue siendo enfocable y legible por lectores.
const FROM: Record<Kind, gsap.TweenVars> = {
  paper: { y: -40, rotation: -4, opacity: 0 },
  stamp: { scale: 1.6, rotation: -22, opacity: 0 },
  hand: { clipPath: 'inset(0 100% 0 0)' },
  rise: { y: 28, opacity: 0 },
};
const TO: Record<Kind, gsap.TweenVars> = {
  paper: { y: 0, rotation: 0, opacity: 1, duration: 0.8, ease: 'papel', clearProps: 'transform,opacity' },
  stamp: { scale: 1, rotation: 0, opacity: 1, duration: 0.5, ease: 'sello', clearProps: 'transform,opacity' },
  hand: { clipPath: 'inset(0 0% 0 0)', duration: 0.9, ease: 'lapiz', clearProps: 'clipPath' },
  rise: { y: 0, opacity: 1, duration: 0.7, ease: 'papel', clearProps: 'transform,opacity' },
};

/**
 * Anima al entrar en pantalla todo lo marcado con data-reveal dentro de `root`.
 * Lo que ya está visible al llamar NO se toca (nunca se oculta algo que el usuario ya vio).
 */
export function reveal(root: HTMLElement): () => void {
  const ctx = gsap.context(() => {
    const fold = innerHeight * 0.92;
    const byKind = new Map<Kind, HTMLElement[]>();
    root.querySelectorAll<HTMLElement>('[data-reveal]:not([data-revealed])').forEach((el) => {
      el.dataset.revealed = '1';
      if (el.getBoundingClientRect().top < fold) return;
      const k = (el.dataset.reveal as Kind) || 'rise';
      byKind.set(k, [...(byKind.get(k) ?? []), el]);
    });
    for (const [k, els] of byKind) {
      gsap.set(els, FROM[k]);
      ScrollTrigger.batch(els, {
        start: 'top 88%',
        once: true,
        onEnter: (batch) => gsap.to(batch, { ...TO[k], stagger: 0.07, overwrite: true }),
      });
    }
    // Paralaje leve en fotos grandes (solo pantallas anchas y puntero fino).
    if (matchMedia('(min-width: 900px) and (pointer: fine)').matches) {
      root.querySelectorAll<HTMLElement>('[data-parallax]').forEach((el) => {
        gsap.fromTo(el, { yPercent: 4 }, { yPercent: -4, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
      });
    }
  }, root);
  // Si el foco (teclado) llega a algo que todavía no apareció, se muestra al instante.
  const onFocus = (e: FocusEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-reveal]');
    if (el && Number(getComputedStyle(el).opacity) < 1) {
      const k = (el.dataset.reveal as Kind) || 'rise';
      gsap.to(el, { ...TO[k], duration: 0.2, overwrite: true });
    }
  };
  root.addEventListener('focusin', onFocus);
  ScrollTrigger.refresh();
  return () => {
    root.removeEventListener('focusin', onFocus);
    ctx.revert();
  };
}

export function scrollTop(): void {
  if (lenis) lenis.scrollTo(0, { immediate: true });
  else window.scrollTo(0, 0);
}
