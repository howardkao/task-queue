import type { ReactNode, RefObject } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SideDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Optional ref to the scrollable body (overflow-y-auto) for scroll anchoring. */
  scrollBodyRef?: RefObject<HTMLDivElement | null>;
}

export function SideDrawer({ open, onClose, title, children, scrollBodyRef }: SideDrawerProps) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-pointer bg-foreground/10 animate-in fade-in duration-200"
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div
        className={cn(
          "fixed top-0 right-0 bottom-0 w-[min(90vw,380px)]",
          "bg-card border-l border-border shadow-xl",
          "z-50 flex flex-col overflow-hidden",
          "animate-in slide-in-from-right duration-300"
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2
            id="drawer-title"
            className="text-[13px] font-semibold text-foreground tracking-wide uppercase"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "flex cursor-pointer items-center justify-center w-7 h-7 rounded-md",
              "text-muted-foreground hover:text-foreground hover:bg-secondary",
              "transition-all duration-150",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
            aria-label="Close drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div ref={scrollBodyRef} className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </>
  );
}
