import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('writes a header and rows', () => expect(toCsv(['A', 'B'], [[1, 'x']])).toBe('A,B\r\n1,x'));
  it('quotes commas, quotes and newlines', () => {
    expect(toCsv(['A'], [['a,b'], ['say "hi"'], ['l1\nl2']])).toBe('A\r\n"a,b"\r\n"say ""hi"""\r\n"l1\nl2"');
  });
  it('neutralises spreadsheet formulas', () => {
    expect(toCsv(['A'], [['=SUM(A1)'], ['@cmd'], ['+1'], ['-2']])).toBe("A\r\n'=SUM(A1)\r\n'@cmd\r\n'+1\r\n'-2");
  });
  it('keeps real negative numbers numeric', () => expect(toCsv(['A'], [[-5]])).toBe('A\r\n-5'));
  it('writes blanks for null', () => expect(toCsv(['A', 'B'], [[null, undefined]])).toBe('A,B\r\n,'));
});
