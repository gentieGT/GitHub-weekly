# GitHub 周热榜 · 阅读器

每周一自动抓取「本周新建且 star 增长最快」的 10 个 GitHub 项目，生成可折叠的简报页；你在简报下写想法，实践员会去验证并回复。

## 怎么跑起来

需要 Node ≥ 18（无第三方依赖，不用 `npm install`）。

```powershell
node D:\dsh-workspace\gh-weekly\server.mjs
```

然后打开：

```
http://127.0.0.1:11436
```

换端口：`node server.mjs --port=11437`

## 怎么用

1. 打开页面，看 10 张卡片（标题 + 一句话概括 + star + 与你相关程度）
2. 感兴趣的，点「展开简报」看：为什么火 / 简报 / 对你的用处
3. 有想法直接写在卡片底部输入框，点「提交想法」
4. 实践员（每天 8/12/16/20 点自动跑）会去验证，结果回到同一张卡片下，橙色块

## 手动生成一期

```powershell
cd D:\dsh-workspace\gh-weekly
node tools\build-weekly.mjs          # 抓数据 -> data/weekly-<今天>.json
node tools\preview.mjs <日期>        # 看素材（打印精简预览）
# 然后参照上期格式写 data/briefings-<日期>.json
```

简报字段要求：

| 字段 | 内容 | 字数 |
|---|---|---|
| `summary` | 一句话说清它做什么 | 20–35 字 |
| `whyHot` | 为什么这周火 | 30–60 字 |
| `brief` | 做什么 / 怎么做的 | 150–250 字 |
| `forYou` | 对你的用处（必须具体到 Kairo 的场景） | 50–80 字 |
| `tags` | 标签数组 | 2–4 个 |
| `relevance` | `high` / `medium` / `low` | — |

## 数据源

GitHub Search API（免认证，限流 60 次/小时）：

```
q=created:>=<一周前>&sort=stars&order=desc&per_page=10
```

即「本周新建 + star 最多」。GitHub 没有官方 trending API；直接抓 `github.com/trending` 会被 301 循环挡住（详见 `docs/错误台账.md`）。

## 自动化

| 任务 | 时间 | 做什么 |
|---|---|---|
| 生成周报 | 每周一 08:00 | 抓数据 → 写简报 → 确保服务在跑 → 汇报 3 个重点 |
| 实践想法 | 每天 8/12/16/20 点 | 扫描 inbox → 在 experiments 里验证 → 写 reports.jsonl |

两个都是 DSH 定时任务，可在 DSH 里查看和停用。

## 实践员的边界

- 只在 `experiments/` 里写文件，不碰其他项目、知识库、配置
- 不装全局软件包，不动注册表和系统设置
- 需要更高权限的验证，会写明「需要你批准」而不是硬做

## 目录结构

```
gh-weekly/
├─ AGENTS.md            开工说明（先读这个）
├─ 项目索引.md          文件地图
├─ 项目记忆.md          当前进度与待办
├─ README.md            本文件
├─ .gitignore
├─ server.mjs           阅读器服务
├─ docs/                需求/设计/模块/里程碑/错误台账
├─ data/                weekly-*.json / briefings-*.json
├─ inbox/               ideas.jsonl / reports.jsonl
├─ experiments/         实践员试验场
└─ tools/               build-weekly.mjs / preview.mjs 等
```
