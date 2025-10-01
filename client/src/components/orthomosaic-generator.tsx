import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import type { Mission, Orthomosaic, ThermalImage, FlightLog } from "@shared/schema";

interface OrthomosaicGeneratorProps {
  missionId?: string;
}

interface ProcessingParams {
  overlapThreshold: number;
  blendingMode: 'feather' | 'multiband' | 'linear';
  enhanceMode: 'none' | 'contrast' | 'sharpness' | 'ai_enhance';
  compressionLevel: number;
  outputFormat: 'tiff' | 'jpeg' | 'png';
  targetResolution: number;
}

export default function OrthomosaicGenerator({ missionId }: OrthomosaicGeneratorProps) {
  const [selectedMission, setSelectedMission] = useState<string>(missionId || '');
  const [processingParams, setProcessingParams] = useState<ProcessingParams>({
    overlapThreshold: 0.3,
    blendingMode: 'feather',
    enhanceMode: 'ai_enhance',
    compressionLevel: 7,
    outputFormat: 'tiff',
    targetResolution: 0.05,
  });
  const [estimatedTime, setEstimatedTime] = useState<number>(0);
  const [activeOrthomosaic, setActiveOrthomosaic] = useState<Orthomosaic | null>(null);

  const queryClient = useQueryClient();

  // Fetch missions
  const { data: missions = [], isLoading: missionsLoading } = useQuery<Mission[]>({
    queryKey: ['/api/missions'],
  });

  // Fetch orthomosaics
  const { data: orthomosaics = [], isLoading: orthomosaicsLoading } = useQuery<Orthomosaic[]>({
    queryKey: ['/api/orthomosaics'],
  });

  // Fetch mission-specific orthomosaics if mission is selected
  const { data: missionOrthomosaics = [] } = useQuery<Orthomosaic[]>({
    queryKey: ['/api/missions', selectedMission, 'orthomosaics'],
    enabled: !!selectedMission,
  });

  // Fetch flight logs for selected mission
  const { data: missionFlightLogs = [] } = useQuery<FlightLog[]>({
    queryKey: ['/api/missions', selectedMission, 'flight-logs'],
    enabled: !!selectedMission,
  });

  // Fetch all thermal images
  const { data: allThermalImages = [] } = useQuery<ThermalImage[]>({
    queryKey: ['/api/thermal-images'],
  });

  // Get thermal images for selected mission via flightLogId -> missionId relationship
  const missionThermalImages = selectedMission 
    ? allThermalImages.filter(image => 
        missionFlightLogs.some(flightLog => flightLog.id === image.flightLogId)
      )
    : [];

  // Generate orthomosaic mutation
  const generateOrthomosaicMutation = useMutation({
    mutationFn: async (params: any) => {
      const response = await apiRequest('POST', '/api/orthomosaics/generate', params);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/orthomosaics'] });
      setActiveOrthomosaic(data);
      toast({
        title: "Orthomosaic Generation Started",
        description: "Your orthomosaic is being processed. You'll receive updates on progress.",
      });
    },
    onError: () => {
      toast({
        title: "Generation Failed",
        description: "Failed to start orthomosaic generation. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Calculate estimated processing time
  useEffect(() => {
    if (selectedMission && missionThermalImages.length > 0) {
      const imageCount = missionThermalImages.length;
      const baseTime = 30;
      const imageTime = imageCount * 5;
      const enhancementTime = processingParams.enhanceMode !== 'none' ? imageCount * 10 : 0;
      const blendingTime = processingParams.blendingMode === 'multiband' ? imageCount * 3 : imageCount;
      
      setEstimatedTime(baseTime + imageTime + enhancementTime + blendingTime);
    } else {
      setEstimatedTime(0);
    }
  }, [selectedMission, missionThermalImages, processingParams]);

  // WebSocket for real-time updates
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws: WebSocket;
    
    try {
      ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'orthomosaic-update') {
            queryClient.invalidateQueries({ queryKey: ['/api/orthomosaics'] });
            if (data.data.id === activeOrthomosaic?.id) {
              setActiveOrthomosaic(data.data);
            }
          }
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = () => {
        console.log('WebSocket connection closed');
      };
    } catch (error) {
      console.error('WebSocket connection failed:', error);
    }

    return () => {
      if (ws && ws.readyState !== WebSocket.CLOSED) {
        ws.close();
      }
    };
  }, [queryClient, activeOrthomosaic?.id]);

  const handleGenerateOrthomosaic = () => {
    if (!selectedMission) {
      toast({
        title: "No Mission Selected",
        description: "Please select a mission to generate orthomosaic from.",
        variant: "destructive",
      });
      return;
    }

    const mission = missions.find(m => m.id === selectedMission);
    if (!mission) return;

    if (missionThermalImages.length < 2) {
      toast({
        title: "Insufficient Images",
        description: "At least 2 images are required for orthomosaic generation.",
        variant: "destructive",
      });
      return;
    }

    // Calculate bounds from mission waypoints
    const bounds = {
      north: Math.max(...mission.waypoints.map(w => w.lat)),
      south: Math.min(...mission.waypoints.map(w => w.lat)),
      east: Math.max(...mission.waypoints.map(w => w.lng)),
      west: Math.min(...mission.waypoints.map(w => w.lng)),
    };

    generateOrthomosaicMutation.mutate({
      missionId: selectedMission,
      name: `${mission.name} Orthomosaic`,
      description: `AI-generated orthomosaic from ${mission.name} mission`,
      imageType: 'thermal',
      metadata: {
        width: 8192,
        height: 6144,
        resolution: processingParams.targetResolution,
        bounds,
        coordinate_system: 'EPSG:4326',
        sourceImageCount: missionThermalImages.length,
        processingParams,
      },
    });
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      processing: 'default',
      completed: 'success',
      failed: 'destructive',
    } as const;
    
    return (
      <Badge variant={variants[status as keyof typeof variants] || 'secondary'}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const formatFileSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6" data-testid="orthomosaic-generator">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Orthomosaic Generator</h2>
          <p className="text-muted-foreground">
            Create high-resolution composite imagery using AI-powered image stitching
          </p>
        </div>
        <Button 
          onClick={handleGenerateOrthomosaic}
          disabled={!selectedMission || generateOrthomosaicMutation.isPending}
          data-testid="button-generate-orthomosaic"
        >
          {generateOrthomosaicMutation.isPending ? (
            <>
              <i className="fas fa-spinner fa-spin mr-2"></i>
              Generating...
            </>
          ) : (
            <>
              <i className="fas fa-magic mr-2"></i>
              Generate Orthomosaic
            </>
          )}
        </Button>
      </div>

      <Tabs defaultValue="generate" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="generate" data-testid="tab-generate">Generate</TabsTrigger>
          <TabsTrigger value="processing" data-testid="tab-processing">Processing</TabsTrigger>
          <TabsTrigger value="results" data-testid="tab-results">Results</TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <i className="fas fa-cog mr-2"></i>
                  Mission & Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="mission-select">Select Mission</Label>
                  <Select 
                    value={selectedMission} 
                    onValueChange={setSelectedMission}
                    data-testid="select-mission"
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a mission..." />
                    </SelectTrigger>
                    <SelectContent>
                      {missions.map((mission) => (
                        <SelectItem key={mission.id} value={mission.id}>
                          {mission.name} ({mission.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Image Type</Label>
                  <Select value="thermal" disabled data-testid="select-image-type">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="thermal">Thermal</SelectItem>
                      <SelectItem value="rgb">RGB</SelectItem>
                      <SelectItem value="multispectral">Multispectral</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Output Format</Label>
                  <Select 
                    value={processingParams.outputFormat} 
                    onValueChange={(value: 'tiff' | 'jpeg' | 'png') => 
                      setProcessingParams(prev => ({ ...prev, outputFormat: value }))
                    }
                    data-testid="select-output-format"
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tiff">GeoTIFF (Recommended)</SelectItem>
                      <SelectItem value="jpeg">JPEG</SelectItem>
                      <SelectItem value="png">PNG</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <i className="fas fa-sliders-h mr-2"></i>
                  Processing Parameters
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Overlap Threshold: {processingParams.overlapThreshold * 100}%</Label>
                  <Slider
                    value={[processingParams.overlapThreshold]}
                    onValueChange={([value]) => 
                      setProcessingParams(prev => ({ ...prev, overlapThreshold: value }))
                    }
                    min={0.1}
                    max={0.9}
                    step={0.1}
                    className="w-full"
                    data-testid="slider-overlap-threshold"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Blending Mode</Label>
                  <Select 
                    value={processingParams.blendingMode} 
                    onValueChange={(value: 'feather' | 'multiband' | 'linear') => 
                      setProcessingParams(prev => ({ ...prev, blendingMode: value }))
                    }
                    data-testid="select-blending-mode"
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="feather">Feather Blending</SelectItem>
                      <SelectItem value="multiband">Multiband Blending</SelectItem>
                      <SelectItem value="linear">Linear Blending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>AI Enhancement</Label>
                  <Select 
                    value={processingParams.enhanceMode} 
                    onValueChange={(value: 'none' | 'contrast' | 'sharpness' | 'ai_enhance') => 
                      setProcessingParams(prev => ({ ...prev, enhanceMode: value }))
                    }
                    data-testid="select-enhance-mode"
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="contrast">Contrast Enhancement</SelectItem>
                      <SelectItem value="sharpness">Sharpness Enhancement</SelectItem>
                      <SelectItem value="ai_enhance">AI Super Resolution</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Target Resolution: {processingParams.targetResolution}m/pixel</Label>
                  <Slider
                    value={[processingParams.targetResolution]}
                    onValueChange={([value]) => 
                      setProcessingParams(prev => ({ ...prev, targetResolution: value }))
                    }
                    min={0.01}
                    max={0.5}
                    step={0.01}
                    className="w-full"
                    data-testid="slider-target-resolution"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {selectedMission && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <i className="fas fa-info-circle mr-2"></i>
                  Processing Estimate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-primary" data-testid="estimate-images">
                      {thermalImages.length}
                    </div>
                    <div className="text-sm text-muted-foreground">Source Images</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-primary" data-testid="estimate-time">
                      {Math.ceil(estimatedTime / 60)}m
                    </div>
                    <div className="text-sm text-muted-foreground">Est. Time</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-primary">
                      {processingParams.targetResolution * 1000}mm
                    </div>
                    <div className="text-sm text-muted-foreground">Resolution</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-primary">
                      {formatFileSize(8192 * 6144 * 3)}
                    </div>
                    <div className="text-sm text-muted-foreground">Est. Size</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="processing" className="space-y-6">
          {activeOrthomosaic ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center">
                    <i className="fas fa-tasks mr-2"></i>
                    Processing: {activeOrthomosaic.name}
                  </span>
                  {getStatusBadge(activeOrthomosaic.status)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {activeOrthomosaic.processingStats && (
                  <>
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>Overall Progress</span>
                        <span>{activeOrthomosaic.processingStats.coverage}%</span>
                      </div>
                      <Progress 
                        value={activeOrthomosaic.processingStats.coverage} 
                        className="w-full"
                        data-testid="processing-progress"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                      <div>
                        <div className="text-xl font-bold">
                          {activeOrthomosaic.processingStats.processedImages}/
                          {activeOrthomosaic.processingStats.totalImages}
                        </div>
                        <div className="text-sm text-muted-foreground">Images Processed</div>
                      </div>
                      <div>
                        <div className="text-xl font-bold">
                          {Math.round(activeOrthomosaic.processingStats.processingTime)}s
                        </div>
                        <div className="text-sm text-muted-foreground">Elapsed Time</div>
                      </div>
                      <div>
                        <div className="text-xl font-bold">
                          {activeOrthomosaic.processingStats.averageGSD * 1000}mm
                        </div>
                        <div className="text-sm text-muted-foreground">Average GSD</div>
                      </div>
                      <div>
                        <div className="text-xl font-bold">
                          {activeOrthomosaic.processingStats.qualityScore}
                        </div>
                        <div className="text-sm text-muted-foreground">Quality Score</div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <i className="fas fa-info-circle text-4xl text-muted-foreground mb-4"></i>
                <h3 className="text-lg font-semibold mb-2">No Active Processing</h3>
                <p className="text-muted-foreground text-center">
                  Start generating an orthomosaic to monitor processing progress here.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="results" className="space-y-6">
          <div className="grid gap-4">
            {orthomosaicsLoading ? (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <i className="fas fa-spinner fa-spin text-2xl mr-3"></i>
                  Loading orthomosaics...
                </CardContent>
              </Card>
            ) : orthomosaics.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <i className="fas fa-image text-4xl text-muted-foreground mb-4"></i>
                  <h3 className="text-lg font-semibold mb-2">No Orthomosaics Yet</h3>
                  <p className="text-muted-foreground text-center">
                    Generate your first orthomosaic to see results here.
                  </p>
                </CardContent>
              </Card>
            ) : (
              orthomosaics.map((ortho) => (
                <Card key={ortho.id} data-testid={`orthomosaic-card-${ortho.id}`}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{ortho.name}</span>
                      {getStatusBadge(ortho.status)}
                    </CardTitle>
                    {ortho.description && (
                      <p className="text-sm text-muted-foreground">{ortho.description}</p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center mb-4">
                      <div>
                        <div className="text-lg font-bold">
                          {ortho.metadata.width} × {ortho.metadata.height}
                        </div>
                        <div className="text-sm text-muted-foreground">Resolution</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold">
                          {ortho.metadata.sourceImageCount}
                        </div>
                        <div className="text-sm text-muted-foreground">Source Images</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold">
                          {ortho.metadata.resolution * 1000}mm
                        </div>
                        <div className="text-sm text-muted-foreground">GSD</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold">
                          {ortho.processingStats?.qualityScore || 0}
                        </div>
                        <div className="text-sm text-muted-foreground">Quality Score</div>
                      </div>
                    </div>
                    
                    {ortho.status === 'completed' && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" data-testid={`button-download-${ortho.id}`}>
                          <i className="fas fa-download mr-2"></i>
                          Download
                        </Button>
                        <Button size="sm" variant="outline" data-testid={`button-view-${ortho.id}`}>
                          <i className="fas fa-eye mr-2"></i>
                          View
                        </Button>
                        <Button size="sm" variant="outline">
                          <i className="fas fa-share mr-2"></i>
                          Share
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}