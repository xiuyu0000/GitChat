const OpenAI = require('openai');
const fs = require('fs').promises;
require('dotenv').config();
const { createApp } = require('./app');
const { getServerConfig } = require('./config');

async function loadSystemPrompt(promptPath) {
  return fs.readFile(promptPath, 'utf-8');
}

async function createServerRuntime(overrides = {}) {
  const config = getServerConfig(overrides);

  if (!config.apiKey) {
    throw new Error('OPENROUTER_API_KEY is required');
  }

  const systemPrompt = await loadSystemPrompt(config.promptPath);
  const openai = new OpenAI({
    baseURL: config.openRouterBaseUrl,
    apiKey: config.apiKey,
  });

  return {
    app: createApp({ openai, systemPrompt, config }),
    config,
  };
}

async function startServer() {
  try {
    const runtime = await createServerRuntime();
    runtime.app.listen(runtime.config.port, () => {
      console.log(`Server running at http://localhost:${runtime.config.port}`);
    });
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createServerRuntime,
  loadSystemPrompt,
  startServer,
};
