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
import {
  Activity, Search, ShieldAlert, Globe, ArrowUpDown,
  Filter,
} from 'lucide-react';
import { formatBytes } from '@/lib/format';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { API_BASE, authFetch } from '@/lib/api-config';

const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function TrafficPanel() {
  const { traffic, setTraffic } = useDashboardStore();
  const [search, setSearch] = useState('');
  const [protocolFilter, setProtocolFilter] = useState('all');
  const [suspiciousOnly, setSuspiciousOnly] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/traffic?limit=150`);
      if (res.ok) setTraffic(await res.json());
    } catch (e) { /* silent */ }
  }, [setTraffic]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = traffic.filter(t => {
    if (search && !(t.destDomain || '').toLowerCase().includes(search.toLowerCase()) && !(t.sourceDevice || '').toLowerCase().includes(search.toLowerCase())) return false;
    if (protocolFilter !== 'all' && t.protocol !== protocolFilter) return false;
    if (suspiciousOnly && !t.isSuspicious) return false;
    return true;
  });

  const totalBytes = traffic.reduce((s, t) => s + t.bytes, 0);
  const totalPackets = traffic.reduce((s, t) => s + t.packets, 0);
  const suspiciousTraffic = traffic.filter(t => t.isSuspicious);
  const uniqueProtocols = [...new Set(traffic.map(t => t.protocol))];

  const protocolData = uniqueProtocols.map(p => ({
    name: p,
    value: traffic.filter(t => t.protocol === p).reduce((s, t) => s + t.packets, 0),
    bytes: traffic.filter(t => t.protocol === p).reduce((s, t) => s + t.bytes, 0),
  }));

  const topBytesByDest = traffic
    .reduce((acc, t) => {
      const dest = t.destDomain || t.destIp || 'unknown';
      const existing = acc.find(x => x.dest === dest);
      if (existing) existing.bytes += t.bytes;
      else acc.push({ dest, bytes: t.bytes });
      return acc;
    }, [] as Array<{ dest: string; bytes: number }>)
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 8)
    .map(d => ({ domain: (d.dest || '').length > 18 ? d.dest.slice(0, 18) + '...' : (d.dest || 'unknown'), bytes: Math.round(d.bytes / 1024) }));

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground">Total Traffic</span>
            </div>
            <div className="text-2xl font-bold">{formatBytes(totalBytes)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Globe className="h-4 w-4 text-cyan-500" />
              <span className="text-xs text-muted-foreground">Total Packets</span>
            </div>
            <div className="text-2xl font-bold">{totalPackets.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className="h-4 w-4 text-red-500" />
              <span className="text-xs text-muted-foreground">Suspicious</span>
            </div>
            <div className="text-2xl font-bold text-red-500">{suspiciousTraffic.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <ArrowUpDown className="h-4 w-4 text-violet-500" />
              <span className="text-xs text-muted-foreground">Protocols</span>
            </div>
            <div className="text-2xl font-bold">{uniqueProtocols.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Protocol Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={protocolData} cx="50%" cy="50%" innerRadius={45} outerRadius={80} dataKey="value" nameKey="name" paddingAngle={2}>
                    {protocolData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-3 mt-2 justify-center">
              {protocolData.map((d, i) => (
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
            <CardTitle className="text-base">Top Destinations by Volume (KB)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topBytesByDest} layout="vertical" margin={{ top: 5, right: 20, left: 90, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="domain" tick={{ fontSize: 10 }} width={85} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                  <Bar dataKey="bytes" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Traffic Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-500" />
                Traffic Records
              </CardTitle>
              <CardDescription>Extracted metadata: IP, domain, packet size, protocol</CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search..." className="pl-9 w-[180px]" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="flex gap-1">
                {(['all', ...uniqueProtocols] as string[]).map(p => (
                  <Button key={p} variant={protocolFilter === p ? 'default' : 'outline'} size="sm" onClick={() => setProtocolFilter(p)} className="text-xs font-mono">
                    {p}
                  </Button>
                ))}
              </div>
              <Button variant={suspiciousOnly ? 'destructive' : 'outline'} size="sm" onClick={() => setSuspiciousOnly(!suspiciousOnly)} className="text-xs">
                <ShieldAlert className="h-3 w-3 mr-1" /> Suspicious
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden max-h-[500px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead className="hidden md:table-cell">Protocol</TableHead>
                  <TableHead className="hidden md:table-cell">Port</TableHead>
                  <TableHead>Packets</TableHead>
                  <TableHead>Bytes</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 80).map((t) => (
                  <TableRow key={t.id} className={t.isSuspicious ? 'bg-red-500/5' : 'hover:bg-muted/50'}>
                    <TableCell>
                      <div>
                        <div className="text-xs font-medium">{t.sourceDevice}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{t.sourceIp}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="text-xs font-medium">{t.destDomain}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{t.destIp} · {t.destCountry}</div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="outline" className="text-[10px] font-mono">{t.protocol}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs font-mono text-muted-foreground">{t.port}</TableCell>
                    <TableCell className="text-xs">{t.packets}</TableCell>
                    <TableCell className="text-xs">{formatBytes(t.bytes)}</TableCell>
                    <TableCell>
                      {t.isSuspicious ? (
                        <Badge variant="destructive" className="text-[10px]">
                          {t.riskReason || 'Suspicious'}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">Normal</Badge>
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
