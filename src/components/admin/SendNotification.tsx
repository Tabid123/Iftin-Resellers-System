import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, invokeEdgeFunction } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Bell, Send, Trash2, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { resolveTenantId } from "@/lib/iftinCatalog";
import { useTenant } from "@/contexts/TenantContext";

interface Notification {
  id: string;
  title: string;
  message: string;
  is_active: boolean;
  created_at: string;
}

interface SendNotificationResult {
  success?: boolean;
  push_configured?: boolean;
  push_sent?: boolean;
  push_error?: string;
  recipients?: number | null;
  error?: string;
}

export function SendNotification() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  const isNativePush =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("mode") === "push";

  const { data: tenantId, isLoading: isTenantLoading } = useQuery({
    queryKey: ["resolved-tenant-id", "send-notification"],
    queryFn: resolveTenantId,
    staleTime: 5 * 60 * 1000,
  });

  const notificationQueryKey = ["admin-notifications", tenantId] as const;

  const { data: notifications, isLoading } = useQuery({
    queryKey: notificationQueryKey,
    enabled: Boolean(tenantId),
    queryFn: async () => {
      if (!tenantId) return [] as Notification[];
      const { data, error } = await supabase
        .from("notifications")
        .select("id,title,message,is_active,created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as Notification[];
    },
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Workspace-ka lama garanayo");

      if (!isNativePush) {
        const { error } = await supabase.from("notifications").insert({
          title: title.trim(),
          message: message.trim(),
          tenant_id: tenantId,
        });
        if (error) throw error;
        return { success: true, push_sent: false, in_app_only: true } as const;
      }

      const { data, error } = await invokeEdgeFunction<SendNotificationResult>(
        "send-tenant-notification",
        {
          tenant_id: tenantId,
          title: title.trim(),
          message: message.trim(),
          path: "/notifications",
          logo_url: tenant?.logo_url || null,
        },
      );

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Notification-ka lama diri karin");
      return { ...data, in_app_only: false };
    },
    onSuccess: (result) => {
      setTitle("");
      setMessage("");
      queryClient.invalidateQueries({ queryKey: notificationQueryKey });
      queryClient.invalidateQueries({ queryKey: ["user-notifications", tenantId] });

      if (result.in_app_only) {
        toast.success("Fariinta app-ka dhexdiisa waa la diray!");
        return;
      }

      if (result.push_sent) {
        const recipientText =
          typeof result.recipients === "number" && result.recipients >= 0
            ? ` (${result.recipients} qalab)`
            : "";
        toast.success(`Native notification-ka waa la diray${recipientText}`);
      } else if (result.push_configured === false) {
        toast.warning("Fariinta waa la kaydiyey; native push config weli lama dhameystirin");
      } else {
        toast.warning("Fariinta waa la kaydiyey, laakiin native push ma gaarin provider-ka");
      }
    },
    onError: (error: Error) => {
      toast.error("Khalad: " + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!tenantId) throw new Error("Workspace-ka lama garanayo");
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fariinta waa la tirtiray!");
      queryClient.invalidateQueries({ queryKey: notificationQueryKey });
      queryClient.invalidateQueries({ queryKey: ["user-notifications", tenantId] });
    },
    onError: (error: Error) => {
      toast.error("Khalad: " + error.message);
    },
  });

  const handleSend = () => {
    if (!title.trim() || !message.trim()) {
      toast.error("Fadlan buuxi Title iyo Message");
      return;
    }
    if (!tenantId) {
      toast.error("Workspace-ka lama garanayo");
      return;
    }
    sendMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isNativePush ? <Bell className="h-5 w-5" /> : <Send className="h-5 w-5" />}
            {isNativePush ? "Dir Notification Cusub" : "Dir Fariin Cusub"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isNativePush && (
            <p className="text-sm text-muted-foreground">
              Notification-kan wuxuu u baxayaa qalabka tenant-kan ee OneSignal ku xiran.
            </p>
          )}
          <div>
            <label className="text-sm font-medium mb-1 block">Title</label>
            <Input
              placeholder="Cinwaanka fariinta..."
              value={title}
              maxLength={100}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Message</label>
            <Textarea
              placeholder="Qoraalka fariinta..."
              value={message}
              maxLength={500}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
            />
          </div>
          <Button
            onClick={handleSend}
            disabled={sendMutation.isPending || isTenantLoading || !tenantId}
            className="w-full"
          >
            {sendMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : isNativePush ? (
              <Bell className="h-4 w-4 mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            {isNativePush ? "Dir Notification" : "Dir Fariinta"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fariimaha La Diray</CardTitle>
        </CardHeader>
        <CardContent>
          {isTenantLoading || isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : notifications && notifications.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Taariikhda</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notifications.map((notif) => (
                  <TableRow key={notif.id}>
                    <TableCell className="font-medium">{notif.title}</TableCell>
                    <TableCell className="max-w-[300px] truncate">{notif.message}</TableCell>
                    <TableCell>{format(new Date(notif.created_at), "MMM dd, yyyy HH:mm")}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(notif.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">Weli fariin lama dirin</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
