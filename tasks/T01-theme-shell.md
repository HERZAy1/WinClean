# T01 主题系统与布局壳

**前置**：T00

## 目标
建立新颖简约的视觉基础：深浅色主题、三页导航壳。

## 设计要求
- 风格：极简、大留白、细边框、少阴影；单一强调色（建议靛青/青绿系，二选一并写入 tokens）。
- 字体：优先系统字体栈（`"Segoe UI Variable", "Microsoft YaHei UI", system-ui`），数字用等宽或 `tabular-nums`。
- 圆角统一 10px；动效仅用 150~200ms 的淡入/位移，尊重 `prefers-reduced-motion`。

## 要做
1. `src/renderer/styles/tokens.css`：用 CSS 变量定义 light/dark 两套（背景、表面、边框、文字主/次、强调色、危险色、成功色、阴影），`:root[data-theme='dark']` 切换。
2. `useTheme` store（Zustand）：值为 `light | dark | system`；`system` 跟随 `matchMedia('(prefers-color-scheme: dark)')`；通过 `settings:save` 持久化到主进程（接口未实现时先降级写 localStorage，并在代码里留 TODO，T02 替换）。
3. 布局壳：左侧窄导航栏（图标+文字）三项：**文件关系树**、**软件占用**、**设置**；顶部栏含扫描入口占位、主题切换按钮（太阳/月亮图标）。
4. 路由用 `react-router-dom`（HashRouter），三个页面先放占位。
5. 基础组件（放 `src/renderer/components/ui`）：`Button`、`Card`、`ProgressBar`（支持不确定态和确定态）、`Badge`、`Input`、`Select`、`Switch`，全部只使用 tokens 变量。
6. 一个 `/dev/ui` 隐藏路由展示所有组件的 light/dark 效果，便于目视检查。

## 验收
- 主题切换即时生效，重启后保持。
- 切到 dark 时无任何硬编码颜色残留（`grep -R "#[0-9a-fA-F]\{3,6\}" src/renderer --include=*.tsx` 应无命中；tokens.css 除外）。
- typecheck / test / lint 通过；为 `useTheme` 写单测（system 模式跟随变化）。

## 不要做
业务页面内容、API 调用。
