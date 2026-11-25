/**
 * Browser half of the automation dashboard.
 *
 * One new sidebar entry (`sidebar.panellist` id `automation-dashboard`) and its
 * own `main` panel key of the same name. Nothing shipped is touched: the
 * official Automation tasks page keeps its own `schedules` key and its own
 * `sidebar.panellist` id, so both entries coexist in the same list.
 *
 * Data comes only from the official schedule service Remote endpoints:
 *   schedule/catalog  -> every Host task (status, committed next occurrence, execution flag, last receipt)
 *   schedule/history  -> that task's saved delivery receipts (deliveredAt / scheduledAt / target)
 * and from the forwarded `schedule/changed` event for refresh. No task storage
 * is created here, and no value is invented: a task state the service does not
 * record (a delivery's execution success) is never displayed.
 */
window.__ModuleLoader__.load({
  id: '@carloskey/dsh-automation-dashboard',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    /** Locale namespace owned by this plugin. */
    const NS = 'automation.dashboard'
    /** Sidebar entry id and `main` panel key; distinct from the shipped `schedules` key. */
    const PANEL_ID = 'automation-dashboard'
    /** Official `schedule/history` accepts 1 through 100 records per page. */
    const HISTORY_LIMIT = 100
    /** Tasks asked for history, newest first, so one open does not fan out without bound. */
    const HISTORY_TASK_CAP = 16
    /** Timeline rows kept in view. */
    const RECORD_ROWS = 8
    /** A delivery within one minute of its committed occurrence counts as on time. */
    const ON_TIME_MS = 60000
    /** Safety refresh beside the `schedule/changed` subscription. */
    const REFRESH_MS = 60000
    /** Segments in the today-triggers gauge. */
    const TICK_COUNT = 20

    // ---------------------------------------------------------------- copy ---

    const zh = {
      panel: '任务仪表盘',
      title: '任务仪表盘',
      subtitle: '官方自动化任务 · 只读',
      todayTriggers: '今日触发',
      todayUnit: '次',
      onTimeRate: '按时送达率',
      onTimeHint: '官方回执只确认送达，不记录执行成败：此处统计今日送达中「1 分钟内送达」的比例。',
      nextRun: '下次运行',
      tasks: '任务',
      records: '运行记录',
      recordsUnit: '条送达回执',
      refresh: '刷新',
      updated: '更新于',
      loading: '读取中',
      errorTitle: '读取官方任务数据失败',
      retry: '重试',
      loadingHint: '正在通过官方 schedule RPC 读取任务…',
      staleNotice: '读取失败，下面是上一次成功读取的数据。',
      openTasks: '打开自动化任务',
      emptyTasks: '官方任务目录为空',
      emptyTasksHint: '在「自动化任务」页创建任务后，这里会自动出现。',
      emptyRecords: '暂无送达记录',
      emptyRecordsHint: '任务首次送达后，回执会出现在这里。',
      dataHint: '送达回执只确认指令已送达目标会话，不记录执行成败，因此不显示「失败」状态。',
      cappedPrefix: '≥',
      tlToday: '日内 · 今天',
      tlMonth: '月度 · 本月',
      tlOnce: '单次',
      tlIdle: '无排期 · 已暂停 / 已结束',
      noReceipts: '本期无回执',
      openSession: '打开绑定的会话',
      openTask: '打开自动化任务（任务定义）',
      laneUnit: '条泳道',
      nowLabel: '现在',
      futureLabel: '未到点',
      lagLabel: '延迟',
      lgDelivered: '已送达',
      lgOverdue: '逾期未送达',
      lgLive: '正在执行',
      lgFuture: '未来（推算）',
      lgBand: '高频合并',
      lgUnknown: '未确认（超出回执保留）',
      taskCountUnit: '共 {n} 个',
      scrollHint: '超过两行时内部滚动 ↓',
      hdrTask: '任务',
      hdrLag: '送达延迟',
      hdrVerdict: '判定',
      unknown: '未知',
      statusRunning: '运行中',
      statusWaiting: '等待',
      statusEnded: '完成',
      statusPaused: '暂停',
      statusFailed: '失败',
      nextLabel: '下次',
      neverRun: '未运行',
      noNext: '无排期',
      overdue: '逾期',
      relIn: '还有',
      onTime: '准时',
      late: '延迟',
      uSec: '秒',
      uMin: '分钟',
      uHour: '小时',
      uDay: '天',
      ruleDaily: '每日',
      ruleWeekly: '每周',
      ruleEvery: '每',
      ruleAt: '定时',
      ruleAfter: '延时',
      ruleRrule: '自定义',
      ruleOnce: '单次',
      note: '数据源：官方 schedule RPC（catalog / history）· 目录变更时与每 60 秒自动刷新 · 只读',
      noData: '无数据',
    }

    const en = {
      panel: 'Task dashboard',
      title: 'Task dashboard',
      subtitle: 'Official automation tasks · read only',
      todayTriggers: 'Fired today',
      todayUnit: 'runs',
      onTimeRate: 'On-time delivery',
      onTimeHint: 'A receipt only confirms delivery and records no execution outcome: this is the share of today\'s deliveries that arrived within one minute.',
      nextRun: 'Next run',
      tasks: 'Tasks',
      records: 'Run log',
      recordsUnit: 'delivery receipts',
      refresh: 'Refresh',
      updated: 'Updated',
      loading: 'Reading',
      errorTitle: 'Could not read the official task data',
      retry: 'Retry',
      loadingHint: 'Reading tasks through the official schedule RPC…',
      staleNotice: 'The read failed; the values below are from the last successful read.',
      openTasks: 'Open automation tasks',
      emptyTasks: 'The official task catalog is empty',
      emptyTasksHint: 'Create a task on the Automation tasks page and it appears here.',
      emptyRecords: 'No delivery receipts yet',
      emptyRecordsHint: 'The first delivery of a task shows up here.',
      dataHint: 'A receipt only confirms the instruction reached its target conversation and records no execution outcome, so no failed state is shown.',
      cappedPrefix: '≥',
      tlToday: 'Intraday · today',
      tlMonth: 'Monthly · this month',
      tlOnce: 'One-shot',
      tlIdle: 'No schedule · paused / ended',
      noReceipts: 'No receipts in range',
      openSession: 'Open the bound conversation',
      openTask: 'Open automation tasks (definition)',
      laneUnit: 'lanes',
      nowLabel: 'Now',
      futureLabel: 'Not due',
      lagLabel: 'lag',
      lgDelivered: 'Delivered',
      lgOverdue: 'Overdue',
      lgLive: 'Running',
      lgFuture: 'Planned (derived)',
      lgBand: 'Dense lane',
      lgUnknown: 'Unconfirmed (past retention)',
      taskCountUnit: '{n} total',
      scrollHint: 'Scrolls past two rows ↓',
      hdrTask: 'Task',
      hdrLag: 'Delivery lag',
      hdrVerdict: 'Verdict',
      unknown: 'Unknown',
      statusRunning: 'Running',
      statusWaiting: 'Waiting',
      statusEnded: 'Completed',
      statusPaused: 'Paused',
      statusFailed: 'Failed',
      nextLabel: 'Next',
      neverRun: 'Never run',
      noNext: 'No schedule',
      overdue: 'Overdue',
      relIn: 'in',
      onTime: 'On time',
      late: 'Late',
      uSec: 's',
      uMin: 'min',
      uHour: 'h',
      uDay: 'd',
      ruleDaily: 'Daily',
      ruleWeekly: 'Weekly',
      ruleEvery: 'Every',
      ruleAt: 'At',
      ruleAfter: 'After',
      ruleRrule: 'Custom',
      ruleOnce: 'Once',
      note: 'Source: the official schedule RPC (catalog / history). Refreshes on catalog changes and every 60 s. Read only.',
      noData: 'No data',
    }

    // ----------------------------------------------------------------- CSS ---

    const CSS = [
      // Light is the base palette; [data-ds-dark-theme] on an ancestor swaps it.
      '.ds-page{--ds-scheme:light;--ds-bg-1:#f3f7fd;--ds-bg-2:#eaf1fa;--ds-bg-3:#e2ebf7;',
      '--ds-grid:rgba(64,104,166,.07);--ds-line:rgba(58,96,154,.16);--ds-line-2:rgba(58,96,154,.26);',
      '--ds-line-3:rgba(58,96,154,.36);--ds-line-soft:rgba(58,96,154,.09);',
      '--ds-card-1:rgba(255,255,255,.94);--ds-card-2:rgba(247,251,255,.92);',
      '--ds-panel-1:rgba(255,255,255,.82);--ds-panel-2:rgba(245,250,255,.62);',
      '--ds-fade-0:rgba(243,247,253,0);--ds-fade-1:rgba(243,247,253,.95);',
      '--ds-t1:#102238;--ds-t2:#22374f;--ds-t3:#4a617d;--ds-t4:#687d99;',
      '--ds-cyan:#0b7f96;--ds-amber:#96600a;--ds-green:#0b7a4e;--ds-magenta:#b3245c;--ds-slate:#5c708c;',
      '--ds-cyan-glow:rgba(11,127,150,.22);--ds-green-glow:rgba(11,122,78,.22);',
      '--ds-amber-glow:rgba(150,96,10,.22);--ds-magenta-glow:rgba(179,36,92,.2);',
      '--ds-scan:rgba(11,127,150,.55);--ds-future:rgba(58,110,170,.45);--ds-num-glow:rgba(11,127,150,.16);',
      '--ds-accent-text:#0a6f86;--ds-err-text:#a3184f;--ds-err-text-2:#8c1243;',
      '--ds-card-line-hot:linear-gradient(160deg,rgba(11,127,150,.55),rgba(11,127,150,.12) 45%,rgba(11,127,150,.3));',
      '--ds-card-run-1:rgba(231,245,250,.96);--ds-card-run-2:rgba(222,240,248,.94);',
      '--ds-run-wash:rgba(11,127,150,.07);--ds-red:#c0243a;--ds-red-glow:rgba(192,36,58,.45);',
      '--ds-card-line:linear-gradient(160deg,rgba(58,96,154,.26),rgba(58,96,154,.08) 45%,rgba(58,96,154,.18));',
      '--ds-card-line-hover:linear-gradient(160deg,rgba(16,120,170,.55),rgba(16,120,170,.18) 45%,rgba(16,120,170,.4));',
      '--ds-mono:ui-monospace,SFMono-Regular,"JetBrains Mono","Cascadia Mono",Menlo,Consolas,monospace;',
      'position:relative;display:flex;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;',
      'color:var(--ds-t2);color-scheme:var(--ds-scheme);',
      'background:radial-gradient(130% 100% at 50% -20%,var(--ds-bg-1) 0%,var(--ds-bg-2) 48%,var(--ds-bg-3) 100%)}',
      '[data-ds-dark-theme] .ds-page{--ds-scheme:dark;--ds-bg-1:#0e1a2e;--ds-bg-2:#080e1a;--ds-bg-3:#060a12;',
      '--ds-grid:rgba(110,170,255,.055);--ds-line:rgba(110,170,255,.14);--ds-line-2:rgba(110,170,255,.22);',
      '--ds-line-3:rgba(110,170,255,.32);--ds-line-soft:rgba(110,170,255,.13);',
      '--ds-card-1:rgba(13,21,36,.94);--ds-card-2:rgba(9,14,26,.9);',
      '--ds-panel-1:rgba(12,20,34,.78);--ds-panel-2:rgba(9,15,26,.58);',
      '--ds-fade-0:rgba(8,14,24,0);--ds-fade-1:rgba(8,14,24,.9);',
      '--ds-t1:#eaf3ff;--ds-t2:#cfe0f7;--ds-t3:#8fa3c0;--ds-t4:#7d8fab;',
      '--ds-cyan:#35e0ff;--ds-amber:#ffc266;--ds-green:#43f0a5;--ds-magenta:#ff4f9a;--ds-slate:#8296b4;',
      '--ds-cyan-glow:rgba(53,224,255,.5);--ds-green-glow:rgba(67,240,165,.8);',
      '--ds-amber-glow:rgba(255,194,102,.5);--ds-magenta-glow:rgba(255,79,154,.35);',
      '--ds-scan:rgba(53,224,255,.55);--ds-future:rgba(90,190,255,.5);--ds-num-glow:rgba(80,190,255,.32);',
      '--ds-accent-text:#8fe6ff;--ds-err-text:#ff9dc2;--ds-err-text-2:#ffc2d9;',
      '--ds-card-line-hot:linear-gradient(160deg,rgba(53,224,255,.72),rgba(53,224,255,.16) 45%,rgba(53,224,255,.42));',
      '--ds-card-run-1:rgba(12,31,46,.96);--ds-card-run-2:rgba(8,21,33,.92);',
      '--ds-run-wash:rgba(53,224,255,.075);--ds-red:#ff5a63;--ds-red-glow:rgba(255,90,99,.55);',
      '--ds-card-line:linear-gradient(160deg,rgba(96,170,255,.3),rgba(96,170,255,.07) 45%,rgba(96,170,255,.18));',
      '--ds-card-line-hover:linear-gradient(160deg,rgba(120,210,255,.62),rgba(120,210,255,.15) 45%,rgba(120,210,255,.36))}',
      '.ds-page *{box-sizing:border-box}',
      '.ds-grid{position:absolute;inset:0;pointer-events:none;background-image:',
      'linear-gradient(var(--ds-grid) 1px,transparent 1px),',
      'linear-gradient(90deg,var(--ds-grid) 1px,transparent 1px);background-size:34px 34px;',
      '-webkit-mask-image:radial-gradient(78% 66% at 50% 16%,#000 28%,transparent 100%);',
      'mask-image:radial-gradient(78% 66% at 50% 16%,#000 28%,transparent 100%)}',
      '.ds-scroll{position:relative;flex:1;min-height:0;overflow:auto;scrollbar-gutter:stable;',
      'padding:22px clamp(18px,3vw,40px) 40px}',
      '.ds-inner{display:flex;flex-direction:column;gap:16px;max-width:1080px;margin:0 auto}',

      '.ds-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap}',
      '.ds-brand{display:flex;align-items:center;gap:11px;min-width:0}',
      '.ds-mark{flex:none;width:9px;height:9px;border-radius:50%;background:var(--ds-cyan);',
      'box-shadow:0 0 12px var(--ds-cyan)}',
      '.ds-title{margin:0;font-size:14px;font-weight:600;line-height:20px;letter-spacing:.13em;',
      'text-transform:uppercase;color:var(--ds-t1)}',
      '.ds-sub{margin-top:2px;font-size:10px;line-height:16px;letter-spacing:.1em;text-transform:uppercase;color:var(--ds-t3)}',
      '.ds-headMeta{display:flex;align-items:center;gap:10px}',
      '.ds-stamp{font-family:var(--ds-mono);font-size:10px;letter-spacing:.06em;color:var(--ds-t3)}',
      '.ds-refresh{display:inline-flex;align-items:center;font:inherit;font-size:11px;line-height:16px;',
      'padding:3px 9px;border-radius:2px;border:1px solid var(--ds-line-2);background:transparent;',
      'color:var(--ds-t3);cursor:pointer;transition:color .18s ease,border-color .18s ease}',
      '.ds-refresh:hover{color:var(--ds-t2);border-color:var(--ds-cyan)}',
      '.ds-refresh:disabled{opacity:.45;cursor:default}',
      '.ds-refresh:disabled:hover{color:var(--ds-t3);border-color:var(--ds-line-2)}',

      '.ds-stats{position:relative;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;',
      'padding:14px 16px 13px;border:1px solid var(--ds-line);border-radius:3px;',
      'background:linear-gradient(180deg,var(--ds-panel-1),var(--ds-panel-2))}',
      '.ds-stats::before{content:"";position:absolute;left:16px;right:16px;top:-1px;height:1px;',
      'background:linear-gradient(90deg,transparent,var(--ds-cyan-glow),transparent)}',
      '.ds-stat{display:flex;flex-direction:column;gap:7px;min-width:0;padding-left:14px}',
      '.ds-stat:first-child{padding-left:0}',
      '.ds-stat+.ds-stat{border-left:1px solid var(--ds-line)}',
      '.ds-statLabel{font-size:9px;line-height:14px;letter-spacing:.17em;text-transform:uppercase;color:var(--ds-t3)}',
      '.ds-statValue{display:flex;align-items:baseline;gap:6px;font-family:var(--ds-mono);min-width:0}',
      '.ds-num{font-size:27px;line-height:1.05;font-weight:600;color:var(--ds-t1);font-variant-numeric:tabular-nums;',
      'text-shadow:0 0 18px var(--ds-num-glow)}',
      '.ds-num.ds-countdown{font-size:24px;letter-spacing:.03em}',
      '.ds-unit{font-size:10px;line-height:14px;letter-spacing:.08em;color:var(--ds-t4);text-transform:uppercase}',
      '.ds-statRow{display:flex;align-items:center;gap:10px;min-width:0}',
      '.ds-ring{flex:none;filter:drop-shadow(0 0 5px var(--ds-cyan-glow))}',
      '.ds-ticks{display:flex;align-items:flex-end;gap:2px;height:11px}',
      '.ds-tick{width:4px;height:11px;border-radius:1px;background:var(--ds-line)}',
      '.ds-tick[data-on="1"]{background:var(--ds-cyan);box-shadow:0 0 6px var(--ds-cyan-glow)}',
      '.ds-statSub{font-size:10px;line-height:14px;color:var(--ds-t4);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',

      '.ds-section{display:flex;align-items:center;gap:9px;padding:2px 1px 0}',
      '.ds-sectionTitle{margin:0;font-size:10px;line-height:14px;letter-spacing:.17em;text-transform:uppercase;color:var(--ds-t3)}',
      '.ds-sectionCount{font-family:var(--ds-mono);font-size:10px;line-height:14px;color:var(--ds-t3)}',
      '.ds-sectionRule{flex:1;height:1px;background:linear-gradient(90deg,var(--ds-line-2),transparent)}',

      '.ds-cardsWrap{position:relative}',
      '.ds-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(256px,1fr));gap:12px;',
      'grid-auto-rows:114px;max-height:240px;overflow-y:auto;overscroll-behavior:contain;',
      'scrollbar-width:thin;scrollbar-color:var(--ds-line-3) transparent}',
      '.ds-cards::-webkit-scrollbar{width:6px}',
      '.ds-cards::-webkit-scrollbar-thumb{background:var(--ds-line-3);border-radius:3px}',
      '.ds-cardsFade{position:absolute;left:0;right:0;bottom:0;height:26px;pointer-events:none;',
      'background:linear-gradient(180deg,var(--ds-fade-0),var(--ds-fade-1) 72%,var(--ds-bg-2))}',
      '.ds-scrollHint{flex:none;font-size:9.5px;line-height:14px;letter-spacing:.08em;color:var(--ds-t3);padding-left:10px}',
      '.ds-cardOuter{--cut:polygon(0 0,calc(100% - 13px) 0,100% 13px,100% 100%,13px 100%,0 calc(100% - 13px));',
      'position:relative;padding:1px;clip-path:var(--cut);',
      'background:var(--ds-card-line);',
      'transition:background .25s ease}',
      '.ds-cardOuter:hover{background:var(--ds-card-line-hover)}',
      '.ds-card{display:flex;flex-direction:column;gap:9px;height:100%;overflow:hidden;padding:12px 14px 11px;',
      'clip-path:var(--cut);background:linear-gradient(165deg,var(--ds-card-1),var(--ds-card-2))}',
      '.ds-card[data-status="running"]{--tone:var(--ds-cyan)}',
      '.ds-card[data-status="waiting"]{--tone:var(--ds-amber)}',
      '.ds-card[data-status="ended"]{--tone:var(--ds-green)}',
      '.ds-card[data-status="paused"]{--tone:var(--ds-slate)}',
      '.ds-card[data-status="failed"]{--tone:var(--ds-magenta)}',
      '.ds-cardTop{display:flex;align-items:center;gap:8px;min-width:0}',
      '.ds-chip{display:inline-flex;align-items:center;gap:6px;flex:none;padding:2px 8px 2px 7px;',
      'border:1px solid currentColor;border-radius:2px;font-size:9px;line-height:13px;letter-spacing:.13em;',
      'text-transform:uppercase;color:var(--tone);',
      'background:color-mix(in srgb,var(--tone) 11%,transparent)}',
      '.ds-dot{width:5px;height:5px;border-radius:50%;background:var(--tone);box-shadow:0 0 8px var(--tone)}',
      '.ds-card[data-status="running"] .ds-dot{animation:ds-breathe 2.4s ease-in-out infinite}',
      '@keyframes ds-breathe{0%,100%{opacity:.55}50%{opacity:1}}',
      '@media (prefers-reduced-motion:reduce){.ds-card[data-status="running"] .ds-dot{animation:none}}',
      '.ds-rule{margin-left:auto;font-family:var(--ds-mono);font-size:10px;line-height:14px;color:var(--ds-t3);',
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}',
      '.ds-cardTitle{font-size:13.5px;font-weight:600;line-height:19px;color:var(--ds-t1);',
      'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}',
      '.ds-cardFoot{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:auto}',
      '.ds-k{font-size:9px;line-height:13px;letter-spacing:.13em;text-transform:uppercase;color:var(--ds-t3)}',
      '.ds-v{font-family:var(--ds-mono);font-size:11px;line-height:15px;color:var(--ds-t2);font-variant-numeric:tabular-nums}',
      '.ds-rel{font-size:10px;line-height:14px;color:var(--ds-t4)}',
      '.ds-rel[data-overdue="1"]{color:var(--ds-amber)}',

      '.ds-panel{display:flex;flex-direction:column;gap:12px;padding:13px 16px 15px;border-radius:3px;',
      'border:1px solid var(--ds-line);background:linear-gradient(180deg,var(--ds-panel-1),var(--ds-panel-2))}',
      '.tl-group{position:relative;padding-top:12px}',
      '.tl-ghead{display:flex;align-items:baseline;gap:10px}',
      '.tl-gtitle{font-size:10px;line-height:14px;letter-spacing:.16em;text-transform:uppercase;color:var(--ds-t3)}',
      '.tl-gsub{font-size:10px;line-height:14px;color:var(--ds-t4)}',
      '.tl-now{margin-left:auto;font-family:var(--ds-mono);font-size:9.5px;line-height:14px;color:var(--ds-accent-text);',
      'padding:1px 7px;border:1px solid var(--ds-line-2);border-radius:2px;background:var(--ds-cyan-glow)}',
      '.tl-axis{position:relative;height:18px;margin-left:176px;margin-right:76px;',
      'border-bottom:1px solid var(--ds-line)}',
      '.tl-tick{position:absolute;top:4px;bottom:0;width:1px;background:var(--ds-line-soft)}',
      '.tl-tlabel{position:absolute;top:0;transform:translateX(-50%);font-family:var(--ds-mono);font-size:9.5px;',
      'line-height:12px;color:var(--ds-t4)}',
      '.tl-body{position:relative}',
      '.tl-lane{display:flex;align-items:center;height:40px;border-bottom:1px solid var(--ds-line-soft)}',
      '.tl-lane:last-child{border-bottom:none}',
      '.tl-name{width:176px;flex:none;padding-right:14px;min-width:0}',
      '.tl-n1{font-size:11.5px;line-height:15px;color:var(--ds-t2);overflow:hidden;text-overflow:ellipsis;',
      'white-space:nowrap}',
      '.tl-n2{font-family:var(--ds-mono);font-size:9px;line-height:12px;color:var(--ds-t4);overflow:hidden;',
      'text-overflow:ellipsis;white-space:nowrap}',
      '.tl-track{position:relative;flex:1;height:100%}',
      '.tl-right{width:76px;flex:none;text-align:right;font-family:var(--ds-mono);font-size:9.5px;color:var(--ds-t4);',
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.tl-pt{position:absolute;top:50%;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:50%;',
      'transition:background-color .35s ease,border-color .35s ease,box-shadow .35s ease}',
      '.tl-pt[data-s="delivered"]{background:var(--ds-green);box-shadow:0 0 8px var(--ds-green-glow)}',
      '.tl-pt[data-s="overdue"]{background:transparent;border:1.5px solid var(--ds-amber);',
      'box-shadow:0 0 9px var(--ds-amber-glow)}',
      '.tl-pt[data-s="future"]{background:transparent;border:1px solid var(--ds-future)}',
      '.tl-pt[data-s="unknown"]{background:transparent;border:1px solid var(--ds-line-3)}',
      '.tl-pt[data-s="live"]{width:9px;height:9px;margin:-4.5px 0 0 -4.5px;background:var(--ds-cyan);',
      'box-shadow:0 0 12px var(--ds-cyan)}',
      '.tl-pt[data-s="live"]::after{content:"";position:absolute;inset:-5px;border-radius:50%;',
      'border:1px solid var(--ds-cyan-glow);animation:ds-ring 2.2s ease-out infinite}',
      '@keyframes ds-ring{0%{transform:scale(.72);opacity:.85}100%{transform:scale(1.5);opacity:0}}',
      '@media (prefers-reduced-motion:reduce){.tl-pt[data-s="live"]::after{animation:none}}',
      '.tl-none{position:absolute;top:50%;transform:translateY(-50%);left:0;font-size:9.5px;',
      'line-height:13px;color:var(--ds-t4)}',
      '.tl-band{position:absolute;top:50%;height:8px;margin-top:-4px;border-radius:2px}',
      '.tl-band[data-f="0"]{background-color:var(--ds-cyan-glow);',
      'background-image:repeating-linear-gradient(90deg,var(--ds-cyan) 0 1.5px,transparent 1.5px 5px)}',
      '.tl-band[data-f="1"]{border:1px dashed var(--ds-future)}',
      '.tl-scan{position:absolute;top:0;bottom:0;width:1px;background:var(--ds-scan);',
      'box-shadow:0 0 10px var(--ds-cyan-glow);pointer-events:none}',
      '.tl-scan::before{content:"";position:absolute;top:-1px;left:-3.5px;border-left:3.5px solid transparent;',
      'border-right:3.5px solid transparent;border-top:5px solid var(--ds-cyan)}',
      '.tl-legend{display:flex;flex-wrap:wrap;gap:6px 16px;padding-top:10px;',
      'border-top:1px solid var(--ds-line-soft)}',
      '.tl-lg{display:inline-flex;align-items:center;gap:6px;font-size:9.5px;line-height:14px;color:var(--ds-t4)}',
      '.tl-lg i{width:7px;height:7px;border-radius:50%;flex:none}',
      '.tl-lg i[data-s="delivered"]{background:var(--ds-green);box-shadow:0 0 6px var(--ds-green-glow)}',
      '.tl-lg i[data-s="overdue"]{border:1.5px solid var(--ds-amber)}',
      '.tl-lg i[data-s="live"]{background:var(--ds-cyan);box-shadow:0 0 8px var(--ds-cyan)}',
      '.tl-lg i[data-s="future"]{border:1px solid var(--ds-future)}',
      '.tl-lg i[data-s="unknown"]{border:1px solid var(--ds-line-3)}',
      '.tl-lg i[data-s="band"]{width:16px;height:7px;border-radius:2px;background-color:var(--ds-cyan-glow);',
      'background-image:repeating-linear-gradient(90deg,var(--ds-cyan) 0 1.5px,transparent 1.5px 5px)}',
      '.ds-empty{padding:6px 0 2px;font-size:12px;line-height:18px;color:var(--ds-t3)}',
      '.ds-emptyHint{margin-top:2px;font-size:11px;line-height:16px;color:var(--ds-t4)}',
      '.ds-link{margin-top:10px;display:inline-flex;align-items:center;font:inherit;font-size:11px;',
      'line-height:16px;padding:3px 10px;border-radius:2px;cursor:pointer;',
      'border:1px solid var(--ds-line-3);background:transparent;color:var(--ds-t2);',
      'transition:color .18s ease,border-color .18s ease}',
      '.ds-link:hover{color:var(--ds-t1);border-color:var(--ds-cyan)}',
      '.ds-loading{display:flex;align-items:center;gap:9px;padding:10px 0 4px;font-size:12px;line-height:18px;color:var(--ds-t3)}',
      '.ds-loadingBar{position:relative;flex:none;width:56px;height:2px;border-radius:1px;overflow:hidden;',
      'background:var(--ds-line)}',
      '.ds-loadingBar::after{content:"";position:absolute;inset:0;width:40%;border-radius:1px;',
      'background:var(--ds-cyan);box-shadow:0 0 8px var(--ds-cyan);animation:ds-scan 1.6s ease-in-out infinite}',
      '@keyframes ds-scan{0%{transform:translateX(-100%)}100%{transform:translateX(260%)}}',
      '@media (prefers-reduced-motion:reduce){.ds-loadingBar::after{animation:none;width:100%}}',
      '.ds-hint{padding:0 2px;font-size:10.5px;line-height:16px;color:var(--ds-t3)}',
      '.ds-error{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:3px;',
      'border:1px solid var(--ds-magenta);background:var(--ds-magenta-glow);',
      'font-size:11.5px;line-height:17px;color:var(--ds-err-text)}',
      '.ds-errorText{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.ds-errorRetry{margin-left:auto;flex:none;font:inherit;font-size:11px;padding:2px 9px;border-radius:2px;',
      'border:1px solid var(--ds-magenta);background:transparent;color:var(--ds-err-text-2);cursor:pointer}',
      '.ds-errorRetry:hover{background:var(--ds-magenta-glow)}',
      '.ds-note{font-size:10.5px;line-height:16px;color:var(--ds-t4)}',

      '@media (max-width:720px){',
      '.ds-stats{grid-template-columns:1fr;gap:10px}',
      '.ds-stat{padding-left:0}',
      '.ds-stat+.ds-stat{border-left:none;border-top:1px solid var(--ds-line);padding-top:10px}',
      '.ds-rec{grid-template-columns:70px minmax(0,1fr) 56px 40px;gap:8px}',
      '.ds-hdr{grid-template-columns:70px minmax(0,1fr) 56px 40px;gap:8px}',
      '}',
          // A running task owns its frame and its lane until the delivery settles.
      '.ds-cardOuter[data-running="1"]{background:var(--ds-card-line-hot);',
      'filter:drop-shadow(0 0 7px var(--ds-cyan-glow))}',
      '.ds-card[data-status="running"]{background:linear-gradient(165deg,var(--ds-card-run-1),var(--ds-card-run-2))}',
      '.ds-cardOuter[data-linkable="1"]{cursor:pointer}',
      '.ds-cardOuter[data-linkable="1"]:focus-visible{outline:1px solid var(--ds-cyan);outline-offset:2px}',
      '.tl-lane[data-linkable="1"]{cursor:pointer}',
      '.tl-lane[data-linkable="1"]:hover{background:var(--ds-run-wash)}',
      '.tl-lane[data-linkable="1"]:focus-visible{outline:1px solid var(--ds-cyan);outline-offset:-1px}',
      '.tl-lane[data-running="1"]{background:var(--ds-run-wash)}',
      '.tl-lane[data-running="1"] .tl-n1{color:var(--ds-cyan)}',
      '.tl-lane[data-running="1"] .tl-n2{color:var(--ds-cyan)}',
      '.tl-lane[data-running="1"] .tl-pt[data-s="live"]{box-shadow:0 0 16px var(--ds-cyan)}',
      '.tl-scan{animation:ds-scan-pulse 2.4s ease-in-out infinite}',
      '@keyframes ds-scan-pulse{0%,100%{opacity:.5}50%{opacity:1}}',
      '.tl-scan[data-hot="1"]{background:var(--ds-red);box-shadow:0 0 12px var(--ds-red-glow);',
      'animation-duration:1.1s}',
      '.tl-scan[data-hot="1"]::before{border-top-color:var(--ds-red)}',
      '@media (prefers-reduced-motion:reduce){.tl-scan{animation:none}}',
].join('')

    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="dsh-automation-dashboard/page"]') === null) {
      const tag = document.createElement('style')
      tag.setAttribute('data-plugin-css', 'dsh-automation-dashboard/page')
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    // ------------------------------------------------------------- helpers ---

    const DAY_MS = 86400000

    /** @param {number} n @returns {string} two-digit clock part */
    function pad2(n) {
      return n < 10 ? '0' + n : String(n)
    }

    /** @param {number} ts @returns {string} HH:MM */
    function clock(ts) {
      const d = new Date(ts)
      return pad2(d.getHours()) + ':' + pad2(d.getMinutes())
    }

    /** @param {number} ts @returns {string} HH:MM:SS */
    function clockSec(ts) {
      const d = new Date(ts)
      return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds())
    }

    /** @param {number} ts @returns {string} M/D HH:MM */
    function dayClock(ts) {
      const d = new Date(ts)
      return d.getMonth() + 1 + '/' + d.getDate() + ' ' + clock(ts)
    }

    /** @param {number} ts @returns {number} local midnight */
    function startOfDay(ts) {
      const d = new Date(ts)
      d.setHours(0, 0, 0, 0)
      return d.getTime()
    }

    /** @param {unknown} value @returns {number} epoch milliseconds, or NaN */
    function timeOf(value) {
      return typeof value === 'string' ? Date.parse(value) : NaN
    }

    /** @param {number} ms @returns {string} compact latency, e.g. 420ms / 3.2s / 2m05s */
    function lagText(ms) {
      if (!Number.isFinite(ms) || ms < 0) return '—'
      if (ms < 1000) return Math.round(ms) + 'ms'
      const s = ms / 1000
      if (s < 60) return s.toFixed(s < 10 ? 1 : 0) + 's'
      const m = Math.floor(s / 60)
      if (m < 60) return m + 'm' + pad2(Math.round(s % 60)) + 's'
      return Math.floor(m / 60) + 'h' + pad2(m % 60) + 'm'
    }

    /** @param {number} ms @returns {string} HH:MM:SS countdown, hours not wrapped */
    function countdownText(ms) {
      if (!Number.isFinite(ms)) return '--:--:--'
      const total = Math.max(0, Math.floor(ms / 1000))
      return pad2(Math.floor(total / 3600)) + ':' + pad2(Math.floor((total % 3600) / 60)) + ':' + pad2(total % 60)
    }

    /** @param {number} ms @param {Function} t @returns {string} localized span */
    function spanText(ms, t) {
      const s = Math.max(0, Math.round(ms / 1000))
      if (s < 60) return s + ' ' + t('uSec')
      const m = Math.round(s / 60)
      if (m < 60) return m + ' ' + t('uMin')
      const hh = Math.floor(m / 60)
      const mm = m % 60
      if (hh < 24) return hh + ' ' + t('uHour') + (mm > 0 ? ' ' + mm + ' ' + t('uMin') : '')
      return Math.floor(hh / 24) + ' ' + t('uDay') + ' ' + (hh % 24) + ' ' + t('uHour')
    }

    /** @param {number} seconds @returns {string} localized "every" span */
    function everyText(seconds, t) {
      const s = Number(seconds)
      if (!Number.isFinite(s) || s <= 0) return ''
      if (s < 60) return s + ' ' + t('uSec')
      if (s < 3600) return Math.round(s / 60) + ' ' + t('uMin')
      return Math.round(s / 3600) + ' ' + t('uHour')
    }

    /**
     * The one rule string a task's stored timing supports.
     *
     * Stored daily/weekly times are `HH:mm:ss.SSS`; only the wall clock is shown,
     * and the task's own zone rides the card's `title` instead of the visible line.
     * @param {object} task - a `ScheduleCatalogEntry`.
     * @param {Function} t - namespace-bound translate.
     * @returns {string} short rule label.
     */
    function ruleText(task, t) {
      switch (task.kind) {
        case 'cron': return 'CRON · ' + String(task.expression || '')
        case 'daily': return t('ruleDaily') + ' ' + wallClock(task.time)
        case 'weekly': return t('ruleWeekly') + ' ' + wallClock(task.time)
        case 'every': return t('ruleEvery') + ' ' + everyText(task.everySeconds, t)
        case 'at': return t('ruleAt') + ' ' + dayClock(timeOf(task.scheduledAt))
        case 'after': return t('ruleAfter') + ' ' + everyText(task.afterSeconds, t)
        case 'rrule': return t('ruleRrule')
        default: return t('ruleOnce')
      }
    }

    /** @param {unknown} value @returns {string} `HH:mm` from a stored time string */
    function wallClock(value) {
      const text = String(value === undefined || value === null ? '' : value)
      return /^\d{1,2}:\d{2}/.test(text) ? text.slice(0, 5) : text
    }

    /**
     * The state the service actually records.
     *
     * `executionActive` is the only "running" signal; `status` carries the rest.
     * A `failed` status is mapped for forward compatibility only: this version
     * of the schedule service records no execution outcome, so it never appears.
     * @param {object} task - a `ScheduleCatalogEntry`.
     * @returns {'running'|'waiting'|'paused'|'ended'|'failed'} display state.
     */
    function statusOf(task) {
      if (task.executionActive === true) return 'running'
      if (task.status === 'failed') return 'failed'
      if (task.status === 'paused') return 'paused'
      if (task.status === 'ended') return 'ended'
      return 'waiting'
    }

    const STATUS_RANK = { failed: 0, running: 0, waiting: 1, paused: 2, ended: 3 }

    const STATUS_LABEL = {
      running: 'statusRunning',
      waiting: 'statusWaiting',
      ended: 'statusEnded',
      paused: 'statusPaused',
      failed: 'statusFailed',
    }

    // ------------------------------------------------------------ timeline ---

    /** One local day, the unit both windows and ticks use. */
    const DAY_MS_LOCAL = 86400000
    /** Above this many occurrences a lane collapses into one density band. */
    const MAX_LANE_POINTS = 120

    const ZONE_FORMATTERS = new Map()

    /** Cached wall-clock formatter for one IANA zone. */
    function zoneFormatter(tz) {
      let formatter = ZONE_FORMATTERS.get(tz)
      if (formatter === undefined) {
        formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          hour12: false,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
        ZONE_FORMATTERS.set(tz, formatter)
      }
      return formatter
    }

    /**
     * Wall-clock parts of one instant in a zone.
     * @param {number} utcMs - epoch milliseconds.
     * @param {string} tz - IANA zone.
     * @returns {object} year, month, day, hour, minute, second, weekday.
     */
    function wallParts(utcMs, tz) {
      const parts = zoneFormatter(tz).formatToParts(new Date(utcMs))
      const map = {}
      for (const part of parts) map[part.type] = part.value
      const year = Number(map.year)
      const month = Number(map.month)
      const day = Number(map.day)
      return {
        year,
        month,
        day,
        hour: Number(map.hour) % 24,
        minute: Number(map.minute),
        second: Number(map.second),
        weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
      }
    }

    /** Offset of one zone at one instant, in milliseconds. */
    function zoneOffset(utcMs, tz) {
      const p = wallParts(utcMs, tz)
      const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
      return asUtc - (utcMs - (utcMs % 1000))
    }

    /**
     * Resolve one wall-clock time in a zone to an instant.
     *
     * Two passes converge across a DST switch, which is what the scheduler's
     * own zone math does for the stored rule time.
     */
    function zonedInstant(year, month, day, hour, minute, tz) {
      const guess = Date.UTC(year, month - 1, day, hour, minute)
      let instant = guess
      for (let pass = 0; pass < 2; pass += 1) instant = guess - zoneOffset(instant, tz)
      return instant
    }

    /** Parse one cron field into sorted values, or null when malformed. */
    function cronField(text, min, max) {
      const values = new Set()
      for (const part of String(text).split(',')) {
        const [range, stepText] = part.split('/')
        const step = stepText === undefined ? 1 : Number(stepText)
        if (!Number.isInteger(step) || step < 1) return null
        let lo
        let hi
        if (range === '*') {
          lo = min
          hi = max
        } else if (range.includes('-')) {
          const bits = range.split('-')
          lo = Number(bits[0])
          hi = Number(bits[1])
        } else {
          lo = Number(range)
          hi = lo
        }
        if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) return null
        for (let value = lo; value <= hi; value += step) values.add(value)
      }
      return values.size === 0 ? null : [...values].sort((a, b) => a - b)
    }

    /** Parse a five-field cron expression, or null when it is not one. */
    function parseCron(expression) {
      const fields = String(expression || '').trim().split(/\s+/)
      if (fields.length !== 5) return null
      const minute = cronField(fields[0], 0, 59)
      const hour = cronField(fields[1], 0, 23)
      const dom = cronField(fields[2], 1, 31)
      const month = cronField(fields[3], 1, 12)
      const rawDow = cronField(fields[4], 0, 7)
      if (minute === null || hour === null || dom === null || month === null || rawDow === null) return null
      const dow = [...new Set(rawDow.map(value => value % 7))].sort((a, b) => a - b)
      return {
        minute,
        hour,
        dom,
        month,
        dow,
        domAll: dom.length === 31,
        dowAll: dow.length === 7,
      }
    }

    /** Local midnight to local midnight. */
    function dayWindow(ts) {
      const start = new Date(ts)
      start.setHours(0, 0, 0, 0)
      const from = start.getTime()
      return { unit: 'day', start: from, end: from + DAY_MS_LOCAL }
    }

    /** First day of the local month to the first day of the next. */
    function monthWindow(ts) {
      const date = new Date(ts)
      return {
        unit: 'month',
        start: new Date(date.getFullYear(), date.getMonth(), 1).getTime(),
        end: new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime(),
      }
    }

    /**
     * The window one task's recurrence calls for: intraday and daily rules read
     * today, weekly and monthly rules read this month, a one-shot reads its own
     * day so the point is always on the axis.
     */
    function windowFor(task, now) {
      const kind = task.kind
      if (kind === 'weekly') return monthWindow(now)
      if (kind === 'rrule') {
        // An RRULE that fires several times a day reads as a day, exactly like
        // an intraday cron; only a sparse rule belongs on a month axis.
        const parsed = readRRule(task)
        if (parsed === null) return monthWindow(now)
        return rrulePerDay(parsed) >= 4 ? dayWindow(now) : monthWindow(now)
      }
      if (kind === 'every') {
        const step = Number(task.everySeconds) * 1000
        return Number.isFinite(step) && step >= DAY_MS_LOCAL ? monthWindow(now) : dayWindow(now)
      }
      if (kind === 'cron') {
        const cron = parseCron(task.expression)
        if (cron === null) return dayWindow(now)
        // A cron that fires several times a day reads as a day, even when it is
        // limited to weekdays; a once-a-day weekly or monthly one reads as a month.
        const perDay = cron.hour.length * cron.minute.length
        if (cron.domAll && cron.dowAll) return dayWindow(now)
        return perDay >= 4 ? dayWindow(now) : monthWindow(now)
      }
      if (kind === 'at' || kind === 'after') {
        const at = timeOf(task.scheduledAt)
        return dayWindow(Number.isFinite(at) ? at : now)
      }
      return dayWindow(now)
    }

    /** `HH:mm` from a stored rule time. */
    function timeParts(value) {
      const match = /^(\d{1,2}):(\d{2})/.exec(String(value === undefined || value === null ? '' : value))
      return match === null ? null : { hour: Number(match[1]), minute: Number(match[2]) }
    }

    /** Every wall date that can touch a window, with a one-day margin. */
    function wallDays(fromMs, toMs, tz) {
      const seed = wallParts(fromMs - DAY_MS_LOCAL, tz)
      const days = []
      let cursor = Date.UTC(seed.year, seed.month - 1, seed.day)
      const limit = toMs + DAY_MS_LOCAL
      for (let guard = 0; guard < 70 && cursor <= limit; guard += 1) {
        const date = new Date(cursor)
        days.push({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() })
        cursor += DAY_MS_LOCAL
      }
      return days
    }

    /**
     * Read the RFC 5545 subset this page expands.
     *
     * Returns null for anything it cannot expand faithfully — COUNT, BYSETPOS,
     * BYWEEKNO, BYYEARDAY, ordinal BYDAY — so the caller falls back to the one
     * occurrence the Host actually committed instead of guessing.
     */
    function readRRule(task) {
      const lines = String(task.rrule || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
      let zone = task.timeZone || 'UTC'
      let start = null
      let body = ''
      for (const line of lines) {
        if (/^DTSTART/i.test(line)) {
          const match = /^DTSTART(?:;TZID=([^:;]+))?[^:]*:(\d{8}T\d{6}Z?)/i.exec(line)
          if (match === null) return null
          if (match[1] !== undefined) zone = match[1]
          const stamp = match[2]
          start = {
            year: Number(stamp.slice(0, 4)),
            month: Number(stamp.slice(4, 6)),
            day: Number(stamp.slice(6, 8)),
            hour: Number(stamp.slice(9, 11)),
            minute: Number(stamp.slice(11, 13)),
            second: Number(stamp.slice(13, 15)),
            utc: stamp.endsWith('Z'),
          }
        } else if (/^RRULE:/i.test(line)) {
          body = line.slice(6)
        }
      }
      if (start === null || body === '') return null
      if (start.utc) zone = 'UTC'
      const parts = {}
      for (const chunk of body.split(';')) {
        const at = chunk.indexOf('=')
        if (at > 0) parts[chunk.slice(0, at).toUpperCase()] = chunk.slice(at + 1)
      }
      if (parts.COUNT !== undefined) return null
      if (parts.BYSETPOS !== undefined || parts.BYWEEKNO !== undefined || parts.BYYEARDAY !== undefined) return null
      const freq = parts.FREQ
      if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') return null
      const interval = parts.INTERVAL === undefined ? 1 : Number(parts.INTERVAL)
      if (!Number.isInteger(interval) || interval < 1) return null
      const byDay = parts.BYDAY === undefined ? null : readByDay(parts.BYDAY)
      if (parts.BYDAY !== undefined && byDay === null) return null
      const byHour = parts.BYHOUR === undefined ? null : readNumbers(parts.BYHOUR, 0, 23)
      const byMinute = parts.BYMINUTE === undefined ? null : readNumbers(parts.BYMINUTE, 0, 59)
      const bySecond = parts.BYSECOND === undefined ? null : readNumbers(parts.BYSECOND, 0, 59)
      const byMonthDay = parts.BYMONTHDAY === undefined ? null : readNumbers(parts.BYMONTHDAY, 1, 31)
      const byMonth = parts.BYMONTH === undefined ? null : readNumbers(parts.BYMONTH, 1, 12)
      if (byHour === null && parts.BYHOUR !== undefined) return null
      if (byMinute === null && parts.BYMINUTE !== undefined) return null
      if (bySecond === null && parts.BYSECOND !== undefined) return null
      if (byMonthDay === null && parts.BYMONTHDAY !== undefined) return null
      if (byMonth === null && parts.BYMONTH !== undefined) return null
      let until = null
      if (parts.UNTIL !== undefined) {
        const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(parts.UNTIL)
        if (match === null) return null
        until = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]),
          Number(match[4]), Number(match[5]), Number(match[6]))
      }
      return { zone, start, freq, interval, byDay, byHour, byMinute, bySecond, byMonthDay, byMonth, until }
    }

    /** `MO,TU,WE` to weekday numbers; null for ordinal forms this page skips. */
    function readByDay(text) {
      const map = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }
      const out = []
      for (const raw of String(text).split(',')) {
        const token = raw.trim().toUpperCase()
        if (map[token] === undefined) return null
        out.push(map[token])
      }
      return out.length === 0 ? null : [...new Set(out)].sort((a, b) => a - b)
    }

    /** Comma-separated integers within a range, or null. */
    function readNumbers(text, min, max) {
      const out = []
      for (const raw of String(text).split(',')) {
        const value = Number(raw.trim())
        if (!Number.isInteger(value) || value < min || value > max) return null
        out.push(value)
      }
      return out.length === 0 ? null : [...new Set(out)].sort((a, b) => a - b)
    }

    /** How many times one rule fires inside a single day. */
    function rrulePerDay(parsed) {
      const hours = parsed.byHour === null ? 1 : parsed.byHour.length
      const minutes = parsed.byMinute === null ? 1 : parsed.byMinute.length
      return hours * minutes
    }

    /** Occurrence times one RRULE implies inside a window. */
    function expandRRule(parsed, window) {
      const { zone, start, freq, interval } = parsed
      const hours = parsed.byHour === null ? [start.hour] : parsed.byHour
      const minutes = parsed.byMinute === null ? [start.minute] : parsed.byMinute
      const seconds = parsed.bySecond === null ? [start.second] : parsed.bySecond
      const startWall = Date.UTC(start.year, start.month - 1, start.day)
      const startInstant = zonedInstant(start.year, start.month, start.day, start.hour, start.minute, zone)
      const startWeekday = new Date(startWall).getUTCDay()
      const startMonday = startWall - ((startWeekday + 6) % 7) * DAY_MS_LOCAL
      const times = []
      for (const day of wallDays(window.start, window.end, zone)) {
        const wall = Date.UTC(day.year, day.month - 1, day.day)
        if (wall < startWall) continue
        const weekday = new Date(wall).getUTCDay()
        if (freq === 'WEEKLY') {
          const allowed = parsed.byDay === null ? [startWeekday] : parsed.byDay
          if (!allowed.includes(weekday)) continue
          if (Math.round((wall - startMonday) / (7 * DAY_MS_LOCAL)) % interval !== 0) continue
        } else if (freq === 'DAILY') {
          if (Math.round((wall - startWall) / DAY_MS_LOCAL) % interval !== 0) continue
          if (parsed.byDay !== null && !parsed.byDay.includes(weekday)) continue
        } else if (freq === 'MONTHLY') {
          const months = (day.year - start.year) * 12 + (day.month - start.month)
          if (months < 0 || months % interval !== 0) continue
          const monthDays = parsed.byMonthDay === null ? [start.day] : parsed.byMonthDay
          if (!monthDays.includes(day.day)) continue
          if (parsed.byMonth !== null && !parsed.byMonth.includes(day.month)) continue
        } else {
          const years = day.year - start.year
          if (years < 0 || years % interval !== 0) continue
          const months = parsed.byMonth === null ? [start.month] : parsed.byMonth
          if (!months.includes(day.month)) continue
          const monthDays = parsed.byMonthDay === null ? [start.day] : parsed.byMonthDay
          if (!monthDays.includes(day.day)) continue
        }
        for (const hour of hours) {
          for (const minute of minutes) {
            for (const second of seconds) {
              const at = zonedInstant(day.year, day.month, day.day, hour, minute, zone) + second * 1000
              if (at < window.start || at >= window.end || at < startInstant) continue
              if (parsed.until !== null && at > parsed.until) continue
              times.push(at)
              if (times.length > MAX_LANE_POINTS) return { times: [], dense: true }
            }
          }
        }
      }
      times.sort((a, b) => a - b)
      return { times, dense: false }
    }

    /**
     * Occurrence times one rule implies inside a window.
     *
     * Derived, not read: the Host stores only the next committed occurrence, so
     * this expands the stored rule around that anchor. An RRULE cannot be
     * expanded reliably here and returns null, leaving only the official point.
     * @returns {{times: number[], dense: boolean}|null} ascending times, or a
     *   dense marker when the window holds more points than a lane can draw.
     */
    function expandOccurrences(task, window) {
      const kind = task.kind
      if (kind === 'rrule') {
        const parsed = readRRule(task)
        return parsed === null ? null : expandRRule(parsed, window)
      }
      if (kind === 'at' || kind === 'after') {
        const at = timeOf(task.scheduledAt)
        return { times: Number.isFinite(at) ? [at] : [], dense: false }
      }
      if (kind === 'every') {
        const step = Number(task.everySeconds) * 1000
        const anchor = timeOf(task.scheduledAt)
        if (!Number.isFinite(step) || step <= 0 || !Number.isFinite(anchor)) return null
        const times = []
        const first = anchor + Math.ceil((window.start - anchor) / step) * step
        for (let at = first; at < window.end; at += step) {
          times.push(at)
          if (times.length > MAX_LANE_POINTS) return { times: [], dense: true }
        }
        return { times, dense: false }
      }
      const cron = kind === 'cron' ? parseCron(task.expression) : null
      if (kind === 'cron' && cron === null) return null
      const daily = timeParts(task.time)
      if ((kind === 'daily' || kind === 'weekly') && daily === null) return null
      const weekdays = kind === 'weekly' && Array.isArray(task.weekdays) ? task.weekdays : null
      const tz = task.timeZone || 'UTC'
      const times = []
      for (const day of wallDays(window.start, window.end, tz)) {
        const weekday = new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay()
        if (kind === 'cron') {
          if (!cron.month.includes(day.month)) continue
          const domHit = cron.dom.includes(day.day)
          const dowHit = cron.dow.includes(weekday)
          const dayHit = cron.domAll && cron.dowAll
            ? true
            : cron.domAll ? dowHit : cron.dowAll ? domHit : domHit || dowHit
          if (!dayHit) continue
          for (const hour of cron.hour) {
            for (const minute of cron.minute) {
              const at = zonedInstant(day.year, day.month, day.day, hour, minute, tz)
              if (at < window.start || at >= window.end) continue
              times.push(at)
              if (times.length > MAX_LANE_POINTS) return { times: [], dense: true }
            }
          }
          continue
        }
        if (weekdays !== null && !weekdays.includes(weekday)) continue
        const at = zonedInstant(day.year, day.month, day.day, daily.hour, daily.minute, tz)
        if (at >= window.start && at < window.end) times.push(at)
      }
      times.sort((a, b) => a - b)
      return { times, dense: false }
    }

    /** Axis ticks for one window. */
    function groupTicks(group) {
      const ticks = []
      if (group.unit === 'day') {
        for (let hour = 0; hour <= 24; hour += 3) {
          ticks.push({ pct: (hour * 3600000) / DAY_MS_LOCAL * 100, label: pad2(hour) })
        }
        return ticks
      }
      const first = new Date(group.start)
      const month = first.getMonth() + 1
      for (const day of [1, 8, 15, 22, 29]) {
        const at = new Date(first.getFullYear(), first.getMonth(), day).getTime()
        if (at < group.start || at >= group.end) continue
        ticks.push({
          pct: (at - group.start) / (group.end - group.start) * 100,
          label: month + '/' + pad2(day),
        })
      }
      return ticks
    }

    /** Group heading text. */
    function groupLabel(group, now, t) {
      const count = group.lanes.length + ' ' + t('laneUnit')
      if (group.idle) {
        const first = new Date(group.start)
        const last = new Date(group.end - 1)
        return {
          title: t('tlIdle'),
          sub: (first.getMonth() + 1) + '/01 – ' + (last.getMonth() + 1) + '/' + pad2(last.getDate()) + ' · ' + count,
        }
      }
      if (group.unit === 'month') {
        const first = new Date(group.start)
        const last = new Date(group.end - 1)
        return {
          title: t('tlMonth'),
          sub: (first.getMonth() + 1) + '/01 – ' + (last.getMonth() + 1) + '/' + pad2(last.getDate()) + ' · ' + count,
        }
      }
      if (group.start === startOfDay(now)) {
        return { title: t('tlToday'), sub: '00:00 – 24:00 · ' + count }
      }
      const date = new Date(group.start)
      const stamp = (date.getMonth() + 1) + '/' + pad2(date.getDate())
      return { title: t('tlOnce') + ' · ' + stamp, sub: stamp + ' 00:00 – 24:00 · ' + count }
    }

    /**
     * Fold the catalog and its receipts into grouped lanes.
     *
     * Geometry only: every point keeps its timestamp, and the current clock is
     * applied at render time so a point can change colour without re-expanding
     * any rule.
     */
    function buildTimeline(snap, now, t) {
      const tasks = snap ? snap.tasks : []
      const receipts = snap ? snap.records : []
      const byTask = new Map()
      for (const receipt of receipts) {
        const list = byTask.get(receipt.taskId)
        if (list === undefined) byTask.set(receipt.taskId, [receipt])
        else list.push(receipt)
      }
      const groups = new Map()
      let laneCount = 0
      for (const task of tasks) {
        // A task that will not fire again has no schedule to plot: it belongs in
        // one parking group at the bottom, on a month axis that can still show
        // the receipts it produced before it was paused or ended.
        const active = task.status === 'active'
        const window = active ? windowFor(task, now) : monthWindow(now)
        const key = active ? window.unit + ':' + window.start : 'idle'
        let group = groups.get(key)
        if (group === undefined) {
          group = { key, unit: window.unit, start: window.start, end: window.end, lanes: [], idle: key === 'idle' }
          groups.set(key, group)
        }
        // A paused or ended task will not fire again, so only its real receipts
        // are plotted; derived points would claim runs the Host will never make.
        // Receipts are retained for a bounded window, so a past occurrence
        // older than the oldest retained receipt cannot be judged: it is shown
        // as unconfirmed rather than claimed as a missed run.
        let coveredFrom = null
        for (const receipt of byTask.get(task.id) || []) {
          const at = timeOf(receipt.scheduledAt)
          if (!Number.isFinite(at)) continue
          if (coveredFrom === null || at < coveredFrom) coveredFrom = at
        }
        const expanded = active ? expandOccurrences(task, window) : null
        const official = active ? timeOf(task.scheduledAt) : NaN
        const points = new Map()
        if (expanded !== null && !expanded.dense) {
          for (const at of expanded.times) points.set(at, { t: at, receipt: null })
        }
        for (const receipt of byTask.get(task.id) || []) {
          const at = timeOf(receipt.scheduledAt)
          if (!Number.isFinite(at) || at < window.start || at >= window.end) continue
          points.set(at, { t: at, receipt })
        }
        if (active && Number.isFinite(official) && official >= window.start && official < window.end) {
          if (!points.has(official)) points.set(official, { t: official, receipt: null })
        }
        group.lanes.push({
          id: task.id,
          title: task.title,
          rule: ruleText(task, t),
          dense: expanded !== null && expanded.dense,
          points: [...points.values()].sort((a, b) => a.t - b.t),
          officialAt: Number.isFinite(official) ? official : null,
          sessionId: sessionOf(task),
          coveredFrom,
          execActive: task.executionActive === true,
        })
        laneCount += 1
      }
      const rank = group => (group.idle ? 3 : group.unit === 'month' ? 1 : group.start === startOfDay(now) ? 0 : 2)
      const ordered = [...groups.values()].sort((a, b) => {
        const rankA = rank(a)
        const rankB = rank(b)
        if (rankA !== rankB) return rankA - rankB
        return a.start - b.start
      })
      return { groups: ordered, laneCount }
    }

    // ---------------------------------------------------------------- data ---

    /**
     * Read every Host task from the official schedule Remote endpoint.
     * @param {object} remote - the Client `remote` service.
     * @returns {Promise<object[]>} catalog entries.
     */
    async function readCatalog(remote) {
      const result = await remote.schedule.catalog()
      if (result === null || typeof result !== 'object' || result.ok !== true) {
        const code = result && result.error && result.error.code ? result.error.code : 'schedule/catalog'
        throw new Error(code)
      }
      return Array.isArray(result.value) ? result.value : []
    }

    /**
     * Read one task's saved delivery receipts.
     * @param {object} remote - the Client `remote` service.
     * @param {string} id - task identity.
     * @returns {Promise<object[]>} newest-first receipts, or none.
     */
    async function readHistory(remote, id) {
      const result = await remote.schedule.history({ id, limit: HISTORY_LIMIT })
      if (result === null || typeof result !== 'object' || result.ok !== true) return []
      const page = result.value
      if (page === null || typeof page !== 'object' || !Array.isArray(page.records)) return []
      return page.records
    }

    /**
     * One consistent read of the official catalog plus its recent receipts.
     * @param {object} remote - the Client `remote` service.
     * @returns {Promise<{tasks: object[], records: object[], loadedAt: number, capped: boolean}>} snapshot.
     */
    async function loadSnapshot(remote) {
      const tasks = await readCatalog(remote)
      const ordered = tasks.slice().sort((a, b) => {
        const at = timeOf(a.lastDelivery && a.lastDelivery.deliveredAt)
        const bt = timeOf(b.lastDelivery && b.lastDelivery.deliveredAt)
        if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return bt - at
        if (Number.isFinite(at) !== Number.isFinite(bt)) return Number.isFinite(at) ? -1 : 1
        return timeOf(b.scheduledAt) - timeOf(a.scheduledAt)
      })
      const selected = ordered.slice(0, HISTORY_TASK_CAP)
      const pages = await Promise.all(selected.map(task => readHistory(remote, task.id).catch(() => [])))
      const records = []
      pages.forEach((receipts, index) => {
        const task = selected[index]
        for (const receipt of receipts) {
          if (!receipt || typeof receipt.deliveredAt !== 'string') continue
          records.push({
            messageId: receipt.messageId,
            taskId: task.id,
            title: task.title,
            deliveredAt: receipt.deliveredAt,
            scheduledAt: receipt.scheduledAt,
            targetSessionId: receipt.targetSessionId,
          })
        }
      })
      records.sort((a, b) => timeOf(b.deliveredAt) - timeOf(a.deliveredAt))
      // `capped` marks a catalog larger than the history fan-out: today's count
      // is then a lower bound, and the readout says so instead of rounding down.
      return { tasks, records, loadedAt: Date.now(), capped: tasks.length > HISTORY_TASK_CAP }
    }

    /**
     * Follow the forwarded catalog-changed event and reconnection resets.
     * @param {object} ctx - the Client plugin context.
     * @param {Function} listener - refresh callback.
     * @returns {Function} disposer.
     */
    function subscribeChanged(ctx, listener) {
      const disposers = []
      try {
        const off = ctx.remote.$on('schedule/changed', listener)
        if (typeof off === 'function') disposers.push(off)
      } catch (error) { /* event unavailable: the interval still refreshes */ }
      try {
        const off = ctx.on('connection/reset', listener)
        if (typeof off === 'function') disposers.push(off)
      } catch (error) { /* no connection service: nothing to reset */ }
      return () => {
        for (const dispose of disposers) {
          try { dispose() } catch (error) { /* already disposed */ }
        }
      }
    }

    /**
     * One receipt's delivery lag, or NaN when either stamp is unreadable.
     * @param {object} receipt - a saved delivery record.
     * @returns {number} milliseconds from the committed occurrence to delivery.
     */
    function lagOf(receipt) {
      const delivered = timeOf(receipt.deliveredAt)
      const scheduled = timeOf(receipt.scheduledAt)
      return Number.isFinite(delivered) && Number.isFinite(scheduled) ? delivered - scheduled : NaN
    }

    /**
     * The conversation a task is bound to, for the card's click target.
     *
     * `session` and `new_once` name one session; a per-delivery `new` target has
     * no single session, so the latest delivery is the useful destination.
     */
    function sessionOf(task) {
      const target = task.target
      if (target && target.kind === 'session' && target.sessionId) return target.sessionId
      if (target && target.kind === 'new_once' && target.sessionId) return target.sessionId
      const last = task.lastDelivery && task.lastDelivery.targetSessionId
      if (last) return last
      const involved = Array.isArray(task.involvedSessionIds) ? task.involvedSessionIds : []
      return involved.length === 0 ? null : involved[involved.length - 1]
    }

    /**
     * Fold one snapshot and the current clock into everything the page draws.
     * @param {object|null} snap - loaded snapshot.
     * @param {number} now - current epoch milliseconds.
     * @param {Function} t - namespace-bound translate.
     * @returns {object} derived view model.
     */
    function buildView(snap, now, t) {
      const tasks = snap ? snap.tasks : []
      const receipts = snap ? snap.records : []
      const dayStart = startOfDay(now)
      const today = receipts.filter(receipt => {
        const at = timeOf(receipt.deliveredAt)
        return Number.isFinite(at) && at >= dayStart && at < dayStart + DAY_MS
      })
      // A receipt with an unreadable stamp cannot be judged either way, so it
      // stays out of the ratio instead of silently counting as late.
      const measured = today.filter(receipt => Number.isFinite(lagOf(receipt)))
      const onTimeCount = measured.filter(receipt => lagOf(receipt) <= ON_TIME_MS).length
      const rate = measured.length > 0 ? Math.round((onTimeCount / measured.length) * 100) : null

      let next = null
      for (const task of tasks) {
        if (task.status !== 'active') continue
        const at = timeOf(task.scheduledAt)
        if (!Number.isFinite(at)) continue
        if (next === null || at < next.at) next = { at, title: task.title }
      }

      const cards = tasks.map(task => {
        const at = task.status === 'active' ? timeOf(task.scheduledAt) : NaN
        const last = timeOf(task.lastDelivery && task.lastDelivery.deliveredAt)
        return {
          id: task.id,
          title: task.title,
          status: statusOf(task),
          rule: ruleText(task, t),
          at: Number.isFinite(at) ? at : null,
          lastAt: Number.isFinite(last) ? last : null,
          sessionId: sessionOf(task),
        }
      }).sort((a, b) => {
        const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status]
        if (rank !== 0) return rank
        if (a.at !== null && b.at !== null && a.at !== b.at) return a.at - b.at
        if (a.at === null && b.at !== null) return 1
        if (a.at !== null && b.at === null) return -1
        return String(a.title).localeCompare(String(b.title))
      })

      const rows = receipts.slice(0, RECORD_ROWS).map(receipt => {
        const lag = lagOf(receipt)
        return {
          key: String(receipt.messageId || '') + '|' + String(receipt.deliveredAt || ''),
          at: timeOf(receipt.deliveredAt),
          title: receipt.title,
          lag,
          tone: !Number.isFinite(lag) ? 'unknown' : lag <= ON_TIME_MS ? 'on' : 'late',
        }
      })

      return {
        todayCount: today.length,
        capped: Boolean(snap && snap.capped),
        rate,
        next,
        cards,
        rows,
        taskCount: tasks.length,
        loadedAt: snap ? snap.loadedAt : null,
      }
    }

    // ----------------------------------------------------------- components ---

    /** Sidebar glyph: a pulse trace, drawn at the size the sidebar asks for. */
    function DashboardIcon(props) {
      const size = props && typeof props.size === 'number' ? props.size : 18
      const active = Boolean(props && props.active)
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        'aria-hidden': true,
        style: { display: 'block', opacity: active ? 1 : 0.8 },
      }, h('path', {
        d: 'M2.5 13.4h3.4l2.1-5.7 3.3 9.6 2.5-6.9 1.7 3h5',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }))
    }

    function StatTicks({ count }) {
      const filled = Math.min(TICK_COUNT, Math.max(0, count))
      const ticks = []
      for (let index = 0; index < TICK_COUNT; index += 1) {
        ticks.push(h('span', {
          key: index,
          className: 'ds-tick',
          'data-on': index < filled ? '1' : '0',
        }))
      }
      return h('div', { className: 'ds-ticks', 'aria-hidden': true }, ticks)
    }

    function RateRing({ rate }) {
      const radius = 16
      const circumference = 2 * Math.PI * radius
      const filled = rate === null ? 0 : Math.max(0, Math.min(100, rate))
      const dash = (circumference * filled) / 100
      return h('svg', { className: 'ds-ring', width: 38, height: 38, viewBox: '0 0 40 40', 'aria-hidden': true },
        h('circle', { cx: 20, cy: 20, r: radius, fill: 'none', stroke: 'rgba(110,170,255,.16)', strokeWidth: 2 }),
        h('circle', {
          cx: 20,
          cy: 20,
          r: radius,
          fill: 'none',
          stroke: 'var(--ds-cyan)',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeDasharray: dash.toFixed(2) + ' ' + circumference.toFixed(2),
          transform: 'rotate(-90 20 20)',
          style: { transition: 'stroke-dasharray .45s ease' },
        }),
      )
    }

    function TaskCard({ card, now, t, openTasks }) {
      const statusKey = STATUS_LABEL[card.status] || 'statusWaiting'
      const due = card.at
      const remaining = due === null ? null : due - now
      let relText = ''
      let overdue = false
      if (remaining !== null) {
        if (remaining > 0) relText = t('relIn') + ' ' + spanText(remaining, t)
        else { relText = t('overdue'); overdue = true }
      } else if (card.lastAt !== null) {
        relText = t('updated') + ' ' + dayClock(card.lastAt)
      }
      const linked = typeof openTasks === 'function'
      const open = () => { try { openTasks() } catch (failure) { /* panel unavailable */ } }
      return h('div', {
        className: 'ds-cardOuter',
        'data-running': card.status === 'running' ? '1' : '0',
        'data-linkable': linked ? '1' : '0',
        role: linked ? 'button' : undefined,
        tabIndex: linked ? 0 : undefined,
        title: linked ? t('openTask') : undefined,
        onClick: linked ? open : undefined,
        onKeyDown: linked ? (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          open()
        } : undefined,
      },
        h('div', { className: 'ds-card', 'data-status': card.status },
          h('div', { className: 'ds-cardTop' },
            h('span', { className: 'ds-chip' },
              h('span', { className: 'ds-dot' }),
              h('span', null, t(statusKey)),
            ),
            h('span', { className: 'ds-rule', title: card.rule }, card.rule),
          ),
          h('div', { className: 'ds-cardTitle', title: card.title }, card.title),
          h('div', { className: 'ds-cardFoot' },
            h('span', { className: 'ds-k' }, t('nextLabel')),
            h('span', { className: 'ds-v' }, due === null ? t('noNext') : dayClock(due)),
            relText ? h('span', { className: 'ds-rel', 'data-overdue': overdue ? '1' : '0' }, relText) : null,
          ),
        ),
      )
    }

    function SectionHead({ title, count, hint, t }) {
      return h('div', { className: 'ds-section' },
        h('h3', { className: 'ds-sectionTitle' }, title),
        count ? h('span', { className: 'ds-sectionCount' }, count) : null,
        h('span', { className: 'ds-sectionRule', 'aria-hidden': true }),
        hint ? h('span', { className: 'ds-scrollHint' }, hint) : null,
      )
    }

    /** Display state of one occurrence at the current clock. */
    function lanePointState(lane, point, now) {
      if (point.receipt !== null) return 'delivered'
      if (lane.execActive && point.t === lane.officialAt && Math.abs(now - point.t) <= 120000) return 'live'
      if (point.t > now) return 'future'
      if (lane.coveredFrom === null || point.t < lane.coveredFrom) return 'unknown'
      return 'overdue'
    }

    /** Verdict word for one point, used in its hover title. */
    function laneStateLabel(state, t) {
      if (state === 'delivered') return t('onTime')
      if (state === 'overdue') return t('late')
      if (state === 'live') return t('statusRunning')
      if (state === 'unknown') return t('unknown')
      return t('futureLabel')
    }

    function TimelineLane({ group, lane, now, t, openSession }) {
      const span = group.end - group.start
      const pct = at => ((at - group.start) / span) * 100
      const nextText = lane.officialAt === null
        ? t('noNext')
        : group.unit === 'month' || startOfDay(lane.officialAt) !== startOfDay(now)
          ? dayClock(lane.officialAt)
          : clock(lane.officialAt)
      const nowPct = Math.max(0, Math.min(100, pct(now)))
      const body = lane.points.length === 0
        ? [h('span', { key: 'none', className: 'tl-none' }, t('noReceipts'))]
        : lane.dense
        ? [
          h('span', { key: 'past', className: 'tl-band', 'data-f': '0', style: { left: '0%', width: nowPct + '%' } }),
          h('span', { key: 'next', className: 'tl-band', 'data-f': '1', style: { left: nowPct + '%', width: (100 - nowPct) + '%' } }),
        ]
        : lane.points.map(point => {
          const state = lanePointState(lane, point, now)
          const lag = point.receipt === null ? null : timeOf(point.receipt.deliveredAt) - point.t
          const title = clock(point.t) + ' ' + laneStateLabel(state, t)
            + (lag === null || !Number.isFinite(lag) ? '' : ' · ' + t('lagLabel') + ' ' + lagText(lag))
          return h('span', {
            key: point.t,
            className: 'tl-pt',
            'data-s': state,
            style: { left: pct(point.t) + '%' },
            title,
          })
        })
      const linked = lane.sessionId !== null && typeof openSession === 'function'
      const open = () => { try { openSession(lane.sessionId) } catch (failure) { /* conversation unavailable */ } }
      return h('div', {
        className: 'tl-lane',
        'data-running': lane.execActive ? '1' : '0',
        'data-linkable': linked ? '1' : '0',
        role: linked ? 'button' : undefined,
        tabIndex: linked ? 0 : undefined,
        title: linked ? t('openSession') : undefined,
        onClick: linked ? open : undefined,
        onKeyDown: linked ? (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          open()
        } : undefined,
      },
        h('div', { className: 'tl-name' },
          h('div', { className: 'tl-n1', title: lane.title }, lane.title),
          h('div', { className: 'tl-n2', title: lane.rule }, lane.rule),
        ),
        h('div', { className: 'tl-track' }, body),
        h('div', { className: 'tl-right' }, nextText),
      )
    }

    function TimelineGroup({ group, now, t, openSession }) {
      const label = groupLabel(group, now, t)
      const inWindow = now >= group.start && now < group.end
      // Red for one minute after the line crosses a committed occurrence.
      const hot = group.lanes.some(lane => lane.points.some(point => point.t <= now && point.t >= now - 60000))
      const scanPct = ((now - group.start) / (group.end - group.start)) * 100
      const stamp = group.unit === 'month' ? dayClock(now).split(' ')[0] : clock(now)
      return h('div', { className: 'tl-group' },
        h('div', { className: 'tl-ghead' },
          h('span', { className: 'tl-gtitle' }, label.title),
          h('span', { className: 'tl-gsub' }, label.sub),
          inWindow ? h('span', { className: 'tl-now' }, t('nowLabel') + ' ' + stamp) : null,
        ),
        h('div', { className: 'tl-axis' },
          groupTicks(group).map(tick => [
            h('span', { key: 't' + tick.label, className: 'tl-tick', style: { left: tick.pct + '%' } }),
            h('span', { key: 'l' + tick.label, className: 'tl-tlabel', style: { left: tick.pct + '%' } }, tick.label),
          ]),
        ),
        h('div', { className: 'tl-body' },
          group.lanes.map(lane => h(TimelineLane, { key: lane.id, group, lane, now, t, openSession })),
          inWindow
            ? h('div', {
              className: 'tl-scan',
              'data-hot': hot ? '1' : '0',
              style: { left: 'calc(176px + (100% - 252px) * ' + (scanPct / 100) + ')' },
            })
            : null,
        ),
      )
    }

    function TimelineLegend({ t }) {
      const rows = [
        ['delivered', t('lgDelivered')],
        ['overdue', t('lgOverdue')],
        ['live', t('lgLive')],
        ['future', t('lgFuture')],
        ['unknown', t('lgUnknown')],
        ['band', t('lgBand')],
      ]
      return h('div', { className: 'tl-legend' },
        rows.map(([state, text]) => h('span', { key: state, className: 'tl-lg' },
          h('i', { 'data-s': state }),
          text,
        )),
      )
    }

    function DashboardPage(props) {
      const t = props.t
      const [snap, setSnap] = useState(null)
      const [error, setError] = useState(null)
      const [busy, setBusy] = useState(false)
      const [now, setNow] = useState(() => Date.now())
      const aliveRef = useRef(true)
      const requestRef = useRef(0)
      const burstRef = useRef(null)
      const [scrollable, setScrollable] = useState(false)
      const cardsRef = useRef(null)

      /**
       * Read the catalog and its receipts.
       * @param {boolean} quiet - background reads leave the refresh control alone,
       *   so a one-minute poll never makes it flicker.
       */
      const refresh = useCallback(async (quiet = false) => {
        const seq = requestRef.current + 1
        requestRef.current = seq
        if (!quiet) setBusy(true)
        try {
          const next = await props.load()
          if (!aliveRef.current || seq !== requestRef.current) return
          setSnap(next)
          setError(null)
        } catch (failure) {
          if (!aliveRef.current || seq !== requestRef.current) return
          const message = failure && failure.message ? failure.message : String(failure || 'unknown')
          setError(message)
        } finally {
          if (!quiet && aliveRef.current && seq === requestRef.current) setBusy(false)
        }
      }, [props])

      // A `:00` burst of catalog changes becomes one read instead of one per event.
      const schedule = useCallback(() => {
        if (burstRef.current !== null) clearTimeout(burstRef.current)
        burstRef.current = setTimeout(() => {
          burstRef.current = null
          void refresh(true)
        }, 350)
      }, [refresh])

      useEffect(() => {
        aliveRef.current = true
        void refresh(true)
        let off = null
        try {
          off = props.subscribe(schedule)
        } catch (failure) { /* the interval below still refreshes */ }
        const poll = setInterval(() => { void refresh(true) }, REFRESH_MS)
        const clock = setInterval(() => { setNow(Date.now()) }, 1000)
        return () => {
          aliveRef.current = false
          if (typeof off === 'function') off()
          if (burstRef.current !== null) clearTimeout(burstRef.current)
          clearInterval(poll)
          clearInterval(clock)
        }
      }, [props, refresh, schedule])

      const view = useMemo(() => buildView(snap, now, t), [snap, now, t])
      const ready = snap !== null
      // Lane geometry is expanded once per window: the day and month keys only
      // change at their boundary, while each point's colour follows the clock.
      const dayKey = startOfDay(now)
      const monthKey = new Date(now).getFullYear() * 12 + new Date(now).getMonth()
      const timeline = useMemo(() => buildTimeline(snap, now, t), [snap, dayKey, monthKey, t])
      useEffect(() => {
        const element = cardsRef.current
        if (element === null) return undefined
        const check = () => setScrollable(element.scrollHeight > element.clientHeight + 1)
        check()
        if (typeof ResizeObserver === 'function') {
          const observer = new ResizeObserver(check)
          observer.observe(element)
          return () => observer.disconnect()
        }
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
      }, [view.cards.length, ready])
      const nextIn = view.next === null ? null : view.next.at - now
      // A catalog wider than the history fan-out makes today's count a floor.
      const countText = !ready ? '--' : view.capped ? t('cappedPrefix') + view.todayCount : String(view.todayCount)

      const head = h('div', { className: 'ds-head' },
        h('div', { className: 'ds-brand' },
          h('span', { className: 'ds-mark', 'aria-hidden': true }),
          h('div', null,
            h('h2', { className: 'ds-title' }, t('title')),
            h('div', { className: 'ds-sub' }, t('subtitle')),
          ),
        ),
        h('div', { className: 'ds-headMeta' },
          h('span', { className: 'ds-stamp' },
            view.loadedAt === null ? t('loading') : t('updated') + ' ' + clockSec(view.loadedAt)),
          h('button', {
            type: 'button',
            className: 'ds-refresh',
            disabled: busy,
            'aria-busy': busy ? 'true' : 'false',
            onClick: () => { void refresh() },
          }, t('refresh')),
        ),
      )

      const stats = h('div', { className: 'ds-stats' },
        h('div', { className: 'ds-stat' },
          h('div', { className: 'ds-statLabel' }, t('todayTriggers')),
          h('div', { className: 'ds-statValue' },
            h('span', { className: 'ds-num' }, countText),
            h('span', { className: 'ds-unit' }, t('todayUnit')),
          ),
          h(StatTicks, { count: view.todayCount }),
        ),
        h('div', { className: 'ds-stat' },
          h('div', { className: 'ds-statLabel', title: t('onTimeHint') }, t('onTimeRate')),
          h('div', { className: 'ds-statRow' },
            h(RateRing, { rate: view.rate }),
            h('div', { className: 'ds-statValue' },
              h('span', { className: 'ds-num' }, view.rate === null ? '--' : String(view.rate)),
              h('span', { className: 'ds-unit' }, '%'),
            ),
          ),
        ),
        h('div', { className: 'ds-stat' },
          h('div', { className: 'ds-statLabel' }, t('nextRun')),
          h('div', { className: 'ds-statValue' },
            h('span', { className: 'ds-num ds-countdown' },
              view.next === null ? '--:--:--' : countdownText(nextIn)),
          ),
          h('div', { className: 'ds-statSub', title: view.next === null ? t('noNext') : view.next.title },
            view.next === null ? t('noNext') : view.next.title),
        ),
      )

      // A refresh that failed over existing data says so; a failed first read is
      // reported by the fallback block below instead of twice.
      const banner = error === null || !ready ? null : h('div', { className: 'ds-error', role: 'alert' },
        h('span', { className: 'ds-errorText', title: error }, t('staleNotice')),
        h('button', {
          type: 'button',
          className: 'ds-errorRetry',
          onClick: () => { void refresh() },
        }, t('retry')),
      )

      const openTasks = typeof props.openTasks === 'function' ? props.openTasks : null

      const cardsSection = h('div', { className: 'ds-cardsWrap' },
        h('div', { className: 'ds-cards', ref: cardsRef },
          view.cards.length === 0
            ? h('div', { className: 'ds-panel' },
              h('div', { className: 'ds-empty' }, t('emptyTasks')),
              h('div', { className: 'ds-emptyHint' }, t('emptyTasksHint')),
              openTasks === null ? null : h('button', {
                type: 'button',
                className: 'ds-link',
                onClick: () => { try { openTasks() } catch (failure) { /* panel unavailable */ } },
              }, t('openTasks')),
            )
            : view.cards.map(card => h(TaskCard, { key: card.id, card, now, t, openTasks: props.openTasks })),
        ),
        scrollable ? h('div', { className: 'ds-cardsFade', 'aria-hidden': true }) : null,
      )

      const recordsSection = h('div', { className: 'ds-panel' },
        h(SectionHead, {
          title: t('records'),
          count: timeline.laneCount > 0 ? timeline.laneCount + ' ' + t('laneUnit') : '',
          t,
        }),
        timeline.groups.length === 0
          ? h('div', null,
            h('div', { className: 'ds-empty' }, t('emptyRecords')),
            h('div', { className: 'ds-emptyHint' }, t('emptyRecordsHint')),
          )
          : h('div', null,
            timeline.groups.map(group => h(TimelineGroup, { key: group.key, group, now, t, openSession: props.openSession })),
            h(TimelineLegend, { t }),
          ),
      )

      // Nothing has ever loaded: a load block or a failure block, never an
      // "empty catalog" claim the data does not support.
      const fallback = error === null
        ? h('div', { className: 'ds-panel', 'aria-busy': 'true' },
          h('div', { className: 'ds-loading' },
            h('span', { className: 'ds-loadingBar', 'aria-hidden': true }),
            h('span', null, t('loadingHint')),
          ),
        )
        : h('div', { className: 'ds-panel' },
          h('div', { className: 'ds-empty' }, t('errorTitle')),
          h('div', { className: 'ds-emptyHint', title: error }, error),
          h('button', {
            type: 'button',
            className: 'ds-link',
            onClick: () => { void refresh() },
          }, t('retry')),
        )

      return h('div', { className: 'ds-page' },
        h('div', { className: 'ds-grid', 'aria-hidden': true }),
        h('div', { className: 'ds-scroll' },
          h('div', { className: 'ds-inner' },
            head,
            stats,
            h('div', { className: 'ds-hint' }, t('dataHint')),
            banner,
            ready ? h(SectionHead, {
              title: t('tasks'),
              count: view.taskCount > 0 ? t('taskCountUnit').replace('{n}', view.taskCount) : '',
              hint: scrollable ? t('scrollHint') : '',
              t,
            }) : null,
            ready ? cardsSection : fallback,
            ready ? recordsSection : null,
            h('div', { className: 'ds-note' }, t('note')),
          ),
        ),
      )
    }

    // ---------------------------------------------------------------- apply ---

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'automation-dashboard: dictionaries')
      const t = ctx.locale.bind(NS)

      // One stable injected object: the page's effects depend on it, so a fresh
      // object per render would restart the read loop.
      const injected = {
        t,
        load: () => loadSnapshot(ctx.remote),
        subscribe: listener => subscribeChanged(ctx, listener),
        // The shipped Automation tasks page owns the `schedules` panel; opening
        // it from the empty state keeps the user one click from creating a task.
        openSession: (id) => {
          const workspace = ctx.get('uiWorkspace')
          if (!workspace || typeof workspace.openSession !== 'function') return
          workspace.openSession(id)
        },
        openTasks: () => {
          const layout = ctx.get('layout')
          if (!layout || typeof layout.selectPanel !== 'function') return
          layout.selectPanel('schedules')
        },
      }

      const install = function* install() {
        yield ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
          inject: () => injected,
        }, DashboardPage))
        yield ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 20,
          locale: NS,
          label: () => t('panel'),
        }, DashboardIcon))
      }

      // The official page gates the same read behind `schedule/catalog`; a Peer
      // that may not read the catalog gets no entry rather than a failing page.
      if (ctx.remoteAccess && typeof ctx.remoteAccess.whenAccess === 'function') {
        ctx.remoteAccess.whenAccess('schedule/catalog', install)
        return
      }
      ctx.effect(() => {
        const disposers = Array.from(install())
        return () => {
          for (const dispose of disposers) {
            try { dispose() } catch (error) { /* already disposed */ }
          }
        }
      }, 'automation-dashboard: slots')
    }

    return { apply, inject: ['slots', 'locale', 'remote', 'remote.schedule', 'remoteAccess'] }
  },
})
