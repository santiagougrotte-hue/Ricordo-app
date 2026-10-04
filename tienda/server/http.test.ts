import { describe, expect, it } from 'vitest';
import { ipHash, readCookie, sameText, signSession, verifySession } from './http';

describe('sesión firmada', () => {
  const t = signSession('duenio@ricordo.com', 'secreto', 1000);
  it('válida', () => expect(verifySession(t, 'secreto', 2000)).toBe('duenio@ricordo.com'));
  it('otra clave → inválida', () => expect(verifySession(t, 'otra', 2000)).toBeNull());
  it('adulterada → inválida', () => {
    const [p, s] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ e: 'hacker@x.com', x: 9e15 })).toString('base64url');
    expect(verifySession(`${forged}.${s}`, 'secreto', 2000)).toBeNull();
    expect(verifySession(`${p}.${s}x`, 'secreto', 2000)).toBeNull();
  });
  it('vencida (7 días) → inválida', () => expect(verifySession(t, 'secreto', 1000 + 8 * 86400_000)).toBeNull());
  it('lee la cookie', () => expect(readCookie(new Request('http://x', { headers: { cookie: `a=1; ricordo_admin=${t}` } }))).toBe(t));
});
it('sameText', () => {
  expect(sameText('abc', 'abc')).toBe(true);
  expect(sameText('abc', 'abd')).toBe(false);
});
it('ipHash no guarda la IP', () => expect(ipHash('1.2.3.4', 's')).not.toContain('1.2.3.4'));
