use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Manager};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_dialog::{DialogExt, FileAccessMode, FilePath};
use tauri_plugin_fs::{FsExt, OpenOptions};
use tauri_plugin_keyring_store::KeyringExt;
use tauri_plugin_shell::ShellExt;

static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);

/// Defense-in-depth bounds on the native persistence boundary. The web layer
/// only writes verified, bounded assets, but a corrupt or future frontend
/// must not be able to grow app-data without limit through one command.
const BLOB_PAYLOAD_MAX_BYTES: usize = 128 * 1024 * 1024; // 128 MB (verified media)
const KV_VALUE_MAX_BYTES: usize = 8 * 1024 * 1024; // 8 MB (preferences)
const DATABASE_VALUE_MAX_BYTES: usize = 8 * 1024 * 1024; // 8 MB (records)

fn enforce_cap(limit: usize, actual: usize, label: &str) -> Result<(), String> {
    if actual > limit {
        return Err(format!("native {label} value is too large"));
    }
    Ok(())
}

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
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_keyring_store::Builder::new()
                .service("id.or.gys.app.credentials")
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            platform_name,
            key_value_get,
            key_value_set,
            key_value_remove,
            database_get,
            database_set,
            database_remove,
            blob_get,
            blob_put_atomic,
            blob_remove,
            platform_clear_data,
            open_external,
            secret_get,
            secret_set,
            secret_remove,
            file_dialog_open,
            file_dialog_save,
            deep_link_current
        ])
        .run(tauri::generate_context!())
        .expect("error while running GYSApp native shell");
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct FileDialogOptions {
    accept: Option<Vec<String>>,
    multiple: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeFile {
    name: String,
    mime_type: String,
    bytes: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeFileToSave {
    name: String,
    mime_type: String,
    bytes: String,
}

fn secret_account(key: &str) -> Result<String, String> {
    let trimmed = key.trim();
    if trimmed.is_empty() || trimmed.len() > 200 || trimmed.chars().any(char::is_control) {
        return Err("native secret key is invalid".to_owned());
    }
    Ok(format!("gysapp.{trimmed}"))
}

#[tauri::command]
fn secret_get(app: AppHandle, key: String) -> Result<Option<String>, String> {
    let account = secret_account(&key)?;
    app.keyring()
        .store
        .get_password(&account)
        .map_err(|_| "native secure storage read failed".to_owned())
}

#[tauri::command]
fn secret_set(app: AppHandle, key: String, value: String) -> Result<(), String> {
    let account = secret_account(&key)?;
    if value.len() > 32_768 {
        return Err("native secret value is too large".to_owned());
    }
    app.keyring()
        .store
        .set_password(&account, &value)
        .map_err(|_| "native secure storage write failed".to_owned())
}

#[tauri::command]
fn secret_remove(app: AppHandle, key: String) -> Result<(), String> {
    let account = secret_account(&key)?;
    app.keyring()
        .store
        .delete(&account)
        .map_err(|_| "native secure storage remove failed".to_owned())
}

fn file_name(path: &FilePath) -> String {
    path.as_path()
        .and_then(Path::file_name)
        .and_then(|value| value.to_str())
        .map(str::to_owned)
        .unwrap_or_else(|| "gysapp-file".to_owned())
}

fn build_file_dialog(
    app: &AppHandle,
    options: &FileDialogOptions,
) -> tauri_plugin_dialog::FileDialogBuilder<tauri::Wry> {
    let mut builder = app
        .dialog()
        .file()
        .set_title("Pilih berkas GYSApp")
        .set_file_access_mode(FileAccessMode::Copy);
    if let Some(filters) = &options.accept {
        for filter in filters {
            let extension = filter
                .trim()
                .trim_start_matches('.')
                .split('/')
                .next_back()
                .unwrap_or_default()
                .trim_start_matches('*')
                .trim_start_matches('.');
            if !extension.is_empty() && extension.len() <= 32 {
                builder = builder.add_filter(extension, &[extension]);
            }
        }
    }
    builder
}

#[tauri::command]
async fn file_dialog_open(
    app: AppHandle,
    options: Option<FileDialogOptions>,
) -> Result<Option<Vec<NativeFile>>, String> {
    let options = options.unwrap_or_default();
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let mut sender = Some(sender);
    let builder = build_file_dialog(&app, &options);
    if options.multiple.unwrap_or(false) {
        builder.pick_files(move |paths| {
            if let Some(sender) = sender.take() {
                let _ = sender.send(paths);
            }
        });
    } else {
        builder.pick_file(move |path| {
            if let Some(sender) = sender.take() {
                let _ = sender.send(path.map(|value| vec![value]));
            }
        });
    }
    let Some(paths) = receiver
        .await
        .map_err(|_| "native file dialog was interrupted".to_owned())?
    else {
        return Ok(None);
    };
    let mut files = Vec::with_capacity(paths.len());
    for path in paths {
        let name = file_name(&path);
        let bytes = app
            .fs()
            .read(path)
            .map_err(|_| "native file could not be read".to_owned())?;
        files.push(NativeFile {
            name,
            mime_type: "application/octet-stream".to_owned(),
            bytes: BASE64.encode(bytes),
        });
    }
    Ok(Some(files))
}

#[tauri::command]
async fn file_dialog_save(app: AppHandle, file: NativeFileToSave) -> Result<(), String> {
    let name = file.name.trim();
    if name.is_empty()
        || name.len() > 255
        || name.chars().any(|value| {
            value.is_control()
                || matches!(value, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')
        })
    {
        return Err("native file name is invalid".to_owned());
    }
    let bytes = BASE64
        .decode(file.bytes)
        .map_err(|_| "native file payload is invalid".to_owned())?;
    if bytes.len() > 64 * 1024 * 1024 {
        return Err("native file payload is too large".to_owned());
    }
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_file_name(name)
        .save_file(move |path| {
            let _ = sender.send(path);
        });
    let Some(path) = receiver
        .await
        .map_err(|_| "native save dialog was interrupted".to_owned())?
    else {
        return Ok(());
    };
    let mut open_options = OpenOptions::default();
    open_options.write(true).create(true).truncate(true);
    let mut output = app
        .fs()
        .open(path, open_options)
        .map_err(|_| "native output file could not be opened".to_owned())?;
    output
        .write_all(&bytes)
        .map_err(|_| "native output file could not be written".to_owned())?;
    let _ = file.mime_type;
    Ok(())
}

#[tauri::command]
fn deep_link_current(app: AppHandle) -> Result<Option<Vec<String>>, String> {
    app.deep_link()
        .get_current()
        .map_err(|_| "native deep-link state is unavailable".to_owned())
        .map(|urls| urls.map(|values| values.into_iter().map(|url| url.to_string()).collect()))
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

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("gysapp.sqlite3"))
}

fn open_database(app: &AppHandle) -> Result<Connection, String> {
    let path = database_path(app)?;
    if let Some(parent) = path.parent() {
        ensure_directory(parent)?;
    }
    let connection =
        Connection::open(path).map_err(|_| "native database cannot be opened".to_owned())?;
    connection
        .execute_batch(
            "PRAGMA journal_mode = WAL;
             CREATE TABLE IF NOT EXISTS platform_kv (
               key TEXT PRIMARY KEY NOT NULL,
               value TEXT NOT NULL
             );",
        )
        .map_err(|_| "native database schema cannot be initialized".to_owned())?;
    Ok(connection)
}

#[tauri::command]
fn database_get(app: AppHandle, key: String) -> Result<Option<String>, String> {
    let connection = open_database(&app)?;
    connection
        .query_row(
            "SELECT value FROM platform_kv WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "native database read failed".to_owned())
}

#[tauri::command]
fn database_set(app: AppHandle, key: String, value: String) -> Result<(), String> {
    enforce_cap(DATABASE_VALUE_MAX_BYTES, value.len(), "database")?;
    let mut connection = open_database(&app)?;
    let transaction = connection
        .transaction()
        .map_err(|_| "native database transaction failed".to_owned())?;
    transaction
        .execute(
            "INSERT INTO platform_kv (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map_err(|_| "native database write failed".to_owned())?;
    transaction
        .commit()
        .map_err(|_| "native database commit failed".to_owned())
}

#[tauri::command]
fn database_remove(app: AppHandle, key: String) -> Result<(), String> {
    let connection = open_database(&app)?;
    connection
        .execute("DELETE FROM platform_kv WHERE key = ?1", params![key])
        .map(|_| ())
        .map_err(|_| "native database remove failed".to_owned())
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
    enforce_cap(KV_VALUE_MAX_BYTES, value.len(), "key-value")?;
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
    enforce_cap(BLOB_PAYLOAD_MAX_BYTES, decoded.len(), "blob")?;
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
    for suffix in ["", "-wal", "-shm"] {
        let path = root.join(format!("gysapp.sqlite3{suffix}"));
        match fs::remove_file(path) {
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
    use super::{
        atomic_write, enforce_cap, safe_key, BLOB_PAYLOAD_MAX_BYTES, DATABASE_VALUE_MAX_BYTES,
        KV_VALUE_MAX_BYTES,
    };
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn payload_caps_reject_oversized_values_and_accept_boundaries() {
        assert!(enforce_cap(BLOB_PAYLOAD_MAX_BYTES, BLOB_PAYLOAD_MAX_BYTES, "blob").is_ok());
        assert!(enforce_cap(BLOB_PAYLOAD_MAX_BYTES, BLOB_PAYLOAD_MAX_BYTES + 1, "blob").is_err());
        assert!(enforce_cap(KV_VALUE_MAX_BYTES, 1, "key-value").is_ok());
        assert!(enforce_cap(KV_VALUE_MAX_BYTES, KV_VALUE_MAX_BYTES + 1, "key-value").is_err());
        assert!(enforce_cap(
            DATABASE_VALUE_MAX_BYTES,
            DATABASE_VALUE_MAX_BYTES,
            "database"
        )
        .is_ok());
        assert!(enforce_cap(
            DATABASE_VALUE_MAX_BYTES,
            DATABASE_VALUE_MAX_BYTES + 1,
            "database"
        )
        .is_err());
    }

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
