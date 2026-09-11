//! 外链出口：WebView 里的 http(s) 链接交给系统默认浏览器打开。
//!
//! 桌面壳只服务本机 harness 页面。外部链接若留在 WebView 内导航会把壳页面
//! 顶掉，而 `target="_blank"` 的新窗口请求又会被 Tauri 默认拒绝，所以两条
//! 路径都要接管：前端把新窗口点击转成 `open_external` 命令，导航钩子兜住
//! 同窗口导航。

use std::process::Command;

use tauri::plugin::{Builder as PluginBuilder, TauriPlugin};
use tauri::Runtime;
use url::Url;

/// 交给系统默认浏览器打开一个 http(s) 地址。
///
/// Windows 走 `FileProtocolHandler`：不经 cmd 解析，URL 里的 `&` 等字符不会
/// 被当成命令分隔符。
fn open_in_default_browser(url: &Url) -> Result<(), String> {
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err(format!("refusing to open non-web URL scheme: {}", url.scheme()));
    }
    #[cfg(target_os = "windows")]
    let spawned = Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", url.as_str()])
        .spawn();
    #[cfg(target_os = "macos")]
    let spawned = Command::new("open").arg(url.as_str()).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let spawned = Command::new("xdg-open").arg(url.as_str()).spawn();
    spawned
        .map(|_| ())
        .map_err(|error| format!("failed to open {url} in the default browser: {error}"))
}

/// WebView2 提供随包前端页面的虚拟主机。启动页的初始导航就是它，而该地址只
/// 在 WebView 内部存在，交给系统浏览器必然打不开。
const BUNDLED_UI_HOST: &str = "tauri.localhost";

/// 随包前端页面、本机 harness 页面与 WebView 内部地址：留在壳内。
fn is_shell_internal(url: &Url) -> bool {
    if matches!(url.scheme(), "about" | "data" | "blob" | "tauri") {
        return true;
    }
    matches!(url.scheme(), "http" | "https")
        && matches!(
            url.host_str(),
            Some(BUNDLED_UI_HOST) | Some("127.0.0.1") | Some("localhost")
        )
}

/// 前端点击转过来的外链出口（新窗口请求不经过导航钩子）。
#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    let parsed = Url::parse(&url).map_err(|error| format!("invalid URL {url}: {error}"))?;
    open_in_default_browser(&parsed)
}

/// 同窗口导航兜底：外部地址一律改走默认浏览器，壳内导航放行。
pub fn navigation_plugin<R: Runtime>() -> TauriPlugin<R> {
    PluginBuilder::new("dsh-external-links")
        .on_navigation(|_webview, url| {
            if is_shell_internal(url) {
                return true;
            }
            // 浏览器打不开也不放行进 WebView：壳页面不能被外部站点顶掉。
            let _ = open_in_default_browser(url);
            false
        })
        .build()
}
