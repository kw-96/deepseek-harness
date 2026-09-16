//! 桌面壳里的原生浏览器视图：用 Tauri 的子 WebView 承载面板要显示的网页。
//!
//! Web 模式下面板只能把远端页面截成图片再传输，画面必然经过 JPEG 压缩、网络往返
//! 与显示端重采样；桌面壳可以直接把一块真实的子 WebView 放到面板的位置上，渲染、
//! 滚动与输入全部是原生的，观感与系统浏览器一致。
//!
//! 位置与尺寸由网页侧按 DOM 矩形上报，坐标系是窗口客户区的逻辑像素（与 CSS 像素
//! 同尺度）。子 WebView 总是绘制在网页之上，因此面板把地址栏与标签条排在上方、
//! 把网页区域留成一块不重叠的矩形。

use std::sync::Mutex;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewBuilder, WebviewUrl};

/// 面板持有的唯一子 WebView；`None` 表示当前没有打开原生视图。
#[derive(Default)]
pub struct BrowserViewSlot(pub Mutex<Option<tauri::Webview<tauri::Wry>>>);

/// 把面板矩形与目标地址同步给原生视图：不存在就创建，存在就移动，地址变了才导航。
///
/// 每次同步都带完整矩形，因此网页侧只需在布局变化后重发一次，不需要增量协议。
/// 宽或高小于 1 像素时视为"暂不显示"，直接返回（面板被折叠时会走到这里）。
#[tauri::command]
pub fn browser_view_sync(
  app: AppHandle,
  slot: tauri::State<'_, BrowserViewSlot>,
  url: String,
  x: f64,
  y: f64,
  width: f64,
  height: f64,
) -> Result<(), String> {
  if width < 1.0 || height < 1.0 {
    return Ok(());
  }
  let parsed = url::Url::parse(&url).map_err(|error| format!("bad url: {error}"))?;
  let mut guard = slot.0.lock().map_err(|error| error.to_string())?;

  if let Some(view) = guard.as_ref() {
    view
      .set_position(LogicalPosition::new(x, y))
      .map_err(|error| error.to_string())?;
    view
      .set_size(LogicalSize::new(width, height))
      .map_err(|error| error.to_string())?;
    let current = view.url().map(|value| value.as_str().to_string()).unwrap_or_default();
    if current != url {
      view.navigate(parsed).map_err(|error| error.to_string())?;
    }
    return Ok(());
  }

  let window = app
    .get_window("main")
    .ok_or_else(|| "main window is unavailable".to_string())?;
  let view = window
    .add_child(
      WebviewBuilder::new("browser-panel", WebviewUrl::External(parsed)),
      LogicalPosition::new(x, y),
      LogicalSize::new(width, height),
    )
    .map_err(|error| error.to_string())?;
  *guard = Some(view);
  Ok(())
}

/// 关闭原生视图：面板关闭、切到文件标签或插件卸载时调用。
#[tauri::command]
pub fn browser_view_close(slot: tauri::State<'_, BrowserViewSlot>) -> Result<(), String> {
  let mut guard = slot.0.lock().map_err(|error| error.to_string())?;
  if let Some(view) = guard.take() {
    view.close().map_err(|error| error.to_string())?;
  }
  Ok(())
}
