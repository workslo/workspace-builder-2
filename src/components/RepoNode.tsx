import React from 'react';
import { Group, RenderTreeNodePayload, Highlight } from '@mantine/core';
import { 
  IconFolder, IconFolderOpen, IconBrandReact, 
  IconFileCode, IconFileText, IconFileDescription, 
  IconPhoto, IconFile, IconSettings
} from '@tabler/icons-react';
import { useRepoStore } from '../store/useRepoStore';

interface RepoNodeProps {
  node: RenderTreeNodePayload;
  onContextMenu?: (e: React.MouseEvent, path: string) => void;
  searchQuery?: string;
}

export const RepoNode = React.memo(function RepoNode({ node, onContextMenu, searchQuery = '' }: RepoNodeProps) {
  const { hasChildren, expanded, elementProps, node: treeNode, level } = node;
  const setSelectedFile = useRepoStore((state) => state.setSelectedFile);
  const selectedFilePath = useRepoStore((state) => state.selectedFilePath);
  
  const moveNode = useRepoStore((state) => state.moveNode);
  
  // Try to determine if it's a folder or which file type
  let labelStr = (treeNode.label as string) || '';
  labelStr = labelStr.replace(/^[\\\/]+|[\\\/]+$/g, '');
  const isFolder = hasChildren || !labelStr.includes('.');

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/x-repo-node', treeNode.value as string);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (isFolder) {
      e.dataTransfer.dropEffect = 'move';
    } else {
      e.dataTransfer.dropEffect = 'none';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent bubbling up to the root container if this folder catches it
    const sourcePath = e.dataTransfer.getData('application/x-repo-node');
    if (sourcePath && isFolder) {
       // Check that we aren't dropping onto ourselves or a child of ourselves
       if (sourcePath !== treeNode.value && !(treeNode.value as string).startsWith(sourcePath + '/')) {
          moveNode(sourcePath, treeNode.value as string);
       }
    }
  };

  const getIcon = () => {
    if (isFolder) {
      return expanded ? <IconFolderOpen size={20} color="#FFD43B" /> : <IconFolder size={20} color="#FFD43B" />;
    }
    
    if (labelStr.endsWith('.tsx') || labelStr.endsWith('.jsx')) return <IconBrandReact size={20} color="#61DBFB" />;
    if (labelStr.endsWith('.ts') || labelStr.endsWith('.js') || labelStr.endsWith('.json') || labelStr.endsWith('.html') || labelStr.endsWith('.css')) return <IconFileCode size={20} color="#339AF0" />;
    if (labelStr.endsWith('.md') || labelStr.endsWith('.txt')) return <IconFileText size={20} color="#845EF7" />;
    if (labelStr.endsWith('.png') || labelStr.endsWith('.jpg') || labelStr.endsWith('.svg')) return <IconPhoto size={20} color="#20C997" />;
    if (labelStr.startsWith('.')) return <IconSettings size={20} color="#CED4DA" />; // e.g. .env, .gitignore
    
    return <IconFile size={20} color="#CED4DA" />;
  };

  const handleClick = (event: React.MouseEvent) => {
    // Let Tree handle expanding/collapsing if it wants to
    elementProps.onClick?.(event as any);
    
    if (!hasChildren) {
      setSelectedFile(treeNode.value as string);
    }
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    if (onContextMenu) {
      onContextMenu(event, treeNode.value as string);
    }
  };

  const isSelected = selectedFilePath === treeNode.value;

  return (
    <Group 
      gap={8} 
      {...elementProps} 
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`repo-node ${isSelected ? 'selected' : ''}`}
      style={{ 
        paddingLeft: `calc(${level * 16}px + 8px)`,
        ...elementProps.style 
      }}
    >
      <div className="repo-node-icon">
        {getIcon()}
      </div>
      <Highlight highlight={searchQuery} size="sm" fw={isSelected ? 600 : 400}>
        {labelStr}
      </Highlight>
    </Group>
  );
});
