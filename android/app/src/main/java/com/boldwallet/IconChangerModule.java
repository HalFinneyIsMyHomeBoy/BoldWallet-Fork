package com.boldwallet;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;

public class IconChangerModule extends ReactContextBaseJavaModule {
    public IconChangerModule(ReactApplicationContext context) {
        super(context);
    }

    @Override
    public String getName() {
        return "IconChanger";  // Must match exactly in JS
    }

    @ReactMethod
    public void changeIcon(String iconName, Promise promise) {
        try {
            PackageManager pm = getReactApplicationContext().getPackageManager();
            if ("alternative".equals(iconName)) {
                pm.setComponentEnabledSetting(
                        new ComponentName(getReactApplicationContext(), "com.boldwallet.AlternativeIconActivity"),
                        PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                        PackageManager.DONT_KILL_APP
                );
                pm.setComponentEnabledSetting(
                        new ComponentName(getReactApplicationContext(), "com.boldwallet.MainActivity"),
                        PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                        PackageManager.DONT_KILL_APP
                );
            } else {
                pm.setComponentEnabledSetting(
                        new ComponentName(getReactApplicationContext(), "com.boldwallet.MainActivity"),
                        PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                        PackageManager.DONT_KILL_APP
                );
                pm.setComponentEnabledSetting(
                        new ComponentName(getReactApplicationContext(), "com.boldwallet.AlternativeIconActivity"),
                        PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                        PackageManager.DONT_KILL_APP
                );
            }

            Intent intent = getReactApplicationContext().getPackageManager()
                    .getLaunchIntentForPackage(getReactApplicationContext().getPackageName());
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
            getReactApplicationContext().startActivity(intent);
            promise.resolve("Icon changed successfully");
        } catch (Exception e) {
            promise.reject("ERROR_ICON_CHANGE", e.getMessage());
        }
    }
}