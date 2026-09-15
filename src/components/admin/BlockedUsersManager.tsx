import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { Loader2, Ban, UserCheck, Plus, Search } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { format } from 'date-fns';

interface BlockedUser {
  id: string;
  phone_number: string;
  reason: string | null;
  is_active: boolean;
  created_at: string;
  unblocked_at: string | null;
}

/**
 * Normalize phone to canonical 9-digit format
 * 252xxx, 0xx, +252xx → 9 digits
 */
function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('252') && digits.length >= 12) {
    digits = digits.substring(3);
  }
  if (digits.startsWith('0') && digits.length === 10) {
    digits = digits.substring(1);
  }
  return digits.slice(-9);
}

export function BlockedUsersManager() {
  const { language } = useLanguage();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newReason, setNewReason] = useState('');
  const [saving, setSaving] = useState(false);

  const loadBlockedUsers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('blocked_users')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setBlockedUsers(data as BlockedUser[]);
    if (error) console.error('Error loading blocked users:', error);
    setLoading(false);
  }, []);

  useEffect(() => { loadBlockedUsers(); }, [loadBlockedUsers]);

  const handleBlock = async () => {
    if (!newPhone.trim()) return;
    if (!newReason.trim()) {
      toast({ title: language === 'so' ? 'Sababta waa lagama maarmaan' : 'Reason is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const normalized = normalizePhone(newPhone.trim());
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('blocked_users').insert({
      phone_number: normalized,
      reason: newReason.trim(),
      blocked_by: user?.id || null,
    });
    if (error) {
      toast({ title: 'Error', description: error.code === '23505' ? 'Phone already blocked' : error.message, variant: 'destructive' });
    } else {
      toast({ title: '🚫 Blocked', description: `${normalized} has been blocked` });
      setShowAddDialog(false);
      setNewPhone('');
      setNewReason('');
      loadBlockedUsers();
    }
    setSaving(false);
  };

  const handleUnblock = async (id: string) => {
    const { error } = await supabase.from('blocked_users').update({
      is_active: false,
      unblocked_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '✅ Unblocked', description: 'User has been unblocked' });
      loadBlockedUsers();
    }
  };

  const handleReblock = async (id: string) => {
    const { error } = await supabase.from('blocked_users').update({
      is_active: true,
      unblocked_at: null,
    }).eq('id', id);
    if (!error) {
      toast({ title: '🚫 Re-blocked' });
      loadBlockedUsers();
    }
  };

  const filtered = blockedUsers.filter(u =>
    u.phone_number.includes(search) || (u.reason || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5" />
            {language === 'so' ? 'Macaamiisha La Block-gareeya' : 'Blocked Users'}
          </CardTitle>
          <Button onClick={() => setShowAddDialog(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" /> {language === 'so' ? 'Block User' : 'Block User'}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={language === 'so' ? 'Raadi lambar...' : 'Search phone...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {language === 'so' ? 'Macaamiil la block-gareeya ma jiro' : 'No blocked users'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'so' ? 'Lambarka' : 'Phone'}</TableHead>
                  <TableHead>{language === 'so' ? 'Sababta' : 'Reason'}</TableHead>
                  <TableHead>{language === 'so' ? 'Taariikhda' : 'Date'}</TableHead>
                  <TableHead>{language === 'so' ? 'Xaaladda' : 'Status'}</TableHead>
                  <TableHead>{language === 'so' ? 'Ficil' : 'Action'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-mono">{user.phone_number}</TableCell>
                    <TableCell>{user.reason || '-'}</TableCell>
                    <TableCell>{format(new Date(user.created_at), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>
                      {user.is_active ? (
                        <Badge variant="destructive">Blocked</Badge>
                      ) : (
                        <Badge variant="secondary">Unblocked</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.is_active ? (
                        <Button size="sm" variant="outline" onClick={() => handleUnblock(user.id)}>
                          <UserCheck className="h-4 w-4 mr-1" /> Unblock
                        </Button>
                      ) : (
                        <Button size="sm" variant="destructive" onClick={() => handleReblock(user.id)}>
                          <Ban className="h-4 w-4 mr-1" /> Re-block
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{language === 'so' ? 'Macaamiil Block-garee' : 'Block a User'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{language === 'so' ? 'Lambarka Taleefanka' : 'Phone Number'}</Label>
              <Input
                type="tel"
                inputMode="numeric"
                placeholder="e.g. 615123456"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {language === 'so' ? 'Lambarka waa la normalize-gareeya (252xxx → 9 digit)' : 'Phone will be normalized to 9-digit format'}
              </p>
            </div>
            <div>
              <Label>{language === 'so' ? 'Sababta (waa lagama maarmaan)' : 'Reason (required)'} *</Label>
              <Textarea
                placeholder={language === 'so' ? 'Sababta block-ka...' : 'Reason for blocking...'}
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={handleBlock} disabled={saving || !newPhone.trim() || !newReason.trim()} variant="destructive">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              <Ban className="h-4 w-4 mr-1" /> Block
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
