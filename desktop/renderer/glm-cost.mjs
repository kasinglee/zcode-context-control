export function glmCostView({cost,e,t,amount,modelName}){
 const money=value=>value==null?'—':'¥'+Number(value).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:6});
 const cash=value=>value==null?'—':'$'+Number(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:6});
 const moneyOf=part=>part.currency==='USD'?cash(part.amount):money(part.amount);
 const total=cost.currency==='USD'?cash(cost.amountUSD??cost.amount):cost.currency==='MIXED'?`${money(cost.amount)} + ${cash(cost.amountUSD)}`:cost.amount==null?'—':money(cost.amount);
 const label=cost.currency==='USD'?t('USD','USD'):cost.currency==='MIXED'?t('CNY + USD','CNY + USD'):t('CNY','CNY');
 const title=cost.currency==='USD'?t('本聊天费用 · DeepSeek 官方参考价','Chat cost · DeepSeek reference rates'):cost.currency==='MIXED'?t('本聊天费用 · 官方参考价','Chat cost · official reference rates'):t('本聊天费用 · 智谱官方参考价','Chat cost · GLM reference rates');
 const formulaTitle=cost.currency==='USD'?t('DeepSeek 公式与计价明细','DeepSeek formula and pricing'):cost.currency==='MIXED'?t('官方公式与计价明细','Formula and pricing details'):t('GLM 公式与计价明细','GLM formula and pricing');
 const referenceUrl=cost.currency==='USD'?t('DeepSeek 官方 API 价格','Official DeepSeek API pricing'):t('智谱官方 API 价格','Official GLM API pricing');
 return `<section class="card detail-cost"><div class="row between"><h3>${e(title)}</h3><strong class="cost-total num">${cost.pricedRequests>0?'≈ '+total:'—'}</strong></div>
 <p class="tiny muted">${e(label)} · ${e(t('已估 {0}/{1} 次 · 非实际账单','{0}/{1} requests priced · Not an actual bill',cost.pricedRequests,cost.totalRequests))}</p>
 <p class="tiny muted">${e(t(cost.notice))}</p>
 <div class="cost-breakdown">${(cost.breakdown||[]).map(part=>`<div class="tiny muted">${e(t(part.label))}<strong class="num">${e(amount(part.tokens))}</strong><span>${moneyOf(part)}</span><span>${moneyOf({currency:part.currency,amount:part.rate})} / ${e(t('百万 token','million tokens'))}</span></div>`).join('')}</div>
 <details data-disclosure="pricing"><summary>${e(formulaTitle)}</summary>
 <p class="tiny muted">${e(t(cost.formula))}</p>${cost.peakNote?`<p class="tiny muted">${e(t(cost.peakNote))}</p>`:''}<p class="tiny muted">${e(t(cost.storageNotice))}</p>
 <p class="tiny muted">${e(cost.scopeNote||t('按每次响应自己的模型计价；思考已含在输出中。仅累计本聊天完成的响应，不包含父聊天和子代理。','Each response uses its own model. Reasoning is included in output. Only completed responses in this chat are counted.'))}</p>
 <div class="table-scroll"><table><tbody>${(cost.groups||[]).map(group=>`<tr><td>${e(modelName(group.model))}${group.currency?` <span class="tiny muted">${e(t(group.currency))}</span>`:''}</td><td>${e(t('{0} 次','{0} requests',group.requests))}</td><td>${moneyOf(group)}</td></tr>`).join('')}</tbody></table></div>
 ${cost.unpricedRequests?`<p class="tiny error">${e(t('未计入：未知模型 {0} 次，用量缺失或异常 {1} 次，超出官方档位 {2} 次','Excluded: {0} unknown-model requests, {1} missing/invalid-usage requests, {2} beyond official tiers',cost.unknownModel,cost.unknownUsage,cost.unsupportedRate))}</p>`:''}
 <p class="tiny muted">${e(t('价格核对：{0}','Prices checked: {0}',cost.checkedAt))} · <button class="flat reference-link" data-action="open-reference" data-reference="pricing">${e(referenceUrl)} ↗</button></p>
 </details>
 <details data-disclosure="billing-records"><summary>${e(t('最近 20 条计费记录','Latest 20 usage records'))}</summary><div class="table-scroll"><table><thead><tr><th>${e(t('模型','Model'))}</th><th>${e(t('总输入','Input'))}</th><th>${e(t('缓存命中','Cached'))}</th><th>${e(t('输出（含思考）','Output incl. reasoning'))}</th><th>${e(t('费用','Amount'))}</th></tr></thead><tbody>${(cost.recent||[]).map(row=>`<tr><td>${e(modelName(row.model))}</td><td>${e(amount(row.inputTokens))}</td><td>${e(amount(row.cachedInputTokens))}</td><td>${e(amount(row.outputTokens))}</td><td>${row.currency==='USD'?cash(row.amount):money(row.amount)}</td></tr>`).join('')}</tbody></table></div></details></section>`;
}