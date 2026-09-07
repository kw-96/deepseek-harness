//! Surface fatal startup errors when the release binary has no console.

/// Show a blocking error dialog on Windows; otherwise print to stderr.
pub fn show_fatal(message: &str) {
  eprintln!("dsh-web-desktop: {message}");
  #[cfg(windows)]
  {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr::null_mut;

    #[link(name = "user32")]
    extern "system" {
      fn MessageBoxW(
        hwnd: *mut core::ffi::c_void,
        text: *const u16,
        caption: *const u16,
        flags: u32,
      ) -> i32;
    }

    const MB_OK: u32 = 0x0000_0000;
    const MB_ICONERROR: u32 = 0x0000_0010;

    let text: Vec<u16> = OsStr::new(message)
      .encode_wide()
      .chain(std::iter::once(0))
      .collect();
    let caption: Vec<u16> = OsStr::new("DeepSeek Harness")
      .encode_wide()
      .chain(std::iter::once(0))
      .collect();
    unsafe {
      MessageBoxW(
        null_mut(),
        text.as_ptr(),
        caption.as_ptr(),
        MB_OK | MB_ICONERROR,
      );
    }
  }
}
