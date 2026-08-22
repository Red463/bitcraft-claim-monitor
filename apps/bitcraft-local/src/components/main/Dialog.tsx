import React from "react";
import { createPortal } from "react-dom";

type DialogProps = {
  open: boolean;
  title: string;
  description?: string;
  modal?: boolean;
  closeOnBackdrop?: boolean;
  dismissible?: boolean;
  titleElementId?: string;
  onClose: () => void;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  className?: string;
  backdropClassName?: string;
  dataTour?: string;
  autoFocus?: boolean;
  style?: React.CSSProperties;
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

let modalLockCount = 0;
let originalBodyOverflow = "";
const dialogStack: HTMLElement[] = [];

function lockBodyScroll() {
  if (modalLockCount === 0) {
    originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  modalLockCount += 1;
}

function unlockBodyScroll() {
  modalLockCount = Math.max(0, modalLockCount - 1);
  if (modalLockCount === 0) document.body.style.overflow = originalBodyOverflow;
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    const style = window.getComputedStyle(element);
    return !element.hasAttribute("hidden") && style.display !== "none" && style.visibility !== "hidden";
  });
}

function focusFirst(container: HTMLElement, preferred?: HTMLElement | null) {
  const target = preferred && container.contains(preferred) ? preferred : focusableElements(container)[0] ?? container;
  target.focus();
}

export function Dialog({
  open,
  title,
  description,
  modal = true,
  closeOnBackdrop = true,
  dismissible = true,
  titleElementId,
  onClose,
  initialFocusRef,
  children,
  className = "",
  backdropClassName = "",
  dataTour,
  autoFocus = true,
  style,
}: DialogProps) {
  const titleId = React.useId();
  const descriptionId = React.useId();
  const surfaceRef = React.useRef<HTMLElement | null>(null);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!open) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    const activeSurface: HTMLElement = surface;

    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogStack.push(activeSurface);
    if (modal) lockBodyScroll();

    const focusFrame = window.requestAnimationFrame(() => {
      if (autoFocus) focusFirst(activeSurface, initialFocusRef?.current);
    });
    function isTopDialog() {
      return dialogStack[dialogStack.length - 1] === activeSurface;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (!isTopDialog()) return;
      if (event.key === "Escape" && dismissible) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (!modal || event.key !== "Tab") return;
      const focusable = focusableElements(activeSurface);
      if (!focusable.length) {
        event.preventDefault();
        activeSurface.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !activeSurface.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !activeSurface.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }
    function handleFocusIn(event: FocusEvent) {
      if (modal && isTopDialog() && event.target instanceof Node && !activeSurface.contains(event.target)) {
        focusFirst(activeSurface, initialFocusRef?.current);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
      const stackIndex = dialogStack.lastIndexOf(activeSurface);
      if (stackIndex >= 0) dialogStack.splice(stackIndex, 1);
      if (modal) unlockBodyScroll();
      triggerRef.current?.focus();
    };
  }, [autoFocus, dismissible, initialFocusRef, modal, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`dialog-backdrop ${modal ? "is-modal" : "is-non-modal"} ${backdropClassName}`.trim()}
      role="presentation"
      onMouseDown={(event) => {
        if (closeOnBackdrop && dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={surfaceRef}
        className={`dialog-surface ${className}`.trim()}
        role="dialog"
        aria-modal={modal ? "true" : undefined}
        aria-labelledby={titleElementId ?? titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        data-tour={dataTour}
        style={style}
      >
        {!titleElementId ? <span className="dialog-sr-only" id={titleId}>{title}</span> : null}
        {description ? <span className="dialog-sr-only" id={descriptionId}>{description}</span> : null}
        {children}
      </section>
    </div>,
    document.body,
  );
}
