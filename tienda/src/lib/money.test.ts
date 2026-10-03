import { expect, it } from 'vitest';
import { money } from './money';

it('pesos con punto de miles', () => {
  expect(money(9800)).toBe('$9.800');
  expect(money(150000)).toBe('$150.000');
  expect(money(0)).toBe('$0');
});
