use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;

static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[tauri::command]
fn platform_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "android") {
        "android"
    } else if cfg!(target_os = "ios") {
        "ios"
    } else {
        "native"
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            platform_name,
            key_value_get,
            key_value_set,
            key_value_remove,
            blob_get,
            blob_put_atomic,
            blob_remove,
            platform_clear_data,
            open_external
        ])
        .run(tauri::generate_context!())
        .expect("error while running GYSApp native shell");
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|_| "native app-data directory is unavailable".to_owned())
}

fn safe_key(key: &str) -> String {
    let mut encoded = String::with_capacity(key.len() * 2);
    for byte in key.as_bytes() {
        encoded.push_str(&format!("{byte:02x}"));
    }
    if encoded.is_empty() {
        "empty".to_owned()
    } else {
        encoded
    }
}

fn ensure_directory(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|_| "native storage directory cannot be created".to_owned())
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "native storage path has no parent".to_owned())?;
    ensure_directory(parent)?;
    let temporary = path.with_extension(format!(
        "tmp-{}-{}",
        std::process::id(),
        TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ));
    fs::write(&temporary, bytes).map_err(|_| "native storage write failed".to_owned())?;
    fs::rename(&temporary, path).map_err(|_| {
        let _ = fs::remove_file(&temporary);
        "native storage commit failed".to_owned()
    })
}

fn value_path(app: &AppHandle, key: &str) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?
        .join("key-value")
        .join(format!("{}.json", safe_key(key))))
}

fn blob_path(app: &AppHandle, key: &str) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?
        .join("blobs")
        .join(format!("{}.bin", safe_key(key))))
}

#[tauri::command]
fn key_value_get(app: AppHandle, key: String) -> Result<Option<String>, String> {
    let path = value_path(&app, &key)?;
    match fs::read_to_string(path) {
        Ok(value) => Ok(Some(value)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err("native key-value read failed".to_owned()),
    }
}

#[tauri::command]
fn key_value_set(app: AppHandle, key: String, value: String) -> Result<(), String> {
    let path = value_path(&app, &key)?;
    atomic_write(&path, value.as_bytes())
}

#[tauri::command]
fn key_value_remove(app: AppHandle, key: String) -> Result<(), String> {
    let path = value_path(&app, &key)?;
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("native key-value remove failed".to_owned()),
    }
}

#[tauri::command]
fn blob_get(app: AppHandle, key: String) -> Result<Option<String>, String> {
    let path = blob_path(&app, &key)?;
    match fs::read(path) {
        Ok(value) => Ok(Some(BASE64.encode(value))),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err("native blob read failed".to_owned()),
    }
}

#[tauri::command]
fn blob_put_atomic(app: AppHandle, key: String, bytes: String) -> Result<(), String> {
    let decoded = BASE64
        .decode(bytes)
        .map_err(|_| "native blob payload is invalid".to_owned())?;
    let path = blob_path(&app, &key)?;
    atomic_write(&path, &decoded)
}

#[tauri::command]
fn blob_remove(app: AppHandle, key: String) -> Result<(), String> {
    let path = blob_path(&app, &key)?;
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("native blob remove failed".to_owned()),
    }
}

/// Reset only GYS-owned preferences and verified binary blobs. The parent
/// app-data directory may contain future platform metadata, so remove the two
/// versioned stores rather than recursively deleting the whole directory.
#[tauri::command]
fn platform_clear_data(app: AppHandle) -> Result<(), String> {
    let root = app_data_dir(&app)?;
    for directory in ["key-value", "blobs"] {
        let path = root.join(directory);
        match fs::remove_dir_all(path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err("native app-data reset failed".to_owned()),
        }
    }
    Ok(())
}

#[tauri::command]
#[allow(deprecated)]
fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|_| "external URL is invalid".to_owned())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("external URL is not allowed".to_owned());
    }
    app.shell()
        .open(parsed.as_str(), None)
        .map_err(|_| "external URL could not be opened".to_owned())
}

#[cfg(test)]
mod tests {
    use super::{atomic_write, safe_key};
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn storage_keys_cannot_escape_the_app_data_directory() {
        assert_eq!(safe_key("../../secrets"), "2e2e2f2e2e2f73656372657473");
        assert_eq!(safe_key(""), "empty");
        assert!(!safe_key("a/b").contains('/'));
    }

    #[test]
    fn atomic_write_replaces_content_without_leaving_a_temporary_file() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock before unix epoch")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("gysapp-native-test-{suffix}"));
        let path = directory.join("value.json");

        atomic_write(&path, br#"{"version":1}"#).expect("first write");
        atomic_write(&path, br#"{"version":2}"#).expect("replacement write");

        assert_eq!(
            fs::read_to_string(&path).expect("value exists"),
            r#"{"version":2}"#
        );
        assert!(!fs::read_dir(&directory)
            .expect("test directory exists")
            .any(|entry| {
                entry
                    .ok()
                    .and_then(|value| value.file_name().to_str().map(str::to_owned))
                    .is_some_and(|name| name.starts_with("value.tmp-"))
            }));
        fs::remove_dir_all(directory).expect("test directory cleanup");
    }
}
