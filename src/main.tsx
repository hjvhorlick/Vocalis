import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { VoiceRatingsProvider } from './components/VoiceRatingsProvider';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <VoiceRatingsProvider>
      <App />
    </VoiceRatingsProvider>
  </React.StrictMode>
);
