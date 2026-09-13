import { FileNode } from '../store/useRepoStore';

export const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.cache',
  'out',
  '.output',
  '.nuxt',
  '.svelte-kit',
  '.parcel-cache',
  '.docusaurus',
  '.yarn',
]);

export const isLockFile = (filename: string): boolean => {
  const lower = filename.toLowerCase();
  return (
    lower === 'package-lock.json' ||
    lower === 'yarn.lock' ||
    lower === 'pnpm-lock.yaml' ||
    lower === 'bun.lockb' ||
    lower === 'bun.lock' ||
    lower === 'composer.lock' ||
    lower === 'cargo.lock' ||
    lower === 'gemfile.lock' ||
    lower === 'poetry.lock' ||
    lower.endsWith('.lock') ||
    lower.endsWith('.lockb')
  );
};

export type FileSource = any; // File or FileSystemFileHandle

export interface ParseResult {
  nodes: FileNode[];
  sources: Map<string, FileSource>;
}

/**
 * Recursively parses a FileSystemDirectoryHandle (from window.showDirectoryPicker)
 * into a list of FileNodes and a map of path -> FileSystemFileHandle for lazy content loading.
 */
export async function parseDirectoryHandle(
  dirHandle: any,
  currentPath: string = '',
  depth: number = 0
): Promise<ParseResult> {
  const nodes: FileNode[] = [];
  const sources = new Map<string, FileSource>();

  if (depth > 25) {
    return { nodes, sources };
  }

  try {
    const entries: any[] = [];
    if (typeof dirHandle.values === 'function') {
      for await (const entry of dirHandle.values()) {
        entries.push(entry);
      }
    } else if (typeof dirHandle.entries === 'function') {
      for await (const [, entry] of dirHandle.entries()) {
        entries.push(entry);
      }
    }

    for (const entry of entries) {
      const name: string = entry.name;
      if (!name) continue;

      if (entry.kind === 'directory') {
        if (IGNORED_DIRS.has(name.toLowerCase())) {
          continue;
        }
        const folderPath = `${currentPath}/${name}`;
        const subResult = await parseDirectoryHandle(entry, folderPath, depth + 1);
        nodes.push({
          value: folderPath,
          label: name,
          type: 'folder',
          children: subResult.nodes,
        });
        for (const [p, s] of subResult.sources.entries()) {
          sources.set(p, s);
        }
      } else if (entry.kind === 'file') {
        if (isLockFile(name)) {
          continue;
        }
        const filePath = `${currentPath}/${name}`;
        nodes.push({
          value: filePath,
          label: name,
          type: 'file',
          // Content is left undefined for lazy loading
        });
        sources.set(filePath, entry);
      }
    }
  } catch (err) {
    console.error('Error reading directory handle:', err);
  }

  // Sort folders first, then files alphabetically
  nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'folder' ? -1 : 1;
    }
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  });

  return { nodes, sources };
}

/**
 * Parses a FileList from an <input type="file" webkitdirectory> into
 * a list of FileNodes and a map of path -> File for lazy content loading.
 */
export function parseFileList(files: FileList): ParseResult {
  const sources = new Map<string, FileSource>();
  const rootNodes: FileNode[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const relativePath = file.webkitRelativePath || file.name;
    const parts = relativePath.split('/').filter(Boolean);

    // If there is more than 1 segment, the first segment is the selected top directory name.
    // We strip it so the tree paths start from the contents of the chosen directory.
    const normalizedParts = parts.length > 1 ? parts.slice(1) : parts;

    // Check if any directory segment in path is ignored
    const dirSegments = normalizedParts.slice(0, -1);
    const hasIgnoredDir = dirSegments.some((seg) => IGNORED_DIRS.has(seg.toLowerCase()));
    if (hasIgnoredDir) {
      continue;
    }

    const fileName = normalizedParts[normalizedParts.length - 1];
    if (isLockFile(fileName)) {
      continue;
    }

    // Traverse or create folder hierarchy
    let currentLevel = rootNodes;
    let currentPathAccumulator = '';

    for (let p = 0; p < normalizedParts.length; p++) {
      const part = normalizedParts[p];
      currentPathAccumulator += `/${part}`;
      const isLast = p === normalizedParts.length - 1;

      let existing = currentLevel.find((n) => n.label === part);
      if (!existing) {
        existing = {
          value: currentPathAccumulator,
          label: part,
          type: isLast ? 'file' : 'folder',
          children: isLast ? undefined : [],
        };
        currentLevel.push(existing);
      }

      if (isLast) {
        sources.set(currentPathAccumulator, file);
      } else {
        if (!existing.children) existing.children = [];
        currentLevel = existing.children;
      }
    }
  }

  // Sort recursively: folders first, then files alphabetically
  const sortNodes = (nodes: FileNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    });
    for (const node of nodes) {
      if (node.children) {
        sortNodes(node.children);
      }
    }
  };

  sortNodes(rootNodes);

  return { nodes: rootNodes, sources };
}
