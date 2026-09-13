/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useState } from 'react';
import { Box, Splitter, Button, Group, Text } from '@mantine/core';
import { IconBrandGoogleDrive } from '@tabler/icons-react';
import { RepoViewer } from './components/RepoViewer';
import { FilePreview } from './components/FilePreview';
import { CopilotChat } from './components/CopilotChat';
import { initAuth, googleSignIn, logout } from './lib/auth';
import { useRepoStore } from './store/useRepoStore';

export default function App() {
  const user = useRepoStore((state) => state.user);
  const setAuth = useRepoStore((state) => state.setAuth);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setAuth(user, token);
        setNeedsAuth(false);
      },
      () => {
        setAuth(null, null);
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, [setAuth]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setAuth(result.user, result.accessToken);
        setNeedsAuth(false);
      }
    } catch (err: any) {
      console.error('Login failed:', err);
      if (err?.code === 'auth/popup-closed-by-user' || err?.message?.includes('auth/popup-closed-by-user') || err?.message?.includes('auth/popup-blocked')) {
        setLoginError('Sign-in popup was closed or blocked. Please ensure popups are allowed or try opening the app in a new tab.');
      } else {
        setLoginError('Failed to sign in. Please try again.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setAuth(null, null);
  };

  return (
    <Box h="100vh" w="100vw" bg="dark.8" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Top Banner for Auth */}
      <Box p="xs" bg="dark.7" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)', flexShrink: 0 }}>
        <Group justify="flex-end" align="center">
           {user ? (
             <Group gap="sm">
               <Text size="sm" c="dimmed">Signed in as {user.email}</Text>
               <Button size="compact-xs" variant="subtle" onClick={handleLogout}>Log out</Button>
             </Group>
           ) : (
             <Group gap="sm">
               {loginError && <Text size="xs" c="red">{loginError}</Text>}
               <Button
                 size="compact-sm"
                 variant="default"
                 loading={isLoggingIn}
                 onClick={handleLogin}
                 leftSection={<IconBrandGoogleDrive size={16} color="#34A853" />}
               >
                 Sign in with Google Drive
               </Button>
             </Group>
           )}
        </Group>
      </Box>

      <Splitter orientation="horizontal" style={{ flex: 1, minHeight: 0, height: '100%', overflow: 'hidden' }}>
        {/* Left Pane: Tree View */}
        <Splitter.Pane defaultSize={20} style={{ minHeight: 0, height: '100%', overflow: 'hidden' }}>
          <Box h="100%" bg="dark.8" style={{ borderRight: '1px solid var(--mantine-color-dark-4)', minHeight: 0, height: '100%', overflow: 'hidden' }}>
            <RepoViewer />
          </Box>
        </Splitter.Pane>

        {/* Center Pane: File Preview */}
        <Splitter.Pane defaultSize={50} style={{ minHeight: 0, height: '100%', overflow: 'hidden' }}>
          <Box h="100%" style={{ minHeight: 0, height: '100%', overflow: 'hidden' }}>
            <FilePreview />
          </Box>
        </Splitter.Pane>

        {/* Right Pane: Copilot */}
        <Splitter.Pane defaultSize={30} style={{ minHeight: 0, height: '100%', overflow: 'hidden' }}>
          <Box h="100%" style={{ borderLeft: '1px solid var(--mantine-color-dark-4)', minHeight: 0, height: '100%', overflow: 'hidden' }}>
            <CopilotChat />
          </Box>
        </Splitter.Pane>
      </Splitter>
    </Box>
  );
}
