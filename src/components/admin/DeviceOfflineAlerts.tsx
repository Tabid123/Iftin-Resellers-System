import React from 'react';
import { AlertTriangle, Check, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDeviceOfflineAlerts } from '@/hooks/useDeviceOfflineAlerts';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatDistanceToNow } from 'date-fns';

export const DeviceOfflineAlerts: React.FC = () => {
  const { language } = useLanguage();
  const { alerts, loading, acknowledgeAlert } = useDeviceOfflineAlerts();

  if (loading || alerts.length === 0) {
    return null;
  }

  return (
    <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-destructive">
            {language === 'so' 
              ? `${alerts.length} Phone${alerts.length > 1 ? '-ood' : ''} oo offline ah 5+ daqiiqo!`
              : `${alerts.length} Device${alerts.length > 1 ? 's' : ''} offline for 5+ minutes!`
            }
          </h3>
          
          <div className="mt-3 space-y-2">
            {alerts.map((alert) => (
              <div 
                key={alert.id}
                className="flex items-center justify-between gap-4 bg-background/50 rounded-md p-3"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium truncate">{alert.device_name}</span>
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    ({language === 'so' ? 'offline ' : 'offline '}
                    {formatDistanceToNow(new Date(alert.created_at), { addSuffix: false })})
                  </span>
                </div>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => acknowledgeAlert(alert.id, alert.device_id)}
                  className="flex-shrink-0"
                >
                  <Check className="h-4 w-4 mr-1" />
                  {language === 'so' ? 'Aqbal' : 'Acknowledge'}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
