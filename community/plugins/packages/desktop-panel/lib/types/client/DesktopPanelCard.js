import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * 桌面面板的设置卡片：显示插件状态、启停开关与面板访问地址。
 * 数据全部来自 host 侧的 /plugin/desktop/state 与 /plugin/desktop/enabled 两个 HTTP 接口，
 * 因此这里不需要 typert remote 通道。
 */
import { useCallback, useEffect, useState } from 'react';
const cardStyle = {
    border: '1px solid var(--dsw-border, #343a43)',
    borderRadius: '10px',
    padding: '14px 16px',
    background: 'var(--dsw-surface, rgba(255,255,255,0.02))',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    maxWidth: '640px',
};
const rowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
};
const buttonStyle = {
    border: '1px solid var(--dsw-border, #343a43)',
    borderRadius: '6px',
    padding: '5px 14px',
    cursor: 'pointer',
    background: 'transparent',
    color: 'inherit',
    fontSize: '13px',
};
const onButtonStyle = {
    ...buttonStyle,
    background: 'var(--dsw-accent, #2d5bd7)',
    borderColor: 'var(--dsw-accent, #2d5bd7)',
    color: '#fff',
};
const codeStyle = {
    fontFamily: 'Consolas, Menlo, monospace',
    fontSize: '12px',
    padding: '3px 8px',
    borderRadius: '6px',
    background: 'rgba(127,127,127,0.14)',
    wordBreak: 'break-all',
};
/**
 * 桌面面板设置卡片。
 * @param props 宿主注入的文案函数
 * @returns 卡片元素
 */
export function DesktopPanelCard({ t }) {
    const [state, setState] = useState(null);
    const [busy, setBusy] = useState(false);
    const [failure, setFailure] = useState('');
    const [copied, setCopied] = useState(false);
    const load = useCallback(async () => {
        try {
            const response = await fetch('/plugin/desktop/state', { cache: 'no-store' });
            setState(await response.json());
            setFailure('');
        }
        catch {
            setFailure(t('loadFailed'));
        }
    }, [t]);
    useEffect(() => { void load(); }, [load]);
    const toggle = useCallback(async () => {
        if (state === null || busy)
            return;
        setBusy(true);
        try {
            await fetch('/plugin/desktop/enabled', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ enabled: !state.enabled }),
            });
            await load();
        }
        catch {
            setFailure(t('toggleFailed'));
        }
        finally {
            setBusy(false);
        }
    }, [busy, load, state, t]);
    const copy = useCallback(async () => {
        if (state === null)
            return;
        try {
            await navigator.clipboard.writeText(state.url);
            setCopied(true);
            setTimeout(() => { setCopied(false); }, 1500);
        }
        catch {
            setFailure(t('toggleFailed'));
        }
    }, [state, t]);
    if (state === null) {
        return _jsx("div", { style: cardStyle, children: failure === '' ? t('loading') : failure });
    }
    return (_jsxs("div", { style: cardStyle, children: [_jsxs("div", { style: { ...rowStyle, justifyContent: 'space-between' }, children: [_jsx("strong", { style: { fontSize: '15px' }, children: t('title') }), _jsx("button", { type: "button", disabled: busy, onClick: () => { void toggle(); }, style: state.enabled ? onButtonStyle : buttonStyle, children: busy ? '…' : state.enabled ? t('disable') : t('enable') })] }), _jsx("div", { style: { opacity: 0.75, fontSize: '13px' }, children: t('description') }), _jsxs("div", { style: rowStyle, children: [_jsx("span", { style: { opacity: 0.75, fontSize: '13px', minWidth: '64px' }, children: t('address') }), _jsx("code", { style: codeStyle, children: state.url }), _jsx("button", { type: "button", style: buttonStyle, onClick: () => { void copy(); }, children: copied ? t('copied') : t('copy') })] }), _jsxs("div", { style: { ...rowStyle, fontSize: '12px', opacity: 0.7 }, children: [_jsx("span", { children: state.enabled ? t('stateEnabled') : t('stateDisabled') }), _jsx("span", { children: "\u00B7" }), _jsx("span", { children: state.workerRunning ? t('workerRunning') : t('workerStopped') }), failure === '' ? null : _jsx("span", { style: { color: 'var(--dsw-danger, #d9534f)' }, children: failure })] })] }));
}
//# sourceMappingURL=DesktopPanelCard.js.map