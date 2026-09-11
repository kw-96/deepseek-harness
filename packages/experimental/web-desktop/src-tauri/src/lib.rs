//! Experimental desktop shell: spawn `dsh web --no-open`, then open its
//! authenticated local URL in the main WebView window.

mod alert;
mod backend;
mod bootstrap;
mod child;
mod external_links;
mod resolve;
mod snapshot;

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
    .plugin(external_links::navigation_plugin())
    .invoke_handler(tauri::generate_handler![get_boot_logs, external_links::open_external])
    .setup(move |app| {
      let handle = app.handle().clone();
      let logs: BootLogs = Arc::new(Mutex::new(Vec::new()));
      app.manage(Arc::clone(&logs));
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
    .on_window_event(move |_window, event| {
      if let WindowEvent::CloseRequested { .. } = event {
        // Tear down dsh web, then hard-exit. Undecorated WebView2 shells can
        // otherwise linger as a window-less process after WM_CLOSE.
        child::shutdown(&child_for_window);
        std::process::exit(0);
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
