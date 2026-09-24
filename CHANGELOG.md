# 更新日志（CHANGELOG）

本文件记录清屿服务器规则仓库的版本演进。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号为 `主版本.次版本.修订号`。

## [Unreleased]

### 计划

- 补充「假人使用教程」独立文档
- 为处罚细目表增加按关键词检索的本地脚本
- 规则文档站补充英文摘要页

## [1.0.0] - 2026.09.20

### 新增

- **规则体系：** 新增《清屿服务器玩家守则》v3.3.0、《清屿服务器管理员条例》v3.1.0、《清屿服务器地铁乘车管理条例》v2.0.0，统一存放于 `规则/` 目录
- **处罚细目：** 新增 `规则/处罚细目表.md` 与七大类处罚细目（`规则/处罚细目/01-语言类.md` 至 `07-群聊社区.md`），共 175 条，编号前缀为 L / P / C / E / A / M / Q
- **省流版：** 新增玩家守则、管理员条例、地铁乘车管理条例三份一页速查
- **仓库首页：** 新增 `README.md`（徽章 + 快速上手 + 规则矩阵 + 常见问题 + 七日阳光流程）与 `服务器信息.md`（主服 / 测试服地址与版本、注意事项、官方渠道）
- **文档站：** 新增 `mkdocs.yml`（MkDocs Material，`docs_dir: 规则`）与自定义样式，GitHub Pages 自动部署
- **协作基建：** 新增 `.editorconfig`、`.gitattributes`、`.gitignore`、`.markdownlint.json`、`package.json`（npm scripts）、`SECURITY.md`、`CONTRIBUTING.md` 与 `LICENSE`
- **CI 与模板：** 新增 `.github/workflows/lint.yml`（markdownlint + 一致性检查）、`.github/workflows/pages.yml`（文档站部署）、Issue 表单与 PR 模板、`dependabot.yml`
- **检查器：** 新增 `scripts/check-references.mjs`，实现编号引用、章节引用、内部链接、版本一致、头部规范共 5 类检查，支持 `--json` 与 `--no-color`

### 说明

- 处罚细目采用"类别字母 + 三位序号"编号，编号一经发布不再复用
- 全部规则文档头部统一标注版本号与 `YYYY.MM.DD` 格式的更新日期、生效日期
