'use client';

// AI Assistant chat experience within the Aether dashboard.
// Supports persistent multi-turn conversations with history sidebar.

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Send,
  ChevronRight,
  MessageSquarePlus,
  Clock,
  Trash2,
} from 'lucide-react';
import { useChat } from '@ai-sdk/react';

import { useMetrics } from '@/hooks/use-metrics';
import { useUser } from '@/hooks/use-user';
import type { DateRange, Period } from '@/lib/data/metric-aggregator';
import { subDays, format, formatDistanceToNow } from 'date-fns';
import { RecommendationBanner } from '@/components/ai/recommendation-banner';

// ── Types ───────────────────────────────────────────────────────────

interface ConversationSummary {
  id: string;
  title: string | null;
  updatedAt: string;
  messageCount: number;
}

interface SavedMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

// ── Helpers ─────────────────────────────────────────────────────────

function RichMessage({
  text,
  onNavigate,
}: {
  text: string;
  onNavigate: (path: string) => void;
}) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);

  return (
    <div className="space-y-3">
      <div className="whitespace-pre-wrap">
        {parts.map((part, i) => {
          const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
          if (linkMatch) {
            const [, label, path] = linkMatch;
            return (
              <button
                key={i}
                type="button"
                onClick={() => onNavigate(path ?? '')}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors mx-0.5"
              >
                {label ?? ''}
                <ChevronRight className="h-3 w-3" />
              </button>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </div>
    </div>
  );
}

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

// ── Suggested Prompts (static fallback — dynamic added in Commit 4) ─

const STATIC_PROMPTS = [
  'Where am I losing the most money and what should I do about it?',
  'Which staff member needs the most attention right now?',
  'Give me 3 things I should change this week to make more money.',
  'Compare my best and worst performers — what can I learn?',
  'Are there any patterns in my revenue that I should worry about?',
  'What would happen if I cut my lowest-performing class?',
];

const NO_DATA_PROMPT =
  'Connect your data first, then I can analyze your entire business. Head to Connected Data to get started.';

// ── Main Component ──────────────────────────────────────────────────

function AIAssistantPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, org } = useUser();
  const initial = getInitialRange();
  const orgIds = org ? [org.id] : [];
  const { metrics } = useMetrics(initial.period, initial.range, 0, orgIds);
  const [uploadsExist, setUploadsExist] = useState(false);
  const hasAutoSent = useRef(false);

  // ── Conversation state ────────────────────────────────────────────
  const [conversationId, setConversationId] = useState<string | null>(
    searchParams.get('c'),
  );
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [restoringConversation, setRestoringConversation] = useState(false);

  // Check if uploads exist
  useEffect(() => {
    if (!org) return;
    const check = async () => {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { count } = await supabase
        .from('uploads')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org.id)
        .eq('status', 'ready');
      setUploadsExist((count ?? 0) > 0);
    };
    check();
  }, [org]);

  const hasData = uploadsExist || (metrics?.series?.length ?? 0) > 0;

  const suggestedPrompts = hasData ? STATIC_PROMPTS : [NO_DATA_PROMPT];

  // ── useChat with conversation support ─────────────────────────────
  const {
    messages,
    setMessages,
    status,
    append,
  } = useChat({
    api: '/api/chat',
    body: { conversationId },
    onResponse(response) {
      // Capture conversationId from first response header
      const headerConvId = response.headers.get('x-conversation-id');
      if (headerConvId && headerConvId !== conversationId) {
        setConversationId(headerConvId);
        // Update URL without full navigation
        const url = new URL(window.location.href);
        url.searchParams.set('c', headerConvId);
        window.history.replaceState({}, '', url.toString());
        // Refresh conversation list
        void loadConversations();
      }
    },
  });

  const [input, setInput] = useState<string>('');
  const isLoading = status === 'streaming' || status === 'submitted';

  // ── Load conversation history ─────────────────────────────────────
  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/conversations');
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations ?? []);
      }
    } catch {
      // Non-blocking
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  // ── Restore conversation from URL param ───────────────────────────
  useEffect(() => {
    const paramConvId = searchParams.get('c');
    if (!paramConvId || restoringConversation) return;

    // Only restore if we have no messages yet (fresh load)
    if (messages.length === 0) {
      setRestoringConversation(true);
      const restore = async () => {
        try {
          const res = await fetch(`/api/chat/conversations/${paramConvId}`);
          if (res.ok) {
            const data = await res.json();
            const restored = (data.messages ?? []).map(
              (m: SavedMessage, idx: number) => ({
                id: m.id ?? `restored-${idx}`,
                role: m.role as 'user' | 'assistant',
                content: m.content,
              }),
            );
            if (restored.length > 0) {
              setMessages(restored);
              setConversationId(paramConvId);
            }
          }
        } catch {
          // Non-blocking
        } finally {
          setRestoringConversation(false);
        }
      };
      void restore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-send from ?prompt= ────────────────────────────────────────
  useEffect(() => {
    if (hasAutoSent.current) return;
    const autoPrompt = searchParams.get('prompt');
    if (autoPrompt && autoPrompt.trim().length > 0 && hasData) {
      hasAutoSent.current = true;
      setTimeout(() => {
        void append({ role: 'user', content: autoPrompt });
      }, 500);
    }
  }, [searchParams, hasData, append]);

  // ── Conversation actions ──────────────────────────────────────────
  const handleNewChat = () => {
    setConversationId(null);
    setMessages([]);
    setInput('');
    // Clear URL param
    const url = new URL(window.location.href);
    url.searchParams.delete('c');
    window.history.replaceState({}, '', url.toString());
  };

  const handleLoadConversation = async (convId: string) => {
    if (convId === conversationId) return;
    setRestoringConversation(true);
    try {
      const res = await fetch(`/api/chat/conversations/${convId}`);
      if (res.ok) {
        const data = await res.json();
        const restored = (data.messages ?? []).map(
          (m: SavedMessage, idx: number) => ({
            id: m.id ?? `restored-${idx}`,
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }),
        );
        setMessages(restored);
        setConversationId(convId);
        setInput('');
        // Update URL
        const url = new URL(window.location.href);
        url.searchParams.set('c', convId);
        window.history.replaceState({}, '', url.toString());
      }
    } catch {
      // Non-blocking
    } finally {
      setRestoringConversation(false);
    }
  };

  const handleDeleteConversation = async (convId: string) => {
    try {
      const res = await fetch(`/api/chat/conversations/${convId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== convId));
        // If we deleted the active conversation, start fresh
        if (convId === conversationId) {
          handleNewChat();
        }
      }
    } catch {
      // Non-blocking
    }
  };

  const handleSuggestedClick = async (prompt: string) => {
    setInput('');
    await append({ role: 'user', content: prompt });
  };

  const greetingName = profile?.full_name?.split(' ')[0] ?? 'Operator';
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'end',
      });
    }
  }, [messages, isLoading]);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#0A0A0A]">
      <div className="flex flex-1 overflow-hidden">
        {/* ZONE 1: Sidebar — conversations + suggestions (desktop only) */}
        <div className="hidden lg:flex w-96 flex-col border-r border-zinc-800 bg-zinc-950">
          {/* New Chat button */}
          <div className="flex-shrink-0 p-6 border-b border-zinc-800">
            <button
              type="button"
              onClick={handleNewChat}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm font-medium text-emerald-400 transition-all hover:bg-emerald-500/10 hover:border-emerald-500/30"
            >
              <MessageSquarePlus className="h-4 w-4" />
              New Chat
            </button>
          </div>

          {/* Recent Conversations */}
          <div className="flex-shrink-0 px-6 pt-6 pb-2">
            <div className="text-xs uppercase tracking-[2px] text-emerald-400">
              Recent Conversations
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-1">
            {historyLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-500" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                No conversations yet. Start chatting!
              </div>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`group flex items-start gap-2 rounded-xl px-3 py-3 cursor-pointer transition-all ${
                    conv.id === conversationId
                      ? 'bg-emerald-500/10 border border-emerald-500/20'
                      : 'hover:bg-zinc-900/50'
                  }`}
                  onClick={() => handleLoadConversation(conv.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm text-slate-300">
                      {conv.title ?? 'Untitled'}
                    </div>
                    <div className="flex items-center gap-1 mt-1 text-[11px] text-slate-500">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(conv.updatedAt), {
                        addSuffix: true,
                      })}
                      <span className="mx-1">·</span>
                      {conv.messageCount} msg{conv.messageCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDeleteConversation(conv.id);
                    }}
                    className="flex-shrink-0 mt-0.5 rounded-lg p-1.5 text-slate-600 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400 transition-all"
                    title="Delete conversation"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Suggested Prompts */}
          <div className="flex-shrink-0 border-t border-zinc-800">
            <div className="px-6 pt-5 pb-2">
              <div className="text-xs uppercase tracking-[2px] text-slate-500">
                Suggested Questions
              </div>
            </div>
            <div className="space-y-2 overflow-y-auto px-4 pb-6 max-h-64">
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleSuggestedClick(prompt)}
                  className="w-full rounded-xl border border-zinc-800 px-4 py-3 text-left text-xs leading-snug text-slate-400 transition-all duration-200 hover:border-emerald-500/30 hover:bg-zinc-900/50 hover:text-slate-300"
                >
                  {prompt}
                </button>
              ))}
            </div>
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
              Ask me anything about your business — revenue, staffing,
              performance, or what to do next.
            </div>
            <div className="mt-4">
              <RecommendationBanner />
            </div>
          </div>

          {/* ZONE 2: Scrollable chat */}
          <div className="flex-1 overflow-y-auto bg-[#0A0A0A] p-8 space-y-6">
            {restoringConversation ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex items-center gap-3 text-sm text-slate-400">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-500" />
                  Loading conversation…
                </div>
              </div>
            ) : (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              messages.map((message: any) => {
                const text = getMessageText(message);
                if (!text) return null;
                return (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-2xl px-6 py-4 ${
                        message.role === 'user'
                          ? 'bg-emerald-500/5 border border-emerald-500/10 text-emerald-100'
                          : 'border border-zinc-800 bg-zinc-900/50 text-slate-200'
                      }`}
                    >
                      {message.role === 'user' ? (
                        text
                      ) : (
                        <RichMessage
                          text={text}
                          onNavigate={(path) => router.push(path)}
                        />
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {isLoading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-4 text-sm">
                  <div className="relative flex items-center justify-center h-6 w-6">
                    <div className="absolute inset-0 rounded-lg bg-emerald-500/20 animate-ping" />
                    <div className="relative h-4 w-4 rounded-md bg-emerald-500 animate-pulse" />
                  </div>
                  <span className="text-slate-300">
                    Thinking about your business…
                  </span>
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
                await append({ role: 'user', content: input });
                setInput('');
              }}
              className="flex gap-3"
            >
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={
                  hasData
                    ? 'Ask me anything...'
                    : 'Connect your data first to chat...'
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

export default function AIAssistantPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-500" />
        </div>
      }
    >
      <AIAssistantPageInner />
    </Suspense>
  );
}
