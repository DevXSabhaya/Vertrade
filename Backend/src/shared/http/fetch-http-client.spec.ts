import { FetchHttpClient } from './fetch-http-client';

describe('FetchHttpClient', () => {
  const client = new FetchHttpClient();
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('defaults to GET and returns the parsed JSON body with status', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify([1, 2, 3]), { status: 200 }),
    );

    const result = await client.request<number[]>(
      'https://example.invalid/data',
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.invalid/data',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result).toEqual({ status: 200, body: [1, 2, 3] });
  });

  it('returns the raw response text when responseType is "text" — e.g. Dhan\'s CSV instrument master', async () => {
    fetchSpy.mockResolvedValue(new Response('a,b,c\n1,2,3', { status: 200 }));

    const result = await client.request<string>(
      'https://example.invalid/data.csv',
      { responseType: 'text' },
    );

    expect(result).toEqual({ status: 200, body: 'a,b,c\n1,2,3' });
  });

  it('propagates a network-level rejection', async () => {
    fetchSpy.mockRejectedValue(new TypeError('fetch failed'));
    await expect(client.request('https://example.invalid')).rejects.toThrow(
      'fetch failed',
    );
  });
});
