import { describe, expect, it } from 'vitest';
import { normalizePostalCode } from './postal';

describe('normalizePostalCode', () => {
  it.each([
    ['1884', '1884'], ['B1884ABC', '1884'], ['b 1884 abc', '1884'], ['1884-ABC', '1884'], [' 1885 ', '1885'], ['B1884', '1884'],
  ])('%s → %s', (raw, cp) => expect(normalizePostalCode(raw)).toBe(cp));
  it.each(['188', 'B18845', 'abc', '', '18 84 5', 'BB1884ABC'])('%s → null', (raw) => expect(normalizePostalCode(raw)).toBeNull());
});
