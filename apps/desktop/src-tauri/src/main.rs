#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use sha2::{Digest, Sha256};
use tauri::{webview::NewWindowResponse, Manager, Url, WebviewUrl, WebviewWindowBuilder};

fn server_url() -> Option<Url> {
    let value = std::env::var("SOTOVOR_URL").unwrap_or_else(|_| "http://127.0.0.1:3000".into());
    let url = Url::parse(&value).ok()?;
    let loopback = matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"));
    let valid = (url.scheme() == "https" || (url.scheme() == "http" && loopback))
        && url.host_str().is_some()
        && url.username().is_empty()
        && url.password().is_none()
        && url.path() == "/"
        && url.query().is_none()
        && url.fragment().is_none();
    valid.then_some(url)
}

fn is_browser_login(url: &Url) -> bool {
    if url.path() != "/" || url.fragment().is_some() {
        return false;
    }
    let mut query = url.query_pairs();
    let id = query.next().is_some_and(|(name, value)| {
        name == "desktop_link"
            && value.len() == 32
            && value.bytes().all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
    });
    let mode = query.next().is_some_and(|(name, value)| {
        name == "mode" && matches!(value.as_ref(), "login" | "register")
    });
    id && mode && query.next().is_none()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let Some(mut url) = server_url() else {
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title("Sotovor")
                    .build()?;
                return Ok(());
            };
            let origin = url.origin();
            let key = format!("{:x}", Sha256::digest(origin.ascii_serialization()));
            let data = app.path().app_local_data_dir()?.join("servers").join(key);
            std::fs::create_dir_all(&data)?;
            url.set_query(Some("app=desktop"));

            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("Sotovor")
                .inner_size(1280.0, 850.0)
                .min_inner_size(400.0, 580.0)
                .data_directory(data)
                .initialization_script(include_str!("desktop-bridge.js"))
                .on_navigation(move |target| {
                    if target.origin() != origin {
                        return false;
                    }
                    if is_browser_login(target) {
                        if let Err(error) = open::that_detached(target.as_str()) {
                            eprintln!("Brskalnika ni bilo mogoče odpreti: {error}");
                        }
                        return false;
                    }
                    true
                })
                .on_new_window(|_, _| NewWindowResponse::Deny)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Zagon namiznega Sotovora ni uspel");
}
