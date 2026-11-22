import { decodeJwt, hasRole } from './auth.service';

function jwt(claims: object): string {
  const b64 = (o: object) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64(claims)}.sig`;
}

describe('JWT helpers', () => {
  it('decodes the payload', () => {
    expect(decodeJwt(jwt({ sub: 'jane', role: 'ROLE_DOCTOR' }))).toEqual({ sub: 'jane', role: 'ROLE_DOCTOR' });
  });

  it('returns an empty object for garbage instead of throwing', () => {
    expect(decodeJwt('not-a-token')).toEqual({});
    expect(decodeJwt('')).toEqual({});
  });

  it('decodes non-ASCII claims', () => {
    expect(decodeJwt(jwt({ name: 'Kofi Mensah-Åsa' }))['name']).toBe('Kofi Mensah-Åsa');
  });

  it('matches roles by name', () => {
    expect(hasRole('ADMIN', 'ADMIN')).toBe(true);
    expect(hasRole('NURSE', 'ADMIN', 'DOCTOR')).toBe(false);
    expect(hasRole(undefined, 'ADMIN')).toBe(false);
  });
});
