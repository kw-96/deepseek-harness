//! 系统托盘：窗口关闭后常驻托盘，右键菜单可快速进入工作区、恢复窗口或退出。
//!
//! 菜单文案由前端经 `set_desktop_tray` 下发（文案归客户端 locale 所有），
//! `FALLBACK_*` 常量只覆盖前端尚未就绪的启动窗口期。

use crate::child::{self, ChildSlot};
use serde::Deserialize;
use tauri::image::Image;
use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

/// 托盘图标 id，供前端同步菜单时定位。
const TRAY_ID: &str = "dsh-desktop-tray";
/// 工作区菜单项 id 前缀，其后为主窗口前端持有的工作区 id。
const WORKSPACE_PREFIX: &str = "workspace:";
const MENU_SHOW: &str = "show-window";
const MENU_QUIT: &str = "quit-app";
const MENU_EMPTY: &str = "workspace-empty";
/// 托盘菜单点击工作区时发给前端的窗口事件名。
const OPEN_WORKSPACE_EVENT: &str = "tray-open-workspace";
/// 打包进二进制的托盘图标。
const TRAY_ICON: &[u8] = include_bytes!("../icons/32x32.png");

/// 前端就绪前的兜底文案，随 `set_desktop_tray` 到达即被覆盖。
const FALLBACK_SHOW: &str = "显示主窗口";
const FALLBACK_QUIT: &str = "退出 DeepSeek Harness";
const FALLBACK_EMPTY: &str = "暂无工作区";

/// 托盘菜单里的一个工作区条目。
#[derive(Clone, Deserialize)]
pub struct TrayWorkspace {
    /// 主窗口前端使用的工作区 id。
    pub id: String,
    /// 菜单显示名。
    pub title: String,
}

/// 前端下发的整份菜单数据。
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayMenuSpec {
    /// 工作区条目，按显示顺序排列。
    pub workspaces: Vec<TrayWorkspace>,
    /// 「显示主窗口」文案。
    pub show_label: String,
    /// 「退出」文案。
    pub quit_label: String,
    /// 无工作区时的占位文案。
    pub empty_label: String,
}

impl Default for TrayMenuSpec {
    fn default() -> Self {
        Self {
            workspaces: Vec::new(),
            show_label: FALLBACK_SHOW.to_string(),
            quit_label: FALLBACK_QUIT.to_string(),
            empty_label: FALLBACK_EMPTY.to_string(),
        }
    }
}

/// 按当前数据重建托盘菜单。
fn build_menu(app: &AppHandle, spec: &TrayMenuSpec) -> tauri::Result<Menu<tauri::Wry>> {
    let mut owned: Vec<MenuItem<tauri::Wry>> = Vec::new();
    if spec.workspaces.is_empty() {
        owned.push(MenuItem::with_id(app, MENU_EMPTY, &spec.empty_label, false, None::<&str>)?);
    } else {
        for workspace in &spec.workspaces {
            owned.push(MenuItem::with_id(
                app,
                format!("{WORKSPACE_PREFIX}{}", workspace.id),
                &workspace.title,
                true,
                None::<&str>,
            )?);
        }
    }
    let show = MenuItem::with_id(app, MENU_SHOW, &spec.show_label, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, MENU_QUIT, &spec.quit_label, true, None::<&str>)?;
    let sep_workspaces = PredefinedMenuItem::separator(app)?;
    let sep_actions = PredefinedMenuItem::separator(app)?;

    let mut items: Vec<&dyn IsMenuItem<tauri::Wry>> = Vec::new();
    for item in &owned {
        items.push(item);
    }
    items.push(&sep_workspaces);
    items.push(&show);
    items.push(&sep_actions);
    items.push(&quit);
    Menu::with_items(app, &items)
}

/// 恢复并聚焦主窗口。
pub(crate) fn reveal_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// 结束 `dsh web` 子进程树并退出应用。
pub(crate) fn quit(app: &AppHandle) {
    child::shutdown(app.state::<ChildSlot>().inner());
    app.exit(0);
}

/// 处理一次托盘菜单点击。
fn on_menu_select(app: &AppHandle, id: &str) {
    if id == MENU_QUIT {
        quit(app);
    } else if id == MENU_SHOW {
        reveal_main(app);
    } else if let Some(workspace) = id.strip_prefix(WORKSPACE_PREFIX) {
        reveal_main(app);
        let _ = app.emit(OPEN_WORKSPACE_EVENT, workspace.to_string());
    }
}

/// 创建常驻托盘图标：左键单击恢复窗口，右键弹出菜单。
pub(crate) fn setup(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app, &TrayMenuSpec::default())?;
    let icon = Image::from_bytes(TRAY_ICON)?;
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip("DeepSeek Harness")
        .menu(&menu)
        // 右键负责菜单，左键留给"恢复窗口"。
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            on_menu_select(app, event.id().as_ref());
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                reveal_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

/// 用前端下发的数据重建托盘菜单。
///
/// @param app - 应用句柄。
/// @param spec - 工作区条目与全部菜单文案。
/// @returns 托盘尚未建立或菜单重建失败时的错误描述。
#[tauri::command]
pub fn set_desktop_tray(app: AppHandle, spec: TrayMenuSpec) -> Result<(), String> {
    let tray = app
        .tray_by_id(TRAY_ID)
        .ok_or_else(|| format!("tray icon {TRAY_ID} is not installed"))?;
    let menu = build_menu(&app, &spec).map_err(|error| error.to_string())?;
    tray.set_menu(Some(menu)).map_err(|error| error.to_string())
}

/// 托盘「退出」与顶栏 File 菜单共用的退出命令。
///
/// @param app - 应用句柄。
#[tauri::command]
pub fn quit_desktop_app(app: AppHandle) {
    quit(&app);
}
