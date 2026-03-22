# Feng Farm 开发任务清单

## 当前状态
- ✅ V1.0 MVP 已完成部署
- 🔄 等待后续迭代

---

## 任务 1：测试 & Bug 修复 🔍 (QA)
**负责人**: qa-agent
**优先级**: P0

### 测试项
- [ ] 单人全流程测试（进入→移动→种植→浇水→收获）
- [ ] 多人同步测试（2-3个浏览器同时在线）
- [ ] 边界测试（金币不足、越界移动、未成熟收获）
- [ ] 断线重连测试

### 输出
- `docs/qa/bugs.md` - Bug 记录
- `docs/qa/test-report-v1.0.md` - 测试报告

---

## 任务 2：前端体验优化 ✨ (DEV)
**负责人**: dev-agent
**优先级**: P1

### 功能
- [ ] 添加音效（种植/浇水/收获）
- [ ] 添加键盘快捷键（WASD移动、空格浇水）
- [ ] 添加操作成功动画（粒子效果）
- [ ] 添加加载页面

### 输出
- 更新 `games/farm/client/app.js`
- 更新 `games/farm/client/style.css`

---

## 任务 3：后端功能 🔧 (DEV)
**负责人**: dev-agent
**优先级**: P1

### 功能
- [ ] 数据持久化（玩家金币、名字保存）
- [ ] 操作日志记录
- [ ] 服务端操作验证（防作弊）
- [ ] 增量状态同步（性能优化）

### 输出
- 更新 `games/farm/server/server.js`
- 更新 `games/farm/server/game.js`

---

## 任务 4：策划文档 📝 (PD)
**负责人**: pd-agent
**优先级**: P2

### 内容
- [ ] V1.0 功能清单
- [ ] V1.1 功能规划
- [ ] 新手引导流程优化
- [ ] 经济系统平衡调整

### 输出
- `docs/planning/v1.0-roadmap.md`
- `docs/planning/v1.1-features.md`

---

## 任务 5：项目文档 📚 (PD/DEV)
**负责人**: pd-agent / dev-agent
**优先级**: P2

### 内容
- [ ] README.md（项目介绍、部署说明）
- [ ] CHANGELOG.md
- [ ] API文档更新
- [ ] 架构文档更新

---

## 如何分配任务

### 手动分配给代理：
```bash
# 进入代理工作目录
openclaw agent pd-agent

# 或发送任务消息
openclaw message --to pd-agent "任务内容..."
```

### 或直接用当前 session（master-agent）完成

---

**任务状态**: 待分配
**最后更新**: 2026-03-22
