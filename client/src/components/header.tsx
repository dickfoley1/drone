import { Button } from "@/components/ui/button";
import { TabType } from "@/pages/dashboard";

interface HeaderProps {
  title: string;
  subtitle: string;
  activeTab: TabType;
  onStartMission?: () => void;
  canStartMission?: boolean;
  isStartingMission?: boolean;
}

export default function Header({ title, subtitle, activeTab, onStartMission, canStartMission = false, isStartingMission = false }: HeaderProps) {
  const renderActions = () => {
    switch (activeTab) {
      case 'mission-planning':
        return (
          <div className="flex items-center space-x-3">
            <Button variant="outline" data-testid="button-import-mission">
              <i className="fas fa-upload mr-2"></i>Import Mission
            </Button>
            <Button 
              onClick={onStartMission}
              disabled={!canStartMission || isStartingMission}
              data-testid="button-start-mission"
            >
              <i className={`fas ${isStartingMission ? 'fa-spinner fa-spin' : 'fa-play'} mr-2`}></i>
              {isStartingMission ? 'Starting...' : 'Start Mission'}
            </Button>
          </div>
        );
      case 'thermal-analysis':
        return (
          <div className="flex items-center space-x-3">
            <Button variant="outline" data-testid="button-export-report">
              <i className="fas fa-file-pdf mr-2"></i>Export Report
            </Button>
            <Button data-testid="button-analyze-thermal">
              <i className="fas fa-search mr-2"></i>Analyze
            </Button>
          </div>
        );
      case 'flight-logs':
        return (
          <Button data-testid="button-new-mission">
            <i className="fas fa-plus mr-2"></i>New Mission
          </Button>
        );
      case 'tablet-companion':
        return (
          <Button data-testid="button-connect-tablet">
            <i className="fas fa-tablet-alt mr-2"></i>Connect Tablet
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-card border-b border-border p-4" data-testid="header">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold" data-testid="header-title">{title}</h2>
          <p className="text-sm text-muted-foreground" data-testid="header-subtitle">{subtitle}</p>
        </div>
        {renderActions()}
      </div>
    </div>
  );
}
