# JNI resolves this private method by its full class and method name.
-keepclasseswithmembernames,includedescriptorclasses class id.or.gys.app.MainActivity {
    native <methods>;
}
