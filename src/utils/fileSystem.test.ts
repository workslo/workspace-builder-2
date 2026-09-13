import { describe, it, expect } from 'vitest';
import { isLockFile, IGNORED_DIRS, parseFileList } from './fileSystem';

describe('fileSystem utils', () => {
  it('identifies lockfiles correctly', () => {
    expect(isLockFile('package-lock.json')).toBe(true);
    expect(isLockFile('yarn.lock')).toBe(true);
    expect(isLockFile('pnpm-lock.yaml')).toBe(true);
    expect(isLockFile('bun.lockb')).toBe(true);
    expect(isLockFile('Cargo.lock')).toBe(true);
    expect(isLockFile('composer.lock')).toBe(true);
    expect(isLockFile('Gemfile.lock')).toBe(true);
    expect(isLockFile('poetry.lock')).toBe(true);
    expect(isLockFile('package.json')).toBe(false);
    expect(isLockFile('README.md')).toBe(false);
  });

  it('includes common noise directories in IGNORED_DIRS', () => {
    expect(IGNORED_DIRS.has('node_modules')).toBe(true);
    expect(IGNORED_DIRS.has('.git')).toBe(true);
    expect(IGNORED_DIRS.has('dist')).toBe(true);
    expect(IGNORED_DIRS.has('build')).toBe(true);
    expect(IGNORED_DIRS.has('.next')).toBe(true);
  });

  it('parses FileList while ignoring noise directories and lockfiles', () => {
    const createMockFile = (relPath: string, name: string) => {
      const file = new File(['content'], name, { type: 'text/plain' });
      Object.defineProperty(file, 'webkitRelativePath', {
        value: relPath,
        writable: false,
      });
      return file;
    };

    const files = [
      createMockFile('my-project/package.json', 'package.json'),
      createMockFile('my-project/package-lock.json', 'package-lock.json'),
      createMockFile('my-project/yarn.lock', 'yarn.lock'),
      createMockFile('my-project/node_modules/react/index.js', 'index.js'),
      createMockFile('my-project/.git/config', 'config'),
      createMockFile('my-project/dist/main.js', 'main.js'),
      createMockFile('my-project/build/bundle.js', 'bundle.js'),
      createMockFile('my-project/.next/static/chunks.js', 'chunks.js'),
      createMockFile('my-project/src/index.ts', 'index.ts'),
      createMockFile('my-project/src/components/Header.tsx', 'Header.tsx'),
    ] as unknown as FileList;

    const { nodes, sources } = parseFileList(files);

    // Should include package.json and /src
    const labels = nodes.map((n) => n.label);
    expect(labels).toContain('package.json');
    expect(labels).toContain('src');

    // Should NOT contain ignored items
    expect(labels).not.toContain('node_modules');
    expect(labels).not.toContain('.git');
    expect(labels).not.toContain('dist');
    expect(labels).not.toContain('build');
    expect(labels).not.toContain('.next');
    expect(labels).not.toContain('package-lock.json');
    expect(labels).not.toContain('yarn.lock');

    // Check nested structure
    const srcNode = nodes.find((n) => n.label === 'src');
    expect(srcNode).toBeDefined();
    expect(srcNode?.type).toBe('folder');
    expect(srcNode?.children?.map((c) => c.label)).toContain('index.ts');
    expect(srcNode?.children?.map((c) => c.label)).toContain('components');

    // Check sources map contains lazy file references
    expect(sources.has('/package.json')).toBe(true);
    expect(sources.has('/src/index.ts')).toBe(true);
    expect(sources.has('/src/components/Header.tsx')).toBe(true);
    expect(sources.has('/package-lock.json')).toBe(false);
  });
});
