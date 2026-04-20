import { API_BASE_URL } from '../config/appConfig';

export async function streamCompletion({
  messages,
  config,
  signal,
  onTextChunk,
  onDone,
  onError,
}) {
  try {
    const response = await fetch(`${API_BASE_URL}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal,
      body: JSON.stringify({ messages, config }),
    });

    if (!response.ok) {
      throw new Error(`Generation failed with status ${response.status}`);
    }

    if (!response.body) {
      throw new Error('Missing response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        if (rawEvent.startsWith('data: ')) {
          const payload = JSON.parse(rawEvent.slice(6));

          if (payload.content === '[DONE]') {
            onDone?.();
            return;
          }

          if (payload.error) {
            throw new Error(payload.error);
          }

          onTextChunk?.(payload.content || '');
        }

        boundary = buffer.indexOf('\n\n');
      }
    }

    onDone?.();
  } catch (error) {
    if (error.name !== 'AbortError') {
      onError?.(error);
      throw error;
    }

    throw error;
  }
}
