import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Shield, UserPlus, Trash2, Mail, User, Lock, Eye, EyeOff } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const PERMISSION_KEYS = [
  { key: 'manage_packages', label: 'Manage Packages', labelSo: 'Xirmooyinka Maaree' },
  { key: 'manage_providers', label: 'Manage Providers', labelSo: 'Shirkadaha Maaree' },
  { key: 'manage_orders', label: 'Manage Orders', labelSo: 'Dalabyada Maaree' },
  { key: 'view_transactions', label: 'View Transactions', labelSo: 'Lacagaha Arag' },
  { key: 'manage_users', label: 'Manage Users', labelSo: 'Isticmaalayaasha Maaree' },
  { key: 'manage_settings', label: 'Manage Settings', labelSo: 'Settings Maaree' },
  { key: 'manage_devices', label: 'Manage Devices', labelSo: 'Devices Maaree' },
  { key: 'manage_bulk_sms', label: 'Bulk SMS', labelSo: 'Bulk SMS' },
  { key: 'view_audit_log', label: 'View Audit Log', labelSo: 'Audit Log Arag' },
  { key: 'manage_admins', label: 'Manage Admins', labelSo: 'Admins Maaree' },
];

interface AdminUser {
  user_id: string;
  role: string;
  created_at: string;
  permissions: string[];
  email?: string;
  full_name?: string;
}

export function AdminManagement() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteFullName, setInviteFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [invitePermissions, setInvitePermissions] = useState<string[]>([]);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editPermissions, setEditPermissions] = useState<string[]>([]);

  const { data: admins, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('role', 'admin');
      if (error) throw error;

      // Get admin emails and names via edge function
      const adminUsers: AdminUser[] = [];
      for (const role of roles || []) {
        const { data: perms } = await supabase
          .from('admin_permissions')
          .select('permission_key')
          .eq('user_id', role.user_id);
        
        adminUsers.push({
          user_id: role.user_id,
          role: role.role,
          created_at: role.created_at || '',
          permissions: perms?.map(p => p.permission_key) || [],
        });
      }

      // Fetch user details
      const response = await supabase.functions.invoke('get-admin-details', {
        body: { user_ids: adminUsers.map(a => a.user_id) },
      });

      if (response.data?.users) {
        for (const admin of adminUsers) {
          const userDetail = response.data.users.find((u: any) => u.id === admin.user_id);
          if (userDetail) {
            admin.email = userDetail.email;
            admin.full_name = userDetail.full_name;
          }
        }
      }

      return adminUsers;
    },
  });

  const inviteAdmin = useMutation({
    mutationFn: async ({ email, password, full_name, permissions }: { email: string; password: string; full_name: string; permissions: string[] }) => {
      const response = await supabase.functions.invoke('add-admin-user', {
        body: { email, password, full_name, permissions },
      });

      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setShowInvite(false);
      setInviteEmail('');
      setInvitePassword('');
      setInviteFullName('');
      setInvitePermissions([]);
      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' 
          ? `Admin cusub lagu daray: ${data.full_name || data.email}` 
          : `New admin added: ${data.full_name || data.email}`,
      });
    },
    onError: (err: any) => {
      toast({ title: language === 'so' ? 'Khalad' : 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const savePermissions = useMutation({
    mutationFn: async ({ userId, permissions }: { userId: string; permissions: string[] }) => {
      await supabase.from('admin_permissions').delete().eq('user_id', userId);
      if (permissions.length > 0) {
        const { error } = await supabase.from('admin_permissions').insert(
          permissions.map(key => ({ user_id: userId, permission_key: key }))
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setEditingUser(null);
      toast({ title: language === 'so' ? 'Guul' : 'Success', description: language === 'so' ? 'Permissions waa la kaydiyay' : 'Permissions saved' });
    },
    onError: (err: any) => {
      toast({ title: language === 'so' ? 'Khalad' : 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const removeAdmin = useMutation({
    mutationFn: async (userId: string) => {
      await supabase.from('admin_permissions').delete().eq('user_id', userId);
      const { error } = await supabase.from('user_roles').delete().eq('user_id', userId).eq('role', 'admin');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: language === 'so' ? 'Guul' : 'Success', description: language === 'so' ? 'Admin waa la saaray' : 'Admin removed' });
    },
  });

  const openEditPermissions = (admin: AdminUser) => {
    setEditingUser(admin);
    setEditPermissions([...admin.permissions]);
  };

  const togglePermission = (key: string, list: string[], setter: (v: string[]) => void) => {
    setter(list.includes(key) ? list.filter(k => k !== key) : [...list, key]);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                {language === 'so' ? 'Maamulka Admins' : 'Admin Management'}
              </CardTitle>
              <CardDescription>
                {language === 'so' ? 'Maaree admin-yada iyo permissions-kooda' : 'Manage admin users and their permissions'}
              </CardDescription>
            </div>
            <Button onClick={() => setShowInvite(true)} className="gap-2">
              <UserPlus className="h-4 w-4" />
              {language === 'so' ? 'Admin Cusub' : 'Add Admin'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'so' ? 'Magaca' : 'Name'}</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>{language === 'so' ? 'Taariikhda' : 'Created'}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins?.map((admin, idx) => (
                  <TableRow key={admin.user_id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium">{admin.full_name || admin.user_id.slice(0, 8) + '...'}</div>
                          {idx === 0 && <Badge className="bg-amber-500/20 text-amber-700 text-[10px]">Super Admin</Badge>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {admin.email || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {admin.permissions.length === 0 ? (
                          <Badge variant="outline" className="text-xs">
                            {language === 'so' ? 'Dhamaan (Full)' : 'Full Access'}
                          </Badge>
                        ) : (
                          admin.permissions.slice(0, 3).map(p => (
                            <Badge key={p} variant="secondary" className="text-xs">{p.replace('manage_', '').replace('view_', '')}</Badge>
                          ))
                        )}
                        {admin.permissions.length > 3 && (
                          <Badge variant="outline" className="text-xs">+{admin.permissions.length - 3}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {admin.created_at ? format(new Date(admin.created_at), 'dd MMM yyyy') : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEditPermissions(admin)}>
                          <Shield className="h-4 w-4" />
                        </Button>
                        {idx !== 0 && (
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeAdmin.mutate(admin.user_id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Admin Dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              {language === 'so' ? 'Admin Cusub Ku Dar' : 'Add New Admin'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <User className="h-4 w-4" />
                {language === 'so' ? 'Magaca buuxa' : 'Full name'}
              </Label>
              <Input
                placeholder={language === 'so' ? 'Magaca admin-ka' : 'Admin full name'}
                value={inviteFullName}
                onChange={(e) => setInviteFullName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email
              </Label>
              <Input
                type="email"
                placeholder="admin@najax.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className={inviteEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail) ? 'border-destructive' : ''}
              />
              {inviteEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail) && (
                <p className="text-xs text-destructive">
                  {language === 'so' ? 'Fadlan email sax ah geli (tusaale: admin@najax.com)' : 'Please enter a valid email (e.g., admin@najax.com)'}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                {language === 'so' ? 'Password' : 'Password'}
              </Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={language === 'so' ? 'Ugu yaraan 6 xaraf' : 'At least 6 characters'}
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{language === 'so' ? 'Permissions (waxa uu samayn karo)' : 'Permissions'}</Label>
              <p className="text-xs text-muted-foreground mb-2">
                {language === 'so' 
                  ? 'Haddii aadan waxba dooranin, Full Access ayuu helayaa' 
                  : 'If none selected, user gets Full Access'}
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {PERMISSION_KEYS.map(perm => (
                  <div key={perm.key} className="flex items-center justify-between py-1">
                    <Label className="text-sm">{language === 'so' ? perm.labelSo : perm.label}</Label>
                    <Switch
                      checked={invitePermissions.includes(perm.key)}
                      onCheckedChange={() => togglePermission(perm.key, invitePermissions, setInvitePermissions)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvite(false)}>
              {language === 'so' ? 'Ka noqo' : 'Cancel'}
            </Button>
            <Button 
              onClick={() => inviteAdmin.mutate({ email: inviteEmail, password: invitePassword, full_name: inviteFullName, permissions: invitePermissions })}
              disabled={!inviteEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail) || !invitePassword || invitePassword.length < 6 || !inviteFullName || inviteAdmin.isPending}
            >
              {inviteAdmin.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {language === 'so' ? 'Ku Dar' : 'Add Admin'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Permissions Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {language === 'so' ? 'Permissions Badal' : 'Edit Permissions'}
              {editingUser?.full_name && <span className="text-muted-foreground font-normal">— {editingUser.full_name}</span>}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {PERMISSION_KEYS.map(perm => (
              <div key={perm.key} className="flex items-center justify-between">
                <Label>{language === 'so' ? perm.labelSo : perm.label}</Label>
                <Switch
                  checked={editPermissions.includes(perm.key)}
                  onCheckedChange={() => togglePermission(perm.key, editPermissions, setEditPermissions)}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>
              {language === 'so' ? 'Ka noqo' : 'Cancel'}
            </Button>
            <Button onClick={() => editingUser && savePermissions.mutate({ userId: editingUser.user_id, permissions: editPermissions })}>
              {language === 'so' ? 'Kaydi' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
