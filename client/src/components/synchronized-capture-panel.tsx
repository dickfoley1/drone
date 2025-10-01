import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, Camera, Zap, Settings, Eye, CheckCircle, XCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { SynchronizedCaptureService, SynchronizedCaptureRequest, CameraCalibration } from '@/lib/synchronized-capture';

interface SynchronizedCapturePanelProps {
  flightLogId: string;
  isConnected: boolean;
  onCaptureComplete?: (result: any) => void;
}

export function SynchronizedCapturePanel({ flightLogId, isConnected, onCaptureComplete }: SynchronizedCapturePanelProps) {
  const { toast } = useToast();
  const [captureService] = useState(() => SynchronizedCaptureService.getInstance());
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureProgress, setCaptureProgress] = useState(0);
  
  // Capture settings state
  const [captureSettings, setCaptureSettings] = useState({
    sessionType: 'synchronized' as 'synchronized' | 'thermal_only' | 'rgb_only' | 'manual',
    thermalEnabled: true,
    rgbEnabled: true,
    autoSync: true,
    maxTimingOffset: 50, // milliseconds
    spatialAlignment: true,
    thermalOpacity: 0.6,
    colormap: 'iron' as 'iron' | 'rainbow' | 'grayscale',
    captureInterval: 0, // 0 = manual, >0 = automatic interval in seconds
  });

  // Load camera calibration data
  const { data: calibration, isLoading: calibrationLoading } = useQuery<CameraCalibration | null>({
    queryKey: ['/api/camera-calibration/active/EVO_LITE_640T_ENTERPRISE'],
    enabled: isConnected,
  });

  // Load active capture sessions  
  const { data: sessions, refetch: refetchSessions } = useQuery<any[]>({
    queryKey: ['/api/capture-sessions', flightLogId],
    enabled: !!flightLogId,
  });

  // Initialize capture service
  useEffect(() => {
    if (isConnected) {
      captureService.initializeWebSocket().catch(console.error);
      captureService.loadCameraCalibration().catch(console.error);
    }

    return () => {
      if (!isConnected) {
        captureService.cleanup();
      }
    };
  }, [isConnected, captureService]);

  // Create capture session mutation
  const createSessionMutation = useMutation({
    mutationFn: async (settings: typeof captureSettings) => {
      return await captureService.createCaptureSession(
        flightLogId,
        settings.sessionType,
        {
          thermalEnabled: settings.thermalEnabled,
          rgbEnabled: settings.rgbEnabled,
          autoSync: settings.autoSync,
          captureInterval: settings.captureInterval,
          thermalRange: { min: -20, max: 150 },
          rgbSettings: {
            resolution: '4K',
            quality: 90,
            format: 'JPEG',
            whiteBalance: 'auto',
          },
        }
      );
    },
    onSuccess: (sessionId) => {
      setActiveSessionId(sessionId);
      refetchSessions();
      toast({
        title: 'Capture Session Created',
        description: `Session ${sessionId} is ready for synchronized capture`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Session Creation Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Trigger capture mutation
  const triggerCaptureMutation = useMutation({
    mutationFn: async (request: SynchronizedCaptureRequest) => {
      setIsCapturing(true);
      setCaptureProgress(0);
      
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setCaptureProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      try {
        const result = await captureService.triggerSynchronizedCapture(request);
        clearInterval(progressInterval);
        setCaptureProgress(100);
        return result;
      } catch (error) {
        clearInterval(progressInterval);
        throw error;
      } finally {
        setTimeout(() => {
          setIsCapturing(false);
          setCaptureProgress(0);
        }, 1000);
      }
    },
    onSuccess: (result) => {
      toast({
        title: 'Synchronized Capture Complete',
        description: `Timing offset: ${result.synchronizationQuality.timingOffset}ms, Alignment: ${result.synchronizationQuality.spatialAlignment}`,
      });
      
      if (onCaptureComplete) {
        onCaptureComplete(result);
      }
      
      // Refresh queries to show new images
      queryClient.invalidateQueries({ queryKey: ['/api/thermal-images'] });
      queryClient.invalidateQueries({ queryKey: ['/api/rgb-images'] });
    },
    onError: (error) => {
      toast({
        title: 'Capture Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // End session mutation
  const endSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      await captureService.endCaptureSession(sessionId);
    },
    onSuccess: () => {
      setActiveSessionId(null);
      refetchSessions();
      toast({
        title: 'Session Ended',
        description: 'Capture session has been successfully ended',
      });
    },
  });

  const handleStartSession = () => {
    createSessionMutation.mutate(captureSettings);
  };

  const handleTriggerCapture = () => {
    if (!activeSessionId) return;

    const request: SynchronizedCaptureRequest = {
      sessionId: activeSessionId,
      captureType: captureSettings.sessionType === 'synchronized' ? 'dual' : 
                   captureSettings.sessionType === 'thermal_only' ? 'thermal' : 'rgb',
      settings: {
        thermalEnabled: captureSettings.thermalEnabled,
        rgbEnabled: captureSettings.rgbEnabled,
        autoSync: captureSettings.autoSync,
        maxTimingOffset: captureSettings.maxTimingOffset,
        spatialAlignment: captureSettings.spatialAlignment,
      },
      triggerSource: 'manual',
    };

    triggerCaptureMutation.mutate(request);
  };

  const handleEndSession = () => {
    if (activeSessionId) {
      endSessionMutation.mutate(activeSessionId);
    }
  };

  const getCalibrationStatus = (calibration: CameraCalibration | null) => {
    if (!calibration) return { status: 'none', color: 'destructive' as const, text: 'No Calibration' };
    
    const error = calibration.calibrationQuality.reprojectionError;
    if (error < 0.5) return { status: 'excellent', color: 'default' as const, text: 'Excellent' };
    if (error < 1.0) return { status: 'good', color: 'secondary' as const, text: 'Good' };
    if (error < 2.0) return { status: 'fair', color: 'outline' as const, text: 'Fair' };
    return { status: 'poor', color: 'destructive' as const, text: 'Poor' };
  };

  const calibrationStatus = getCalibrationStatus(calibration);

  return (
    <Card className="w-full" data-testid="synchronized-capture-panel">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Synchronized Dual Camera Capture
            </CardTitle>
            <CardDescription>
              Perfect RGB + Thermal image alignment with precise timing control
            </CardDescription>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge variant={isConnected ? 'default' : 'destructive'} data-testid="connection-status">
              {isConnected ? 'Connected' : 'Disconnected'}
            </Badge>
            
            {calibration && (
              <Badge variant={calibrationStatus.color} data-testid="calibration-status">
                {calibrationStatus.text}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Connection Warning */}
        {!isConnected && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Mobile companion not connected. Connect your tablet or phone to enable synchronized capture.
            </AlertDescription>
          </Alert>
        )}

        {/* Calibration Warning */}
        {isConnected && !calibration && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No camera calibration found. Spatial alignment may be inaccurate without proper calibration.
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="capture" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="capture">Capture</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>

          <TabsContent value="capture" className="space-y-4">
            {/* Session Status */}
            <div className="flex items-center justify-between p-4 border rounded-lg" data-testid="session-status">
              <div>
                <h4 className="font-medium">Capture Session</h4>
                <p className="text-sm text-muted-foreground">
                  {activeSessionId ? `Active: ${activeSessionId}` : 'No active session'}
                </p>
              </div>
              
              <div className="flex gap-2">
                {!activeSessionId ? (
                  <Button 
                    onClick={handleStartSession}
                    disabled={!isConnected || createSessionMutation.isPending}
                    data-testid="button-start-session"
                  >
                    {createSessionMutation.isPending ? 'Creating...' : 'Start Session'}
                  </Button>
                ) : (
                  <Button 
                    variant="outline" 
                    onClick={handleEndSession}
                    disabled={endSessionMutation.isPending}
                    data-testid="button-end-session"
                  >
                    End Session
                  </Button>
                )}
              </div>
            </div>

            {/* Capture Controls */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="session-type" className="text-base font-medium">Capture Mode</Label>
                <Select
                  value={captureSettings.sessionType}
                  onValueChange={(value: any) => setCaptureSettings(prev => ({ ...prev, sessionType: value }))}
                  disabled={!!activeSessionId}
                >
                  <SelectTrigger className="w-48" data-testid="select-capture-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="synchronized">Synchronized (RGB + Thermal)</SelectItem>
                    <SelectItem value="thermal_only">Thermal Only</SelectItem>
                    <SelectItem value="rgb_only">RGB Only</SelectItem>
                    <SelectItem value="manual">Manual Control</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Capture Progress */}
              {isCapturing && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Capture Progress</Label>
                    <span className="text-sm text-muted-foreground">{captureProgress}%</span>
                  </div>
                  <Progress value={captureProgress} className="w-full" data-testid="capture-progress" />
                </div>
              )}

              {/* Trigger Capture Button */}
              <Button
                onClick={handleTriggerCapture}
                disabled={!activeSessionId || isCapturing || triggerCaptureMutation.isPending}
                size="lg"
                className="w-full"
                data-testid="button-trigger-capture"
              >
                <Zap className="h-4 w-4 mr-2" />
                {isCapturing ? 'Capturing...' : 'Trigger Synchronized Capture'}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            {/* Synchronization Settings */}
            <div className="space-y-4 p-4 border rounded-lg">
              <h4 className="font-medium flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Synchronization Settings
              </h4>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-sync">Auto-Synchronization</Label>
                  <Switch
                    id="auto-sync"
                    checked={captureSettings.autoSync}
                    onCheckedChange={(checked) => 
                      setCaptureSettings(prev => ({ ...prev, autoSync: checked }))
                    }
                    data-testid="switch-auto-sync"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Max Timing Offset: {captureSettings.maxTimingOffset}ms</Label>
                  <Slider
                    value={[captureSettings.maxTimingOffset]}
                    onValueChange={([value]) => 
                      setCaptureSettings(prev => ({ ...prev, maxTimingOffset: value }))
                    }
                    max={200}
                    min={10}
                    step={10}
                    className="w-full"
                    data-testid="slider-timing-offset"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="spatial-alignment">Spatial Alignment</Label>
                  <Switch
                    id="spatial-alignment"
                    checked={captureSettings.spatialAlignment}
                    onCheckedChange={(checked) => 
                      setCaptureSettings(prev => ({ ...prev, spatialAlignment: checked }))
                    }
                    disabled={!calibration}
                    data-testid="switch-spatial-alignment"
                  />
                </div>
              </div>
            </div>

            {/* Overlay Settings */}
            <div className="space-y-4 p-4 border rounded-lg">
              <h4 className="font-medium">Overlay Settings</h4>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Thermal Opacity: {Math.round(captureSettings.thermalOpacity * 100)}%</Label>
                  <Slider
                    value={[captureSettings.thermalOpacity]}
                    onValueChange={([value]) => 
                      setCaptureSettings(prev => ({ ...prev, thermalOpacity: value }))
                    }
                    max={1}
                    min={0}
                    step={0.1}
                    className="w-full"
                    data-testid="slider-thermal-opacity"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Color Map</Label>
                  <Select
                    value={captureSettings.colormap}
                    onValueChange={(value: any) => 
                      setCaptureSettings(prev => ({ ...prev, colormap: value }))
                    }
                  >
                    <SelectTrigger data-testid="select-colormap">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="iron">Iron</SelectItem>
                      <SelectItem value="rainbow">Rainbow</SelectItem>
                      <SelectItem value="grayscale">Grayscale</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="preview" className="space-y-4">
            {/* Camera Status */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Camera className="h-4 w-4" />
                    RGB Camera
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    {captureSettings.rgbEnabled ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="text-sm">
                      {captureSettings.rgbEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Camera className="h-4 w-4" />
                    Thermal Camera
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    {captureSettings.thermalEnabled ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="text-sm">
                      {captureSettings.thermalEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Calibration Info */}
            {calibration && calibration.calibrationQuality && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Camera Calibration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Reprojection Error:</span>
                      <span className="ml-2">{calibration.calibrationQuality.reprojectionError.toFixed(3)}px</span>
                    </div>
                    <div>
                      <span className="font-medium">Coverage:</span>
                      <span className="ml-2">{calibration.calibrationQuality.coveragePercentage.toFixed(1)}%</span>
                    </div>
                    <div>
                      <span className="font-medium">Calibration Images:</span>
                      <span className="ml-2">{calibration.calibrationQuality.calibrationImages}</span>
                    </div>
                    <div>
                      <span className="font-medium">Last Calibrated:</span>
                      <span className="ml-2">
                        {new Date(calibration.calibrationQuality.lastCalibrated).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}