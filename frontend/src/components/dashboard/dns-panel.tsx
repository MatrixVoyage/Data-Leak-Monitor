'use client';

import { useEffect, useCallback, useState } from 'react';
import { useDashboardStore } from '@/store/dashboard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Search, Globe, ShieldAlert, ShieldCheck, Eye, BarChart3 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { API_BASE, authFetch } from '@/lib/api-config';

const categoryColorMap: Record<string, string> = {
  safe: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  tracking: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  advertising: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  malicious: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  unknown: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20',
};

const PIE_COLORS = ['#10b981', '#f59e0b', '#f97316', '#ef4444', '#6b7280'];

export default function DNSPanel() {
  const { dnsQueries, setDnsQueries } = useDashboardStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'tracking' | 'malicious' | 'blocked'>('all');

  const fetchData = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/dns?limit=100`);
      if (res.ok) setDnsQueries(await res.json());
    } catch (e) { /* silent */ }
  }, [setDnsQueries]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = dnsQueries.filter(q => {
    if (search && !(q.domain || '').toLowerCase().includes(search.toLowerCase()) && !(q.sourceDevice || '').toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'tracking' && q.category !== 'tracking') return false;
    if (filter === 'malicious' && q.category !== 'malicious') return false;
    if (filter === 'blocked' && !q.isBlocked) return false;
    return true;
  });

  const totalQueries = dnsQueries.length;
  const trackingCount = dnsQueries.filter(q => q.category === 'tracking').length;
  const maliciousCount = dnsQueries.filter(q => q.category === 'malicious').length;
  const blockedCount = dnsQueries.filter(q => q.isBlocked).length;

  const categoryData = [
    { name: 'Safe', value: dnsQueries.filter(q => q.category === 'safe').length },
    { name: 'Tracking', value: trackingCount },
    { name: 'Advertising', value: dnsQueries.filter(q => q.category === 'advertising').length },
    { name: 'Malicious', value: maliciousCount },
    { name: 'Unknown', value: dnsQueries.filter(q => q.category === 'unknown').length },
  ].filter(d => d.value > 0);

  const threatScoreData = dnsQueries
    .filter(q => q.threatScore > 20)
    .sort((a, b) => b.threatScore - a.threatScore)
    .slice(0, 8)
    .map(q => ({ domain: q.domain.length > 20 ? q.domain.slice(0, 20) + '...' : q.domain, score: q.threatScore }));

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Globe className="h-4 w-4 text-cyan-500" />
              <span className="text-xs text-muted-foreground">Total DNS Queries</span>
            </div>
            <div className="text-2xl font-bold">{totalQueries}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Eye className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">Tracking Domains</span>
            </div>
            <div className="text-2xl font-bold text-amber-500">{trackingCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className="h-4 w-4 text-red-500" />
              <span className="text-xs text-muted-foreground">Malicious Domains</span>
            </div>
            <div className="text-2xl font-bold text-red-500">{maliciousCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground">Blocked</span>
            </div>
            <div className="text-2xl font-bold text-emerald-500">{blockedCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Query Category Distribution</CardTitle>
            <CardDescription>Breakdown of DNS query types by safety category</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={45} outerRadius={80} dataKey="value" nameKey="name" paddingAngle={2}>
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-3 mt-2 justify-center">
              {categoryData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span>{d.name} ({d.value})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-red-500" />
              Threat Scores (High Risk Domains)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={threatScoreData} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="domain" tick={{ fontSize: 10 }} width={75} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                  <Bar dataKey="score" name="Threat Score" radius={[0, 4, 4, 0]}>
                    {threatScoreData.map((entry, index) => (
                      <Cell key={index} fill={entry.score > 70 ? '#ef4444' : entry.score > 40 ? '#f59e0b' : '#10b981'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* DNS Query Log */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="text-base">DNS Query Log</CardTitle>
              <CardDescription>Captured DNS queries with threat analysis</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search domains..." className="pl-9 w-[200px]" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="flex gap-1">
                {(['all', 'tracking', 'malicious', 'blocked'] as const).map(f => (
                  <Button key={f} variant={filter === f ? 'default' : 'outline'} size="sm" onClick={() => setFilter(f)} className="text-xs capitalize">
                    {f}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead className="hidden md:table-cell">Source</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="hidden lg:table-cell">Response IP</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Threat</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 50).map((q) => (
                  <TableRow key={q.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium text-sm">{q.domain}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{q.sourceDevice}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] font-mono">{q.queryType}</Badge></TableCell>
                    <TableCell className="hidden lg:table-cell font-mono text-xs text-muted-foreground">{q.responseIp}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] border ${categoryColorMap[q.category]}`}>
                        {q.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${q.threatScore}%`,
                              backgroundColor: q.threatScore > 70 ? '#ef4444' : q.threatScore > 40 ? '#f59e0b' : '#10b981',
                            }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">{q.threatScore}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {q.isBlocked ? (
                        <Badge variant="destructive" className="text-[10px]">Blocked</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">Allowed</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
