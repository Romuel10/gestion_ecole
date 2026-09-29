import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type PendingConfirmation = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

const ConfirmContext = createContext<
  ((options: ConfirmOptions) => Promise<boolean>) | null
>(null);

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const pendingRef = useRef<PendingConfirmation | null>(null);

  const settle = useCallback((value: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(value);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    pendingRef.current?.resolve(false);

    return new Promise<boolean>((resolve) => {
      const request: PendingConfirmation = { ...options, resolve };
      pendingRef.current = request;
      setPending(request);
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        isOpen={Boolean(pending)}
        title={pending?.title || 'Confirmation'}
        message={pending?.message || ''}
        confirmLabel={pending?.confirmLabel}
        cancelLabel={pending?.cancelLabel}
        destructive={pending?.destructive}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error('useConfirm doit être utilisé dans ConfirmProvider.');
  }
  return confirm;
};
