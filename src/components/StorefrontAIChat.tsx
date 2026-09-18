import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Loader2, MessageCircle, Phone, Send, Sparkles, Trash2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTenant } from '@/contexts/TenantContext';
import { useSupportPhone } from '@/hooks/useSupportPhone';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

interface StorefrontAIChatProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StorefrontAIChat({ open, onOpenChange }: StorefrontAIChatProps) {
  const { language } = useLanguage();
  const tenantState = useTenant();
  const support = useSupportPhone();
  const tenant =
    tenantState.status === 'ready' || tenantState.status === 'suspended'
      ? tenantState.tenant
      : null;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const quickQuestions = useMemo(
    () =>
      language === 'so'
        ? [
            'Xirmada ugu jaban maxay tahay?',
            'Somtel xirmooyinka ii sheeg',
            'Sidee Offline Mode u shaqeeyaa?',
            'Sideen ula xiriiraa support-ka?',
          ]
        : [
            'What is the cheapest package?',
            'Show me Somtel packages',
            'How does Offline Mode work?',
            'How do I contact support?',
          ],
    [language],
  );

  useEffect(() => {
    setMessages([]);
    setInput('');
  }, [tenant?.id]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  const sendText = async (raw: string) => {
    const text = raw.trim();
    if (!text || isLoading || !tenant?.slug) return;

    const userMessage: ChatMessage = { role: 'user', content: text };
    const history = [...messages, userMessage].slice(-10);
    setMessages(history);
    setInput('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('storefront-ai-chat', {
        body: {
          tenantSlug: tenant.slug,
          messages: history,
          language,
        },
      });

      if (error) throw error;
      const answer = typeof data?.answer === 'string' ? data.answer.trim() : '';
      if (!answer) throw new Error('AI did not return an answer');

      setMessages((prev) => [...prev, { role: 'assistant', content: answer }].slice(-12));
    } catch (error: any) {
      console.error('[storefront-ai] request failed', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            language === 'so'
              ? 'Waan ku caawin karaa xirmooyinka, shirkadaha, qiimaha iyo support-ka. Fadlan mar kale su’aashaada ii qor.'
              : 'I can help with packages, providers, prices and support. Please try your question again.',
        },
      ].slice(-12));
    } finally {
      setIsLoading(false);
    }
  };

  const tenantName = tenant?.name || (language === 'so' ? 'App-ka' : 'the app');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto flex h-[78dvh] max-h-[720px] w-full max-w-md flex-col rounded-t-3xl border-x border-t p-0"
      >
        <SheetHeader className="border-b bg-primary/5 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <SheetTitle className="truncate text-left text-base">
                  'Iftin Ai'
                </SheetTitle>
                <p className="truncate text-xs text-muted-foreground">
                  {language === 'so'
                    ? `${tenantName} xogtiisa ayuu yaqaan`
                    : `Knows ${tenantName}'s catalog`}
                </p>
              </div>
            </div>
            {messages.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setMessages([])}
                aria-label="Clear chat"
                className="shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 px-4 py-4" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="space-y-5">
              <div className="rounded-2xl border bg-card p-4 text-center">
                <Bot className="mx-auto mb-3 h-10 w-10 text-primary" />
                <p className="text-sm font-semibold text-foreground">
                  {language === 'so'
                    ? `Salaan! I weydii xirmooyinka, shirkadaha, qiimaha iyo sida ${tenantName} loo isticmaalo.`
                    : `Hi! Ask me about packages, providers, prices, payments, or how to use ${tenantName}.`}
                </p>
              </div>

              <div className="flex flex-wrap justify-center gap-2">
                {quickQuestions.map((question) => (
                  <Button
                    key={question}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-auto whitespace-normal rounded-full px-3 py-2 text-xs"
                    onClick={() => void sendText(question)}
                    disabled={isLoading}
                  >
                    {question}
                  </Button>
                ))}
              </div>

              <div className="flex items-center justify-center gap-2 border-t pt-4">
                <Button type="button" variant="outline" size="sm" asChild>
                  <a href={support.telHref}>
                    <Phone className="mr-1.5 h-4 w-4" />
                    {language === 'so' ? 'Wac' : 'Call'}
                  </a>
                </Button>
                <Button type="button" variant="outline" size="sm" asChild>
                  <a href={support.whatsappHref} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="mr-1.5 h-4 w-4" />
                    WhatsApp
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 pb-2">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex gap-2 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}
                  >
                    {message.role === 'user' ? (
                      <User className="h-4 w-4" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                  </div>
                  <div
                    className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-3 py-2.5 text-sm ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground'
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="rounded-2xl bg-muted px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <div className="border-t bg-background p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void sendText(input);
                }
              }}
              placeholder={language === 'so' ? 'Weydii AI-ga...' : 'Ask the AI...'}
              disabled={isLoading || !tenant?.slug}
              maxLength={700}
              className="h-11 rounded-xl"
            />
            <Button
              type="button"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-xl"
              onClick={() => void sendText(input)}
              disabled={!input.trim() || isLoading || !tenant?.slug}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
            {language === 'so'
              ? 'AI-gu wuxuu isticmaalaa xogta public-ka ee tenant-kan oo keliya.'
              : 'AI uses only this tenant’s public storefront data.'}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default StorefrontAIChat;
