const TOOL_PATTERN = /<(thinking|search)>([\s\S]*?)<\/\1>/gi;

export function extractToolPayload(rawText = '') {
  const payload = [];
  const cleanText = rawText.replace(TOOL_PATTERN, (_, type, content) => {
    const value = content.trim();
    if (value) {
      payload.push({
        id: `${type}-${payload.length}-${value.slice(0, 12)}`,
        type,
        title: type === 'thinking' ? 'Thinking' : 'Search',
        content: value,
      });
    }

    return '';
  });

  return {
    text: cleanText.replace(/\n{3,}/g, '\n\n').trimStart(),
    toolPayload: payload,
  };
}
