/** CSS Module 类型声明（构建期由 tsdown 的 lightningcss 插件处理）。 */

declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
