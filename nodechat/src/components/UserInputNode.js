import React, { memo, useEffect, useState } from 'react';
import { Handle, NodeResizer, Position } from '@xyflow/react';
import { AVAILABLE_MODELS } from '../lib/models';

function UserInputNode({ id, data, selected }) {
  const [text, setText] = useState(data.text || '');
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    setText(data.text || '');
  }, [data.text]);

  return (
    <div
      className={`relative rounded-2xl border-2 bg-emerald-50 shadow-lg ${
        selected ? 'border-emerald-500' : 'border-emerald-200'
      }`}
      style={{
        width: data.measurements?.width,
        height: data.measurements?.height,
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={260}
        minHeight={180}
        lineClassName="!border-emerald-400"
        handleClassName="!bg-emerald-500 !border-0"
        onResizeEnd={(_, params) => data.onResize(id, params)}
      />
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !bg-emerald-500"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !bg-emerald-500"
      />
      <div className="flex h-full flex-col p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              User Node
            </div>
            <div className="text-[11px] text-emerald-600">{data.config?.model}</div>
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-full bg-emerald-200 px-2 py-1 text-[11px] font-medium text-emerald-800"
              onClick={() => setShowConfig((value) => !value)}
            >
              Settings
            </button>
            <button
              className="rounded-full bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white"
              onClick={() => data.onRegenerate(id)}
            >
              Run
            </button>
          </div>
        </div>

        {showConfig && (
          <div className="mb-3 space-y-2 rounded-xl border border-emerald-200 bg-white/80 p-3 text-left">
            <label className="block text-[11px] font-medium uppercase tracking-wide text-emerald-700">
              Model
              <select
                className="mt-1 w-full rounded-md border border-emerald-200 bg-white px-2 py-1 text-sm text-slate-800"
                value={data.config?.model || ''}
                onChange={(event) => data.onUpdateConfig(id, { model: event.target.value })}
              >
                {AVAILABLE_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(data.config?.enableThinking)}
                onChange={(event) => data.onUpdateConfig(id, { enableThinking: event.target.checked })}
              />
              Enable thinking block
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(data.config?.enableWebSearch)}
                onChange={(event) => data.onUpdateConfig(id, { enableWebSearch: event.target.checked })}
              />
              Enable search block
            </label>
            <label className="block text-[11px] font-medium uppercase tracking-wide text-emerald-700">
              System Prompt Override
              <textarea
                className="mt-1 h-20 w-full rounded-md border border-emerald-200 bg-white px-2 py-1 text-sm text-slate-800"
                value={data.config?.systemPromptOverride || ''}
                onChange={(event) => data.onUpdateConfig(id, { systemPromptOverride: event.target.value })}
              />
            </label>
          </div>
        )}

        <textarea
          className="h-full w-full resize-none rounded-xl border border-emerald-200 bg-white/70 p-3 text-sm text-slate-900 outline-none"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => data.onCommitText(id, text)}
          placeholder="Define the next research step, hypothesis, or prompt."
        />
        {data.metadata?.tokenWarning && (
          <div className="mt-2 rounded-lg border border-amber-300 bg-amber-100 px-2 py-1 text-left text-[11px] text-amber-900">
            Context usage is above 60%. Summarize and branch before continuing.
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(UserInputNode);
