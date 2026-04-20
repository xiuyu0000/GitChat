const express = require('express');
const cors = require('cors');
const {
  DEFAULT_MODEL,
  isSupportedModelId,
  normalizeModelId,
} = require('./modelCatalog');

function buildPromptSections(basePrompt, config = {}) {
  const promptSections = [config.systemPromptOverride || basePrompt];

  if (config.enableThinking) {
    promptSections.push('When useful, expose concise reasoning wrapped in <thinking>...</thinking>.');
  }

  if (config.enableWebSearch) {
    promptSections.push('If current information or external evidence would help, simulate the retrieval summary inside <search>...</search>.');
  }

  return promptSections;
}

function createGenerateHandler({ openai, systemPrompt }) {
  return async (req, res) => {
    try {
      const { messages = [], config: requestConfig = {} } = req.body;
      const normalizedModel = normalizeModelId(requestConfig.model);

      if (!isSupportedModelId(normalizedModel)) {
        res.status(400).json({
          error: `Unsupported model ID: ${requestConfig.model || normalizedModel}`,
        });
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      const stream = await openai.chat.completions.create({
        model: normalizedModel,
        messages: [
          { role: 'system', content: buildPromptSections(systemPrompt, requestConfig).join('\n\n') },
          ...messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ],
        stream: true,
      });

      for await (const chunk of stream) {
        if (chunk.choices[0]?.delta?.content) {
          res.write(`data: ${JSON.stringify({ content: chunk.choices[0].delta.content })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ content: '[DONE]' })}\n\n`);
      res.end();
    } catch (error) {
      console.error('Error in generate endpoint:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message });
      } else {
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
      }
    }
  };
}

function createApp({ openai, systemPrompt, config }) {
  const app = express();

  app.use(cors({
    origin: config.corsOrigin,
    credentials: true,
  }));
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      defaultModel: DEFAULT_MODEL,
    });
  });

  app.post('/generate', createGenerateHandler({ openai, systemPrompt }));

  return app;
}

module.exports = {
  buildPromptSections,
  createApp,
  createGenerateHandler,
};
