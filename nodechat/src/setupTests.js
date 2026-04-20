import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';
import { ReadableStream } from 'stream/web';
import { TextDecoder, TextEncoder } from 'util';

if (typeof global.TextEncoder !== 'function') {
  global.TextEncoder = TextEncoder;
}

if (typeof global.TextDecoder !== 'function') {
  global.TextDecoder = TextDecoder;
}

if (typeof global.ReadableStream !== 'function') {
  global.ReadableStream = ReadableStream;
}

if (typeof global.structuredClone !== 'function') {
  global.structuredClone = (value) => JSON.parse(JSON.stringify(value));
}

if (typeof global.ResizeObserver !== 'function') {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof global.URL.createObjectURL !== 'function') {
  global.URL.createObjectURL = () => 'blob:mock';
}

if (typeof global.URL.revokeObjectURL !== 'function') {
  global.URL.revokeObjectURL = () => {};
}
