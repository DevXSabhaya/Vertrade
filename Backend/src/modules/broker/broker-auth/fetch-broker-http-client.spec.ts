import { FetchBrokerHttpClient } from './fetch-broker-http-client';

/**
 * Mocks the global fetch boundary — this never makes a real network call.
 */
describe('FetchBrokerHttpClient', () => {
  const client = new FetchBrokerHttpClient();
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('sends the method, headers, and JSON body, and returns the parsed response', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ status: true }), { status: 200 }),
    );

    const result = await client.request({
      method: 'POST',
      url: 'https://example.invalid/login',
      headers: { 'X-PrivateKey': 'key' },
      body: { clientcode: 'C123' },
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.invalid/login',
      expect.objectContaining({
        method: 'POST',
        headers: { 'X-PrivateKey': 'key' },
        body: JSON.stringify({ clientcode: 'C123' }),
      }),
    );
    expect(result).toEqual({ status: 200, body: { status: true } });
  });

  it('propagates a network-level rejection to the caller', async () => {
    fetchSpy.mockRejectedValue(new TypeError('fetch failed'));

    await expect(
      client.request({
        method: 'GET',
        url: 'https://example.invalid',
        headers: {},
      }),
    ).rejects.toThrow('fetch failed');
  });
});
