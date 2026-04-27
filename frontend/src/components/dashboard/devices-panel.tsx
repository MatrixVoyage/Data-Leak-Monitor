'use client';

import { useEffect, useCallback } from 'react';
import { useDashboardStore } from '@/store/dashboard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Search, Wifi, WifiOff, ShieldAlert, ExternalLink,
  Smartphone, Monitor, Tv, Camera, Speaker, Thermometer, Printer, HelpCircle,
} from 'lucide-react';
import { formatBytes } from '@/lib/format';
import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { API_BASE, authFetch } from '@/lib/api-config';

const deviceIconMap: Record<string, React.ReactNode> = {
  laptop: <Monitor className="h-5 w-5" />,
  phone: <Smartphone className="h-5 w-5" />,
  tablet: <Smartphone className="h-5 w-5" />,
  'smart-tv': <Tv className="h-5 w-5" />,
  camera: <Camera className="h-5 w-5" />,
  speaker: <Speaker className="h-5 w-5" />,
  thermostat: <Thermometer className="h-5 w-5" />,
  printer: <Printer className="h-5 w-5" />,
  unknown: <HelpCircle className="h-5 w-5" />,
  router: <Wifi className="h-5 w-5" />,
};

const riskColorMap = {
  low: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  medium: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  high: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  critical: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
};

const statusColorMap = {
  online: 'bg-emerald-500',
  offline: 'bg-gray-400',
  unknown: 'bg-amber-500',
};

export default function DevicesPanel() {
  const { devices, setDevices } = useDashboardStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'online' | 'offline' | 'suspicious'>('all');

  const fetchData = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/devices`);
      if (res.ok) setDevices(await res.json());
    } catch (e) { /* silent */ }
  }, [setDevices]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = devices.filter(d => {
    if (search && !(d.name || '').toLowerCase().includes(search.toLowerCase()) && !(d.ip || '').includes(search)) return false;
    if (filter === 'online' && d.status !== 'online') return false;
    if (filter === 'offline' && d.status !== 'offline') return false;
    if (filter === 'suspicious' && d.riskLevel === 'low') return false;
    return true;
  });

  const onlineDevices = devices.filter(d => d.status === 'online').length;
  const offlineDevices = devices.filter(d => d.status === 'offline').length;
  const suspiciousDevices = devices.filter(d => d.riskLevel !== 'low').length;

  const chartData = devices.map(d => ({
    name: d.name.length > 10 ? d.name.slice(0, 10) + '...' : d.name,
    sent: Math.round(d.totalBytesSent / 1024 / 1024),
    received: Math.round(d.totalBytesReceived / 1024 / 1024),
  })).sort((a, b) => (b.received + b.sent) - (a.received + a.sent));

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{devices.length}</div>
            <div className="text-xs text-muted-foreground">Total Devices</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-emerald-500">{onlineDevices}</div>
            <div className="text-xs text-muted-foreground">Online</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-gray-400">{offlineDevices}</div>
            <div className="text-xs text-muted-foreground">Offline</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-500">{suspiciousDevices}</div>
            <div className="text-xs text-muted-foreground">Suspicious</div>
          </CardContent>
        </Card>
      </div>

      {/* Traffic Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Device Traffic Usage (MB)</CardTitle>
          <CardDescription>Upload vs Download per device</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                <Bar dataKey="received" fill="#10b981" name="Received (MB)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="sent" fill="#f59e0b" name="Sent (MB)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Device Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Wifi className="h-4 w-4 text-emerald-500" />
                Connected Devices
              </CardTitle>
              <CardDescription>Map of IP → device name/type on your network</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search devices..." className="pl-9 w-[200px]" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="flex gap-1">
                {(['all', 'online', 'offline', 'suspicious'] as const).map(f => (
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
                  <TableHead className="w-[50px]">Status</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead className="hidden md:table-cell">MAC Address</TableHead>
                  <TableHead className="hidden lg:table-cell">Vendor</TableHead>
                  <TableHead>Traffic</TableHead>
                  <TableHead>Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((device) => (
                  <TableRow key={device.id} className="hover:bg-muted/50">
                    <TableCell>
                      <div className={`w-2.5 h-2.5 rounded-full ${statusColorMap[device.status]}`} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={device.riskLevel !== 'low' ? 'text-amber-500' : 'text-muted-foreground'}>
                          {deviceIconMap[device.type] || deviceIconMap.unknown}
                        </span>
                        <div>
                          <div className="font-medium text-sm">{device.name}</div>
                          <div className="text-xs text-muted-foreground md:hidden">{device.ip}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{device.ip}</TableCell>
                    <TableCell className="hidden md:table-cell font-mono text-xs text-muted-foreground">{device.mac}</TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{device.vendor}</TableCell>
                    <TableCell>
                      <div className="text-xs">
                        <span className="text-emerald-500">↓ {formatBytes(device.totalBytesReceived)}</span>
                        <span className="mx-1 text-muted-foreground">/</span>
                        <span className="text-amber-500">↑ {formatBytes(device.totalBytesSent)}</span>
                      </div>
                      {device.suspiciousConnections > 0 && (
                        <div className="text-[10px] text-red-500">{device.suspiciousConnections} suspicious connections</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] border ${riskColorMap[device.riskLevel]}`}>
                        {device.riskLevel}
                      </Badge>
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
