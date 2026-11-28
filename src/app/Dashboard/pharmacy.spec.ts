import { describe, expect, it } from 'vitest';
import { allergyMatches } from './pharmacy';

describe('allergyMatches', () => {
  const amox = { name: 'Amoxicillin', genericName: 'Amoxicillin' };
  it('flags a drug in an allergy class', () => expect(allergyMatches(['Penicillin'], amox)).toEqual(['Penicillin']));
  it('flags a direct name match', () => expect(allergyMatches(['amoxicillin'], amox)).toEqual(['amoxicillin']));
  it('ignores unrelated allergies', () => expect(allergyMatches(['Latex', 'Peanuts'], amox)).toEqual([]));
  it('handles a missing drug', () => expect(allergyMatches(['Penicillin'], undefined)).toEqual([]));
});
