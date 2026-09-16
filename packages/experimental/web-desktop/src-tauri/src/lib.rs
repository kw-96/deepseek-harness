//! Experimental desktop shell: spawn `dsh web --no-open`, then open its
//! authenticated local URL in the main WebView window.

mod alert;
mod backend;
mod child;
mod external_links;
mod resolve;
mod tray;

use child::ChildSlot;
use std::env;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{Emitter, Manager, RunEvent, WindowEvent};

type BootLogs = Arc<Mutex<Vec<String>>>;

/// 返回启动页加载前已经产生的启动日志，补齐 WebView 尚未监听期间丢失的行。
#[tauri::command]
fn get_boot_logs(logs: tauri::State<BootLogs>) -> Vec<String> {
  logs.lock().map(|guard| guard.clone()).unwrap_or_default()
}

/// 转发给 `dsh web` 的额外 CLI 参数。
fn passthrough_args() -> Vec<String> {
  env::args().skip(1).collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let child_slot: ChildSlot = Arc::new(Mutex::new(None));
  let child_for_setup = Arc::clone(&child_slot);
  let child_for_window = Arc::clone(&child_slot);
  let child_for_exit = Arc::clone(&child_slot);
  let extra_args = passthrough_args();

  let app = tauri::Builder::default()
    // 单实例必须排在第一位：第二个实例在插件初始化阶段（早于本应用的 setup）
    // 就会发现自己不是主实例，通知主实例后立即退出，因此不会启动自己的
    // `dsh web`，也不会多挂一个托盘图标。
    .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
      // 再次双击 exe：把已有实例的窗口恢复出来。
      tray::reveal_main(app);
    }))
    .plugin(external_links::navigation_plugin())
    .invoke_handler(tauri::generate_handler![
      get_boot_logs,
      external_links::open_external,
      tray::set_desktop_tray,
      tray::quit_desktop_app
    ])
    .setup(move |app| {
      let handle = app.handle().clone();
      let logs: BootLogs = Arc::new(Mutex::new(Vec::new()));
      app.manage(Arc::clone(&logs));
      // 托盘退出与窗口关闭路径共用同一子进程槽位。
      app.manage(Arc::clone(&child_for_setup));
      if let Err(error) = tray::setup(app.handle()) {
        // 托盘挂不上就不能把窗口藏起来（没有恢复入口）：记一行启动日志，关闭
        // 窗口退回"结束应用"的旧行为。
        let line = format!("托盘不可用：{error}；关闭窗口将直接退出");
        if let Ok(mut guard) = logs.lock() {
          guard.push(line.clone());
        }
        let _ = app.handle().emit("boot-log", line);
      }
      let boot_logs = Arc::clone(&logs);
      thread::spawn(move || {
        let result = (|| -> Result<(), String> {
          let emit_handle = handle.clone();
          let emit_logs = Arc::clone(&boot_logs);
          let mut emit_line = move |line: &str| {
            if let Ok(mut guard) = emit_logs.lock() {
              guard.push(line.to_string());
            }
            let _ = emit_handle.emit("boot-log", line);
          };
          backend::run_backend(&extra_args, &child_for_setup, &handle, &mut emit_line)
        })();

        if let Err(error) = result {
          alert::show_fatal(&error);
          let _ = handle.exit(1);
        }
      });
      Ok(())
    })
    .on_window_event(move |window, event| {
      if let WindowEvent::CloseRequested { api, .. } = event {
        if !tray::is_installed() {
          // 没有托盘就没有恢复入口：退回"结束应用"（无控制台窗口的进程否则会
          // 留下窗口都没了的残影），而不是把窗口藏起来。
          child::shutdown(&child_for_window);
          std::process::exit(0);
        }
        // 关闭按钮不结束 DSH：隐藏窗口并常驻托盘，`dsh web` 继续在后台服务；
        // 真正退出走托盘菜单或顶栏 File 菜单的退出项。
        api.prevent_close();
        let _ = window.hide();
      }
    })
    .build(tauri::generate_context!())
    .expect("error while building DeepSeek Harness desktop shell");

  app.run(move |_app_handle, event| {
    if matches!(event, RunEvent::ExitRequested { .. }) {
      child::shutdown(&child_for_exit);
      std::process::exit(0);
    }
    if matches!(event, RunEvent::Exit) {
      child::shutdown(&child_for_exit);
    }
  });
}
