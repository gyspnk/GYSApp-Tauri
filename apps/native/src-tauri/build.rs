fn main() {
    let attributes =
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "platform_name",
            "key_value_get",
            "key_value_set",
            "key_value_remove",
            "database_get",
            "database_set",
            "database_remove",
            "blob_get",
            "blob_put_atomic",
            "blob_remove",
            "platform_clear_data",
            "open_external",
            "open_egys_login",
            "egys_login_message",
            "secret_get",
            "secret_set",
            "secret_remove",
            "file_dialog_open",
            "file_dialog_save",
            "deep_link_current",
        ]));
    tauri_build::try_build(attributes).expect("failed to configure Tauri ACL");
}
