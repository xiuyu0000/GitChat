const path = require('path');

function getServerConfig(overrides = {}) {
  const port = Number(overrides.PORT || process.env.PORT || 8000);
  const corsOrigin = overrides.CORS_ORIGIN || process.env.CORS_ORIGIN || 'http://localhost:3000';
  const openRouterBaseUrl =
    overrides.OPENROUTER_BASE_URL || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
  const apiKey = overrides.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || '';
  const promptPath =
    overrides.SYSTEM_PROMPT_PATH ||
    process.env.SYSTEM_PROMPT_PATH ||
    path.join(__dirname, 'llm-branched-conversation-prompt.md');

  return {
    port,
    corsOrigin,
    openRouterBaseUrl,
    apiKey,
    promptPath,
  };
}

module.exports = {
  getServerConfig,
};
