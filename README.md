# TodoFlow

TodoFlow 是一个轻量级的 Chrome 扩展，提供优雅的待办事项管理体验。它聚焦于快速记录、分解任务以及帮助你回顾每日完成情况。

## 功能亮点
- 添加、编辑、删除待办事项，支持快捷回车添加
- 支持多级管理：为任务添加子任务，展开/折叠查看
- 通过 `Active` / `Completed` 筛选器快速聚焦当前任务
- `New Day` 一键归档当天事项，回顾历史记录
- 内置历史面板，按日期分组查看完成情况
- 支持 JSON 导入/导出，方便备份或跨设备迁移
- 所有数据保存在 `chrome.storage.sync` 中，多设备自动同步

## 安装调试
1. 克隆或下载本仓库，将文件放置在本地目录（例如 `./Documents/TodoExt`）。
2. 打开 Chrome，访问 `chrome://extensions/`。
3. 开启右上角的 **开发者模式 (Developer mode)**。
4. 点击 **加载已解压的扩展程序 (Load unpacked)**，选择该项目所在的目录。
5. 安装成功后，工具栏会出现扩展图标，点击即可打开 TodoFlow。

## 使用指南
- **添加任务**：在输入框输入内容，点击 `Add` 或按下回车。
- **管理子任务**：在任务操作区选择 `Add Subtask`，可逐项完成或删除。
- **状态切换**：勾选复选框即可完成任务；筛选器可查看不同状态。
- **每日归档**：点击 `New Day` 将当前列表归档并清空，方便全新开始。
- **历史记录**：在菜单中选择 `History`，按日期查看归档任务。
- **导入导出**：通过 `Export` 生成 JSON 文件，`Import` 可导入备份数据。

## 目录结构
```
TodoExt/
├── background.js   // 负责窗口生命周期（独立模式时使用）
├── manifest.json   // Chrome 扩展配置
├── popup.html      // 主界面结构
├── popup.css       // UI 样式
└── popup.js        // 业务逻辑与交互
```

## 开发建议
- 修改代码后，在 `chrome://extensions/` 中点击 **Reload** 以加载最新版本。
- 推荐在控制台 (DevTools) 的 `Application → Storage → chrome.storage` 观察同步数据。
- 若增加额外权限或背景行为，请同步更新 `manifest.json`，并在 README 中补充说明。
