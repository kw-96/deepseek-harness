//! `dsh web` 子进程的启动、持有、结束与退出查询。

use crate::resolve;
use std::process::{Child, ChildStderr, ChildStdout, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

/// 保存当前 `dsh web` 子进程的槽位；窗口关闭与后端看护共用。
pub(crate) type ChildSlot = Arc<Mutex<Option<HarnessChild>>>;

pub(crate) struct HarnessChild {
  child: Child,
}

impl HarnessChild {
  /// 结束子进程树。
  fn kill_tree(&mut self) {
    // 已退出的子进程不再按 pid 结束进程树：pid 可能已被系统复用，taskkill 会
    // 误杀无关进程。
    if matches!(self.child.try_wait(), Ok(None)) {
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
    }
  }

  /// 单次读取退出状态；仍在运行或读取失败时为 `None`。
  fn exit_status(&mut self) -> Option<String> {
    let status = self.child.try_wait().ok()??;
    Some(match status.code() {
      Some(code) => format!("exit code {code}"),
      None => "terminated by a signal".to_string(),
    })
  }
}

impl Drop for HarnessChild {
  fn drop(&mut self) {
    self.kill_tree();
  }
}

/// 停止 `slot` 持有的 `dsh web` 进程树。
pub(crate) fn shutdown(slot: &ChildSlot) {
  if let Ok(mut guard) = slot.lock() {
    if let Some(mut child) = guard.take() {
      child.kill_tree();
    }
  }
}

/// 子进程是否已经退出；槽位为空时按已退出处理。
pub(crate) fn has_exited(slot: &ChildSlot) -> bool {
  let Ok(mut guard) = slot.lock() else {
    return true;
  };
  guard.as_mut().and_then(HarnessChild::exit_status).is_some()
}

/// 子进程已知的退出状态。
///
/// 管道关闭到 `try_wait` 可见退出之间存在窗口，因此短暂轮询；轮询期间仍未退出
/// 时返回 `None`。
pub(crate) fn exit_note(slot: &ChildSlot) -> Option<String> {
  for _ in 0..20 {
    if let Ok(mut guard) = slot.lock() {
      if let Some(note) = guard.as_mut().and_then(HarnessChild::exit_status) {
        return Some(note);
      }
    }
    thread::sleep(Duration::from_millis(50));
  }
  None
}

/// 以无控制台窗口的方式启动子进程。
fn apply_no_window(command: &mut Command) {
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
  }
}

/// 启动 `dsh web --no-open` 并返回子进程与其输出管道。
///
/// 壳只做窗口与进程看护：不安装依赖、不构建前端，直接使用检出目录里已经构建好的
/// `apps/web/dist` 等产物。
/// @param extra_args - 追加在 `--no-open` 之后的 CLI 参数。
/// @returns 子进程、标准输出与标准错误管道。
pub(crate) fn spawn(
  extra_args: &[String],
) -> Result<(HarnessChild, ChildStdout, ChildStderr), String> {
  let (cli, cwd) = resolve::resolve_dsh_cli()?;

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
  Ok((HarnessChild { child }, stdout, stderr))
}
