import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { useWebSocket } from "@/hooks/use-websocket";
import type { Mission } from "@shared/schema";

// Import Leaflet dynamically to avoid SSR issues
let L: any = null;
if (typeof window !== 'undefined') {
  import('leaflet').then((leaflet) => {
    L = leaflet.default;
  });
}

interface FlightParameters {
  altitude: number;
  speed: number;
  orbitRadius: number;
  cameraAngle: number;
}

interface MissionTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
}

const missionTemplates: MissionTemplate[] = [
  { id: 'orbit', name: 'Orbit', icon: 'fa-circle-notch', description: 'Circular flight pattern' },
  { id: 'grid', name: 'Grid', icon: 'fa-th', description: 'Systematic area coverage' },
  { id: 'waypoint', name: 'Waypoint', icon: 'fa-route', description: 'Custom flight path' },
  { id: 'search', name: 'Search', icon: 'fa-search', description: 'Search and rescue pattern' },
];

interface MissionPlanningProps {
  onMissionExecutionChange?: (canStart: boolean, isExecuting: boolean) => void;
  onStartMission?: () => void;
}

export default function MissionPlanning({ onMissionExecutionChange, onStartMission }: MissionPlanningProps = {}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const [currentCoordinates, setCurrentCoordinates] = useState({ lat: 40.7128, lng: -74.0060 });
  const [flightParameters, setFlightParameters] = useState<FlightParameters>({
    altitude: 120,
    speed: 8,
    orbitRadius: 50,
    cameraAngle: -30,
  });
  const [selectedTemplate, setSelectedTemplate] = useState<string>('orbit');
  const [mapLayers, setMapLayers] = useState({
    satellite: true,
    terrain: false,
    flightPath: true,
  });

  const queryClient = useQueryClient();
  const [isExecutingMission, setIsExecutingMission] = useState(false);
  const [missionProgress, setMissionProgress] = useState(0);
  const [currentTelemetry, setCurrentTelemetry] = useState<any>(null);

  // Fetch missions
  const { data: missions = [], isLoading: missionsLoading } = useQuery<Mission[]>({
    queryKey: ['/api/missions'],
  });

  // Get current mission - ensure missions is available before accessing
  const currentMission = missions && missions.length > 0 ? missions[0] : null;

  // WebSocket connection for real-time updates
  const { sendMessage } = useWebSocket('/ws', {
    onMessage: (data) => {
      console.log('WebSocket message received:', data);
      
      switch (data.type) {
        case 'mission-started':
          setIsExecutingMission(true);
          setMissionProgress(0);
          queryClient.invalidateQueries({ queryKey: ['/api/missions'] });
          break;
          
        case 'mission-progress':
          setMissionProgress(data.progress || 0);
          setCurrentTelemetry(data.telemetry);
          break;
          
        case 'mission-completed':
          setIsExecutingMission(false);
          setMissionProgress(100);
          queryClient.invalidateQueries({ queryKey: ['/api/missions'] });
          queryClient.invalidateQueries({ queryKey: ['/api/flight-logs'] });
          toast({
            title: "Mission Completed",
            description: `Mission completed successfully in ${Math.round(data.totalDuration / 60)} minutes.`,
          });
          break;
          
        case 'mission-failed':
          setIsExecutingMission(false);
          queryClient.invalidateQueries({ queryKey: ['/api/missions'] });
          toast({
            title: "Mission Failed",
            description: data.error || "Mission execution failed.",
            variant: "destructive",
          });
          break;
      }
    },
    onError: (error) => {
      console.error('WebSocket error:', error);
    },
  });

  // Start mission mutation
  const startMissionMutation = useMutation({
    mutationFn: async (missionId: string) => {
      const response = await apiRequest('POST', `/api/missions/${missionId}/start`, {});
      return response.json();
    },
    onSuccess: (data) => {
      setIsExecutingMission(true);
      toast({
        title: "Mission Started",
        description: `Mission "${data.mission.name}" has been started successfully.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Start Mission",
        description: error.message || "Unable to start the mission. Please check the mission status and try again.",
        variant: "destructive",
      });
    },
  });

  // Generate orbit mission mutation
  const generateOrbitMutation = useMutation({
    mutationFn: async (params: { center: { lat: number; lng: number }; radius: number; altitude: number; speed: number }) => {
      const response = await apiRequest('POST', '/api/missions/generate-orbit', params);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/missions'] });
      toast({
        title: "Orbit Mission Generated",
        description: "The orbit mission has been successfully created.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate orbit mission.",
        variant: "destructive",
      });
    },
  });

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || !L || mapInstance.current) return;

    const map = L.map(mapRef.current).setView([currentCoordinates.lat, currentCoordinates.lng], 15);
    
    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Add click handler to update coordinates
    map.on('click', (e: any) => {
      setCurrentCoordinates({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    // Add sample markers and flight path
    const startPoint = L.marker([currentCoordinates.lat, currentCoordinates.lng])
      .addTo(map)
      .bindPopup('Mission Start Point');

    // Sample waypoints for orbit mission
    const waypoints = generateOrbitWaypoints(currentCoordinates, flightParameters.orbitRadius);
    
    const flightPath = L.polyline(waypoints, {
      color: 'hsl(217, 91%, 40%)',
      weight: 3,
      opacity: 0.8
    }).addTo(map);

    waypoints.forEach((point, index) => {
      L.circleMarker(point, {
        color: 'hsl(217, 91%, 40%)',
        fillColor: 'hsl(217, 91%, 60%)',
        fillOpacity: 0.8,
        radius: 4
      }).addTo(map).bindPopup(`Waypoint ${index + 1}`);
    });

    mapInstance.current = map;

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  // Update coordinates display
  useEffect(() => {
    if (mapInstance.current) {
      mapInstance.current.panTo([currentCoordinates.lat, currentCoordinates.lng]);
    }
  }, [currentCoordinates]);

  // Communicate mission execution state to parent
  useEffect(() => {
    const canStartMission = currentMission?.status === 'ready' && !isExecutingMission;
    onMissionExecutionChange?.(canStartMission, isExecutingMission || startMissionMutation.isPending);
  }, [currentMission?.status, isExecutingMission, startMissionMutation.isPending, onMissionExecutionChange]);

  // Handle mission start from parent
  useEffect(() => {
    if (onStartMission) {
      window.missionPlanningStartMission = () => {
        if (currentMission && currentMission.status === 'ready') {
          startMissionMutation.mutate(currentMission.id);
        }
      };
    }
    
    return () => {
      delete window.missionPlanningStartMission;
    };
  }, [currentMission, startMissionMutation, onStartMission]);

  const generateOrbitWaypoints = (center: { lat: number; lng: number }, radius: number) => {
    const waypoints = [];
    const numWaypoints = 8;
    
    for (let i = 0; i < numWaypoints; i++) {
      const angle = (i / numWaypoints) * 2 * Math.PI;
      const lat = center.lat + (radius / 111000) * Math.cos(angle);
      const lng = center.lng + (radius / (111000 * Math.cos(center.lat * Math.PI / 180))) * Math.sin(angle);
      waypoints.push([lat, lng]);
    }
    
    return waypoints;
  };

  const handleGenerateOrbit = () => {
    generateOrbitMutation.mutate({
      center: currentCoordinates,
      radius: flightParameters.orbitRadius,
      altitude: flightParameters.altitude,
      speed: flightParameters.speed,
    });
  };

  const handleClearPath = () => {
    if (mapInstance.current) {
      mapInstance.current.eachLayer((layer: any) => {
        if (layer instanceof L.Polyline || layer instanceof L.CircleMarker) {
          mapInstance.current.removeLayer(layer);
        }
      });
    }
  };

  return (
    <div className="flex h-full" data-testid="mission-planning-container">
      {/* Map Area */}
      <div className="flex-1 relative">
        <div ref={mapRef} className="h-full w-full" data-testid="mission-map"></div>
        
        {/* Map Controls Overlay */}
        <div className="absolute top-4 right-4 space-y-2">
          <Card className="w-64">
            <CardContent className="p-3">
              <div className="flex items-center space-x-2 mb-2">
                <i className="fas fa-crosshairs text-muted-foreground"></i>
                <span className="text-sm font-medium">Coordinates</span>
              </div>
              <p className="text-xs text-muted-foreground" data-testid="current-coordinates">
                {currentCoordinates.lat.toFixed(4)}° N, {currentCoordinates.lng.toFixed(4)}° W
              </p>
            </CardContent>
          </Card>
          
          <Card className="w-64">
            <CardContent className="p-3">
              <div className="flex items-center space-x-2 mb-2">
                <i className="fas fa-layer-group text-muted-foreground"></i>
                <span className="text-sm font-medium">Layers</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    checked={mapLayers.satellite}
                    onCheckedChange={(checked) => setMapLayers(prev => ({ ...prev, satellite: !!checked }))}
                    data-testid="layer-satellite"
                  />
                  <Label className="text-xs">Satellite</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    checked={mapLayers.terrain}
                    onCheckedChange={(checked) => setMapLayers(prev => ({ ...prev, terrain: !!checked }))}
                    data-testid="layer-terrain"
                  />
                  <Label className="text-xs">Terrain</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    checked={mapLayers.flightPath}
                    onCheckedChange={(checked) => setMapLayers(prev => ({ ...prev, flightPath: !!checked }))}
                    data-testid="layer-flight-path"
                  />
                  <Label className="text-xs">Flight Path</Label>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Flight Parameters Panel */}
        <Card className="absolute bottom-4 left-4 w-80">
          <CardContent className="p-4">
            <h3 className="font-medium mb-3">Flight Parameters</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Altitude (m)</Label>
                <Input
                  type="number"
                  value={flightParameters.altitude}
                  onChange={(e) => setFlightParameters(prev => ({ ...prev, altitude: Number(e.target.value) }))}
                  className="mt-1"
                  data-testid="input-altitude"
                />
              </div>
              <div>
                <Label className="text-sm">Speed (m/s)</Label>
                <Input
                  type="number"
                  value={flightParameters.speed}
                  onChange={(e) => setFlightParameters(prev => ({ ...prev, speed: Number(e.target.value) }))}
                  className="mt-1"
                  data-testid="input-speed"
                />
              </div>
              <div>
                <Label className="text-sm">Orbit Radius (m)</Label>
                <Input
                  type="number"
                  value={flightParameters.orbitRadius}
                  onChange={(e) => setFlightParameters(prev => ({ ...prev, orbitRadius: Number(e.target.value) }))}
                  className="mt-1"
                  data-testid="input-orbit-radius"
                />
              </div>
              <div>
                <Label className="text-sm">Camera Angle</Label>
                <Input
                  type="number"
                  value={flightParameters.cameraAngle}
                  onChange={(e) => setFlightParameters(prev => ({ ...prev, cameraAngle: Number(e.target.value) }))}
                  className="mt-1"
                  data-testid="input-camera-angle"
                />
              </div>
            </div>
            <div className="mt-4 flex space-x-2">
              <Button 
                onClick={handleGenerateOrbit}
                disabled={generateOrbitMutation.isPending}
                className="flex-1"
                data-testid="button-generate-orbit"
              >
                {generateOrbitMutation.isPending ? 'Generating...' : 'Generate Orbit'}
              </Button>
              <Button variant="outline" onClick={handleClearPath} data-testid="button-clear-path">
                Clear Path
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Mission Control Panel */}
      <div className="w-80 bg-card border-l border-border" data-testid="mission-control-panel">
        <div className="p-4 border-b border-border">
          <h3 className="font-medium">Mission Control</h3>
        </div>
        
        <div className="p-4 space-y-6 overflow-y-auto custom-scrollbar h-full">
          {/* Mission Templates */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Mission Templates</Label>
            <div className="grid grid-cols-2 gap-2">
              {missionTemplates.map((template) => (
                <Button
                  key={template.id}
                  variant={selectedTemplate === template.id ? "default" : "outline"}
                  className="p-3 h-auto text-center flex flex-col space-y-1"
                  onClick={() => setSelectedTemplate(template.id)}
                  data-testid={`template-${template.id}`}
                >
                  <i className={`fas ${template.icon} text-lg`}></i>
                  <span className="text-xs">{template.name}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Current Mission */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Current Mission</Label>
            {currentMission ? (
              <Card className="bg-muted">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium" data-testid="current-mission-name">
                      {currentMission.name}
                    </span>
                    <Badge 
                      variant={
                        currentMission.status === 'ready' ? 'default' : 
                        currentMission.status === 'executing' ? 'secondary' :
                        currentMission.status === 'completed' ? 'outline' : 'destructive'
                      }
                      data-testid="current-mission-status"
                    >
                      {currentMission.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div className="flex justify-between">
                      <span>Waypoints:</span>
                      <span data-testid="mission-waypoints">{currentMission.waypoints?.length || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Est. Duration:</span>
                      <span data-testid="mission-duration">
                        {currentMission.estimatedDuration 
                          ? `${Math.round(currentMission.estimatedDuration / 60)} min`
                          : 'N/A'
                        }
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Distance:</span>
                      <span data-testid="mission-distance">
                        {currentMission.totalDistance 
                          ? `${(currentMission.totalDistance / 1000).toFixed(1)} km`
                          : 'N/A'
                        }
                      </span>
                    </div>
                  </div>
                  
                  {/* Mission Progress */}
                  {isExecutingMission && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="flex justify-between text-xs mb-1">
                        <span>Progress</span>
                        <span data-testid="mission-progress-percent">{missionProgress.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div 
                          className="bg-primary h-2 rounded-full transition-all duration-500" 
                          style={{ width: `${missionProgress}%` }}
                          data-testid="mission-progress-bar"
                        ></div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-muted">
                <CardContent className="p-3">
                  <p className="text-sm text-muted-foreground">No active mission</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Live Telemetry */}
          {isExecutingMission && currentTelemetry && (
            <div>
              <Label className="text-sm font-medium mb-3 block">Live Telemetry</Label>
              <Card className="bg-muted">
                <CardContent className="p-3">
                  <div className="text-xs space-y-2">
                    <div className="flex justify-between">
                      <span>Altitude:</span>
                      <span data-testid="telemetry-altitude">{currentTelemetry.altitude.toFixed(1)}m</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Speed:</span>
                      <span data-testid="telemetry-speed">{currentTelemetry.speed.toFixed(1)} m/s</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Battery:</span>
                      <span 
                        className={currentTelemetry.batteryLevel < 30 ? 'text-destructive' : 'text-foreground'}
                        data-testid="telemetry-battery"
                      >
                        {currentTelemetry.batteryLevel.toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Temperature:</span>
                      <span data-testid="telemetry-temperature">{currentTelemetry.temperature.toFixed(1)}°C</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Position:</span>
                      <span className="text-right text-xs" data-testid="telemetry-position">
                        {currentTelemetry.lat.toFixed(4)}, {currentTelemetry.lng.toFixed(4)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Pre-flight Checklist */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Pre-flight Checklist</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox defaultChecked data-testid="checklist-battery" />
                <Label className="text-sm">Battery Level {'>'} 80%</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox defaultChecked data-testid="checklist-gps" />
                <Label className="text-sm">GPS Signal Strong</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox defaultChecked data-testid="checklist-weather" />
                <Label className="text-sm">Weather Conditions Clear</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox data-testid="checklist-nofly" />
                <Label className="text-sm">No-Fly Zone Check</Label>
              </div>
            </div>
          </div>

          {/* Export Options */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Export Mission</Label>
            <div className="space-y-2">
              <Button variant="outline" className="w-full" data-testid="export-litchi">
                <i className="fas fa-download mr-2"></i>Smart Controller V2 (.litchi)
              </Button>
              <Button variant="outline" className="w-full" data-testid="export-kml">
                <i className="fas fa-file-export mr-2"></i>KML/KMZ Format
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
