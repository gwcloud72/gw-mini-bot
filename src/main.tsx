import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/app/App';
import { loadInitialChatSkinId } from '@/hooks/useChatSkin';
import '@/styles/index.css';

const motionPreferenceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

document.documentElement.dataset.skin = loadInitialChatSkinId();
document.documentElement.dataset.motionPreference = motionPreferenceQuery.matches
  ? 'reduced'
  : 'full';

motionPreferenceQuery.addEventListener('change', (motionPreferenceEvent) => {
  document.documentElement.dataset.motionPreference = motionPreferenceEvent.matches
    ? 'reduced'
    : 'full';
});

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('앱을 마운트할 #root 요소를 찾지 못했습니다.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
