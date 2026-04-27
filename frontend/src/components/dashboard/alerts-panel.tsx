'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import { useDashboardStore } from '@/store/dashboard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle, ShieldAlert, CheckCircle2, Bell, Trash2,
  AlertOctagon, Info, XCircle, RefreshCcw, Clock,
} from 'lucide-react';
import type { Alert } from '@/lib/types';
import { API_BASE, authFetch } from '@/lib/api-config';

const severityConfig = {
  critical: { icon: AlertOctagon, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30', badge: 'destructive' as const, label: 'Critical' },
  high: { icon: ShieldAlert, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30', badge: 'destructive' as const, label: 'High Risk' },
  warning: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30', badge: 'secondary' as const, label: 'Warning' },
  info: { icon: Info, color: 'text-cyan-500', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', badge: 'outline' as const, label: 'Info' },
};

/** Convert raw rule-engine descriptions into plain English */
function humanize(title: string, desc: string): { title: string; summary: string } {
  const t = title.toLowerCase();
  const d = desc.toLowerCase();

  if (d.includes('tracking activity') || t.includes('tracking')) {
    const domain = desc.match(/\(([^)]+)\)/)?.[1] || 'a known tracker';
    return {
      title: '🔍 Tracker Detected',
      summary: `Your device contacted ${domain}, which is a known advertising or telemetry tracker. This means data about your browsing is being sent to a third-party.`,
    };
  }
  if (d.includes('unknown external connection') || t.includes('unusual destination')) {
    const domain = desc.match(/Unknown External Connection:\s*(\S+)/i)?.[1] || 'an unknown server';
    return {
      title: '🌐 New External Connection',
      summary: `Your device connected to ${domain} for the first time. This could be normal, but if you don't recognize it, it may indicate unwanted software.`,
    };
  }
  if (d.includes('unusual geo') || d.includes('geo destination')) {
    const country = desc.match(/connected to ([^(]+)/i)?.[1]?.trim() || 'an unusual country';
    return {
      title: '🗺️ Unusual Country Connection',
      summary: `Traffic was sent to a server located in ${country}. This is uncommon for your device type and may warrant investigation.`,
    };
  }
  if (d.includes('traffic spike') || t.includes('traffic spike')) {
    const mb = desc.match(/([\d.]+)MB transferred/)?.[1] || '?';
    return {
      title: '📈 Abnormal Data Transfer',
      summary: `A burst of ${mb} MB was transferred, which is significantly higher than your device's normal baseline. This could indicate a large download or possible data exfiltration.`,
    };
  }
  // Fallback
  return { title, summary: desc };
}

export default function AlertsPanel() {
  const { alerts, setAlerts } = useDashboardStore();
  const [filter, setFilter] = useState<'all' | 'unresolved' | 'resolved'>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/alerts`);
      if (res.ok) setAlerts((await res.json()).data);
    } catch (e) { /* silent */ }
  }, [setAlerts]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-poll every 10 seconds
  useEffect(() => {
    intervalRef.current = setInterval(fetchData, 10000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData]);

  const handleResolve = async (id: string) => {
    try {
      const res = await authFetch(`${API_BASE}/api/alerts/${id}/resolve`, { method: 'POST' });
      if (res.ok) fetchData();
    } catch (e) { /* silent */ }
  };

  const handleClearResolved = async () => {
    try {
      await authFetch(`${API_BASE}/api/alerts/clear`, { method: 'DELETE' });
      fetchData();
    } catch (e) { /* silent */ }
  };

  const handleClearAll = async () => {
    try {
      await authFetch(`${API_BASE}/api/alerts/clear-all`, { method: 'DELETE' });
      fetchData();
    } catch (e) { /* silent */ }
  };

  const filtered = alerts.filter(a => {
    if (filter === 'unresolved' && a.resolved) return false;
    if (filter === 'resolved' && !a.resolved) return false;
    if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
    return true;
  });

  const unresolved = alerts.filter(a => !a.resolved).length;
  const criticalCount = alerts.filter(a => a.severity === 'critical' && !a.resolved).length;
  const highCount = alerts.filter(a => a.severity === 'high' && !a.resolved).length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-red-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Bell className="h-4 w-4 text-red-500" />
              <span className="text-xs text-muted-foreground">Total Alerts</span>
            </div>
            <div className="text-2xl font-bold">{alerts.length}</div>
          </CardContent>
        </Card>
        <Card className="border-orange-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <span className="text-xs text-muted-foreground">Unresolved</span>
            </div>
            <div className="text-2xl font-bold text-orange-500">{unresolved}</div>
          </CardContent>
        </Card>
        <Card className="border-red-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertOctagon className="h-4 w-4 text-red-500" />
              <span className="text-xs text-muted-foreground">Critical</span>
            </div>
            <div className="text-2xl font-bold text-red-500">{criticalCount}</div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">High Severity</span>
            </div>
            <div className="text-2xl font-bold text-amber-500">{highCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Alert List */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-red-500" />
                Security Alerts
              </CardTitle>
              <CardDescription>Privacy and security notifications — auto-refreshes every 10s</CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex gap-1">
                {(['all', 'unresolved', 'resolved'] as const).map(f => (
                  <Button key={f} variant={filter === f ? 'default' : 'outline'} size="sm" onClick={() => setFilter(f)} className="text-xs capitalize">
                    {f}
                  </Button>
                ))}
              </div>
              <div className="flex gap-1">
                {(['all', 'critical', 'high', 'warning', 'info'] as const).map(s => (
                  <Button key={s} variant={severityFilter === s ? 'default' : 'outline'} size="sm" onClick={() => setSeverityFilter(s)} className="text-xs capitalize">
                    {s}
                  </Button>
                ))}
              </div>
              <div className="flex gap-1 border-l border-border pl-2 ml-1">
                <Button variant="outline" size="sm" className="text-xs gap-1" onClick={handleClearResolved}>
                  <Trash2 className="h-3 w-3" /> Clear Resolved
                </Button>
                <Button variant="destructive" size="sm" className="text-xs gap-1" onClick={handleClearAll}>
                  <XCircle className="h-3 w-3" /> Clear All
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <ShieldAlert className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No alerts to display</p>
              <p className="text-sm mt-1">Your network looks clean. Alerts will appear here automatically when detected.</p>
            </div>
          )}
          <div className="space-y-3">
            {filtered.map((alert) => {
              const config = severityConfig[alert.severity as keyof typeof severityConfig] || severityConfig.info;
              const Icon = config.icon;
              const { title: friendlyTitle, summary } = humanize(alert.title, alert.description);
              return (
                <div
                  key={alert.id}
                  className={`p-4 rounded-lg border ${config.border} ${config.bg} transition-all hover:shadow-sm flex items-start justify-between gap-4 ${
                    alert.resolved ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <Icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${config.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{friendlyTitle}</span>
                        <Badge variant={config.badge} className="text-[10px]">
                          {config.label}
                        </Badge>
                        {alert.resolved && (
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Resolved
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{summary}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                        {alert.sourceDevice && <span>Device: <strong>{alert.sourceDevice}</strong></span>}
                        {alert.destDomain && <span>Destination: <strong>{alert.destDomain}</strong></span>}
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(alert.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>
                  {!alert.resolved && (
                    <Button variant="outline" size="sm" onClick={() => handleResolve(alert.id)}>
                      Resolve
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
