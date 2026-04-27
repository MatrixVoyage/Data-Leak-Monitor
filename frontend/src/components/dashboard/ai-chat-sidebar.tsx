'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useDashboardStore } from '@/store/dashboard';
import { Bot, X, Send, User, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function AiChatSidebar() {
  const { 
    isAiChatOpen, setIsAiChatOpen, aiProvider, aiApiKey,
    stats, trafficTimeSeries, protocolDistribution, topDestinations
  } = useDashboardStore();
  
  const [messages, setMessages] = useState<{role: string, content: string}[]>([
    { role: 'assistant', content: 'Hello! I am your NetSentinel AI Assistant. Ask me anything about your network traffic, alerts, or how this application works.' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const newMessages = [...messages, { role: 'user', content: input.trim() }];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    const liveContext = {
      overallStats: stats,
      trafficLast24h: trafficTimeSeries,
      protocols: protocolDistribution,
      topDestinations: topDestinations
    };

    const systemPrompt = `You are NetSentinel AI, an expert network security assistant. 
CRITICAL RULE: You must ONLY answer questions related to network security, the NetSentinel data leak monitor project, or the user's dashboard data. If the user asks about anything unrelated (e.g. coding a script, general knowledge, math), politely refuse and remind them of your purpose.
You have access to the user's LIVE dashboard data. You must use this data to explain graph patterns or anomalies if the user asks about them.
CURRENT LIVE DASHBOARD DATA:
${JSON.stringify(liveContext)}
`;

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...newMessages
    ];

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: aiProvider,
          apiKey: aiApiKey,
          messages: apiMessages
        })
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to get response');
      }

      setMessages([...newMessages, { role: 'assistant', content: data.reply }]);
    } catch (err: any) {
      setMessages([...newMessages, { role: 'assistant', content: `Error: ${err.message}. Please check your API key in Settings.` }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAiChatOpen) return null;

  return (
    <>
      {/* Backdrop for mobile or smaller screens */}
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden" onClick={() => setIsAiChatOpen(false)} />
      
      <aside className="fixed right-0 top-0 bottom-0 w-full sm:w-[400px] border-l border-white/10 bg-black/40 backdrop-blur-xl flex flex-col h-screen shadow-2xl z-50 transition-all duration-300 ease-in-out">
        {/* Header */}
        <div className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-gradient-to-r from-indigo-500/10 to-transparent">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-500 p-2 rounded-lg shadow-lg shadow-indigo-500/20">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-sm text-white">NetSentinel AI</h2>
              <p className="text-[10px] text-indigo-300">Network Intelligence</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-white hover:bg-white/10 rounded-full" onClick={() => setIsAiChatOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-white/10" ref={scrollRef}>
          {messages.filter(m => m.role !== 'system').map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg ${m.role === 'user' ? 'bg-indigo-500 text-white' : 'bg-card border border-white/10 text-indigo-400'}`}>
                {m.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>
              <div className={`text-sm px-4 py-3 max-w-[80%] leading-relaxed ${
                m.role === 'user' 
                  ? 'bg-indigo-500 text-white rounded-2xl rounded-tr-sm shadow-md' 
                  : 'bg-card/60 border border-white/5 text-gray-200 rounded-2xl rounded-tl-sm backdrop-blur-md'
              }`}>
                {m.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-card border border-white/10 text-indigo-400 shadow-lg">
                <Bot className="h-4 w-4" />
              </div>
              <div className="text-sm px-4 py-3 rounded-2xl rounded-tl-sm bg-card/60 border border-white/5 backdrop-blur-md flex items-center">
                <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-black/40 border-t border-white/10 backdrop-blur-xl">
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex items-end gap-2 relative"
          >
            <Input 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your network activity..." 
              className="flex-1 h-12 text-sm bg-card/50 border-white/10 text-white placeholder:text-gray-500 rounded-xl px-4 focus-visible:ring-1 focus-visible:ring-indigo-500"
            />
            <Button 
              type="submit" 
              size="icon" 
              className="h-12 w-12 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg shadow-indigo-500/25 transition-all" 
              disabled={isLoading || !input.trim()}
            >
              <Send className="h-5 w-5 ml-1" />
            </Button>
          </form>
          {!aiApiKey && (
            <div className="mt-3 text-center">
              <span className="text-[11px] font-medium text-red-400 bg-red-400/10 px-3 py-1 rounded-full border border-red-400/20">
                API Key missing. Please configure in Settings.
              </span>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
