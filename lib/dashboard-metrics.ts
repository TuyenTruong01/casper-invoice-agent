import { effectiveChainState } from './command-center';

export type CurrencyTotal={currency:string;amount:number};
export type DashboardMetrics={
  total:number;auto:number;review:number;blocked:number;pending:number;approved:number;anchored:number;rejected:number;
  today:number;lastSevenDays:number;autoRate:number;blockRate:number;escalateRate:number;
  totalAmounts:CurrencyTotal[];approvedAmounts:CurrencyTotal[];anchoredAmounts:CurrencyTotal[];
};

function upper(value:unknown){return String(value||'').trim().toUpperCase()}
function addAmount(totals:Map<string,number>,invoice:Record<string,any>){
  const value=Number(invoice.amount),currency=upper(invoice.currency)||'UNSPECIFIED';
  if(Number.isFinite(value))totals.set(currency,(totals.get(currency)||0)+value);
}
function currencyTotals(totals:Map<string,number>):CurrencyTotal[]{
  return [...totals].sort(([a],[b])=>a.localeCompare(b)).map(([currency,amount])=>({currency,amount}));
}

export function calculateDashboardMetrics(invoices:Record<string,any>[],proposals:Record<string,any>[],now=new Date()):DashboardMetrics {
  const proposalByInvoice=new Map(proposals.map(proposal=>[String(proposal.invoice_id),proposal]));
  const decisions={AUTO_PROPOSE:0,ESCALATE:0,BLOCK:0};
  const states={PENDING:0,APPROVED:0,PAID:0,REJECTED:0};
  const totalAmounts=new Map<string,number>(),approvedAmounts=new Map<string,number>(),anchoredAmounts=new Map<string,number>();
  const todayStart=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
  const sevenDayStart=new Date(now.getFullYear(),now.getMonth(),now.getDate()-6).getTime();
  let today=0,lastSevenDays=0;

  for(const invoice of invoices){
    const decision=upper(invoice.risk_decision) as keyof typeof decisions;
    if(decision in decisions)decisions[decision]++;
    const state=effectiveChainState(invoice,proposalByInvoice.get(String(invoice.id))) as keyof typeof states;
    if(state in states)states[state]++;
    addAmount(totalAmounts,invoice);
    if(state==='APPROVED'||state==='PAID')addAmount(approvedAmounts,invoice);
    if(state==='PAID')addAmount(anchoredAmounts,invoice);
    const processedAt=Date.parse(String(invoice.updated_at||invoice.created_at||''));
    if(Number.isFinite(processedAt)&&processedAt>=sevenDayStart&&processedAt<=now.getTime())lastSevenDays++;
    if(Number.isFinite(processedAt)&&processedAt>=todayStart&&processedAt<=now.getTime())today++;
  }
  const decided=decisions.AUTO_PROPOSE+decisions.ESCALATE+decisions.BLOCK;
  const rate=(count:number)=>decided?Math.round(count/decided*1000)/10:0;
  return {
    total:invoices.length,auto:decisions.AUTO_PROPOSE,review:decisions.ESCALATE,blocked:decisions.BLOCK,
    pending:states.PENDING,approved:states.APPROVED,anchored:states.PAID,rejected:states.REJECTED,
    today,lastSevenDays,autoRate:rate(decisions.AUTO_PROPOSE),blockRate:rate(decisions.BLOCK),escalateRate:rate(decisions.ESCALATE),
    totalAmounts:currencyTotals(totalAmounts),approvedAmounts:currencyTotals(approvedAmounts),anchoredAmounts:currencyTotals(anchoredAmounts),
  };
}
