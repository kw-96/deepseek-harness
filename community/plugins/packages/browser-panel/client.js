/**
 * dsh-plugin-browser — BROWSER half.
 *
 * Served at /plugins/dsh-plugin-browser/client.js by the host's client-modules
 * scanner (because package.json declares dsh.client.platform "web") and injected
 * via window.__DSH_BOOT__. Executing it only REGISTERS a factory through
 * window.__ModuleLoader__.load({id, factory}).
 *
 * apply(ctx) mounts a visible browser pane into the "shell.overlay" slot. The
 * pane is a real <iframe>: the human watches it. The component polls the host
 * for commands, executes them, extracts the active tab's text and pushes it
 * back over /api/preview/state so read_preview sees what is actually on screen.
 *
 * Two reading paths, and the difference matters:
 *   - SAME-ORIGIN (local files served by the host, localhost): read straight
 *     from the live DOM. True rendered text, JS included, free to re-read.
 *   - CROSS-ORIGIN: the browser blocks DOM access, so the URL is fetched once
 *     per navigation and parsed. Costly, so it is cached rather than repeated.
 *
 * @module dsh-plugin-browser/client
 */

window.__ModuleLoader__.load({
	id: "dsh-plugin-browser",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var react = require("react");
		var useEffect = react.useEffect;
		var useState = react.useState;
		var useRef = react.useRef;
		var useCallback = react.useCallback;
		var h = react.createElement;

		// ── constants ────────────────────────────────────────────────────────
		var STATE_PATH = "/api/preview/state";
		var COMMANDS_PATH = "/api/preview/commands";
		var COMMAND_POLL_MS = 500;
		var LIVE_PUSH_MS = 2000;
		var PANE_TOP = 44;              // clear the top chrome
		var MIN_W = 320, MAX_W = 1200, DEFAULT_W = 460;
		var WIDTH_KEY = "dsh-preview-width";
		var LIVE_PATH = "/api/preview/live";

		/**
		 * Are we running inside the desktop shell?
		 *
		 * In a plain browser tab, a web page cannot embed a real browsing
		 * context, so the pane mirrors a separate Chrome over CDP. Inside the
		 * Electron shell the same page gets <webview>: a genuine browsing
		 * context with its own process and session, embedded directly. No
		 * screencast, no input forwarding, no scaling -- it simply IS a browser.
		 *
		 * Detected from the user agent rather than a Node global, because the
		 * shell runs the renderer with nodeIntegration off.
		 */
		var IS_SHELL = typeof navigator !== "undefined"
			&& /Electron\//.test(navigator.userAgent || "");

		/**
		 * 是否运行在 Tauri 桌面壳里。
		 *
		 * 壳开启了 withGlobalTauri，这个全局对象就是「能不能请原生侧把一块真实子 WebView
		 * 放到面板位置上」的判据。成立时面板不再走图像流：渲染、滚动与输入全是原生的。
		 */
		var IS_TAURI = typeof window !== "undefined" && !!(window.__TAURI__ && window.__TAURI__.core);

		function postJson(path, body) {
			return fetch(path, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body)
			}).then(function (r) { return r.json().catch(function () { return null; }); })
				.catch(function () { return null; });
		}

		// The host keeps a short window of commands rather than draining them, so
		// several panes can be open at once without one swallowing the others'
		// work. Each pane tracks the last sequence it saw.
		var commandCursor = -1;

		function pollCommands() {
			var q = commandCursor < 0 ? "" : "?since=" + commandCursor;
			return fetch(COMMANDS_PATH + q, { method: "GET", cache: "no-store" })
				.then(function (r) { return r.json(); })
				.then(function (d) {
					if (!d) return [];
					// First poll only establishes the cursor: a pane that just loaded
					// should show what is on screen, not replay the backlog.
					if (commandCursor < 0) { commandCursor = d.seq || 0; return []; }
					if (typeof d.seq === "number") commandCursor = d.seq;
					return Array.isArray(d.commands) ? d.commands : [];
				})
				.catch(function () { return []; });
		}

		function collapse(text) {
			return String(text || "").replace(new RegExp(String.fromCharCode(160),"g"), " ")
				.split("\n").map(function (l) { return l.trim(); })
				.filter(Boolean).join("\n");
		}

		function htmlToText(html) {
			try {
				var doc = new DOMParser().parseFromString(html, "text/html");
				var kill = doc.querySelectorAll("script, style, noscript, template");
				for (var i = 0; i < kill.length; i++) {
					var p = kill[i].parentNode; if (p) p.removeChild(kill[i]);
				}
				var body = doc.body;
				if (!body) return "";
				return collapse(body.innerText || body.textContent || "");
			} catch (e) { return ""; }
		}

		/** The iframe document, or null when the browser blocks it (cross-origin). */
		function frameDocument(frame) {
			try { return (frame && frame.contentWindow && frame.contentWindow.document) || null; }
			catch (e) { return null; }
		}

		/** What the user should see in the address bar for a tab. */
		function displayUrl(tab) {
			if (!tab) return "";
			// siteUrl / filePath are what the human asked for; tab.url is the
			// internal proxy or file-serving route and is meaningless to read.
			return tab.siteUrl || tab.filePath || tab.url || "";
		}

		function readWidth() {
			try {
				var v = parseInt(window.localStorage.getItem(WIDTH_KEY) || "", 10);
				if (v >= MIN_W && v <= MAX_W) return v;
			} catch (e) { /* ignore */ }
			return DEFAULT_W;
		}

		// ── layout rail ──────────────────────────────────────────────────────
		//
		// The harness shell is a CSS grid whose inline `grid-template-columns`
		// the layout package owns (e.g. "56px minmax(0px,1fr) 0px"). Appending a
		// fourth track makes the conversation genuinely give up space instead of
		// being covered — which is the whole difference between a floating widget
		// and something that feels part of the app.
		//
		// The proper seat would be the shell's `details` slot, but it is declared
		// `kind: "single"` and the shipped conversation package already owns it,
		// so a plugin cannot register there without evicting the tool-details
		// panel. Reserving a track is the honest alternative.
		//
		// Everything here fails SAFE: if the frame cannot be found or its shape
		// changes, reserve() returns false and the pane falls back to floating.

		var RAIL_ATTR = "data-dsh-preview-rail";

		function findFrame() {
			// [data-shell-overlay] is an explicit attribute the layout sets, so it
			// survives CSS-module hashing in a way a class name would not.
			var ov = document.querySelector("[data-shell-overlay]");
			return (ov && ov.parentElement) || null;
		}

		/** Strip any track we previously appended, returning the shell's own template. */
		function baseTemplate(frame) {
			var t = frame.style.gridTemplateColumns || "";
			var marker = frame.getAttribute(RAIL_ATTR);
			if (marker && t.endsWith(" " + marker)) return t.slice(0, -(marker.length + 1));
			return t;
		}

		/**
		 * Reserve a right-hand track of `width` px.
		 * @returns {boolean} whether the shell was in a shape we could extend.
		 */
		function reserveRail(width) {
			var frame = findFrame();
			if (!frame) return false;
			var cs = window.getComputedStyle(frame);
			if (cs.display !== "grid") return false;

			var spacer = frame.querySelector("[" + RAIL_ATTR + "-col]");
			if (!spacer) {
				spacer = document.createElement("div");
				spacer.setAttribute(RAIL_ATTR + "-col", "1");
				// Purely a spacer: the pane itself is painted over it, flush right.
				spacer.style.cssText = "min-width:0;overflow:hidden";
				frame.appendChild(spacer);
			}
			var track = width + "px";
			frame.setAttribute(RAIL_ATTR, track);
			var base = baseTemplate(frame);
			if (!base) return false;
			frame.style.gridTemplateColumns = base + " " + track;
			return true;
		}

		function releaseRail() {
			var frame = findFrame();
			if (!frame) return;
			var base = baseTemplate(frame);
			frame.removeAttribute(RAIL_ATTR);
			var spacer = frame.querySelector("[" + RAIL_ATTR + "-col]");
			if (spacer && spacer.parentElement) spacer.parentElement.removeChild(spacer);
			if (base) frame.style.gridTemplateColumns = base;
		}

		/**
		 * A live view of the real browser.
		 *
		 * Frames are JPEGs polled from the host and drawn into an <img>; mouse and
		 * keyboard events on that image are forwarded back as CDP input. This is
		 * the only way the pane can show a page that refuses to be framed, or one
		 * the user is logged into -- an iframe can do neither.
		 *
		 * Coordinates are scaled: the image is displayed at whatever width the
		 * pane happens to be, while the page renders at the viewport we set.
		 */
		/**
		 * The browser pane, inside the desktop shell: a real <webview>.
		 *
		 * This is the whole point of the shell. There is no stream here -- the
		 * element is an actual browsing context in its own process, so it
		 * paints itself, handles its own input, scrolls at native speed, and
		 * holds its own cookie jar. Nothing is mirrored and nothing is scaled.
		 *
		 * It is built imperatively rather than as JSX. React has no knowledge of
		 * <webview>, and letting it manage `src` fights the element's own
		 * navigation handling; creating it by hand keeps React out of the way and
		 * makes the lifecycle explicit.
		 *
		 * `partition` is a PERSISTENT session, so a login here survives a
		 * restart -- and it is a session of this app's own, so the user's daily
		 * browser is untouched either way.
		 */
		function ShellView(props) {
			var boxRef = useRef(null);
			var elRef = useRef(null);
			var onNav = props.onNav;
			var viewRef = props.viewRef;
			var initialUrl = props.url;

			// Mount once. Re-creating the element on every render would reload
			// the page and lose scroll position and form state.
			useEffect(function () {
				var box = boxRef.current;
				if (!box) return;
				var el = document.createElement("webview");
				el.setAttribute("partition", "persist:dshbrowser");
				el.setAttribute("allowpopups", "true");
				el.setAttribute("src", initialUrl || "about:blank");
				el.style.width = "100%";
				el.style.height = "100%";
				el.style.display = "flex";
				el.style.background = "#fff";
				box.appendChild(el);
				elRef.current = el;
				if (viewRef) viewRef.current = el;

				function report(navUrl) {
					if (!onNav) return;
					var title = "";
					try { title = el.getTitle() || ""; } catch (e) { /* not ready */ }
					onNav(navUrl || safeUrl(el), title);
				}
				// did-navigate fires for real navigations; -in-page covers SPA
				// route changes, which is most of the modern web.
				function onDidNavigate(e) { report(e && e.url); }
				function onInPage(e) { if (e && e.isMainFrame) report(e.url); }
				function onTitle(e) { if (onNav) onNav(safeUrl(el), (e && e.title) || ""); }
				function onStart() { if (props.onLoading) props.onLoading(true); }
				function onStop() { if (props.onLoading) props.onLoading(false); report(null); }

				el.addEventListener("did-navigate", onDidNavigate);
				el.addEventListener("did-navigate-in-page", onInPage);
				el.addEventListener("page-title-updated", onTitle);
				el.addEventListener("did-start-loading", onStart);
				el.addEventListener("did-stop-loading", onStop);

				return function () {
					el.removeEventListener("did-navigate", onDidNavigate);
					el.removeEventListener("did-navigate-in-page", onInPage);
					el.removeEventListener("page-title-updated", onTitle);
					el.removeEventListener("did-start-loading", onStart);
					el.removeEventListener("did-stop-loading", onStop);
					if (viewRef && viewRef.current === el) viewRef.current = null;
					elRef.current = null;
					try { box.removeChild(el); } catch (e) { /* already gone */ }
				};
			}, []);

			// Navigate on url change -- but only when it is genuinely different
			// from where the view already is, or a redirect would bounce us back
			// to the address we started from.
			useEffect(function () {
				var el = elRef.current;
				if (!el || !props.url) return;
				if (sameTarget(safeUrl(el), props.url)) return;
				try { el.loadURL(props.url); }
				catch (e) { el.setAttribute("src", props.url); }
			}, [props.url]);

			return h("div", {
				ref: boxRef,
				style: { position: "relative", width: "100%", height: "100%", background: "#fff", overflow: "hidden", display: "flex" }
			});
		}

		/** A webview's current URL, or "" before it is ready. */
		function safeUrl(el) {
			try { return el.getURL() || ""; } catch (e) { return ""; }
		}

		/** Same address, ignoring a trailing slash and the scheme's default form. */
		function sameTarget(a, b) {
			var x = String(a || "").replace(/\/$/, "");
			var y = String(b || "").replace(/\/$/, "");
			if (x === y) return true;
			// "cnn.com" typed vs "https://cnn.com/" landed.
			return x.replace(/^https?:\/\//, "") === y.replace(/^https?:\/\//, "");
		}

		function LiveView(props) {
			// 面板显示的是浏览器里的某一个真实标签；换标签就换帧流、换输入目标。
			var targetId = (props && props.targetId) || null;
			// 原生壳需要地址本身：它让子 WebView 直接加载这个网址，而不是转发像素。
			var liveUrl = (props && props.url) || "about:blank";
			var imgRef = useRef(null);
			var boxRef = useRef(null);
			var srcState = useState(""); var src = srcState[0], setSrc = srcState[1];
			var sizeRef = useRef({ w: 900, h: 700 });

			// Match the remote viewport to the pane so nothing is letterboxed.
			useEffect(function () {
				var box = boxRef.current;
				if (!box) return;
				// 换了标签就要重新下发视口：画布尺寸没变，但目标页面变了。
				sizeRef.current = { w: 0, h: 0 };
				function sync() {
					var r = box.getBoundingClientRect();
					var w = Math.max(320, Math.round(r.width));
					var h = Math.max(240, Math.round(r.height));
					// 阈值越小，远端视口与面板越严格 1:1，文字越不容易被二次重采样。
					if (Math.abs(w - sizeRef.current.w) < 2 && Math.abs(h - sizeRef.current.h) < 2) return;
					sizeRef.current = { w: w, h: h };
					var dpr = (typeof window !== "undefined" && window.devicePixelRatio) ? window.devicePixelRatio : 2;
					postJson(LIVE_PATH + "/viewport", { width: w, height: h, dpr: dpr, target: targetId });
				}
				sync();
				var ro = new ResizeObserver(sync);
				ro.observe(box);
				return function () { ro.disconnect(); };
			}, [targetId]);

			/**
			 * 原生壳：把面板这块矩形交给壳里的子 WebView。
			 *
			 * 每次全量上报位置与尺寸，所以右栏拖拽、窗口缩放、标签切换都只需再发一次；
			 * 卸载时关闭原生视图，避免它在面板消失后继续盖在界面上。
			 */
			useEffect(function () {
				if (!IS_TAURI) return undefined;
				var box = boxRef.current;
				if (!box) return undefined;
				function call(cmd, args) {
					try {
						var pending = window.__TAURI__.core.invoke(cmd, args);
						if (pending && typeof pending.catch === "function") {
							pending.catch(function () { /* 壳可能正在退出，忽略 */ });
						}
					} catch (e) { /* 同上 */ }
				}
				function sync() {
					var r = box.getBoundingClientRect();
					call("browser_view_sync", { url: liveUrl, x: r.left, y: r.top, width: r.width, height: r.height });
				}
				sync();
				var ro = new ResizeObserver(sync);
				ro.observe(box);
				window.addEventListener("resize", sync);
				// 右栏拖拽、面板折叠这类不触发 ResizeObserver 的布局变化，用轮询兜底。
				var timer = setInterval(sync, 500);
				return function () {
					ro.disconnect();
					window.removeEventListener("resize", sync);
					clearInterval(timer);
					call("browser_view_close", {});
				};
			}, [liveUrl, targetId]);

			// Frames arrive PUSHED, over Server-Sent Events. Chrome emits one only
			// when the page actually repaints, so an idle page costs nothing and a
			// busy one is not capped by a poll interval.
			//
			// The previous version polled a full screenshot every 450ms: a JPEG
			// encode per tick whether or not anything had changed, plus stale
			// pixels in between. That is what made this feel like a remote desktop.
			useEffect(function () {
				var es = null, alive = true, lastUrl = null;
				try {
					// 画质：JPEG 质量越高文字越锐利，代价是每帧字节数——远程链路上要权衡。
					var qs = [];
					if (targetId) qs.push("target=" + encodeURIComponent(targetId));
					qs.push("quality=92");
					es = new EventSource(LIVE_PATH + "/stream?" + qs.join("&"));
				} catch (e) {
					return;
				}
				es.onmessage = function (ev) {
					if (!alive || !ev.data) return;
					// A data: URL avoids a blob allocation per frame at this rate.
					setSrc("data:image/jpeg;base64," + ev.data);
				};
				es.onerror = function () {
					// EventSource reconnects on its own using the server's retry hint.
				};
				return function () {
					alive = false;
					try { es.close(); } catch (e) { /* ignore */ }
					if (lastUrl) URL.revokeObjectURL(lastUrl);
				};
			}, [targetId]);

			/** Pane pixel -> page pixel. */
			function at(e) {
				var img = imgRef.current;
				if (!img) return { x: 0, y: 0 };
				var r = img.getBoundingClientRect();
				var sx = sizeRef.current.w / (r.width || 1);
				var sy = sizeRef.current.h / (r.height || 1);
				return { x: Math.round((e.clientX - r.left) * sx), y: Math.round((e.clientY - r.top) * sy) };
			}

			function send(kind, extra) {
				// 输入落到面板正在显示的那个标签，而不是"浏览器当前恰好活动的标签"。
				postJson(LIVE_PATH + "/input", Object.assign({ kind: kind, target: targetId }, extra));
			}

			/** 把一组触点换算到页面坐标后下发。 */
			function sendTouches(phase, list) {
				var points = [];
				for (var i = 0; i < (list ? list.length : 0); i++) {
					var p = at(list[i]);
					points.push({ x: p.x, y: p.y });
				}
				send("touchPoints", { phase: phase, points: points });
			}

			// 图像流只带像素、不带指针形状：按坐标向宿主回问页面光标，节流后写进容器，
			// 否则链接与输入框上看到的永远是默认箭头，手感与真浏览器差一截。
			var cursorState = useState("default"); var cursor = cursorState[0], setCursor = cursorState[1];
			var cursorAskedAt = useRef(0);
			function trackCursor(e) {
				var now = Date.now();
				if (now - cursorAskedAt.current < 150) return;
				cursorAskedAt.current = now;
				var p = at(e);
				var q = targetId ? ("?target=" + encodeURIComponent(targetId)) : "";
				postJson(LIVE_PATH + "/cursor" + q, { x: p.x, y: p.y }).then(function (d) {
					if (d && typeof d.cursor === "string") setCursor(d.cursor);
				});
			}

			return h("div", {
				ref: boxRef,
				tabIndex: 0,
				style: { position: "relative", width: "100%", height: "100%", background: "#fff", outline: "none", overflow: "hidden", touchAction: "none", cursor: cursor },
				onMouseDown: function (e) { e.preventDefault(); boxRef.current && boxRef.current.focus(); var p = at(e); send("down", { x: p.x, y: p.y, clickCount: e.detail || 1 }); },
				onMouseUp: function (e) { var p = at(e); send("up", { x: p.x, y: p.y, clickCount: e.detail || 1 }); },
				onMouseMove: function (e) { trackCursor(e); if (e.buttons) { var p = at(e); send("move", { x: p.x, y: p.y }); } },
				// 触屏设备：把全部触点原样转发，单指滑动与双指捏合都由页面自己处理，
				// 面板不猜测手势；end/cancel 传抬手后剩余的触点（CDP 的语义）。
				onTouchStart: function (e) {
					e.preventDefault();
					boxRef.current && boxRef.current.focus();
					sendTouches("touchStart", e.touches);
				},
				onTouchMove: function (e) { e.preventDefault(); sendTouches("touchMove", e.touches); },
				onTouchEnd: function (e) { e.preventDefault(); sendTouches("touchEnd", e.touches); },
				onTouchCancel: function (e) { e.preventDefault(); sendTouches("touchCancel", e.touches); },
				// 右键交给页面自己处理，面板不弹浏览器菜单。
				onContextMenu: function (e) {
					e.preventDefault();
					var p = at(e);
					send("down", { x: p.x, y: p.y, button: "right", clickCount: 1 });
					send("up", { x: p.x, y: p.y, button: "right", clickCount: 1 });
				},
				onWheel: function (e) { var p = at(e); send("wheel", { x: p.x, y: p.y, deltaY: e.deltaY, deltaX: e.deltaX }); },
				onKeyDown: function (e) {
					// 修饰键必须一起下发，否则 Ctrl+A / Ctrl+C 这类组合在页面里等同于普通按键。
					var mods = (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);
					var named = { Enter: 13, Backspace: 8, Tab: 9, Escape: 27, Delete: 46,
						ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Home: 36, End: 35,
						PageUp: 33, PageDown: 34, Insert: 45, F5: 116 };
					// 无修饰键的可打印字符走 insertText，输入法与符号行为才正常；
					// 带 Ctrl/Cmd/Alt 的单字符是快捷键，按按键事件带修饰键下发。
					if (e.key.length === 1 && mods === 0) {
						e.preventDefault();
						send("text", { text: e.key });
						return;
					}
					if (e.key.length === 1) {
						e.preventDefault();
						var vk = e.key.toUpperCase().charCodeAt(0);
						send("key", { event: { key: e.key, code: e.code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mods } });
						return;
					}
					if (named[e.key]) {
						e.preventDefault();
						send("key", { event: { key: e.key, code: e.code, windowsVirtualKeyCode: named[e.key], nativeVirtualKeyCode: named[e.key], modifiers: mods } });
					}
				}
			},
				IS_TAURI
					// 原生子 WebView 就盖在这块矩形上绘制网页，面板只留一个占位底色。
					? h("div", { style: { width: "100%", height: "100%", background: "#fff" } })
					: (src
						? h("img", { ref: imgRef, src: src, draggable: false,
							style: { width: "100%", height: "100%", objectFit: "fill", imageRendering: "auto", display: "block", userSelect: "none" } })
						: h("div", { style: { padding: 20, color: "#7d8592", fontSize: 12.5 } }, "正在启动浏览器…"))
			);
		}

		// ── the pane ─────────────────────────────────────────────────────────

		function PreviewOverlay() {
			var openState = useState(true); var open = openState[0], setOpen = openState[1];
			var tabsState = useState([]); var tabs = tabsState[0], setTabs = tabsState[1];
			var activeState = useState(null); var activeId = activeState[0], setActiveId = activeState[1];
			var widthState = useState(readWidth); var width = widthState[0], setWidth = widthState[1];
			var busyState = useState(false); var busy = busyState[0], setBusy = busyState[1];
			var addrState = useState(""); var addr = addrState[0], setAddr = addrState[1];
			var editingState = useState(false); var editing = editingState[0], setEditing = editingState[1];
			// 浏览器里的真实标签（含 Agent 自己开出来的标签），与面板自己的文件预览标签并存。
			var targetsState = useState([]); var targets = targetsState[0], setTargets = targetsState[1];
			var activeTargetState = useState(null); var activeTargetId = activeTargetState[0], setActiveTargetId = activeTargetState[1];
			// 视口当前显示浏览器标签还是本地文件：两者走不同的渲染路径。
			var kindState = useState("browser"); var viewKind = kindState[0], setViewKind = kindState[1];

			var frameRef = useRef(null);
			var addrRef = useRef(null);
			// The live <webview>, when running inside the desktop shell.
			var webviewRef = useRef(null);

			// Mirrors of the render state. The command loop mounts once, so a
			// callback closing over `tabs`/`activeId` would read first-render
			// values forever -- refs are what let a push right after navigation
			// see the tab it just created.
			var tabsRef = useRef(tabs);
			var activeRef = useRef(activeId);
			var targetsRef = useRef(targets);
			var activeTargetRef = useRef(activeTargetId);
			var viewKindRef = useRef(viewKind);
			var openRef = useRef(open);
			// So a page navigating itself does not overwrite a url the human is
			// halfway through typing.
			var editingRef = useRef(false);
			// url -> extracted text, for cross-origin pages we must not refetch
			// on every tick.
			var textCache = useRef({});

			useEffect(function () { tabsRef.current = tabs; }, [tabs]);
			useEffect(function () { activeRef.current = activeId; }, [activeId]);
			useEffect(function () { targetsRef.current = targets; }, [targets]);
			useEffect(function () { activeTargetRef.current = activeTargetId; }, [activeTargetId]);
			useEffect(function () { viewKindRef.current = viewKind; }, [viewKind]);
			useEffect(function () { openRef.current = open; }, [open]);
			useEffect(function () { editingRef.current = editing; }, [editing]);

			/**
			 * 轮询浏览器里的真实标签列表。
			 *
			 * 这是「人机共用同一个浏览器」的关键：Agent 用官方 browser-use 工具在同一个
			 * 浏览器里开标签、导航，面板本身无从得知；定期拉一次标签列表，人就能看到它
			 * 在哪个标签上干活并切过去旁观，两边的页面互不打断。
			 */
			useEffect(function () {
				if (!open) return undefined;
				var alive = true;
				function pull() {
					fetch(LIVE_PATH + "/targets", { cache: "no-store" })
						.then(function (r) { return r.json(); })
						.then(function (d) {
							if (!alive || !d || !Array.isArray(d.targets)) return;
							setTargets(d.targets);
							setActiveTargetId(function (current) {
								// 选中的标签被关掉时，退回到浏览器当前活动的那个。
								if (current && d.targets.some(function (t) { return t.id === current; })) return current;
								var act = d.targets.filter(function (t) { return t.active; })[0] || d.targets[0];
								return act ? act.id : null;
							});
						})
						.catch(function () { /* 宿主可能正在重启，下一轮再试 */ });
				}
				pull();
				var timer = setInterval(pull, 1500);
				return function () { alive = false; clearInterval(timer); };
			}, [open]);

			var activeTarget = null;
			for (var ti = 0; ti < targets.length; ti++) {
				if (targets[ti].id === activeTargetId) { activeTarget = targets[ti]; break; }
			}

			// Keep the address bar in step unless the user is typing in it.
			useEffect(function () {
				if (editing) return;
				if (viewKind === "file") {
					var t = (tabsRef.current || []).find(function (x) { return x.id === activeId; });
					setAddr(displayUrl(t));
					return;
				}
				var cur = (targetsRef.current || []).filter(function (x) { return x.id === activeTargetId; })[0];
				setAddr(cur ? (cur.url || "") : "");
			}, [activeId, tabs, editing, activeTargetId, targets, viewKind]);

			var tabOf = useCallback(function (id) {
				return (tabsRef.current || []).find(function (t) { return t.id === id; }) || null;
			}, []);

			/**
			 * Extract the active tab's text.
			 * @param force re-read cross-origin even if cached (used on navigate/reload)
			 */
			var readTabText = useCallback(function (tab, force) {
				return new Promise(function (resolve) {
					// In the shell, a live tab is a real <webview>. Its DOM is
					// reachable through executeJavaScript, so the pane can push
					// genuine rendered text for pages the host has no CDP
					// connection to -- which is how read_preview works here.
					var wv = webviewRef.current;
					if (tab && tab.live && wv) {
						var done = false;
						var finish = function (text, via) {
							if (done) return;
							done = true;
							resolve({ text: collapse(text || ""), via: via });
						};
						// A webview that is still attaching rejects, and a page
						// mid-navigation can hang; neither should stall the push.
						setTimeout(function () { finish("", "pending"); }, 1500);
						try {
							wv.executeJavaScript("document.body ? document.body.innerText : ''")
								.then(function (t) { finish(t, "webview-dom"); })
								.catch(function () { finish("", "pending"); });
						} catch (e) { finish("", "pending"); }
						return;
					}
					var doc = frameDocument(frameRef.current);
					if (doc && doc.body && typeof doc.body.innerText !== "undefined") {
						resolve({ text: collapse(doc.body.innerText || doc.body.textContent || ""), via: "live-dom" });
						return;
					}
					// A proxied site is now sandboxed without allow-same-origin, so its
					// DOM is opaque to us. Its URL is one of OUR routes though, so
					// fetching it here is a same-origin request that succeeds.
					var url = tab && tab.url;
					var fetchable = !!url && (/^https?:/i.test(url) || url.charAt(0) === "/");
					if (!fetchable) { resolve({ text: "", via: "none" }); return; }
					if (!force && typeof textCache.current[url] === "string") {
						resolve({ text: textCache.current[url], via: "cache" });
						return;
					}
					fetch(url, { cache: "no-store" })
						.then(function (r) { return r.text(); })
						.then(function (html) {
							var t = htmlToText(html);
							textCache.current[url] = t;
							resolve({ text: t, via: "html" });
						})
						.catch(function () { resolve({ text: "", via: "none" }); });
				});
			}, []);

			var pushState = useCallback(function (force) {
				var tid = activeTargetRef.current;
				// 面板显示真浏览器标签时，文本与地址以宿主侧 CDP 为准：那是浏览器里的事实，
				// 而不是面板对它的镜像，read_preview 因此读到的就是人眼前这一页。
				if (openRef.current && viewKindRef.current === "browser") {
					if (!tid) { postJson(STATE_PATH, { opened: true }); return; }
					var q = "?target=" + encodeURIComponent(tid);
					Promise.all([
						fetch(LIVE_PATH + "/text" + q, { cache: "no-store" }).then(function (r) { return r.json(); }).catch(function () { return null; }),
						fetch(LIVE_PATH + "/state" + q, { cache: "no-store" }).then(function (r) { return r.json(); }).catch(function () { return null; }),
					]).then(function (out) {
						var st = out[1] || {};
						postJson(STATE_PATH, {
							tabId: tid, url: st.url || "", title: st.title || "",
							text: (out[0] && out[0].text) || "", opened: true, mode: "stream"
						});
						setBusy(false);
					});
					return;
				}
				var tab = tabOf(activeRef.current);
				if (!tab || !openRef.current) { postJson(STATE_PATH, { opened: openRef.current }); return; }
				readTabText(tab, force).then(function (out) {
					// In the shell the pane OWNS the browser, so it must also be
					// the authority on where that browser actually is: a redirect
					// or a link click moves the webview without going through
					// `navigate`, and pushing the tab's original url would report
					// the wrong page for text that is genuinely current.
					var url = tab.url, title = tab.title;
					if (tab.live && webviewRef.current) {
						url = safeUrl(webviewRef.current) || tab.url;
						try { title = webviewRef.current.getTitle() || title; } catch (e) { /* not ready */ }
					}
					postJson(STATE_PATH, {
						tabId: tab.id, url: url, title: title, text: out.text, opened: true,
						// Tells the host the pane is the source of truth for live
						// tabs, so read_preview does not go asking a CDP browser
						// that is not driving this pane.
						mode: (IS_SHELL && tab.live) ? "webview" : "stream"
					});
					setBusy(false);
				});
			}, [tabOf, readTabText]);

			var navigate = useCallback(function (rawUrl, tabId, label, filePath, siteUrl) {
				var url = rawUrl || "";
				if (!url) return;
				var id = tabId || ("tab-" + Date.now());
				setBusy(true);
				setTabs(function (prev) {
					var exists = prev.some(function (t) { return t.id === id; });
					var title = label || siteUrl || filePath || url;
					if (exists) {
						return prev.map(function (t) {
							return t.id === id
								? Object.assign({}, t, { url: url, title: title, filePath: filePath, siteUrl: siteUrl })
								: t;
						});
					}
					return prev.concat([{ id: id, url: url, title: title, filePath: filePath, siteUrl: siteUrl }]);
				});
				setActiveId(id);
				setOpen(true);
				// Drop any blank placeholders now that a real page has a tab.
				setTabs(function (prev) {
					return prev.filter(function (t) { return !t.blank || t.id === id; });
				});
				// The refs update on the next commit; push after it so the tab exists.
				setTimeout(function () { pushState(true); }, 900);
			}, [pushState]);

			var closeTab = useCallback(function (cid) {
				setTabs(function (prev) { return prev.filter(function (t) { return t.id !== cid; }); });
				setActiveId(function (a) {
					if (a !== cid) return a;
					var rest = (tabsRef.current || []).filter(function (t) { return t.id !== cid; });
					return rest.length ? rest[rest.length - 1].id : null;
				});
				setTimeout(function () { pushState(false); }, 200);
			}, [pushState]);

			var handleCommand = useCallback(function (cmd) {
				if (!cmd || typeof cmd !== "object") return;
				if (cmd.action === "navigate") {
					if (cmd.siteUrl) {
						// In the shell the pane has its own browser, so there is
						// no separate Chrome to launch -- hand the url straight to
						// the webview.
						if (IS_SHELL) { navigateLive(cmd.siteUrl, cmd.label || cmd.siteUrl, cmd.tabId); return; }
						// Agent 让面板打开网页：落在面板当前显示的标签上，并把视图切回浏览器，
						// 这样人正在看文件时也能立刻看到它开了哪一页。
						var q = activeTargetRef.current ? ("?target=" + encodeURIComponent(activeTargetRef.current)) : "";
						postJson(LIVE_PATH + "/open" + q, { url: cmd.siteUrl }).then(function (st) {
							if (st && st.ok) { setViewKind("browser"); return; }
							setViewKind("file");
							navigate(cmd.url, cmd.tabId, cmd.label, cmd.filePath, cmd.siteUrl);
						});
					} else {
						setViewKind("file");
						navigate(cmd.url, cmd.tabId, cmd.label, cmd.filePath, cmd.siteUrl);
					}
				}
				else if (cmd.action === "close-tab") closeTab(cmd.tabId);
				else if (cmd.action === "close-all") {
					setTabs([]); setActiveId(null); setOpen(false);
					setTimeout(function () { pushState(false); }, 200);
				}
			}, [navigate, closeTab, pushState]);

			var handleRef = useRef(handleCommand);
			useEffect(function () { handleRef.current = handleCommand; }, [handleCommand]);

			// Command loop. Mounted once; dispatches through a ref so it always
			// runs the current handler rather than the first-render closure.
			useEffect(function () {
				var alive = true, timer = null;
				function loop() {
					pollCommands().then(function (commands) {
						if (!alive) return;
						for (var i = 0; i < commands.length; i++) {
							try { handleRef.current(commands[i]); } catch (e) { /* keep polling */ }
						}
						timer = setTimeout(loop, COMMAND_POLL_MS);
					});
				}
				loop();
				return function () { alive = false; if (timer) clearTimeout(timer); };
			}, []);

			// Live push. Only cheap for same-origin frames, so cross-origin uses
			// the cache and is refreshed on navigate/reload instead.
			useEffect(function () {
				if (!open) return;
				var t = setInterval(function () { pushState(false); }, LIVE_PUSH_MS);
				return function () { clearInterval(t); };
			}, [open, pushState]);

			// Clicking a link or a file path in the CHAT opens it here rather than
			// throwing the user out to the OS browser. Capture phase, because the
			// app's own handlers would otherwise win.
			useEffect(function () {
				function isOurs(node) {
					// Never hijack clicks inside the pane itself (tabs, address bar).
					return !!(node && node.closest && node.closest("[data-dsh-preview]"));
				}
				function looksLikePath(t) {
					var v = String(t || "").trim();
					if (v.length < 4 || v.length > 400 || /\s{2,}/.test(v)) return false;
					return /^[a-zA-Z]:[\\/]/.test(v) || /^\\\\/.test(v) || /^\//.test(v) || /^file:/i.test(v);
				}
				function onClick(e) {
					var t = e.target;
					if (!t || !t.closest || isOurs(t)) return;

					var a = t.closest("a[href]");
					if (a) {
						var href = a.getAttribute("href") || "";
						if (/^(#|javascript:|mailto:|tel:)/i.test(href)) return;
						// Only external/absolute links -- in-app routing stays untouched.
						if (!/^https?:\/\//i.test(href)) return;
						e.preventDefault();
						e.stopPropagation();
						openRefFn.current(href);
						return;
					}

					// A code span or cell holding an absolute path is the way file
					// names actually appear in this UI.
					var code = t.closest("code, .path, td, span");
					if (code && looksLikePath(code.textContent)) {
						e.preventDefault();
						e.stopPropagation();
						openRefFn.current(code.textContent.trim());
					}
				}
				document.addEventListener("click", onClick, true);
				return function () { document.removeEventListener("click", onClick, true); };
			}, []);

			// 面板由官方右侧栏承载，宽度与轨道归右栏所有：原先那套"占用 grid 轨道 +
			// 观察页面重写"的逻辑在这里必须停用，否则会与右栏自己的布局互相踩。

			// Drag-to-resize from the pane's left edge.
			var dragRef = useRef(null);
			useEffect(function () {
				function move(e) {
					if (dragRef.current === null) return;
					var next = Math.min(MAX_W, Math.max(MIN_W, window.innerWidth - e.clientX - 8));
					setWidth(next);
				}
				function up() {
					if (dragRef.current === null) return;
					dragRef.current = null;
					document.body.style.userSelect = "";
					try { window.localStorage.setItem(WIDTH_KEY, String(widthRef.current)); } catch (e) { /* ignore */ }
				}
				window.addEventListener("mousemove", move);
				window.addEventListener("mouseup", up);
				return function () {
					window.removeEventListener("mousemove", move);
					window.removeEventListener("mouseup", up);
				};
			}, []);
			var widthRef = useRef(width);
			useEffect(function () { widthRef.current = width; }, [width]);

			/**
			 * Resolve a raw target through the HOST and show it.
			 * The host owns normalization (file -> served path, site -> proxy), so
			 * the pane never has to duplicate that logic and the two cannot drift.
			 */
			var openTarget = useCallback(function (raw) {
				var v = String(raw || "").trim();
				if (!v) return;
				postJson("/api/preview/open", { url: v }).then(function (r) {
					if (!r || !r.url) return;
					// A web page goes to the real browser: it can be logged in, and
					// it works on sites that refuse to be framed. Local files stay
					// on the file route, which renders them properly.
					if (r.siteUrl) {
						if (IS_SHELL) { navigateLive(r.siteUrl, r.label || r.siteUrl, r.tabId); return; }
						setBusy(true);
						// 落在面板当前显示的那个标签上，而不是"浏览器碰巧活动的标签"。
						var q = activeTargetRef.current ? ("?target=" + encodeURIComponent(activeTargetRef.current)) : "";
						postJson(LIVE_PATH + "/open" + q, { url: r.siteUrl }).then(function (st) {
							setBusy(false);
							if (st && st.ok) { setViewKind("browser"); return; }
							// 真浏览器不可用时退回代理路径，至少让人看见这页。
							setViewKind("file");
							navigate(r.url, r.tabId, r.label, r.filePath, r.siteUrl);
						});
						return;
					}
					setViewKind("file");
					navigate(r.url, r.tabId, r.label, r.filePath, r.siteUrl);
				});
			}, [navigate]);

			/** Show a page in the live browser under its own tab. */
			/**
			 * Show a page in the live view under its own tab.
			 *
			 * @param tabId the id the HOST already gave this tab. Use it when we
			 *   have it, because the host looks its pushed state up BY id: a tab
			 *   the pane calls something else is a tab the host cannot find, so
			 *   read_preview falls through to the CDP browser -- which in shell
			 *   mode is driving nothing, and answers with a url and no text.
			 *   That mismatch is exactly how "the page is open but has rendered
			 *   no text yet" gets returned for a page that is plainly rendered.
			 */
			var navigateLive = useCallback(function (siteUrl, title, tabId) {
				var id = tabId || "live";
				setTabs(function (prev) {
					// One live view at a time, whatever it happens to be called,
					// so a changing id cannot leave stale live tabs in the strip.
					var rest = prev.filter(function (t) { return !t.live && !t.blank && t.id !== id; });
					return rest.concat([{ id: id, url: siteUrl, siteUrl: siteUrl, title: title || siteUrl, live: true }]);
				});
				setActiveId(id);
				setOpen(true);
			}, []);

			var openRefFn = useRef(openTarget);
			useEffect(function () { openRefFn.current = openTarget; }, [openTarget]);

			function submitAddr(e) {
				if (e) e.preventDefault();
				var v = String(addr || "").trim();
				if (!v) return;
				setEditing(false);
				openTarget(v);
			}

			/**
			 * 切换面板显示的真实标签。
			 *
			 * 先本地切换让画面立刻跟上，再通知宿主把该标签设为浏览器活动标签：后台标签
			 * 会被 Chrome 节流渲染，不激活的话帧流看起来就像卡住了。
			 */
			function activateTarget(id) {
				setViewKind("browser");
				setActiveTargetId(id);
				postJson(LIVE_PATH + "/activate", { targetId: id }).catch(function () { /* 下一轮轮询会纠正 */ });
			}

			/** 新建一个真实标签页（浏览器里的标签，不是面板的记录）。 */
			function newBrowserTab() {
				postJson(LIVE_PATH + "/newtab", {}).then(function (r) {
					var t = r && r.target;
					if (!t || !t.id) return;
					setTargets(function (prev) {
						return prev.concat([{ id: t.id, title: t.title || "", url: t.url || "", active: true }]);
					});
					setViewKind("browser");
					setActiveTargetId(t.id);
					setTimeout(function () { if (addrRef.current) addrRef.current.focus(); }, 60);
				});
			}

			/** 关闭一个真实标签页。 */
			function closeBrowserTab(id) {
				postJson(LIVE_PATH + "/closetab", { targetId: id }).then(function () {
					setTargets(function (prev) { return prev.filter(function (t) { return t.id !== id; }); });
				});
			}

			/** 标签条上的显示名：优先主机名，退回标题。 */
			function labelForTarget(t) {
				try {
					var host = new URL(t.url || "").hostname;
					if (host) return host;
				} catch (e) { /* about:blank 之类没有主机名 */ }
				return t.title || "新标签页";
			}

			/** 空态：面板打开着，但还没有任何可显示的内容。 */
			function emptyPane() {
				return h("div", { style: emptyStyle },
					h("div", { style: { fontSize: 26, opacity: .25, marginBottom: 10 } }, "▦"),
					h("div", { style: { fontWeight: 600, marginBottom: 6, color: "#c7ccd4" } }, "还没有打开任何页面"),
					h("div", null, "在上方输入网址或文件路径，或用 + 新建标签页。")
				);
			}

			/**
			 * Save the file on screen to the machine the human is sitting at.
			 *
			 * The host serves it with Content-Disposition: attachment, so the
			 * browser writes it instead of displaying it. An anchor click is
			 * used rather than assigning location, which would navigate the
			 * pane away from the file before the download started.
			 *
			 * This is the only route a file has to the human when the harness
			 * is on another machine -- the file itself never leaves that box
			 * otherwise.
			 */
			function downloadActive() {
				var t = tabOf(activeId);
				if (!t || !t.filePath || !t.url) return;
				var sep = t.url.indexOf("?") === -1 ? "?" : "&";
				var a = document.createElement("a");
				a.href = t.url + sep + "dl=1";
				// The server's header names the file; this is only a hint for
				// clients that ignore it.
				a.download = "";
				a.style.display = "none";
				document.body.appendChild(a);
				a.click();
				setTimeout(function () { try { a.remove(); } catch (e) { /* gone */ } }, 0);
			}

			/** 历史前进/后退；作用对象始终是面板正在显示的那个标签。 */
			function goStep(direction) {
				var q = activeTargetId ? ("?target=" + encodeURIComponent(activeTargetId)) : "";
				setBusy(true);
				postJson(LIVE_PATH + "/" + direction + q, {}).then(function () { setBusy(false); });
			}

			function reload() {
				if (viewKind === "browser") {
					// 重载面板正在显示的那个标签；它未必是浏览器当前活动的标签。
					setBusy(true);
					var q = activeTargetId ? ("?target=" + encodeURIComponent(activeTargetId)) : "";
					postJson(LIVE_PATH + "/reload" + q, {}).then(function () { setBusy(false); });
					return;
				}
				var tab = tabOf(activeId);
				if (!tab) return;
				if (tab.live && IS_SHELL && webviewRef.current) {
					try { webviewRef.current.reload(); } catch (e) { /* not ready */ }
					return;  // did-stop-loading clears the spinner and pushes text
				}
				if (tab.live) { setBusy(true); postJson(LIVE_PATH + "/reload", {}).then(function () { setBusy(false); }); return; }
				setBusy(true);
				var frame = frameRef.current;
				if (frame) { try { frame.src = tab.url; } catch (e) { /* ignore */ } }
				setTimeout(function () { pushState(true); }, 900);
			}

			// ── render ────────────────────────────────────────────────────────
			// 面板住在官方右侧栏的一个标签里：显示与否由右栏的标签决定，没有浮层开关，
			// 也没有自己的轨道与宽度。
			var activeTab = tabOf(activeId);

			return h("div", {
				style: { display: "flex", flexDirection: "column", width: "100%", height: "100%", minHeight: 0, background: "transparent" },
				"data-dsh-preview": "1"
			},

				// header
				h("div", { style: headerStyle },
					h("span", { style: { fontWeight: 620, fontSize: 12.5, letterSpacing: .2, opacity: .9 } }, "浏览器"),
					h("div", { style: { display: "flex", gap: 2, alignItems: "center" } },
						// Only for files: "download" of a live web page is not a
						// meaningful action, and a button that does nothing is
						// worse than no button.
						(activeTab && activeTab.filePath)
							? h("button", {
								onClick: downloadActive,
								title: "把这个文件保存到本机",
								style: iconBtn
							}, "↓")
							: null,
						h("button", { onClick: function () { goStep("back"); }, title: "后退", style: iconBtn }, "←"),
						h("button", { onClick: function () { goStep("forward"); }, title: "前进", style: iconBtn }, "→"),
						h("button", { onClick: reload, title: "重新载入", style: iconBtn }, "↻"),
						h("button", {
							onClick: function () {
								var t = tabOf(activeId);
								var real = t && (t.siteUrl || t.url);
								if (real && /^https?:/i.test(real)) window.open(real, "_blank", "noreferrer");
							},
							title: "在系统浏览器中打开", style: iconBtn
						}, "↗"),
						h("button", { onClick: function () { setOpen(false); }, title: "关闭面板", style: iconBtn }, "✕")
					)
				),

				// address bar
				h("form", { onSubmit: submitAddr, style: addrWrapStyle },
					h("input", {
						ref: addrRef,
						value: addr,
						spellCheck: false,
						placeholder: "输入网址或文件路径…",
						onChange: function (e) { setEditing(true); setAddr(e.target.value); },
						onBlur: function () { setEditing(false); },
						style: addrInputStyle
					}),
					busy ? h("span", { style: spinnerStyle, title: "加载中" }, "●") : null
				),

				// tabs：浏览器真实标签（含 Agent 自己开的）+ 面板自己的文件预览标签
				h("div", { style: tabStripStyle },
					targets.map(function (t) {
						var active = viewKind === "browser" && t.id === activeTargetId;
						return h("div", {
							key: "target-" + t.id,
							title: t.url || t.title || "标签页",
							onClick: function () { activateTarget(t.id); },
							style: Object.assign({}, tabStyle, active ? tabActiveStyle : {})
						},
							h("span", { style: tabLabelStyle }, labelForTarget(t)),
							h("button", {
								onClick: function (e) { e.stopPropagation(); closeBrowserTab(t.id); },
								style: closeXStyle, title: "关闭标签页"
							}, "×")
						);
					}).concat(
						tabs.filter(function (tab) { return !tab.live && !!tab.url; }).map(function (tab) {
							var active = viewKind === "file" && tab.id === activeId;
							return h("div", {
								key: "file-" + tab.id, title: displayUrl(tab) || tab.title,
								onClick: function () { setViewKind("file"); setActiveId(tab.id); },
								style: Object.assign({}, tabStyle, active ? tabActiveStyle : {})
							},
								h("span", { style: tabLabelStyle }, shortLabel(tab)),
								h("button", {
									onClick: function (e) { e.stopPropagation(); closeTab(tab.id); },
									style: closeXStyle, title: "关闭标签页"
								}, "×")
							);
						})
					).concat([
						h("button", {
							key: "new-tab",
							onClick: newBrowserTab,
							title: "新建标签页",
							style: newTabStyle
						}, "+")
					])
				),

				// viewport
				h("div", { style: { flex: 1, position: "relative", minHeight: 0, background: "#fff" } },
					IS_SHELL
						// 桌面壳里 live 标签是一个真 <webview>；本次多标签改造只覆盖 Web 模式，
						// 壳这条路保持原行为。
						? ((activeTab && activeTab.live)
							? h(ShellView, {
								key: "shell",
								url: activeTab.url,
								viewRef: webviewRef,
								onLoading: setBusy,
								onNav: function (u, t) {
									if (!u) return;
									setTabs(function (prev) {
										return prev.map(function (x) {
											return x.id === "live" ? Object.assign({}, x, { url: u, siteUrl: u, title: t || x.title }) : x;
										});
									});
									if (!editingRef.current) setAddr(u);
								}
							})
							: emptyPane())
						: (viewKind === "browser"
							? (activeTargetId
								// key 带上 target：换标签就是换帧流与输入目标，让 React 整块重建视图。
								? h(LiveView, { key: "live-" + activeTargetId, targetId: activeTargetId, url: (activeTarget && activeTarget.url) || "about:blank" })
								: emptyPane())
							: ((activeTab && activeTab.url)
								? h("iframe", Object.assign({
									ref: frameRef,
									src: activeTab.url,
									style: frameStyle,
									onLoad: function () { setTimeout(function () { pushState(true); }, 350); }
								}, frameSandbox(activeTab)))
								: emptyPane()))
				)
			);
		}

		/** Tab label: basename for files, hostname for pages. */
		function shortLabel(tab) {
			if (!tab) return "";
			if (tab.blank || !tab.url) return "新标签页";
			if (tab.filePath) {
				var parts = String(tab.filePath).split(/[\\/]/);
				return parts[parts.length - 1] || tab.filePath;
			}
			var forLabel = tab.siteUrl || tab.url;
			try { return new URL(forLabel, window.location.origin).hostname || tab.title || forLabel; }
			catch (e) { return tab.title || forLabel; }
		}

		/**
		 * Sandbox policy, which differs by WHAT is being shown.
		 *
		 * Local files: no sandbox. It is our own content served by our own host,
		 * so sandboxing buys nothing -- and it costs something real: Chrome
		 * refuses to run its built-in PDF viewer inside a sandboxed frame, so a
		 * sandboxed .pdf renders as a blank pane.
		 *
		 * Proxied websites: sandboxed WITHOUT allow-same-origin. This matters.
		 * Everything the pane shows is served from the harness's own origin, so
		 * `allow-scripts` + `allow-same-origin` together would let an arbitrary
		 * website's JavaScript reach `parent` and read the app around it. Dropping
		 * allow-same-origin gives the frame an opaque origin, isolating it. Text
		 * extraction still works: the pane fetches the proxy URL itself, which is
		 * same-origin for US, and parses that.
		 */
		function frameSandbox(tab) {
			var isLocalFile = !!(tab && (tab.filePath || /^\/api\/preview\/file/.test(tab.url || "")));
			if (isLocalFile) return {};
			return { sandbox: "allow-scripts allow-forms allow-popups" };
		}

		// ── styles ───────────────────────────────────────────────────────────
		var BORDER = "var(--dsw-alias-border-l2, #2b2f37)";
		var BG = "var(--dsw-alias-bg-base, #16181d)";

		/**
		 * Railed: fill the reserved track exactly — flush right, full height, no
		 * rounding or shadow, so it reads as a column of the app rather than a
		 * card floating above it.
		 * Unrailed: the original floating card, used when the shell shape is
		 * unrecognised.
		 */
		function paneStyle(width, railed, frameTop) {
			var common = {
				position: "fixed", width: width, zIndex: 30,
				display: "flex", flexDirection: "column",
				background: BG, overflow: "hidden", pointerEvents: "auto"
			};
			if (railed) {
				return Object.assign(common, {
					top: frameTop, right: 0, bottom: 0,
					borderLeft: "1px solid " + BORDER,
					borderTop: "1px solid " + BORDER
				});
			}
			return Object.assign(common, {
				top: PANE_TOP, right: 8, bottom: 8,
				border: "1px solid " + BORDER, borderRadius: 12,
				boxShadow: "0 12px 40px rgba(0,0,0,.45)"
			});
		}
		var gripStyle = {
			position: "absolute", left: 0, top: 0, bottom: 0, width: 6,
			cursor: "col-resize", zIndex: 2
		};
		var headerStyle = {
			display: "flex", alignItems: "center", justifyContent: "space-between",
			padding: "7px 8px 7px 12px", borderBottom: "1px solid " + BORDER,
			background: "rgba(255,255,255,.03)"
		};
		var iconBtn = {
			border: "1px solid transparent", background: "transparent", color: "#aab1bd",
			borderRadius: 6, width: 24, height: 24, cursor: "pointer", fontSize: 13,
			lineHeight: "22px", padding: 0
		};
		var addrWrapStyle = {
			display: "flex", alignItems: "center", gap: 6, padding: "7px 10px",
			borderBottom: "1px solid " + BORDER
		};
		var addrInputStyle = {
			flex: 1, minWidth: 0, background: "rgba(0,0,0,.28)",
			border: "1px solid " + BORDER, borderRadius: 7, color: "#dfe3e9",
			padding: "5px 9px", fontSize: 11.5, outline: "none",
			fontFamily: 'ui-monospace, "Cascadia Code", Consolas, monospace'
		};
		var spinnerStyle = { color: "#6fb3ff", fontSize: 9, opacity: .9 };
		var tabStripStyle = {
			display: "flex", gap: 4, padding: "6px 8px",
			borderBottom: "1px solid " + BORDER, overflowX: "auto", background: "rgba(0,0,0,.16)"
		};
		var tabStyle = {
			display: "flex", alignItems: "center", gap: 5, maxWidth: 170,
			padding: "3px 8px", borderRadius: 6, fontSize: 11.5, color: "#9aa1ad",
			cursor: "pointer", background: "rgba(0,0,0,.25)", border: "1px solid transparent",
			flex: "0 0 auto"
		};
		var tabActiveStyle = { color: "#fff", background: "rgba(255,255,255,.14)", borderColor: BORDER };
		var tabLabelStyle = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 };
		var newTabStyle = {
			flex: "0 0 auto", border: "1px dashed " + BORDER, background: "transparent",
			color: "#8b929e", borderRadius: 6, width: 24, height: 22, cursor: "pointer",
			fontSize: 14, lineHeight: "18px", padding: 0
		};
		var closeXStyle = {
			border: "none", background: "transparent", color: "#8b929e", cursor: "pointer",
			fontSize: 13, lineHeight: "13px", padding: 0, width: 14, height: 14
		};
		var frameStyle = { width: "100%", height: "100%", border: 0, background: "#fff", display: "block" };
		var emptyStyle = {
			padding: 28, color: "#7d8592", fontSize: 12.5, lineHeight: 1.6,
			display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
			height: "100%", textAlign: "center", background: BG
		};
		var codeStyle = {
			background: "rgba(255,255,255,.08)", borderRadius: 4, padding: "1px 5px",
			fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 11
		};
		function launcherStyle(active, railWidth) {
			return {
				position: "fixed", bottom: 14, right: 14 + (railWidth || 0), zIndex: 31,
				pointerEvents: "auto",
				border: "1px solid " + (active ? "rgba(111,179,255,.55)" : BORDER),
				background: active ? "rgba(111,179,255,.14)" : "var(--dsw-alias-bg-base, #1e2127)",
				color: active ? "#cfe4ff" : "#c7ccd4",
				borderRadius: 999,
				padding: "7px 13px", cursor: "pointer", fontSize: 11.5, fontWeight: 560,
				letterSpacing: .2, boxShadow: "0 4px 16px rgba(0,0,0,.35)",
				display: "flex", alignItems: "center", gap: 7,
				transition: "right .18s ease, background .15s ease, border-color .15s ease"
			};
		}

		/** Small state lamp: filled when the pane is showing. */
		function dotStyle(active) {
			return {
				width: 6, height: 6, borderRadius: 999, display: "inline-block",
				background: active ? "#6fb3ff" : "#5b6472",
				boxShadow: active ? "0 0 6px rgba(111,179,255,.9)" : "none"
			};
		}

		// 依赖的宿主服务（Cordis 服务名）：右栏标签注册表与插槽系统。
		var inject = [ "slots", "sidebarRightTabs" ];

		// 右栏里的身份：id 是插槽 seat 的 key，kind 是 openTab 用的判别标签。
		var TAB_ID = "dsh-plugin-browser";
		var TAB_KIND = "browser";

		function apply(ctx) {
			// ① 类型：向官方右侧栏声明"浏览器"这类标签，并给引导页一枚入口胶囊，
			//    于是入口就在右栏自己的添加入口里，不再需要浮层按钮。
			ctx.effect(function () {
				return ctx.sidebarRightTabs.register({
					id: TAB_ID,
					kind: TAB_KIND,
					priority: "extension",
					title: function () { return "浏览器"; },
					guide: [{
						id: "open",
						order: 30,
						title: function () { return "浏览器"; },
						description: function () { return "用真实 Chrome 打开网页，人与 Agent 共用同一个浏览器"; }
					}]
				});
			});

			// ② 正文：面板本体注册进右栏的标签正文席位，key 必须是上面那个 id。
			//    两个注册都由 effect 持有，卸载（含 HMR 热替换）时随之回收。
			ctx.effect(function () {
				return ctx.slots.inject("sidebar.right.pane.tab", function () {
					return ctx.slots.register({
						name: "sidebar.right.pane.tab",
						key: TAB_ID,
						inject: function () { return {}; }
					}, PreviewOverlay);
				});
			});
		}

		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	}
});
