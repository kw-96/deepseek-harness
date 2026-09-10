/** 包名到简体中文说明的本地化字典聚合。 */
import { COMMUNITY } from './community.js'
import { OFFICIAL_A_D } from './official-a-d.js'
import { OFFICIAL_E_L } from './official-e-l.js'
import { OFFICIAL_M_S } from './official-m-s.js'
import { OFFICIAL_T_W } from './official-t-w.js'

/** 全部插件包名到简体中文说明的映射。 */
export const PACKAGE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  ...OFFICIAL_A_D,
  ...OFFICIAL_E_L,
  ...OFFICIAL_M_S,
  ...OFFICIAL_T_W,
  ...COMMUNITY,
}

/**
 * 取插件包的简体中文说明；没有映射时返回 undefined。
 * @param packageName npm 包名
 * @returns 中文说明或 undefined
 */
export function packageDescriptionZh(packageName: string): string | undefined {
  return PACKAGE_DESCRIPTIONS[packageName]
}
