import Validate from '../src/validate.js';

describe('validate.isObject', () => {
  const v = new Validate();

  test('returns true for a plain object', () => {
    expect(v.isObject({})).toBe(true);
    expect(v.isObject({ a: 1 })).toBe(true);
  });

  test('returns true for an array (typeof array === object)', () => {
    expect(v.isObject([])).toBe(true);
  });

  test('returns false for null', () => {
    expect(v.isObject(null)).toBe(false);
  });

  test('returns false for primitives', () => {
    expect(v.isObject('str')).toBe(false);
    expect(v.isObject(42)).toBe(false);
    expect(v.isObject(true)).toBe(false);
    expect(v.isObject(undefined)).toBe(false);
  });
});
