import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useWebSocket } from "@/hooks/use-websocket";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import type { ConnectedDevice } from "@shared/schema";

interface TelemetryData {
  altitude: number;
  speed: number;
  batteryLevel: number;
  gpsSignal: number;
  missionProgress: number;
  status: string;
  coordinates: { lat: number; lng: number };
}

interface DisplaySettings {
  showTelemetry: boolean;
  showProgress: boolean;
  showThermalPreview: boolean;
  showBatteryStatus: boolean;
}

export default function TabletCompanion() {
  const [telemetryData, setTelemetryData] = useState<TelemetryData>({
    altitude: 120.5,
    speed: 8.2,
    batteryLevel: 87,
    gpsSignal: 18,
    missionProgress: 45,
    status: 'ARMED',
    coordinates: { lat: 40.7128, lng: -74.0060 },
  });

  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>({
    showTelemetry: true,
    showProgress: true,
    showThermalPreview: false,
    showBatteryStatus: true,
  });

  const queryClient = useQueryClient();

  // WebSocket connection for real-time telemetry
  const { isConnected, sendMessage } = useWebSocket('/ws', {
    onMessage: (data) => {
      if (data.type === 'telemetry-data') {
        setTelemetryData(data.data);
      }
    },
  });

  // Fetch connected devices
  const { data: devices = [], isLoading: devicesLoading } = useQuery<ConnectedDevice[]>({
    queryKey: ['/api/devices'],
  });

  // Connect device mutation
  const connectDeviceMutation = useMutation({
    mutationFn: async (deviceInfo: { name: string; ip: string; type: string }) => {
      const response = await apiRequest('POST', '/api/devices', {
        deviceName: deviceInfo.name,
        deviceType: deviceInfo.type,
        ipAddress: deviceInfo.ip,
        isActive: true,
        displaySettings,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/devices'] });
      toast({
        title: "Device Connected",
        description: "Tablet companion has been successfully connected.",
      });
    },
    onError: () => {
      toast({
        title: "Connection Failed",
        description: "Failed to connect tablet device.",
        variant: "destructive",
      });
    },
  });

  // Request telemetry data on component mount
  useEffect(() => {
    if (isConnected) {
      sendMessage({ type: 'telemetry-request' });
    }
  }, [isConnected, sendMessage]);

  const handleConnectTablet = () => {
    // Simulate tablet connection
    connectDeviceMutation.mutate({
      name: 'Samsung Galaxy Tab S8',
      ip: '192.168.1.105',
      type: 'tablet',
    });
  };

  const handleDisplaySettingChange = (setting: keyof DisplaySettings, value: boolean) => {
    setDisplaySettings(prev => ({ ...prev, [setting]: value }));
  };

  const getDeviceStatusBadge = (device: ConnectedDevice) => {
    if (device.isActive) {
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Active</Badge>;
    } else {
      return <Badge variant="secondary">Offline</Badge>;
    }
  };

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType) {
      case 'tablet':
        return 'fa-tablet-alt';
      case 'phone':
        return 'fa-mobile-alt';
      default:
        return 'fa-device';
    }
  };

  return (
    <div className="p-6 space-y-6" data-testid="tablet-companion-container">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold">Tablet Companion</h3>
          <p className="text-muted-foreground">Configure your Android tablet as a secondary display</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="text-sm" data-testid="connection-status">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tablet Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Tablet Display Preview</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Tablet Frame Mockup */}
            <div className="bg-gray-900 p-4 rounded-xl max-w-md mx-auto">
              <div className="bg-gray-100 rounded-lg overflow-hidden aspect-[4/3]">
                {/* Mock tablet display showing flight telemetry */}
                <div className="h-full tablet-preview text-white p-4 relative">
                  {/* Flight Status Header */}
                  <div className="flex justify-between items-center mb-4">
                    <div className="text-sm">
                      <div className="font-semibold" data-testid="tablet-mission-name">
                        Mission: Thermal Survey #24
                      </div>
                      <div className="text-blue-300">EVO Lite 640T</div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-semibold text-green-400" data-testid="tablet-status">
                        {telemetryData.status}
                      </div>
                      <div className="text-blue-300" data-testid="tablet-gps">
                        GPS: {telemetryData.gpsSignal} sats
                      </div>
                    </div>
                  </div>
                  
                  {/* Telemetry Grid */}
                  <div className="telemetry-grid text-xs">
                    {displaySettings.showTelemetry && (
                      <>
                        <div className="telemetry-card">
                          <div className="text-blue-300">Altitude</div>
                          <div className="text-lg font-mono" data-testid="tablet-altitude">
                            {telemetryData.altitude}m
                          </div>
                        </div>
                        <div className="telemetry-card">
                          <div className="text-blue-300">Speed</div>
                          <div className="text-lg font-mono" data-testid="tablet-speed">
                            {telemetryData.speed} m/s
                          </div>
                        </div>
                      </>
                    )}
                    
                    {displaySettings.showBatteryStatus && (
                      <div className="telemetry-card">
                        <div className="text-blue-300">Battery</div>
                        <div className="text-lg font-mono text-green-400" data-testid="tablet-battery">
                          {telemetryData.batteryLevel}%
                        </div>
                      </div>
                    )}
                    
                    <div className="telemetry-card">
                      <div className="text-blue-300">Distance</div>
                      <div className="text-lg font-mono">1.2km</div>
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  {displaySettings.showProgress && (
                    <div className="mt-4">
                      <div className="flex justify-between text-xs mb-1">
                        <span>Mission Progress</span>
                        <span data-testid="tablet-progress">{telemetryData.missionProgress}%</span>
                      </div>
                      <Progress value={telemetryData.missionProgress} className="h-2" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Connection Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Connection Setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* QR Code for App */}
            <div className="text-center p-4 border border-border rounded-lg">
              <div className="w-32 h-32 bg-gray-200 mx-auto mb-3 flex items-center justify-center text-gray-500 rounded">
                <i className="fas fa-qrcode text-4xl"></i>
              </div>
              <p className="text-sm">Scan QR code to install companion app</p>
            </div>
            
            {/* Network Settings */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Network Connection</Label>
              <Card className="bg-muted border-none">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <i className="fas fa-wifi text-green-500"></i>
                      <div>
                        <div className="font-medium text-sm">DroneVision-Network</div>
                        <div className="text-xs text-muted-foreground">192.168.1.100</div>
                      </div>
                    </div>
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                      Connected
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* Display Options */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Display Options</Label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={displaySettings.showTelemetry}
                    onCheckedChange={(checked) => handleDisplaySettingChange('showTelemetry', !!checked)}
                    data-testid="setting-telemetry"
                  />
                  <Label className="text-sm">Real-time telemetry</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={displaySettings.showProgress}
                    onCheckedChange={(checked) => handleDisplaySettingChange('showProgress', !!checked)}
                    data-testid="setting-progress"
                  />
                  <Label className="text-sm">Mission progress</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={displaySettings.showThermalPreview}
                    onCheckedChange={(checked) => handleDisplaySettingChange('showThermalPreview', !!checked)}
                    data-testid="setting-thermal"
                  />
                  <Label className="text-sm">Thermal preview</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={displaySettings.showBatteryStatus}
                    onCheckedChange={(checked) => handleDisplaySettingChange('showBatteryStatus', !!checked)}
                    data-testid="setting-battery"
                  />
                  <Label className="text-sm">Battery status</Label>
                </div>
              </div>
            </div>

            <Button 
              onClick={handleConnectTablet}
              disabled={connectDeviceMutation.isPending}
              className="w-full"
              data-testid="button-connect-device"
            >
              {connectDeviceMutation.isPending ? 'Connecting...' : 'Connect Tablet'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Connected Devices */}
      <Card>
        <CardHeader>
          <CardTitle>Connected Devices</CardTitle>
        </CardHeader>
        <CardContent>
          {devicesLoading ? (
            <div className="flex items-center justify-center py-8">
              <i className="fas fa-spinner animate-spin mr-2"></i>
              Loading devices...
            </div>
          ) : devices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No devices connected
            </div>
          ) : (
            <div className="space-y-3">
              {devices.map((device) => (
                <Card key={device.id} className="bg-muted border-none">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <i className={`fas ${getDeviceIcon(device.deviceType)} text-xl text-primary`}></i>
                        <div>
                          <div className="font-medium" data-testid={`device-name-${device.id}`}>
                            {device.deviceName}
                          </div>
                          <div className="text-sm text-muted-foreground" data-testid={`device-details-${device.id}`}>
                            {device.deviceType} • {device.ipAddress}
                            {!device.isActive && device.lastSeen && (
                              <span> • Last seen {new Date(device.lastSeen).toLocaleString()}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {getDeviceStatusBadge(device)}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          data-testid={`device-settings-${device.id}`}
                        >
                          <i className="fas fa-cog text-muted-foreground"></i>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
