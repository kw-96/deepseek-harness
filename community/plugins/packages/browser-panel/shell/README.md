# Desktop shell

See [../docs/DESKTOP-SHELL.md](../docs/DESKTOP-SHELL.md).

| file | what it is |
|---|---|
| `main.js` | the shell: window, two views, connecting, downloads |
| `connections.js` | reads/writes `~/.dsh-shell/connections.json` |
| `strip.html` | the connection strip (the shell's own UI) |
| `preload.cjs` | the strip's bridge — four calls, nothing else |
| `main-simple.js` | the original single-connection shell, kept as a fallback |

`main-simple.js` is not dead code: it is ~130 lines that do nothing but point a
window at one URL. If the connection manager is more than you want, set
`"main": "main-simple.js"` in `package.json` and everything else still works —
the browser pane does not depend on any of it.
