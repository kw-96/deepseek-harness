//! 外链出口：WebView 里的 http(s) 链接交给系统默认浏览器打开。
//!
//! 桌面壳只服务本机 harness 页面。外部链接若留在 WebView 内导航会把壳页面
//! 顶掉，而 `target="_blank"` 的新窗口请求又会被 Tauri 默认拒绝，所以三条
//! 路径都要接管：前端把点击转成 `open_external` 命令或同窗口导航，导航钩子
//! 兜住同窗口路径，新窗口钩子兜住 `target="_blank"` 与 `window.open`。

use std::process::Command;
use std::sync::OnceLock;

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

/// 壳实际加载的 harness 页面 origin（含端口），由启动流程在导航主窗口时登记。
///
/// 判定本机地址能否离开壳必须带端口：`127.0.0.1` 上除 harness 自己之外还有
/// 别的本机服务（本地预览、调试端口等），只比 host 会把它们一并当成壳内页面
/// ——点击既不交给系统浏览器，也不被拒绝，壳直接被顶掉。
static HARNESS_ORIGIN: OnceLock<String> = OnceLock::new();

/// 登记 harness 页面的 origin；首次登记生效，之后的重启沿用同一个壳会话。
/// @param url - `dsh web` 就绪行给出的认证地址。
pub fn remember_harness_origin(url: &Url) {
    let _ = HARNESS_ORIGIN.set(url.origin().ascii_serialization());
}

/// 随包前端页面、harness 自身的页面与 WebView 内部地址：留在壳内。
///
/// 本机 http(s) 地址按 origin（含端口）比对：端口不同即为另一个服务，属于外链。
fn is_shell_internal(url: &Url) -> bool {
    if matches!(url.scheme(), "about" | "data" | "blob" | "tauri") {
        return true;
    }
    if !matches!(url.scheme(), "http" | "https") {
        return false;
    }
    if url.host_str() == Some(BUNDLED_UI_HOST) {
        return true;
    }
    HARNESS_ORIGIN
        .get()
        .is_some_and(|origin| url.origin().ascii_serialization() == *origin)
}

/// 前端点击转过来的外链出口（新窗口请求不经过导航钩子）。
#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    let parsed = Url::parse(&url).map_err(|error| format!("invalid URL {url}: {error}"))?;
    open_in_default_browser(&parsed)
}

/// 新窗口请求出口：壳内地址留在壳里新建窗口，外链交给系统默认浏览器。
///
/// `target="_blank"` 与 `window.open` 走的是新窗口请求而不是同窗口导航，
/// `on_navigation` 看不到它们；Tauri 默认拒绝新窗口，点击因此毫无反应。
/// 前端拦截器失效时，这里是唯一的出口。
/// @param url - 新窗口请求的目标地址。
/// @returns 是否允许由壳打开该窗口。
pub fn handle_new_window(url: &Url) -> bool {
    if is_shell_internal(url) {
        return true;
    }
    let _ = open_in_default_browser(url);
    false
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
