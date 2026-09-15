import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, endOfDay } from 'date-fns';
import { toast } from 'sonner';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import {
  StatCardsRow, FilterRow, SearchInput, LazyFallback, EmptyState, useOrderActions,
  formatPhone, formatTime,
  Package, DollarSign, CheckCircle, XCircle, Clock, ChevronDown, Plus, Trash2, Phone, Pencil,
} from './shared';
import { Link2 } from 'lucide-react';
import { validateUssdTemplate } from '@/lib/ussdValidator';

// ========== ADD NUMBER FORM ==========
const AddNumberForm = ({ isSo, onAdded }: { isSo: boolean; onAdded: () => void }) => {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    const clean = phone.replace(/\D/g, '');
    if (clean.length < 9) { toast.error(isSo ? 'Lambar qalad ah' : 'Invalid phone'); return; }
    setSaving(true);
    const { error } = await supabase.from('auto_topup_numbers').insert({ phone_number: clean, label: label || null });
    if (error) { toast.error(error.message); } else { toast.success(isSo ? 'Lambar la daray' : 'Number added'); setPhone(''); setLabel(''); setOpen(false); onAdded(); }
    setSaving(false);
  };

  if (!open) return (
    <button onClick={() => setOpen(true)} className="w-full py-2 rounded-lg border-2 border-dashed border-purple-300 dark:border-purple-700 text-purple-600 dark:text-purple-400 text-sm font-semibold flex items-center justify-center gap-1.5 active:bg-purple-50 dark:active:bg-purple-950/30">
      <Plus className="w-4 h-4" /> {isSo ? 'Ku Dar Lambar' : 'Add Number'}
    </button>
  );

  return (
    <div className="bg-purple-50 dark:bg-purple-950/30 rounded-xl p-3 space-y-2 border border-purple-200 dark:border-purple-800">
      <input type="tel" inputMode="numeric" pattern="[0-9]*" value={phone} onChange={e => setPhone(e.target.value)} placeholder={isSo ? 'Lambar (tusaale: 615123456)' : 'Phone (e.g. 615123456)'} className="w-full px-3 py-2 rounded-lg border text-sm bg-white dark:bg-gray-800 dark:border-gray-700 outline-none focus:ring-2 focus:ring-purple-400" />
      <input value={label} onChange={e => setLabel(e.target.value)} placeholder={isSo ? 'Magac (ikhtiyaari)' : 'Label (optional)'} className="w-full px-3 py-2 rounded-lg border text-sm bg-white dark:bg-gray-800 dark:border-gray-700 outline-none focus:ring-2 focus:ring-purple-400" />
      <div className="flex gap-2">
        <button onClick={handleAdd} disabled={saving} className="flex-1 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold disabled:opacity-50">{saving ? '...' : isSo ? 'Kaydi' : 'Save'}</button>
        <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-sm font-medium">{isSo ? 'Kansal' : 'Cancel'}</button>
      </div>
    </div>
  );
};

// ========== ADD PACKAGE FORM (MULTI-PRICE) ==========
const AddPackageForm = ({ isSo, numberId, onAdded }: { isSo: boolean; numberId: string; onAdded: () => void }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [prices, setPrices] = useState('');
  const [data, setData] = useState('');
  const [provider, setProvider] = useState('hormuud');
  const [ussd, setUssd] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [simPassword, setSimPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!name || !prices.trim()) { toast.error(isSo ? 'Magaca iyo qiimayaasha waa lagama maarmaan' : 'Name and prices required'); return; }
    const priceList = prices.split(',').map(p => parseFloat(p.trim())).filter(p => !isNaN(p) && p > 0);
    if (priceList.length === 0) { toast.error(isSo ? 'Qiime sax ah gali' : 'Enter valid prices'); return; }
    const ussdCheck = validateUssdTemplate(ussd);
    if (!ussdCheck.valid) { toast.error(ussdCheck.error); return; }
    setSaving(true);
    const parsedCost = parseFloat(costPrice) || 0;
    const rows = priceList.map(p => ({
      topup_number_id: numberId, package_name: name, selling_price: p,
      data_amount: data || '', provider_name: provider, ussd_code: ussd || null,
      cost_price: parsedCost, sim_password: simPassword.trim() || null,
    }));
    const { error } = await supabase.from('auto_topup_packages').insert(rows as any);
    if (error) { toast.error(error.message); } else {
      toast.success(isSo ? `${priceList.length} package la daray` : `${priceList.length} packages added`);
      setName(''); setPrices(''); setData(''); setUssd(''); setCostPrice(''); setSimPassword(''); setOpen(false); onAdded();
    }
    setSaving(false);
  };

  if (!open) return (
    <button onClick={() => setOpen(true)} className="w-full py-1.5 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 text-xs font-medium flex items-center justify-center gap-1 active:bg-gray-50 dark:active:bg-gray-800">
      <Plus className="w-3 h-3" /> {isSo ? 'Ku Dar Package' : 'Add Package'}
    </button>
  );

  return (
    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-2.5 space-y-1.5 border border-gray-200 dark:border-gray-700">
      <select value={provider} onChange={e => setProvider(e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg border text-xs bg-white dark:bg-gray-800 dark:border-gray-700 outline-none">
        <option value="hormuud">Hormuud</option>
        <option value="somtel">Somtel</option>
        <option value="somnet">Somnet</option>
        <option value="amtel">Amtel</option>
        <option value="somlink">Somlink</option>
      </select>
      <input value={name} onChange={e => setName(e.target.value)} placeholder={isSo ? 'Magaca xirmada (tusaale: 24 Saac)' : 'Package name (e.g. 24 Hours)'} className="w-full px-2.5 py-1.5 rounded-lg border text-xs bg-white dark:bg-gray-800 dark:border-gray-700 outline-none" />
      <input value={data} onChange={e => setData(e.target.value)} placeholder={isSo ? 'Data (tusaale: 2GB)' : 'Data (e.g. 2GB)'} className="w-full px-2.5 py-1.5 rounded-lg border text-xs bg-white dark:bg-gray-800 dark:border-gray-700 outline-none" />
      <input value={ussd} onChange={e => setUssd(e.target.value)} placeholder={isSo ? 'USSD Code (ikhtiyaari)' : 'USSD Code (optional)'} className="w-full px-2.5 py-1.5 rounded-lg border text-xs bg-white dark:bg-gray-800 dark:border-gray-700 outline-none" />
      <input type="number" inputMode="decimal" step="0.01" value={costPrice} onChange={e => setCostPrice(e.target.value)} placeholder={isSo ? 'Cost Price $ (tusaale: 0.50)' : 'Cost Price $ (e.g. 0.50)'} className="w-full px-2.5 py-1.5 rounded-lg border text-xs bg-white dark:bg-gray-800 dark:border-gray-700 outline-none font-mono" />
      <input type="tel" inputMode="numeric" pattern="[0-9]*" value={simPassword} onChange={e => setSimPassword(e.target.value)} placeholder={isSo ? 'SIM Password (tusaale: 5516)' : 'SIM Password (e.g. 5516)'} className="w-full px-2.5 py-1.5 rounded-lg border text-xs bg-white dark:bg-gray-800 dark:border-gray-700 outline-none font-mono" />
      <input value={prices} onChange={e => setPrices(e.target.value)} placeholder={isSo ? 'Qiimayaasha (tusaale: 0.72, 0.73, 0.74, 0.75)' : 'Prices (e.g. 0.72, 0.73, 0.74, 0.75)'} className="w-full px-2.5 py-1.5 rounded-lg border text-xs bg-white dark:bg-gray-800 dark:border-gray-700 outline-none font-mono" />
      <div className="text-[9px] text-gray-400">{isSo ? 'Qiime kasta wuxuu noqdaa package gaar ah' : 'Each price becomes a separate package entry'}</div>
      <div className="flex gap-1.5">
        <button onClick={handleAdd} disabled={saving} className="flex-1 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold disabled:opacity-50">{saving ? '...' : isSo ? 'Kaydi' : 'Save'}</button>
        <button onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-xs font-medium">{isSo ? 'Kansal' : 'Cancel'}</button>
      </div>
    </div>
  );
};

// ========== NUMBER CARD WITH PACKAGES ==========
const NumberCard = ({ num, isSo, onRefresh }: { num: any; isSo: boolean; onRefresh: () => void }) => {
  const [expanded, setExpanded] = useState(false);
  const [packages, setPackages] = useState<any[]>([]);
  const [pkgLoading, setPkgLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editPhone, setEditPhone] = useState(num.phone_number);
  const [editLabel, setEditLabel] = useState(num.label || '');
  const [editSaving, setEditSaving] = useState(false);
  const [editingPkg, setEditingPkg] = useState<string | null>(null);
  const [editPkgData, setEditPkgData] = useState<any>({});

  const loadPackages = useCallback(async () => {
    setPkgLoading(true);
    const { data } = await supabase.from('auto_topup_packages').select('*').eq('topup_number_id', num.id).order('created_at', { ascending: false });
    setPackages(data || []);
    setPkgLoading(false);
  }, [num.id]);

  useEffect(() => { if (expanded) loadPackages(); }, [expanded, loadPackages]);

  const toggleActive = async () => {
    await supabase.from('auto_topup_numbers').update({ is_active: !num.is_active }).eq('id', num.id);
    onRefresh();
    toast.success(isSo ? 'Waa la cusboonaysiiyay' : 'Updated');
  };

  const deleteNumber = async () => {
    if (!confirm(isSo ? 'Ma hubtaa inaad tirtirto lambarkan?' : 'Delete this number?')) return;
    await supabase.from('auto_topup_numbers').delete().eq('id', num.id);
    onRefresh();
    toast.success(isSo ? 'Waa la tirtiray' : 'Deleted');
  };

  const saveEdit = async () => {
    const clean = editPhone.replace(/\D/g, '');
    if (clean.length < 9) { toast.error(isSo ? 'Lambar qalad ah' : 'Invalid phone'); return; }
    setEditSaving(true);
    const { error } = await supabase.from('auto_topup_numbers').update({ phone_number: clean, label: editLabel || null }).eq('id', num.id);
    if (error) { toast.error(error.message); } else { toast.success(isSo ? 'Waa la cusboonaysiiyay' : 'Updated'); setEditing(false); onRefresh(); }
    setEditSaving(false);
  };

  const togglePkg = async (pkg: any) => {
    await supabase.from('auto_topup_packages').update({ is_active: !pkg.is_active }).eq('id', pkg.id);
    loadPackages();
  };

  const deletePkg = async (pkgId: string) => {
    await supabase.from('auto_topup_packages').delete().eq('id', pkgId);
    loadPackages();
    toast.success(isSo ? 'Package la tirtiray' : 'Package deleted');
  };

  const startEditPkg = (pkg: any) => {
    setEditingPkg(pkg.id);
    setEditPkgData({
      package_name: pkg.package_name,
      selling_price: String(pkg.selling_price),
      cost_price: String(pkg.cost_price || 0),
      data_amount: pkg.data_amount || '',
      ussd_code: pkg.ussd_code || '',
      provider_name: pkg.provider_name,
      sim_password: pkg.sim_password || '',
    });
  };

  const saveEditPkg = async () => {
    if (!editingPkg) return;
    const ussdCheck = validateUssdTemplate(editPkgData.ussd_code || '');
    if (!ussdCheck.valid) { toast.error(ussdCheck.error); return; }
    const { error } = await supabase.from('auto_topup_packages').update({
      package_name: editPkgData.package_name,
      selling_price: parseFloat(editPkgData.selling_price) || 0,
      cost_price: parseFloat(editPkgData.cost_price) || 0,
      data_amount: editPkgData.data_amount,
      ussd_code: editPkgData.ussd_code || null,
      provider_name: editPkgData.provider_name,
      sim_password: editPkgData.sim_password?.trim() || null,
    } as any).eq('id', editingPkg);
    if (error) { toast.error(error.message); } else {
      toast.success(isSo ? 'Package waa la cusboonaysiiyay' : 'Package updated');
      setEditingPkg(null);
      loadPackages();
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-purple-100/50 dark:border-purple-900/20 overflow-hidden">
      <div className="px-3 py-2.5 flex items-center justify-between">
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
          <Phone className="w-4 h-4 text-purple-500 shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold text-sm">{formatPhone(num.phone_number)}</div>
            <div className="text-[10px] text-gray-400">{num.label || '—'}</div>
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={(e) => { e.stopPropagation(); setEditing(!editing); setEditPhone(num.phone_number); setEditLabel(num.label || ''); }} className="w-6 h-6 rounded-full bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
            <Pencil className="w-3 h-3 text-blue-500" />
          </button>
          <button onClick={toggleActive} className={`text-[9px] font-bold px-2 py-1 rounded-full ${num.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {num.is_active ? 'Active' : 'Off'}
          </button>
          <button onClick={deleteNumber} className="w-6 h-6 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
            <Trash2 className="w-3 h-3 text-red-500" />
          </button>
        </div>
      </div>

      {editing && (
        <div className="px-3 pb-2 space-y-1.5 border-t border-gray-100 dark:border-gray-700 pt-2">
          <input type="tel" inputMode="numeric" pattern="[0-9]*" value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder={isSo ? 'Lambar' : 'Phone'} className="w-full px-3 py-2 rounded-lg border text-sm bg-white dark:bg-gray-900 dark:border-gray-700 outline-none focus:ring-2 focus:ring-blue-400" />
          <input value={editLabel} onChange={e => setEditLabel(e.target.value)} placeholder={isSo ? 'Magac (ikhtiyaari)' : 'Label (optional)'} className="w-full px-3 py-2 rounded-lg border text-sm bg-white dark:bg-gray-900 dark:border-gray-700 outline-none focus:ring-2 focus:ring-blue-400" />
          <div className="flex gap-2">
            <button onClick={saveEdit} disabled={editSaving} className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">{editSaving ? '...' : isSo ? 'Kaydi' : 'Save'}</button>
            <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-sm font-medium">{isSo ? 'Kansal' : 'Cancel'}</button>
          </div>
        </div>
      )}

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-gray-100 dark:border-gray-700 pt-2">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{isSo ? 'Packages' : 'Packages'} ({packages.length})</div>
          {pkgLoading ? <div className="text-xs text-gray-400 text-center py-2">Loading...</div> : (
            <>
              {(() => {
                const groups: Record<string, any[]> = {};
                packages.forEach(pkg => {
                  const key = `${pkg.package_name}||${pkg.provider_name}`;
                  if (!groups[key]) groups[key] = [];
                  groups[key].push(pkg);
                });
                return Object.entries(groups).map(([key, pkgs]) => {
                  const first = pkgs[0];
                  return (
                    <div key={key} className="bg-gray-50 dark:bg-gray-900 rounded-lg px-2.5 py-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-xs text-gray-800 dark:text-white">{first.package_name} <span className="text-gray-400">({first.provider_name})</span></div>
                          <div className="text-[10px] text-gray-400">{first.data_amount || '—'} {first.ussd_code ? `· ${first.ussd_code}` : ''}</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {pkgs.map(pkg => (
                          <div key={pkg.id} className="flex items-center gap-0.5 bg-white dark:bg-gray-800 border rounded-full px-2 py-0.5">
                            <span className="text-[10px] font-bold text-gray-700 dark:text-gray-200">${Number(pkg.selling_price).toFixed(2)}</span>
                            {pkg.cost_price > 0 && <span className="text-[8px] text-gray-400">(c:${Number(pkg.cost_price).toFixed(2)})</span>}
                            <button onClick={() => startEditPkg(pkg)} className="text-blue-400 hover:text-blue-600">
                              <Pencil className="w-2.5 h-2.5" />
                            </button>
                            <button onClick={() => togglePkg(pkg)} className={`text-[7px] font-bold px-1 rounded-full ${pkg.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {pkg.is_active ? '✓' : '✕'}
                            </button>
                            <button onClick={() => deletePkg(pkg.id)} className="text-red-400 hover:text-red-600">
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                      {/* Edit package inline form */}
                      {pkgs.some(p => p.id === editingPkg) && (
                        <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-2 space-y-1.5 border border-blue-200 dark:border-blue-800 mt-1">
                          <div className="text-[10px] font-bold text-blue-600">{isSo ? 'Package Beddel' : 'Edit Package'}</div>
                          <input value={editPkgData.package_name || ''} onChange={e => setEditPkgData({...editPkgData, package_name: e.target.value})} placeholder={isSo ? 'Magaca' : 'Name'} className="w-full px-2.5 py-1.5 rounded-lg border text-xs bg-white dark:bg-gray-800 dark:border-gray-700 outline-none" />
                          <div className="grid grid-cols-2 gap-1.5">
                            <input type="number" inputMode="decimal" step="0.01" value={editPkgData.selling_price || ''} onChange={e => setEditPkgData({...editPkgData, selling_price: e.target.value})} placeholder="Selling $" className="px-2.5 py-1.5 rounded-lg border text-xs bg-white dark:bg-gray-800 dark:border-gray-700 outline-none font-mono" />
                            <input type="number" inputMode="decimal" step="0.01" value={editPkgData.cost_price || ''} onChange={e => setEditPkgData({...editPkgData, cost_price: e.target.value})} placeholder="Cost $" className="px-2.5 py-1.5 rounded-lg border text-xs bg-white dark:bg-gray-800 dark:border-gray-700 outline-none font-mono" />
                          </div>
                          <input value={editPkgData.data_amount || ''} onChange={e => setEditPkgData({...editPkgData, data_amount: e.target.value})} placeholder="Data (e.g. 2GB)" className="w-full px-2.5 py-1.5 rounded-lg border text-xs bg-white dark:bg-gray-800 dark:border-gray-700 outline-none" />
                          <input value={editPkgData.ussd_code || ''} onChange={e => setEditPkgData({...editPkgData, ussd_code: e.target.value})} placeholder="USSD Code" className="w-full px-2.5 py-1.5 rounded-lg border text-xs bg-white dark:bg-gray-800 dark:border-gray-700 outline-none" />
                          <select value={editPkgData.provider_name || 'hormuud'} onChange={e => setEditPkgData({...editPkgData, provider_name: e.target.value})} className="w-full px-2.5 py-1.5 rounded-lg border text-xs bg-white dark:bg-gray-800 dark:border-gray-700 outline-none">
                            <option value="hormuud">Hormuud</option><option value="somtel">Somtel</option><option value="somnet">Somnet</option><option value="amtel">Amtel</option><option value="somlink">Somlink</option>
                          </select>
                          <input type="tel" inputMode="numeric" pattern="[0-9]*" value={editPkgData.sim_password || ''} onChange={e => setEditPkgData({...editPkgData, sim_password: e.target.value.replace(/\D/g, '')})} placeholder={isSo ? 'SIM Password (tusaale: 5516)' : 'SIM Password (e.g. 5516)'} className="w-full px-2.5 py-1.5 rounded-lg border text-xs bg-white dark:bg-gray-800 dark:border-gray-700 outline-none font-mono" />
                          <div className="flex gap-1.5">
                            <button onClick={saveEditPkg} className="flex-1 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold">{isSo ? 'Kaydi' : 'Save'}</button>
                            <button onClick={() => setEditingPkg(null)} className="px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-xs font-medium">{isSo ? 'Kansal' : 'Cancel'}</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
              <AddPackageForm isSo={isSo} numberId={num.id} onAdded={loadPackages} />
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ========== DELIVERY RULES SECTION (COLLAPSIBLE) ==========
const DeliveryRulesSection = ({ isSo }: { isSo: boolean }) => {
  const [expanded, setExpanded] = useState(false);
  const [allPkgs, setAllPkgs] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [sourceId, setSourceId] = useState('');
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [count, setCount] = useState('1');
  const [delay, setDelay] = useState('0');

  const load = useCallback(async () => {
    const [pkgRes, rulesRes] = await Promise.all([
      supabase.from('auto_topup_packages').select('*').eq('is_active', true).order('package_name'),
      supabase.from('auto_topup_delivery_rules' as any).select('*').order('execution_order'),
    ]);
    setAllPkgs(pkgRes.data || []);
    setRules((rulesRes.data as any[]) || []);
  }, []);

  useEffect(() => { if (expanded) load(); }, [expanded, load]);

  const getPkgLabel = (id: string) => {
    const p = allPkgs.find((x: any) => x.id === id);
    return p ? `${p.package_name} ($${Number(p.selling_price).toFixed(2)})` : '...';
  };

  const toggleTarget = (id: string) => {
    setSelectedTargets(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  };

  const addRules = async () => {
    if (!sourceId || selectedTargets.length === 0) return;
    setAdding(true);
    const rows = selectedTargets.map((tid, i) => ({
      source_package_id: sourceId,
      target_package_id: tid,
      delivery_count: parseInt(count) || 1,
      delay_minutes: parseInt(delay) || 0,
      execution_order: i + 1,
    }));
    const { error } = await supabase.from('auto_topup_delivery_rules' as any).insert(rows as any);
    if (error) toast.error(error.message);
    else {
      toast.success(isSo ? `${selectedTargets.length} rule la daray` : `${selectedTargets.length} rules added`);
      setSourceId(''); setSelectedTargets([]); setCount('1'); setDelay('0');
      load();
    }
    setAdding(false);
  };

  const toggleRule = async (id: string, active: boolean) => {
    await supabase.from('auto_topup_delivery_rules' as any).update({ is_active: !active } as any).eq('id', id);
    load();
  };

  const deleteRule = async (id: string) => {
    await supabase.from('auto_topup_delivery_rules' as any).delete().eq('id', id);
    load();
  };

  const groupedRules: Record<string, any[]> = {};
  rules.forEach((r: any) => {
    if (!groupedRules[r.source_package_id]) groupedRules[r.source_package_id] = [];
    groupedRules[r.source_package_id].push(r);
  });

  return (
    <div className="space-y-2">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
        <span className="text-gray-500 text-xs font-medium flex items-center gap-1">
          <Link2 className="w-3 h-3" /> {isSo ? 'Xirmooyin Isku Xiran' : 'Delivery Rules'}
          <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </span>
        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
      </button>

      {expanded && (
        <>
          {Object.keys(groupedRules).length > 0 && (
            <div className="space-y-2">
              {Object.entries(groupedRules).map(([srcId, srcRules]) => (
                <div key={srcId} className="bg-white dark:bg-gray-800 rounded-lg border px-3 py-2 text-xs space-y-1.5">
                  <div className="text-[10px] text-gray-400 font-medium">{isSo ? 'Asal' : 'Source'}: <span className="text-gray-700 dark:text-gray-200 font-semibold">{getPkgLabel(srcId)}</span></div>
                  <div className="space-y-1 pl-2 border-l-2 border-blue-200 dark:border-blue-800">
                    {srcRules.map((r: any) => (
                      <div key={r.id} className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <span className="text-gray-700 dark:text-gray-200 font-medium">{getPkgLabel(r.target_package_id)}</span>
                          <span className="text-[9px] text-gray-400 ml-1">{r.delivery_count}x · {r.delay_minutes}{isSo ? 'daq.' : 'min'}</span>
                        </div>
                        <div className="flex gap-1 items-center shrink-0">
                          <button onClick={() => toggleRule(r.id, r.is_active)} className={`text-[8px] font-bold px-2 py-0.5 rounded-full ${r.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {r.is_active ? 'ON' : 'OFF'}
                          </button>
                          <button onClick={() => deleteRule(r.id)} className="w-5 h-5 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                            <Trash2 className="w-2.5 h-2.5 text-red-500" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!open ? (
            <button onClick={() => setOpen(true)} className="w-full py-2 rounded-lg border-2 border-dashed border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 text-xs font-semibold flex items-center justify-center gap-1 active:bg-blue-50 dark:active:bg-blue-950/30">
              <Plus className="w-3.5 h-3.5" /> {isSo ? 'Ku Dar Rule' : 'Add Rule'}
            </button>
          ) : allPkgs.length < 2 ? (
            <div className="text-center text-xs text-gray-400 py-2">
              {isSo ? 'Ugu yaraan 2 package ayaad u baahan tahay' : 'Need at least 2 packages'}
              <button onClick={() => setOpen(false)} className="ml-2 text-blue-500 underline">{isSo ? 'Xir' : 'Close'}</button>
            </div>
          ) : (
            <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-3 space-y-2 border border-blue-200 dark:border-blue-800">
              <div className="text-[10px] font-bold text-blue-600">{isSo ? 'Rule Cusub' : 'New Rule'}</div>
              <div>
                <label className="text-[9px] text-gray-500 font-medium">{isSo ? 'Xirmada La Iibsaday' : 'Source Package'}</label>
                <select value={sourceId} onChange={e => setSourceId(e.target.value)} className="w-full px-2.5 py-2 rounded-lg border text-xs bg-white dark:bg-gray-800 dark:border-gray-700 outline-none">
                  <option value="">{isSo ? '-- Dooro --' : '-- Select --'}</option>
                  {allPkgs.map((p: any) => <option key={p.id} value={p.id}>{p.package_name} {p.data_amount ? `[${p.data_amount}]` : ''} (${Number(p.selling_price).toFixed(2)}) - {p.provider_name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] text-gray-500 font-medium">{isSo ? 'Xirmooyin La Geynayo (dooro badan)' : 'Target Packages (select multiple)'}</label>
                <div className="max-h-40 overflow-y-auto space-y-1 mt-1 bg-white dark:bg-gray-800 rounded-lg border p-2">
                  {allPkgs.map((p: any) => {
                    const selected = selectedTargets.includes(p.id);
                    return (
                      <button key={p.id} onClick={() => toggleTarget(p.id)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-2 transition-colors ${selected ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold' : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
                        <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0 ${selected ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 dark:border-gray-600'}`}>{selected ? '✓' : ''}</span>
                        <span className="truncate">{p.package_name} {p.data_amount ? `[${p.data_amount}]` : ''} (${Number(p.selling_price).toFixed(2)}) - {p.provider_name}</span>
                      </button>
                    );
                  })}
                </div>
                {selectedTargets.length > 0 && <div className="text-[9px] text-blue-600 mt-1 font-medium">{selectedTargets.length} {isSo ? 'la doortay' : 'selected'}</div>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] text-gray-500">{isSo ? 'Inta jeer' : 'Count'}</label>
                  <input type="number" inputMode="decimal" value={count} onChange={e => setCount(e.target.value)} min="1" className="w-full px-2.5 py-1.5 rounded-lg border text-xs bg-white dark:bg-gray-800 dark:border-gray-700 outline-none" />
                </div>
                <div>
                  <label className="text-[9px] text-gray-500">{isSo ? 'Sugitaan (daq.)' : 'Delay (min)'}</label>
                  <input type="number" inputMode="decimal" value={delay} onChange={e => setDelay(e.target.value)} min="0" className="w-full px-2.5 py-1.5 rounded-lg border text-xs bg-white dark:bg-gray-800 dark:border-gray-700 outline-none" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={addRules} disabled={adding || !sourceId || selectedTargets.length === 0} className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">
                  {adding ? '...' : isSo ? `Ku Dar ${selectedTargets.length} Rule` : `Add ${selectedTargets.length} Rule${selectedTargets.length !== 1 ? 's' : ''}`}
                </button>
                <button onClick={() => { setOpen(false); setSelectedTargets([]); }} className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-xs font-medium">{isSo ? 'Kansal' : 'Cancel'}</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ========== PHONE-PACKAGE MAPPING SECTION (Multi-Package Select) ==========
const PhoneMappingSection = ({ isSo }: { isSo: boolean }) => {
  const [expanded, setExpanded] = useState(false);
  const [mappings, setMappings] = useState<any[]>([]);
  const [allPkgs, setAllPkgs] = useState<any[]>([]);
  const [allNums, setAllNums] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [selectedPkgIds, setSelectedPkgIds] = useState<string[]>([]);
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [numId, setNumId] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCustomAmt, setEditCustomAmt] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    const [mRes, pRes, nRes] = await Promise.all([
      supabase.from('auto_topup_phone_mappings' as any).select('*').order('created_at', { ascending: false }),
      supabase.from('auto_topup_packages').select('*').eq('is_active', true).order('package_name'),
      supabase.from('auto_topup_numbers').select('*').eq('is_active', true).order('created_at'),
    ]);
    setMappings((mRes.data as any[]) || []);
    setAllPkgs(pRes.data || []);
    setAllNums(nRes.data || []);
  }, []);

  useEffect(() => { if (expanded) load(); }, [expanded, load]);

  const filteredPkgs = allPkgs.filter((p: any) => !numId || p.topup_number_id === numId);

  const togglePkgSelection = (id: string) => {
    setSelectedPkgIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleAdd = async () => {
    const clean = phone.replace(/\D/g, '');
    if (clean.length < 9) { toast.error(isSo ? 'Lambar qalad ah' : 'Invalid phone'); return; }
    if (!numId) { toast.error(isSo ? 'Lambarka auto-top-up dooro' : 'Select auto-top-up number'); return; }
    if (selectedPkgIds.length === 0) { toast.error(isSo ? 'Ugu yaraan 1 package dooro' : 'Select at least 1 package'); return; }
    
    // Filter out packages that already have a mapping for this phone
    const existingKeys = new Set(mappings.map((m: any) => `${m.phone_number}_${m.package_id}_${m.topup_number_id}`));
    const newPkgIds = selectedPkgIds.filter(pid => !existingKeys.has(`${clean}_${pid}_${numId}`));
    
    if (newPkgIds.length === 0) {
      toast.error(isSo ? 'Dhammaan packages-kan horay ayaa loo mapping-gareeray lambarkan' : 'All selected packages already mapped for this phone');
      return;
    }

    setSaving(true);
    const rows = newPkgIds.map(pid => ({
      phone_number: clean,
      topup_number_id: numId,
      label: label || null,
      package_id: pid,
      category_name: null,
      custom_amount: customAmounts[pid]?.trim() || null,
    }));
    const { error } = await supabase.from('auto_topup_phone_mappings' as any).insert(rows as any);
    if (error) {
      toast.error(error.message);
    } else {
      const skipped = selectedPkgIds.length - newPkgIds.length;
      const msg = skipped > 0
        ? (isSo ? `${newPkgIds.length} la daray, ${skipped} horay u jiray` : `${newPkgIds.length} added, ${skipped} already existed`)
        : (isSo ? `${newPkgIds.length} mapping la daray` : `${newPkgIds.length} mappings added`);
      toast.success(msg);
      setPhone(''); setSelectedPkgIds([]); setCustomAmounts({}); setLabel(''); setOpen(false); load();
    }
    setSaving(false);
  };

  const toggleMapping = async (m: any) => {
    await supabase.from('auto_topup_phone_mappings' as any).update({ is_active: !m.is_active } as any).eq('id', m.id);
    load();
  };

  const deleteMapping = async (id: string) => {
    await supabase.from('auto_topup_phone_mappings' as any).delete().eq('id', id);
    load();
    toast.success(isSo ? 'Waa la tirtiray' : 'Deleted');
  };

  const deletePhoneMappings = async (phoneNum: string) => {
    if (!confirm(isSo ? `Dhammaan mapping-yada ${formatPhone(phoneNum)} ma tirtiraysaa?` : `Delete all mappings for ${formatPhone(phoneNum)}?`)) return;
    await supabase.from('auto_topup_phone_mappings' as any).delete().eq('phone_number', phoneNum);
    load();
    toast.success(isSo ? 'Waa la tirtiray' : 'Deleted');
  };

  const startEdit = (m: any) => {
    setEditingId(m.id);
    setEditCustomAmt(m.custom_amount || '');
    setEditLabel(m.label || '');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setEditSaving(true);
    const { error } = await supabase.from('auto_topup_phone_mappings' as any).update({
      custom_amount: editCustomAmt.trim() || null,
      label: editLabel.trim() || null,
    } as any).eq('id', editingId);
    if (error) toast.error(error.message);
    else { toast.success(isSo ? 'Waa la cusboonaysiiyay' : 'Updated'); setEditingId(null); load(); }
    setEditSaving(false);
  };

  const getPkgLabel = (id: string, customAmt?: string | null) => {
    const p = allPkgs.find((x: any) => x.id === id);
    if (!p) return '...';
    if (customAmt) return `${p.package_name} → $${customAmt}`;
    return `${p.package_name} ($${Number(p.selling_price).toFixed(2)})`;
  };

  const getNumLabel = (id: string) => {
    const n = allNums.find((x: any) => x.id === id);
    return n ? formatPhone(n.phone_number) : '...';
  };

  // Group mappings by phone number for cleaner display
  const groupedMappings: Record<string, any[]> = {};
  mappings.forEach((m: any) => {
    if (!groupedMappings[m.phone_number]) groupedMappings[m.phone_number] = [];
    groupedMappings[m.phone_number].push(m);
  });

  return (
    <div className="space-y-2">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
        <span className="text-gray-500 text-xs font-medium flex items-center gap-1">
          📋 {isSo ? 'Lambarada Loo Qoondeeyay' : 'Phone-Package Mappings'}
          <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </span>
        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
      </button>

      {expanded && (
        <>
          <div className="text-[10px] text-gray-400 px-1">
            {isSo ? 'Lambarka haddii mapping leeyahay, packages-kaas keliya ayaa loo raadiyaa. Haddii lacagtu ka duwan tahay dhammaan → unmatched.' : 'If a phone has mappings, only those packages are checked. If amount differs from all → unmatched.'}
          </div>

          {/* Existing mappings - grouped by phone */}
          {Object.keys(groupedMappings).length > 0 && (
            <div className="space-y-2">
              {Object.entries(groupedMappings).map(([phoneNum, phoneMappings]) => (
                <div key={phoneNum} className="bg-white dark:bg-gray-800 rounded-lg border px-3 py-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-xs">{formatPhone(phoneNum)}</div>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-gray-400">{phoneMappings.length} pkg{phoneMappings.length !== 1 ? 's' : ''}</span>
                      <button onClick={() => deletePhoneMappings(phoneNum)} className="w-5 h-5 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                        <Trash2 className="w-2.5 h-2.5 text-red-500" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {phoneMappings.map((m: any) => (
                      <div key={m.id} className="flex items-center gap-1 bg-gray-50 dark:bg-gray-900 border rounded-full px-2 py-0.5">
                        <span className="text-[10px] font-medium text-gray-700 dark:text-gray-200">{getPkgLabel(m.package_id, m.custom_amount)}</span>
                        <button onClick={() => startEdit(m)} className="text-blue-400 hover:text-blue-600">
                          <Pencil className="w-2.5 h-2.5" />
                        </button>
                        <button onClick={() => toggleMapping(m)} className={`text-[7px] font-bold px-1 rounded-full ${m.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {m.is_active ? '✓' : '✕'}
                        </button>
                        <button onClick={() => deleteMapping(m.id)} className="text-red-400 hover:text-red-600">
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {/* Inline edit form */}
                  {phoneMappings.some((m: any) => m.id === editingId) && (
                    <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-2 space-y-1.5 border border-blue-200 dark:border-blue-800 mt-1">
                      <div className="text-[10px] font-bold text-blue-600">{isSo ? 'Mapping Beddel' : 'Edit Mapping'}</div>
                      <input
                        type="text"
                        value={editCustomAmt}
                        onChange={e => setEditCustomAmt(e.target.value)}
                        placeholder={isSo ? 'Lacago gaar ah: 5,10,15 (iska dhaaf = default)' : 'Custom amounts: 5,10,15 (empty = default)'}
                        className="w-full px-2.5 py-1.5 rounded-lg border text-xs bg-white dark:bg-gray-800 dark:border-gray-700 outline-none font-mono"
                      />
                      <input
                        type="text"
                        value={editLabel}
                        onChange={e => setEditLabel(e.target.value)}
                        placeholder={isSo ? 'Magac (ikhtiyaari)' : 'Label (optional)'}
                        className="w-full px-2.5 py-1.5 rounded-lg border text-xs bg-white dark:bg-gray-800 dark:border-gray-700 outline-none"
                      />
                      <div className="flex gap-1.5">
                        <button onClick={saveEdit} disabled={editSaving} className="flex-1 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">{editSaving ? '...' : isSo ? 'Kaydi' : 'Save'}</button>
                        <button onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-xs font-medium">{isSo ? 'Kansal' : 'Cancel'}</button>
                      </div>
                    </div>
                  )}
                  <div className="text-[9px] text-gray-400">→ {getNumLabel(phoneMappings[0]?.topup_number_id)} {phoneMappings[0]?.label ? `· ${phoneMappings[0].label}` : ''}</div>
                </div>
              ))}
            </div>
          )}

          {/* Add mapping */}
          {!open ? (
            <button onClick={() => setOpen(true)} className="w-full py-2 rounded-lg border-2 border-dashed border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400 text-xs font-semibold flex items-center justify-center gap-1 active:bg-orange-50 dark:active:bg-orange-950/30">
              <Plus className="w-3.5 h-3.5" /> {isSo ? 'Ku Dar Mapping' : 'Add Mapping'}
            </button>
          ) : (
            <div className="bg-orange-50 dark:bg-orange-950/30 rounded-xl p-3 space-y-2 border border-orange-200 dark:border-orange-800">
              <div className="text-[10px] font-bold text-orange-600">{isSo ? 'Mapping Cusub' : 'New Mapping'}</div>
              <input type="tel" inputMode="numeric" pattern="[0-9]*" value={phone} onChange={e => setPhone(e.target.value)} placeholder={isSo ? 'Lambarka macmiilka (tusaale: 617195659)' : 'Customer phone (e.g. 617195659)'} className="w-full px-2.5 py-2 rounded-lg border text-xs bg-white dark:bg-gray-800 dark:border-gray-700 outline-none" />
              <select value={numId} onChange={e => { setNumId(e.target.value); setSelectedPkgIds([]); }} className="w-full px-2.5 py-2 rounded-lg border text-xs bg-white dark:bg-gray-800 dark:border-gray-700 outline-none">
                <option value="">{isSo ? '-- Lambarka Auto Top-Up --' : '-- Auto Top-Up Number --'}</option>
                {allNums.map((n: any) => <option key={n.id} value={n.id}>{formatPhone(n.phone_number)} {n.label ? `(${n.label})` : ''}</option>)}
              </select>
              
              {/* Multi-select packages */}
              <div>
                <label className="text-[9px] text-gray-500 font-medium">{isSo ? 'Packages-ka Dooro (badan dooro)' : 'Select Packages (multi-select)'}</label>
                <div className="max-h-48 overflow-y-auto space-y-1 mt-1 bg-white dark:bg-gray-800 rounded-lg border p-2">
                  {filteredPkgs.length === 0 ? (
                    <div className="text-[10px] text-gray-400 text-center py-2">{isSo ? 'Marka hore lambarka auto-top-up dooro' : 'Select auto-top-up number first'}</div>
                  ) : filteredPkgs.map((p: any) => {
                    const selected = selectedPkgIds.includes(p.id);
                    return (
                      <div key={p.id} className="space-y-1">
                        <button onClick={() => togglePkgSelection(p.id)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-2 transition-colors ${selected ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 font-semibold' : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
                          <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0 ${selected ? 'bg-orange-600 border-orange-600 text-white' : 'border-gray-300 dark:border-gray-600'}`}>{selected ? '✓' : ''}</span>
                          <span className="truncate">{p.package_name} (${Number(p.selling_price).toFixed(2)}) - {p.provider_name}</span>
                        </button>
                        {selected && (
                          <input
                            type="text"
                            value={customAmounts[p.id] || ''}
                            onChange={e => setCustomAmounts(prev => ({ ...prev, [p.id]: e.target.value }))}
                            placeholder={isSo ? `Lacago gaar ah: 5,10,15 (iska dhaaf = $${Number(p.selling_price).toFixed(2)})` : `Custom amounts: 5,10,15 (empty = $${Number(p.selling_price).toFixed(2)})`}
                            className="w-full ml-6 px-2 py-1 rounded border text-[10px] bg-white dark:bg-gray-800 dark:border-gray-700 outline-none focus:ring-1 focus:ring-orange-400"
                            style={{ maxWidth: 'calc(100% - 1.5rem)' }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                {selectedPkgIds.length > 0 && <div className="text-[9px] text-orange-600 mt-1 font-medium">{selectedPkgIds.length} {isSo ? 'la doortay' : 'selected'}</div>}
              </div>

              <input value={label} onChange={e => setLabel(e.target.value)} placeholder={isSo ? 'Magac (ikhtiyaari)' : 'Label (optional)'} className="w-full px-2.5 py-2 rounded-lg border text-xs bg-white dark:bg-gray-800 dark:border-gray-700 outline-none" />
              <div className="flex gap-2">
                <button onClick={handleAdd} disabled={saving} className="flex-1 py-2 rounded-lg bg-orange-600 text-white text-xs font-semibold disabled:opacity-50">{saving ? '...' : isSo ? 'Kaydi' : 'Save'}</button>
                <button onClick={() => { setOpen(false); setSelectedPkgIds([]); setCustomAmounts({}); }} className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-xs font-medium">{isSo ? 'Kansal' : 'Cancel'}</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ========== MAIN VIEW ==========
export const AutoTopUpCustomView = ({ isSo }: { isSo: boolean }) => {
  const [numbers, setNumbers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadNumbers = useCallback(async () => {
    const { data } = await supabase.from('auto_topup_numbers').select('*').order('created_at', { ascending: false });
    setNumbers(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadNumbers(); }, [loadNumbers]);

  return (
    <div className="space-y-3">
      {/* Numbers Management */}
      <div className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-1">📞 {isSo ? 'Nambarada Auto Top-Up' : 'Auto Top-Up Numbers'}</div>
      {loading ? <div className="text-xs text-gray-400 text-center py-4">Loading...</div> : (
        <div className="space-y-2">
          {numbers.map(num => <NumberCard key={num.id} num={num} isSo={isSo} onRefresh={loadNumbers} />)}
          <AddNumberForm isSo={isSo} onAdded={loadNumbers} />
        </div>
      )}

      {/* Delivery Rules */}
      <DeliveryRulesSection isSo={isSo} />

      {/* Phone-Package Mappings */}
      <PhoneMappingSection isSo={isSo} />
    </div>
  );
};
