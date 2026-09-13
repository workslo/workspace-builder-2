import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Box, Button, Group, TextInput, Tree, Title, ScrollArea, useTree, Paper, Text, Modal, ActionIcon } from '@mantine/core';
import { useRepoStore, FileNode } from '../store/useRepoStore';
import { RepoNode } from './RepoNode';
import { IconPlus, IconTrash, IconSearch, IconDownload, IconFolderOpen, IconPackageExport } from '@tabler/icons-react';
import { parseDirectoryHandle, parseFileList } from '../utils/fileSystem';
import { computeRepoDiff } from '../utils/diffUtils';
import { BundleChangesModal } from './BundleChangesModal';

export function RepoViewer() {
  const tree = useRepoStore((state) => state.tree);
  const initialTree = useRepoStore((state) => state.initialTree);
  const captureSnapshot = useRepoStore((state) => state.captureSnapshot);
  const loadMockData = useRepoStore((state) => state.loadMockData);
  const addNode = useRepoStore((state) => state.addNode);
  const removeNode = useRepoStore((state) => state.removeNode);
  const moveNode = useRepoStore((state) => state.moveNode);
  const setLocalFolder = useRepoStore((state) => state.setLocalFolder);
  const [newValue, setNewValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, path: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Initialize baseline snapshot if tree is already populated but initialTree is null
  useEffect(() => {
    if (initialTree === null && tree.length > 0) {
      captureSnapshot();
    }
  }, [initialTree, tree, captureSnapshot]);

  // Compute reactive diff between baseline tree and current tree
  const repoDiff = useMemo(() => computeRepoDiff(initialTree, tree), [initialTree, tree]);

  const treeController = useTree({ multiple: false });

  // Close context menu on any click
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const handleContextMenu = React.useCallback((e: React.MouseEvent, path: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, path });
  }, []);

  const handleAdd = () => {
    if (!newValue.trim()) return;
    const isFile = newValue.includes('.');
    // For simplicity, adding to root. We could parse path like "/src/test.tsx"
    addNode(newValue.startsWith('/') ? newValue : `/${newValue}`, isFile ? 'file' : 'folder');
    setNewValue('');
  };

  const exportTree = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tree, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "repo-structure.json");
    document.body.appendChild(downloadAnchorNode); 
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return tree;
    const lowerQuery = searchQuery.toLowerCase();
    
    const filterNodes = (nodes: FileNode[]): FileNode[] => {
      return nodes.map(node => {
        const match = (node.label as string).toLowerCase().includes(lowerQuery);
        if (node.children) {
          const filteredChildren = filterNodes(node.children);
          if (filteredChildren.length > 0 || match) {
            return { ...node, children: filteredChildren.length > 0 ? filteredChildren : node.children };
          }
        } else if (match) {
          return node;
        }
        return null;
      }).filter(Boolean) as FileNode[];
    };
    
    return filterNodes(tree);
  }, [tree, searchQuery]);

  // Auto-expand nodes when searching
  useEffect(() => {
    if (searchQuery.trim()) {
      treeController.expandAllNodes();
    }
  }, [searchQuery, filteredTree]);

  const renderNode = React.useCallback(
    (payload: any) => <RepoNode node={payload} onContextMenu={handleContextMenu} searchQuery={searchQuery} />,
    [handleContextMenu, searchQuery]
  );

  const handleRootDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleRootDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const sourcePath = e.dataTransfer.getData('application/x-repo-node');
    if (sourcePath) {
      moveNode(sourcePath, '/');
    }
  };

  const handleOpenFolder = async () => {
    // Try browser's File System Access API (window.showDirectoryPicker)
    if (typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function') {
      try {
        setIsOpeningFolder(true);
        const dirHandle = await (window as any).showDirectoryPicker();
        const { nodes, sources } = await parseDirectoryHandle(dirHandle);
        setLocalFolder(nodes, sources);
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          // User deliberately cancelled picker dialog
          return;
        }
        console.warn('showDirectoryPicker failed or restricted, falling back to input:', err);
        // Fallback to webkitdirectory file input
        fileInputRef.current?.click();
      } finally {
        setIsOpeningFolder(false);
      }
    } else {
      // Fallback for browsers without File System Access API
      fileInputRef.current?.click();
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      setIsOpeningFolder(true);
      const { nodes, sources } = parseFileList(files);
      setLocalFolder(nodes, sources);
    } catch (err) {
      console.error('Failed to parse local directory files:', err);
    } finally {
      setIsOpeningFolder(false);
      e.target.value = '';
    }
  };

  return (
    <Box p="md" h="100%" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        multiple
        {...({ webkitdirectory: '', directory: '' } as any)}
        onChange={handleFileInputChange}
      />
      <Group justify="space-between" mb="md" style={{ flexShrink: 0 }}>
        <Title order={4}>Repo Explorer</Title>
        <Group gap="xs">
          <ActionIcon variant="light" size="sm" onClick={exportTree} title="Export JSON">
            <IconDownload size={16} />
          </ActionIcon>
          <Button
            variant="light"
            size="xs"
            leftSection={<IconFolderOpen size={14} />}
            onClick={handleOpenFolder}
            loading={isOpeningFolder}
          >
            Open Folder
          </Button>
          <Button variant="light" size="xs" onClick={loadMockData}>
            Load Mock
          </Button>
          <Button
            variant="light"
            size="xs"
            color={repoDiff.totalCount > 0 ? 'teal' : 'gray'}
            leftSection={<IconPackageExport size={14} />}
            onClick={() => setIsExportModalOpen(true)}
            disabled={repoDiff.totalCount === 0}
          >
            Export Changes ({repoDiff.totalCount})
          </Button>
        </Group>
      </Group>
      
      <Box mb="sm" style={{ flexShrink: 0 }}>
        <TextInput
          placeholder="Search files/folders..."
          size="sm"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
          leftSection={<IconSearch size={16} />}
        />
      </Box>

      <form onSubmit={(e) => { e.preventDefault(); handleAdd(); }} style={{ marginBottom: '16px', flexShrink: 0 }}>
        <TextInput 
          placeholder="New file/folder (e.g., /src/utils.ts)" 
          size="sm"
          value={newValue}
          onChange={(e) => setNewValue(e.currentTarget.value)}
          rightSection={
            <IconPlus 
              size={16} 
              style={{ cursor: 'pointer' }}
              onClick={handleAdd}
            />
          }
        />
      </form>

      <ScrollArea 
        style={{ flex: 1, minHeight: 0 }} 
        type="scroll"
        offsetScrollbars
        onDragOver={handleRootDragOver}
        onDrop={handleRootDrop}
      >
        <Tree
          tree={treeController}
          data={filteredTree as any}
          renderNode={renderNode}
        />
      </ScrollArea>

      {contextMenu && (
        <Paper
          shadow="md"
          p="xs"
          withBorder
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 1000,
          }}
        >
          <Group 
            gap="sm" 
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              setDeleteConfirm(contextMenu.path);
              setContextMenu(null);
            }}
          >
            <IconTrash size={16} color="red" />
            <Text size="sm" c="red">Delete</Text>
          </Group>
        </Paper>
      )}

      <Modal 
        opened={!!deleteConfirm} 
        onClose={() => setDeleteConfirm(null)} 
        title="Confirm Deletion"
        centered
      >
        <Text size="sm" mb="lg">
          Are you sure you want to delete <strong>{deleteConfirm}</strong>? This action cannot be undone.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button color="red" onClick={() => {
            if (deleteConfirm) {
              removeNode(deleteConfirm);
              setDeleteConfirm(null);
            }
          }}>Delete</Button>
        </Group>
      </Modal>

      <BundleChangesModal
        opened={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        diff={repoDiff}
      />
    </Box>
  );
}
