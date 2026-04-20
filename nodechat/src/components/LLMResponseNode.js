import React, { memo, useEffect, useMemo, useState } from 'react';
import { Handle, NodeResizer, Position } from '@xyflow/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function LLMResponseNode({ id, data, selected }) {
  const [text, setText] = useState(data.text || '');
  const toolPayload = useMemo(() => data.toolPayload || [], [data.toolPayload]);

  useEffect(() => {
    setText(data.text || '');
  }, [data.text]);

  return (
    <div
      className={`relative rounded-2xl border-2 bg-sky-50 shadow-lg ${
        data.metadata?.isStale
          ? 'border-rose-400'
          : selected
            ? 'border-sky-500'
            : 'border-sky-200'
      }`}
      style={{
        width: data.measurements?.width,
        height: data.measurements?.height,
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={280}
        minHeight={200}
        lineClassName="!border-sky-400"
        handleClassName="!bg-sky-500 !border-0"
        onResizeEnd={(_, params) => data.onResize(id, params)}
      />
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !bg-sky-500"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !bg-sky-500"
      />
      <div className="flex h-full flex-col p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-left">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">
              Generative Node
            </div>
            <div className="text-[11px] text-sky-600">
              {data.status === 'generating' ? 'Streaming response…' : data.status}
            </div>
          </div>
          <div className="flex gap-2">
            {data.metadata?.isStale && (
              <span className="rounded-full bg-rose-100 px-2 py-1 text-[11px] font-medium text-rose-700">
                Stale
              </span>
            )}
            {data.metadata?.accumulatedTokens ? (
              <span className="rounded-full bg-sky-200 px-2 py-1 text-[11px] font-medium text-sky-700">
                ~{data.metadata.accumulatedTokens} tok
              </span>
            ) : null}
          </div>
        </div>

        {toolPayload.length > 0 && (
          <div className="mb-3 space-y-2">
            {toolPayload.map((item) => (
              <details key={item.id} className="rounded-xl border border-sky-200 bg-white/75 p-2">
                <summary className="cursor-pointer text-left text-xs font-semibold uppercase tracking-wide text-sky-700">
                  {item.title}
                </summary>
                <pre className="mt-2 whitespace-pre-wrap text-left text-xs text-slate-700">
                  {item.content}
                </pre>
              </details>
            ))}
          </div>
        )}

        {data.metadata?.errorMessage && (
          <div className="mb-3 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-left text-xs text-rose-800">
            {data.metadata.errorMessage}
          </div>
        )}

        <div className="h-full overflow-auto rounded-xl border border-sky-200 bg-white/80 p-3 text-left">
          <textarea
            className="mb-3 h-24 w-full resize-none rounded-lg border border-sky-100 bg-sky-50/60 p-2 text-sm text-slate-800 outline-none"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onBlur={() => data.onCommitText(id, text)}
            placeholder="LLM output will stream here."
          />
          <div className="markdown text-sm text-slate-800">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(LLMResponseNode);
