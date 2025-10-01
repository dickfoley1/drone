# MSDK V2.5.100 AAR Libraries

This directory should contain the Autel MSDK V2.5.100 AAR library files required for EVO Lite 640T Enterprise integration.

## Required AAR Files

Place the following Autel MSDK V2.5.100 AAR files in this directory:

1. **autel-msdk-2.5.100.aar** - Core MSDK framework
2. **autel-camera-sdk-2.5.100.aar** - Camera control and dual-camera support
3. **autel-gimbal-sdk-2.5.100.aar** - Gimbal control and stabilization
4. **autel-flight-controller-2.5.100.aar** - Flight control and waypoint missions

## Obtaining MSDK V2.5.100

These AAR files must be obtained from Autel Robotics through their developer portal:

1. Register as an Autel developer at https://developer.autel.com
2. Download MSDK V2.5.100 for Android
3. Extract the AAR files from the SDK package
4. Place them in this directory

## Compatibility

- **Target Drone**: Autel EVO Lite 640T Enterprise (MDXM)
- **Controller**: Smart Controller SE V2
- **Android API**: Minimum 28 (Android 8.0+)
- **Architecture**: ARM64 (arm64-v8a)

## Alternative Development

For development without physical hardware, you can:

1. Use Autel's simulator if available in MSDK V2.5.100
2. Mock the MSDK classes for integration testing
3. Test WebSocket communication and UI independently

Once AAR files are added, the Android project will compile and be ready for device deployment.