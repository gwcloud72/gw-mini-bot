import { RefreshCw, RotateCcw, ShieldCheck, Wifi, X } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { CHATBOT_DISPLAY_NAME } from '@/constants/chat';
import {
  cancelVisualFrame,
  isReducedMotionPreferred,
  requestVisualFrame,
} from '@/lib/browserMotion';
import type { ChatConnectionState } from '@/types/chat';
import type { ChatSkinId } from '@/types/skin';
import { SkinPicker } from './SkinPicker';

interface ChatMenuProps {
  isOpen: boolean;
  connectionStatus: ChatConnectionState;
  activeSkinId: ChatSkinId;
  isAutomaticSkin: boolean;
  onAutomaticSkinSelect: () => void;
  onSkinSelect: (skinId: ChatSkinId) => void;
  onCloseMenu: () => void;
  onStartNewConversation: () => void;
  onRefreshConnection: () => void;
}

const MENU_EXIT_DURATION_MS = 180;

const CONNECTION_STATUS_LABELS: Record<ChatConnectionState, string> = {
  checking: '확인 중',
  online: '정상 연결',
  offline: '연결 안 됨',
  unconfigured: '설정 필요',
};

export const ChatMenu = memo(function ChatMenu({
  isOpen,
  connectionStatus,
  activeSkinId,
  isAutomaticSkin,
  onAutomaticSkinSelect,
  onSkinSelect,
  onCloseMenu,
  onStartNewConversation,
  onRefreshConnection,
}: ChatMenuProps) {
  const firstMenuActionRef = useRef<HTMLButtonElement>(null);
  const [isMenuMounted, setIsMenuMounted] = useState(isOpen);
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const isCheckingConnection = connectionStatus === 'checking';

  useEffect(() => {
    let visibilityFrameId: number | undefined;
    let unmountTimeoutId: number | undefined;

    const mountFrameId = requestVisualFrame(() => {
      if (isOpen) {
        setIsMenuMounted(true);
        visibilityFrameId = requestVisualFrame(() => {
          setIsMenuVisible(true);
        });
        return;
      }

      setIsMenuVisible(false);
      const exitDurationMs = isReducedMotionPreferred() ? 0 : MENU_EXIT_DURATION_MS;
      unmountTimeoutId = window.setTimeout(() => {
        setIsMenuMounted(false);
      }, exitDurationMs);
    });

    return () => {
      cancelVisualFrame(mountFrameId);
      if (visibilityFrameId !== undefined) {
        cancelVisualFrame(visibilityFrameId);
      }
      if (unmountTimeoutId !== undefined) {
        window.clearTimeout(unmountTimeoutId);
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isMenuMounted) {
      return undefined;
    }

    const focusFrameId = requestVisualFrame(() => {
      firstMenuActionRef.current?.focus();
    });

    const handleMenuKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === 'Escape') {
        onCloseMenu();
      }
    };

    window.addEventListener('keydown', handleMenuKeyDown);
    return () => {
      cancelVisualFrame(focusFrameId);
      window.removeEventListener('keydown', handleMenuKeyDown);
    };
  }, [isMenuMounted, isOpen, onCloseMenu]);

  if (!isMenuMounted) {
    return null;
  }

  const handleMenuLayerMouseDown = () => {
    onCloseMenu();
  };

  const handleMenuPanelMouseDown = (panelMouseEvent: React.MouseEvent<HTMLDivElement>) => {
    panelMouseEvent.stopPropagation();
  };

  const handleNewConversationClick = () => {
    onStartNewConversation();
    onCloseMenu();
  };

  return (
    <div
      className={`menu-layer absolute inset-0 z-50 ${isMenuVisible ? 'is-visible' : 'is-hidden'}`}
      role="presentation"
      aria-hidden={!isMenuVisible}
      onMouseDown={handleMenuLayerMouseDown}
    >
      <div className="menu-scrim absolute inset-0" />
      <div
        className="menu-panel absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-hidden rounded-t-[28px] sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-[70px] sm:w-[370px] sm:rounded-[26px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-menu-title"
        onMouseDown={handleMenuPanelMouseDown}
      >
        <div className="menu-handle mx-auto mt-2.5 h-1 w-10 rounded-full sm:hidden" aria-hidden="true" />

        <div className="menu-heading flex items-start gap-3 px-4 pb-4 pt-3 sm:px-5 sm:pt-5">
          <div className="min-w-0 flex-1">
            <p id="chat-menu-title" className="menu-title">
              {CHATBOT_DISPLAY_NAME} 설정
            </p>
            <p className="menu-description mt-1">분위기와 연결 상태를 관리해요.</p>
          </div>
          <button
            type="button"
            onClick={onCloseMenu}
            className="menu-close-button -mr-1 -mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full"
            aria-label="메뉴 닫기"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[calc(88dvh-120px)] overflow-y-auto px-3 pb-3 sm:max-h-[min(690px,calc(100dvh-110px))] sm:px-3.5">
          <SkinPicker
            selectedSkinId={activeSkinId}
            isAutomaticSkin={isAutomaticSkin}
            onAutomaticSkinSelect={onAutomaticSkinSelect}
            onSkinSelect={onSkinSelect}
          />

          <div className="menu-divider my-3" />

          <div className="menu-action-list grid gap-1.5">
            <button
              ref={firstMenuActionRef}
              type="button"
              onClick={handleNewConversationClick}
              className="menu-action"
            >
              <span className="menu-action-icon">
                <RotateCcw className="size-[17px]" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="menu-action-title block">새 대화 시작</strong>
                <span className="menu-action-description mt-0.5 block">
                  현재 대화 내용을 비웁니다.
                </span>
              </span>
            </button>

            <button type="button" onClick={onRefreshConnection} className="menu-action">
              <span className="menu-action-icon">
                <RefreshCw
                  className={`size-[17px] ${isCheckingConnection ? 'is-spinning' : ''}`}
                  aria-hidden="true"
                />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="menu-action-title block">연결 다시 확인</strong>
                <span className="menu-action-description mt-0.5 block">
                  현재 상태: {CONNECTION_STATUS_LABELS[connectionStatus]}
                </span>
              </span>
            </button>
          </div>

          <div className="connection-card mt-3 flex items-center gap-3 px-3.5 py-3">
            <span className="connection-card-icon">
              <Wifi className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="connection-card-label">대화 연결</p>
              <p className="connection-card-value mt-0.5">
                {CONNECTION_STATUS_LABELS[connectionStatus]}
              </p>
            </div>
            <span
              className={`status-dot ${connectionStatus === 'online' ? 'is-online' : ''} ${
                isCheckingConnection ? 'is-checking' : ''
              }`}
              aria-hidden="true"
            />
          </div>
        </div>

        <div className="menu-footer menu-footer-copy flex items-center gap-2 px-4 py-3.5 sm:px-5">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          최근 대화는 이 브라우저에만 저장돼요.
        </div>
      </div>
    </div>
  );
});
