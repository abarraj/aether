'use client';

// AI Assistant chat experience within the Aether dashboard.

import { useEffect, useRef, useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { useChat } from '@ai-sdk/react';

import { useKpis } from '@/hooks/use-kpis';
import { useUser } from '@/hooks/use-user';
import type { DateRange, Period } from '@/lib/data/aggregator';
import { subDays, format } from 'date-fns';
import { RecommendationBanner } from '@/components/ai/recommendation-banner';

function getInitialRange(): { period: Period; range: DateRange } {
  const end = new Date();
  const start = subDays(end, 6);
  return {
    period: 'daily',
    range: {
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
    },
  };
}

function getMessageText(message: {
  content?: string;
  parts?: Array<{ type: string; text?: string }>;
}): string {
  if (typeof message.content === 'string' && message.content.length > 0) {
    return message.content;
  }
  if (Array.isArray(message.parts)) {
    return message.parts
      .filter((p) => p.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text!)
      .join('\n');
  }
  return '';
}

export default function AIAssistantPage() {
  const { profile, org } = useUser();
  const initial = getInitialRange();
  const orgIds = org ? [org.id] : [];
  const { kpis } = useKpis(initial.period, initial.range, 0, orgIds);
  const hasData = (kpis?.series?.length ?? 0) > 0;

  const { messages, status, sendMessage } = useChat({
    api: '/api/chat',
  } as any);

  const [input, setInput] = useState<string>('');
  const isLoading = status === 'streaming' || status === 'submitted';

  const suggestedPrompts = hasData
    ? [
        'How is my business doing this week?',
        'Where am I losing the most money?',
        'Are my staff costs too high?',
        'Which days are my busiest and slowest?',
        'What should I change to make more money next month?',
        'Are there any red flags I should know about?',
      ]
    : [
        'Connect your data first, then I can analyze your entire business. Head to Connected Data to get started.',
      ];

  const handleSuggestedClick = async (prompt: string) => {
    setInput('');
    await sendMessage({ role: 'user', content: prompt } as any);
  };

  const greetingName = profile?.full_name?.split(' ')[0] ?? 'Operator';
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, isLoading]);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#0A0A0A]">
      <div className="flex flex-1 overflow-hidden">
        {/* ZONE 1: Suggestions — desktop only */}
        <div className="hidden lg:flex w-96 flex-col border-r border-zinc-800 bg-zinc-950">
          <div className="flex-shrink-0 p-8">
            <div className="mb-6 text-xs uppercase tracking-[2px] text-emerald-400">
              Suggested Questions
            </div>
            <div className="text-sm text-slate-400">
              {hasData
                ? 'Suggested questions based on your recent performance.'
                : 'Connect data to unlock tailored operational insights.'}
            </div>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto px-8 pb-8">
            {suggestedPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => handleSuggestedClick(prompt)}
                className="w-full rounded-2xl border border-zinc-800 px-6 py-5 text-left text-sm leading-snug text-slate-300 transition-all duration-200 hover:border-emerald-500/30 hover:bg-zinc-900/50"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        {/* Right side: banner + chat + input */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Fixed banner */}
          <div className="flex-shrink-0 border-b border-zinc-800 bg-zinc-950 px-8 py-6">
            <div className="mb-2 text-xs uppercase tracking-[2px] text-emerald-400">
              Welcome, {greetingName}
            </div>
            <div className="text-sm text-slate-300">
              Ask me anything about your business — revenue, staffing, performance, or what to do
              next.
            </div>
            <div className="mt-4">
              <RecommendationBanner />
            </div>
          </div>

          {/* ZONE 2: Scrollable chat */}
          <div className="flex-1 overflow-y-auto bg-[#0A0A0A] p-8 space-y-6">
            {messages.map((message: any) => {
              const text = getMessageText(message);
              if (!text) return null;
              return (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-6 py-4 whitespace-pre-wrap ${
                      message.role === 'user'
                        ? 'bg-emerald-500/5 border border-emerald-500/10 text-emerald-100'
                        : 'border border-zinc-800 bg-zinc-900/50 text-slate-200'
                    }`}
                  >
                    {text}
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-4 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Thinking about your business…
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ZONE 3: Pinned input — ALWAYS visible */}
          <div className="flex-shrink-0 border-t border-zinc-800 bg-[#0A0A0A] p-8">
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (!input.trim() || isLoading) return;
                await sendMessage({ role: 'user', content: input } as any);
                setInput('');
              }}
              className="flex gap-3"
            >
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={
                  hasData ? 'Ask me anything...' : 'Connect your data first to chat...'
                }
                className="flex-1 rounded-2xl border border-zinc-800 bg-zinc-950 px-5 py-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input?.trim()}
                className="rounded-2xl bg-emerald-500 px-6 py-3.5 text-black transition-all hover:bg-emerald-600 active:scale-[0.985] disabled:bg-zinc-800"
              >
                <Send className="h-5 w-5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
