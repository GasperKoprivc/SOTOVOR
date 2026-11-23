#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use sha2::{Digest, Sha256};
use tauri::{webview::NewWindowResponse, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_updater::UpdaterExt;

const PRODUCTION_URL: Option<&str> = option_env!("SOTOVOR_BUILD_URL");

fn server_url() -> Option<Url> {
    let value = std::env::var("SOTOVOR_URL")
        .unwrap_or_else(|_| PRODUCTION_URL.unwrap_or("http://127.0.0.1:3000").into());
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

async fn check_for_update(
    app: tauri::AppHandle,
    endpoint: Url,
) -> tauri_plugin_updater::Result<()> {
    let updater = app.updater_builder().endpoints(vec![endpoint])?.build()?;
    let Some(update) = updater.check().await? else {
        return Ok(());
    };
    let accepted = app
        .dialog()
        .message(format!(
            "Na voljo je Sotovor {}. Namestim posodobitev in znova zaženem aplikacijo?",
            update.version
        ))
        .title("Posodobitev Sotovora")
        .buttons(MessageDialogButtons::YesNo)
        .blocking_show();
    if accepted {
        update.download_and_install(|_, _| {}, || {}).await?;
        app.restart();
    }
    Ok(())
}

fn is_browser_login(url: &Url) -> bool {
    if url.path() != "/" || url.fragment().is_some() {
        return false;
    }
    let mut query = url.query_pairs();
    let id = query.next().is_some_and(|(name, value)| {
        name == "desktop_link"
            && value.len() == 32
            && value
                .bytes()
                .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
    });
    let mode = query.next().is_some_and(|(name, value)| {
        name == "mode" && matches!(value.as_ref(), "login" | "register")
    });
    id && mode && query.next().is_none()
}

fn is_payment_provider(url: &Url) -> bool {
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port_or_known_default() == Some(443)
        && matches!(
            url.host_str(),
            Some("checkout.stripe.com" | "billing.stripe.com")
        )
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_updater::Builder::new()
                .pubkey(include_str!("../updater.pub").trim())
                .build(),
        )
        .setup(|app| {
            let Some(mut url) = server_url() else {
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title("Sotovor")
                    .build()?;
                return Ok(());
            };
            let update_endpoint = PRODUCTION_URL
                .and_then(|value| Url::parse(value).ok())
                .filter(|production| production.scheme() == "https" && production == &url)
                .and_then(|production| production.join("download/latest.json").ok());
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
                    let same_origin = target.origin() == origin;
                    if is_payment_provider(target)
                        || (same_origin && target.path() == "/dev/mock-checkout")
                        || (same_origin && is_browser_login(target))
                    {
                        if open::that_detached(target.as_str()).is_err() {
                            eprintln!("Brskalnika ni bilo mogoče odpreti.");
                        }
                        return false;
                    }
                    same_origin
                })
                .on_new_window(|_, _| NewWindowResponse::Deny)
                .build()?;
            if let Some(endpoint) = update_endpoint {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = check_for_update(handle, endpoint).await {
                        eprintln!("Preverjanje posodobitve ni uspelo: {error}");
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Zagon namiznega Sotovora ni uspel");
}

#[cfg(test)]
mod billing_navigation_tests {
    use super::*;
    #[test]
    fn only_approved_https_payment_origins_open_externally() {
        for value in [
            "https://checkout.stripe.com/c/pay/test",
            "https://billing.stripe.com/p/session/test",
        ] {
            assert!(is_payment_provider(&Url::parse(value).unwrap()));
        }
        for value in [
            "http://checkout.stripe.com/test",
            "https://checkout.stripe.com.evil.test/test",
            "https://evil.test/test",
            "https://user@billing.stripe.com/test",
            "https://billing.stripe.com:444/test",
        ] {
            assert!(!is_payment_provider(&Url::parse(value).unwrap()));
        }
    }
}
