import { AUTH_COOKIE_NAME, getCookieOptions } from './cookie.constants';

describe('Cookie Constants', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('AUTH_COOKIE_NAMEがsp_access_tokenであること', () => {
    expect(AUTH_COOKIE_NAME).toBe('sp_access_token');
  });

  it('production環境でhttpOnly: true, secure: true, sameSite: strictであること', () => {
    process.env.NODE_ENV = 'production';
    const options = getCookieOptions();

    expect(options.httpOnly).toBe(true);
    expect(options.secure).toBe(true);
    expect(options.sameSite).toBe('strict');
  });

  it('development環境でhttpOnly: true, secure: false, sameSite: laxであること', () => {
    process.env.NODE_ENV = 'development';
    const options = getCookieOptions();

    expect(options.httpOnly).toBe(true);
    expect(options.secure).toBe(false);
    expect(options.sameSite).toBe('lax');
  });

  it('maxAgeが24時間(86400000ms)であること', () => {
    const options = getCookieOptions();
    expect(options.maxAge).toBe(86400000);
  });

  it('pathが/であること', () => {
    const options = getCookieOptions();
    expect(options.path).toBe('/');
  });
});
