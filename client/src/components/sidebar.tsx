import { cn } from "@/lib/utils";
import { TabType } from "@/pages/dashboard";

interface SidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const navigationItems = [
  {
    id: 'mission-planning' as TabType,
    label: 'Mission Planning',
    icon: 'fa-map-marked-alt',
  },
  {
    id: 'thermal-analysis' as TabType,
    label: 'Thermal Analysis',
    icon: 'fa-thermometer-half',
  },
  {
    id: 'flight-logs' as TabType,
    label: 'Flight Logs',
    icon: 'fa-clipboard-list',
  },
  {
    id: 'orthomosaic-generator' as TabType,
    label: 'Orthomosaic Generator',
    icon: 'fa-image',
  },
  {
    id: 'tablet-companion' as TabType,
    label: 'Tablet Companion',
    icon: 'fa-tablet-alt',
  },
  {
    id: 'settings' as TabType,
    label: 'Settings',
    icon: 'fa-cog',
  },
];

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  return (
    <div className="w-64 bg-card border-r border-border flex flex-col" data-testid="sidebar">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <i className="fas fa-helicopter text-primary-foreground text-sm"></i>
          </div>
          <div>
            <h1 className="text-lg font-semibold" data-testid="logo-title">DroneVision Pro</h1>
            <p className="text-xs text-muted-foreground">Enterprise Edition</p>
          </div>
        </div>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 p-4">
        <div className="space-y-2">
          {navigationItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                "flex items-center space-x-3 px-3 py-2 rounded-md font-medium w-full text-left transition-colors",
                activeTab === item.id 
                  ? "bg-primary/10 text-primary" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
              data-testid={`nav-${item.id}`}
            >
              <i className={`fas ${item.icon} w-4`}></i>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Device Status */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center space-x-3 text-sm" data-testid="device-status-controller">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse-dot"></div>
          <span className="text-muted-foreground">Smart Controller V2</span>
        </div>
        <div className="flex items-center space-x-3 text-sm mt-1" data-testid="device-status-drone">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse-dot"></div>
          <span className="text-muted-foreground">Autel EVO Lite 640T</span>
        </div>
      </div>
    </div>
  );
}
