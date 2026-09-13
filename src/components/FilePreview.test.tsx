import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { FilePreview } from './FilePreview';
import { useRepoStore } from '../store/useRepoStore';
import { MantineProvider } from '@mantine/core';

describe('FilePreview Text Editor Surface', () => {
  beforeEach(() => {
    // Reset store
    useRepoStore.setState({
      tree: [],
      selectedFilePath: null,
      user: null,
    });
  });

  it('renders "Ready to Code" when no file is selected', () => {
    render(
      <MantineProvider>
        <FilePreview />
      </MantineProvider>
    );
    expect(screen.getByText('Ready to Code')).toBeInTheDocument();
  });

  it('renders CodeMirror when a file is selected', () => {
    const mockTree = [
      {
        value: '/src/test.js',
        label: 'test.js',
        type: 'file' as const,
        content: 'console.log("Hello");'
      }
    ];

    useRepoStore.setState({
      tree: mockTree,
      selectedFilePath: '/src/test.js'
    });

    render(
      <MantineProvider>
        <FilePreview />
      </MantineProvider>
    );

    // CodeMirror sets text inside its structure, often split across spans
    const textbox = screen.getByRole('textbox');
    expect(textbox).toBeInTheDocument();
    expect(textbox.textContent).toContain('console');
    expect(textbox.textContent).toContain('Hello');
  });

  it('updates the store when file content changes', () => {
    const mockTree = [
      {
        value: '/src/test.js',
        label: 'test.js',
        type: 'file' as const,
        content: 'console.log("Hello");'
      }
    ];

    useRepoStore.setState({
      tree: mockTree,
      selectedFilePath: '/src/test.js'
    });

    const updateFileContent = useRepoStore.getState().updateFileContent;

    // Simulate change
    act(() => {
      updateFileContent('/src/test.js', 'console.log("Updated!");');
    });

    const state = useRepoStore.getState();
    const updatedFile = state.tree[0];
    expect(updatedFile.content).toBe('console.log("Updated!");');
  });
});
