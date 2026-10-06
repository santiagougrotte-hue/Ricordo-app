// Avisos push en este celular: permiso del navegador + service worker + registro en el servidor.
import { adminApi } from '../lib/api/admin';

const SW_URL = '/admin-sw.js';
const SCOPE = '/admin';

export type PushState =
  | 'unsupported' // el navegador no tiene push
  | 'ios-install' // iPhone/iPad: primero hay que agregar el panel a la pantalla de inicio
  | 'denied' // el permiso de notificaciones está bloqueado
  | 'off'
  | 'on';

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function supported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const reg = (await navigator.serviceWorker.getRegistration(SCOPE)) ?? (await navigator.serviceWorker.register(SW_URL, { scope: SCOPE }));
  await navigator.serviceWorker.ready;
  return reg;
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return isIOS() && !isStandalone() ? 'ios-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration(SCOPE);
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  const device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Otro';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return [device, browser].filter(Boolean).join(' · ');
}

/** Pide permiso (tiene que ser dentro de un toque del usuario) y registra este celular. */
export async function enablePush(): Promise<void> {
  if (!supported()) throw new Error(isIOS() ? 'En iPhone, primero agregá el panel a la pantalla de inicio y abrilo desde ahí.' : 'Este navegador no permite notificaciones push.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('No diste permiso para las notificaciones. Activalo en los ajustes del navegador para este sitio.');
  const { publicKey } = await adminApi.getPush();
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await adminApi.subscribePush(sub.toJSON(), deviceLabel());
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration(SCOPE);
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await adminApi.unsubscribePush(sub.endpoint).catch(() => {});
  await sub.unsubscribe();
}
