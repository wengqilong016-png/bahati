import { useEffect, useRef } from 'react';

/**
 * Hook for modal keyboard support:
 * - Escape key closes the modal
 * - Focus is trapped inside the modal overlay
 * - Focus is restored to the previously focused element on close
 */
export function useModalKeyboard(isOpen: boolean, onClose: () => void) {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Save currently focused element to restore later
    previousFocusRef.current = document.activeElement as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }

      // Focus trap: Tab/Shift+Tab cycle within the modal
      if (e.key === 'Tab' && overlayRef.current) {
        const focusable = overlayRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Auto-focus first focusable element inside modal
    requestAnimationFrame(() => {
      if (!overlayRef.current) return;
      const firstFocusable = overlayRef.current.querySelector<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
      );
      firstFocusable?.focus();
    });

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus to the element that was focused before modal opened
      previousFocusRef.current?.focus();
    };
  }, [isOpen, onClose]);

  return overlayRef;
}
