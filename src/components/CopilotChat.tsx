import { useState, useRef, useEffect, useMemo } from 'react';
import { Box, Button, Card, Text, Title, Badge, Stack, TextInput, ActionIcon, ScrollArea, Loader, Group, Code, FileButton, Image, Indicator, Select, Tooltip } from '@mantine/core';
import { IconSend, IconSparkles, IconPhoto, IconX, IconLink, IconUnlink } from '@tabler/icons-react';
import { useRepoStore, FileDiff, FileNode } from '../store/useRepoStore';
import ReactMarkdown from 'react-markdown';

// Simulated AI responses
const MOCK_AI_RESPONSES = [
  {
    text: "I can help with that. Let's add a new Authentication context.",
    diff: {
      action: 'add',
      path: '/src/context/AuthContext.tsx',
      type: 'file',
      content: 'export const AuthContext = React.createContext({});'
    }
  },
  {
    text: "Here's the button component you requested.",
    diff: {
      action: 'add',
      path: '/src/components/ui/Button.tsx',
      type: 'file',
      content: 'export const Button = () => <button>UI Button</button>;'
    }
  }
];

const findFileNode = (nodes: FileNode[], path: string): FileNode | null => {
  for (const node of nodes) {
    if (node.value === path) return node;
    if (node.children) {
      const found = findFileNode(node.children, path);
      if (found) return found;
    }
  }
  return null;
};

export function CopilotChat() {
  const applyDiff = useRepoStore((state) => state.applyDiff);
  const selectedFilePath = useRepoStore((state) => state.selectedFilePath);
  const tree = useRepoStore((state) => state.tree);
  const pendingChatPrompt = useRepoStore((state) => state.pendingChatPrompt);
  const setPendingChatPrompt = useRepoStore((state) => state.setPendingChatPrompt);

  const [messages, setMessages] = useState<{role: 'user' | 'ai', text: string, image?: string | null, diff?: FileDiff}[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExtendedThinking, setIsExtendedThinking] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.5-flash');
  const [isContextAttached, setIsContextAttached] = useState<boolean>(true);

  // Auto pre-fill input when requested by Agent Prompt exporter
  useEffect(() => {
    if (pendingChatPrompt) {
      setInput(pendingChatPrompt);
      setPendingChatPrompt(null);
    }
  }, [pendingChatPrompt, setPendingChatPrompt]);

  // Derive active file details
  const selectedNode = useMemo(() => {
    return selectedFilePath ? findFileNode(tree, selectedFilePath) : null;
  }, [tree, selectedFilePath]);

  const activeFileName = selectedNode?.label || (selectedFilePath ? selectedFilePath.split('/').pop() : '');
  const activeBreadcrumbs = selectedFilePath
    ? selectedFilePath.replace(/^\/+/, '').split('/').join(' / ')
    : '';

  const handleImageSelect = (file: File | null) => {
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setSelectedImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const scrollToBottom = () => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, isExtendedThinking]);

  const handleSend = async () => {
    if ((!input.trim() && !selectedImage) || isLoading) return;
    
    const userMessage = { role: 'user' as const, text: input, image: selectedImage };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    const currentImage = selectedImage;
    setInput('');
    setSelectedImage(null);
    setIsLoading(true);
    setIsExtendedThinking(false);
    
    let thinkingTimeout = setTimeout(() => {
      setIsExtendedThinking(true);
    }, 8000);
    
    try {
      const currentTree = useRepoStore.getState().tree;
      
      if (selectedModel === 'gemini-3.1-flash-image-preview') {
         // Handle image generation separately
         const response = await fetch('/api/generate-image', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ prompt: currentInput })
         });
         
         if (!response.ok) {
            let errorData = null;
            try {
                errorData = await response.json();
            } catch(e) {}
            throw new Error(errorData?.error || 'Failed to generate image');
         }
         const data = await response.json();
         
         clearTimeout(thinkingTimeout);
         setMessages(prev => [...prev, { role: 'ai', text: 'Here is the generated image:', image: data.image }]);
         return;
      }

      const activeFilePayload = (isContextAttached && selectedFilePath && selectedNode) ? {
        path: selectedFilePath,
        name: activeFileName,
        content: selectedNode.content,
        breadcrumbPath: activeBreadcrumbs,
      } : null;

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: currentInput,
          image: currentImage,
          model: selectedModel,
          history: messages.map(m => ({ role: m.role, text: m.text, image: m.image })),
          diffContext: JSON.stringify(currentTree, null, 2),
          activeFile: activeFilePayload,
        }),
      });

      if (!response.ok) {
         let errorData = null;
         try {
             errorData = await response.json();
         } catch(e) {}
         throw new Error(errorData?.error || 'API Error');
      }
      if (!response.body) throw new Error('No response body');

      clearTimeout(thinkingTimeout);
      setIsExtendedThinking(false);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let fullText = '';
      
      // Initialize an empty AI message
      setMessages(prev => [...prev, { role: 'ai', text: '' }]);

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          fullText += chunk;
          
          let display = fullText;
          const jsonMatch = fullText.match(/\`\`\`json\n([\s\S]*?)(\n\`\`\`|$)/);
          if (jsonMatch && jsonMatch.index !== undefined) {
             display = fullText.substring(0, jsonMatch.index).trim();
          }

          setMessages(prev => {
            const newMsgs = [...prev];
            const lastMsg = newMsgs[newMsgs.length - 1];
            if (lastMsg && lastMsg.role === 'ai') {
              lastMsg.text = display;
            }
            return newMsgs;
          });
        }
      }
      
      const finalJsonMatch = fullText.match(/\`\`\`json\n([\s\S]*?)\n\`\`\`/);
      if (finalJsonMatch) {
         try {
           const diff = JSON.parse(finalJsonMatch[1]);
           setMessages(prev => {
             const newMsgs = [...prev];
             const lastMsg = newMsgs[newMsgs.length - 1];
             if (lastMsg && lastMsg.role === 'ai') {
               lastMsg.diff = diff;
             }
             return newMsgs;
           });
         } catch(e) {}
      }
    } catch (err: any) {
      console.error(err);
      clearTimeout(thinkingTimeout);
      setMessages(prev => [...prev, {
        role: 'ai',
        text: `Sorry, I ran into an error processing your request: ${err.message || 'Unknown error'}`
      }]);
    } finally {
      clearTimeout(thinkingTimeout);
      setIsLoading(false);
      setIsExtendedThinking(false);
    }
  };

  return (
    <Box p="md" h="100%" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      <Group mb="md" justify="space-between" style={{ flexShrink: 0 }}>
        <Group gap="xs">
          <IconSparkles size={20} color="var(--mantine-color-blue-5)" />
          <Title order={4}>AI Co-pilot</Title>
        </Group>
        <Select
          size="xs"
          value={selectedModel}
          onChange={(val) => setSelectedModel(val || 'gemini-3.5-flash')}
          data={[
            { value: 'gemini-3.5-flash', label: 'Flash (Default, Search)' },
            { value: 'gemini-3.1-pro-preview', label: 'Pro (Complex)' },
            { value: 'gemini-3.1-flash-lite', label: 'Flash Lite (Fast)' },
            { value: 'gemini-3.1-flash-image-preview', label: 'Image Gen' },
          ]}
          w={160}
        />
      </Group>

      {selectedFilePath && activeFileName && (
        <Group mb="xs" gap="xs" align="center" style={{ flexShrink: 0 }}>
          <Tooltip
            label={isContextAttached ? "Active file context attached to Co-pilot. Click to detach." : "Active file context detached. Click to attach."}
            withArrow
          >
            <Badge
              size="sm"
              variant={isContextAttached ? "light" : "outline"}
              color={isContextAttached ? "blue" : "gray"}
              style={{
                cursor: 'pointer',
                maxWidth: '100%',
                textTransform: 'none',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              onClick={() => setIsContextAttached(!isContextAttached)}
              leftSection={
                isContextAttached ? (
                  <IconLink size={12} style={{ display: 'block' }} />
                ) : (
                  <IconUnlink size={12} style={{ display: 'block' }} />
                )
              }
              rightSection={
                <ActionIcon
                  size={14}
                  color={isContextAttached ? "blue" : "gray"}
                  variant="transparent"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsContextAttached(!isContextAttached);
                  }}
                  title={isContextAttached ? "Detach context" : "Attach context"}
                >
                  {isContextAttached ? <IconX size={10} /> : <IconLink size={10} />}
                </ActionIcon>
              }
            >
              Context: {activeFileName}{!isContextAttached ? ' (Detached)' : ''}
            </Badge>
          </Tooltip>
        </Group>
      )}
      
      <ScrollArea style={{ flex: 1, minHeight: 0 }} offsetScrollbars viewportRef={viewportRef} type="scroll">
        <Stack p="2">
          {messages.length === 0 ? (
            <Text c="dimmed" size="sm" style={{ textAlign: 'center', marginTop: '20px' }}>
              Ask the co-pilot to generate or update files.
            </Text>
          ) : null}

          {messages.map((msg, i) => (
            <Box key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%' }}>
              <Card shadow="sm" radius="md" p="sm" bg={msg.role === 'user' ? 'blue.9' : 'dark.6'} c={msg.role === 'user' ? 'white' : undefined}>
                {msg.role === 'ai' ? (
                  <Box className="markdown-body" style={{ fontSize: '14px', lineHeight: 1.6 }}>
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                  </Box>
                ) : (
                  <Stack gap="xs">
                    {msg.image && (
                      <Image src={msg.image} alt="User upload" radius="md" mah={200} fit="contain" />
                    )}
                    {msg.text && <Text size="sm">{msg.text}</Text>}
                  </Stack>
                )}
              </Card>

              {msg.diff && (
                <Card mt="sm" shadow="sm" radius="md" p="sm" withBorder style={{ borderLeft: '4px solid var(--mantine-color-green-6)' }}>
                   <Stack gap="xs">
                     <Group justify="space-between">
                       <Group gap="xs">
                         <Badge color="green">{msg.diff.action}</Badge>
                         <Text size="xs" ff="monospace">{msg.diff.path}</Text>
                       </Group>
                     </Group>
                     {msg.diff.content && (
                       <ScrollArea type="scroll" style={{ maxHeight: '250px' }}>
                         <Code block style={{ whiteSpace: 'pre-wrap', backgroundColor: 'var(--mantine-color-dark-8)', fontSize: '12px' }} ff="monospace">
                           {msg.diff.content}
                         </Code>
                       </ScrollArea>
                     )}
                     <Button 
                      size="xs" 
                      color="green" 
                      variant="light" 
                      onClick={() => {
                          applyDiff(msg.diff!);
                          // Optional: mark as applied
                      }}>
                       Accept Changes
                     </Button>
                   </Stack>
                </Card>
              )}
            </Box>
          ))}
          
          {isLoading && (
            <Box style={{ alignSelf: 'flex-start', maxWidth: '90%' }}>
               <Card shadow="sm" radius="md" p="sm" bg="dark.6">
                 <Group gap="xs">
                   <Loader size="xs" type="dots" color="blue" />
                   <Text size="sm" c="dimmed">
                     {isExtendedThinking ? "AI is still thinking (this may take a minute)..." : "AI is thinking..."}
                   </Text>
                 </Group>
               </Card>
            </Box>
          )}
        </Stack>
      </ScrollArea>

      <Box pt="md" style={{ flexShrink: 0 }}>
        {selectedImage && (
          <Box mb="sm" style={{ position: 'relative', display: 'inline-block' }}>
            <Indicator label={<IconX size={12} />} color="red" size={20} style={{ cursor: 'pointer' }} onClick={() => setSelectedImage(null)}>
               <Image src={selectedImage} radius="md" mah={80} fit="contain" />
            </Indicator>
          </Box>
        )}
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }}>
          <TextInput
            placeholder="Ask AI to change architecture..."
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            radius="md"
            leftSection={
               <FileButton onChange={handleImageSelect} accept="image/png,image/jpeg,image/webp">
                 {(props) => (
                   <ActionIcon {...props} variant="subtle" color="gray" size="sm">
                     <IconPhoto size={16} />
                   </ActionIcon>
                 )}
               </FileButton>
            }
            rightSection={
              <ActionIcon loading={isLoading} onClick={handleSend} color="blue" variant="filled" size="sm" radius="xl">
                <IconSend size={14} />
              </ActionIcon>
            }
          />
        </form>
      </Box>
    </Box>
  );
}
