'use client';

// AI Assistant chat experience within the Aether dashboard.

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';

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

export default function AIAssistantPage() {
  const { profile, org } = useUser();
  const initial = getInitialRange();
  const { kpis } = useKpis(initial.period, initial.range);
  const hasData = (kpis?.series?.length ?? 0) > 0;
  const { messages, sendMessage, status } = useChat();

  const [input, setInput] = useState<string>('');
  const isLoading = status === 'streaming' || status === 'submitted';

  const orgLabel = org?.name ?? 'your organization';

  const suggestedPrompts = hasData
    ? [
        'Give me a concise performance brief for this week with 3 action items.',
        'Where are we leaving the most revenue on the table right now?',
        'How is labor cost trending relative to revenue over the last 30 days?',
        'Which days or locations have the lowest utilization, and what should we do about it?',
        'Stress test next month: what happens if demand rises 20% and we change staffing by 10%?',
        'Show me anomalies in revenue, labor, or attendance that I should pay attention to.',
      ]
    : [
        'Upload your first dataset to unlock AI intelligence. Once data is connected, I can analyze revenue, labor, and utilization in real time.',
      ];

  const handleSuggestedClick = async (prompt: string) => {
    setInput('');
    await sendMessage({ role: 'user', content: prompt } as unknown as UIMessage);
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
              AI COO Insights
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
                className="w-full rounded-3xl border border-zinc-800 px-6 py-5 text-left text-sm leading-snug text-slate-300 transition-all hover:border-emerald-500/30 hover:bg-zinc-900"
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
              Ask me about revenue, labor, utilization, or any operational scenario. I&apos;ll use
              your data to respond with clear recommendations.
            </div>
            <div className="mt-4">
              <RecommendationBanner />
            </div>
          </div>

          {/* ZONE 2: Scrollable chat */}
          <div className="flex-1 overflow-y-auto bg-[#0A0A0A] p-8 space-y-6">
            {(messages as unknown as Array<UIMessage & { content?: string }>).map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[75%] rounded-3xl px-6 py-4 ${
                    message.role === 'user'
                      ? 'bg-emerald-500 text-black'
                      : 'border border-zinc-800 bg-zinc-900 text-slate-200'
                  }`}
                >
                  {(message as unknown as { content?: string }).content ?? ''}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-3 rounded-3xl border border-zinc-800 bg-zinc-900 px-6 py-4 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing your operational data…
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ZONE 3: Pinned input — ALWAYS visible */}
          <div className="flex-shrink-0 border-t border-zinc-800 bg-[#0A0A0A] p-8">
            <form
              onSubmit={async (event: FormEvent) => {
                event.preventDefault();
                if (!input.trim()) return;
                await sendMessage({ role: 'user', content: input } as unknown as UIMessage);
                setInput('');
              }}
              className="flex gap-3"
            >
              <input
                value={input}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setInput(event.target.value)
                }
                placeholder={
                  hasData
                    ? `Ask anything about ${orgLabel}…`
                    : 'Upload your first dataset, then ask me about your business…'
                }
                className="flex-1 rounded-3xl border border-zinc-800 bg-zinc-950 px-7 py-6 text-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input?.trim()}
                className="rounded-3xl bg-emerald-500 px-9 text-black transition-all hover:bg-emerald-600 active:scale-[0.985] disabled:bg-zinc-800"
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
