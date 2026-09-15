import { useState } from 'react';
import { supabase, getTenantId } from '@/integrations/supabase/client';
import {
  Search, Loader2, Upload, DollarSign, Calendar, Phone, Hash, FileText, Clock,
  CheckCircle, XCircle, Package, Users, UserPlus, Smartphone, Ban, Globe, Pencil, Power, Trash2, Eye, RotateCcw,
  Plus, Image, Star, CreditCard, Settings, Code, ChevronDown, User, Send,
} from 'lucide-react';
import { toast } from 'sonner';
import CachedImage from '@/components/CachedImage';
import { activeWorkspaceId } from '@/lib/workspaceKeys';

// Re-export icons for child views
export {
  Search, Loader2, Upload, DollarSign, Calendar, Phone, Hash, FileText, Clock,
  CheckCircle, XCircle, Package, Users, UserPlus, Smartphone, Ban, Globe, Pencil, Power, Trash2, Eye, RotateCcw,
  Plus, Image, Star, CreditCard, Settings, Code, ChevronDown, User, Send,
};

// ========== HELPERS ==========
export const formatPhone = (phone: string) => {
  if (!phone) return '';
  let clean = phone.replace(/\D/g, '');
  // Lambarada qaar waxay horeba u leeyihiin 252 / +252 / 0 — ha laba-jibbaarin.
  if (clean.length > 9 && clean.startsWith('252')) clean = clean.slice(3);
  if (clean.length === 10 && clean.startsWith('0')) clean = clean.slice(1);
  if (clean.length === 9) return `${clean.slice(0, 2)}-${clean.slice(2, 5)}-${clean.slice(5)}`;
  if (clean.length === 10) return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
  return clean || phone;
};
export const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
export const formatTime = (dateStr: string) => new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
export const formatTimeAgo = (dateStr: string | null) => {
  if (!dateStr) return 'Never';
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return 'Hadda';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
};
export const normalizePhone = (phone: string) => {
  const clean = phone.replace(/\D/g, '');
  if (clean.startsWith('252') && clean.length >= 12) return clean.slice(3);
  if (clean.length === 10 && clean.startsWith('0')) return clean.slice(1);
  return clean;
};

// ========== LAZY FALLBACK ==========
export const LazyFallback = () => (
  <div className="flex justify-center items-center py-16">
    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
  </div>
);

// ========== STAT CARDS ROW ==========
export const StatCardsRow = ({ cards }: { cards: { label: string; value: string | number; icon: any; color: string }[] }) => (
  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
    {cards.map((s, i) => (
      <div key={i} className="min-w-[90px] bg-white dark:bg-gray-800 rounded-xl border p-2.5 text-center flex-shrink-0 shadow-sm">
        <div className={`w-7 h-7 ${s.color} rounded-full mx-auto flex items-center justify-center mb-1`}>
          <s.icon className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="text-base font-bold text-gray-900 dark:text-white">{s.value}</div>
        <div className="text-[9px] text-gray-500 leading-tight">{s.label}</div>
      </div>
    ))}
  </div>
);

// ========== FILTER ROW ==========
export const FilterRow = ({ filters, activeKey, onSelect, activeColor = 'bg-purple-600' }: {
  filters: { key: string; label: string; count: number }[];
  activeKey: string;
  onSelect: (key: string) => void;
  activeColor?: string;
}) => (
  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
    {filters.map(f => (
      <button key={f.key} onClick={() => onSelect(f.key)}
        className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-all ${activeKey === f.key ? `${activeColor} text-white shadow-md` : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border'}`}>
        {f.label} <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeKey === f.key ? 'bg-white/25' : 'bg-gray-100 dark:bg-gray-700'}`}>{f.count}</span>
      </button>
    ))}
  </div>
);

// ========== SEARCH INPUT ==========
export const SearchInput = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
  <div className="relative">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full pl-9 pr-3 py-2 rounded-lg bg-white dark:bg-gray-800 border text-sm outline-none" />
  </div>
);

// ========== INVOICE ROW ==========
export const InvoiceRow = ({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) => (
  <div className="flex items-center gap-2 py-1.5 border-b border-dashed border-purple-100 dark:border-purple-900/30 last:border-0">
    <Icon className={`w-3.5 h-3.5 ${color} shrink-0`} />
    <span className="text-[10px] text-gray-400 w-20 shrink-0">{label}</span>
    <span className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1 text-right">{value || '—'}</span>
  </div>
);

// ========== INVOICE ACCORDION CONTENT ==========
export const InvoiceAccordionContent = ({ rows, notes, id, actions, isSo }: {
  rows: { icon: any; label: string; value: string; color: string }[];
  notes?: string | null;
  id: string;
  actions?: React.ReactNode;
  isSo: boolean;
}) => (
  <div className="border-t border-purple-200/50 dark:border-purple-900/30 bg-gradient-to-b from-purple-50/80 to-white dark:from-purple-950/20 dark:to-gray-800 animate-in slide-in-from-top-1 duration-150">
    <div className="px-3 py-3">
      <div className="text-center mb-2.5">
        <div className="text-[10px] text-purple-500 uppercase tracking-wider font-semibold">{isSo ? 'Faahfaahin' : 'Details'}</div>
        <div className="w-12 h-0.5 bg-purple-300/50 mx-auto mt-1 rounded-full" />
      </div>
      <div className="space-y-1">
        {rows.filter(Boolean).map((row, ri) => (
          <InvoiceRow key={ri} {...row} />
        ))}
      </div>
      {notes && (
        <div className="mt-2.5 pt-2 border-t border-purple-100 dark:border-purple-900/30">
          <div className="text-[10px] text-purple-500 font-semibold mb-1">{isSo ? 'Jawaabta shirkadda' : 'Carrier response'}</div>
          <div className="text-[11px] leading-snug text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words bg-white/70 dark:bg-gray-900/30 rounded-lg px-2 py-1.5 border border-purple-100/60 dark:border-purple-900/30">{notes}</div>
        </div>
      )}
      {actions && <div className="flex items-center gap-2 mt-3 pt-2 border-t border-purple-100 dark:border-purple-900/30">{actions}</div>}
      <div className="text-[8px] text-gray-300 dark:text-gray-600 font-mono mt-2 text-center">ID: {id}</div>
    </div>
  </div>
);

// ========== ACTION BUTTON ==========
export const ActionBtn = ({ onClick, icon: Icon, label, variant = 'default' }: {
  onClick: () => void; icon: any; label: string;
  variant?: 'default' | 'danger' | 'success' | 'warning';
}) => {
  const colors = {
    default: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    danger: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    warning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  };
  return (
    <button onClick={onClick} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 ${colors[variant]}`}>
      <Icon className="w-3 h-3" /> {label}
    </button>
  );
};

// ========== EMPTY STATE ==========
export const EmptyState = ({ message }: { message: string }) => (
  <div className="text-center py-12"><span className="text-4xl">📭</span><p className="text-gray-400 text-sm mt-2">{message}</p></div>
);

// ========== IMAGE UPLOADER ==========
export const ImageUploader = ({ value, onChange, bucket, label }: { value: string; onChange: (url: string) => void; bucket: string; label: string }) => {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      // New uploads live in the workspace's own folder, so one workspace can
      // never overwrite or delete another's artwork. Existing flat files keep
      // working: their public URLs are untouched.
      const workspaceId = activeWorkspaceId();
      if (!workspaceId) throw new Error('Workspace not ready yet');
      const fileName = `${workspaceId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from(bucket).upload(fileName, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
      onChange(urlData.publicUrl);
      toast.success('Image uploaded!');
    } catch (err: any) {
      toast.error('Upload failed: ' + (err.message || 'Unknown error'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="text-[11px] text-gray-500 font-medium">{label}</div>
      <div className="flex items-center gap-2">
        {value && <CachedImage src={value} alt={label} kind="category" className="w-12 h-12 rounded-lg object-cover shrink-0 border" />}
        <label className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border-2 border-dashed cursor-pointer transition-all ${uploading ? 'border-gray-300 bg-gray-50' : 'border-purple-300 bg-purple-50/50 hover:bg-purple-100/50 dark:border-purple-700 dark:bg-purple-950/20'}`}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : <Upload className="w-4 h-4 text-purple-500" />}
          <span className="text-xs font-medium text-purple-600 dark:text-purple-400">{uploading ? 'Uploading...' : (value ? 'Change' : 'Upload from Gallery')}</span>
          <input type="file" accept="image/*" onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
      </div>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder="Or paste URL..." className="w-full px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-700 border text-[11px] outline-none text-gray-500" />
    </div>
  );
};

// ========== ORDER ACTIONS HOOK ==========
export const useOrderActions = (setOrders: React.Dispatch<React.SetStateAction<any[]>>, isSo: boolean) => {
  const cancelOrder = async (id: string) => {
    if (!confirm(isSo ? 'Ma hubtaa inaad kansashid dalabkan?' : 'Cancel this order?')) return;
    const { error } = await supabase.from('orders').update({ status: 'cancelled', delivery_status: 'cancelled' }).eq('id', id);
    if (error) { toast.error('Error'); return; }
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'cancelled', delivery_status: 'cancelled' } : o));
    toast.success(isSo ? 'Dalabka waa la kanselay' : 'Order cancelled');
  };

  const retryDelivery = async (id: string) => {
    const { error } = await supabase.from('orders').update({ delivery_status: 'pending', status: 'paid' }).eq('id', id);
    if (error) { toast.error('Error'); return; }
    setOrders(prev => prev.map(o => o.id === id ? { ...o, delivery_status: 'pending', status: 'paid' } : o));
    toast.success(isSo ? 'Dib loo qaaday' : 'Retrying delivery');
  };

  const markDelivered = async (id: string) => {
    const { error } = await supabase.from('orders').update({ delivery_status: 'delivered', delivered_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast.error('Error'); return; }
    setOrders(prev => prev.map(o => o.id === id ? { ...o, delivery_status: 'delivered', delivered_at: new Date().toISOString() } : o));
    toast.success(isSo ? 'Waa la dhameeyay' : 'Marked as delivered');
  };

  return { cancelOrder, retryDelivery, markDelivered };
};

// ========== PROVIDER FILTER ROW ==========
export const ProviderFilterRow = ({ providers, activeId, onSelect, activeColor = 'bg-purple-600', totalCount, allLabel = 'All', countFn }: {
  providers: any[];
  activeId: string;
  onSelect: (id: string) => void;
  activeColor?: string;
  totalCount: number;
  allLabel?: string;
  countFn: (provId: string) => number;
}) => (
  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
    <button onClick={() => onSelect('all')}
      className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-all ${activeId === 'all' ? `${activeColor} text-white shadow-md` : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border'}`}>
      {allLabel} <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeId === 'all' ? 'bg-white/25' : 'bg-gray-100 dark:bg-gray-700'}`}>{totalCount}</span>
    </button>
    {providers.map(prov => {
      const count = countFn(prov.id);
      if (count === 0) return null;
      return (
        <button key={prov.id} onClick={() => onSelect(prov.id)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-all ${activeId === prov.id ? `${activeColor} text-white shadow-md` : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border'}`}>
          <CachedImage src={prov.provider_logo} alt={prov.provider_name} bundledName={prov.provider_name} className="w-5 h-5 rounded-full object-cover" />
          {prov.provider_name} <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeId === prov.id ? 'bg-white/25' : 'bg-gray-100 dark:bg-gray-700'}`}>{count}</span>
        </button>
      );
    })}
  </div>
);
