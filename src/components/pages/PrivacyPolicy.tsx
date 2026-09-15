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
  const contactEmail = tenant ? `info@${tenant.slug}.com` : "info@najaxdata.com";
  const previousPage = (location.state as { from?: string })?.from || '/providers';
  const sections = [{
    icon: Database,
    title: "Data We Collect",
    content: "We only collect essential data required to provide our services. This includes your phone number and order history. We do not collect other personal information such as your address or name."
  }, {
    icon: Lock,
    title: "Data Protection",
    content: "Your data is protected with modern security measures. We use the latest encryption to safeguard your information. Your data is never shared with third-party companies."
  }, {
    icon: Eye,
    title: "Data Usage",
    content: "Your data is used solely to complete your internet package orders. We do not use your data for other purposes such as advertising or marketing."
  }, {
    icon: Bell,
    title: "Notifications",
    content: "We may send you notifications about your orders and our services. You can stop notifications at any time by contacting customer service."
  }, {
    icon: UserCheck,
    title: "Your Rights",
    content: "You have the right to request a copy of your data. You can also request that your data be deleted from our system. Contact customer service to make a request."
  }, {
    icon: Shield,
    title: "Security",
    content: "We take strong measures to ensure the security of your data. Our servers are located in secure facilities. We regularly update our security systems."
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
            {brandName} is committed to protecting your privacy and personal data. 
            This policy explains how we collect, use, and protect your data 
            when you use our app.
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
          <p className="text-muted-foreground text-sm mb-2">
            If you have questions about this privacy policy
          </p>
          <p className="text-foreground font-medium">Contact: {contactEmail}</p>
        </div>

        {/* Last Updated */}
        <p className="text-center text-muted-foreground text-xs mt-6">Last updated: December 2025</p>
      </div>
    </div>;
};
export default PrivacyPolicy;