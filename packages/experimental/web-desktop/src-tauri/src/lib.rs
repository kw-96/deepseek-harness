//! Experimental desktop shell: spawn `dsh web --no-open`, then open its
//! authenticated local URL in the main WebView window.

mod alert;
mod bootstrap;
mod external_links;
mod resolve;
mod snapshot;

use std::env;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager, RunEvent, WindowEvent};

const READY_PREFIX: &str = "dsh web: http";
const READY_TIMEOUT: Duration = Duration::from_secs(180);
const DIST_INDEX_ENV: &str = "DSH_WEB_DIST_INDEX";
/// 失败诊断保留的子进程输出行数上限。
const OUTPUT_TAIL_LINES: usize = 200;
/// 失败信息中回显的末尾输出行数。
const ERROR_TAIL_LINES: usize = 15;

type BootLogs = Arc<Mutex<Vec<String>>>;

/// 返回启动页加载前已经产生的启动日志，补齐 WebView 尚未监听期间丢失的行。
#[tauri::command]
fn get_boot_logs(logs: tauri::State<BootLogs>) -> Vec<String> {
  logs.lock().map(|guard| guard.clone()).unwrap_or_default()
}

struct HarnessChild {
  child: Child,
  dist_snapshot: Option<PathBuf>,
}

impl HarnessChild {
  fn kill_tree(&mut self) {
    let pid = self.child.id();
    #[cfg(windows)]
    {
      let mut taskkill = Command::new("taskkill");
      taskkill
        .args(["/F", "/T", "/PID", &pid.to_string()])
        .stdout(Stdio::null())
        .stderr(Stdio::null());
      apply_no_window(&mut taskkill);
      let _ = taskkill.status();
      // taskkill /F already reaps the tree. A blocking wait() here can stall
      // Tauri's close/exit path and leave DeepSeek Harness.exe alive with no
      // listener.
      let _ = self.child.try_wait();
    }
    #[cfg(not(windows))]
    {
      let _ = self.child.kill();
      let _ = self.child.wait();
    }
    if let Some(index) = self.dist_snapshot.take() {
      snapshot::remove_snapshot(&index);
    }
  }
}

impl Drop for HarnessChild {
  fn drop(&mut self) {
    self.kill_tree();
  }
}

/// Stop the spawned `dsh web` tree if it is still held in `slot`.
fn shutdown_harness(slot: &Arc<Mutex<Option<HarnessChild>>>) {
  if let Ok(mut guard) = slot.lock() {
    if let Some(mut child) = guard.take() {
      child.kill_tree();
    }
  }
}

fn apply_no_window(command: &mut Command) {
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
  }
}

fn spawn_dsh_web(
  extra_args: &[String],
  on_line: &mut dyn FnMut(&str),
) -> Result<(HarnessChild, std::process::ChildStdout, std::process::ChildStderr), String> {
  let (cli, cwd) = resolve::resolve_dsh_cli()?;
  let dist_snapshot = match cwd.as_ref() {
    Some(root) => Some(snapshot::snapshot_web_dist(root, on_line)?),
    None => None,
  };

  let mut command =
    if cfg!(windows) && cli.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("cmd")) {
      let mut c = Command::new("cmd");
      c.arg("/C").arg(&cli).arg("web").arg("--no-open");
      for arg in extra_args {
        c.arg(arg);
      }
      c
    } else {
      let mut c = Command::new(&cli);
      c.arg("web").arg("--no-open");
      for arg in extra_args {
        c.arg(arg);
      }
      c
    };

  command
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .stdin(Stdio::null());
  apply_no_window(&mut command);
  if let Some(dir) = cwd.as_ref() {
    command.current_dir(dir);
  }
  if let Some(index) = dist_snapshot.as_ref() {
    command.env(DIST_INDEX_ENV, index);
  }

  let mut child = command
    .spawn()
    .map_err(|error| format!("failed to spawn {}: {error}", cli.display()))?;
  let stdout = child
    .stdout
    .take()
    .ok_or_else(|| "dsh web stdout was not piped".to_string())?;
  let stderr = child
    .stderr
    .take()
    .ok_or_else(|| "dsh web stderr was not piped".to_string())?;
  Ok((
    HarnessChild {
      child,
      dist_snapshot,
    },
    stdout,
    stderr,
  ))
}

/// 持续把一行流读入 channel；读线程在 EOF 后关闭发送端。
fn pump_lines<R: BufRead + Send + 'static>(reader: R, tx: mpsc::Sender<String>) {
  thread::spawn(move || {
    for line in reader.lines() {
      match line {
        Ok(line) => {
          if tx.send(line).is_err() {
            break;
          }
        }
        Err(_) => break,
      }
    }
  });
}

fn extract_ready_url(line: &str) -> Option<String> {
  let trimmed = line.trim();
  if !trimmed.starts_with(READY_PREFIX) {
    return None;
  }
  let after = trimmed.strip_prefix("dsh web: ")?;
  let url = after.split_whitespace().next()?;
  if url.starts_with("http://") || url.starts_with("https://") {
    Some(url.to_string())
  } else {
    None
  }
}

/// 记录一行子进程输出，只保留末尾若干行供失败诊断使用。
fn record_output(tail: &Arc<Mutex<Vec<String>>>, line: &str) {
  if let Ok(mut guard) = tail.lock() {
    guard.push(line.to_string());
    if guard.len() > OUTPUT_TAIL_LINES {
      let excess = guard.len() - OUTPUT_TAIL_LINES;
      guard.drain(..excess);
    }
  }
}

/// 汇总失败诊断文本：首个 `Error:` 行加末尾输出。
///
/// 就绪行之前退出的 `dsh web` 会把真正的失败原因留在管道里，只报告超时会
/// 掩盖它；首个 Error 行通常是可执行的那一条（例如端口已被占用）。
fn diagnostic_text(lines: &[String]) -> String {
  if lines.is_empty() {
    return "(no output)".to_string();
  }
  let start = lines.len().saturating_sub(ERROR_TAIL_LINES);
  let tail = lines[start..].join("\n");
  match lines.iter().find(|line| line.contains("Error:")) {
    Some(error) if !lines[start..].iter().any(|line| line == error) => {
      format!("{error}\n...\n{tail}")
    }
    _ => tail,
  }
}

/// 子进程已知的退出状态；短暂轮询等待管道关闭后进程仍未退出时为 `None`。
fn child_exit_note(slot: &Arc<Mutex<Option<HarnessChild>>>) -> Option<String> {
  for _ in 0..20 {
    if let Some(note) = try_exit_note(slot) {
      return Some(note);
    }
    thread::sleep(Duration::from_millis(50));
  }
  None
}

/// 单次读取子进程退出状态，未退出时为 `None`。
fn try_exit_note(slot: &Arc<Mutex<Option<HarnessChild>>>) -> Option<String> {
  let mut guard = slot.lock().ok()?;
  let harness = guard.as_mut()?;
  let status = harness.child.try_wait().ok()??;
  Some(match status.code() {
    Some(code) => format!("exit code {code}"),
    None => "terminated by a signal".to_string(),
  })
}

fn wait_for_ready_url(
  rx: &mpsc::Receiver<String>,
  handle: &tauri::AppHandle,
  tail: &Arc<Mutex<Vec<String>>>,
  child: &Arc<Mutex<Option<HarnessChild>>>,
) -> Result<String, String> {
  let started = Instant::now();
  let mut timed_out = false;
  for line in rx.iter() {
    if started.elapsed() > READY_TIMEOUT {
      timed_out = true;
      break;
    }
    let ready = extract_ready_url(&line);
    let _ = handle.emit("boot-log", &line);
    eprintln!("{line}");
    record_output(tail, &line);
    if let Some(url) = ready {
      return Ok(url);
    }
  }
  let lines = tail.lock().map(|guard| guard.clone()).unwrap_or_default();
  let exit = if timed_out { None } else { child_exit_note(child) };
  let headline = match (timed_out, exit) {
    (true, _) => format!(
      "timed out after {}s waiting for `{READY_PREFIX}...` on dsh web stdout",
      READY_TIMEOUT.as_secs()
    ),
    (false, Some(note)) => format!("dsh web exited ({note}) before printing `{READY_PREFIX}...`"),
    (false, None) => format!("dsh web output ended before printing `{READY_PREFIX}...`"),
  };
  Err(format!(
    "{headline}\n\nLast dsh web output:\n{}",
    diagnostic_text(&lines)
  ))
}

fn passthrough_args() -> Vec<String> {
  env::args().skip(1).collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let child_slot: Arc<Mutex<Option<HarnessChild>>> = Arc::new(Mutex::new(None));
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
          let (harness, stdout, stderr) = spawn_dsh_web(&extra_args, &mut emit_line)?;
          {
            let mut guard = child_for_setup
              .lock()
              .map_err(|_| "child lock poisoned".to_string())?;
            *guard = Some(harness);
          }
          let (tx, rx) = mpsc::channel::<String>();
          pump_lines(BufReader::new(stderr), tx.clone());
          pump_lines(BufReader::new(stdout), tx);
          let tail: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
          let url = wait_for_ready_url(&rx, &handle, &tail, &child_for_setup)?;
          let parsed = url
            .parse::<url::Url>()
            .map_err(|error| format!("invalid harness URL {url}: {error}"))?;
          handle
            .get_webview_window("main")
            .ok_or_else(|| "main webview window missing".to_string())?
            .navigate(parsed)
            .map_err(|error| format!("failed to navigate to harness URL: {error}"))?;
          // 就绪后继续消费输出，避免 stdout/stderr 管道写满后阻塞 dsh web。
          for _line in rx.iter() {}
          Ok(())
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
        shutdown_harness(&child_for_window);
        std::process::exit(0);
      }
    })
    .build(tauri::generate_context!())
    .expect("error while building DeepSeek Harness desktop shell");

  app.run(move |_app_handle, event| {
    if matches!(event, RunEvent::ExitRequested { .. }) {
      shutdown_harness(&child_for_exit);
      std::process::exit(0);
    }
    if matches!(event, RunEvent::Exit) {
      shutdown_harness(&child_for_exit);
    }
  });
}
