/**
 * 桌面面板的客户端入口：把设置卡片注册到「设置 → 插件 → 插件配置」。
 *
 * 卡片通过 host 侧的 /plugin/desktop/state 与 /plugin/desktop/enabled 读写状态，
 * 因此无需引入 typert remote 通道。这里不导入 DSH 的类型包，避免社区插件额外的类型解析依赖。
 */
import { DesktopPanelCard } from './DesktopPanelCard.js';
import { en, zh } from './locales.js';
/** 需要设置页的槽位与本地化服务。 */
export const inject = ['slots', 'locale'];
/** 文案命名空间。 */
const NAMESPACE = 'settings.desktopPanel';
/**
 * 注册设置页卡片。
 * @param ctx 客户端 Cordis 上下文（此处按运行时约定使用，不引入 DSH 类型包）
 */
export function apply(ctx) {
    const t = ctx.locale.bind(NAMESPACE);
    ctx.effect(() => ctx.locale.register(NAMESPACE, { zh, en }), 'desktop-panel.copy');
    ctx.effect(() => ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
        name: 'settings.plugins.tab',
        id: 'desktop-panel',
        order: 13,
        label: () => t('tab'),
        locale: NAMESPACE,
        inject: () => ({ t }),
    }, DesktopPanelCard)), 'desktop-panel.settings');
}
//# sourceMappingURL=index.js.map