import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { Download, Loader2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

type AppRow = {
  id: string;
  name: string;
  description: string | null;
  platform: string;
  version: string | null;
  file_url: string;
  icon_url: string | null;
  tenant_id: string | null;
  created_at: string;
};

const db = supabase as any;

export function AppsView({ isSo = true }: { isSo?: boolean }) {
  const { tenant } = useTenant();
  const [apps, setApps] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      let query = db
        .from('platform_apps')
        .select('*')
        .eq('is_active', true)
        .order('display_order');
      if (tenant?.id) query = query.or(`tenant_id.is.null,tenant_id.eq.${tenant.id}`);
      else query = query.is('tenant_id', null);
      const { data, error } = await query;
      if (!active) return;
      if (error) console.error('Apps load error:', error);
      setApps((data ?? []) as AppRow[]);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [tenant?.id]);

  const download = async (app: AppRow) => {
    try {
      setBusyId(app.id);
      let href = app.file_url;
      if (!/^https?:\/\//i.test(href)) {
        const path = href.replace(/^apks\//, '');
        const { data, error } = await supabase.storage.from('apks').createSignedUrl(path, 60 * 60);
        if (error) throw error;
        href = data.signedUrl;
      }
      window.open(href, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      toast.error(err?.message || (isSo ? 'Soo dejinta way fashilantay' : 'Download failed'));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (apps.length === 0) {
    return (
      <div className="text-center py-16 px-4 text-gray-500 dark:text-gray-400 text-sm">
        {isSo ? 'Wali app lagugu ma daabicin.' : 'No apps published yet.'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {apps.map((app) => (
        <div
          key={app.id}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 flex items-center gap-3"
        >
          {app.icon_url ? (
            <img src={app.icon_url} alt={app.name} className="h-12 w-12 rounded-xl object-cover bg-gray-100" />
          ) : (
            <div className="h-12 w-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
              <Smartphone className="h-6 w-6 text-blue-600" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900 dark:text-white truncate">{app.name}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {app.platform?.toUpperCase()}
              {app.version ? ` · v${app.version}` : ''}
              {app.created_at ? ` · ${new Date(app.created_at).toLocaleDateString()}` : ''}
            </div>
            {app.description && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{app.description}</div>
            )}
          </div>
          <button
            onClick={() => download(app)}
            disabled={busyId === app.id}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium active:scale-95 transition disabled:opacity-60"
          >
            {busyId === app.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {isSo ? 'Soo deji' : 'Download'}
          </button>
        </div>
      ))}
    </div>
  );
}

export default AppsView;
