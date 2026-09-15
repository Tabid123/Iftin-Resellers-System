import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Save } from 'lucide-react';
import { toast } from 'sonner';

interface AppSetting {
  id: string;
  setting_key: string;
  setting_value: boolean | null;
  text_value: string | null;
  description: string;
}

const TextInputSetting = ({ 
  setting, 
  onSave 
}: { 
  setting: AppSetting; 
  onSave: (value: string) => void;
}) => {
  const [value, setValue] = useState(setting.text_value || '');
  const [hasChanges, setHasChanges] = useState(false);

  const handleChange = (newValue: string) => {
    setValue(newValue);
    setHasChanges(newValue !== setting.text_value);
  };

  const handleSave = () => {
    onSave(value);
    setHasChanges(false);
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        className="w-[200px]"
        placeholder="Gali lambarka..."
      />
      <Button
        size="sm"
        onClick={handleSave}
        disabled={!hasChanges}
      >
        <Save className="w-4 h-4 mr-1" />
        Kaydi
      </Button>
    </div>
  );
};

const AppSettings = () => {
  const queryClient = useQueryClient();

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ['appSettings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .order('setting_key');
      
      if (error) throw error;
      return data as AppSetting[];
    },
  });

  const updateBooleanSetting = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase
        .from('app_settings')
        .update({ setting_value: value })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appSettings'] });
      queryClient.invalidateQueries({ queryKey: ['showFeaturedPackages'] });
      toast.success('Settings updated successfully');
    },
    onError: (error) => {
      toast.error('Failed to update settings');
      console.error('Error updating setting:', error);
    },
  });

  const updateTextSetting = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: string }) => {
      const { error } = await supabase
        .from('app_settings')
        .update({ text_value: value })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appSettings'] });
      queryClient.invalidateQueries({ queryKey: ['popularPackagesSource'] });
      toast.success('Settings updated successfully');
    },
    onError: (error) => {
      toast.error('Failed to update settings');
      console.error('Error updating setting:', error);
    },
  });

  const getSettingLabel = (key: string) => {
    const labels: Record<string, string> = {
      show_featured_packages: 'Muuji Xirmooyinka La Doortay',
      popular_packages_source: 'Xirmooyinka ugu Caansan - Xigasho',
      payment_number: 'Lambarka Lacagta',
      payment_prefix: 'Prefix-ka USSD Code-ka',
      device_alert_whatsapp_number: 'Lambarka WhatsApp - Device Alerts',
      device_alert_whatsapp_enabled: 'WhatsApp Notifications - Device Offline',
      device_alert_phone: 'Lambarka SMS - Device Alerts (Background)',
    };
    return labels[key] || key;
  };

  const getSourceLabel = (value: string) => {
    const labels: Record<string, string> = {
      featured: 'Manual Selection (Admin uu doorto)',
      most_purchased: 'Automatic (Kuwa ugu badan ee la iibsado)',
    };
    return labels[value] || value;
  };

  if (isLoading) {
    return <div className="p-4">Loading settings...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">App Settings</h2>
        <p className="text-muted-foreground">Maaree sida app-ka u muuqdo</p>
      </div>

      <div className="space-y-4">
        {settings.map((setting) => {
          const isTextSetting = setting.text_value !== null;
          const isSelectSetting = setting.setting_key === 'popular_packages_source';
          const isInputSetting = isTextSetting && !isSelectSetting;
          
          return (
            <Card key={setting.id} className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1 flex-1">
                  <Label htmlFor={setting.setting_key} className="text-base font-medium">
                    {getSettingLabel(setting.setting_key)}
                  </Label>
                  {setting.description && (
                    <p className="text-sm text-muted-foreground">{setting.description}</p>
                  )}
                </div>
                
                {isSelectSetting ? (
                  <Select
                    value={setting.text_value || 'featured'}
                    onValueChange={(value) => {
                      updateTextSetting.mutate({ id: setting.id, value });
                    }}
                  >
                    <SelectTrigger className="w-[280px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="featured">
                        {getSourceLabel('featured')}
                      </SelectItem>
                      <SelectItem value="most_purchased">
                        {getSourceLabel('most_purchased')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                ) : isInputSetting ? (
                  <TextInputSetting 
                    setting={setting}
                    onSave={(value) => updateTextSetting.mutate({ id: setting.id, value })}
                  />
                ) : (
                  <Switch
                    id={setting.setting_key}
                    checked={setting.setting_value ?? false}
                    onCheckedChange={(checked) => {
                      updateBooleanSetting.mutate({ id: setting.id, value: checked });
                    }}
                  />
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default AppSettings;
