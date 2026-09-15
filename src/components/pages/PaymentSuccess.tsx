import React, { useEffect } from 'react';
import { useNavigate, useLocation } from "@/lib/router-compat";
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import confetti from 'canvas-confetti';
import { logScreenView, logPurchase } from '@/services/firebase';
import { activeWorkspaceId, workspaceQueryKey } from '@/lib/workspaceKeys';
const PaymentSuccess = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [orderDetails, setOrderDetails] = React.useState<any>(null);
  const {
    package: packageData,
    paymentMethod,
    receiverNumber,
    isOffline,
    ussdCode,
    paymentNumber
  } = location.state || {};
  useEffect(() => {
    // Log screen view and purchase
    logScreenView('PaymentSuccess');
    if (packageData) {
      logPurchase(
        packageData.name || packageData.package_name || 'Unknown',
        packageData.price ? parseFloat(packageData.price.replace('$', '')) : 0,
        paymentMethod || 'Unknown'
      );
    }

    // 🎉 Fire confetti celebration!
    const fireConfetti = () => {
      // First burst from left
      confetti({
        particleCount: 100,
        spread: 70,
        origin: {
          x: 0.1,
          y: 0.6
        },
        colors: ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6']
      });

      // Second burst from right
      confetti({
        particleCount: 100,
        spread: 70,
        origin: {
          x: 0.9,
          y: 0.6
        },
        colors: ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6']
      });

      // Center burst after small delay
      setTimeout(() => {
        confetti({
          particleCount: 150,
          spread: 100,
          origin: {
            x: 0.5,
            y: 0.5
          },
          colors: ['#22c55e', '#10b981', '#34d399', '#6ee7b7']
        });
      }, 200);
    };

    // Fire confetti for all successful payments
    fireConfetti();

    // Invalidate featured packages query to refresh the data
    const ws = activeWorkspaceId();
    if (ws) {
      queryClient.invalidateQueries({
        queryKey: workspaceQueryKey(ws, 'featuredPackages')
      });
    }

    // Get the last order from history
    const history = JSON.parse(localStorage.getItem('orderHistory') || '[]');
    if (history.length > 0) {
      setOrderDetails(history[0]);
    }
  }, [queryClient, isOffline]);
  return <div className="min-h-screen bg-gradient-to-b from-primary/5 via-background to-background flex flex-col items-center justify-center p-4">
      <div className="text-center space-y-8 max-w-md animate-bounce-in w-full">
        <div className="space-y-6 animate-slide-up">
          <div className="relative mx-auto w-28 h-28">
            <div className="absolute inset-0 rounded-full bg-accent/20 animate-ping" />
            <div className="relative w-full h-full rounded-full bg-accent/10 flex items-center justify-center border-2 border-accent/30">
              <CheckCircle className="w-16 h-16 text-accent animate-bounce" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground animate-fade-in">
              Hambalyo! 🎉
            </h1>
            <p className="text-muted-foreground">
              Dalabkaaga waala diray. Mahadsanid oo ku soo noqo!
            </p>
          </div>
        </div>

        <Button onClick={() => navigate('/providers')} className="w-full bg-primary text-primary-foreground font-semibold py-6 rounded-xl hover:opacity-90 transition-opacity animate-slide-up text-lg">
          Sii Wad →
        </Button>
      </div>
    </div>;
};
export default PaymentSuccess;