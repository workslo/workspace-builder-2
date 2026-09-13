import { useState, useMemo } from 'react';
import { Modal, Tabs, Button, Group, Stack, Text, Badge, Title, Tooltip } from '@mantine/core';
import { IconPackageExport, IconTerminal, IconSparkles, IconCopy, IconCheck, IconSend } from '@tabler/icons-react';
import CodeMirror from '@uiw/react-codemirror';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { RepoDiff, generateShellScript, generateAgentPrompt } from '../utils/diffUtils';
import { useRepoStore } from '../store/useRepoStore';

interface BundleChangesModalProps {
  opened: boolean;
  onClose: () => void;
  diff: RepoDiff;
}

export function BundleChangesModal({ opened, onClose, diff }: BundleChangesModalProps) {
  const setPendingChatPrompt = useRepoStore((state) => state.setPendingChatPrompt);
  const [activeTab, setActiveTab] = useState<string | null>('shell');
  const [copiedShell, setCopiedShell] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const shellScript = useMemo(() => generateShellScript(diff), [diff]);
  const agentPrompt = useMemo(() => generateAgentPrompt(diff), [diff]);

  const movesCount = useMemo(() => diff.changes.filter((c) => c.type === 'move').length, [diff]);
  const addsCount = useMemo(() => diff.changes.filter((c) => c.type === 'add').length, [diff]);
  const deletesCount = useMemo(() => diff.changes.filter((c) => c.type === 'delete').length, [diff]);

  const handleCopyShell = async () => {
    try {
      await navigator.clipboard.writeText(shellScript);
      setCopiedShell(true);
      setTimeout(() => setCopiedShell(false), 2000);
    } catch (err) {
      console.error('Failed to copy shell script:', err);
    }
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(agentPrompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch (err) {
      console.error('Failed to copy agent prompt:', err);
    }
  };

  const handleSendToCopilot = () => {
    setPendingChatPrompt(agentPrompt);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <IconPackageExport size={20} color="var(--mantine-color-teal-5)" />
          <Title order={4}>Bundle Changes Exporter</Title>
          <Badge color="teal" size="sm" variant="light">
            {diff.totalCount} {diff.totalCount === 1 ? 'change' : 'changes'}
          </Badge>
        </Group>
      }
      size="xl"
      radius="md"
      centered
    >
      <Stack gap="md">
        {/* Breakdown badges */}
        <Group gap="xs">
          {movesCount > 0 && (
            <Badge size="xs" color="blue" variant="dot">
              {movesCount} {movesCount === 1 ? 'move' : 'moves'}
            </Badge>
          )}
          {addsCount > 0 && (
            <Badge size="xs" color="green" variant="dot">
              {addsCount} {addsCount === 1 ? 'addition' : 'additions'}
            </Badge>
          )}
          {deletesCount > 0 && (
            <Badge size="xs" color="red" variant="dot">
              {deletesCount} {deletesCount === 1 ? 'deletion' : 'deletions'}
            </Badge>
          )}
        </Group>

        <Tabs value={activeTab} onChange={setActiveTab} variant="outline" radius="sm">
          <Tabs.List mb="md">
            <Tabs.Tab value="shell" leftSection={<IconTerminal size={15} />}>
              Shell Script
            </Tabs.Tab>
            <Tabs.Tab value="prompt" leftSection={<IconSparkles size={15} />}>
              Agent Prompt
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="shell">
            <Stack gap="sm">
              <Text size="xs" c="dimmed">
                Runnable bash script applying all path moves (<code>git mv</code>), directories (<code>mkdir -p</code>), and removals (<code>rm</code>).
              </Text>

              <CodeMirror
                value={shellScript}
                readOnly
                height="320px"
                theme={vscodeDark}
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: false,
                  highlightActiveLine: false,
                }}
                style={{
                  fontSize: '12px',
                  fontFamily: 'JetBrains Mono, Menlo, monospace',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  border: '1px solid var(--mantine-color-dark-4)',
                }}
              />

              <Group justify="flex-end">
                <Button
                  variant="light"
                  size="xs"
                  color={copiedShell ? 'teal' : 'blue'}
                  leftSection={copiedShell ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  onClick={handleCopyShell}
                >
                  {copiedShell ? 'Copied Shell Script!' : 'Copy Script'}
                </Button>
              </Group>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="prompt">
            <Stack gap="sm">
              <Text size="xs" c="dimmed">
                Structured prompt detailing all relocated, added, and removed paths with refactoring instructions for updating imports.
              </Text>

              <CodeMirror
                value={agentPrompt}
                readOnly
                height="320px"
                theme={vscodeDark}
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: false,
                  highlightActiveLine: false,
                }}
                style={{
                  fontSize: '12px',
                  fontFamily: 'JetBrains Mono, Menlo, monospace',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  border: '1px solid var(--mantine-color-dark-4)',
                }}
              />

              <Group justify="space-between">
                <Button
                  variant="subtle"
                  size="xs"
                  color={copiedPrompt ? 'teal' : 'gray'}
                  leftSection={copiedPrompt ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  onClick={handleCopyPrompt}
                >
                  {copiedPrompt ? 'Copied Prompt!' : 'Copy Prompt'}
                </Button>

                <Tooltip label="Pre-fills this prompt into the AI Co-pilot chat input" withArrow>
                  <Button
                    variant="filled"
                    size="xs"
                    color="blue"
                    leftSection={<IconSend size={14} />}
                    onClick={handleSendToCopilot}
                  >
                    Send to Co-pilot
                  </Button>
                </Tooltip>
              </Group>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Modal>
  );
}
