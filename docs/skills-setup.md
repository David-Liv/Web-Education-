# 规划技能安装记录

安装日期：2026-10-27。网站应用代码未修改。

- 完整仓库：`D:\CUHK\Web Education\skills`
- 来源：<https://github.com/mattpocock/skills>
- 下载提交：`59db609eb1e18aaf59b63284d0e52255aff0c63c`
- 项目技能：`.agents/skills/grill-me` 和 `.agents/skills/grilling`
- 通过 Codex 自带的 `skill-installer` 脚本安装，固定到上述提交，未安装到全局目录。

新版 `grill-me` 是调用 `grilling` 的入口，因此两项一起安装。`grilling` 保持上游原文。项目副本的 `grill-me/SKILL.md` 增加了兼容说明：当宿主没有原生 Skill 工具时，读取相邻的 `../grilling/SKILL.md` 并在当前对话遵循该流程。完整 Git 仓库保持原样；两个安装副本附带 MIT 许可。以后覆盖更新入口文件时，此兼容说明可能需要重新应用。

下一条消息可用：

```text
$grill-me 先规划这个 DSE 网站下一阶段的内容和逻辑，暂时不要修改代码。
```

Codex 官方支持 `$技能名` 或通过 `/skills` 选择；`/grill-me` 是否直接可用取决于客户端。新技能通常自动发现，若未出现在选择器，重启 Codex 后再试。

## Node 报错

用户缓存中的 `skills` CLI 版本是 `1.7.4`，其 `package.json` 声明 Node `>=22.20.0`。用户报错时的 Node 为 `20.20.2`，无法从 `fs/promises` 导入 `glob`。

本次以 Codex 环境现有的 Node `24.19.0` 测试，同一份缓存 CLI 的 `--version` 和 `--help` 均成功；未修改 Windows 全局 Node、PATH 或 npm 缓存。

将日常终端切换到 Node 24（或至少 22.20.0），重开终端，再确认：

```powershell
node --version
node --input-type=module -e "import { glob } from 'node:fs/promises'; console.log(typeof glob)"
```

第二行应输出 `function`。本项目两项技能已经安装，无需为了本次使用重新执行 `npx skills add`。

资料：

- <https://learn.chatgpt.com/docs/build-skills>
- <https://nodejs.org/api/fs.html#fspromisesglobpattern-options>
