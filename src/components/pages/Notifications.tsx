import React, { useEffect } from 'react';
import { useNavigate } from "@/lib/router-compat";
import { ArrowLeft, Bell, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { useNotifications } from '@/hooks/useNotifications';
import { showBannerAd, hideBannerAd } from '@/services/admob';

const Notifications = () => {
  const navigate = useNavigate();
  const { notifications, isLoading, markAsSeen } = useNotifications();

  // Mark as seen when visiting the page
  useEffect(() => {
    markAsSeen();
  }, []);

  // Show banner ad when component mounts
  useEffect(() => {
    showBannerAd();
    return () => {
      hideBannerAd();
    };
  }, []);

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header with safe-area padding for Android 12+ */}
      <div 
        style={{ 
          backgroundColor: 'hsl(var(--primary))',
          paddingTop: 'calc(1rem + var(--effective-safe-area-top, 0px))',
          boxSizing: 'border-box' as const
        }} 
        className="text-white py-4 px-4"
      >
        <div className="flex items-center">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate(-1)} 
            className="text-white hover:bg-white/20 mr-4"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-medium">Notifications</h1>
        </div>
      </div>

      {/* Notifications List */}
      <div className="p-4 space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : notifications && notifications.length > 0 ? (
          notifications.map((notification) => (
            <div key={notification.id} className="bg-card rounded-lg p-4 border shadow-sm">
              <div className="flex items-start gap-3">
                <Bell className="w-5 h-5 text-primary mt-1" />
                <div className="flex-1">
                  <p className="font-medium">{notification.title}</p>
                  <p className="text-sm text-muted-foreground mt-1">{notification.message}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {format(new Date(notification.created_at), 'MMM dd, yyyy HH:mm')}
                  </p>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-12">
            <Bell className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground text-lg">Weli fariin kuma jirto</p>
            <p className="text-sm text-muted-foreground mt-2">
              Waxaad halkan ka arki doontaa fariimaha cusub
            </p>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
    </div>
  );
};

export default Notifications;
