package com.dronevisionpro.companion.msdk;

import android.content.Context;
import android.util.Log;

import com.autel.sdk.CommonCallback;
import com.autel.sdk.autelcraft.AutelCraft;
import com.autel.sdk.autelcraft.manager.AutelCraftManager;
import com.autel.sdk.autelcraft.manager.KeyManager;
import com.autel.sdk.product.BaseProduct;
import com.autel.sdk.product.ProductType;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Core MSDK V2.5.100 manager for Autel EVO Lite 640T Enterprise integration
 * Handles SDK initialization, drone connection, and lifecycle management
 */
public class AutelMSDKManager {
    private static final String TAG = "AutelMSDKManager";
    private static AutelMSDKManager instance;
    
    private Context context;
    private BaseProduct currentProduct;
    private AtomicBoolean isSDKRegistered = new AtomicBoolean(false);
    private AtomicBoolean isDroneConnected = new AtomicBoolean(false);
    
    // Manager components
    private FlightControlManager flightControlManager;
    private TelemetryManager telemetryManager;
    private DualCameraManager dualCameraManager;
    
    // Callbacks for connection state changes
    public interface ConnectionCallback {
        void onDroneConnected(BaseProduct product);
        void onDroneDisconnected();
        void onConnectionFailed(String error);
    }
    
    private ConnectionCallback connectionCallback;
    
    private AutelMSDKManager() {}
    
    public static synchronized AutelMSDKManager getInstance() {
        if (instance == null) {
            instance = new AutelMSDKManager();
        }
        return instance;
    }
    
    /**
     * Initialize MSDK V2.5.100 with app context
     * Must be called before any other MSDK operations
     */
    public void initialize(Context context, ConnectionCallback callback) {
        this.context = context.getApplicationContext();
        this.connectionCallback = callback;
        
        Log.i(TAG, "Initializing Autel MSDK V2.5.100 for EVO Lite 640T Enterprise");
        
        // Register SDK with Autel
        AutelCraft.registerApp(context, new CommonCallback<String>() {
            @Override
            public void onSuccess(String result) {
                Log.i(TAG, "MSDK registration successful: " + result);
                isSDKRegistered.set(true);
                setupProductConnectionListener();
                initializeManagers();
            }
            
            @Override
            public void onFailure(String error) {
                Log.e(TAG, "MSDK registration failed: " + error);
                isSDKRegistered.set(false);
                if (connectionCallback != null) {
                    connectionCallback.onConnectionFailed("SDK Registration Failed: " + error);
                }
            }
        });
    }
    
    /**
     * Set up listener for drone product connection/disconnection
     */
    private void setupProductConnectionListener() {
        AutelCraftManager.getInstance().setProductConnectListener(new AutelCraftManager.ProductConnectListener() {
            @Override
            public void productConnected(BaseProduct product) {
                Log.i(TAG, "Drone connected: " + product.getProductType());
                
                // Verify this is EVO Lite 640T Enterprise
                if (product.getProductType() == ProductType.EVO_LITE_640T_ENTERPRISE) {
                    currentProduct = product;
                    isDroneConnected.set(true);
                    
                    // Initialize drone-specific managers
                    initializeDroneManagers();
                    
                    if (connectionCallback != null) {
                        connectionCallback.onDroneConnected(product);
                    }
                    
                    Log.i(TAG, "EVO Lite 640T Enterprise successfully connected and initialized");
                } else {
                    Log.w(TAG, "Unsupported drone model: " + product.getProductType());
                    if (connectionCallback != null) {
                        connectionCallback.onConnectionFailed("Unsupported drone model. Expected EVO Lite 640T Enterprise");
                    }
                }
            }
            
            @Override
            public void productDisconnected() {
                Log.i(TAG, "Drone disconnected");
                currentProduct = null;
                isDroneConnected.set(false);
                
                // Clean up drone-specific managers
                cleanupDroneManagers();
                
                if (connectionCallback != null) {
                    connectionCallback.onDroneDisconnected();
                }
            }
        });
    }
    
    /**
     * Initialize core managers (independent of drone connection)
     */
    private void initializeManagers() {
        Log.d(TAG, "Initializing core managers");
        // These managers can be initialized without drone connection
    }
    
    /**
     * Initialize drone-specific managers (requires active drone connection)
     */
    private void initializeDroneManagers() {
        if (currentProduct == null) {
            Log.w(TAG, "Cannot initialize drone managers - no drone connected");
            return;
        }
        
        Log.d(TAG, "Initializing drone-specific managers");
        
        try {
            // Initialize flight control manager
            flightControlManager = new FlightControlManager(currentProduct);
            
            // Initialize telemetry manager
            telemetryManager = new TelemetryManager(currentProduct);
            
            // Initialize dual camera manager for RGB + Thermal
            dualCameraManager = new DualCameraManager(currentProduct);
            
            Log.i(TAG, "All drone managers initialized successfully");
            
        } catch (Exception e) {
            Log.e(TAG, "Failed to initialize drone managers", e);
            if (connectionCallback != null) {
                connectionCallback.onConnectionFailed("Manager initialization failed: " + e.getMessage());
            }
        }
    }
    
    /**
     * Clean up drone-specific managers when disconnected
     */
    private void cleanupDroneManagers() {
        Log.d(TAG, "Cleaning up drone managers");
        
        if (flightControlManager != null) {
            flightControlManager.cleanup();
            flightControlManager = null;
        }
        
        if (telemetryManager != null) {
            telemetryManager.cleanup();
            telemetryManager = null;
        }
        
        if (dualCameraManager != null) {
            dualCameraManager.cleanup();
            dualCameraManager = null;
        }
    }
    
    /**
     * Get current drone connection status
     */
    public boolean isDroneConnected() {
        return isDroneConnected.get() && currentProduct != null;
    }
    
    /**
     * Get current connected drone product
     */
    public BaseProduct getCurrentProduct() {
        return currentProduct;
    }
    
    /**
     * Get flight control manager (null if drone not connected)
     */
    public FlightControlManager getFlightControlManager() {
        return flightControlManager;
    }
    
    /**
     * Get telemetry manager (null if drone not connected)
     */
    public TelemetryManager getTelemetryManager() {
        return telemetryManager;
    }
    
    /**
     * Get dual camera manager (null if drone not connected)
     */
    public DualCameraManager getDualCameraManager() {
        return dualCameraManager;
    }
    
    /**
     * Shutdown MSDK and clean up all resources
     */
    public void shutdown() {
        Log.i(TAG, "Shutting down MSDK manager");
        
        cleanupDroneManagers();
        
        // Cleanup SDK registration if needed
        if (isSDKRegistered.get()) {
            // Autel MSDK cleanup if required
            isSDKRegistered.set(false);
        }
        
        connectionCallback = null;
        currentProduct = null;
    }
}