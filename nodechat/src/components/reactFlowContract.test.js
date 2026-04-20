import fs from 'fs';
import path from 'path';
import { renderWithFlowProvider } from '../test/testUtils';
import UserInputNode from './UserInputNode';
import LLMResponseNode from './LLMResponseNode';
import SummaryNode from './SummaryNode';

jest.mock('react-markdown', () => ({ children }) => <div>{children}</div>);
jest.mock('remark-gfm', () => () => null);

function baseData(overrides = {}) {
  return {
    text: 'Body',
    config: {
      model: 'anthropic/claude-opus-4.6',
      enableThinking: false,
      enableWebSearch: false,
      systemPromptOverride: '',
    },
    toolPayload: [],
    metadata: {
      accumulatedTokens: 0,
      isStale: false,
      errorMessage: '',
      tokenWarning: false,
    },
    status: 'draft',
    measurements: { width: 320, height: 220 },
    onResize: jest.fn(),
    onCommitText: jest.fn(),
    onUpdateConfig: jest.fn(),
    onRegenerate: jest.fn(),
    ...overrides,
  };
}

describe('React Flow dependency contract', () => {
  test('selected nodes render under the real ReactFlowProvider without provider errors', () => {
    expect(() =>
      renderWithFlowProvider(
        <div>
          <UserInputNode id="user-1" data={baseData()} selected />
          <LLMResponseNode
            id="assistant-1"
            data={baseData({
              toolPayload: [{ id: 'tool-1', title: 'Thinking', content: 'step by step' }],
              metadata: {
                accumulatedTokens: 42,
                isStale: true,
                errorMessage: '',
                tokenWarning: false,
              },
              status: 'done',
            })}
            selected
          />
          <SummaryNode id="summary-1" data={baseData()} selected />
        </div>
      )
    ).not.toThrow();
  });

  test('package and source code do not reference legacy React Flow packages', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')
    );
    const dependencyNames = Object.keys({
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    });

    expect(dependencyNames).not.toEqual(
      expect.arrayContaining(['@reactflow/background', '@reactflow/node-resizer', 'react-flow-renderer'])
    );

    const srcDir = path.join(process.cwd(), 'src');
    const stack = [srcDir];

    while (stack.length > 0) {
      const currentDir = stack.pop();
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      entries.forEach((entry) => {
        const nextPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          stack.push(nextPath);
          return;
        }

        if (!entry.name.endsWith('.js') || entry.name.endsWith('.test.js')) {
          return;
        }

        const content = fs.readFileSync(nextPath, 'utf-8');
        expect(content).not.toMatch(/@reactflow\//);
        expect(content).not.toMatch(/react-flow-renderer/);
      });
    }
  });
});
