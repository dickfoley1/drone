import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { FlightLog, Mission } from "@shared/schema";

interface FlightStats {
  totalFlights: number;
  flightHours: string;
  totalDistance: string;
  successRate: string;
}

// Flight log creation form schema
const createFlightLogSchema = z.object({
  missionId: z.string().min(1, "Please select a mission"),
  notes: z.string().optional(),
  telemetryData: z.string().optional(),
});

type CreateFlightLogForm = z.infer<typeof createFlightLogSchema>;

export default function FlightLogs() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const { toast } = useToast();

  // Fetch flight logs
  const { data: flightLogs = [], isLoading: logsLoading } = useQuery<FlightLog[]>({
    queryKey: ['/api/flight-logs'],
  });

  // Fetch missions for the creation form
  const { data: missions = [] } = useQuery<Mission[]>({
    queryKey: ['/api/missions'],
  });

  // Form for creating flight logs
  const form = useForm<CreateFlightLogForm>({
    resolver: zodResolver(createFlightLogSchema),
    defaultValues: {
      missionId: "",
      notes: "",
      telemetryData: "",
    },
  });

  // Create flight log mutation
  const createFlightLogMutation = useMutation({
    mutationFn: async (data: CreateFlightLogForm) => {
      const payload = {
        missionId: data.missionId,
        startTime: new Date().toISOString(),
        status: "completed" as const,
        notes: data.notes || undefined,
        telemetryData: data.telemetryData ? 
          JSON.parse(data.telemetryData) : 
          [{
            timestamp: Date.now(),
            lat: 40.7128,
            lng: -74.0060,
            altitude: 120,
            speed: 8,
            batteryLevel: 85,
            temperature: 22,
          }],
      };

      const response = await fetch('/api/flight-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Failed to create flight log');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Flight Log Created",
        description: "The flight log has been successfully created.",
      });
      
      // Reset form and close dialog
      form.reset();
      setIsCreateDialogOpen(false);
      
      // Refresh flight logs
      queryClient.invalidateQueries({ queryKey: ['/api/flight-logs'] });
    },
    onError: (error) => {
      toast({
        title: "Creation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateFlightLog = (data: CreateFlightLogForm) => {
    createFlightLogMutation.mutate(data);
  };

  // Mock flight statistics
  const flightStats: FlightStats = {
    totalFlights: 247,
    flightHours: "124.5h",
    totalDistance: "892 km",
    successRate: "94.3%",
  };

  // Filter and search logs
  const filteredLogs = flightLogs.filter(log => {
    const matchesSearch = log.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         log.notes?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === "all" || log.status === filterType;
    return matchesSearch && matchesFilter;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="status-completed" data-testid={`status-${status}`}>Completed</Badge>;
      case 'partial':
        return <Badge className="status-partial" data-testid={`status-${status}`}>Partial</Badge>;
      case 'failed':
        return <Badge className="status-failed" data-testid={`status-${status}`}>Failed</Badge>;
      default:
        return <Badge variant="secondary" data-testid={`status-${status}`}>{status}</Badge>;
    }
  };

  const getMissionIcon = (missionType?: string) => {
    switch (missionType) {
      case 'orbit':
        return 'fa-circle-notch text-primary';
      case 'grid':
        return 'fa-th text-secondary';
      case 'thermal':
        return 'fa-thermometer-half text-accent';
      default:
        return 'fa-route text-muted-foreground';
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatDistance = (meters?: number) => {
    if (!meters) return 'N/A';
    return `${(meters / 1000).toFixed(1)} km`;
  };

  const formatDate = (date?: Date | string) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString();
  };

  return (
    <div className="p-6 space-y-6" data-testid="flight-logs-container">
      {/* Filters and Search */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="relative">
            <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"></i>
            <Input
              type="text"
              placeholder="Search flight logs..."
              className="pl-10 pr-4 py-2 w-80"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="search-flight-logs"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-48" data-testid="filter-mission-type">
              <SelectValue placeholder="All Missions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Missions</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-mission-log">
              <i className="fas fa-plus mr-2"></i>New Flight Log
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Create New Flight Log</DialogTitle>
              <DialogDescription>
                Create a flight log for an existing mission. Select a mission and provide flight details.
              </DialogDescription>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleCreateFlightLog)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="missionId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mission</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-mission">
                            <SelectValue placeholder="Select a mission" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {missions.map((mission) => (
                            <SelectItem key={mission.id} value={mission.id!}>
                              {mission.name} ({mission.type})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (Optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Flight notes and observations..."
                          className="resize-none"
                          data-testid="input-notes"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="telemetryData"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telemetry Data (Optional JSON)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder='[{"timestamp": 1234567890, "lat": 40.7128, "lng": -74.0060, "altitude": 120, "speed": 8, "batteryLevel": 85, "temperature": 22}]'
                          className="resize-none font-mono text-xs"
                          data-testid="input-telemetry"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end space-x-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsCreateDialogOpen(false)}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createFlightLogMutation.isPending}
                    data-testid="button-create-flight-log"
                  >
                    {createFlightLogMutation.isPending ? "Creating..." : "Create Flight Log"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Flight Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Flight Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mission</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Distance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logsLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <div className="flex items-center justify-center">
                        <i className="fas fa-spinner animate-spin mr-2"></i>
                        Loading flight logs...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No flight logs found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => (
                    <TableRow key={log.id} className="flight-log-row" data-testid={`flight-log-${log.id}`}>
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          <i className={`fas ${getMissionIcon('thermal')}`}></i>
                          <div>
                            <div className="font-medium text-sm">
                              Mission {log.id?.slice(-6)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {log.notes || 'No description'}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm" data-testid={`log-date-${log.id}`}>
                        {formatDate(log.startTime)}
                      </TableCell>
                      <TableCell className="text-sm" data-testid={`log-duration-${log.id}`}>
                        {formatDuration(log.actualDuration || undefined)}
                      </TableCell>
                      <TableCell className="text-sm" data-testid={`log-distance-${log.id}`}>
                        {formatDistance(log.actualDistance || undefined)}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(log.status)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="View Details"
                            data-testid={`button-view-${log.id}`}
                          >
                            <i className="fas fa-eye text-xs"></i>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Download"
                            data-testid={`button-download-${log.id}`}
                          >
                            <i className="fas fa-download text-xs"></i>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Replay"
                            data-testid={`button-replay-${log.id}`}
                          >
                            <i className="fas fa-play text-xs"></i>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Flight Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Flights</p>
                <p className="text-2xl font-bold" data-testid="stat-total-flights">
                  {flightStats.totalFlights}
                </p>
              </div>
              <i className="fas fa-helicopter text-2xl text-primary"></i>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Flight Hours</p>
                <p className="text-2xl font-bold" data-testid="stat-flight-hours">
                  {flightStats.flightHours}
                </p>
              </div>
              <i className="fas fa-clock text-2xl text-accent"></i>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Distance Covered</p>
                <p className="text-2xl font-bold" data-testid="stat-total-distance">
                  {flightStats.totalDistance}
                </p>
              </div>
              <i className="fas fa-route text-2xl text-secondary"></i>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Success Rate</p>
                <p className="text-2xl font-bold text-green-600" data-testid="stat-success-rate">
                  {flightStats.successRate}
                </p>
              </div>
              <i className="fas fa-check-circle text-2xl text-green-500"></i>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
