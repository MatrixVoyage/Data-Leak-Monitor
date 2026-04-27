'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import { useDashboardStore } from '@/store/dashboard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Brain, AlertTriangle, ShieldCheck, TrendingUp, ChevronRight,
  Zap, Target, BarChart3, Radar, Trash2, XCircle, Clock,
} from 'lucide-react';
import type { AnomalyEvent } from '@/lib/types';
import { API_BASE, authFetch } from '@/lib/api-config';

const typeLabels: Record<string, string> = {
  'traffic_spike': 'Traffic Spike',
  'new_device': 'New Device',
  'unusual_destination': 'Unusual Destination',
  'data_exfil': 'Data Exfiltration',
  'pattern_change': 'Pattern Change',
  'dns_tunneling': 'DNS Tunneling',
  'tracking': 'Tracking Activity',
  'anomaly': 'Anomaly',
};

const typeIcons: Record<string, React.ReactNode> = {
  'traffic_spike': <TrendingUp className="h-5 w-5" />,
  'new_device': <Target className="h-5 w-5" />,
  'unusual_destination': <BarChart3 className="h-5 w-5" />,
  'data_exfil': <AlertTriangle className="h-5 w-5" />,
  'pattern_change': <Zap className="h-5 w-5" />,
  'dns_tunneling': <Radar className="h-5 w-5" />,
  'tracking': <Target className="h-5 w-5" />,
  'anomaly': <Brain className="h-5 w-5" />,
};

const severityColorMap: Record<string, any> = {
  low: { text: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', progress: '#10b981' },
  medium: { text: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30', progress: '#f59e0b' },
  high: { text: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30', progress: '#f97316' },
  critical: { text: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30', progress: '#ef4444' },
};

/** Convert technical anomaly descriptions into plain language */
function humanizeAnomaly(desc: string, recommendation: string): { summary: string; advice: string } {
  const d = desc.toLowerCase();
  if (d.includes('tracking')) {
    return {
      summary: 'Advertising or telemetry tracking was detected on this device. Apps or websites are sending usage data to third-party analytics companies.',
      advice: 'Consider using a tracker blocker or browser privacy extension to prevent this.',
    };
  }
  if (d.includes('unknown external') || d.includes('first contact')) {
    return {
      summary: 'This device connected to a server it has never contacted before. This is flagged because it could indicate new malware phoning home.',
      advice: 'Check if you recently installed new software. If not, investigate the domain.',
    };
  }
  if (d.includes('unusual geo') || d.includes('geo destination')) {
    return {
      summary: 'Network traffic was routed to a server in an unexpected geographic region, which is unusual for your device type.',
      advice: 'If you are not using a VPN or accessing foreign services, this may require investigation.',
    };
  }
  if (d.includes('traffic spike') || d.includes('transferred')) {
    return {
      summary: 'An unusually large amount of data was transferred in a short period, significantly exceeding normal usage patterns for this device.',
      advice: 'Check for large downloads, cloud syncs, or video calls. If none apply, this could indicate data exfiltration.',
    };
  }
  return { summary: desc, advice: recommendation };
}

export default function AnomaliesPanel() {
  const { anomalies, setAnomalies } = useDashboardStore();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/anomalies`);
      if (res.ok) setAnomalies(await res.json());
    } catch (e) { /* silent */ }
  }, [setAnomalies]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-poll every 10 seconds
  useEffect(() => {
    intervalRef.current = setInterval(fetchData, 10000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData]);

  const handleClearAll = async () => {
    try {
      await authFetch(`${API_BASE}/api/anomalies/clear-all`, { method: 'DELETE' });
      fetchData();
    } catch (e) { /* silent */ }
  };

  const criticalCount = anomalies.filter(a => a.severity === 'critical').length;
  const highCount = anomalies.filter(a => a.severity === 'high').length;
  const avgConfidence = anomalies.length > 0
    ? Math.round(anomalies.reduce((sum, a) => sum + a.confidence, 0) / anomalies.length)
    : 0;

  return (
    <div className="space-y-6">
      {/* AI Header */}
      <Card className="border-violet-500/30 bg-gradient-to-r from-violet-500/5 to-cyan-500/5">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/20">
                <Brain className="h-6 w-6 text-violet-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">AI-Powered Anomaly Detection</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  The system learns baseline behavior patterns for each device and automatically flags significant deviations.
                  Anomalies appear here when your network activity is statistically unusual.
                </p>
                <div className="flex gap-4 mt-3 text-sm">
                  <div className="flex items-center gap-1.5 text-violet-600 dark:text-violet-400">
                    <ShieldCheck className="h-4 w-4" />
                    <span>Active Monitoring</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <BarChart3 className="h-4 w-4" />
                    <span>Avg Confidence: {avgConfidence}%</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Target className="h-4 w-4" />
                    <span>Model: Baseline + Statistical</span>
                  </div>
                </div>
              </div>
            </div>
            <Button variant="destructive" size="sm" className="text-xs gap-1 flex-shrink-0" onClick={handleClearAll}>
              <XCircle className="h-3 w-3" /> Clear All
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{anomalies.length}</div>
            <div className="text-xs text-muted-foreground">Total Anomalies</div>
          </CardContent>
        </Card>
        <Card className="border-red-500/30">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-500">{criticalCount}</div>
            <div className="text-xs text-muted-foreground">Critical</div>
          </CardContent>
        </Card>
        <Card className="border-orange-500/30">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-orange-500">{highCount}</div>
            <div className="text-xs text-muted-foreground">High Severity</div>
          </CardContent>
        </Card>
        <Card className="border-violet-500/30">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-violet-500">{avgConfidence}%</div>
            <div className="text-xs text-muted-foreground">Avg Confidence</div>
          </CardContent>
        </Card>
      </div>

      {/* Anomaly Detection Types */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {Object.entries(typeLabels).map(([key, label]) => {
          const count = anomalies.filter(a => a.type === key).length;
          return (
            <Card key={key} className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 text-center">
                <div className="flex justify-center mb-2 text-muted-foreground">
                  {typeIcons[key] || <Brain className="h-5 w-5" />}
                </div>
                <div className="text-lg font-bold">{count}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Empty state */}
      {anomalies.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Brain className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No anomalies detected yet</p>
            <p className="text-sm mt-1">The AI engine is monitoring your traffic. Anomalies will appear here automatically.</p>
          </CardContent>
        </Card>
      )}

      {/* Anomaly Cards */}
      <div className="space-y-4">
        {[...anomalies].sort((a, b) => {
          const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
          return (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3);
        }).map((anomaly) => {
          const colors = severityColorMap[anomaly.severity] || severityColorMap.low;
          const { summary, advice } = humanizeAnomaly(anomaly.description, anomaly.recommendation);
          return (
            <Card key={anomaly.id} className={`border ${colors.border}`}>
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className={`p-2.5 rounded-xl ${colors.bg} flex-shrink-0 ${colors.text}`}>
                    {typeIcons[anomaly.type] || <AlertTriangle className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge variant="outline" className="text-[10px] border">
                        {typeLabels[anomaly.type] || anomaly.type}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] border ${colors.bg} ${colors.text}`}>
                        {anomaly.severity}
                      </Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(anomaly.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm">{summary}</p>

                    <div className="mt-3 flex items-center gap-4 flex-wrap">
                      <div className="flex-1 min-w-[200px]">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-muted-foreground">AI Confidence</span>
                          <span className="text-xs font-medium">{anomaly.confidence}%</span>
                        </div>
                        <Progress value={anomaly.confidence} className="h-1.5" />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Device: <strong>{anomaly.affectedDevice}</strong>
                      </div>
                    </div>

                    {/* Recommendation */}
                    <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-violet-500/5 border border-violet-500/10">
                      <Brain className="h-4 w-4 text-violet-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-xs font-medium text-violet-600 dark:text-violet-400">What should I do?</div>
                        <div className="text-xs text-muted-foreground">{advice}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
