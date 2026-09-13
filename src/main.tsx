import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import '@mantine/core/styles.css';
import './index.css';

import { MantineProvider, createTheme } from '@mantine/core';

import App from './App.tsx';

const theme = createTheme({
  fontFamily: 'Inter, system-ui, sans-serif',
  fontFamilyMonospace: 'JetBrains Mono, Monaco, Consolas, monospace',
  headings: {
    fontFamily: 'Inter, system-ui, sans-serif',
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="dark" forceColorScheme="dark" theme={theme}>
      <App />
    </MantineProvider>
  </StrictMode>,
);
