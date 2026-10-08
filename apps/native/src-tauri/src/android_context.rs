//! The keyring backend requires ndk-context, which Wry does not initialize.
//! Keep the application (not Activity) alive across rotation/recreation.
use jni::{
    objects::{GlobalRef, JObject},
    JNIEnv,
};
use std::sync::OnceLock;

static CONTEXT: OnceLock<Result<GlobalRef, String>> = OnceLock::new();

pub fn ensure_ready() -> Result<(), String> {
    match CONTEXT.get() {
        Some(Ok(_)) => Ok(()),
        _ => Err("Android credential context is unavailable".to_owned()),
    }
}

#[no_mangle]
pub extern "system" fn Java_id_or_gys_app_MainActivity_initializeCredentialContext(
    mut env: JNIEnv,
    _activity: JObject,
    context: JObject,
) {
    let initialized = CONTEXT.get_or_init(|| {
        let reference = env.new_global_ref(context).map_err(|e| e.to_string())?;
        let vm = env.get_java_vm().map_err(|e| e.to_string())?;
        // Called once before Tauri starts; the global application reference is
        // retained for the process lifetime and shared by all credential calls.
        unsafe {
            ndk_context::initialize_android_context(
                vm.get_java_vm_pointer().cast(),
                reference.as_obj().as_raw().cast(),
            );
        }
        Ok(reference)
    });
    if let Err(error) = initialized {
        let _ = env.throw_new("java/lang/IllegalStateException", error);
    }
}
