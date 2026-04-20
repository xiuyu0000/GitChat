import { cleanup, render, screen, waitFor } from '@testing-library/react';
jest.mock('react-markdown', () => ({ children }) => <div>{children}</div>);
jest.mock('remark-gfm', () => () => null);
import App from './App';
import { db } from './lib/db';

afterEach(async () => {
  cleanup();
  await db.sessions.clear();
  await db.nodes.clear();
  await db.edges.clear();
});

test('renders the research workspace shell', async () => {
  render(<App />);

  await waitFor(() => {
    expect(screen.getByText(/research sessions/i)).toBeInTheDocument();
  });
  expect(screen.getByRole('button', { name: /new session/i })).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/draft a new root question/i)).toBeInTheDocument();
});
