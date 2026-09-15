import { PRODUCT_NAME } from '../brand.js'

const CONTROL_PANEL_PATH = '/workorder-agent'

/** 侧边栏页脚动作容器的类名片段（官方 ui-sidebar 的 CSS Module 会加哈希后缀）。 */
const FOOTER_ACTIONS_SELECTOR = '[class*=footerActions]'

/** 设置按钮容器的类名片段；页脚动作不可用时的回落插入点。 */
const SETTINGS_AREA_SELECTOR = '[class*=settingsArea]'

/** 注入样式的元素 id，避免 MutationObserver 反复插入。 */
const STYLE_ELEMENT_ID = 'workorder-entry-style'

/** 剪贴板清单图标：与相邻的页脚动作同为 currentColor 描边图标。 */
const ENTRY_ICON
  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"'
  + ' stroke-linejoin="round" aria-hidden="true"><rect x="8" y="3" width="8" height="4" rx="1"/>'
  + '<path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/>'
  + '<path d="M9 12h6M9 16h4"/></svg>'

/** 页脚动作按钮的几何：宽态为胶囊（图标 + 文字），轨道态为 36 像素圆钮。 */
const ENTRY_STYLE = [
  '[data-workorder-entry]{box-sizing:border-box;width:36px;height:36px;flex:none;display:inline-flex;',
  'justify-content:center;align-items:center;padding:0;border:none;border-radius:50%;background:0 0;',
  'color:var(--dsw-alias-label-secondary);text-decoration:none;cursor:pointer;',
  'transition:background-color .12s,color .12s}',
  '[data-workorder-entry]:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}',
  '[data-workorder-entry] svg{width:18px;height:18px;flex:none}',
  '[data-workorder-entry][data-wide=wide]{border-radius:999px;flex:auto;width:auto;min-width:0;gap:8px;',
  'justify-content:flex-start;padding:0 10px}',
  '[data-workorder-entry-label]{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:13px}',
  '[data-workorder-entry][data-wide=rail] [data-workorder-entry-label]{display:none}',
].join('')

/**
 * 侧边栏入口脚本，不含 script 标签，供 webserver/index-inject 使用。
 *
 * 入口渲染在官方侧边栏的页脚动作容器里（与「检查更新」「远程访问」同一排）：
 * 宽态是图标 + 文字胶囊，轨道态是单独的图标按钮；宽度形态跟着同排动作的
 * `data-wide` 走，不自己判断断点。
 * @returns 可内联的经典脚本正文
 */
export function controlPanelNavigationScript(): string {
  return `(function(){
const path='${CONTROL_PANEL_PATH}';
const label='${PRODUCT_NAME}';
const icon='${ENTRY_ICON}';
function ensureStyle(){if(document.getElementById('${STYLE_ELEMENT_ID}'))return;const style=document.createElement('style');style.id='${STYLE_ELEMENT_ID}';style.textContent='${ENTRY_STYLE}';document.head.appendChild(style)}
function createEntry(){const entry=document.createElement('a');entry.dataset.workorderEntry='';entry.href=path;entry.title=label;entry.setAttribute('aria-label','打开 '+label);entry.innerHTML=icon+'<span data-workorder-entry-label>'+label+'</span>';return entry}
function mount(){const holder=document.querySelector('${FOOTER_ACTIONS_SELECTOR}');let entry=document.querySelector('[data-workorder-entry]');ensureStyle();if(entry===null){if(holder===null){const settings=document.querySelector('${SETTINGS_AREA_SELECTOR}');if(settings===null)return;entry=createEntry();settings.parentElement.insertBefore(entry,settings)}else{entry=createEntry();holder.appendChild(entry)}}const peer=holder===null?null:holder.querySelector('[data-wide]:not([data-workorder-entry])');entry.setAttribute('data-wide',peer===null?holder===null?'wide':'rail':peer.getAttribute('data-wide'))}
new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['data-wide']});mount();
})();`
}

/**
 * 将控制面入口注入 HTML，供测试与兼容旧索引变换调用。
 * @param html 原始 HTML
 * @returns 注入侧边栏脚本后的 HTML
 */
export function injectControlPanelNavigation(html: string): string {
  const script = `<script data-workorder-navigation>${controlPanelNavigationScript()}</script>`
  return html.includes('</body>') ? html.replace('</body>', `${script}</body>`) : `${html}${script}`
}
