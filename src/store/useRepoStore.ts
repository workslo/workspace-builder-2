import { create } from 'zustand';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/auth';
import { assignNodeIds } from '../utils/diffUtils';

export interface FileNode {
  value: string; // Unique path, used by Mantine Tree
  label: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  content?: string;
  id?: string;
}

export interface FileDiff {
  action: 'add' | 'remove' | 'update';
  path: string;
  type: 'file' | 'folder';
  content?: string;
}

export interface RepoState {
  tree: FileNode[];
  initialTree: FileNode[] | null;
  selectedFilePath: string | null;
  user: any | null;
  accessToken: string | null;
  fileSources: Map<string, any>;
  pendingChatPrompt: string | null;
  setSelectedFile: (path: string | null) => void;
  setAuth: (user: any | null, token: string | null) => void;
  addNode: (path: string, type: 'file' | 'folder', content?: string) => void;
  removeNode: (path: string) => void;
  applyDiff: (diff: FileDiff) => void;
  updateFileContent: (path: string, content: string) => void;
  moveNode: (sourcePath: string, targetFolderPath: string) => void;
  loadMockData: () => void;
  setLocalFolder: (tree: FileNode[], sources: Map<string, any>) => void;
  loadFileContent: (path: string) => Promise<string | undefined>;
  hasFileSource: (path: string) => boolean;
  setPendingChatPrompt: (prompt: string | null) => void;
  captureSnapshot: () => void;
}

// A simple utility to parse a path into components
const parsePath = (path: string) => path.replace(/^\//, '').split('/').filter(Boolean);

const saveToFirebaseWrapper = async (uid: string, tree: FileNode[]) => {
  try {
    const stringified = JSON.stringify(tree || []); // Store as JSON string 
    await setDoc(doc(db, 'repos', uid), { 
      tree: stringified,
      ownerId: uid 
    }, { merge: true });
  } catch (e) {
    console.error('Failed to save to firebase', e);
  }
};

export const useRepoStore = create<RepoState>((set, get) => ({
  tree: [],
  initialTree: null,
  selectedFilePath: null,
  user: null,
  accessToken: null,
  fileSources: new Map(),
  pendingChatPrompt: null,
  setPendingChatPrompt: (prompt) => set({ pendingChatPrompt: prompt }),
  captureSnapshot: () => {
    const { tree } = get();
    set({ initialTree: JSON.parse(JSON.stringify(tree)) });
  },
  setSelectedFile: (path) => set({ selectedFilePath: path }),
  setAuth: async (user, token) => {
    set({ user, accessToken: token });
    if (user) {
      try {
        const repoDoc = await getDoc(doc(db, 'repos', user.uid));
        if (repoDoc.exists()) {
           const data = repoDoc.data();
           let treeStr = data.tree;
           const loadedTree = treeStr ? assignNodeIds(JSON.parse(treeStr)) : [];
           set({ tree: loadedTree, initialTree: JSON.parse(JSON.stringify(loadedTree)) });
        }
      } catch (e) {
        console.error('Failed to load from firebase', e);
      }
    } else {
      set({ tree: [], initialTree: null });
    }
  },
  
  addNode: (path, type, content) => {
    // Basic root-level or shallow nested support.
    // In a full implementation, you'd recursively traverse the tree.
    set((state) => {
      const parts = parsePath(path);
      if (parts.length === 0) return state;

      const newTree = JSON.parse(JSON.stringify(state.tree)) as FileNode[]; // deep clone
      let currentLevel = newTree;
      
      let currentPathAccumulator = '';

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        currentPathAccumulator += `/${part}`;
        const isLast = i === parts.length - 1;
        
        let existingNode = currentLevel.find((n) => n.label === part);
        
        if (!existingNode) {
          existingNode = {
            id: `node-${isLast ? type : 'folder'}-${currentPathAccumulator.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            value: currentPathAccumulator,
            label: part,
            type: isLast ? type : 'folder',
            children: isLast && type === 'file' ? undefined : [],
            content: isLast ? content : undefined,
          };
          currentLevel.push(existingNode);
        }
        
        if (!isLast) {
          if (!existingNode.children) existingNode.children = [];
          currentLevel = existingNode.children;
        }
      }
      if (state.user) saveToFirebaseWrapper(state.user.uid, newTree);
      return { tree: newTree };
    });
  },
  
  removeNode: (path) => {
    set((state) => {
      const newTree = JSON.parse(JSON.stringify(state.tree)) as FileNode[];

      const removePath = (nodes: FileNode[]) => {
        const index = nodes.findIndex(n => n.value === path);
        if (index !== -1) {
          nodes.splice(index, 1);
          return true;
        }
        for (const n of nodes) {
          if (n.children && removePath(n.children)) {
            return true;
          }
        }
        return false;
      };

      const changed = removePath(newTree);
      if (changed) {
        if (state.user) saveToFirebaseWrapper(state.user.uid, newTree);
        const isSelectedRemoved = state.selectedFilePath === path || state.selectedFilePath?.startsWith(path + '/');
        
        const newSources = new Map(state.fileSources);
        newSources.delete(path);
        for (const key of Array.from(newSources.keys())) {
          if (key.startsWith(path + '/')) {
            newSources.delete(key);
          }
        }

        return { 
          tree: newTree,
          selectedFilePath: isSelectedRemoved ? null : state.selectedFilePath,
          fileSources: newSources,
        };
      }
      return state;
    });
  },
  
  applyDiff: (diff: FileDiff) => {
    if (diff.action === 'add') {
      get().addNode(diff.path, diff.type, diff.content);
    } else if (diff.action === 'remove') {
      get().removeNode(diff.path);
    } else if (diff.action === 'update') {
      // Update existing content
      set((state) => {
        const newTree = JSON.parse(JSON.stringify(state.tree)) as FileNode[]; // deep clone 
        
        const updateNodeContent = (nodes: FileNode[]) => {
           for (const n of nodes) {
              if (n.value === diff.path) {
                 n.content = diff.content;
                 return true;
              }
              if (n.children && updateNodeContent(n.children)) return true;
           }
           return false;
        };

        const changed = updateNodeContent(newTree);
        if (changed) {
           if (state.user) saveToFirebaseWrapper(state.user.uid, newTree);
           return { tree: newTree };
        }
        return state;
      });
    }
  },

  updateFileContent: (path: string, content: string) => {
    set((state) => {
      const newTree = JSON.parse(JSON.stringify(state.tree)) as FileNode[]; // deep clone 
      
      const updateNodeContent = (nodes: FileNode[]) => {
         for (const n of nodes) {
            if (n.value === path) {
               n.content = content;
               return true;
            }
            if (n.children && updateNodeContent(n.children)) return true;
         }
         return false;
      };

      const changed = updateNodeContent(newTree);
      if (changed) {
         if (state.user) saveToFirebaseWrapper(state.user.uid, newTree);
         return { tree: newTree };
      }
      return state;
    });
  },

  moveNode: (sourcePath, targetFolderPath) => {
    set((state) => {
      // Prevent moving into itself or its own children
      if (sourcePath === targetFolderPath || targetFolderPath.startsWith(sourcePath + '/')) {
        return state;
      }
      
      const newTree = JSON.parse(JSON.stringify(state.tree)) as FileNode[];

      let extractedNode: FileNode | null = null;

      // Extract the source node
      const removeAndExtract = (nodes: FileNode[]): boolean => {
        const index = nodes.findIndex(n => n.value === sourcePath);
        if (index !== -1) {
          extractedNode = nodes.splice(index, 1)[0];
          return true;
        }
        for (const n of nodes) {
          if (n.children && removeAndExtract(n.children)) {
            return true;
          }
        }
        return false;
      };

      if (!removeAndExtract(newTree) || !extractedNode) {
        return state;
      }

      // Update paths recursively
      const updatePath = (node: FileNode, newBasePath: string) => {
         const newPath = newBasePath === '/' ? `/${node.label}` : `${newBasePath}/${node.label}`;
         node.value = newPath;
         if (node.children) {
            node.children.forEach(c => updatePath(c, newPath));
         }
      };

      updatePath(extractedNode, targetFolderPath);

      // Insert into target
      if (targetFolderPath === '/') {
        newTree.push(extractedNode);
      } else {
        const insertIntoTarget = (nodes: FileNode[]): boolean => {
          for (const n of nodes) {
            if (n.value === targetFolderPath) {
              if (!n.children) n.children = [];
              n.children.push(extractedNode!);
              return true;
            }
            if (n.children && insertIntoTarget(n.children)) {
              return true;
            }
          }
          return false;
        };
        
        if (!insertIntoTarget(newTree)) {
           // Fallback to root if target somehow not found
           newTree.push(extractedNode);
        }
      }

      if (state.user) saveToFirebaseWrapper(state.user.uid, newTree);
      
      // Update selected file path if it was moved
      let newSelectedPath = state.selectedFilePath;
      if (state.selectedFilePath === sourcePath) {
         newSelectedPath = extractedNode.value;
      } else if (state.selectedFilePath && state.selectedFilePath.startsWith(sourcePath + '/')) {
         const relative = state.selectedFilePath.substring(sourcePath.length);
         newSelectedPath = extractedNode.value + relative;
      }

      // Update fileSources paths
      const newSources = new Map(state.fileSources);
      if (newSources.has(sourcePath)) {
        const src = newSources.get(sourcePath);
        newSources.delete(sourcePath);
        newSources.set(extractedNode.value, src);
      }
      for (const [key, val] of Array.from(newSources.entries())) {
        if (key.startsWith(sourcePath + '/')) {
          newSources.delete(key);
          const newKey = extractedNode.value + key.substring(sourcePath.length);
          newSources.set(newKey, val);
        }
      }

      return { tree: newTree, selectedFilePath: newSelectedPath, fileSources: newSources };
    });
  },

  loadMockData: () => {
    const mockTree: FileNode[] = [
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
              { value: '/src/components/Button.tsx', label: 'Button.tsx', type: 'file', content: 'export const Button = () => <button>Click me</button>;' },
              { value: '/src/components/Header.tsx', label: 'Header.tsx', type: 'file', content: 'export const Header = () => <header>App Header</header>;' }
            ]
          },
          { value: '/src/App.tsx', label: 'App.tsx', type: 'file', content: 'export default function App() { return <div>App</div>; }' },
          { value: '/src/main.tsx', label: 'main.tsx', type: 'file', content: 'import { createRoot } from "react-dom/client";' }
        ]
      },
      { value: '/package.json', label: 'package.json', type: 'file', content: '{ "name": "mock-repo", "version": "1.0.0" }' },
      { value: '/README.md', label: 'README.md', type: 'file', content: '# Mock Repo\n\nThis is a mock repository loaded from Zustand store.' }
    ];
    const preparedMock = assignNodeIds(mockTree);
    set({
      tree: preparedMock,
      initialTree: JSON.parse(JSON.stringify(preparedMock)),
      selectedFilePath: null,
      fileSources: new Map()
    });
    
    // Save to firebase
    const { user } = get();
    if (user) {
        saveToFirebaseWrapper(user.uid, preparedMock);
    }
  },

  setLocalFolder: (tree, sources) => {
    const preparedTree = assignNodeIds(tree);
    set({
      tree: preparedTree,
      initialTree: JSON.parse(JSON.stringify(preparedTree)),
      selectedFilePath: null,
      fileSources: sources,
    });
    const { user } = get();
    if (user) {
      saveToFirebaseWrapper(user.uid, preparedTree);
    }
  },

  loadFileContent: async (path: string) => {
    // Find node in tree
    const findNode = (nodes: FileNode[]): FileNode | null => {
      for (const n of nodes) {
        if (n.value === path) return n;
        if (n.children) {
          const found = findNode(n.children);
          if (found) return found;
        }
      }
      return null;
    };

    const node = findNode(get().tree);
    if (node && node.content !== undefined) {
      return node.content;
    }

    const { fileSources, updateFileContent } = get();
    const source = fileSources.get(path);
    if (!source) {
      return undefined;
    }

    try {
      let content = '';
      if (typeof source.getFile === 'function') {
        const file = await source.getFile();
        content = await file.text();
      } else if (source instanceof File || typeof source.text === 'function') {
        content = await source.text();
      } else {
        return undefined;
      }

      updateFileContent(path, content);
      return content;
    } catch (err: any) {
      console.error('Failed to load file content lazily:', err);
      const errMsg = `// Unable to read file content: ${err?.message || 'Unknown error'}`;
      updateFileContent(path, errMsg);
      return errMsg;
    }
  },

  hasFileSource: (path: string) => {
    return get().fileSources.has(path);
  },
}));
