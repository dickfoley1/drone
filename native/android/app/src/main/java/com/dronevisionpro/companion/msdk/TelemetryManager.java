package com.dronevisionpro.companion.msdk;

import android.util.Log;

import com.autel.sdk.product.BaseProduct;
import com.autel.sdk.flight.FlightControllerListener;
import com.autel.sdk.flight.FlightControllerManager;
import com.autel.sdk.flight.bean.FlightState;
import com.autel.sdk.flight.bean.LocationCoordinate3D;
import com.autel.sdk.flight.bean.Velocity3D;
import com.autel.sdk.battery.BatteryManager;
import com.autel.sdk.battery.bean.BatteryState;
import com.autel.sdk.gimbal.GimbalManager;
import com.autel.sdk.gimbal.bean.GimbalState;

import com.google.gson.JsonObject;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Real-time telemetry manager for EVO Lite 640T Enterprise
 * Streams flight data, battery status, gimbal position, and GPS coordinates
 */
public class TelemetryManager {
    private static final String TAG = "TelemetryManager";
    private static final int TELEMETRY_INTERVAL_MS = 100; // 10Hz telemetry rate
    
    private BaseProduct product;
    private AtomicBoolean isStreaming = new AtomicBoolean(false);
    private ScheduledExecutorService telemetryExecutor;
    
    // MSDK managers
    private FlightControllerManager flightControllerManager;
    private BatteryManager batteryManager;
    private GimbalManager gimbalManager;
    
    // Current telemetry state
    private FlightState currentFlightState;
    private BatteryState currentBatteryState;
    private GimbalState currentGimbalState;
    
    // Telemetry callback interface
    public interface TelemetryCallback {
        void onTelemetryUpdate(JsonObject telemetryData);
        void onFlightStateChanged(FlightState flightState);
        void onBatteryWarning(BatteryState batteryState);
    }
    
    private TelemetryCallback telemetryCallback;
    
    public TelemetryManager(BaseProduct product) {
        this.product = product;
        initializeManagers();
        setupListeners();
    }
    
    /**
     * Initialize MSDK component managers
     */
    private void initializeManagers() {
        try {
            flightControllerManager = product.getFlightControllerManager();
            batteryManager = product.getBatteryManager();
            gimbalManager = product.getGimbalManager();
            
            Log.i(TAG, "Telemetry managers initialized successfully");
            
        } catch (Exception e) {
            Log.e(TAG, "Failed to initialize telemetry managers", e);
        }
    }
    
    /**
     * Set up listeners for real-time flight data
     */
    private void setupListeners() {
        if (flightControllerManager != null) {
            flightControllerManager.setFlightControllerListener(new FlightControllerListener() {
                @Override
                public void onFlightStateUpdate(FlightState flightState) {
                    currentFlightState = flightState;
                    
                    if (telemetryCallback != null) {
                        telemetryCallback.onFlightStateChanged(flightState);
                    }
                }
                
                @Override
                public void onLocationChanged(LocationCoordinate3D location) {
                    // GPS location updates handled in periodic telemetry
                }
                
                @Override
                public void onVelocityChanged(Velocity3D velocity) {
                    // Velocity updates handled in periodic telemetry
                }
            });
        }
        
        // Battery state monitoring with low battery warnings
        if (batteryManager != null) {
            batteryManager.setBatteryStateListener(batteryState -> {
                currentBatteryState = batteryState;
                
                // Check for low battery warning
                if (batteryState.getRemainingPercent() <= 20) {
                    Log.w(TAG, "Low battery warning: " + batteryState.getRemainingPercent() + "%");
                    
                    if (telemetryCallback != null) {
                        telemetryCallback.onBatteryWarning(batteryState);
                    }
                }
            });
        }
        
        // Gimbal state monitoring
        if (gimbalManager != null) {
            gimbalManager.setGimbalStateListener(gimbalState -> {
                currentGimbalState = gimbalState;
            });
        }
    }
    
    /**
     * Start real-time telemetry streaming at 10Hz
     */
    public void startTelemetryStream(TelemetryCallback callback) {
        if (isStreaming.get()) {
            Log.w(TAG, "Telemetry streaming already active");
            return;
        }
        
        this.telemetryCallback = callback;
        isStreaming.set(true);
        
        telemetryExecutor = Executors.newSingleThreadScheduledExecutor();
        telemetryExecutor.scheduleAtFixedRate(this::collectAndSendTelemetry, 
            0, TELEMETRY_INTERVAL_MS, TimeUnit.MILLISECONDS);
        
        Log.i(TAG, "Started telemetry streaming at 10Hz");
    }
    
    /**
     * Stop telemetry streaming
     */
    public void stopTelemetryStream() {
        if (!isStreaming.get()) {
            return;
        }
        
        isStreaming.set(false);
        
        if (telemetryExecutor != null) {
            telemetryExecutor.shutdown();
            telemetryExecutor = null;
        }
        
        telemetryCallback = null;
        Log.i(TAG, "Stopped telemetry streaming");
    }
    
    /**
     * Collect current telemetry data and send to callback
     */
    private void collectAndSendTelemetry() {
        if (!isStreaming.get() || telemetryCallback == null) {
            return;
        }
        
        try {
            JsonObject telemetry = new JsonObject();
            telemetry.addProperty("timestamp", System.currentTimeMillis());
            telemetry.addProperty("droneModel", "EVO_LITE_640T_ENTERPRISE");
            
            // Flight state data
            if (currentFlightState != null) {
                JsonObject flightData = new JsonObject();
                flightData.addProperty("isFlying", currentFlightState.isFlying());
                flightData.addProperty("flightMode", currentFlightState.getFlightMode().name());
                flightData.addProperty("isConnected", currentFlightState.isConnected());
                flightData.addProperty("isHomePointSet", currentFlightState.isHomePointSet());
                telemetry.add("flight", flightData);
            }
            
            // GPS and position data
            if (flightControllerManager != null) {
                LocationCoordinate3D location = flightControllerManager.getCurrentLocation();
                if (location != null) {
                    JsonObject gpsData = new JsonObject();
                    gpsData.addProperty("latitude", location.getLatitude());
                    gpsData.addProperty("longitude", location.getLongitude());
                    gpsData.addProperty("altitude", location.getAltitude());
                    gpsData.addProperty("satelliteCount", flightControllerManager.getSatelliteCount());
                    gpsData.addProperty("gpsSignal", flightControllerManager.getGPSSignalLevel());
                    telemetry.add("gps", gpsData);
                }
                
                // Velocity data
                Velocity3D velocity = flightControllerManager.getCurrentVelocity();
                if (velocity != null) {
                    JsonObject velocityData = new JsonObject();
                    velocityData.addProperty("vx", velocity.getVx());
                    velocityData.addProperty("vy", velocity.getVy());
                    velocityData.addProperty("vz", velocity.getVz());
                    velocityData.addProperty("groundSpeed", Math.sqrt(velocity.getVx() * velocity.getVx() + velocity.getVy() * velocity.getVy()));
                    telemetry.add("velocity", velocityData);
                }
            }
            
            // Battery data
            if (currentBatteryState != null) {
                JsonObject batteryData = new JsonObject();
                batteryData.addProperty("percentage", currentBatteryState.getRemainingPercent());
                batteryData.addProperty("voltage", currentBatteryState.getVoltage());
                batteryData.addProperty("current", currentBatteryState.getCurrent());
                batteryData.addProperty("temperature", currentBatteryState.getTemperature());
                batteryData.addProperty("remainingFlightTime", currentBatteryState.getRemainingFlightTime());
                batteryData.addProperty("isCharging", currentBatteryState.isCharging());
                telemetry.add("battery", batteryData);
            }
            
            // Gimbal data
            if (currentGimbalState != null) {
                JsonObject gimbalData = new JsonObject();
                gimbalData.addProperty("yaw", currentGimbalState.getYaw());
                gimbalData.addProperty("pitch", currentGimbalState.getPitch());
                gimbalData.addProperty("roll", currentGimbalState.getRoll());
                gimbalData.addProperty("mode", currentGimbalState.getGimbalMode().name());
                telemetry.add("gimbal", gimbalData);
            }
            
            // Camera status (basic info)
            JsonObject cameraData = new JsonObject();
            cameraData.addProperty("thermalAvailable", true);
            cameraData.addProperty("rgbAvailable", true);
            cameraData.addProperty("recordingState", "idle"); // Will be updated by DualCameraManager
            telemetry.add("camera", cameraData);
            
            // Send telemetry update
            telemetryCallback.onTelemetryUpdate(telemetry);
            
        } catch (Exception e) {
            Log.e(TAG, "Error collecting telemetry data", e);
        }
    }
    
    /**
     * Get current flight state
     */
    public FlightState getCurrentFlightState() {
        return currentFlightState;
    }
    
    /**
     * Get current battery state
     */
    public BatteryState getCurrentBatteryState() {
        return currentBatteryState;
    }
    
    /**
     * Get current GPS location
     */
    public LocationCoordinate3D getCurrentLocation() {
        if (flightControllerManager != null) {
            return flightControllerManager.getCurrentLocation();
        }
        return null;
    }
    
    /**
     * Check if drone is ready for flight
     */
    public boolean isReadyForFlight() {
        if (currentFlightState == null || currentBatteryState == null) {
            return false;
        }
        
        return currentFlightState.isConnected() && 
               currentFlightState.isHomePointSet() &&
               currentBatteryState.getRemainingPercent() > 20 &&
               flightControllerManager != null &&
               flightControllerManager.getSatelliteCount() >= 6;
    }
    
    /**
     * Cleanup telemetry manager
     */
    public void cleanup() {
        Log.i(TAG, "Cleaning up telemetry manager");
        
        stopTelemetryStream();
        
        // Clear listeners
        if (flightControllerManager != null) {
            flightControllerManager.setFlightControllerListener(null);
        }
        
        if (batteryManager != null) {
            batteryManager.setBatteryStateListener(null);
        }
        
        if (gimbalManager != null) {
            gimbalManager.setGimbalStateListener(null);
        }
        
        currentFlightState = null;
        currentBatteryState = null;
        currentGimbalState = null;
    }
}