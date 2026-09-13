import { Box, Code, Text, Title, ScrollArea, Center, Stack, Breadcrumbs, Loader } from '@mantine/core';
import { IconCode, IconSparkles } from '@tabler/icons-react';
import { useRepoStore, FileNode } from '../store/useRepoStore';
import CodeMirror from '@uiw/react-codemirror';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { useCallback, useState, useEffect } from 'react';

const findFile = (nodes: FileNode[], path: string): FileNode | null => {
  for (const node of nodes) {
    if (node.value === path) return node;
    if (node.children) {
      const found = findFile(node.children, path);
      if (found) return found;
    }
  }
  return null;
};

export function FilePreview() {
  const selectedNode = useRepoStore((state) => 
    state.selectedFilePath ? findFile(state.tree, state.selectedFilePath) : null
  );

  const updateFileContent = useRepoStore((state) => state.updateFileContent);
  const loadFileContent = useRepoStore((state) => state.loadFileContent);
  const hasFileSource = useRepoStore((state) => state.hasFileSource);
  const [isLoadingContent, setIsLoadingContent] = useState(false);

  useEffect(() => {
    let active = true;
    if (selectedNode && selectedNode.type === 'file' && selectedNode.content === undefined) {
      if (hasFileSource(selectedNode.value)) {
        setIsLoadingContent(true);
        loadFileContent(selectedNode.value)
          .catch((err) => {
            console.error('Failed to load file content:', err);
          })
          .finally(() => {
            if (active) setIsLoadingContent(false);
          });
      } else {
        setIsLoadingContent(false);
      }
    } else {
      setIsLoadingContent(false);
    }
    return () => {
      active = false;
    };
  }, [selectedNode?.value, selectedNode?.content, selectedNode?.type, loadFileContent, hasFileSource]);

  const getExtensions = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
        return [javascript({ jsx: true, typescript: true })];
      case 'js':
      case 'jsx':
        return [javascript({ jsx: true })];
      case 'html':
        return [html()];
      case 'css':
        return [css()];
      case 'json':
        return [json()];
      case 'md':
        return [markdown()];
      default:
        return [];
    }
  };

  const onChange = useCallback((val: string) => {
    if (selectedNode) {
      updateFileContent(selectedNode.value, val);
    }
  }, [selectedNode, updateFileContent]);

  if (!selectedNode) {
    return (
      <Center h="100%" p="xl">
        <Stack align="center" gap="sm">
          <IconCode size={64} color="var(--mantine-color-dark-4)" stroke={1.5} />
          <Title order={3} c="dark.2" fw={500}>Ready to Code</Title>
          <Text c="dimmed" size="sm" maw={300} ta="center">
            Select a file from the repository explorer on the left to view its contents here.
          </Text>
        </Stack>
      </Center>
    );
  }

  const pathParts = selectedNode.value.replace(/^[\\\/]+|[\\\/]+$/g, '').split('/');
  const breadcrumbItems = pathParts.map((item, index) => (
    <Text key={index} c={index === pathParts.length - 1 ? 'gray.2' : 'dimmed'} ff="monospace" size="sm" fw={index === pathParts.length - 1 ? 600 : 400}>
      {item}
    </Text>
  ));

  return (
    <Box h="100%" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      <Box p="md" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)', flexShrink: 0 }}>
        <Breadcrumbs separator="/" separatorMargin="xs">
          {breadcrumbItems}
        </Breadcrumbs>
      </Box>
      <ScrollArea style={{ flex: 1, minHeight: 0 }} type="scroll" bg="dark.8">
        <Box h="100%">
           {isLoadingContent ? (
             <Center h={200}>
               <Stack align="center" gap="xs">
                 <Loader size="sm" color="blue" />
                 <Text c="dimmed" size="sm">Loading file content...</Text>
               </Stack>
             </Center>
           ) : selectedNode.content !== undefined ? (
             <CodeMirror
               value={selectedNode.content}
               height="100%"
               style={{ minHeight: '100%', fontSize: '14px', fontFamily: 'JetBrains Mono, monospace' }}
               theme={vscodeDark}
               extensions={getExtensions(selectedNode.label)}
               onChange={onChange}
               basicSetup={{
                 lineNumbers: true,
                 highlightActiveLineGutter: true,
                 foldGutter: true,
               }}
             />
           ) : (
             <Center h={200}>
               <Stack align="center" gap="xs">
                 <IconSparkles size={32} color="var(--mantine-color-dark-3)" />
                 <Text c="dimmed" fs="italic">This file is empty</Text>
               </Stack>
             </Center>
           )}
        </Box>
      </ScrollArea>
    </Box>
  );
}
