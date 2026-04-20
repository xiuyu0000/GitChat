const modelCatalog = require('../nodechat/src/shared/modelCatalog.json');

const DEFAULT_MODEL = modelCatalog.defaultModel;
const AVAILABLE_MODELS = modelCatalog.availableModels;
const MODEL_ALIASES = modelCatalog.aliases;
const SUPPORTED_MODELS = new Set(AVAILABLE_MODELS.map((model) => model.id));

function normalizeModelId(modelId) {
  if (!modelId) {
    return DEFAULT_MODEL;
  }

  return MODEL_ALIASES[modelId] || modelId;
}

function isSupportedModelId(modelId) {
  return SUPPORTED_MODELS.has(normalizeModelId(modelId));
}

module.exports = {
  DEFAULT_MODEL,
  AVAILABLE_MODELS,
  MODEL_ALIASES,
  normalizeModelId,
  isSupportedModelId,
};
