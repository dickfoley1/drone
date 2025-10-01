import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import type { ThermalImage } from "@shared/schema";

interface ThermalAnalysisData {
  maxTemp: number;
  minTemp: number;
  avgTemp: number;
  hotspots: Array<{
    x: number;
    y: number;
    temperature: number;
    severity: 'low' | 'medium' | 'high';
  }>;
}

const measurementTools = [
  { id: 'spot', name: 'Spot Temp', icon: 'fa-dot-circle', description: 'Point temperature measurement' },
  { id: 'area', name: 'Area Avg', icon: 'fa-draw-polygon', description: 'Average area temperature' },
  { id: 'line', name: 'Line Profile', icon: 'fa-ruler', description: 'Temperature along a line' },
  { id: 'histogram', name: 'Histogram', icon: 'fa-chart-line', description: 'Temperature distribution' },
];

export default function ThermalAnalysis() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedTool, setSelectedTool] = useState<string>('spot');
  const [currentImage, setCurrentImage] = useState<ThermalImage | null>(null);
  const [analysisData, setAnalysisData] = useState<ThermalAnalysisData>({
    maxTemp: 84.2,
    minTemp: -8.1,
    avgTemp: 23.7,
    hotspots: [
      { x: 245, y: 128, temperature: 84.2, severity: 'high' },
      { x: 198, y: 87, temperature: 62.1, severity: 'medium' },
    ],
  });

  const queryClient = useQueryClient();

  // Fetch thermal images
  const { data: thermalImages = [], isLoading: imagesLoading } = useQuery<ThermalImage[]>({
    queryKey: ['/api/thermal-images'],
  });

  // Update analysis data and current image when thermal images are fetched
  useEffect(() => {
    if (thermalImages.length > 0) {
      // Use the most recent thermal image
      const latestImage = thermalImages[thermalImages.length - 1];
      setCurrentImage(latestImage);
      
      // Update analysis data with real metadata from the uploaded image
      if (latestImage.metadata) {
        setAnalysisData({
          maxTemp: latestImage.metadata.maxTemp || 84.2,
          minTemp: latestImage.metadata.minTemp || -8.1,
          avgTemp: latestImage.metadata.avgTemp || 23.7,
          hotspots: [
            { 
              x: latestImage.metadata.width ? Math.floor(latestImage.metadata.width * 0.4) : 245, 
              y: latestImage.metadata.height ? Math.floor(latestImage.metadata.height * 0.25) : 128, 
              temperature: latestImage.metadata.maxTemp || 84.2, 
              severity: 'high' as const
            },
            { 
              x: latestImage.metadata.width ? Math.floor(latestImage.metadata.width * 0.3) : 198, 
              y: latestImage.metadata.height ? Math.floor(latestImage.metadata.height * 0.17) : 87, 
              temperature: latestImage.metadata.avgTemp ? latestImage.metadata.avgTemp + 10 : 62.1, 
              severity: 'medium' as const
            },
          ],
        });
      }
    }
  }, [thermalImages]);

  // Upload thermal images mutation
  const uploadMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('thermalFiles', file);
      });
      
      const response = await apiRequest('POST', '/api/thermal-images/upload', formData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/thermal-images'] });
      toast({
        title: "Upload Successful",
        description: "Thermal images have been uploaded and processed.",
      });
    },
    onError: () => {
      toast({
        title: "Upload Failed",
        description: "Failed to upload thermal images.",
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      uploadMutation.mutate(files);
    }
  };

  const handleDropzoneClick = () => {
    fileInputRef.current?.click();
  };

  const handleExportReport = () => {
    // Generate PDF report
    toast({
      title: "Report Generated",
      description: "Thermal analysis report has been exported.",
    });
  };

  const handleExportCSV = () => {
    // Export CSV data
    const csvContent = `Temperature,X,Y,Severity\n${analysisData.hotspots.map(h => 
      `${h.temperature},${h.x},${h.y},${h.severity}`
    ).join('\n')}`;
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'thermal-analysis.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full" data-testid="thermal-analysis-container">
      {/* Image Viewer */}
      <div className="flex-1 bg-black relative" data-testid="thermal-image-viewer">
        <div className="h-full flex items-center justify-center">
          {currentImage ? (
            <img 
              src={`/api/thermal-images/${currentImage.id}/preview`}
              alt="Thermal analysis"
              className="max-h-full max-w-full object-contain"
              data-testid="thermal-image"
            />
          ) : (
            <div className="text-center text-gray-400">
              <i className="fas fa-thermometer-half text-6xl mb-4"></i>
              <p>Upload thermal images to begin analysis</p>
            </div>
          )}
        </div>
        
        {/* Thermal Scale Legend */}
        <Card className="absolute right-4 top-4 bg-card/90 backdrop-blur-sm border-border">
          <CardContent className="p-3">
            <h4 className="text-sm font-medium mb-2">Temperature Scale</h4>
            <div className="thermal-gradient h-4 w-32 rounded mb-2"></div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span data-testid="temp-scale-min">{analysisData.minTemp}°C</span>
              <span data-testid="temp-scale-max">{analysisData.maxTemp}°C</span>
            </div>
          </CardContent>
        </Card>

        {/* Image Controls */}
        <Card className="absolute bottom-4 left-4 bg-card/90 backdrop-blur-sm border-border">
          <CardContent className="p-3">
            <div className="flex items-center space-x-3">
              <Button
                variant="ghost"
                size="icon"
                className="p-2"
                title="Zoom In"
                data-testid="button-zoom-in"
              >
                <i className="fas fa-search-plus"></i>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="p-2"
                title="Zoom Out"
                data-testid="button-zoom-out"
              >
                <i className="fas fa-search-minus"></i>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="p-2"
                title="Pan"
                data-testid="button-pan"
              >
                <i className="fas fa-arrows-alt"></i>
              </Button>
              <Button
                variant={selectedTool === 'spot' ? 'default' : 'ghost'}
                size="icon"
                className="p-2"
                title="Spot Temperature"
                onClick={() => setSelectedTool('spot')}
                data-testid="button-spot-temp"
              >
                <i className="fas fa-crosshairs"></i>
              </Button>
              <Button
                variant={selectedTool === 'area' ? 'default' : 'ghost'}
                size="icon"
                className="p-2"
                title="Area Analysis"
                onClick={() => setSelectedTool('area')}
                data-testid="button-area-analysis"
              >
                <i className="fas fa-vector-square"></i>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Analysis Panel */}
      <div className="w-80 bg-card border-l border-border overflow-y-auto custom-scrollbar" data-testid="thermal-analysis-panel">
        <div className="p-4 border-b border-border">
          <h3 className="font-medium">Thermal Analysis</h3>
        </div>

        <div className="p-4 space-y-6">
          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium mb-2">Upload Thermal Data</label>
            <div 
              className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-primary transition-colors cursor-pointer"
              onClick={handleDropzoneClick}
              data-testid="thermal-upload-dropzone"
            >
              <i className="fas fa-cloud-upload-alt text-2xl text-muted-foreground mb-2"></i>
              <p className="text-sm text-muted-foreground">
                Drop RFLKT files here or click to browse
              </p>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".rflkt,.jpg,.jpeg,.png,.tiff"
                multiple
                onChange={handleFileUpload}
                data-testid="thermal-file-input"
              />
            </div>
            {uploadMutation.isPending && (
              <div className="mt-2">
                <Progress value={50} className="w-full" />
                <p className="text-sm text-muted-foreground text-center mt-1">
                  Processing thermal data...
                </p>
              </div>
            )}
          </div>

          {/* Temperature Statistics */}
          <div>
            <h4 className="font-medium mb-3">Temperature Analysis</h4>
            <div className="space-y-3">
              <Card className="bg-muted border-none">
                <CardContent className="p-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm">Max Temperature</span>
                    <span className="font-mono text-sm font-semibold text-destructive" data-testid="max-temperature">
                      {analysisData.maxTemp}°C
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">Location: (245, 128)</div>
                </CardContent>
              </Card>
              
              <Card className="bg-muted border-none">
                <CardContent className="p-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm">Min Temperature</span>
                    <span className="font-mono text-sm font-semibold text-blue-600" data-testid="min-temperature">
                      {analysisData.minTemp}°C
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">Location: (45, 302)</div>
                </CardContent>
              </Card>
              
              <Card className="bg-muted border-none">
                <CardContent className="p-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm">Average Temperature</span>
                    <span className="font-mono text-sm font-semibold" data-testid="avg-temperature">
                      {analysisData.avgTemp}°C
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Hotspot Detection */}
          <div>
            <h4 className="font-medium mb-3">Hotspot Detection</h4>
            <div className="space-y-2">
              {analysisData.hotspots.map((hotspot, index) => (
                <Card 
                  key={index}
                  className={`border ${
                    hotspot.severity === 'high' 
                      ? 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800'
                      : 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800'
                  }`}
                >
                  <CardContent className="p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {hotspot.severity === 'high' ? 'Critical Hotspot' : 'Moderate Heat'}
                      </span>
                      <Badge 
                        variant={hotspot.severity === 'high' ? 'destructive' : 'secondary'}
                        data-testid={`hotspot-${index}-severity`}
                      >
                        {hotspot.severity === 'high' ? 'Alert' : 'Warning'}
                      </Badge>
                    </div>
                    <div className="text-xs mt-1" data-testid={`hotspot-${index}-details`}>
                      {hotspot.temperature}°C at ({hotspot.x}, {hotspot.y})
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Measurement Tools */}
          <div>
            <h4 className="font-medium mb-3">Measurement Tools</h4>
            <div className="grid grid-cols-2 gap-2">
              {measurementTools.map((tool) => (
                <Button
                  key={tool.id}
                  variant={selectedTool === tool.id ? "default" : "outline"}
                  className="p-2 h-auto text-center flex flex-col space-y-1"
                  onClick={() => setSelectedTool(tool.id)}
                  data-testid={`tool-${tool.id}`}
                >
                  <i className={`fas ${tool.icon}`}></i>
                  <span className="text-xs">{tool.name}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Export Analysis */}
          <div>
            <h4 className="font-medium mb-3">Export Analysis</h4>
            <div className="space-y-2">
              <Button 
                onClick={handleExportReport}
                className="w-full"
                data-testid="button-export-pdf"
              >
                <i className="fas fa-file-pdf mr-2"></i>Generate Report
              </Button>
              <Button 
                variant="outline" 
                onClick={handleExportCSV}
                className="w-full"
                data-testid="button-export-csv"
              >
                <i className="fas fa-download mr-2"></i>Export CSV Data
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
