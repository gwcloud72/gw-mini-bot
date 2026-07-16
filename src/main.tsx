import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/app/App';
import { loadInitialChatSkinId } from '@/hooks/useChatSkin';
import {
  isReducedMotionPreferred,
  subscribeToMotionPreference,
} from '@/lib/browserMotion';
import '@/styles/index.css';

function applyMotionPreference(isReducedMotion: boolean): void {
  document.documentElement.dataset.motionPreference = isReducedMotion
    ? 'reduced'
    : 'full';
}

document.documentElement.dataset.skin = loadInitialChatSkinId();
applyMotionPreference(isReducedMotionPreferred());
subscribeToMotionPreference(applyMotionPreference);

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('앱을 마운트할 #root 요소를 찾지 못했습니다.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
