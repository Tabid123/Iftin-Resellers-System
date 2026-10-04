import React from "react";
import { ArrowLeft, Shield, Lock, Eye, Database, Bell, UserCheck } from "lucide-react";
import { useNavigate, useLocation } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/contexts/TenantContext";
const PrivacyPolicy = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const tenantState = useTenant();
  const tenant = tenantState.status === "ready" || tenantState.status === "suspended" ? tenantState.tenant : null;
  const brandName = tenant?.name || (import.meta.env.VITE_TENANT_NAME as string) || "App";
  const supportPhone = tenant?.support_phone ? `+252 ${String(tenant.support_phone).replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3')}` : null;
  const developerName = "Iftin Digital Solutions";
  const previousPage = (location.state as { from?: string })?.from || '/providers';
  const sections = [{
    icon: Database,
    title: "Data We Collect",
    content: "To provide internet-package purchasing and delivery, we may process your phone number, receiver number, order and transaction details, payment-provider references, and limited technical information needed for security, troubleshooting, notifications, and service delivery."
  }, {
    icon: Eye,
    title: "How We Use Data",
    content: "We use this information to process purchases, deliver packages, show order history, prevent fraud or duplicate delivery, provide customer support, send service notifications, and improve reliability."
  }, {
    icon: UserCheck,
    title: "Data Sharing",
    content: "We do not sell personal data. We may share only the information necessary to provide the service with infrastructure/database providers, payment processors, telecom operators, notification providers, and other vendors acting on our behalf, or when required by law."
  }, {
    icon: Lock,
    title: "Security",
    content: "We use access controls, encrypted network connections, tenant isolation, and other reasonable technical and organizational safeguards designed to protect user information from unauthorized access, loss, or misuse."
  }, {
    icon: Database,
    title: "Retention and Deletion",
    content: "We retain order, transaction, and support records only for as long as reasonably necessary to provide the service, meet legal or accounting obligations, resolve disputes, and prevent fraud. You may request deletion of personal data that we are not legally required to retain."
  }, {
    icon: Bell,
    title: "Notifications",
    content: "If notifications are enabled, we may use a device notification identifier to send order or service updates. You can disable notifications in your device settings."
  }, {
    icon: UserCheck,
    title: "Your Rights",
    content: "You may request access, correction, or deletion of your personal data, subject to applicable legal and operational requirements. Contact us using the support information below."
  }];
  return <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="container max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate(previousPage, { replace: true })} className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Privacy Policy</h1>
            
          </div>
        </div>

        {/* Intro */}
        <div className="bg-primary/10 rounded-2xl p-6 mb-8 border border-primary/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">{brandName}</h2>
              <p className="text-sm text-muted-foreground">Your data is secure</p>
            </div>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            {brandName}, operated by {developerName}, is committed to protecting your privacy.
            This Privacy Policy explains what information the app processes, why it is used,
            when it may be shared, how long it may be retained, and how you can contact us about your data.
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-4">
          {sections.map((section, index) => <div key={index} className="bg-card rounded-xl p-5 border border-border/50 hover:border-primary/30 transition-colors">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <section.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-2">{section.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {section.content}
                  </p>
                </div>
              </div>
            </div>)}
        </div>

        {/* Contact */}
        <div className="mt-8 bg-muted/50 rounded-xl p-6 text-center border border-border/50">
          <p className="text-foreground font-semibold">{developerName}</p>
          <p className="text-muted-foreground text-sm mt-1">
            Privacy questions, access requests, corrections, and deletion requests
          </p>
          {supportPhone && <p className="text-foreground font-medium mt-2">Support: {supportPhone}</p>}
          <p className="text-muted-foreground text-xs mt-2">Website: iftinagents.com</p>
        </div>

        {/* Last Updated */}
        <p className="text-center text-muted-foreground text-xs mt-6">Last updated: October 4, 2026</p>
      </div>
    </div>;
};
export default PrivacyPolicy;