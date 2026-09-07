//! Ensure and snapshot `apps/web/dist` for one desktop session.

use crate::bootstrap::{ensure_dependencies, run_corepack_pnpm};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Rebuild the Web frontend (`pnpm run build:web`) when a checkout root is known.
///
/// Skipped when `DSH_DESKTOP_SKIP_WEB_BUILD` is set. Uses repo-bundled Node +
/// corepack pnpm so peer hosts need no global pnpm.
pub fn ensure_web_frontend(repo_root: &Path) -> Result<(), String> {
  if std::env::var_os("DSH_DESKTOP_SKIP_WEB_BUILD").is_some() {
    return Ok(());
  }
  run_corepack_pnpm(repo_root, &["run", "build:web"])
}

/// Install if needed, rebuild the frontend, then snapshot dist for this session.
pub fn snapshot_web_dist(repo_root: &Path) -> Result<PathBuf, String> {
  ensure_dependencies(repo_root)?;
  ensure_web_frontend(repo_root)?;

  let source = repo_root.join("apps").join("web").join("dist");
  let index = source.join("index.html");
  if !index.is_file() {
    return Err(format!(
      "missing frontend dist at {} after `pnpm run build:web`",
      index.display()
    ));
  }

  let stamp = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis())
    .unwrap_or(0);
  let dest_root = std::env::temp_dir().join(format!(
    "dsh-web-desktop-{}-{}",
    std::process::id(),
    stamp
  ));
  let dest = dest_root.join("dist");
  copy_dir_recursive(&source, &dest).map_err(|error| {
    let _ = fs::remove_dir_all(&dest_root);
    format!("failed to snapshot web dist: {error}")
  })?;
  let snap_index = dest.join("index.html");
  if !snap_index.is_file() {
    let _ = fs::remove_dir_all(&dest_root);
    return Err("web dist snapshot did not contain index.html".to_string());
  }
  Ok(snap_index)
}

/// Best-effort removal of a session snapshot directory (parent of `dist/`).
pub fn remove_snapshot(index: &Path) {
  if let Some(dist) = index.parent() {
    if let Some(root) = dist.parent() {
      let _ = fs::remove_dir_all(root);
    }
  }
}

fn copy_dir_recursive(from: &Path, to: &Path) -> std::io::Result<()> {
  fs::create_dir_all(to)?;
  for entry in fs::read_dir(from)? {
    let entry = entry?;
    let file_type = entry.file_type()?;
    let target = to.join(entry.file_name());
    if file_type.is_dir() {
      copy_dir_recursive(&entry.path(), &target)?;
    } else if file_type.is_file() {
      fs::copy(entry.path(), target)?;
    }
  }
  Ok(())
}
