package com.boldwallet;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Handler;
import android.os.Looper;

public class IconChangerModule extends ReactContextBaseJavaModule {
    private static final String PREFS_NAME = "IconChangerPrefs";
    private static final String CURRENT_ICON_KEY = "current_icon";
    private static final String ICON_MAIN = "com.boldwallet.MainActivity";
    private static final String ICON_ALTERNATIVE = "com.boldwallet.AlternativeIconActivity";

    public IconChangerModule(ReactApplicationContext context) {
        super(context);
    }

    @Override
    public String getName() {
        return "IconChanger";
    }

    @ReactMethod
    public void changeIcon(String iconName, Promise promise) {
        try {
            String packageName = getReactApplicationContext().getPackageName();
            PackageManager pm = getReactApplicationContext().getPackageManager();
            
            boolean switchToAlternative = "alternative".equals(iconName);
            
            // Disable old icon
            String oldIconComponent = switchToAlternative ? ICON_MAIN : ICON_ALTERNATIVE;
            pm.setComponentEnabledSetting(
                    new ComponentName(packageName, oldIconComponent),
                    PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                    PackageManager.DONT_KILL_APP
            );
            
            // Enable new icon
            String newIconComponent = switchToAlternative ? ICON_ALTERNATIVE : ICON_MAIN;
            pm.setComponentEnabledSetting(
                    new ComponentName(packageName, newIconComponent),
                    PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                    PackageManager.DONT_KILL_APP
            );
            
            // Save preference
            SharedPreferences prefs = getReactApplicationContext().getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE);
            prefs.edit().putString(CURRENT_ICON_KEY, iconName).apply();
            
            // Delay restart to ensure settings are applied
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                try {
                    Intent intent = pm.getLaunchIntentForPackage(packageName);
                    if (intent != null) {
                        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
                        getReactApplicationContext().startActivity(intent);
                    }
                    promise.resolve("Icon changed successfully");
                } catch (Exception e) {
                    promise.reject("ERROR_RESTART", "Failed to restart app: " + e.getMessage());
                }
            }, 500);
            
        } catch (Exception e) {
            promise.reject("ERROR_ICON_CHANGE", "Failed to change icon: " + e.getMessage());
        }
    }

    @ReactMethod
    public void getCurrentIcon(Promise promise) {
        try {
            SharedPreferences prefs = getReactApplicationContext().getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE);
            String currentIcon = prefs.getString(CURRENT_ICON_KEY, "default");
            promise.resolve(currentIcon);
        } catch (Exception e) {
            promise.reject("ERROR_GET_ICON", "Failed to get current icon: " + e.getMessage());
        }
    }

    @ReactMethod
    public void resetToDefaultIcon(Promise promise) {
        try {
            String packageName = getReactApplicationContext().getPackageName();
            PackageManager pm = getReactApplicationContext().getPackageManager();
            
            // Enable MainActivity (default icon)
            pm.setComponentEnabledSetting(
                    new ComponentName(packageName, ICON_MAIN),
                    PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                    PackageManager.DONT_KILL_APP
            );
            
            // Disable AlternativeIconActivity
            pm.setComponentEnabledSetting(
                    new ComponentName(packageName, ICON_ALTERNATIVE),
                    PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                    PackageManager.DONT_KILL_APP
            );
            
            // Save preference
            SharedPreferences prefs = getReactApplicationContext().getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE);
            prefs.edit().putString(CURRENT_ICON_KEY, "default").apply();
            
            promise.resolve("Reset to default icon successfully");
        } catch (Exception e) {
            promise.reject("ERROR_RESET_ICON", "Failed to reset icon: " + e.getMessage());
        }
    }
}