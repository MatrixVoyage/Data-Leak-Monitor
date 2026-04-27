'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useDashboardStore } from '@/store/dashboard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Radio, Play, Square, RotateCcw, ShieldAlert, Activity,
  ArrowUpRight, ArrowDownRight, Filter,
} from 'lucide-react';
import { formatBytes } from '@/lib/format';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { API_BASE, authFetch } from '@/lib/api-config';

export default function PacketsPanel() {
  const {
    realtimePackets, addRealtimePackets, clearRealtimePackets,
    captureActive, setCaptureActive,
  } = useDashboardStore();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchPackets = useCallback(async () => {
    if (!captureActive) return;
    try {
      const res = await authFetch(`${API_BASE}/api/packets`);
      if (res.ok) {
        const data = await res.json();
        addRealtimePackets(Array.isArray(data.packets) ? data.packets : []);
      }
    } catch (e) { /* silent */ }
  }, [captureActive, addRealtimePackets]);

  useEffect(() => {
    if (captureActive) {
      fetchPackets();
      intervalRef.current = setInterval(fetchPackets, 2000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [captureActive, fetchPackets]);

  const now = Date.now();
  // We can rely on realtimePackets directly because the backend only returns recent data,
  // and they age out of the slice(0, 100) as new packets arrive.
  const recentPackets = realtimePackets.slice(0, 100);

  // Chart data: aggregate packets per 5-second window using client arrival time
  const chartData: Array<{ time: string; packets: number }> = [];
  for (let i = 60; i >= 0; i -= 5) {
    const windowStart = now - (i + 5) * 1000;
    const windowEnd = now - i * 1000;
    const count = recentPackets.filter(p => {
      const t = (p as any)._clientTime || new Date(p.timestamp).getTime();
      return t >= windowStart && t < windowEnd;
    }).length;
    chartData.push({
      time: `${i}-${i + 5}s`,
      packets: count,
    });
  }

  const suspiciousCount = recentPackets.filter(p => p.isSuspicious).length;
  const protocols = new Set(recentPackets.map(p => p.protocol));
  const uniqueDests = new Set(recentPackets.map(p => p.destDomain));

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${captureActive ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                <Radio className={`h-5 w-5 ${captureActive ? 'text-emerald-500' : 'text-red-500'}`} />
              </div>
              <div>
                <div className="font-medium text-sm">Packet Capture</div>
                <div className="text-xs text-muted-foreground">
                  {captureActive ? 'Capturing in real-time' : 'Capture paused'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={captureActive}
                onCheckedChange={setCaptureActive}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="font-medium text-sm">Packets Captured</div>
              <div className="text-xs text-muted-foreground">Current session</div>
            </div>
            <div className="text-2xl font-bold">{realtimePackets.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="font-medium text-sm">Suspicious Packets</div>
              <div className="text-xs text-muted-foreground">Flagged for review</div>
            </div>
            <div className="text-2xl font-bold text-red-500">{suspiciousCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Live Chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-500" />
                Real-Time Packet Stream
              </CardTitle>
              <CardDescription>Packets per time window (last 60 seconds)</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={clearRealtimePackets} className="text-xs">
              <RotateCcw className="h-3 w-3 mr-1" /> Clear
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="packetGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                <Area type="stepAfter" dataKey="packets" stroke="#8b5cf6" fill="url(#packetGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Summary badges */}
      <div className="flex gap-2 flex-wrap">
        <Badge variant="outline" className="text-xs">{protocols.size} protocols active</Badge>
        <Badge variant="outline" className="text-xs">{uniqueDests.size} unique destinations</Badge>
        {Array.from(protocols).map(p => (
          <Badge key={p} variant="secondary" className="text-xs font-mono">{p}</Badge>
        ))}
      </div>

      {/* Packet Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Radio className="h-4 w-4 text-violet-500" />
            Live Packet Feed
          </CardTitle>
          <CardDescription>Real-time captured network packets</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead className="hidden md:table-cell">Protocol</TableHead>
                  <TableHead className="hidden lg:table-cell">Port</TableHead>
                  <TableHead className="hidden md:table-cell">Size</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentPackets.slice(0, 60).map((packet) => (
                  <TableRow key={packet.id} className={packet.isSuspicious ? 'bg-red-500/5' : 'hover:bg-muted/50'}>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {packet.bytes > 10000 ? (
                          <ArrowUpRight className="h-3 w-3 text-amber-500" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {new Date(packet.timestamp).toLocaleTimeString()}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="text-xs font-medium">{packet.sourceDevice}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{packet.sourceIp}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="text-xs font-medium">{packet.destDomain}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{packet.destIp} · {packet.destCountry}</div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="outline" className="text-[10px] font-mono">{packet.protocol}</Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs font-mono text-muted-foreground">{packet.port}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs">{formatBytes(packet.bytes)}</TableCell>
                    <TableCell>
                      {packet.isSuspicious ? (
                        <Badge variant="destructive" className="text-[10px] flex items-center gap-1">
                          <ShieldAlert className="h-3 w-3" /> Suspicious
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
