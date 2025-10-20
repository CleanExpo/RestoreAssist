import { useState } from 'react';

export interface Toast {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = ({ title, description, variant = 'default' }: Toast) => {
    const newToast = { title, description, variant };
    setToasts((prev) => [...prev, newToast]);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t !== newToast));
    }, 5000);

    // Show browser alert for now (can be replaced with proper toast component later)
    if (variant === 'destructive') {
      alert(`Error: ${title}\n${description || ''}`);
    } else {
      console.log(`Toast: ${title}`, description);
    }
  };

  return { toast, toasts };
}
