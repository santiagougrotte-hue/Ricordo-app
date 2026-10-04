import { describe, expect, it } from 'vitest';
import { arDay, arWhatsapp, toCsv } from './util';

describe('arWhatsapp', () => {
  it.each([
    ['11 5555 1234', '5491155551234'],
    ['011 15 5555-1234', '5491155551234'],
    ['+54 9 11 5555 1234', '5491155551234'],
    ['221 15 456 7890', '5492214567890'],
    ['123', null],
  ])('%s → %s', (raw, wa) => expect(arWhatsapp(raw)).toBe(wa));
});
it('arDay usa la hora de Buenos Aires', () => {
  expect(arDay('2026-10-04T02:30:00Z')).toBe('2026-10-03'); // 23:30 del sábado en AR
});
it('CSV con ; y comillas', () => {
  expect(toCsv([['a;b', 'dijo "hola"', 3]])).toBe('﻿"a;b";"dijo ""hola""";3');
});
