package com.dronevisionpro.companion;

import android.app.Application;
import android.util.Log;

import timber.log.Timber;

/**
 * Application class for DroneVision Pro Companion
 * Handles global initialization and MSDK setup
 */
public class DroneVisionApplication extends Application {
    private static final String TAG = "DroneVisionApp";
    
    @Override
    public void onCreate() {
        super.onCreate();
        
        // Initialize logging
        if (BuildConfig.DEBUG) {
            Timber.plant(new Timber.DebugTree());
        }
        
        Log.i(TAG, "DroneVision Pro Companion Application started");
        Log.i(TAG, "Target: Autel EVO Lite 640T Enterprise with MSDK V2.5.100");
        
        // Global application initialization
        initializeGlobalServices();
    }
    
    /**
     * Initialize global services and configurations
     */
    private void initializeGlobalServices() {
        // Add any global initialization here
        // MSDK will be initialized per-activity for proper lifecycle management
    }
}