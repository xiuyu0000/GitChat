const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPromptSections, createGenerateHandler } = require('../app');

function createStream(chunks) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

function createOpenAiMock(chunks = [{ choices: [{ delta: { content: 'Hello' } }] }]) {
  const create = async () => createStream(chunks);

  return {
    chat: {
      completions: {
        create,
      },
    },
  };
}

function createResponseRecorder() {
  return {
    statusCode: 200,
    body: null,
    writes: [],
    ended: false,
    headersSent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.headersSent = true;
      return this;
    },
    writeHead(code) {
      this.statusCode = code;
      this.headersSent = true;
    },
    write(chunk) {
      this.writes.push(chunk);
    },
    end() {
      this.ended = true;
    },
  };
}

test('buildPromptSections appends thinking/search instructions', () => {
  const prompt = buildPromptSections('base prompt', {
    enableThinking: true,
    enableWebSearch: true,
  }).join('\n\n');

  assert.match(prompt, /<thinking>/);
  assert.match(prompt, /<search>/);
});

test('generate normalizes legacy model ids before calling upstream', async () => {
  const openai = createOpenAiMock();
  const handler = createGenerateHandler({ openai, systemPrompt: 'base prompt' });

  let receivedPayload;
  openai.chat.completions.create = async (payload) => {
    receivedPayload = payload;
    return createStream([{ choices: [{ delta: { content: 'Hello' } }] }]);
  };

  const response = createResponseRecorder();
  await handler(
    {
      body: {
        messages: [{ role: 'user', content: 'Hi' }],
        config: { model: 'anthropic/claude-opus-4-1' },
      },
    },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.equal(receivedPayload.model, 'anthropic/claude-opus-4.6');
  assert.match(response.writes.join(''), /"Hello"/);
  assert.match(response.writes.join(''), /\[DONE\]/);
});

test('generate rejects unsupported model ids before upstream call', async () => {
  const openai = createOpenAiMock();
  let callCount = 0;
  openai.chat.completions.create = async () => {
    callCount += 1;
    return createStream([]);
  };

  const handler = createGenerateHandler({ openai, systemPrompt: 'base prompt' });
  const response = createResponseRecorder();

  await handler(
    {
      body: {
        messages: [{ role: 'user', content: 'Hi' }],
        config: { model: 'invalid/model-id' },
      },
    },
    response
  );

  assert.equal(response.statusCode, 400);
  assert.match(response.body.error, /Unsupported model ID/);
  assert.equal(callCount, 0);
});

test('generate falls back to the default model when model is missing', async () => {
  const openai = createOpenAiMock();
  let receivedPayload;
  openai.chat.completions.create = async (payload) => {
    receivedPayload = payload;
    return createStream([{ choices: [{ delta: { content: 'Hello' } }] }]);
  };

  const handler = createGenerateHandler({ openai, systemPrompt: 'base prompt' });
  const response = createResponseRecorder();

  await handler(
    {
      body: {
        messages: [{ role: 'user', content: 'Hi' }],
        config: {},
      },
    },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.equal(receivedPayload.model, 'anthropic/claude-opus-4.6');
});
