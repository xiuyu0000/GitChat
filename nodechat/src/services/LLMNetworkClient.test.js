import { createSseStream } from '../test/testUtils';
import { API_BASE_URL } from '../config/appConfig';
import { streamCompletion } from './LLMNetworkClient';

describe('LLMNetworkClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('streams chunks and completes on [DONE]', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: createSseStream([
        'data: {"content":"Hello"}\n\n',
        'data: {"content":" world"}\n\n',
        'data: {"content":"[DONE]"}\n\n',
      ]),
    });

    const onTextChunk = jest.fn();
    const onDone = jest.fn();
    const onError = jest.fn();

    await streamCompletion({
      messages: [{ role: 'user', content: 'Hi' }],
      config: { model: 'openai/gpt-5.4' },
      signal: undefined,
      onTextChunk,
      onDone,
      onError,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/generate`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hi' }],
          config: { model: 'openai/gpt-5.4' },
        }),
      })
    );
    expect(onTextChunk).toHaveBeenNthCalledWith(1, 'Hello');
    expect(onTextChunk).toHaveBeenNthCalledWith(2, ' world');
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  test('throws and reports payload errors', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: createSseStream([
        'data: {"error":"Upstream failed"}\n\n',
      ]),
    });

    const onError = jest.fn();

    await expect(
      streamCompletion({
        messages: [],
        config: {},
        onError,
      })
    ).rejects.toThrow('Upstream failed');

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Upstream failed' }));
  });

  test('throws for non-ok responses', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
    });

    await expect(
      streamCompletion({
        messages: [],
        config: {},
      })
    ).rejects.toThrow('Generation failed with status 502');
  });

  test('rethrows abort errors without calling onError', async () => {
    const abortError = Object.assign(new Error('Aborted'), { name: 'AbortError' });
    global.fetch = jest.fn().mockRejectedValue(abortError);

    const onError = jest.fn();

    await expect(
      streamCompletion({
        messages: [],
        config: {},
        onError,
      })
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(onError).not.toHaveBeenCalled();
  });

  test('throws when the response body is missing', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: null,
    });

    await expect(
      streamCompletion({
        messages: [],
        config: {},
      })
    ).rejects.toThrow('Missing response body');
  });
});
