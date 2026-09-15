import React, { useEffect, useState } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

interface PaymentErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRetry: () => void;
  errorType: 'insufficient_balance' | 'user_cancelled' | 'timeout' | 'wrong_pin' | 'general';
  errorMessage?: string;
}

interface ErrorMessage {
  error_code: string;
  error_type: string;
  title: string;
  message: string;
  icon_type: 'emoji' | 'image';
  icon_value: string;
  is_animated: boolean;
}

export const PaymentErrorModal: React.FC<PaymentErrorModalProps> = ({
  isOpen,
  onClose,
  onRetry,
  errorType,
  errorMessage
}) => {
  const { data: errorMessages } = useQuery({
    queryKey: ['errorMessages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('error_messages')
        .select('*');
      
      if (error) throw error;
      return data as ErrorMessage[];
    },
    staleTime: 5 * 60 * 1000,
  });

  if (!isOpen) return null;

  // Find the matching error message from database
  const dbErrorContent = errorMessages?.find(msg => msg.error_type === errorType);

  // Fallback content if database fetch fails
  const getFallbackContent = () => {
    switch (errorType) {
      case 'insufficient_balance':
        return {
          title: 'Haraaga kuma filna',
          message: 'Macaamiil Haraagaa kuguma filna fadlan lacag ku shubo si aad xirmada u iibsatid',
          icon: '💰',
          iconType: 'emoji' as const,
          isAnimated: true
        };
      case 'user_cancelled':
        return {
          title: 'Waad diidday dalabka',
          message: 'Waad diidday dalabka lacag bixinta. Haddii aad rabtid iibsi, fadlan riix "Isku Day Mar Kale".',
          icon: '❌',
          iconType: 'emoji' as const,
          isAnimated: true
        };
      case 'timeout':
        return {
          title: 'Waqtigu wuu dhamaaday',
          message: 'Waqtigu wuu dhamaaday. Fadlan isku day mar kale si aad xirmada u iibsatid.',
          icon: '⏱️',
          iconType: 'emoji' as const,
          isAnimated: true
        };
      case 'wrong_pin':
        return {
          title: 'PIN-ka waa khalad',
          message: 'PIN-ka aad gashay waa khalad. Fadlan hubi PIN-kaaga oo isku day mar kale.',
          icon: '🔐',
          iconType: 'emoji' as const,
          isAnimated: true
        };
      default:
        return {
          title: 'Khalad ayaa dhacay',
          message: errorMessage || 'Lacag bixinta way fashilantay. Fadlan isku day mar kale.',
          icon: '⚠️',
          iconType: 'emoji' as const,
          isAnimated: true
        };
    }
  };

  const fallbackContent = getFallbackContent();
  const content = dbErrorContent ? {
    title: dbErrorContent.title,
    message: dbErrorContent.message,
    icon: dbErrorContent.icon_value,
    iconType: dbErrorContent.icon_type,
    isAnimated: dbErrorContent.is_animated
  } : fallbackContent;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-background rounded-3xl shadow-2xl animate-scale-in overflow-hidden">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-muted hover:bg-muted/80 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>

        {/* Content */}
        <div className="flex flex-col items-center text-center p-8 pt-12">
          {/* Error icon/emoji */}
          {content.iconType === 'image' ? (
            <div className={`mb-6 ${content.isAnimated ? 'animate-bounce' : ''}`}>
              <img 
                src={content.icon} 
                alt="Error Icon"
                className="w-32 h-32 object-contain"
              />
            </div>
          ) : (
            <div className={`text-6xl mb-6 ${content.isAnimated ? 'animate-pulse' : ''}`}>
              {content.icon}
            </div>
          )}

          {/* Error title */}
          <h2 className="text-2xl font-bold text-foreground mb-3">
            {content.title}
          </h2>

          {/* Error message */}
          <p className="text-muted-foreground text-base leading-relaxed mb-8 max-w-sm">
            {content.message}
          </p>

          {/* Action buttons */}
          <div className="w-full space-y-3">
            <Button
              onClick={onRetry}
              className="w-full h-14 text-lg font-semibold rounded-2xl bg-primary hover:bg-primary/90 transition-all hover:scale-105"
            >
              <RefreshCw className="w-5 h-5 mr-2" />
              Isku Day Mar Kale
            </Button>
            
            <Button
              onClick={onClose}
              variant="outline"
              className="w-full h-12 text-base rounded-2xl"
            >
              Xiray
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
