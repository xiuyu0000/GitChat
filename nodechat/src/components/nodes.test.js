import { fireEvent, render, screen } from '@testing-library/react';
import LLMResponseNode from './LLMResponseNode';
import SummaryNode from './SummaryNode';
import UserInputNode from './UserInputNode';

jest.mock('@xyflow/react', () => ({
  Handle: () => <div data-testid="handle" />,
  Position: { Top: 'top', Bottom: 'bottom' },
  NodeResizer: ({ onResizeEnd }) => (
    <button
      type="button"
      data-testid="node-resizer"
      onClick={() => onResizeEnd?.({}, { width: 512, height: 384 })}
    >
      resize
    </button>
  ),
}));

jest.mock('react-markdown', () => ({ children }) => <div>{children}</div>);
jest.mock('remark-gfm', () => () => null);

function baseData(overrides = {}) {
  return {
    text: '',
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

describe('node components', () => {
  test('UserInputNode updates config, commits text, and shows token warning', () => {
    const data = baseData({
      text: 'Initial prompt',
      metadata: { accumulatedTokens: 0, isStale: false, errorMessage: '', tokenWarning: true },
    });

    render(<UserInputNode id="user-1" data={data} selected />);

    fireEvent.click(screen.getByText('Settings'));
    expect(screen.getByRole('option', { name: 'Claude Opus 4.6' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'GPT-5.4' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'openai/gpt-5.4' },
    });
    fireEvent.click(screen.getByLabelText(/enable thinking block/i));
    fireEvent.change(screen.getByDisplayValue('Initial prompt'), {
      target: { value: 'Updated prompt' },
    });
    fireEvent.blur(screen.getByDisplayValue('Updated prompt'));
    fireEvent.click(screen.getByText('Run'));
    fireEvent.click(screen.getByTestId('node-resizer'));

    expect(data.onUpdateConfig).toHaveBeenCalledWith('user-1', { model: 'openai/gpt-5.4' });
    expect(data.onUpdateConfig).toHaveBeenCalledWith('user-1', { enableThinking: true });
    expect(data.onCommitText).toHaveBeenCalledWith('user-1', 'Updated prompt');
    expect(data.onRegenerate).toHaveBeenCalledWith('user-1');
    expect(data.onResize).toHaveBeenCalledWith('user-1', { width: 512, height: 384 });
    expect(screen.getByText(/context usage is above 60%/i)).toBeInTheDocument();
  });

  test('LLMResponseNode renders tool payload, stale badge, error text, and commits edits', () => {
    const data = baseData({
      text: 'Final answer',
      toolPayload: [{ id: 'tool-1', title: 'Thinking', content: 'step by step' }],
      metadata: {
        accumulatedTokens: 321,
        isStale: true,
        errorMessage: 'Request failed',
        tokenWarning: false,
      },
      status: 'done',
    });

    render(<LLMResponseNode id="assistant-1" data={data} selected />);

    fireEvent.change(screen.getByDisplayValue('Final answer'), {
      target: { value: 'Edited answer' },
    });
    fireEvent.blur(screen.getByDisplayValue('Edited answer'));
    fireEvent.click(screen.getByTestId('node-resizer'));

    expect(screen.getByText('Stale')).toBeInTheDocument();
    expect(screen.getByText('Request failed')).toBeInTheDocument();
    expect(screen.getByText('Thinking')).toBeInTheDocument();
    expect(screen.getByText('step by step')).toBeInTheDocument();
    expect(screen.getByText('~321 tok')).toBeInTheDocument();
    expect(data.onCommitText).toHaveBeenCalledWith('assistant-1', 'Edited answer');
    expect(data.onResize).toHaveBeenCalledWith('assistant-1', { width: 512, height: 384 });
  });

  test('SummaryNode commits note text and stays excluded from context copy', () => {
    const data = baseData({ text: 'Loose notes' });

    render(<SummaryNode id="summary-1" data={data} selected={false} />);

    fireEvent.change(screen.getByDisplayValue('Loose notes'), {
      target: { value: 'Updated notes' },
    });
    fireEvent.blur(screen.getByDisplayValue('Updated notes'));

    expect(screen.getByText(/excluded from context/i)).toBeInTheDocument();
    expect(data.onCommitText).toHaveBeenCalledWith('summary-1', 'Updated notes');
  });
});
