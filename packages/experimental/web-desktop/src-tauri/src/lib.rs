//! Experimental desktop shell: spawn `dsh web --no-open`, then open its
//! authenticated local URL in the main WebView window.

mod alert;
mod bootstrap;
mod resolve;
mod snapshot;

use std::env;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{Manager, RunEvent};

const READY_PREFIX: &str = "dsh web: http";
const READY_TIMEOUT: Duration = Duration::from_secs(180);
const DIST_INDEX_ENV: &str = "DSH_WEB_DIST_INDEX";

struct HarnessChild {
  child: Child,
  dist_snapshot: Option<PathBuf>,
}

impl HarnessChild {
  fn kill_tree(&mut self) {
    let pid = self.child.id();
    #[cfg(windows)]
    {
      let _ = Command::new("taskkill")
        .args(["/F", "/T", "/PID", &pid.to_string()])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
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

fn apply_no_window(command: &mut Command) {
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
  }
}

fn spawn_dsh_web(extra_args: &[String]) -> Result<(HarnessChild, std::process::ChildStdout), String> {
  let (cli, cwd) = resolve::resolve_dsh_cli()?;
  let dist_snapshot = match cwd.as_ref() {
    Some(root) => Some(snapshot::snapshot_web_dist(root)?),
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
  Ok((
    HarnessChild {
      child,
      dist_snapshot,
    },
    stdout,
  ))
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

fn wait_for_ready_url(stdout: std::process::ChildStdout) -> Result<String, String> {
  let reader = BufReader::new(stdout);
  let started = Instant::now();
  for line in reader.lines() {
    if started.elapsed() > READY_TIMEOUT {
      break;
    }
    let line = line.map_err(|error| format!("failed reading dsh web stdout: {error}"))?;
    eprintln!("{line}");
    if let Some(url) = extract_ready_url(&line) {
      return Ok(url);
    }
  }
  Err(format!(
    "timed out after {}s waiting for `{READY_PREFIX}...` on dsh web stdout",
    READY_TIMEOUT.as_secs()
  ))
}

fn passthrough_args() -> Vec<String> {
  env::args().skip(1).collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let child_slot: Arc<Mutex<Option<HarnessChild>>> = Arc::new(Mutex::new(None));
  let child_for_setup = Arc::clone(&child_slot);
  let child_for_exit = Arc::clone(&child_slot);
  let extra_args = passthrough_args();

  let app = tauri::Builder::default()
    .setup(move |app| {
      let handle = app.handle().clone();
      thread::spawn(move || {
        let result = (|| -> Result<(), String> {
          let (harness, stdout) = spawn_dsh_web(&extra_args)?;
          {
            let mut guard = child_for_setup
              .lock()
              .map_err(|_| "child lock poisoned".to_string())?;
            *guard = Some(harness);
          }
          let url = wait_for_ready_url(stdout)?;
          let parsed = url
            .parse::<url::Url>()
            .map_err(|error| format!("invalid harness URL {url}: {error}"))?;
          handle
            .get_webview_window("main")
            .ok_or_else(|| "main webview window missing".to_string())?
            .navigate(parsed)
            .map_err(|error| format!("failed to navigate to harness URL: {error}"))?;
          Ok(())
        })();

        if let Err(error) = result {
          alert::show_fatal(&error);
          let _ = handle.exit(1);
        }
      });
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building DeepSeek Harness desktop shell");

  app.run(move |_app_handle, event| {
    if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
      if let Ok(mut guard) = child_for_exit.lock() {
        if let Some(mut child) = guard.take() {
          child.kill_tree();
        }
      }
    }
  });
}
