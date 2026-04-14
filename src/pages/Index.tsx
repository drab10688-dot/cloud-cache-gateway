import { useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { StatusOverview } from "@/components/dashboard/StatusOverview";
import { PingMonitor } from "@/components/dashboard/PingMonitor";
import { DnsBlocklist } from "@/components/dashboard/DnsBlocklist";

import { AdGuardPanel } from "@/components/dashboard/AdGuardPanel";
import { CloudflarePanel } from "@/components/dashboard/CloudflarePanel";
import { InstallerPanel } from "@/components/dashboard/InstallerPanel";
import { UptimeKumaPanel } from "@/components/dashboard/UptimeKumaPanel";
import { DockerPanel } from "@/components/dashboard/DockerPanel";
import { DnsConfigPanel } from "@/components/dashboard/DnsConfigPanel";
import { NetworkPerformancePanel } from "@/components/dashboard/NetworkPerformancePanel";
import { MikroTikPanel } from "@/components/dashboard/MikroTikPanel";
import { SettingsPanel } from "@/components/dashboard/SettingsPanel";
import { SpeedTestPanel } from "@/components/dashboard/SpeedTestPanel";
import { ServerMonitorPanel } from "@/components/dashboard/ServerMonitorPanel";
import { LoginScreen } from "@/components/dashboard/LoginScreen";
import { isAuthenticated } from "@/lib/api";

export type Section = "overview" | "ping" | "dns" | "adguard" | "cloudflare" | "kuma" | "installer" | "docker" | "dnsconfig" | "network" | "mikrotik" | "speedtest" | "monitor" | "settings";

const Index = () => {
  const [loggedIn, setLoggedIn] = useState(isAuthenticated());
  const [activeSection, setActiveSection] = useState<Section>("overview");

  if (!loggedIn) {
    return <LoginScreen onLogin={() => setLoggedIn(true)} />;
  }

  const renderSection = () => {
    switch (activeSection) {
      case "overview": return <StatusOverview />;
      case "docker": return <DockerPanel />;
      case "dnsconfig": return <DnsConfigPanel />;
      case "mikrotik": return <MikroTikPanel />;
      case "network": return <NetworkPerformancePanel />;
      case "ping": return <PingMonitor />;
      case "dns": return <DnsBlocklist />;
      
      case "adguard": return <AdGuardPanel />;
      case "cloudflare": return <CloudflarePanel />;
      case "kuma": return <UptimeKumaPanel />;
      case "installer": return <InstallerPanel />;
      case "speedtest": return <SpeedTestPanel />;
      case "monitor": return <ServerMonitorPanel />;
      case "settings": return <SettingsPanel />;
    }
  };

  return (
    <div className="flex min-h-screen bg-background grid-pattern">
      <Sidebar active={activeSection} onNavigate={setActiveSection} />
      <main className="flex-1 p-6 ml-64 animate-slide-in" key={activeSection}>
        {renderSection()}
      </main>
    </div>
  );
};

export default Index;
