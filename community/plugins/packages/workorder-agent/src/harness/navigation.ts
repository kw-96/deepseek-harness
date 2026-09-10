const CONTROL_PANEL_PATH = '/workorder-agent'

/**
 * 侧边栏入口脚本，不含 script 标签，供 webserver/index-inject 使用。
 * @returns 可内联的经典脚本正文
 */
export function controlPanelNavigationScript(): string {
  return `(function(){
const path='${CONTROL_PANEL_PATH}';
function mount(){if(document.querySelector('[data-workorder-entry]'))return;const settings=document.querySelector('[class*=settingsArea]');if(!settings)return;const link=document.createElement('a');link.dataset.workorderEntry='';link.href=path;link.textContent='工单控制面';link.setAttribute('aria-label','打开工单控制面');link.style.cssText='display:flex;align-items:center;justify-content:center;min-height:36px;margin:4px 0;padding:0 12px;border-radius:10px;color:inherit;text-decoration:none;font-size:14px;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.1))';settings.parentElement?.insertBefore(link,settings)}
new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});mount();
})();`
}

/**
 * 将工单控制面入口注入 HTML，供测试与兼容旧索引变换调用。
 * @param html 原始 HTML
 * @returns 注入侧边栏脚本后的 HTML
 */
export function injectControlPanelNavigation(html: string): string {
  const script = `<script data-workorder-navigation>${controlPanelNavigationScript()}</script>`
  return html.includes('</body>') ? html.replace('</body>', `${script}</body>`) : `${html}${script}`
}
