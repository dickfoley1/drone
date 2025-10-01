package com.dronevisionpro.companion.websocket;

import android.util.Log;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;

import java.net.URI;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * WebSocket client for real-time communication with DroneVision Pro web platform
 * Connects to the existing unified WebSocket event system
 */
public class DroneWebSocketClient extends WebSocketClient {
    private static final String TAG = "DroneWebSocketClient";
    private static DroneWebSocketClient instance;
    
    private Gson gson = new Gson();
    private AtomicBoolean isConnected = new AtomicBoolean(false);
    
    // Callbacks for different event types
    public interface EventCallback {
        void onMissionEvent(String eventType, JsonObject data);
        void onCaptureEvent(String eventType, JsonObject data);
        void onConfigEvent(String eventType, JsonObject data);
        void onConnectionStatusChanged(boolean connected);
    }
    
    private EventCallback eventCallback;
    
    private DroneWebSocketClient(URI serverUri) {
        super(serverUri);
    }
    
    /**
     * Get singleton instance and connect to web platform
     */
    public static synchronized DroneWebSocketClient getInstance(String websocketUrl, EventCallback callback) {
        if (instance == null) {
            try {
                URI uri = new URI(websocketUrl);
                instance = new DroneWebSocketClient(uri);
                instance.eventCallback = callback;
                Log.i(TAG, "WebSocket client created for: " + websocketUrl);
            } catch (Exception e) {
                Log.e(TAG, "Failed to create WebSocket client", e);
                return null;
            }
        }
        return instance;
    }
    
    @Override
    public void onOpen(ServerHandshake handshake) {
        Log.i(TAG, "WebSocket connected to DroneVision Pro platform");
        isConnected.set(true);
        
        // Send device identification
        sendDeviceRegistration();
        
        if (eventCallback != null) {
            eventCallback.onConnectionStatusChanged(true);
        }
    }
    
    @Override
    public void onMessage(String message) {
        Log.d(TAG, "Received message: " + message);
        
        try {
            JsonObject json = JsonParser.parseString(message).getAsJsonObject();
            String eventType = json.get("type").getAsString();
            JsonObject data = json.has("data") ? json.getAsJsonObject("data") : new JsonObject();
            
            // Route messages based on unified event system types
            handleIncomingEvent(eventType, data);
            
        } catch (Exception e) {
            Log.e(TAG, "Failed to parse incoming message", e);
        }
    }
    
    @Override
    public void onClose(int code, String reason, boolean remote) {
        Log.w(TAG, "WebSocket disconnected: " + reason + " (Code: " + code + ")");
        isConnected.set(false);
        
        if (eventCallback != null) {
            eventCallback.onConnectionStatusChanged(false);
        }
        
        // Attempt reconnection after brief delay
        if (remote) {
            attemptReconnection();
        }
    }
    
    @Override
    public void onError(Exception ex) {
        Log.e(TAG, "WebSocket error", ex);
        isConnected.set(false);
        
        if (eventCallback != null) {
            eventCallback.onConnectionStatusChanged(false);
        }
    }
    
    /**
     * Handle incoming events from web platform using unified event system
     */
    private void handleIncomingEvent(String eventType, JsonObject data) {
        if (eventCallback == null) return;
        
        Log.d(TAG, "Handling event: " + eventType);
        
        switch (eventType) {
            // Mission control events
            case "mission-start":
            case "mission-pause":
            case "mission-resume":
            case "mission-abort":
            case "mission-waypoint-update":
                eventCallback.onMissionEvent(eventType, data);
                break;
                
            // Capture events
            case "capture-trigger":
            case "capture-session-start":
            case "capture-session-end":
            case "dual-capture-request":
                eventCallback.onCaptureEvent(eventType, data);
                break;
                
            // Configuration events
            case "camera-calibration-update":
            case "flight-parameters-update":
            case "device-config-update":
                eventCallback.onConfigEvent(eventType, data);
                break;
                
            default:
                Log.w(TAG, "Unknown event type: " + eventType);
                break;
        }
    }
    
    /**
     * Send device registration to identify this mobile companion
     */
    private void sendDeviceRegistration() {
        JsonObject deviceInfo = new JsonObject();
        deviceInfo.addProperty("deviceId", android.os.Build.ID);
        deviceInfo.addProperty("deviceType", "mobile-companion");
        deviceInfo.addProperty("platform", "android");
        deviceInfo.addProperty("capabilities", "flight-control,dual-camera,telemetry");
        deviceInfo.addProperty("msdkVersion", "2.5.100");
        deviceInfo.addProperty("droneModel", "EVO_LITE_640T_ENTERPRISE");
        
        sendEvent("device-registration", deviceInfo);
    }
    
    /**
     * Send telemetry data to web platform using unified event system
     */
    public void sendTelemetryUpdate(JsonObject telemetryData) {
        if (!isConnected.get()) {
            Log.w(TAG, "Cannot send telemetry - WebSocket not connected");
            return;
        }
        
        sendEvent("telemetry-update", telemetryData);
    }
    
    /**
     * Send mission progress update
     */
    public void sendMissionProgress(String missionId, JsonObject progressData) {
        if (!isConnected.get()) return;
        
        JsonObject data = new JsonObject();
        data.addProperty("missionId", missionId);
        data.add("progress", progressData);
        
        sendEvent("mission-progress", data);
    }
    
    /**
     * Send dual capture completion event
     */
    public void sendDualCaptureComplete(String sessionId, String rgbImagePath, String thermalImagePath) {
        if (!isConnected.get()) return;
        
        JsonObject data = new JsonObject();
        data.addProperty("sessionId", sessionId);
        data.addProperty("timestamp", System.currentTimeMillis());
        data.addProperty("rgbImagePath", rgbImagePath);
        data.addProperty("thermalImagePath", thermalImagePath);
        data.addProperty("capturedBy", "mobile-companion");
        
        sendEvent("dual-capture-complete", data);
    }
    
    /**
     * Send flight log entry
     */
    public void sendFlightLogEntry(JsonObject logData) {
        if (!isConnected.get()) return;
        
        sendEvent("flight-log-entry", logData);
    }
    
    /**
     * Generic event sender using unified event structure
     */
    private void sendEvent(String eventType, JsonObject data) {
        if (!isConnected.get()) {
            Log.w(TAG, "Cannot send event - WebSocket not connected");
            return;
        }
        
        try {
            JsonObject event = new JsonObject();
            event.addProperty("type", eventType);
            event.add("data", data);
            event.addProperty("timestamp", System.currentTimeMillis());
            event.addProperty("source", "mobile-companion");
            
            String message = gson.toJson(event);
            send(message);
            
            Log.d(TAG, "Sent event: " + eventType);
            
        } catch (Exception e) {
            Log.e(TAG, "Failed to send event: " + eventType, e);
        }
    }
    
    /**
     * Attempt reconnection to web platform
     */
    private void attemptReconnection() {
        Log.i(TAG, "Attempting WebSocket reconnection in 5 seconds...");
        
        new Thread(() -> {
            try {
                Thread.sleep(5000);
                if (!isConnected.get()) {
                    reconnect();
                }
            } catch (InterruptedException e) {
                Log.w(TAG, "Reconnection attempt interrupted");
            }
        }).start();
    }
    
    /**
     * Check if WebSocket is connected
     */
    public boolean isConnected() {
        return isConnected.get() && !isClosed();
    }
    
    /**
     * Disconnect and cleanup
     */
    public void disconnect() {
        Log.i(TAG, "Disconnecting WebSocket client");
        isConnected.set(false);
        close();
    }
}