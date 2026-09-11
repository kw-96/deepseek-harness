//! 后端看护：启动 `dsh web`、判定就绪、排空输出，在子进程退出后自动重启。

use crate::child::{self, ChildSlot};
use std::io::{BufRead, BufReader};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

const READY_PREFIX: &str = "dsh web: http";
const READY_TIMEOUT: Duration = Duration::from_secs(180);
/// 失败诊断保留的子进程输出行数上限。
const OUTPUT_TAIL_LINES: usize = 200;
/// 失败信息中回显的末尾输出行数。
const ERROR_TAIL_LINES: usize = 15;
/// 就绪等待与退出监视的轮询间隔。
const POLL_INTERVAL: Duration = Duration::from_millis(500);
/// 子进程退出后的重启等待，避免崩溃循环紧打日志。
const RESTART_DELAY: Duration = Duration::from_secs(3);
/// 连续启动失败上限；达到后按打开配置失败上报。
const RESTART_FAILURE_LIMIT: usize = 3;

/// 启动 `dsh web` 并把主窗口导航到它的认证地址；就绪后子进程退出即自动重启。
///
/// 重启不再导航：窗口里的前端持有持久密钥签发的认证 cookie，会自行重连。连续
/// 启动失败达到 `RESTART_FAILURE_LIMIT` 时返回错误，由调用方按打开配置失败处理。
/// @param args - 追加在 `--no-open` 之后的 CLI 参数。
/// @param slot - 保存当前子进程的槽位，供窗口关闭时结束它。
/// @param handle - 用于发送 `boot-log` 事件与导航主窗口的应用句柄。
/// @param on_line - 接收启动进度与后端重启通知的行回调。
/// @returns 连续启动失败时携带诊断文本的错误。
pub(crate) fn run_backend(
  args: &[String],
  slot: &ChildSlot,
  handle: &tauri::AppHandle,
  on_line: &mut dyn FnMut(&str),
) -> Result<(), String> {
  let mut navigated = false;
  let mut failures = 0usize;
  loop {
    let (harness, stdout, stderr) = child::spawn(args, on_line)?;
    {
      let mut guard = slot.lock().map_err(|_| "child lock poisoned".to_string())?;
      *guard = Some(harness);
    }
    let (tx, rx) = mpsc::channel::<String>();
    pump_lines(BufReader::new(stderr), tx.clone());
    pump_lines(BufReader::new(stdout), tx);
    let tail: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    match wait_for_ready_url(&rx, handle, &tail, slot) {
      Ok(url) => {
        failures = 0;
        if !navigated {
          navigate_main(handle, &url)?;
          navigated = true;
        }
        drain_until_exit(&rx, slot);
        on_line(&format!(
          "dsh web: 已退出；{} 秒后自动重启",
          RESTART_DELAY.as_secs()
        ));
      }
      Err(error) => {
        failures += 1;
        if failures >= RESTART_FAILURE_LIMIT {
          return Err(error);
        }
        on_line(&format!(
          "dsh web: 启动失败（第 {failures} 次）；{} 秒后重试\n{error}",
          RESTART_DELAY.as_secs()
        ));
      }
    }
    child::shutdown(slot);
    thread::sleep(RESTART_DELAY);
  }
}

/// 把主窗口导航到 harness 的认证地址。
fn navigate_main(handle: &tauri::AppHandle, url: &str) -> Result<(), String> {
  let parsed = url
    .parse::<url::Url>()
    .map_err(|error| format!("invalid harness URL {url}: {error}"))?;
  handle
    .get_webview_window("main")
    .ok_or_else(|| "main webview window missing".to_string())?
    .navigate(parsed)
    .map_err(|error| format!("failed to navigate to harness URL: {error}"))
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

fn wait_for_ready_url(
  rx: &mpsc::Receiver<String>,
  handle: &tauri::AppHandle,
  tail: &Arc<Mutex<Vec<String>>>,
  slot: &ChildSlot,
) -> Result<String, String> {
  let started = Instant::now();
  let mut timed_out = false;
  // 轮询而非阻塞迭代：`dsh web` 不再输出时也必须让超时生效。
  loop {
    match rx.recv_timeout(POLL_INTERVAL) {
      Ok(line) => {
        let ready = extract_ready_url(&line);
        let _ = handle.emit("boot-log", &line);
        eprintln!("{line}");
        record_output(tail, &line);
        if let Some(url) = ready {
          return Ok(url);
        }
      }
      Err(mpsc::RecvTimeoutError::Timeout) => {}
      Err(mpsc::RecvTimeoutError::Disconnected) => break,
    }
    if started.elapsed() > READY_TIMEOUT {
      timed_out = true;
      break;
    }
  }
  let lines = tail.lock().map(|guard| guard.clone()).unwrap_or_default();
  let exit = if timed_out { None } else { child::exit_note(slot) };
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

/// 排空就绪后的输出并等待子进程退出。
///
/// 输出必须持续排空，否则管道写满会阻塞 `dsh web`；退出不一定派发最后一行，
/// 因此轮询超时分支同时检查退出状态。
fn drain_until_exit(rx: &mpsc::Receiver<String>, slot: &ChildSlot) {
  loop {
    match rx.recv_timeout(POLL_INTERVAL) {
      Ok(_line) => {}
      Err(mpsc::RecvTimeoutError::Timeout) => {
        if child::has_exited(slot) {
          return;
        }
      }
      Err(mpsc::RecvTimeoutError::Disconnected) => return,
    }
  }
}
