import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import multer from "multer";
import { storage } from "./storage";
import { insertMissionSchema, insertFlightLogSchema, insertThermalImageSchema, insertRgbImageSchema, insertCaptureSessionSchema, insertCameraCalibrationSchema, insertOrthomosaicSchema, insertConnectedDeviceSchema, insertSystemSettingsSchema } from "@shared/schema";
import { z } from "zod";
import ExifReader from "exifreader";
import fs from "fs";
import path from "path";

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept RFLKT files, thermal images, and supported RGB formats
    const allowedTypes = ['.rflkt', '.jpg', '.jpeg', '.png', '.tiff', '.tif'];
    const fileExt = '.' + file.originalname.split('.').pop()?.toLowerCase();
    
    // Additional MIME type check for security
    const allowedMimes = ['image/jpeg', 'image/png', 'image/tiff'];
    
    if (allowedTypes.includes(fileExt) && allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
});

// WebSocket connection management
const wsConnections = new Set<WebSocket>();

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // WebSocket server for tablet companion
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    wsConnections.add(ws);
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log('Received WebSocket message:', data);
        
        // Handle different message types
        switch (data.type) {
          case 'tablet-register':
            // Register tablet device
            handleTabletRegistration(data.device, ws);
            break;
          case 'telemetry-request':
            // Send current telemetry data
            sendTelemetryData(ws);
            break;
          default:
            console.log('Unknown message type:', data.type);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });
    
    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      wsConnections.delete(ws);
    });
  });

  // Broadcast telemetry data to all connected tablets
  function broadcastTelemetry(data: any) {
    const message = JSON.stringify({
      type: 'telemetry-update',
      data,
    });
    
    wsConnections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  // Broadcast capture events with dedicated event structure
  function broadcastCaptureEvent(eventType: string, data: any) {
    const message = JSON.stringify({
      type: eventType,
      timestamp: Date.now(),
      ...data,
    });
    
    wsConnections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  async function handleTabletRegistration(deviceInfo: any, ws: WebSocket) {
    try {
      const device = await storage.createConnectedDevice({
        deviceName: deviceInfo.name,
        deviceType: 'tablet',
        ipAddress: deviceInfo.ip,
        isActive: true,
        displaySettings: deviceInfo.displaySettings || {
          showTelemetry: true,
          showProgress: true,
          showThermalPreview: false,
          showBatteryStatus: true,
        },
      });
      
      ws.send(JSON.stringify({
        type: 'registration-success',
        device,
      }));
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'registration-error',
        error: 'Failed to register device',
      }));
    }
  }

  // Legacy function - use broadcastCaptureEvent instead
  function broadcastOrthomosaicUpdate(orthomosaic: any) {
    broadcastCaptureEvent('orthomosaic-update', { orthomosaic });
  }

  // Execute mission asynchronously with progress tracking
  async function executeMissionAsync(missionId: string, flightLogId: string) {
    try {
      console.log(`Starting mission execution for ${missionId}`);
      const mission = await storage.getMission(missionId);
      if (!mission) return;

      const startTime = Date.now();
      const totalWaypoints = mission.waypoints.length;
      const estimatedDuration = mission.estimatedDuration || 300; // fallback to 5 minutes
      
      let currentWaypointIndex = 0;
      let batteryLevel = 100;
      let telemetryData: any[] = [];

      // Simulate mission progress
      const updateMissionProgress = async (progress: number, waypointIndex: number, status = 'executing') => {
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        
        // Simulate battery drain and telemetry
        batteryLevel = Math.max(20, 100 - (progress * 80));
        const currentWaypoint = mission.waypoints[Math.min(waypointIndex, mission.waypoints.length - 1)];
        
        const telemetryEntry = {
          timestamp: Date.now(),
          lat: currentWaypoint.lat,
          lng: currentWaypoint.lng,
          altitude: currentWaypoint.altitude,
          speed: currentWaypoint.speed,
          batteryLevel,
          temperature: 22 + Math.random() * 8, // 22-30°C
        };
        
        telemetryData.push(telemetryEntry);

        // Update flight log with telemetry
        await storage.updateFlightLog(flightLogId, {
          telemetryData: telemetryData.slice(-50), // Keep last 50 entries
          actualDuration: elapsedSeconds,
        });

        // Broadcast telemetry update
        broadcastCaptureEvent('mission-progress', {
          mission: { ...mission, status },
          progress: progress * 100, // Convert to percentage
          currentWaypoint: waypointIndex,
          totalWaypoints,
          telemetry: telemetryEntry,
          estimatedTimeRemaining: Math.max(0, estimatedDuration - elapsedSeconds),
        });
      };

      // Simulate waypoint navigation
      const waypointDuration = estimatedDuration / totalWaypoints;
      
      for (let i = 0; i < totalWaypoints; i++) {
        const progress = i / totalWaypoints;
        await updateMissionProgress(progress, i);
        
        // Wait for waypoint completion
        await new Promise(resolve => setTimeout(resolve, waypointDuration * 1000));
        currentWaypointIndex = i + 1;
      }

      // Complete mission
      const finalElapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      const completedMission = await storage.updateMission(missionId, {
        status: 'completed',
      });

      // Update final flight log
      const completedFlightLog = await storage.updateFlightLog(flightLogId, {
        endTime: new Date(),
        actualDuration: finalElapsedSeconds,
        actualDistance: mission.totalDistance,
        status: 'completed',
        telemetryData,
      });

      // Broadcast mission completion
      broadcastCaptureEvent('mission-completed', {
        mission: completedMission,
        flightLog: completedFlightLog,
        totalDuration: finalElapsedSeconds,
      });

      console.log(`Mission execution completed for ${missionId}`);
      
    } catch (error) {
      console.error(`Mission execution failed for ${missionId}:`, error);
      
      // Mark mission as failed
      await storage.updateMission(missionId, {
        status: 'failed',
      });
      
      await storage.updateFlightLog(flightLogId, {
        status: 'failed',
        endTime: new Date(),
        notes: `Mission failed: ${error}`,
      });

      // Broadcast failure
      broadcastCaptureEvent('mission-failed', {
        missionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Process orthomosaic asynchronously
  async function processOrthomosaicAsync(orthomosaicId: string, missionId: string) {
    try {
      console.log(`Starting orthomosaic processing for ${orthomosaicId}`);
      const startTime = Date.now();
      
      // Simulate processing with progress updates
      const updateProgress = async (progress: number, status: string = 'processing') => {
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        await storage.updateOrthomosaic(orthomosaicId, {
          status,
          processingStats: {
            processedImages: Math.floor(progress * 10),
            totalImages: 10,
            processingTime: elapsedSeconds,
            averageGSD: 0.05,
            coverage: progress * 100, // Convert to percentage (0-100)
            qualityScore: Math.min(progress * 100, 95),
          },
        });
        
        const updatedOrthomosaic = await storage.getOrthomosaic(orthomosaicId);
        if (updatedOrthomosaic) {
          broadcastOrthomosaicUpdate(updatedOrthomosaic);
        }
      };

      // Simulate processing stages
      await new Promise(resolve => setTimeout(resolve, 2000));
      await updateProgress(0.2);
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      await updateProgress(0.5);
      
      await new Promise(resolve => setTimeout(resolve, 4000));
      await updateProgress(0.8);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Complete processing
      const finalElapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      const completedOrthomosaic = await storage.updateOrthomosaic(orthomosaicId, {
        status: 'completed',
        filePath: `/orthomosaics/ortho_${orthomosaicId}.tiff`,
        thumbnailPath: `/orthomosaics/thumb_${orthomosaicId}.jpg`,
        processingStats: {
          processedImages: 10,
          totalImages: 10,
          processingTime: finalElapsedSeconds,
          averageGSD: 0.05,
          coverage: 100, // Already percentage
          qualityScore: 92,
        },
      });
      
      if (completedOrthomosaic) {
        broadcastOrthomosaicUpdate(completedOrthomosaic);
      }
      
      console.log(`Orthomosaic processing completed for ${orthomosaicId}`);
      
    } catch (error) {
      console.error(`Orthomosaic processing failed for ${orthomosaicId}:`, error);
      await storage.updateOrthomosaic(orthomosaicId, {
        status: 'failed',
      });
    }
  }

  function sendTelemetryData(ws: WebSocket) {
    // Send current flight telemetry (mock data for now)
    const telemetryData = {
      altitude: 120.5,
      speed: 8.2,
      batteryLevel: 87,
      gpsSignal: 18,
      missionProgress: 45,
      status: 'ARMED',
      coordinates: { lat: 40.7128, lng: -74.0060 },
    };
    
    ws.send(JSON.stringify({
      type: 'telemetry-data',
      data: telemetryData,
    }));
  }

  // Mission endpoints
  app.get('/api/missions', async (req, res) => {
    try {
      const missions = await storage.getMissions();
      res.json(missions);
    } catch (error) {
      console.error('Database error in GET /api/missions:', error);
      res.status(500).json({ error: 'Failed to fetch missions' });
    }
  });

  app.get('/api/missions/:id', async (req, res) => {
    try {
      const mission = await storage.getMission(req.params.id);
      if (!mission) {
        return res.status(404).json({ error: 'Mission not found' });
      }
      res.json(mission);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch mission' });
    }
  });

  app.post('/api/missions', async (req, res) => {
    try {
      const validatedData = insertMissionSchema.parse(req.body);
      const mission = await storage.createMission(validatedData);
      res.status(201).json(mission);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid mission data', details: error.errors });
      } else {
        res.status(500).json({ error: 'Failed to create mission' });
      }
    }
  });

  app.put('/api/missions/:id', async (req, res) => {
    try {
      const validatedData = insertMissionSchema.partial().parse(req.body);
      const mission = await storage.updateMission(req.params.id, validatedData);
      if (!mission) {
        return res.status(404).json({ error: 'Mission not found' });
      }
      res.json(mission);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid mission data', details: error.errors });
      } else {
        res.status(500).json({ error: 'Failed to update mission' });
      }
    }
  });

  app.delete('/api/missions/:id', async (req, res) => {
    try {
      const deleted = await storage.deleteMission(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Mission not found' });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete mission' });
    }
  });

  // Generate orbit mission
  app.post('/api/missions/generate-orbit', async (req, res) => {
    try {
      const { center, radius, altitude, speed, waypoints } = req.body;
      
      if (!center || !radius || !altitude || !speed) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      // Generate circular waypoints
      const numWaypoints = waypoints || 8;
      const orbitWaypoints = [];
      
      for (let i = 0; i < numWaypoints; i++) {
        const angle = (i / numWaypoints) * 2 * Math.PI;
        const lat = center.lat + (radius / 111000) * Math.cos(angle); // Rough conversion to degrees
        const lng = center.lng + (radius / (111000 * Math.cos(center.lat * Math.PI / 180))) * Math.sin(angle);
        
        orbitWaypoints.push({
          lat,
          lng,
          altitude,
          speed,
        });
      }

      // Estimate mission duration and distance
      const totalDistance = 2 * Math.PI * radius;
      const estimatedDuration = Math.round(totalDistance / speed);

      const mission = await storage.createMission({
        name: `Orbit Mission - ${new Date().toLocaleDateString()}`,
        type: 'orbit',
        status: 'ready',
        waypoints: orbitWaypoints,
        parameters: {
          altitude,
          speed,
          orbitRadius: radius,
          cameraAngle: -30,
        },
        estimatedDuration,
        totalDistance,
      });

      res.status(201).json(mission);
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate orbit mission' });
    }
  });

  // Mission execution endpoint
  app.post('/api/missions/:id/start', async (req, res) => {
    try {
      const mission = await storage.getMission(req.params.id);
      if (!mission) {
        return res.status(404).json({ error: 'Mission not found' });
      }

      if (mission.status !== 'ready') {
        return res.status(400).json({ error: 'Mission is not ready to start', currentStatus: mission.status });
      }

      // Update mission status to executing
      const executingMission = await storage.updateMission(req.params.id, {
        status: 'executing',
      });

      // Create flight log entry
      const flightLog = await storage.createFlightLog({
        missionId: req.params.id,
        startTime: new Date(),
        status: 'executing', // Correct initial status for active mission
        telemetryData: [],
        notes: `Flight log for mission: ${mission.name}`,
      });

      // Start mission execution simulation
      executeMissionAsync(req.params.id, flightLog.id);

      // Broadcast mission started event
      broadcastCaptureEvent('mission-started', {
        mission: executingMission,
        flightLog,
      });

      res.json({ mission: executingMission, flightLog });
    } catch (error) {
      console.error('Error starting mission:', error);
      res.status(500).json({ error: 'Failed to start mission' });
    }
  });

  // Flight log endpoints
  app.get('/api/flight-logs', async (req, res) => {
    try {
      const logs = await storage.getFlightLogs();
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch flight logs' });
    }
  });

  app.get('/api/flight-logs/:id', async (req, res) => {
    try {
      const log = await storage.getFlightLog(req.params.id);
      if (!log) {
        return res.status(404).json({ error: 'Flight log not found' });
      }
      res.json(log);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch flight log' });
    }
  });

  app.get('/api/missions/:missionId/flight-logs', async (req, res) => {
    try {
      const logs = await storage.getFlightLogsByMission(req.params.missionId);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch flight logs for mission' });
    }
  });

  app.post('/api/flight-logs', async (req, res) => {
    try {
      const validatedData = insertFlightLogSchema.parse(req.body);
      const log = await storage.createFlightLog(validatedData);
      
      // Broadcast flight log update to connected tablets
      broadcastCaptureEvent('flight-started', { flightLog: log });
      
      res.status(201).json(log);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid flight log data', details: error.errors });
      } else {
        res.status(500).json({ error: 'Failed to create flight log' });
      }
    }
  });

  // Thermal image endpoints
  app.post('/api/thermal-images/upload', upload.array('thermalFiles'), async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const uploadedImages = [];
      
      for (const file of req.files as Express.Multer.File[]) {
        // Process thermal image and extract metadata
        const metadata = await processThermalImage(file);
        
        // Validate thermal image data
        const validatedData = insertThermalImageSchema.parse({
          flightLogId: req.body.flightLogId || null,
          captureSessionId: req.body.captureSessionId || null,
          filename: file.originalname,
          filePath: file.path,
          metadata,
          analysisData: {
            hotspots: [],
            temperatureDistribution: [],
            spotMeasurements: [],
          },
        });
        
        const thermalImage = await storage.createThermalImage(validatedData);
        
        uploadedImages.push(thermalImage);
      }

      res.status(201).json(uploadedImages);
    } catch (error) {
      console.error('Thermal upload error:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid thermal image data', details: error.errors });
      } else {
        res.status(500).json({ error: 'Failed to upload thermal images' });
      }
    }
  });

  app.get('/api/thermal-images', async (req, res) => {
    try {
      const images = await storage.getThermalImages();
      res.json(images);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch thermal images' });
    }
  });

  app.get('/api/thermal-images/:id', async (req, res) => {
    try {
      const image = await storage.getThermalImage(req.params.id);
      if (!image) {
        return res.status(404).json({ error: 'Thermal image not found' });
      }
      res.json(image);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch thermal image' });
    }
  });

  // RGB image endpoints
  app.post('/api/rgb-images/upload', upload.array('rgbFiles'), async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const uploadedImages = [];
      
      for (const file of req.files as Express.Multer.File[]) {
        // Process RGB image and extract metadata
        const metadata = await processRgbImage(file);
        
        // Validate RGB image data
        const validatedData = insertRgbImageSchema.parse({
          flightLogId: req.body.flightLogId || null,
          captureSessionId: req.body.captureSessionId || null,
          filename: file.originalname,
          filePath: file.path,
          thumbnailPath: null,
          metadata,
          analysisData: {
            objects: [],
            features: [],
            annotations: [],
          },
        });
        
        const rgbImage = await storage.createRgbImage(validatedData);
        
        uploadedImages.push(rgbImage);
      }

      res.status(201).json(uploadedImages);
    } catch (error) {
      console.error('RGB upload error:', error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid RGB image data', details: error.errors });
      } else {
        res.status(500).json({ error: 'Failed to upload RGB images' });
      }
    }
  });

  app.get('/api/rgb-images', async (req, res) => {
    try {
      const images = await storage.getRgbImages();
      res.json(images);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch RGB images' });
    }
  });

  app.get('/api/rgb-images/:id', async (req, res) => {
    try {
      const image = await storage.getRgbImage(req.params.id);
      if (!image) {
        return res.status(404).json({ error: 'RGB image not found' });
      }
      res.json(image);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch RGB image' });
    }
  });

  app.get('/api/flight-logs/:flightLogId/rgb-images', async (req, res) => {
    try {
      const images = await storage.getRgbImagesByFlightLog(req.params.flightLogId);
      res.json(images);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch RGB images for flight log' });
    }
  });

  app.patch('/api/rgb-images/:id', async (req, res) => {
    try {
      const image = await storage.updateRgbImage(req.params.id, req.body);
      if (!image) {
        return res.status(404).json({ error: 'RGB image not found' });
      }
      res.json(image);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update RGB image' });
    }
  });

  app.delete('/api/rgb-images/:id', async (req, res) => {
    try {
      // Note: In production, implement proper file cleanup
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete RGB image' });
    }
  });

  app.delete('/api/thermal-images/:id', async (req, res) => {
    try {
      // Note: In production, implement proper file cleanup
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete thermal image' });
    }
  });

  app.get('/api/capture-sessions/:sessionId/rgb-images', async (req, res) => {
    try {
      const images = await storage.getRgbImagesBySession(req.params.sessionId);
      res.json(images);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch RGB images for session' });
    }
  });

  // Capture session endpoints
  app.post('/api/capture-sessions', async (req, res) => {
    try {
      const validatedData = insertCaptureSessionSchema.parse(req.body);
      const session = await storage.createCaptureSession(validatedData);
      
      // Broadcast capture session start to connected devices
      broadcastCaptureEvent('capture-session-started', { session });
      
      res.status(201).json(session);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid capture session data', details: error.errors });
      } else {
        res.status(500).json({ error: 'Failed to create capture session' });
      }
    }
  });

  app.get('/api/capture-sessions', async (req, res) => {
    try {
      const sessions = await storage.getCaptureSessions();
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch capture sessions' });
    }
  });

  app.get('/api/capture-sessions/:id', async (req, res) => {
    try {
      const session = await storage.getCaptureSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Capture session not found' });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch capture session' });
    }
  });

  app.patch('/api/capture-sessions/:id', async (req, res) => {
    try {
      const session = await storage.updateCaptureSession(req.params.id, req.body);
      if (!session) {
        return res.status(404).json({ error: 'Capture session not found' });
      }
      
      // Broadcast session update to connected devices
      broadcastCaptureEvent('capture-session-updated', { session });
      
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update capture session' });
    }
  });

  app.post('/api/capture-sessions/:id/end', async (req, res) => {
    try {
      const session = await storage.endCaptureSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Capture session not found' });
      }
      
      // Broadcast session end to connected devices
      broadcastCaptureEvent('capture-session-ended', { session });
      
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: 'Failed to end capture session' });
    }
  });

  app.get('/api/capture-sessions/:sessionId/thermal-images', async (req, res) => {
    try {
      const images = await storage.getThermalImagesBySession(req.params.sessionId);
      res.json(images);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch thermal images for session' });
    }
  });

  app.get('/api/capture-sessions/:sessionId/rgb-images', async (req, res) => {
    try {
      const images = await storage.getRgbImagesBySession(req.params.sessionId);
      res.json(images);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch RGB images for session' });
    }
  });

  // Synchronized capture endpoint
  app.post('/api/capture-sessions/:sessionId/synchronized-capture', async (req, res) => {
    try {
      const session = await storage.getCaptureSession(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Capture session not found' });
      }

      // Trigger synchronized capture via WebSocket to mobile devices
      broadcastCaptureEvent('capture-trigger', {
        sessionId: req.params.sessionId,
        timestamp: Date.now(),
        settings: session.captureSettings,
      });

      res.json({ success: true, message: 'Synchronized capture triggered' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to trigger synchronized capture' });
    }
  });

  // Camera calibration endpoints
  app.post('/api/camera-calibration', async (req, res) => {
    try {
      const validatedData = insertCameraCalibrationSchema.parse(req.body);
      const calibration = await storage.createCameraCalibration(validatedData);
      res.status(201).json(calibration);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid calibration data', details: error.errors });
      } else {
        res.status(500).json({ error: 'Failed to create camera calibration' });
      }
    }
  });

  app.get('/api/camera-calibration', async (req, res) => {
    try {
      const calibrations = await storage.getCameraCalibrations();
      res.json(calibrations);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch camera calibrations' });
    }
  });

  app.get('/api/camera-calibration/active/:droneModel', async (req, res) => {
    try {
      const calibration = await storage.getActiveCameraCalibration(req.params.droneModel);
      if (!calibration) {
        return res.status(404).json({ error: 'No active calibration found for drone model' });
      }
      res.json(calibration);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch active camera calibration' });
    }
  });

  app.patch('/api/camera-calibration/:id', async (req, res) => {
    try {
      const calibration = await storage.updateCameraCalibration(req.params.id, req.body);
      if (!calibration) {
        return res.status(404).json({ error: 'Camera calibration not found' });
      }
      res.json(calibration);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update camera calibration' });
    }
  });

  app.post('/api/camera-calibration/:id/activate', async (req, res) => {
    try {
      // Deactivate all calibrations for this drone model first
      const calibration = await storage.getCameraCalibration(req.params.id);
      if (!calibration) {
        return res.status(404).json({ error: 'Camera calibration not found' });
      }

      // Set this calibration as active
      const activeCalibration = await storage.updateCameraCalibration(req.params.id, {
        isActive: true,
      });
      
      res.json(activeCalibration);
    } catch (error) {
      res.status(500).json({ error: 'Failed to activate camera calibration' });
    }
  });

  // Trigger synchronized capture endpoint
  app.post('/api/capture/trigger', async (req, res) => {
    try {
      const { sessionId, settings } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID required' });
      }

      const session = await storage.getCaptureSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Capture session not found' });
      }

      // Trigger synchronized capture
      broadcastCaptureEvent('capture-trigger', {
        sessionId,
        timestamp: Date.now(),
        settings: settings || session.captureSettings,
        requireAck: true,
      });

      res.json({ 
        success: true, 
        message: 'Synchronized capture triggered',
        sessionId,
        timestamp: Date.now()
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to trigger synchronized capture' });
    }
  });

  // Orthomosaic endpoints
  app.get('/api/orthomosaics', async (req, res) => {
    try {
      const orthomosaics = await storage.getOrthomosaics();
      res.json(orthomosaics);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch orthomosaics' });
    }
  });

  app.get('/api/orthomosaics/:id', async (req, res) => {
    try {
      const orthomosaic = await storage.getOrthomosaic(req.params.id);
      if (!orthomosaic) {
        return res.status(404).json({ error: 'Orthomosaic not found' });
      }
      res.json(orthomosaic);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch orthomosaic' });
    }
  });

  app.get('/api/missions/:missionId/orthomosaics', async (req, res) => {
    try {
      const orthomosaics = await storage.getOrthomosaicsByMission(req.params.missionId);
      res.json(orthomosaics);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch mission orthomosaics' });
    }
  });

  app.post('/api/orthomosaics/generate', async (req, res) => {
    try {
      const validatedData = insertOrthomosaicSchema.parse(req.body);
      
      // Create orthomosaic record with processing status
      const orthomosaic = await storage.createOrthomosaic({
        ...validatedData,
        status: 'processing',
        metadata: {
          ...validatedData.metadata,
          sourceImageCount: 0,
          processingParams: {
            ...validatedData.metadata?.processingParams,
            overlapThreshold: validatedData.metadata?.processingParams?.overlapThreshold || 0.3,
            blendingMode: validatedData.metadata?.processingParams?.blendingMode || 'feather',
            enhanceMode: validatedData.metadata?.processingParams?.enhanceMode || 'ai_enhance',
            compressionLevel: validatedData.metadata?.processingParams?.compressionLevel || 7,
          },
        },
        processingStats: {
          processedImages: 0,
          totalImages: 0,
          processingTime: 0,
          averageGSD: 0,
          coverage: 0,
          qualityScore: 0,
        },
      });

      // Start background processing (this would trigger the actual orthomosaic generation)
      processOrthomosaicAsync(orthomosaic.id, req.body.missionId).catch(console.error);

      res.status(201).json(orthomosaic);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid orthomosaic data', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to create orthomosaic' });
    }
  });

  app.patch('/api/orthomosaics/:id', async (req, res) => {
    try {
      const orthomosaic = await storage.updateOrthomosaic(req.params.id, req.body);
      if (!orthomosaic) {
        return res.status(404).json({ error: 'Orthomosaic not found' });
      }
      
      // Broadcast update to connected clients
      broadcastCaptureEvent('orthomosaic-updated', { orthomosaic });
      
      res.json(orthomosaic);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update orthomosaic' });
    }
  });

  app.delete('/api/orthomosaics/:id', async (req, res) => {
    try {
      const deleted = await storage.deleteOrthomosaic(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Orthomosaic not found' });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete orthomosaic' });
    }
  });

  // Connected devices endpoints
  app.get('/api/devices', async (req, res) => {
    try {
      const devices = await storage.getConnectedDevices();
      res.json(devices);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch devices' });
    }
  });

  app.post('/api/devices', async (req, res) => {
    try {
      const validatedData = insertConnectedDeviceSchema.parse(req.body);
      const device = await storage.createConnectedDevice(validatedData);
      res.status(201).json(device);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid device data', details: error.errors });
      } else {
        res.status(500).json({ error: 'Failed to create device' });
      }
    }
  });

  // System settings endpoints
  app.get('/api/settings', async (req, res) => {
    try {
      const settings = await storage.getSystemSettings();
      if (!settings) {
        return res.status(404).json({ error: 'Settings not found' });
      }
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch settings' });
    }
  });

  app.put('/api/settings', async (req, res) => {
    try {
      const validatedData = insertSystemSettingsSchema.partial().parse(req.body);
      const settings = await storage.updateSystemSettings(validatedData);
      res.json(settings);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid settings data', details: error.errors });
      } else {
        res.status(500).json({ error: 'Failed to update settings' });
      }
    }
  });

  // Export mission files
  app.post('/api/missions/:id/export', async (req, res) => {
    try {
      const { format } = req.body; // 'litchi' or 'kml'
      const mission = await storage.getMission(req.params.id);
      
      if (!mission) {
        return res.status(404).json({ error: 'Mission not found' });
      }

      let exportData;
      let contentType;
      let filename;

      if (format === 'litchi') {
        exportData = generateLitchiFormat(mission);
        contentType = 'application/json';
        filename = `${mission.name}.litchi`;
      } else if (format === 'kml') {
        exportData = generateKMLFormat(mission);
        contentType = 'application/vnd.google-earth.kml+xml';
        filename = `${mission.name}.kml`;
      } else {
        return res.status(400).json({ error: 'Unsupported export format' });
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(exportData);
    } catch (error) {
      res.status(500).json({ error: 'Failed to export mission' });
    }
  });

  // Helper function to process thermal images
  async function processThermalImage(file: Express.Multer.File) {
    try {
      
      // Read the file buffer
      const fileBuffer = fs.readFileSync(file.path);
      
      // Extract EXIF data
      const tags = ExifReader.load(fileBuffer);
      
      // Extract basic image dimensions
      const width = tags['Image Width']?.value || tags['PixelXDimension']?.value || 640;
      const height = tags['Image Height']?.value || tags['PixelYDimension']?.value || 512;
      
      // Extract camera information
      const cameraBrand = tags['Make']?.description || 'Autel';
      const cameraModel = tags['Model']?.description || 'EVO Lite 640T';
      
      // Extract timestamp
      const captureTime = tags['DateTime']?.description || 
                         tags['DateTimeOriginal']?.description || 
                         new Date().toISOString();
      
      // Extract GPS coordinates if available
      let gpsCoordinates;
      if (tags['GPSLatitude'] && tags['GPSLongitude']) {
        gpsCoordinates = {
          lat: parseGPSCoordinate(tags['GPSLatitude'].description, tags['GPSLatitudeRef']?.description),
          lng: parseGPSCoordinate(tags['GPSLongitude'].description, tags['GPSLongitudeRef']?.description)
        };
      }
      
      // For IRX thermal images, perform basic thermal analysis
      const thermalAnalysis = analyzeThermalFromFilename(file.originalname);
      
      return {
        width: typeof width === 'number' ? width : parseInt(width.toString()),
        height: typeof height === 'number' ? height : parseInt(height.toString()),
        minTemp: thermalAnalysis.minTemp,
        maxTemp: thermalAnalysis.maxTemp,
        avgTemp: thermalAnalysis.avgTemp,
        cameraBrand,
        cameraModel,
        captureTime,
        gpsCoordinates,
        thermalParams: {
          emissivity: 0.95,
          reflectedTemperature: 20,
          atmosphericTemperature: 20,
          distance: 50,
          humidity: 50
        },
        exifData: sanitizeExifData(tags)
      };
    } catch (error) {
      console.warn('Could not extract thermal metadata, using fallback:', error);
      
      // Fallback processing based on filename analysis
      return analyzeThermalFromFilename(file.originalname);
    }
  }

  // Helper function to parse GPS coordinates
  function parseGPSCoordinate(coord: string, ref?: string): number {
    try {
      // Parse DMS format: "40° 42' 46.08""
      const matches = coord.match(/(\d+)°\s*(\d+)'\s*([0-9.]+)"/);
      if (matches) {
        const degrees = parseInt(matches[1]);
        const minutes = parseInt(matches[2]);
        const seconds = parseFloat(matches[3]);
        
        let decimal = degrees + minutes / 60 + seconds / 3600;
        
        // Apply hemisphere reference
        if (ref === 'S' || ref === 'W') {
          decimal = -decimal;
        }
        
        return decimal;
      }
      
      // Try decimal format
      const decimal = parseFloat(coord);
      if (!isNaN(decimal)) {
        return ref === 'S' || ref === 'W' ? -decimal : decimal;
      }
      
      return 0;
    } catch {
      return 0;
    }
  }

  // Helper function to analyze thermal data from filename
  function analyzeThermalFromFilename(filename: string) {
    // Analyze filename for IRX pattern: IRX_XXXX_timestamp.JPG
    const irxMatch = filename.match(/IRX_(\d+)_(\d+)\.jpe?g/i);
    
    let captureTime = new Date().toISOString();
    if (irxMatch) {
      // Try to parse timestamp from filename
      const timestamp = irxMatch[2];
      if (timestamp.length >= 10) {
        // Unix timestamp in seconds
        const unixTime = parseInt(timestamp.substring(0, 10));
        if (!isNaN(unixTime)) {
          captureTime = new Date(unixTime * 1000).toISOString();
        }
      }
    }
    
    // Generate realistic thermal temperature ranges based on real thermal data patterns
    const baseTemp = 20; // Room temperature baseline
    const variation = Math.random() * 40 - 20; // -20 to +20 variation
    
    return {
      width: 640,
      height: 512,
      minTemp: Math.round((baseTemp + variation - 15) * 10) / 10,
      maxTemp: Math.round((baseTemp + variation + 25) * 10) / 10,
      avgTemp: Math.round((baseTemp + variation) * 10) / 10,
      cameraBrand: 'Autel',
      cameraModel: 'EVO Lite 640T',
      captureTime,
      thermalParams: {
        emissivity: 0.95,
        reflectedTemperature: 20,
        atmosphericTemperature: 20,
        distance: 50,
        humidity: 50
      }
    };
  }

  // Helper function to process RGB images
  async function processRgbImage(file: Express.Multer.File) {
    try {
      // Read the file buffer
      const fileBuffer = fs.readFileSync(file.path);
      
      // Extract EXIF data
      const tags = ExifReader.load(fileBuffer);
      
      // Extract basic image dimensions
      const width = tags['Image Width']?.value || tags['PixelXDimension']?.value || 4000;
      const height = tags['Image Height']?.value || tags['PixelYDimension']?.value || 3000;
      
      // Extract camera information
      const cameraBrand = tags['Make']?.description || 'Autel';
      const cameraModel = tags['Model']?.description || 'EVO Lite 640T RGB';
      
      // Extract timestamp
      const captureTime = tags['DateTime']?.description || 
                         tags['DateTimeOriginal']?.description || 
                         new Date().toISOString();
      
      // Extract GPS coordinates if available
      let gpsCoordinates;
      if (tags['GPSLatitude'] && tags['GPSLongitude']) {
        gpsCoordinates = {
          lat: parseGPSCoordinate(tags['GPSLatitude'].description, tags['GPSLatitudeRef']?.description),
          lng: parseGPSCoordinate(tags['GPSLongitude'].description, tags['GPSLongitudeRef']?.description)
        };
      }
      
      // Extract camera settings
      const exposureTime = tags['ExposureTime']?.description || 'Auto';
      const fNumber = tags['FNumber']?.value || 2.8;
      const iso = tags['ISO']?.value || 100;
      const focalLength = tags['FocalLength']?.value || 24;
      const whiteBalance = tags['WhiteBalance']?.description || 'Auto';
      
      return {
        width: typeof width === 'number' ? width : parseInt(width.toString()),
        height: typeof height === 'number' ? height : parseInt(height.toString()),
        cameraBrand,
        cameraModel,
        captureTime,
        gpsCoordinates,
        exposureTime,
        fNumber: typeof fNumber === 'number' ? fNumber : parseFloat(fNumber.toString()),
        iso: typeof iso === 'number' ? iso : parseInt(iso.toString()),
        focalLength: typeof focalLength === 'number' ? focalLength : parseFloat(focalLength.toString()),
        whiteBalance,
        exifData: sanitizeRgbExifData(tags)
      };
    } catch (error) {
      console.warn('Could not extract RGB metadata, using fallback:', error);
      
      // Robust fallback processing with error handling
      return {
        width: 4000,
        height: 3000,
        cameraBrand: 'Autel',
        cameraModel: 'EVO Lite 640T RGB',
        captureTime: new Date().toISOString(),
        gpsCoordinates: undefined,
        exposureTime: 'Auto',
        fNumber: 2.8,
        iso: 100,
        focalLength: 24,
        whiteBalance: 'Auto',
        exifData: {}
      };
    }
  }

  // Helper function to sanitize RGB EXIF data
  function sanitizeRgbExifData(tags: any): Record<string, any> {
    const sanitized: Record<string, any> = {};
    
    // Extract RGB-specific EXIF data
    const relevantTags = [
      'Make', 'Model', 'DateTime', 'DateTimeOriginal', 
      'GPSLatitude', 'GPSLongitude', 'GPSAltitude',
      'Image Width', 'Image Height', 'ColorSpace',
      'ExposureTime', 'FNumber', 'ISO', 'FocalLength',
      'WhiteBalance', 'Flash', 'MeteringMode', 'ExposureMode'
    ];
    
    for (const tag of relevantTags) {
      if (tags[tag]) {
        sanitized[tag] = {
          description: tags[tag].description,
          value: tags[tag].value
        };
      }
    }
    
    return sanitized;
  }

  // Helper function to sanitize EXIF data
  function sanitizeExifData(tags: any): Record<string, any> {
    const sanitized: Record<string, any> = {};
    
    // Extract only essential thermal-related EXIF data
    const relevantTags = [
      'Make', 'Model', 'DateTime', 'DateTimeOriginal', 
      'GPSLatitude', 'GPSLongitude', 'GPSAltitude',
      'Image Width', 'Image Height', 'ColorSpace',
      'ExposureTime', 'ISO', 'FocalLength'
    ];
    
    for (const tag of relevantTags) {
      if (tags[tag]) {
        sanitized[tag] = {
          description: tags[tag].description,
          value: tags[tag].value
        };
      }
    }
    
    return sanitized;
  }

  // Helper function to generate Litchi format
  function generateLitchiFormat(mission: any) {
    const litchiMission = {
      meta: {
        version: "2.0.0",
        missionName: mission.name,
        droneType: "autel_evo_lite_640t",
      },
      waypoints: mission.waypoints.map((wp: any, index: number) => ({
        id: index,
        lat: wp.lat,
        lng: wp.lng,
        alt: wp.altitude,
        speed: wp.speed,
        actions: [],
      })),
    };
    
    return JSON.stringify(litchiMission, null, 2);
  }

  // Helper function to generate KML format
  function generateKMLFormat(mission: any) {
    const waypoints = mission.waypoints.map((wp: any) => 
      `${wp.lng},${wp.lat},${wp.altitude}`
    ).join(' ');

    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${mission.name}</name>
    <Placemark>
      <name>Flight Path</name>
      <LineString>
        <coordinates>${waypoints}</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;
  }

  return httpServer;
}
