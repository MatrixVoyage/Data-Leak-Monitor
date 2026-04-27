"use client";

import React, { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Shield, Mail, Key, Moon, Sun, Laptop, Bot } from 'lucide-react';
import { useDashboardStore } from '@/store/dashboard';
import { Input } from '@/components/ui/input';

export default function SettingsPanel() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const { aiProvider, setAiProvider, aiApiKey, setAiApiKey } = useDashboardStore();
  
  // Local state for UI toggles
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [desktopNotifs, setDesktopNotifs] = useState(false);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">Manage your account and system preferences.</p>
      </div>

      <Tabs defaultValue="appearance" className="space-y-6">
        <TabsList className="bg-muted/50 border border-border">
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="agent">Agent & Alerts</TabsTrigger>
          <TabsTrigger value="ai">AI Assistant</TabsTrigger>
          <TabsTrigger value="privacy">Privacy & Compliance</TabsTrigger>
          <TabsTrigger value="support">Support</TabsTrigger>
        </TabsList>

        {/* --- APPEARANCE TAB --- */}
        <TabsContent value="appearance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Theme Preferences</CardTitle>
              <CardDescription>Select how you want the dashboard to look.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  variant={theme === 'light' ? 'default' : 'outline'} 
                  className="flex-1 justify-start gap-2" 
                  onClick={() => setTheme('light')}
                >
                  <Sun className="h-4 w-4" /> Light
                </Button>
                <Button 
                  variant={theme === 'dark' ? 'default' : 'outline'} 
                  className="flex-1 justify-start gap-2" 
                  onClick={() => setTheme('dark')}
                >
                  <Moon className="h-4 w-4" /> Dark
                </Button>
                <Button 
                  variant={theme === 'system' ? 'default' : 'outline'} 
                  className="flex-1 justify-start gap-2" 
                  onClick={() => setTheme('system')}
                >
                  <Laptop className="h-4 w-4" /> System
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- ACCOUNT TAB --- */}
        <TabsContent value="account" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Your personal account details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label>Email</Label>
                <div className="text-sm px-3 py-2 bg-muted/30 border border-border rounded-md font-mono">
                  {session?.user?.email || "Loading..."}
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Role</Label>
                <div className="text-sm px-3 py-2 bg-muted/30 border border-border rounded-md font-mono capitalize">
                  {(session?.user as any)?.role || "User"}
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t border-border pt-4">
              <Button variant="destructive" onClick={() => signOut()}>Sign Out</Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* --- AGENT & ALERTS TAB --- */}
        <TabsContent value="agent" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Local Agent Configuration</CardTitle>
              <CardDescription>Manage the connection to your local Python sniffer.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex gap-3">
                <Key className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-emerald-600 dark:text-emerald-400">Agent API Key</p>
                  <p className="text-muted-foreground mt-1">
                    Your Agent API key was displayed during registration. If you have lost it, you must generate a new one. This will disconnect any currently running agents.
                  </p>
                  <Button variant="outline" size="sm" className="mt-3">Regenerate Key (Coming Soon)</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>Choose how you want to be alerted about high-risk traffic.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email Alerts</Label>
                  <p className="text-sm text-muted-foreground">Receive a daily digest of critical alerts.</p>
                </div>
                <Switch checked={emailAlerts} onCheckedChange={setEmailAlerts} />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Desktop Notifications</Label>
                  <p className="text-sm text-muted-foreground">Show native browser popups for live threats.</p>
                </div>
                <Switch checked={desktopNotifs} onCheckedChange={setDesktopNotifs} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- AI ASSISTANT TAB --- */}
        <TabsContent value="ai" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-indigo-500" /> AI Assistant</CardTitle>
              <CardDescription>Configure the AI chat assistant to help analyze network events.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-2">
                <Label htmlFor="ai-provider">AI Provider</Label>
                <select 
                  id="ai-provider" 
                  value={aiProvider} 
                  onChange={(e) => setAiProvider(e.target.value as any)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="openai">OpenAI (ChatGPT)</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="claude">Anthropic Claude</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ai-apikey">API Key</Label>
                <Input 
                  id="ai-apikey" 
                  type="password" 
                  placeholder={`Enter your ${aiProvider} API Key`}
                  value={aiApiKey}
                  onChange={(e) => setAiApiKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Your API key is stored securely in your browser's local storage and is never sent to our servers.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- PRIVACY TAB --- */}
        <TabsContent value="privacy" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Privacy Controls</CardTitle>
              <CardDescription>Manage how your network data is processed and stored.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Strict Local-Only Mode</Label>
                  <p className="text-sm text-muted-foreground">Keep all data on-premise. Disable cloud syncing. (Requires local dashboard)</p>
                </div>
                <Switch checked={false} />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Disable External Enrichment</Label>
                  <p className="text-sm text-muted-foreground">Do not send IPs or Domains to 3rd-party APIs (e.g. GeoIP, IP-API).</p>
                </div>
                <Switch checked={false} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Data Retention Policy</CardTitle>
              <CardDescription>Automated data cleanup to comply with minimal data storage principles.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 text-sm text-muted-foreground">
                <p>• <strong>Raw Traffic Packets:</strong> Retained for 48 hours for immediate investigation, then permanently deleted.</p>
                <p>• <strong>Security Alerts & Anomalies:</strong> Retained for 30 days for compliance audits, then permanently deleted.</p>
                <p>• <strong>Device History:</strong> Anonymized after 90 days of inactivity.</p>
                <p>• <strong>Audit Logs:</strong> Admin actions are logged and retained indefinitely.</p>
              </div>
              <Button variant="outline" className="mt-2 text-red-500 hover:text-red-600 border-red-500/20 hover:bg-red-500/10">Purge All Data Now</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- SUPPORT TAB --- */}
        <TabsContent value="support" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Support & Feedback</CardTitle>
              <CardDescription>We're here to help keep your network safe.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 border border-border bg-muted/20 rounded-lg flex flex-col items-center justify-center text-center space-y-3 py-8">
                <div className="p-3 bg-violet-500/10 rounded-full border border-violet-500/20">
                  <Shield className="h-8 w-8 text-violet-500" />
                </div>
                <h3 className="font-medium">Need Assistance or Found a Bug?</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  If you are experiencing issues with the Data Leak Monitor system, or want to suggest a new feature, please reach out to us directly.
                </p>
                <Button className="mt-2" onClick={() => window.location.href = "mailto:netsentinalsupport@gmail.com"}>
                  <Mail className="mr-2 h-4 w-4" />
                  Email Support
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
