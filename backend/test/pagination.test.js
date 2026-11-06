import { describe, it, expect } from 'vitest';
import { parsePage, parseLimit, MAX_PAGE } from '../src/lib/pagination.js';

describe('parsePage', () => {
  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['zero', '0'],
    ['negative', '-4'],
    ['not a number', 'abc'],
    ['exponent form', '1e9'],
  ])('treats %s as page 1', (_label, value) => {
    expect(parsePage(value)).toBe(1);
  });

  it('passes through an ordinary page number', () => {
    expect(parsePage('7')).toBe(7);
  });

  it('clamps a page whose offset Postgres cannot represent', () => {
    // (page - 1) * limit must stay inside a bigint. 10^40 is a valid JS float
    // but not a valid OFFSET, and this is what used to reach the driver.
    expect(parsePage('9'.repeat(40))).toBe(MAX_PAGE);
    expect(parsePage(String(Number.MAX_SAFE_INTEGER))).toBe(MAX_PAGE);
  });

  it('accepts a caller-supplied cap', () => {
    expect(parsePage('500', 50)).toBe(50);
  });
});

describe('parseLimit', () => {
  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['zero', '0'],
    ['not a number', 'abc'],
  ])('treats %s as the default', (_label, value) => {
    expect(parseLimit(value, 25, 100)).toBe(25);
  });

  it('keeps a value inside the range', () => {
    expect(parseLimit('7', 25, 100)).toBe(7);
  });

  it('clamps both ends', () => {
    expect(parseLimit('1000', 25, 100)).toBe(100);
    expect(parseLimit('-3', 25, 100)).toBe(1);
  });
});
