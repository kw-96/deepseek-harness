//! Locate `dsh` / `dsh.cmd` for the desktop shell spawn.

use std::env;
use std::path::{Path, PathBuf};

/// Walk parents of `start` looking for a checkout that contains `dsh.cmd` / `dsh`.
pub fn find_repo_cli(start: &Path) -> Option<(PathBuf, PathBuf)> {
  let mut dir = start.to_path_buf();
  if dir.is_file() {
    dir.pop();
  }
  for _ in 0..10 {
    let cmd = dir.join("dsh.cmd");
    if cmd.is_file() {
      return Some((cmd, dir));
    }
    let unix = dir.join("dsh");
    if unix.is_file() {
      return Some((unix, dir));
    }
    if !dir.pop() {
      break;
    }
  }
  None
}

/// Resolve `dsh` path and optional working directory (repo root).
///
/// Order: `DSH_DESKTOP_CLI` → walk from this exe → walk from cwd →
/// walk from compile-time crate dir → bare name on `PATH`.
pub fn resolve_dsh_cli() -> Result<(PathBuf, Option<PathBuf>), String> {
  if let Ok(explicit) = env::var("DSH_DESKTOP_CLI") {
    let path = PathBuf::from(explicit);
    if path.is_file() {
      let cwd = path.parent().map(Path::to_path_buf);
      return Ok((path, cwd));
    }
    return Err(format!(
      "DSH_DESKTOP_CLI does not point to a file: {}",
      path.display()
    ));
  }

  if let Ok(exe) = env::current_exe() {
    if let Some(found) = find_repo_cli(&exe) {
      return Ok((found.0, Some(found.1)));
    }
  }

  if let Ok(cwd) = env::current_dir() {
    if let Some(found) = find_repo_cli(&cwd) {
      return Ok((found.0, Some(found.1)));
    }
  }

  let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
  if let Some(found) = find_repo_cli(&manifest) {
    return Ok((found.0, Some(found.1)));
  }

  Ok((
    PathBuf::from(if cfg!(windows) { "dsh.cmd" } else { "dsh" }),
    None,
  ))
}
