import { HttpErrorResponse } from '@angular/common/http';
import { errorMessage } from './errors';

const err = (status: number, error?: unknown) => new HttpErrorResponse({ status, error });

describe('errorMessage', () => {
  it('prefers the server message', () => {
    expect(errorMessage(err(400, { message: 'Phone number is required' }))).toBe('Phone number is required');
  });
  it('explains an unreachable server', () => {
    expect(errorMessage(err(0))).toContain('Cannot reach the server');
  });
  it('maps status codes when the body has no message', () => {
    expect(errorMessage(err(403))).toContain('permission');
    expect(errorMessage(err(404))).toContain('not found');
    expect(errorMessage(err(409))).toContain('changed by someone else');
    expect(errorMessage(err(500))).toContain('server had a problem');
  });
  it('never shows an HTML error page', () => {
    expect(errorMessage(err(502, '<html>Bad gateway</html>'))).toContain('server had a problem');
  });
  it('reads validation errors', () => {
    expect(errorMessage(err(400, { errors: [{ defaultMessage: 'must not be blank' }] }))).toBe('must not be blank');
  });
});
