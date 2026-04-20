import React from 'react';
import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';

export function createSseStream(events) {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      events.forEach((event) => {
        controller.enqueue(encoder.encode(event));
      });
      controller.close();
    },
  });
}

export function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

export function renderWithFlowProvider(ui) {
  return render(<ReactFlowProvider>{ui}</ReactFlowProvider>);
}
