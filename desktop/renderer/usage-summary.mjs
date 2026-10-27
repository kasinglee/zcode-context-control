export function usageMoney(usage){
 if(!usage?.available)return '—';
 const cost=usage.cost;
 if(!usage.requestCount)return '¥0.00';
 if(!cost?.pricedRequests)return '—';
 const format=(value,symbol)=>symbol+Number(value).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:6});
 return [cost.amount==null?null:format(cost.amount,'¥'),cost.amountUSD==null?null:format(cost.amountUSD,'US$')].filter(Boolean).join(' + ')||'—';
}
export function usageView({usage,global=false,e,t}){
 const n=value=>Number(value??0).toLocaleString('zh-CN');
 const ready=usage?.available;
 return `<section class="card stack usage-summary" aria-label="${e(t(global?'所有项目累计用量':'本任务累计用量'))}"><h3>${e(t(global?'所有项目累计用量':'本任务累计用量'))}</h3><div class="row wrap between"><div><span class="tiny muted">${e(t('累计消耗 token'))}</span><div class="num usage-total">${ready?n(usage.totalTokens):'—'}</div></div><div><span class="tiny muted">${e(t('累计金额 · 官方参考价估算'))}</span><div class="num usage-total">${e(usageMoney(usage))}</div></div></div>${ready?`<p class="tiny muted">${e(t('输入'))} ${n(usage.inputTokens)} + ${e(t('输出'))} ${n(usage.outputTokens)} · ${n(usage.requestCount)} ${e(t('次调用'))}${global?` · ${n(usage.tasksWithUsage)} ${e(t('个有用量的任务'))}`:''}</p>`:''}<p class="tiny muted">${e(t(ready?'本机用量账本，含子任务、压缩及标题生成；缓存和思考不重复相加。约每 15 秒更新，金额非实际账单。':'尚未读取到本任务的本地用量账本。'))}</p>${usage?.cost?.unpricedRequests?`<p class="tiny error">${n(usage.cost.unpricedRequests)} ${e(t('次调用尚未计入金额（价格未知或用量不完整）；已知 token 仍计入。'))}</p>`:''}${usage?.stale?`<p class="tiny error">${e(t('账本读取暂时失败，当前显示上次成功汇总。'))}</p>`:''}</section>`;
}
