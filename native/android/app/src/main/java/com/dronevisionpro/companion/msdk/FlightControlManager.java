package com.dronevisionpro.companion.msdk;

import android.util.Log;

import com.autel.sdk.CommonCallback;
import com.autel.sdk.product.BaseProduct;
import com.autel.sdk.flight.FlightControllerManager;
import com.autel.sdk.flight.bean.FlightState;
import com.autel.sdk.flight.bean.LocationCoordinate3D;
import com.autel.sdk.flight.bean.WaypointMission;
import com.autel.sdk.flight.bean.Waypoint;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Flight control manager for EVO Lite 640T Enterprise mission execution
 * Handles waypoint missions, flight path control, and automated flight operations
 */
public class FlightControlManager {
    private static final String TAG = "FlightControlManager";
    
    private BaseProduct product;
    private FlightControllerManager flightControllerManager;
    private AtomicBoolean isMissionActive = new AtomicBoolean(false);
    private WaypointMission currentMission;
    
    // Flight control callbacks
    public interface FlightControlCallback {
        void onMissionStarted(String missionId);
        void onMissionProgress(String missionId, int currentWaypoint, int totalWaypoints);
        void onMissionCompleted(String missionId);
        void onMissionFailed(String missionId, String error);
        void onWaypointReached(String missionId, int waypointIndex);
        void onEmergencyLanding();
    }
    
    private FlightControlCallback flightCallback;
    
    public FlightControlManager(BaseProduct product) {
        this.product = product;
        this.flightControllerManager = product.getFlightControllerManager();
        
        if (flightControllerManager == null) {
            Log.e(TAG, "FlightControllerManager not available");
        } else {
            Log.i(TAG, "Flight control manager initialized");
        }
    }
    
    /**
     * Execute mission from web platform waypoint data
     */
    public void executeMission(JsonObject missionData, FlightControlCallback callback) {
        if (flightControllerManager == null) {
            Log.e(TAG, "Cannot execute mission - flight controller not available");
            if (callback != null) {
                callback.onMissionFailed("", "Flight controller not available");
            }
            return;
        }
        
        if (isMissionActive.get()) {
            Log.w(TAG, "Cannot start mission - another mission is already active");
            if (callback != null) {
                callback.onMissionFailed("", "Another mission is already active");
            }
            return;
        }
        
        this.flightCallback = callback;
        String missionId = missionData.get("id").getAsString();
        
        try {
            // Parse mission waypoints from web platform format
            WaypointMission waypointMission = parseWebPlatformMission(missionData);
            
            if (waypointMission == null) {
                Log.e(TAG, "Failed to parse mission waypoints");
                if (callback != null) {
                    callback.onMissionFailed(missionId, "Invalid mission waypoints");
                }
                return;
            }
            
            currentMission = waypointMission;
            
            // Upload mission to drone
            flightControllerManager.uploadWaypointMission(waypointMission, new CommonCallback<Boolean>() {
                @Override
                public void onSuccess(Boolean result) {
                    if (result) {
                        Log.i(TAG, "Mission uploaded successfully: " + missionId);
                        startMissionExecution(missionId);
                    } else {
                        Log.e(TAG, "Mission upload failed: " + missionId);
                        if (flightCallback != null) {
                            flightCallback.onMissionFailed(missionId, "Mission upload failed");
                        }
                    }
                }
                
                @Override
                public void onFailure(String error) {
                    Log.e(TAG, "Mission upload error: " + error);
                    if (flightCallback != null) {
                        flightCallback.onMissionFailed(missionId, "Upload error: " + error);
                    }
                }
            });
            
        } catch (Exception e) {
            Log.e(TAG, "Error executing mission", e);
            if (callback != null) {
                callback.onMissionFailed(missionId, "Execution error: " + e.getMessage());
            }
        }
    }
    
    /**
     * Parse mission data from web platform format to MSDK WaypointMission
     */
    private WaypointMission parseWebPlatformMission(JsonObject missionData) {
        try {
            WaypointMission mission = new WaypointMission();
            
            // Mission parameters
            if (missionData.has("altitude")) {
                mission.setMissionAltitude((float) missionData.get("altitude").getAsDouble());
            } else {
                mission.setMissionAltitude(50.0f); // Default 50m altitude
            }
            
            if (missionData.has("speed")) {
                mission.setMissionSpeed((float) missionData.get("speed").getAsDouble());
            } else {
                mission.setMissionSpeed(5.0f); // Default 5 m/s speed
            }
            
            // Set mission execution mode
            mission.setFinishedAction(WaypointMission.FinishedAction.AUTO_RETURN_TO_HOME);
            mission.setHeadingMode(WaypointMission.HeadingMode.AUTO);
            mission.setFlightPathMode(WaypointMission.FlightPathMode.NORMAL);
            
            // Parse waypoints
            JsonArray waypointsArray = missionData.getAsJsonArray("waypoints");\n            List<Waypoint> waypoints = new ArrayList<>();\n            \n            for (JsonElement waypointElement : waypointsArray) {\n                JsonObject waypointJson = waypointElement.getAsJsonObject();\n                \n                Waypoint waypoint = new Waypoint();\n                waypoint.setLatitude(waypointJson.get("latitude").getAsDouble());\n                waypoint.setLongitude(waypointJson.get("longitude").getAsDouble());\n                \n                // Use mission altitude or waypoint-specific altitude\n                if (waypointJson.has("altitude")) {\n                    waypoint.setAltitude((float) waypointJson.get("altitude").getAsDouble());\n                } else {\n                    waypoint.setAltitude(mission.getMissionAltitude());\n                }\n                \n                // Waypoint actions (e.g., capture photos)\n                if (waypointJson.has("actions")) {\n                    JsonArray actions = waypointJson.getAsJsonArray("actions");\n                    for (JsonElement actionElement : actions) {\n                        JsonObject action = actionElement.getAsJsonObject();\n                        String actionType = action.get("type").getAsString();\n                        \n                        if ("capture".equals(actionType)) {\n                            // Add capture action at this waypoint\n                            waypoint.addAction(new Waypoint.WaypointAction(\n                                Waypoint.WaypointActionType.TAKE_PHOTO,\n                                0 // No delay\n                            ));\n                        }\n                    }\n                }\n                \n                waypoints.add(waypoint);\n            }\n            \n            mission.setWaypoints(waypoints);\n            \n            Log.i(TAG, "Parsed mission with " + waypoints.size() + " waypoints");\n            return mission;\n            \n        } catch (Exception e) {\n            Log.e(TAG, "Error parsing mission waypoints", e);\n            return null;\n        }\n    }\n    \n    /**\n     * Start mission execution on drone\n     */\n    private void startMissionExecution(String missionId) {\n        flightControllerManager.startWaypointMission(new CommonCallback<Boolean>() {\n            @Override\n            public void onSuccess(Boolean result) {\n                if (result) {\n                    Log.i(TAG, "Mission execution started: " + missionId);\n                    isMissionActive.set(true);\n                    \n                    if (flightCallback != null) {\n                        flightCallback.onMissionStarted(missionId);\n                    }\n                    \n                    // Monitor mission progress\n                    startMissionMonitoring(missionId);\n                    \n                } else {\n                    Log.e(TAG, "Failed to start mission execution: " + missionId);\n                    if (flightCallback != null) {\n                        flightCallback.onMissionFailed(missionId, "Failed to start execution");\n                    }\n                }\n            }\n            \n            @Override\n            public void onFailure(String error) {\n                Log.e(TAG, "Mission start error: " + error);\n                if (flightCallback != null) {\n                    flightCallback.onMissionFailed(missionId, "Start error: " + error);\n                }\n            }\n        });\n    }\n    \n    /**\n     * Monitor mission progress and waypoint completion\n     */\n    private void startMissionMonitoring(String missionId) {\n        // Set up mission progress listener\n        flightControllerManager.setWaypointMissionListener(new FlightControllerManager.WaypointMissionListener() {\n            @Override\n            public void onWaypointReached(int waypointIndex) {\n                Log.d(TAG, "Reached waypoint: " + waypointIndex);\n                \n                if (flightCallback != null) {\n                    flightCallback.onWaypointReached(missionId, waypointIndex);\n                    \n                    // Send progress update\n                    int totalWaypoints = currentMission != null ? currentMission.getWaypoints().size() : 0;\n                    flightCallback.onMissionProgress(missionId, waypointIndex + 1, totalWaypoints);\n                }\n            }\n            \n            @Override\n            public void onMissionCompleted() {\n                Log.i(TAG, "Mission completed: " + missionId);\n                isMissionActive.set(false);\n                \n                if (flightCallback != null) {\n                    flightCallback.onMissionCompleted(missionId);\n                }\n                \n                currentMission = null;\n            }\n            \n            @Override\n            public void onMissionInterrupted(String reason) {\n                Log.w(TAG, "Mission interrupted: " + reason);\n                isMissionActive.set(false);\n                \n                if (flightCallback != null) {\n                    flightCallback.onMissionFailed(missionId, "Mission interrupted: " + reason);\n                }\n                \n                currentMission = null;\n            }\n        });\n    }\n    \n    /**\n     * Pause current mission\n     */\n    public void pauseMission() {\n        if (!isMissionActive.get() || flightControllerManager == null) {\n            Log.w(TAG, "Cannot pause - no active mission");\n            return;\n        }\n        \n        flightControllerManager.pauseWaypointMission(new CommonCallback<Boolean>() {\n            @Override\n            public void onSuccess(Boolean result) {\n                Log.i(TAG, "Mission paused successfully");\n            }\n            \n            @Override\n            public void onFailure(String error) {\n                Log.e(TAG, "Failed to pause mission: " + error);\n            }\n        });\n    }\n    \n    /**\n     * Resume paused mission\n     */\n    public void resumeMission() {\n        if (!isMissionActive.get() || flightControllerManager == null) {\n            Log.w(TAG, "Cannot resume - no active mission");\n            return;\n        }\n        \n        flightControllerManager.resumeWaypointMission(new CommonCallback<Boolean>() {\n            @Override\n            public void onSuccess(Boolean result) {\n                Log.i(TAG, "Mission resumed successfully");\n            }\n            \n            @Override\n            public void onFailure(String error) {\n                Log.e(TAG, "Failed to resume mission: " + error);\n            }\n        });\n    }\n    \n    /**\n     * Abort current mission and return to home\n     */\n    public void abortMission() {\n        if (!isMissionActive.get() || flightControllerManager == null) {\n            Log.w(TAG, "Cannot abort - no active mission");\n            return;\n        }\n        \n        flightControllerManager.stopWaypointMission(new CommonCallback<Boolean>() {\n            @Override\n            public void onSuccess(Boolean result) {\n                Log.i(TAG, "Mission aborted successfully");\n                isMissionActive.set(false);\n                currentMission = null;\n            }\n            \n            @Override\n            public void onFailure(String error) {\n                Log.e(TAG, "Failed to abort mission: " + error);\n            }\n        });\n    }\n    \n    /**\n     * Emergency return to home\n     */\n    public void returnToHome() {\n        if (flightControllerManager == null) {\n            Log.e(TAG, "Cannot return to home - flight controller not available");\n            return;\n        }\n        \n        flightControllerManager.returnToHome(new CommonCallback<Boolean>() {\n            @Override\n            public void onSuccess(Boolean result) {\n                Log.i(TAG, "Return to home initiated");\n                isMissionActive.set(false);\n                currentMission = null;\n                \n                if (flightCallback != null) {\n                    flightCallback.onEmergencyLanding();\n                }\n            }\n            \n            @Override\n            public void onFailure(String error) {\n                Log.e(TAG, "Failed to return to home: " + error);\n            }\n        });\n    }\n    \n    /**\n     * Check if mission is currently active\n     */\n    public boolean isMissionActive() {\n        return isMissionActive.get();\n    }\n    \n    /**\n     * Get current mission details\n     */\n    public WaypointMission getCurrentMission() {\n        return currentMission;\n    }\n    \n    /**\n     * Cleanup flight control manager\n     */\n    public void cleanup() {\n        Log.i(TAG, "Cleaning up flight control manager");\n        \n        // Abort any active mission\n        if (isMissionActive.get()) {\n            abortMission();\n        }\n        \n        // Clear listeners\n        if (flightControllerManager != null) {\n            flightControllerManager.setWaypointMissionListener(null);\n        }\n        \n        flightCallback = null;\n        currentMission = null;\n        isMissionActive.set(false);\n    }\n}