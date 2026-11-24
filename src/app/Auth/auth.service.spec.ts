import { decodeJwt, hasRole, rolesFromClaims } from './auth.service';

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
    expect(hasRole('SUPERADMIN', 'ADMIN')).toBe(false);
  });

  it('reads multiple roles from common JWT claim formats', () => {
    expect(rolesFromClaims({
      authorities: [{ authority: 'ROLE_DOCTOR' }, { authority: 'ROLE_NURSE' }],
      realm_access: { roles: ['ADMIN'] },
    })).toEqual(['DOCTOR', 'NURSE', 'ADMIN']);
  });

  it('normalizes display-name roles without granting substring matches', () => {
    expect(hasRole(['Lab Technician'], 'LAB_TECHNICIAN')).toBe(true);
    expect(hasRole('SUPERADMIN', 'ADMIN')).toBe(false);
  });
});
