# JNI resolves this private method by its full class and method name.
-keepclasseswithmembernames,includedescriptorclasses class id.or.gys.app.MainActivity {
    native <methods>;
}

# Safe R8 size optimizations for lean release DEX without breaking JNI/WebView.
-optimizationpasses 3
-assumenosideeffects class android.util.Log {
    public static boolean isLoggable(java.lang.String, int);
    public static int v(...);
    public static int d(...);
    public static int i(...);
}
