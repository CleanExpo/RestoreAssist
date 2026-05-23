# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# Capacitor core — reflectively-loaded plugins must survive R8 minification
-keep class com.getcapacitor.** { *; }
-keep class com.capacitorjs.** { *; }
-keep public class * extends com.getcapacitor.Plugin

# Capgo SocialLogin — Google + Apple Sign-In plugin (used by lib/oauth-native.ts)
-keep class ee.forgr.capacitor_social_login.** { *; }
-keep class com.google.android.gms.auth.api.signin.** { *; }
-keep class com.google.android.gms.common.api.** { *; }

# AppAuth (used transitively by Google Sign-In SDK for token refresh)
-keep class net.openid.appauth.** { *; }
-dontwarn net.openid.appauth.**

# OkHttp / Conscrypt (used by Google Sign-In SDK and Capacitor networking)
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn org.conscrypt.**
