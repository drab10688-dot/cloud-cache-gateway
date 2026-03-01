import { useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { StatusOverview } from "@/components/dashboard/StatusOverview";
import { PingMonitor } from "@/components/dashboard/PingMonitor";
import { DnsBlocklist } from "@/components/dashboard/DnsBlocklist";
import { CacheStats } from "@/components/dashboard/CacheStats";
import { AdGuardPanel } from "@/components/dashboard/AdGuardPanel";
import { CloudflarePanel } from "@/components/dashboard/CloudflarePanel";
import { InstallerPanel } from "@/components/dashboard/InstallerPanel";

export type Section = "overview" | "ping" | "dns" | "cache" | "adguard" | "cloudflare" | "installer";

const Index = () => {
  const [activeSection, setActiveSection] = useState<Section>("overview");

  const renderSection = () => {
    switch (activeSection) {
      case "overview": return <StatusOverview />;
      case "ping": return <PingMonitor />;
      case "dns": return <DnsBlocklist />;
      case "cache": return <CacheStats />;
      case "adguard": return <AdGuardPanel />;
      case "cloudflare": return <CloudflarePanel />;
      case "installer": return <InstallerPanel onNavigate={setActiveSection} />;
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
