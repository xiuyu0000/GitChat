import React, { memo, useEffect, useState } from 'react';
import { NodeResizer } from '@xyflow/react';

function SummaryNode({ id, data, selected }) {
  const [text, setText] = useState(data.text || '');

  useEffect(() => {
    setText(data.text || '');
  }, [data.text]);

  return (
    <div
      className={`relative rounded-xl border-2 bg-amber-50 shadow-lg ${
        selected ? 'border-amber-500' : 'border-amber-200'
      }`}
      style={{
        width: data.measurements?.width,
        height: data.measurements?.height,
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={220}
        minHeight={160}
        lineClassName="!border-amber-400"
        handleClassName="!bg-amber-500 !border-0"
        onResizeEnd={(_, params) => data.onResize(id, params)}
      />
      <div className="flex h-full flex-col p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            Summary Note
          </span>
          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-medium text-amber-700">
            Excluded from context
          </span>
        </div>
        <textarea
          className="h-full w-full resize-none rounded-lg border border-amber-200 bg-transparent p-2 text-sm text-amber-950 outline-none"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => data.onCommitText(id, text)}
          placeholder="Capture takeaways, risks, and next steps."
        />
      </div>
    </div>
  );
}

export default memo(SummaryNode);
