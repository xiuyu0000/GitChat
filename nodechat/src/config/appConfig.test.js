describe('appConfig', () => {
  const originalEnv = process.env.REACT_APP_API_BASE_URL;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.REACT_APP_API_BASE_URL;
    } else {
      process.env.REACT_APP_API_BASE_URL = originalEnv;
    }

    jest.resetModules();
  });

  test('uses REACT_APP_API_BASE_URL when present', async () => {
    process.env.REACT_APP_API_BASE_URL = 'https://example.test';

    const { API_BASE_URL } = await import('./appConfig');
    expect(API_BASE_URL).toBe('https://example.test');
  });

  test('falls back to localhost when REACT_APP_API_BASE_URL is not set', async () => {
    delete process.env.REACT_APP_API_BASE_URL;

    const { API_BASE_URL } = await import('./appConfig');
    expect(API_BASE_URL).toBe('http://localhost:8000');
  });
});
