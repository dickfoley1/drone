package com.dronevisionpro.companion;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.autel.sdk.product.BaseProduct;
import com.google.gson.JsonObject;

import com.dronevisionpro.companion.msdk.AutelMSDKManager;
import com.dronevisionpro.companion.msdk.TelemetryManager;
import com.dronevisionpro.companion.msdk.FlightControlManager;
import com.dronevisionpro.companion.msdk.DualCameraManager;
import com.dronevisionpro.companion.websocket.DroneWebSocketClient;

/**
 * Main companion activity for DroneVision Pro mobile integration
 * Real-time flight control, telemetry display, and dual-camera management
 */
public class CompanionMainActivity extends AppCompatActivity 
    implements AutelMSDKManager.ConnectionCallback,
               DroneWebSocketClient.EventCallback,
               TelemetryManager.TelemetryCallback,
               FlightControlManager.FlightControlCallback,
               DualCameraManager.DualCaptureCallback {
               
    private static final String TAG = "CompanionActivity";
    private static final String WEBSOCKET_URL = "ws://10.0.2.2:5000/ws"; // Development URL
    private static final int PERMISSIONS_REQUEST_CODE = 1001;
    
    // Core managers
    private AutelMSDKManager msdkManager;
    private DroneWebSocketClient webSocketClient;
    private Handler uiHandler = new Handler(Looper.getMainLooper());
    
    // UI Components
    private TextView tvConnectionStatus;
    private View connectionIndicator;
    private TextView tvBatteryLevel;
    private TextView tvAltitude;
    private TextView tvSpeed;
    private TextView tvGpsStatus;
    private TextView tvFlightMode;
    private TextView tvMissionProgress;
    private ImageView ivBatteryIcon;
    private ImageView ivGpsIcon;
    private View indicatorRgbCamera;
    private View indicatorThermalCamera;
    
    // Control buttons
    private Button btnTakeoff;
    private Button btnLand;
    private Button btnStartMission;
    private Button btnPauseMission;
    private Button btnAbortMission;
    private Button btnReturnHome;
    private Button btnSingleCapture;
    private Button btnSyncCapture;
    
    // Permission requirements for drone operations
    private String[] requiredPermissions = {
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION,
        Manifest.permission.CAMERA,
        Manifest.permission.RECORD_AUDIO,
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.READ_MEDIA_VIDEO"
    };
    
    // Flight state tracking
    private boolean isDroneConnected = false;
    private boolean isMissionActive = false;
    private String currentMissionId = null;
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        Log.i(TAG, "DroneVision Pro Companion starting...");
        
        // Check and request permissions
        if (checkPermissions()) {
            initializeApplication();
        } else {
            requestPermissions();
        }
    }
    
    /**
     * Check if all required permissions are granted
     */
    private boolean checkPermissions() {
        for (String permission : requiredPermissions) {
            if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
                return false;
            }
        }
        return true;
    }
    
    /**
     * Request required permissions
     */
    private void requestPermissions() {
        ActivityCompat.requestPermissions(this, requiredPermissions, PERMISSIONS_REQUEST_CODE);
    }
    
    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        
        if (requestCode == PERMISSIONS_REQUEST_CODE) {
            boolean allGranted = true;
            for (int result : grantResults) {
                if (result != PackageManager.PERMISSION_GRANTED) {
                    allGranted = false;
                    break;
                }
            }
            
            if (allGranted) {
                initializeApplication();
            } else {
                Toast.makeText(this, "Permissions required for drone operations", Toast.LENGTH_LONG).show();
                finish();
            }
        }
    }
    
    /**
     * Initialize application UI and backend services
     */
    private void initializeApplication() {
        Log.i(TAG, "Initializing DroneVision Pro companion application");
        
        // Set content view and initialize UI
        setContentView(R.layout.activity_companion_main);
        initializeUI();
        
        // Initialize MSDK manager
        msdkManager = AutelMSDKManager.getInstance();
        msdkManager.initialize(this, this);
        
        // Initialize WebSocket connection to web platform
        webSocketClient = DroneWebSocketClient.getInstance(WEBSOCKET_URL, this);
        if (webSocketClient != null) {
            webSocketClient.connect();
            Log.i(TAG, "Connecting to DroneVision Pro platform...");
        } else {
            Log.e(TAG, "Failed to create WebSocket client");
        }
        
        Toast.makeText(this, "DroneVision Pro Companion Ready", Toast.LENGTH_SHORT).show();
    }
    
    /**
     * Initialize UI components and set up event listeners
     */
    private void initializeUI() {
        // Status components
        tvConnectionStatus = findViewById(R.id.tv_connection_status);
        connectionIndicator = findViewById(R.id.connection_indicator);
        
        // Telemetry display components
        tvBatteryLevel = findViewById(R.id.tv_battery_level);
        tvAltitude = findViewById(R.id.tv_altitude);
        tvSpeed = findViewById(R.id.tv_speed);
        tvGpsStatus = findViewById(R.id.tv_gps_status);
        tvFlightMode = findViewById(R.id.tv_flight_mode);
        tvMissionProgress = findViewById(R.id.tv_mission_progress);
        ivBatteryIcon = findViewById(R.id.iv_battery_icon);
        ivGpsIcon = findViewById(R.id.iv_gps_icon);
        
        // Camera status indicators
        indicatorRgbCamera = findViewById(R.id.indicator_rgb_camera);
        indicatorThermalCamera = findViewById(R.id.indicator_thermal_camera);
        
        // Flight control buttons
        btnTakeoff = findViewById(R.id.btn_takeoff);
        btnLand = findViewById(R.id.btn_land);
        btnStartMission = findViewById(R.id.btn_start_mission);
        btnPauseMission = findViewById(R.id.btn_pause_mission);
        btnAbortMission = findViewById(R.id.btn_abort_mission);
        btnReturnHome = findViewById(R.id.btn_return_home);
        
        // Camera control buttons
        btnSingleCapture = findViewById(R.id.btn_single_capture);
        btnSyncCapture = findViewById(R.id.btn_sync_capture);
        
        // Set up button click listeners
        setupButtonListeners();
        
        // Initialize UI state
        updateConnectionStatus(false);
        updateFlightControlButtons(false);
        updateCameraStatus(false, false);
    }
    
    /**
     * Set up button click listeners for flight and camera controls
     */
    private void setupButtonListeners() {
        btnTakeoff.setOnClickListener(v -> {
            if (isDroneConnected && msdkManager.getFlightControlManager() != null) {
                msdkManager.getFlightControlManager().takeoff(this);
                Log.i(TAG, "Takeoff initiated");
            }
        });
        
        btnLand.setOnClickListener(v -> {
            if (isDroneConnected && msdkManager.getFlightControlManager() != null) {
                msdkManager.getFlightControlManager().land(this);
                Log.i(TAG, "Landing initiated");
            }
        });
        
        btnStartMission.setOnClickListener(v -> {
            // Mission start will be triggered by web platform via WebSocket
            Log.i(TAG, "Mission start requested");
            Toast.makeText(this, "Waiting for mission from web platform", Toast.LENGTH_SHORT).show();
        });
        
        btnPauseMission.setOnClickListener(v -> {
            if (isMissionActive && msdkManager.getFlightControlManager() != null) {
                msdkManager.getFlightControlManager().pauseMission(currentMissionId, this);
                Log.i(TAG, "Mission pause requested");
            }
        });
        
        btnAbortMission.setOnClickListener(v -> {
            if (isMissionActive && msdkManager.getFlightControlManager() != null) {
                msdkManager.getFlightControlManager().abortMission(currentMissionId, this);
                Log.i(TAG, "Mission abort requested");
            }
        });
        
        btnReturnHome.setOnClickListener(v -> {
            if (isDroneConnected && msdkManager.getFlightControlManager() != null) {
                msdkManager.getFlightControlManager().returnToHome(this);
                Log.i(TAG, "Return to home initiated");
            }
        });
        
        btnSingleCapture.setOnClickListener(v -> {
            if (isDroneConnected && msdkManager.getDualCameraManager() != null) {
                msdkManager.getDualCameraManager().captureSingle(this);
                Log.i(TAG, "Single camera capture initiated");
            }
        });
        
        btnSyncCapture.setOnClickListener(v -> {
            if (isDroneConnected && msdkManager.getDualCameraManager() != null) {
                msdkManager.getDualCameraManager().captureSync(this);
                Log.i(TAG, "Synchronized dual camera capture initiated");
            }
        });
    }
    
    /**
     * Update connection status UI
     */
    private void updateConnectionStatus(boolean connected) {
        uiHandler.post(() -> {
            if (connected) {
                tvConnectionStatus.setText("Connected to EVO Lite 640T");
                connectionIndicator.setBackgroundResource(R.drawable.status_indicator_connected);
            } else {
                tvConnectionStatus.setText("Connecting...");
                connectionIndicator.setBackgroundResource(R.drawable.status_indicator_disconnected);
            }
        });
    }
    
    /**
     * Update flight control button states
     */
    private void updateFlightControlButtons(boolean droneConnected) {
        uiHandler.post(() -> {
            btnTakeoff.setEnabled(droneConnected);
            btnLand.setEnabled(droneConnected);
            btnStartMission.setEnabled(droneConnected);
            btnReturnHome.setEnabled(droneConnected);
            
            // Mission control buttons depend on mission state
            btnPauseMission.setEnabled(droneConnected && isMissionActive);
            btnAbortMission.setEnabled(droneConnected && isMissionActive);
        });
    }
    
    /**
     * Update camera status indicators
     */
    private void updateCameraStatus(boolean rgbActive, boolean thermalActive) {
        uiHandler.post(() -> {
            indicatorRgbCamera.setBackgroundResource(
                rgbActive ? R.drawable.status_indicator_connected : R.drawable.status_indicator_disconnected
            );
            indicatorThermalCamera.setBackgroundResource(
                thermalActive ? R.drawable.status_indicator_connected : R.drawable.status_indicator_disconnected
            );
            
            btnSingleCapture.setEnabled(isDroneConnected && (rgbActive || thermalActive));
            btnSyncCapture.setEnabled(isDroneConnected && rgbActive && thermalActive);
        });
    }
    
    // ===== AutelMSDKManager.ConnectionCallback =====
    
    @Override
    public void onDroneConnected(BaseProduct product) {
        Log.i(TAG, "Drone connected: " + product.getProductType());
        isDroneConnected = true;
        
        uiHandler.post(() -> {
            updateConnectionStatus(true);
            updateFlightControlButtons(true);
            Toast.makeText(this, "EVO Lite 640T Enterprise Connected", Toast.LENGTH_SHORT).show();
        });
        
        // Start telemetry streaming
        TelemetryManager telemetryManager = msdkManager.getTelemetryManager();
        if (telemetryManager != null) {
            telemetryManager.startTelemetryStream(this);
        }
        
        // Initialize camera status
        updateCameraStatus(true, true); // Assume both cameras available on connection
    }
    
    @Override
    public void onDroneDisconnected() {
        Log.w(TAG, "Drone disconnected");
        isDroneConnected = false;
        isMissionActive = false;
        currentMissionId = null;
        
        uiHandler.post(() -> {
            updateConnectionStatus(false);
            updateFlightControlButtons(false);
            updateCameraStatus(false, false);
            Toast.makeText(this, "Drone Disconnected", Toast.LENGTH_SHORT).show();
        });
    }
    
    @Override
    public void onConnectionFailed(String error) {
        Log.e(TAG, "Drone connection failed: " + error);
        uiHandler.post(() -> {
            Toast.makeText(this, "Connection Failed: " + error, Toast.LENGTH_LONG).show();
        });
    }
    
    // ===== TelemetryManager.TelemetryCallback =====
    
    @Override
    public void onTelemetryUpdate(JsonObject telemetryData) {
        // Update telemetry display on UI thread
        uiHandler.post(() -> {
            try {
                if (telemetryData.has("batteryLevel")) {
                    int batteryLevel = telemetryData.get("batteryLevel").getAsInt();
                    tvBatteryLevel.setText(batteryLevel + "%");
                    
                    // Update battery icon color based on level
                    if (batteryLevel > 30) {
                        ivBatteryIcon.setColorFilter(ContextCompat.getColor(this, android.R.color.holo_green_dark));
                    } else if (batteryLevel > 15) {
                        ivBatteryIcon.setColorFilter(ContextCompat.getColor(this, android.R.color.holo_orange_dark));
                    } else {
                        ivBatteryIcon.setColorFilter(ContextCompat.getColor(this, android.R.color.holo_red_dark));
                    }
                }
                
                if (telemetryData.has("altitude")) {
                    double altitude = telemetryData.get("altitude").getAsDouble();
                    tvAltitude.setText(String.format("%.1f m", altitude));
                }
                
                if (telemetryData.has("speed")) {
                    double speed = telemetryData.get("speed").getAsDouble();
                    tvSpeed.setText(String.format("%.1f m/s", speed));
                }
                
                if (telemetryData.has("gpsStatus")) {
                    String gpsStatus = telemetryData.get("gpsStatus").getAsString();
                    tvGpsStatus.setText(gpsStatus);
                    
                    // Update GPS icon color based on status
                    if ("GOOD".equals(gpsStatus)) {
                        ivGpsIcon.setColorFilter(ContextCompat.getColor(this, android.R.color.holo_green_dark));
                    } else if ("WEAK".equals(gpsStatus)) {
                        ivGpsIcon.setColorFilter(ContextCompat.getColor(this, android.R.color.holo_orange_dark));
                    } else {
                        ivGpsIcon.setColorFilter(ContextCompat.getColor(this, android.R.color.holo_red_dark));
                    }
                }
                
                if (telemetryData.has("flightMode")) {
                    String flightMode = telemetryData.get("flightMode").getAsString();
                    tvFlightMode.setText(flightMode);
                }
                
            } catch (Exception e) {
                Log.e(TAG, "Error updating telemetry display", e);
            }
        });
    }
    
    @Override
    public void onFlightStateChanged(FlightState flightState) {
        Log.d(TAG, "Flight state changed: " + flightState);
        // Handle flight state changes if needed
    }
    
    @Override
    public void onBatteryWarning(BatteryState batteryState) {
        uiHandler.post(() -> {
            Toast.makeText(this, "Battery Warning: " + batteryState, Toast.LENGTH_LONG).show();
        });
    }
    
    // ===== FlightControlManager.FlightControlCallback =====
    
    @Override
    public void onMissionStarted(String missionId) {
        Log.i(TAG, "Mission started: " + missionId);
        isMissionActive = true;
        currentMissionId = missionId;
        
        uiHandler.post(() -> {
            updateFlightControlButtons(true);
            tvMissionProgress.setText("Starting...");
            Toast.makeText(this, "Mission Started", Toast.LENGTH_SHORT).show();
        });
    }
    
    @Override
    public void onMissionProgress(String missionId, int currentWaypoint, int totalWaypoints) {
        uiHandler.post(() -> {
            String progressText = String.format("%d/%d", currentWaypoint, totalWaypoints);
            tvMissionProgress.setText(progressText);
        });
    }
    
    @Override
    public void onMissionCompleted(String missionId) {
        Log.i(TAG, "Mission completed: " + missionId);
        isMissionActive = false;
        currentMissionId = null;
        
        uiHandler.post(() -> {
            updateFlightControlButtons(true);
            tvMissionProgress.setText("Completed");
            Toast.makeText(this, "Mission Completed", Toast.LENGTH_SHORT).show();
        });
    }
    
    @Override
    public void onMissionFailed(String missionId, String error) {
        Log.e(TAG, "Mission failed: " + missionId + " - " + error);
        isMissionActive = false;
        currentMissionId = null;
        
        uiHandler.post(() -> {
            updateFlightControlButtons(true);
            tvMissionProgress.setText("Failed");
            Toast.makeText(this, "Mission Failed: " + error, Toast.LENGTH_LONG).show();
        });
    }
    
    @Override
    public void onWaypointReached(String missionId, int waypointIndex) {
        Log.d(TAG, "Waypoint reached: " + waypointIndex + " for mission " + missionId);
    }
    
    @Override
    public void onEmergencyLanding() {
        uiHandler.post(() -> {
            Toast.makeText(this, "EMERGENCY LANDING INITIATED", Toast.LENGTH_LONG).show();
        });
    }
    
    // ===== DroneWebSocketClient.EventCallback =====
    
    @Override
    public void onMissionEvent(String eventType, JsonObject data) {
        Log.d(TAG, "Mission event received: " + eventType);
        
        if ("mission-start".equals(eventType) && msdkManager.getFlightControlManager() != null) {
            msdkManager.getFlightControlManager().executeMission(data, this);
        } else if ("mission-abort".equals(eventType) && isMissionActive) {
            msdkManager.getFlightControlManager().abortMission(currentMissionId, this);
        }
    }
    
    @Override
    public void onCaptureEvent(String eventType, JsonObject data) {
        Log.d(TAG, "Capture event received: " + eventType);
        
        if ("capture-trigger".equals(eventType) && msdkManager.getDualCameraManager() != null) {
            msdkManager.getDualCameraManager().captureSync(this);
        }
    }
    
    @Override
    public void onConfigEvent(String eventType, JsonObject data) {
        Log.d(TAG, "Config event received: " + eventType);
        // Handle configuration updates if needed
    }
    
    // ===== DualCameraManager.DualCaptureCallback =====
    
    @Override
    public void onCaptureStarted() {
        uiHandler.post(() -> {
            Toast.makeText(this, "Capture Started", Toast.LENGTH_SHORT).show();
        });
    }
    
    @Override
    public void onCaptureCompleted(String rgbImagePath, String thermalImagePath) {
        Log.i(TAG, "Capture completed - RGB: " + rgbImagePath + ", Thermal: " + thermalImagePath);
        
        uiHandler.post(() -> {
            Toast.makeText(this, "Capture Completed", Toast.LENGTH_SHORT).show();
        });
        
        // Send capture result back to web platform
        if (webSocketClient != null) {
            JsonObject result = new JsonObject();
            result.addProperty("type", "capture-result");
            result.addProperty("rgbImagePath", rgbImagePath);
            result.addProperty("thermalImagePath", thermalImagePath);
            result.addProperty("timestamp", System.currentTimeMillis());
            
            webSocketClient.sendMessage(result.toString());
        }
    }
    
    @Override
    public void onCaptureFailed(String error) {
        Log.e(TAG, "Capture failed: " + error);
        
        uiHandler.post(() -> {
            Toast.makeText(this, "Capture Failed: " + error, Toast.LENGTH_LONG).show();
        });
    }
    
    @Override
    protected void onDestroy() {
        super.onDestroy();
        
        // Cleanup resources
        if (msdkManager != null) {
            TelemetryManager telemetryManager = msdkManager.getTelemetryManager();
            if (telemetryManager != null) {
                telemetryManager.stopTelemetryStream();
            }
        }
        
        if (webSocketClient != null) {
            webSocketClient.disconnect();
        }
        
        Log.i(TAG, "DroneVision Pro Companion shutting down");
    }
}