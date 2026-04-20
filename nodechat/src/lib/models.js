import modelCatalog from '../shared/modelCatalog.json';

export const DEFAULT_MODEL = modelCatalog.defaultModel;
export const AVAILABLE_MODELS = modelCatalog.availableModels;
const MODEL_ALIASES = modelCatalog.aliases;
const SUPPORTED_MODEL_IDS = new Set(AVAILABLE_MODELS.map((model) => model.id));

export function normalizeModelId(modelId) {
  if (!modelId) {
    return DEFAULT_MODEL;
  }

  return MODEL_ALIASES[modelId] || modelId;
}

export function isSupportedModelId(modelId) {
  return SUPPORTED_MODEL_IDS.has(normalizeModelId(modelId));
}

export function normalizeNode(node) {
  if (!node?.data?.config) {
    return node;
  }

  const normalizedModel = normalizeModelId(node.data.config.model);
  if (normalizedModel === node.data.config.model) {
    return node;
  }

  return {
    ...node,
    data: {
      ...node.data,
      config: {
        ...node.data.config,
        model: normalizedModel,
      },
    },
  };
}

export function normalizeNodes(nodes = []) {
  return nodes.map(normalizeNode);
}
