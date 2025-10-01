import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import type { SystemSettings, InsertSystemSettings } from "@shared/schema";

export default function Settings() {
  const [isDirty, setIsDirty] = useState(false);
  const queryClient = useQueryClient();

  // Fetch system settings
  const { data: settings, isLoading } = useQuery<SystemSettings>({
    queryKey: ['/api/settings'],
  });

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (updates: Partial<InsertSystemSettings>) => {
      const response = await apiRequest('PUT', '/api/settings', updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
      setIsDirty(false);
      toast({
        title: "Settings Updated",
        description: "Your preferences have been saved successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update settings.",
        variant: "destructive",
      });
    },
  });

  const [formData, setFormData] = useState<Partial<InsertSystemSettings>>({});

  // Initialize form data when settings are loaded
  useState(() => {
    if (settings) {
      setFormData({
        droneModel: settings.droneModel,
        controllerType: settings.controllerType,
        defaultAltitude: settings.defaultAltitude,
        maxSpeed: settings.maxSpeed,
        temperatureRange: settings.temperatureRange,
        colorPalette: settings.colorPalette,
        autoAdjustTemp: settings.autoAdjustTemp,
        storageLocation: settings.storageLocation,
        backupLocation: settings.backupLocation,
        autoBackup: settings.autoBackup,
        compressThermalData: settings.compressThermalData,
        generateThumbnails: settings.generateThumbnails,
        units: settings.units,
        mapProvider: settings.mapProvider,
      });
    }
  });

  const handleInputChange = (field: keyof InsertSystemSettings, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleTemperatureRangeChange = (type: 'min' | 'max', value: number) => {
    const currentRange = formData.temperatureRange || settings?.temperatureRange || { min: -20, max: 150 };
    handleInputChange('temperatureRange', {
      ...currentRange,
      [type]: value,
    });
  };

  const handleSaveSettings = () => {
    updateSettingsMutation.mutate(formData);
  };

  const handleResetToDefaults = () => {
    const defaults: Partial<InsertSystemSettings> = {
      droneModel: 'Autel EVO Lite 640T',
      controllerType: 'Smart Controller V2',
      defaultAltitude: 120,
      maxSpeed: 15,
      temperatureRange: { min: -20, max: 150 },
      colorPalette: 'iron',
      autoAdjustTemp: true,
      storageLocation: '/DroneVision/Missions',
      backupLocation: null,
      autoBackup: true,
      compressThermalData: false,
      generateThumbnails: true,
      units: 'metric',
      mapProvider: 'OpenStreetMap',
    };
    setFormData(defaults);
    setIsDirty(true);
  };

  const handleBrowseFolder = (field: 'storageLocation' | 'backupLocation') => {
    // In a real application, this would open a file dialog
    // For now, we'll just show a toast
    toast({
      title: "Folder Browser",
      description: "Folder selection dialog would open here in a desktop application.",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center space-x-2">
          <i className="fas fa-spinner animate-spin"></i>
          <span>Loading settings...</span>
        </div>
      </div>
    );
  }

  const currentData = { ...settings, ...formData };

  return (
    <div className="p-6 max-w-4xl" data-testid="settings-container">
      <div className="mb-6">
        <h3 className="text-xl font-semibold">Settings</h3>
        <p className="text-muted-foreground">Configure your drone system preferences</p>
      </div>

      <div className="space-y-6">
        {/* Drone Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Drone Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label className="text-sm font-medium mb-2 block">Primary Drone</Label>
                <Select
                  value={currentData.droneModel || ''}
                  onValueChange={(value) => handleInputChange('droneModel', value)}
                >
                  <SelectTrigger data-testid="select-drone-model">
                    <SelectValue placeholder="Select drone model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Autel EVO Lite 640T">Autel EVO Lite 640T</SelectItem>
                    <SelectItem value="DJI Mavic 3 Thermal">DJI Mavic 3 Thermal</SelectItem>
                    <SelectItem value="FLIR Vue Pro R">FLIR Vue Pro R</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label className="text-sm font-medium mb-2 block">Controller</Label>
                <Select
                  value={currentData.controllerType || ''}
                  onValueChange={(value) => handleInputChange('controllerType', value)}
                >
                  <SelectTrigger data-testid="select-controller-type">
                    <SelectValue placeholder="Select controller" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Smart Controller V2">Smart Controller V2</SelectItem>
                    <SelectItem value="RC Pro">RC Pro</SelectItem>
                    <SelectItem value="Standard Controller">Standard Controller</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label className="text-sm font-medium mb-2 block">Default Altitude (m)</Label>
                <Input
                  type="number"
                  value={currentData.defaultAltitude || 120}
                  onChange={(e) => handleInputChange('defaultAltitude', Number(e.target.value))}
                  data-testid="input-default-altitude"
                />
              </div>
              
              <div>
                <Label className="text-sm font-medium mb-2 block">Max Speed (m/s)</Label>
                <Input
                  type="number"
                  value={currentData.maxSpeed || 15}
                  onChange={(e) => handleInputChange('maxSpeed', Number(e.target.value))}
                  data-testid="input-max-speed"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Thermal Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Thermal Camera Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label className="text-sm font-medium mb-2 block">Temperature Range</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    type="number"
                    value={currentData.temperatureRange?.min || -20}
                    onChange={(e) => handleTemperatureRangeChange('min', Number(e.target.value))}
                    placeholder="Min"
                    data-testid="input-temp-range-min"
                  />
                  <span>to</span>
                  <Input
                    type="number"
                    value={currentData.temperatureRange?.max || 150}
                    onChange={(e) => handleTemperatureRangeChange('max', Number(e.target.value))}
                    placeholder="Max"
                    data-testid="input-temp-range-max"
                  />
                  <span className="text-sm text-muted-foreground">°C</span>
                </div>
              </div>
              
              <div>
                <Label className="text-sm font-medium mb-2 block">Color Palette</Label>
                <Select
                  value={currentData.colorPalette || 'iron'}
                  onValueChange={(value) => handleInputChange('colorPalette', value)}
                >
                  <SelectTrigger data-testid="select-color-palette">
                    <SelectValue placeholder="Select palette" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="iron">Iron</SelectItem>
                    <SelectItem value="rainbow">Rainbow</SelectItem>
                    <SelectItem value="arctic">Arctic</SelectItem>
                    <SelectItem value="grayscale">Grayscale</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="md:col-span-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={currentData.autoAdjustTemp || false}
                    onCheckedChange={(checked) => handleInputChange('autoAdjustTemp', !!checked)}
                    data-testid="checkbox-auto-adjust-temp"
                  />
                  <Label className="text-sm">Auto-adjust temperature range</Label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* File Management */}
        <Card>
          <CardHeader>
            <CardTitle>File Management</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium mb-2 block">Default Storage Location</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    value={currentData.storageLocation || '/DroneVision/Missions'}
                    onChange={(e) => handleInputChange('storageLocation', e.target.value)}
                    data-testid="input-storage-location"
                  />
                  <Button
                    variant="outline"
                    onClick={() => handleBrowseFolder('storageLocation')}
                    data-testid="button-browse-storage"
                  >
                    Browse
                  </Button>
                </div>
              </div>
              
              <div>
                <Label className="text-sm font-medium mb-2 block">Auto-backup Location</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    value={currentData.backupLocation || ''}
                    onChange={(e) => handleInputChange('backupLocation', e.target.value)}
                    placeholder="Optional backup location"
                    data-testid="input-backup-location"
                  />
                  <Button
                    variant="outline"
                    onClick={() => handleBrowseFolder('backupLocation')}
                    data-testid="button-browse-backup"
                  >
                    Browse
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={currentData.autoBackup || false}
                    onCheckedChange={(checked) => handleInputChange('autoBackup', !!checked)}
                    data-testid="checkbox-auto-backup"
                  />
                  <Label className="text-sm">Auto-backup after each flight</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={currentData.compressThermalData || false}
                    onCheckedChange={(checked) => handleInputChange('compressThermalData', !!checked)}
                    data-testid="checkbox-compress-thermal"
                  />
                  <Label className="text-sm">Compress thermal data</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={currentData.generateThumbnails || false}
                    onCheckedChange={(checked) => handleInputChange('generateThumbnails', !!checked)}
                    data-testid="checkbox-generate-thumbnails"
                  />
                  <Label className="text-sm">Generate thumbnails</Label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System Preferences */}
        <Card>
          <CardHeader>
            <CardTitle>System Preferences</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label className="text-sm font-medium mb-2 block">Units</Label>
                <Select
                  value={currentData.units || 'metric'}
                  onValueChange={(value) => handleInputChange('units', value)}
                >
                  <SelectTrigger data-testid="select-units">
                    <SelectValue placeholder="Select units" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="metric">Metric (m, km, °C)</SelectItem>
                    <SelectItem value="imperial">Imperial (ft, mi, °F)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label className="text-sm font-medium mb-2 block">Map Provider</Label>
                <Select
                  value={currentData.mapProvider || 'OpenStreetMap'}
                  onValueChange={(value) => handleInputChange('mapProvider', value)}
                >
                  <SelectTrigger data-testid="select-map-provider">
                    <SelectValue placeholder="Select map provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OpenStreetMap">OpenStreetMap</SelectItem>
                    <SelectItem value="Google Maps">Google Maps</SelectItem>
                    <SelectItem value="Mapbox">Mapbox</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="mt-8 flex justify-end space-x-3">
        <Button
          variant="outline"
          onClick={handleResetToDefaults}
          data-testid="button-reset-defaults"
        >
          Reset to Defaults
        </Button>
        <Button
          onClick={handleSaveSettings}
          disabled={!isDirty || updateSettingsMutation.isPending}
          data-testid="button-save-settings"
        >
          {updateSettingsMutation.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
