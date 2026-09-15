import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Send, Trash2, Loader2, Smartphone } from "lucide-react";
import { format } from "date-fns";
import { resolveTenantId } from "@/lib/iftinCatalog";

interface Notification {
  id: string;
  title: string;
  message: string;
  is_active: boolean;
  created_at: string;
}

type SendResult = {
  ok?: boolean;
  notification_id?: string;
  push_id?: string | null;
  recipients?: number | null;
  saved?: boolean;
  error?: string;
};

export function SendNotification() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();

  const { data: notifications, isLoading } = useQuery({
    queryKey: ["admin-notifications"],
    queryFn: async () => {
      const tenantId = await resolveTenantId();
      if (!tenantId) return [] as Notification[];
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Notification[];
    },
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const tenantId = await resolveTenantId();
      if (!tenantId) throw new Error("Workspace-ka lama garanayo");

      // The Edge Function performs server-side tenant authorization, persists
      // the in-app notification and sends a native OneSignal push only to APKs
      // tagged with this tenant's trusted slug.
      const { data, error } = await supabase.functions.invoke<SendResult>(
        "send-tenant-notification",
        {
          body: {
            tenant_id: tenantId,
            title: title.trim(),
            message: message.trim(),
            type: "info",
            route: "/notifications",
          },
        },
      );

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Native notification lama dirin");
      return data;
    },
    onSuccess: (data) => {
      const recipientText = typeof data?.recipients === "number"
        ? ` (${data.recipients} qalab)`
        : "";
      toast.success(`Fariinta native-ka waa la diray!${recipientText}`);
      setTitle("");
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
    },
    onError: (error: Error) => {
      toast.error("Khalad: " + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const tenantId = await resolveTenantId();
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
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
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
    sendMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Dir Fariin Cusub
          </CardTitle>
          <div className="flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
            <Smartphone className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Fariintan waxay native notification ahaan ugu dhacaysaa APK-yada tenant-kan oo keliya, xitaa app-ku marka uu background-ka ku jiro.</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Title</label>
            <Input
              placeholder="Cinwaanka fariinta..."
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Message</label>
            <Textarea
              placeholder="Qoraalka fariinta..."
              value={message}
              maxLength={1000}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
            />
          </div>
          <Button
            onClick={handleSend}
            disabled={sendMutation.isPending}
            className="w-full"
          >
            {sendMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Dir Native Notification
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fariimaha La Diray</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
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
                    <TableCell>
                      {format(new Date(notif.created_at), "MMM dd, yyyy HH:mm")}
                    </TableCell>
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
            <p className="text-center text-muted-foreground py-8">
              Weli fariin lama dirin
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
