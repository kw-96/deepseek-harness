window.__ModuleLoader__.load({
	id: "dsh-desktop-panel",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		//#region lib/types/client/DesktopPanelCard.js
		/**
		* 桌面面板的设置卡片：显示插件状态、启停开关与面板访问地址。
		* 数据全部来自 host 侧的 /plugin/desktop/state 与 /plugin/desktop/enabled 两个 HTTP 接口，
		* 因此这里不需要 typert remote 通道。
		*/
		const cardStyle = {
			border: "1px solid var(--dsw-border, #343a43)",
			borderRadius: "10px",
			padding: "14px 16px",
			background: "var(--dsw-surface, rgba(255,255,255,0.02))",
			display: "flex",
			flexDirection: "column",
			gap: "10px",
			maxWidth: "640px"
		};
		const rowStyle = {
			display: "flex",
			alignItems: "center",
			gap: "10px"
		};
		const buttonStyle = {
			border: "1px solid var(--dsw-border, #343a43)",
			borderRadius: "6px",
			padding: "5px 14px",
			cursor: "pointer",
			background: "transparent",
			color: "inherit",
			fontSize: "13px"
		};
		const onButtonStyle = {
			...buttonStyle,
			background: "var(--dsw-accent, #2d5bd7)",
			borderColor: "var(--dsw-accent, #2d5bd7)",
			color: "#fff"
		};
		const codeStyle = {
			fontFamily: "Consolas, Menlo, monospace",
			fontSize: "12px",
			padding: "3px 8px",
			borderRadius: "6px",
			background: "rgba(127,127,127,0.14)",
			wordBreak: "break-all"
		};
		/**
		* 桌面面板设置卡片。
		* @param props 宿主注入的文案函数
		* @returns 卡片元素
		*/
		function DesktopPanelCard({ t }) {
			const [state, setState] = (0, react.useState)(null);
			const [busy, setBusy] = (0, react.useState)(false);
			const [failure, setFailure] = (0, react.useState)("");
			const [copied, setCopied] = (0, react.useState)(false);
			const load = (0, react.useCallback)(async () => {
				try {
					const response = await fetch("/plugin/desktop/state", { cache: "no-store" });
					setState(await response.json());
					setFailure("");
				} catch {
					setFailure(t("loadFailed"));
				}
			}, [t]);
			(0, react.useEffect)(() => {
				load();
			}, [load]);
			const toggle = (0, react.useCallback)(async () => {
				if (state === null || busy) return;
				setBusy(true);
				try {
					await fetch("/plugin/desktop/enabled", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ enabled: !state.enabled })
					});
					await load();
				} catch {
					setFailure(t("toggleFailed"));
				} finally {
					setBusy(false);
				}
			}, [
				busy,
				load,
				state,
				t
			]);
			const copy = (0, react.useCallback)(async () => {
				if (state === null) return;
				try {
					await navigator.clipboard.writeText(state.url);
					setCopied(true);
					setTimeout(() => {
						setCopied(false);
					}, 1500);
				} catch {
					setFailure(t("toggleFailed"));
				}
			}, [state, t]);
			if (state === null) return (0, react_jsx_runtime.jsx)("div", {
				style: cardStyle,
				children: failure === "" ? t("loading") : failure
			});
			return (0, react_jsx_runtime.jsxs)("div", {
				style: cardStyle,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						style: {
							...rowStyle,
							justifyContent: "space-between"
						},
						children: [(0, react_jsx_runtime.jsx)("strong", {
							style: { fontSize: "15px" },
							children: t("title")
						}), (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							disabled: busy,
							onClick: () => {
								toggle();
							},
							style: state.enabled ? onButtonStyle : buttonStyle,
							children: busy ? "…" : state.enabled ? t("disable") : t("enable")
						})]
					}),
					(0, react_jsx_runtime.jsx)("div", {
						style: {
							opacity: .75,
							fontSize: "13px"
						},
						children: t("description")
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						style: rowStyle,
						children: [
							(0, react_jsx_runtime.jsx)("span", {
								style: {
									opacity: .75,
									fontSize: "13px",
									minWidth: "64px"
								},
								children: t("address")
							}),
							(0, react_jsx_runtime.jsx)("code", {
								style: codeStyle,
								children: state.url
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: buttonStyle,
								onClick: () => {
									copy();
								},
								children: copied ? t("copied") : t("copy")
							})
						]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						style: {
							...rowStyle,
							fontSize: "12px",
							opacity: .7
						},
						children: [
							(0, react_jsx_runtime.jsx)("span", { children: state.enabled ? t("stateEnabled") : t("stateDisabled") }),
							(0, react_jsx_runtime.jsx)("span", { children: "·" }),
							(0, react_jsx_runtime.jsx)("span", { children: state.workerRunning ? t("workerRunning") : t("workerStopped") }),
							failure === "" ? null : (0, react_jsx_runtime.jsx)("span", {
								style: { color: "var(--dsw-danger, #d9534f)" },
								children: failure
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region lib/types/client/locales.js
		/** 桌面面板的设置文案（中英双语）。 */
		const zh = {
			tab: "桌面面板",
			title: "桌面面板",
			description: "在浏览器里查看并操作本机桌面（含锁屏画面）",
			stateEnabled: "已启用",
			stateDisabled: "已停用",
			enable: "启用",
			disable: "停用",
			address: "访问地址",
			copy: "复制",
			copied: "已复制",
			workerRunning: "桌面 worker 运行中",
			workerStopped: "桌面 worker 未运行",
			loading: "正在读取状态…",
			loadFailed: "状态读取失败",
			toggleFailed: "切换失败"
		};
		const en = {
			tab: "Desktop panel",
			title: "Desktop panel",
			description: "View and control this machine’s desktop (including the lock screen) from a browser",
			stateEnabled: "Enabled",
			stateDisabled: "Disabled",
			enable: "Enable",
			disable: "Disable",
			address: "Address",
			copy: "Copy",
			copied: "Copied",
			workerRunning: "Desktop worker is running",
			workerStopped: "Desktop worker is not running",
			loading: "Loading state…",
			loadFailed: "Failed to read state",
			toggleFailed: "Failed to toggle"
		};
		//#endregion
		//#region lib/types/client/index.js
		/**
		* 桌面面板的客户端入口：把设置卡片注册到「设置 → 插件 → 插件配置」。
		*
		* 卡片通过 host 侧的 /plugin/desktop/state 与 /plugin/desktop/enabled 读写状态，
		* 因此无需引入 typert remote 通道。这里不导入 DSH 的类型包，避免社区插件额外的类型解析依赖。
		*/
		/** 需要设置页的槽位与本地化服务。 */
		const inject = ["slots", "locale"];
		/** 文案命名空间。 */
		const NAMESPACE = "settings.desktopPanel";
		/**
		* 注册设置页卡片。
		* @param ctx 客户端 Cordis 上下文（此处按运行时约定使用，不引入 DSH 类型包）
		*/
		function apply(ctx) {
			const t = ctx.locale.bind(NAMESPACE);
			ctx.effect(() => ctx.locale.register(NAMESPACE, {
				zh,
				en
			}), "desktop-panel.copy");
			ctx.effect(() => ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
				name: "settings.plugins.tab",
				id: "desktop-panel",
				order: 13,
				label: () => t("tab"),
				locale: NAMESPACE,
				inject: () => ({ t })
			}, DesktopPanelCard)), "desktop-panel.settings");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map