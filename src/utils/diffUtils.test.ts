import { describe, it, expect } from 'vitest';
import { assignNodeIds, computeRepoDiff, generateShellScript, generateAgentPrompt } from './diffUtils';
import { FileNode } from '../store/useRepoStore';

describe('diffUtils', () => {
  const baseTree: FileNode[] = [
    {
      value: '/src',
      label: 'src',
      type: 'folder',
      children: [
        {
          value: '/src/components',
          label: 'components',
          type: 'folder',
          children: [
            { value: '/src/components/Button.tsx', label: 'Button.tsx', type: 'file' },
            { value: '/src/components/Header.tsx', label: 'Header.tsx', type: 'file' },
          ],
        },
        { value: '/src/App.tsx', label: 'App.tsx', type: 'file' },
      ],
    },
    { value: '/README.md', label: 'README.md', type: 'file' },
  ];

  it('assigns consistent ids to nodes', () => {
    const withIds = assignNodeIds(baseTree);
    expect(withIds[0].id).toBeDefined();
    expect(withIds[0].children?.[0].id).toBeDefined();
    expect(withIds[0].children?.[0].children?.[0].id).toBeDefined();
  });

  it('detects moves, additions, and deletions', () => {
    const initial = assignNodeIds(baseTree);

    // Create current tree by:
    // 1. Moving Button.tsx to /src/Button.tsx
    // 2. Adding /src/utils.ts
    // 3. Deleting README.md
    const current: FileNode[] = [
      {
        ...initial[0],
        children: [
          {
            ...initial[0].children![0],
            children: [
              // Button.tsx moved out of here
              initial[0].children![0].children![1], // Header.tsx
            ],
          },
          initial[0].children![1], // App.tsx
          {
            id: initial[0].children![0].children![0].id, // Button.tsx id preserved!
            value: '/src/Button.tsx',
            label: 'Button.tsx',
            type: 'file',
          },
          {
            id: 'new-node-utils',
            value: '/src/utils.ts',
            label: 'utils.ts',
            type: 'file',
          },
        ],
      },
      // README.md omitted (deleted)
    ];

    const diff = computeRepoDiff(initial, current);
    expect(diff.changes.length).toBe(3);

    const moveChange = diff.changes.find((c) => c.type === 'move');
    expect(moveChange).toBeDefined();
    expect(moveChange?.oldPath).toBe('/src/components/Button.tsx');
    expect(moveChange?.path).toBe('/src/Button.tsx');

    const addChange = diff.changes.find((c) => c.type === 'add');
    expect(addChange).toBeDefined();
    expect(addChange?.path).toBe('/src/utils.ts');

    const delChange = diff.changes.find((c) => c.type === 'delete');
    expect(delChange).toBeDefined();
    expect(delChange?.path).toBe('/README.md');

    // Test Shell Script generator
    const script = generateShellScript(diff);
    expect(script).toContain('git mv "src/components/Button.tsx" "src/Button.tsx"');
    expect(script).toContain('touch "src/utils.ts"');
    expect(script).toContain('rm -f "README.md"');

    // Test Agent Prompt generator
    const prompt = generateAgentPrompt(diff);
    expect(prompt).toContain('`src/components/Button.tsx` ➔ `src/Button.tsx`');
    expect(prompt).toContain('`src/utils.ts`');
    expect(prompt).toContain('`README.md`');
  });

  it('returns zero changes when trees are identical', () => {
    const initial = assignNodeIds(baseTree);
    const current = JSON.parse(JSON.stringify(initial));

    const diff = computeRepoDiff(initial, current);
    expect(diff.totalCount).toBe(0);
    expect(diff.changes.length).toBe(0);
  });
});
