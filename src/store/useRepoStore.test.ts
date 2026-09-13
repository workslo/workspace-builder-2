import { describe, it, expect, beforeEach } from 'vitest';
import { useRepoStore } from './useRepoStore';

describe('useRepoStore', () => {
  beforeEach(() => {
    useRepoStore.setState({ tree: [], selectedFilePath: null });
  });

  it('should initialize with an empty tree', () => {
    const { tree } = useRepoStore.getState();
    expect(tree).toEqual([]);
  });

  it('should load mock data correctly', () => {
    const { loadMockData } = useRepoStore.getState();
    loadMockData();
    const { tree } = useRepoStore.getState();
    expect(tree.length).toBeGreaterThan(0);
    expect(tree[0].value).toBe('/src');
  });

  it('should add a basic file node', () => {
    const { addNode } = useRepoStore.getState();
    addNode('/hello.ts', 'file', 'console.log("hello");');
    
    const { tree } = useRepoStore.getState();
    expect(tree.length).toBe(1);
    expect(tree[0].label).toBe('hello.ts');
    expect(tree[0].type).toBe('file');
    expect(tree[0].content).toBe('console.log("hello");');
  });

  it('should handle applying an add diff', () => {
    const { applyDiff } = useRepoStore.getState();
    applyDiff({ action: 'add', path: '/src/utils/math.ts', type: 'file', content: 'export const add = 1;' });
    
    const { tree } = useRepoStore.getState();
    expect(tree[0].label).toBe('src');
    expect(tree[0].children?.[0].label).toBe('utils');
    expect(tree[0].children?.[0].children?.[0].label).toBe('math.ts');
  });
});
