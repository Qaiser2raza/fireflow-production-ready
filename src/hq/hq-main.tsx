import React from 'react';
import { createRoot } from 'react-dom/client';
import { HQApp } from './HQApp';
import '../client/index.css';

const root = createRoot(document.getElementById('root')!);
root.render(<HQApp />);
