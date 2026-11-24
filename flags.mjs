// 功能开关（Feature Flag）
// 三级优先：环境变量 > config/flags.json > 内置默认值
// 改 config/flags.json 后无需重启，下一个请求即生效（按 mtime 热加载）
//
// 紧急全关：设置环境变量 GHW_FLAGS_OFF=1 后重启一次，所有新功能立即下线
//           （这是唯一需要重启的开关，因为它要覆盖整个进程）

import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'D:\\dsh-workspace\\gh-weekly';
export const FLAG_FILE = path.join(ROOT, 'config', 'flags.json');

// ============================================================
// 默认值 = 「出厂设置」= 当前已上线的完整行为（全开）
// 改这里等于改默认行为，慎重
// ============================================================
export const DEFAULTS = {
  'briefing.expand': true,      // 卡片可展开，显示简报正文
  'briefing.forYou': true,      // 「对你的用处」高亮段
  'briefing.tags': true,        // 标签行
  'relevance.indicator': true,  // 相关度彩色圆点
  'ideas.submit': true,         // 想法输入框 + POST /idea
  'reports.display': true,      // 实践员反馈块（橙色）
};

export const DESCRIPTIONS = {
  'briefing.expand': '卡片点击展开简报；关闭后只剩标题+概括+元信息（回到最初形态）',
  'briefing.forYou': '「对你的用处」绿色高亮段（依赖 briefing.expand 开启）',
  'briefing.tags': '标签行（依赖 briefing.expand 开启）',
  'relevance.indicator': '相关度圆点：与你相关 / 可借鉴 / 了解即可',
  'ideas.submit': '想法输入框与提交接口；关闭后页面不显示输入框，POST /idea 返回 503',
  'reports.display': '实践员反馈块；关闭后只显示「等待实践」，不显示已回写的结论',
};

// 依赖关系：父开关关闭时，子开关自动视为关闭
const DEPENDS_ON = {
  'briefing.forYou': 'briefing.expand',
  'briefing.tags': 'briefing.expand',
};

function envName(key) {
  return 'GHW_FLAG_' + key.replace(/[.\-]/g, '_').toUpperCase();
}

function parseBool(v) {
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'on', 'yes', 'y'].includes(s)) return true;
  if (['0', 'false', 'off', 'no', 'n'].includes(s)) return false;
  return null;
}

// 缓存：按 mtime 判断是否要重读，避免每个请求都重新解析
let cache = { mtime: -1, fileFlags: {}, lastGood: {}, error: null };

function readFlagFile() {
  let st;
  try {
    st = fs.statSync(FLAG_FILE);
  } catch (e) {
    // 文件不存在：用上次成功读到的值（或空），不算错误
    return { flags: cache.lastGood, error: null, note: 'flags.json 不存在，使用默认值' };
  }
  if (st.mtimeMs === cache.mtime) {
    return { flags: cache.fileFlags, error: cache.error, note: null };
  }
  cache.mtime = st.mtimeMs;
  try {
    const raw = fs.readFileSync(FLAG_FILE, 'utf8');
    const j = JSON.parse(raw);
    const flags = {};
    for (const [k, v] of Object.entries(j.flags || {})) {
      // 支持 { enabled: true } 和裸 boolean 两种写法
      const val = (v && typeof v === 'object') ? v.enabled : v;
      const b = parseBool(val);
      if (b !== null) flags[k] = b;
    }
    cache.fileFlags = flags;
    cache.lastGood = flags;
    cache.error = null;
    return { flags, error: null, note: null };
  } catch (e) {
    // 文件损坏：保留上次成功读取的值，绝不让整页挂掉
    cache.error = e.message;
    return { flags: cache.lastGood, error: e.message, note: 'flags.json 解析失败，沿用上次有效值' };
  }
}

/**
 * 取当前生效的开关。
 * @returns {{flags: Record<string, boolean>, meta: object}}
 */
export function getFlags() {
  const killAll = parseBool(process.env.GHW_FLAGS_OFF) === true;
  const { flags: fileFlags, error, note } = readFlagFile();

  const flags = {};
  const overrides = {};

  for (const key of Object.keys(DEFAULTS)) {
    let val = DEFAULTS[key];
    let source = 'default';

    if (Object.prototype.hasOwnProperty.call(fileFlags, key)) {
      val = fileFlags[key];
      source = 'file';
    }

    const envRaw = process.env[envName(key)];
    if (envRaw !== undefined) {
      const b = parseBool(envRaw);
      if (b !== null) { val = b; source = 'env'; overrides[key] = b; }
    }

    flags[key] = val;
    flags[`${key}__source`] = source; // 调试用，渲染时忽略
  }

  // 应用依赖：父关则子关
  for (const [child, parent] of Object.entries(DEPENDS_ON)) {
    if (flags[parent] === false && flags[child] === true) {
      flags[child] = false;
      flags[`${child}__source`] = `cascade:${parent}`;
    }
  }

  if (killAll) {
    for (const key of Object.keys(DEFAULTS)) {
      flags[key] = false;
      flags[`${key}__source`] = 'killswitch';
    }
  }

  // 清理调试字段前先留一份来源
  const sources = {};
  for (const key of Object.keys(DEFAULTS)) {
    sources[key] = flags[`${key}__source`];
    delete flags[`${key}__source`];
  }

  return {
    flags,
    meta: {
      file: FLAG_FILE,
      killAll,
      error,
      note,
      sources,
      envOverrides: overrides,
      enabledCount: Object.values(flags).filter(Boolean).length,
      totalCount: Object.keys(DEFAULTS).length,
    },
  };
}

/** 只取一个开关，渲染里高频调用 */
export function flagOn(name, ctx) {
  const f = (ctx && ctx.flags) || getFlags().flags;
  return f[name] === true;
}

/** 列出所有关闭的开关名（用于页面顶部提示） */
export function disabledList(flags) {
  return Object.keys(DEFAULTS).filter((k) => flags[k] === false);
}
