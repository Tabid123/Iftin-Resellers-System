import React from 'react';
import { Loader2 } from 'lucide-react';

interface PaymentLoadingOverlayProps {
  isLoading: boolean;
}

export const PaymentLoadingOverlay: React.FC<PaymentLoadingOverlayProps> = ({ isLoading }) => {
  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-background/45 backdrop-blur-md" />

      <div className="relative z-10 flex flex-col items-center gap-4 rounded-2xl border border-border bg-card/95 px-8 py-6 shadow-2xl">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
        <p className="text-sm font-semibold text-foreground">Fadlan sug...</p>
      </div>
    </div>
  );
};