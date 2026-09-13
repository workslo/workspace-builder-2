import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App';
import { MantineProvider } from '@mantine/core';
import { useRepoStore } from './store/useRepoStore';

vi.mock('./lib/auth', () => ({
  initAuth: vi.fn(() => () => {}),
  googleSignIn: vi.fn(),
  logout: vi.fn(),
  db: {},
}));

// Mock the split pane module since we don't have resize observer in jsdom easily
vi.mock('@mantine/core', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@mantine/core')>();
  const SplitterMock: any = ({ children }: any) => <div data-testid="splitter">{children}</div>;
  SplitterMock.Pane = ({ children }: any) => <div data-testid="splitter-pane">{children}</div>;
  return {
    ...mod,
    Splitter: SplitterMock,
  };
});

describe('Full UI/UX Integration Test', () => {
  beforeEach(() => {
    // Reset Zustand store before each test
    useRepoStore.setState({ tree: [], selectedFilePath: null });
    // Reset fetch mock
    global.fetch = vi.fn();
  });

  const renderApp = () => {
    return render(
      <MantineProvider defaultColorScheme="dark">
        <App />
      </MantineProvider>
    );
  };

  it('simulates a full user workflow: load, explore, chat, accept changes', async () => {
    renderApp();

    // 1. Check initial state
    expect(screen.getByText('Repo Explorer')).toBeInTheDocument();
    expect(screen.getByText('AI Co-pilot')).toBeInTheDocument();
    expect(screen.getByText('Ready to Code')).toBeInTheDocument();

    // 2. Load mock data
    const loadMockBtn = screen.getByRole('button', { name: /Load Mock/i });
    fireEvent.click(loadMockBtn);

    // Wait for the tree to render 'src'
    const srcNode = await screen.findByText('src');
    expect(srcNode).toBeInTheDocument();

    // 3. Add a new file manually
    const newFileInput = screen.getByPlaceholderText('New file/folder (e.g., /src/utils.ts)');
    fireEvent.change(newFileInput, { target: { value: '/src/new-file.ts' } });
    
    // There is no text on the add button, but we can submit the form
    fireEvent.submit(newFileInput);

    // The new file should appear in the tree
    // However, the Tree component is nested, so we might need to expand 'src' first
    // In Mantine tree, clicking the node expands it.
    fireEvent.click(srcNode);

    // Now look for 'new-file.ts'
    const newFile = await screen.findByText('new-file.ts');
    expect(newFile).toBeInTheDocument();

    // 4. Click the file to preview it
    fireEvent.click(newFile);
    
    // The FilePreview pane should say it's empty
    expect(await screen.findByText(/This file is empty/i)).toBeInTheDocument();

    // 5. Interact with the AI Copilot
    // Mock the fetch call for the AI chat stream
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      body: {
        getReader: () => {
          let readCount = 0;
          return {
            read: async () => {
              if (readCount === 0) {
                readCount++;
                const payload = 'I have added the Auth context as you asked.\n```json\n{"action":"add","path":"/src/context/AuthContext.tsx","type":"file","content":"export const AuthContext = React.createContext({});"}\n```';
                return { done: false, value: new TextEncoder().encode(payload) };
              }
              return { done: true, value: undefined };
            }
          };
        }
      }
    });

    const chatInput = screen.getByPlaceholderText('Ask AI to change architecture...');
    fireEvent.change(chatInput, { target: { value: 'Add an AuthContext' } });
    fireEvent.submit(chatInput);

    // Wait for AI response message
    expect(await screen.findByText('I have added the Auth context as you asked.')).toBeInTheDocument();

    // 6. Accept the AI's suggested changes
    const acceptBtn = screen.getByRole('button', { name: /Accept Changes/i });
    fireEvent.click(acceptBtn);

    // 7. Verify the new file is in the tree
    // We may need to expand 'context' or just look for 'AuthContext.tsx'
    // Since our tree auto-expands or we can just verify the store has it
    const storeState = useRepoStore.getState();
    const findFile = (nodes: any[], name: string): boolean => {
      for (const node of nodes) {
        if (node.label === name) return true;
        if (node.children && findFile(node.children, name)) return true;
      }
      return false;
    };
    
    expect(findFile(storeState.tree, 'AuthContext.tsx')).toBe(true);
  });
});
