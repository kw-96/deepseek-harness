//! Bootstrap checkout deps with the repo-bundled Node + corepack pnpm.

use std::env;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::SystemTime;

/// Matches root `package.json` `packageManager`.
const PNPM_VERSION: &str = "11.7.0";

/// Locate `.runtime/node-v*-win-x64` (or unix `node-v*`) next to `dsh.cmd`.
pub fn find_bundled_node_dir(repo_root: &Path) -> Result<PathBuf, String> {
  let runtime = repo_root.join(".runtime");
  let preferred = if cfg!(windows) {
    runtime.join("node-v24.20.0-win-x64")
  } else {
    runtime.join("node-v24.20.0-linux-x64")
  };
  if node_binary(&preferred).is_some() {
    return Ok(preferred);
  }

  let entries = fs::read_dir(&runtime).map_err(|error| {
    format!(
      "missing bundled Node under {} ({error}) — restore `.runtime` from the checkout",
      runtime.display()
    )
  })?;
  let mut candidates: Vec<PathBuf> = entries
    .filter_map(|entry| entry.ok().map(|e| e.path()))
    .filter(|path| {
      path
        .file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|name| name.starts_with("node-v"))
        && node_binary(path).is_some()
    })
    .collect();
  candidates.sort();
  candidates.pop().ok_or_else(|| {
    format!(
      "no usable Node under {} — expected node-v24.20.0-win-x64 as used by dsh.cmd",
      runtime.display()
    )
  })
}

fn node_binary(dir: &Path) -> Option<PathBuf> {
  let win = dir.join("node.exe");
  if win.is_file() {
    return Some(win);
  }
  let unix = dir.join("node");
  if unix.is_file() {
    return Some(unix);
  }
  None
}

fn prepend_path(node_dir: &Path) -> String {
  let dir = node_dir.display().to_string();
  match env::var_os("PATH") {
    Some(existing) => {
      let sep = if cfg!(windows) { ';' } else { ':' };
      format!("{dir}{sep}{}", existing.to_string_lossy())
    }
    None => dir,
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

fn corepack_program(node_dir: &Path) -> PathBuf {
  if cfg!(windows) {
    node_dir.join("corepack.cmd")
  } else {
    node_dir.join("corepack")
  }
}

/// Run `corepack pnpm@VERSION <args…>` with bundled Node on PATH.
pub fn run_corepack_pnpm(
  repo_root: &Path,
  args: &[&str],
  on_line: &mut dyn FnMut(&str),
) -> Result<(), String> {
  let node_dir = find_bundled_node_dir(repo_root)?;
  let corepack = corepack_program(&node_dir);
  if !corepack.is_file() {
    return Err(format!("bundled corepack missing at {}", corepack.display()));
  }

  let path = prepend_path(&node_dir);
  let mut enable = Command::new(&corepack);
  enable
    .arg("enable")
    .current_dir(repo_root)
    .env("PATH", &path)
    .stdout(Stdio::null())
    .stderr(Stdio::piped())
    .stdin(Stdio::null());
  apply_no_window(&mut enable);
  let _ = enable.output();

  let mut command = if cfg!(windows) {
    let mut c = Command::new("cmd");
    c.arg("/C").arg(&corepack).arg(format!("pnpm@{PNPM_VERSION}"));
    for arg in args {
      c.arg(arg);
    }
    c
  } else {
    let mut c = Command::new(&corepack);
    c.arg(format!("pnpm@{PNPM_VERSION}"));
    for arg in args {
      c.arg(arg);
    }
    c
  };
  command
    .current_dir(repo_root)
    .env("PATH", &path)
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .stdin(Stdio::null());
  apply_no_window(&mut command);

  let label = format!("corepack pnpm@{PNPM_VERSION} {}", args.join(" "));
  let mut child = command
    .spawn()
    .map_err(|error| format!("failed to run `{label}`: {error}"))?;

  // 流式转发 stdout/stderr，同时保留末尾行用于失败摘要。
  let (tx, rx) = mpsc::channel::<String>();
  if let Some(stderr) = child.stderr.take() {
    let tx = tx.clone();
    thread::spawn(move || {
      for line in BufReader::new(stderr).lines() {
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
  if let Some(stdout) = child.stdout.take() {
    let tx = tx.clone();
    thread::spawn(move || {
      for line in BufReader::new(stdout).lines() {
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
  drop(tx);

  let mut tail: Vec<String> = Vec::new();
  for line in rx {
    on_line(&line);
    tail.push(line);
  }

  let status = child
    .wait()
    .map_err(|error| format!("failed to wait for `{label}`: {error}"))?;
  if status.success() {
    return Ok(());
  }
  let detail = tail
    .into_iter()
    .rev()
    .take(40)
    .collect::<Vec<_>>()
    .into_iter()
    .rev()
    .collect::<Vec<_>>()
    .join("\n");
  Err(format!(
    "`{label}` failed:\n{}",
    if detail.is_empty() { "command failed with no output" } else { &detail }
  ))
}

fn file_mtime(path: &Path) -> Option<SystemTime> {
  fs::metadata(path).ok()?.modified().ok()
}

/// True when `node_modules` is missing or older than `pnpm-lock.yaml`.
pub fn needs_install(repo_root: &Path) -> bool {
  let modules = repo_root.join("node_modules").join(".modules.yaml");
  let lock = repo_root.join("pnpm-lock.yaml");
  let Some(modules_mtime) = file_mtime(&modules) else {
    return true;
  };
  let Some(lock_mtime) = file_mtime(&lock) else {
    return false;
  };
  lock_mtime > modules_mtime
}

/// Run `pnpm install` via bundled corepack when the lockfile is newer than modules.
pub fn ensure_dependencies(
  repo_root: &Path,
  on_line: &mut dyn FnMut(&str),
) -> Result<(), String> {
  if env::var_os("DSH_DESKTOP_SKIP_INSTALL").is_some() {
    return Ok(());
  }
  if !needs_install(repo_root) {
    return Ok(());
  }
  run_corepack_pnpm(repo_root, &["install"], on_line)
}
