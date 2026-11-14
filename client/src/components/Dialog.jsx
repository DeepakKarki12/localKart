import { useEffect, useRef } from "react";
const activeDialogs = [];
let originalOverflow;
export function Dialog({ label, onClose, children }) {
  const ref = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    if (!activeDialogs.length) originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const element = ref.current;
    activeDialogs.push(element);
    element.focus();
    const keydown = (event) => {
      if (activeDialogs.at(-1) !== element) return;
      if (event.key === "Escape") close.current();
      if (event.key === "Tab") {
        const elements = [
          ...element.querySelectorAll(
            'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
          ),
        ];
        const first = elements[0],
          last = elements[elements.length - 1];
        if (!first) {
          event.preventDefault();
          return;
        }
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === element)
        ) {
          last.focus();
          event.preventDefault();
        } else if (!event.shiftKey && document.activeElement === last) {
          first.focus();
          event.preventDefault();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      const wasTop = activeDialogs.at(-1) === element;
      const index = activeDialogs.indexOf(element);
      if (index !== -1) activeDialogs.splice(index, 1);
      if (!activeDialogs.length)
        document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", keydown);
      if (wasTop && previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        ref={ref}
        tabIndex={-1}
        className="product-modal"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </section>
    </div>
  );
}
