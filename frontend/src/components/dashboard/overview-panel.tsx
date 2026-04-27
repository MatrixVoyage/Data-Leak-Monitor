'use client';

import { useDashboardStore } from '@/store/dashboard';
import { useEffect, useCallback, useRef } from 'react';
import { formatBytes } from '@/lib/format';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts';
import {
  Activity, Wifi, ShieldAlert, Globe, Server, AlertTriangle,
  TrendingUp, TrendingDown, Clock, Radio, Zap, Lock
} from 'lucide-react';
import type { DashboardView } from '@/store/dashboard';
import { API_BASE, authFetch } from '@/lib/api-config';

const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function OverviewPanel() {
  const { stats, setStats, trafficTimeSeries, setTrafficTimeSeries, protocolDistribution, setProtocolDistribution, topDestinations, setTopDestinations, setActiveView, addRealtimePackets, captureActive, alerts, setAlerts } = useDashboardStore();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, packetsRes, timeseriesRes, protocolsRes, destsRes, alertsRes] = await Promise.all([
        authFetch(`${API_BASE}/api/stats`),
        captureActive ? authFetch(`${API_BASE}/api/packets`) : Promise.resolve(null),
        authFetch(`${API_BASE}/api/analytics/timeseries`),
        authFetch(`${API_BASE}/api/analytics/protocols`),
        authFetch(`${API_BASE}/api/analytics/destinations`),
        authFetch(`${API_BASE}/api/alerts?limit=5`)
      ]);
      
      if (statsRes.ok) setStats(await statsRes.json());
      if (packetsRes && packetsRes.ok) addRealtimePackets((await packetsRes.json()).packets);
      if (timeseriesRes.ok) setTrafficTimeSeries(await timeseriesRes.json());
      if (protocolsRes.ok) setProtocolDistribution(await protocolsRes.json());
      if (destsRes.ok) setTopDestinations(await destsRes.json());
      if (alertsRes.ok) setAlerts((await alertsRes.json()).data);
      
    } catch (e) {
      // Silently handle fetch errors
    }
  }, [setStats, addRealtimePackets, setTrafficTimeSeries, setProtocolDistribution, setTopDestinations, setAlerts, captureActive]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    intervalRef.current = setInterval(fetchData, 8000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  const statCards = stats ? [
    { title: 'Connected Devices', value: `${stats.onlineDevices}/${stats.totalDevices}`, icon: Wifi, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10', trend: <TrendingUp className="h-3 w-3 text-emerald-500" /> },
    { title: 'Total Traffic', value: formatBytes(stats.totalBytes), icon: Activity, color: 'text-amber-500', bgColor: 'bg-amber-500/10', trend: <TrendingUp className="h-3 w-3 text-amber-500" /> },
    { title: 'Active Alerts', value: `${stats.unresolvedAlerts}`, icon: ShieldAlert, color: 'text-red-500', bgColor: 'bg-red-500/10', trend: <AlertTriangle className="h-3 w-3 text-red-500" /> },
    { title: 'DNS Queries', value: stats.dnsQueries.toLocaleString(), icon: Globe, color: 'text-cyan-500', bgColor: 'bg-cyan-500/10', trend: <TrendingDown className="h-3 w-3 text-cyan-500" /> },
    { title: 'Packets Captured', value: stats.totalPackets.toLocaleString(), icon: Radio, color: 'text-violet-500', bgColor: 'bg-violet-500/10', trend: <TrendingUp className="h-3 w-3 text-violet-500" /> },
    { title: 'Suspicious Domains', value: `${stats.suspiciousDomains}`, icon: ShieldAlert, color: 'text-rose-500', bgColor: 'bg-rose-500/10', trend: <AlertTriangle className="h-3 w-3 text-rose-500" /> },
  ] : [];

  const recentAlerts = alerts.slice(0, 5);

  const severityColor = (s: string) => {
    switch (s) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'warning': return 'secondary';
      default: return 'outline';
    }
  };

  const topDestsSlice = topDestinations.slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((card) => (
          <Card key={card.title} className="relative overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className={`p-2 rounded-lg ${card.bgColor}`}>
                  <card.icon className={`h-4 w-4 ${card.color}`} />
                </div>
                {card.trend}
              </div>
              <div className="text-lg font-bold">{card.value}</div>
              <div className="text-xs text-muted-foreground">{card.title}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Traffic Chart + Protocol Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-500" />
              Network Traffic (24h)
            </CardTitle>
            <CardDescription>Data volume per 15-min interval across all devices (MB)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trafficTimeSeries} margin={{ top: 5, right: 20, left: 5, bottom: 0 }}>
                  <defs>
                    <linearGradient id="trafficGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 10 }}
                    className="text-muted-foreground"
                    interval={7}
                    tickFormatter={(val) => {
                      try {
                        if (val.includes('T')) return new Date(val).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                        return val;
                      } catch(e) { return val; }
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    className="text-muted-foreground"
                    tickFormatter={(val) => `${val} MB`}
                  />
                  <Tooltip
                    labelFormatter={(label) => {
                      try {
                        if (typeof label === 'string' && label.includes('T')) {
                          return new Date(label).toLocaleString([], {hour: '2-digit', minute:'2-digit', month: 'short', day: 'numeric'});
                        }
                        return label;
                      } catch(e) { return label; }
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === 'mb') return [`${value.toFixed(2)} MB`, 'Traffic'];
                      if (name === 'packets') return [value.toLocaleString(), 'Packets'];
                      return [value, name];
                    }}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Area type="monotone" dataKey="mb" stroke="#10b981" fill="url(#trafficGrad)" strokeWidth={2} name="mb" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="h-4 w-4 text-violet-500" />
              Protocol Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={protocolDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="packets"
                    nameKey="protocol"
                    paddingAngle={2}
                  >
                    {protocolDistribution.map((entry, index) => (
                      <Cell key={entry.protocol} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {protocolDistribution.map((p, i) => (
                <div key={p.protocol} className="flex items-center gap-2 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-muted-foreground">{p.protocol}</span>
                  <span className="ml-auto font-medium">{p.percentage}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Destinations + Recent Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4 text-cyan-500" />
              Top External Connections
            </CardTitle>
            <CardDescription>Most frequently contacted external servers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {topDestsSlice.map((dest, i) => (
                <div key={dest.domain} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                  <span className="text-xs font-mono text-muted-foreground w-5">{i + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{dest.domain}</span>
                      <Badge variant={dest.category === 'malicious' ? 'destructive' : dest.category === 'tracking' ? 'secondary' : 'outline'} className="text-[10px] px-1.5 py-0">
                        {dest.category}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{dest.ip} · {dest.country} · {dest.requests} requests</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-red-500" />
                  Recent Alerts
                </CardTitle>
                <CardDescription>Latest security notifications</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setActiveView('alerts' as DashboardView)}>
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentAlerts.map((alert, i) => (
                <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className={`mt-0.5 p-1.5 rounded-full ${
                    alert.severity === 'critical' ? 'bg-red-500/10' : alert.severity === 'high' ? 'bg-orange-500/10' : 'bg-yellow-500/10'
                  }`}>
                    <AlertTriangle className={`h-3 w-3 ${
                      alert.severity === 'critical' ? 'text-red-500' : alert.severity === 'high' ? 'text-orange-500' : 'text-yellow-500'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{alert.title}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{alert.sourceDevice || alert.destDomain || alert.sourceIp || ''} · {alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString() : ''}</div>
                  </div>
                  <Badge variant={severityColor(alert.severity) as "destructive" | "secondary" | "outline"} className="text-[10px]">
                    {alert.severity}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Info Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Capture Active</span>
              </div>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Uptime: {stats?.uptime || '—'}
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Zap className="h-3 w-3" />
                Avg Latency: {stats?.avgLatency || '—'}ms
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Privacy-safe: No payload data stored</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
