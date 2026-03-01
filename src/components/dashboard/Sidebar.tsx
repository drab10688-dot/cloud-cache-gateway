import {
  Activity,
  ShieldCheck,
  Database,
  Shield,
  Cloud,
  LayoutDashboard,
  Terminal,
  HeartPulse,
  Box,
  Globe,
  Zap,
  Router,
} from "lucide-react";
import type { Section } from "@/pages/Index";
import logoImg from "@/assets/logo.png";

const navItems: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Dashboard", icon: LayoutDashboard },
  { id: "docker", label: "Contenedores", icon: Box },
  { id: "dnsconfig", label: "Config DNS", icon: Globe },
  { id: "mikrotik", label: "MikroTik", icon: Router },
  { id: "network", label: "QUIC / Video", icon: Zap },
  { id: "ping", label: "Monitor Ping", icon: Activity },
  { id: "dns", label: "DNS / Bloqueo", icon: ShieldCheck },
  { id: "cache", label: "Caché CDN", icon: Database },
  { id: "adguard", label: "AdGuard + Unbound", icon: Shield },
  { id: "cloudflare", label: "Cloudflare Tunnel", icon: Cloud },
  { id: "kuma", label: "Uptime Kuma", icon: HeartPulse },
  { id: "installer", label: "Instalador", icon: Terminal },
];

interface SidebarProps {
  active: Section;
  onNavigate: (s: Section) => void;
}

export function Sidebar({ active, onNavigate }: SidebarProps) {
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col z-50">
      <div className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-full overflow-hidden ring-2 ring-sidebar-primary/60 shadow-[0_0_12px_hsl(175_80%_45%/0.4)]">
            <img src={logoImg} alt="NetAdmin Logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight">NetAdmin</h1>
            <p className="text-xs text-sidebar-foreground font-mono">Ubuntu Server v3.0</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="status-dot-online" />
          <span className="text-xs text-sidebar-foreground font-mono">Sistema activo</span>
        </div>
      </div>
    </aside>
  );
}
