import { useCallback, useState } from 'react';
import { CHATBOT_DISPLAY_NAME } from '@/constants/chat';
import { useChatSession } from '@/hooks/useChatSession';
import { useChatSkin } from '@/hooks/useChatSkin';
import { ChatComposer } from './ChatComposer';
import { ChatHeader } from './ChatHeader';
import { ChatMenu } from './ChatMenu';
import { ConnectionBanner } from './ConnectionBanner';
import { MessageList } from './MessageList';

export function ChatRoom() {
  const {
    chatMessages,
    draftText,
    isStreaming,
    connectionStatus,
    isDailyQuotaExhausted,
    setDraftText,
    sendChatMessage,
    retryAssistantMessage,
    stopAssistantResponse,
    resetConversation,
    refreshConnectionStatus,
  } = useChatSession();
  const {
    activeSkinId,
    isAutomaticSkin,
    setActiveSkinId,
    setAutomaticSkin,
  } = useChatSkin();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleOpenMenu = useCallback(() => {
    setIsMenuOpen(true);
  }, []);

  const handleCloseMenu = useCallback(() => {
    setIsMenuOpen(false);
  }, []);

  const handleRetryConnection = useCallback(() => {
    void refreshConnectionStatus();
  }, [refreshConnectionStatus]);

  const handleSendMessage = useCallback(() => {
    sendChatMessage();
  }, [sendChatMessage]);

  return (
    <main
      className="app-backdrop flex min-h-dvh items-center justify-center sm:p-4 lg:p-6"
      data-streaming={isStreaming}
    >
      <section
        className="chat-shell relative flex h-dvh w-full max-w-[920px] flex-col overflow-hidden sm:h-[min(920px,calc(100dvh-2rem))] sm:min-h-[640px] sm:rounded-[32px] lg:h-[min(940px,calc(100dvh-3rem))]"
        aria-label={`${CHATBOT_DISPLAY_NAME} 대화방`}
      >
        <ChatHeader
          connectionStatus={connectionStatus}
          onStartNewConversation={resetConversation}
          onOpenSettings={handleOpenMenu}
        />

        <ConnectionBanner
          connectionStatus={connectionStatus}
          onRetryConnection={handleRetryConnection}
        />

        <MessageList
          activeSkinId={activeSkinId}
          chatMessages={chatMessages}
          isStreaming={isStreaming}
          onQuickPromptSelect={sendChatMessage}
          onRetryMessage={retryAssistantMessage}
        />

        <ChatComposer
          draftText={draftText}
          isStreaming={isStreaming}
          isDailyQuotaExhausted={isDailyQuotaExhausted}
          onDraftTextChange={setDraftText}
          onSendMessage={handleSendMessage}
          onStopGeneration={stopAssistantResponse}
        />

        <ChatMenu
          isOpen={isMenuOpen}
          connectionStatus={connectionStatus}
          activeSkinId={activeSkinId}
          isAutomaticSkin={isAutomaticSkin}
          onAutomaticSkinSelect={setAutomaticSkin}
          onSkinSelect={setActiveSkinId}
          onCloseMenu={handleCloseMenu}
          onStartNewConversation={resetConversation}
          onRefreshConnection={refreshConnectionStatus}
        />
      </section>
    </main>
  );
}
