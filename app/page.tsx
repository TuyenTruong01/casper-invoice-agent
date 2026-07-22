'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowUpRight, Bot, Check, CheckCircle2, ChevronRight,
  Database, Download, FileCheck2, FileText, Fingerprint, Gauge,
  LayoutDashboard, Link2, LoaderCircle, LogOut, Menu, Network, Search, Shield,
  ShieldAlert, Sparkles, Trash2, Upload, Wallet, X, XCircle,
} from 'lucide-react';
import { initialWallets } from '../data/seed';
import { buildCommandCenterQueues } from '../lib/command-center';
import { calculateDashboardMetrics, type CurrencyTotal, type DashboardMetrics } from '../lib/dashboard-metrics';
import { buildRiskPresentation } from '../lib/risk-reasoning';
import { buildAuditTimeline, type TimelineEvent } from '../lib/audit-timeline';

declare global { interface Window { CasperWalletProvider?: any } }

type View = 'overview'|'invoices'|'risk'|'chain';
type Invoice = Record<string, any>;
type Proposal = Record<string, any>;
type ChainAction = Record<string, any>;
type Audit = Record<string, any>;
type Data = { invoices:Invoice[]; proposals:Proposal[]; actions:ChainAction[]; audit:Audit[] };

const views:[View,string,any][] = [
  ['overview','Command center',LayoutDashboard],
  ['invoices','Invoice workspace',FileText],
  ['risk','Risk agent',ShieldAlert],
  ['chain','Casper evidence',Network],
];
const CONTRACT = process.env.NEXT_PUBLIC_CASPER_CONTRACT_HASH || '';
const NETWORK = process.env.NEXT_PUBLIC_CASPER_NETWORK || 'casper-test';

function short(value=''){ return value ? `${value.slice(0,8)}…${value.slice(-6)}` : '—'; }
function date(value?:string){ return value ? new Date(value).toLocaleString('vi-VN',{dateStyle:'medium',timeStyle:'short'}) : '—'; }
function amount(value:any,currency='USD'){ return new Intl.NumberFormat('en-US',{style:'currency',currency:currency||'USD',maximumFractionDigits:2}).format(Number(value||0)); }
function statusTone(value?: string | null) {
  const x = String(value ?? '').toUpperCase();

  if (['PAID', 'APPROVED', 'EXECUTED', 'AUTO_PROPOSE'].includes(x)) {
    return 'good';
  }

  if (['BLOCK', 'FAILED', 'ERROR', 'REJECTED'].includes(x)) {
    return 'bad';
  }

  if (['ESCALATE', 'MANAGER_REVIEW'].includes(x)) {
    return 'warn';
  }

  return 'neutral';
}
function explorer(hash:string){ return `https://testnet.cspr.live/transaction/${hash}`; }
async function apiJson(response:Response){const text=await response.text();let data:Record<string,any>;try{data=text?JSON.parse(text):{};}catch{throw new Error(`API returned a non-JSON response (${response.status})`)}if(!response.ok||data.ok===false)throw new Error(String(data.error||`Request failed (${response.status})`));return data}
function transferCount(value:string){try{const parsed=JSON.parse(value||'[]');return Array.isArray(parsed)?parsed.length:0}catch{return 0}}

export default function Page(){
  const [view,setView]=useState<View>('overview');
  const [mobileNav,setMobileNav]=useState(false);
  const [data,setData]=useState<Data>({invoices:[],proposals:[],actions:[],audit:[]});
  const [loading,setLoading]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [message,setMessage]=useState('');
  const [query,setQuery]=useState('');
  const [selected,setSelected]=useState<string>('');
  const [connected,setConnected]=useState('');
  const [walletState,setWalletState]=useState<'idle'|'connecting'|'connected'|'unknown'>('idle');
  const [busyAction,setBusyAction]=useState('');
  const [deleting,setDeleting]=useState('');

  const walletUser=initialWallets.find(w=>w.address.toLowerCase()===connected.toLowerCase()&&w.status==='ACTIVE');
  const proposalByInvoice=useMemo(()=>new Map(data.proposals.map(p=>[p.invoice_id,p])),[data.proposals]);
  const selectedInvoice=selected ? data.invoices.find(i=>i.id===selected) : undefined;
  const selectedProposal=selectedInvoice?proposalByInvoice.get(selectedInvoice.id):undefined;
  const filtered=data.invoices.filter(i=>`${i.invoice_number} ${i.vendor} ${i.original_name}`.toLowerCase().includes(query.toLowerCase()));
  const metrics=useMemo(()=>calculateDashboardMetrics(data.invoices,data.proposals),[data.invoices,data.proposals]);

  async function refresh() {
  setLoading(true);

  try {
    const response = await fetch('/api/invoices', {
      cache: 'no-store',
    });

    const raw = await response.text();

    if (!response.ok) {
      throw new Error(
        raw.trim() ||
          `API /api/invoices trả lỗi HTTP ${response.status}`,
      );
    }

    if (!raw.trim()) {
      throw new Error('API /api/invoices trả về response rỗng');
    }

    let result: Data & {
      ok?: boolean;
      error?: string;
    };

    try {
      result = JSON.parse(raw);
    } catch {
      throw new Error(
        `API /api/invoices không trả JSON hợp lệ: ${raw.slice(0, 200)}`,
      );
    }

    if (result.ok === false) {
      throw new Error(result.error || 'Không thể tải dữ liệu Supabase');
    }

    setData({
      invoices: Array.isArray(result.invoices) ? result.invoices : [],
      proposals: Array.isArray(result.proposals) ? result.proposals : [],
      actions: Array.isArray(result.actions) ? result.actions : [],
      audit: Array.isArray(result.audit) ? result.audit : [],
    });

    setSelected((current) => {
      if (current) return current;
      return result.invoices?.[0]?.id || '';
    });
  } catch (error: unknown) {
    const detail =
      error instanceof Error ? error.message : String(error);

    setMessage(`Không thể tải Supabase: ${detail}`);
  } finally {
    setLoading(false);
  }
}
  useEffect(()=>{
    // Initial API hydration is intentionally owned by this client dashboard.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  },[]);

  function provider(){
    if(typeof window==='undefined'||!window.CasperWalletProvider)return null;
    const p=window.CasperWalletProvider;
    try{return typeof p==='function'?p():typeof p.getProvider==='function'?p.getProvider():p}catch{return p}
  }
  async function connect(){
    const p=provider(); if(!p){setMessage('Không tìm thấy Casper Wallet extension.');return}
    setWalletState('connecting');
    try{
      if(p.requestConnection)await p.requestConnection(); else if(p.connect)await p.connect();
      const key=p.getActivePublicKey?await p.getActivePublicKey():p.getSelectedPublicKey?await p.getSelectedPublicKey():await p.getPublicKey?.();
      if(!key)throw new Error('Wallet không trả public key.');
      setConnected(key.trim()); setWalletState('connected'); setMessage('Wallet đã kết nối. Quyền cuối cùng vẫn được contract kiểm tra on-chain.');
    }catch(e:any){setWalletState('idle');setMessage(e.message||'Kết nối wallet thất bại.')}
  }
  function disconnect(){ try{provider()?.disconnectFromSite?.()}catch{} setConnected('');setWalletState('idle'); }

  async function upload(file:File){
    setUploading(true); setMessage('Đang đọc PDF thật…');
    try{
      const form=new FormData();form.append('file',file);
      const up=await fetch('/api/invoices/upload',{method:'POST',body:form});const uj=await apiJson(up);
      setMessage(`Đã đọc ${uj.pages} trang. Gemini đang trích xuất JSON…`);
      const ar=await fetch('/api/invoices/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:uj.invoice.id})});const aj=await apiJson(ar);
      await refresh();setSelected(aj.invoice.id);setView('invoices');setMessage(`Hoàn tất: Risk Agent → ${aj.invoice.risk_decision}.`);
    }catch(e:any){setMessage(`Upload thất bại: ${e.message||e}`)}finally{setUploading(false)}
  }

  async function deleteDocument(invoice:Invoice){
    if(!window.confirm('Delete this uploaded document and its local records? This cannot be undone.'))return;
    setDeleting(invoice.id);
    try{
      const response=await fetch(`/api/invoices/${encodeURIComponent(invoice.id)}`,{method:'DELETE'});
      await apiJson(response);
      await refresh();
      setSelected('');
      setMessage('Document deleted.');
    }catch(error){setMessage(error instanceof Error?error.message:String(error))}
    finally{setDeleting('')}
  }

  async function runOnChain(entryPoint:string){
    if(!selectedInvoice||!connected)return setMessage('Hãy chọn invoice và kết nối Casper Wallet.');
    const p=provider();if(!p?.sign)return setMessage('Wallet không hỗ trợ ký deploy.');
    setBusyAction(entryPoint);setMessage('Backend đang dựng deploy từ dữ liệu Supabase…');
    try{
      const br=await fetch('/api/casper/build-record-proof-deploy',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({invoiceId:selectedInvoice.id,accountPublicKey:connected,entryPoint})});
      const bj=await apiJson(br);
      const signed=await p.sign(JSON.stringify(bj.deploy),connected);if(signed?.cancelled)throw new Error('Bạn đã hủy ký.');
      const raw=signed?.signatureHex||signed?.signature;if(!raw)throw new Error('Wallet không trả signature.');
      const signature=raw.startsWith('01')||raw.startsWith('02')?raw:`${connected.slice(0,2)}${raw}`;
      const deploy={...bj.deploy,approvals:[{signer:connected,signature}]};
      const pr=await fetch('/api/casper/put-deploy',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deploy,actionId:bj.actionId})});
      const pj=await apiJson(pr);
      const hash=pj.deployHash||bj.deployHash;setMessage(`Đã gửi ${short(hash)}. Đang chờ execution…`);
      let done:any=null;
      for(let i=0;i<60;i++){const rr=await fetch('/api/casper/execution-result',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deployHash:hash,actionId:bj.actionId})});const rj=await apiJson(rr);if(!rj.pending){done=rj;break}await new Promise(r=>setTimeout(r,5000))}
      if(!done)throw new Error('Hết thời gian chờ; trạng thái local chưa thay đổi.');
      if(!done.success)throw new Error(`Execution bị revert: ${done.errorMessage}`);
      await refresh();setMessage(`Execution thành công tại block ${done.blockHeight}. State đã được đồng bộ từ kết quả chain.`);
    }catch(e:any){setMessage(`Casper: ${e.message||e}`)}finally{setBusyAction('')}
  }

  return <div className="shell">
    <aside className={`side ${mobileNav?'open':''}`}>
      <div className="brand"><div className="brandmark"><Fingerprint size={22}/></div><div><strong>InvoiceOS</strong><span>Casper proof console</span></div><button className="closeNav" onClick={()=>setMobileNav(false)}><X/></button></div>
      <nav>{views.map(([id,label,Icon])=><button key={id} className={view===id?'active':''} onClick={()=>{setView(id);setMobileNav(false)}}><Icon size={18}/><span>{label}</span><ChevronRight size={15}/></button>)}</nav>
      <div className="sideProof"><div className="pulseDot"/><span>Contract V2 live</span><strong>{short(CONTRACT)}</strong><small>{NETWORK} · payment proof only</small></div>
      <div className="sideFoot"><Database size={16}/><span>Supabase persistent storage</span></div>
    </aside>

    <main>
      <header>
        <button className="menu" onClick={()=>setMobileNav(true)}><Menu/></button>
        <div><div className="eyebrow">AI invoice operations</div><h1>{views.find(x=>x[0]===view)?.[1]}</h1></div>
        <div className="headerActions">
          <div className="networkPill"><span/><Network size={15}/>{NETWORK}</div>
          {connected?<button className="walletButton connected" onClick={disconnect}><Wallet size={17}/><span><b>{walletUser?.role||'ON-CHAIN USER'}</b>{short(connected)}</span><LogOut size={15}/></button>:<button className="walletButton" onClick={connect} disabled={walletState==='connecting'}><Wallet size={17}/>{walletState==='connecting'?'Connecting…':'Connect wallet'}</button>}
        </div>
      </header>

      {message&&<div className="toast"><Sparkles size={17}/><span>{message}</span><button onClick={()=>setMessage('')}><X size={15}/></button></div>}
      {loading?<div className="loading"><LoaderCircle className="spin"/>Loading persisted workflow…</div>:<>
        {view==='overview'&&<Overview metrics={metrics} data={data} setView={setView} setSelected={setSelected}/>}
        {view==='invoices'&&<InvoiceWorkspace invoices={filtered} query={query} setQuery={setQuery} selected={selected} setSelected={setSelected} invoice={selectedInvoice} proposal={selectedProposal} actions={data.actions} audit={data.audit} upload={upload} uploading={uploading} connected={!!connected} run={runOnChain} busy={busyAction} deleteDocument={deleteDocument} deleting={deleting}/>}
        {view==='risk'&&<RiskView invoices={data.invoices}/>}
        {view==='chain'&&<ChainView actions={data.actions} audit={data.audit}/>}
      </>}
    </main>
  </div>
}

function Overview({metrics,data,setView,setSelected}:{metrics:DashboardMetrics;data:Data;setView:(v:View)=>void;setSelected:(id:string)=>void}){
  const latest=data.invoices.slice(0,5);
  const queues=buildCommandCenterQueues(data.invoices,data.proposals);
  const openInvoice=(id:string)=>{setSelected(id);setView('invoices')};
  return <div className="pageGrid">
    <section className="hero"><div><div className="heroTag"><Bot size={15}/>Agentic accounts payable</div><h2>From invoice PDF to<br/><em>verifiable proof.</em></h2><p>Gemini extracts facts. The Risk Agent decides. Managers approve. Casper anchors immutable evidence.</p><button onClick={()=>setView('invoices')}>Open invoice workspace <ArrowUpRight size={17}/></button></div><div className="flowCard">
      {[[Upload,'PDF ingestion','Real text extraction'],[Bot,'Gemini JSON','Schema validated'],[Shield,'Risk decision','Deterministic policy'],[Link2,'Casper proof','Execution confirmed']].map(([Icon,title,sub]:any,i)=><div className="flowStep" key={title}><div><Icon size={18}/></div><span><b>{title}</b><small>{sub}</small></span>{i<3&&<ChevronRight/>}</div>)}
    </div></section>
    <section className="metricGrid dashboardMetricGrid"><Metric icon={FileCheck2} label="Total invoices" value={metrics.total}/><Metric icon={CheckCircle2} label="Auto propose" value={metrics.auto} tone="green"/><Metric icon={AlertTriangle} label="Manager review" value={metrics.review} tone="amber"/><Metric icon={ShieldAlert} label="Blocked" value={metrics.blocked} tone="red"/><Metric icon={Activity} label="Pending" value={metrics.pending}/><Metric icon={Check} label="Approved" value={metrics.approved} tone="green"/><Metric icon={Fingerprint} label="Proof anchored" value={metrics.anchored} tone="violet"/><Metric icon={XCircle} label="Rejected" value={metrics.rejected} tone="red"/></section>
    <section className="dashboardSummary">
      <div className="panel amountSummary"><PanelTitle title="Invoice amounts" sub="Currency totals are kept separate"/><AmountTotals label="Total invoice amount" values={metrics.totalAmounts}/><AmountTotals label="Approved invoice amount" values={metrics.approvedAmounts}/><AmountTotals label="Payment proof anchored on Casper" values={metrics.anchoredAmounts}/></div>
      <div className="panel throughputSummary"><PanelTitle title="Processing activity" sub="Based on persisted invoice updates"/><div><span>Processed today</span><b>{metrics.today}</b></div><div><span>Last 7 days</span><b>{metrics.lastSevenDays}</b></div></div>
      <div className="panel rateSummary"><PanelTitle title="Risk Agent decision rates" sub="Share of invoices with a decision"/>{[['AUTO_PROPOSE',metrics.autoRate,'good'],['ESCALATE',metrics.escalateRate,'warn'],['BLOCK',metrics.blockRate,'bad']].map(([label,value,tone])=><div className="rateRow" key={String(label)}><span>{label}</span><b>{value}%</b><div><i className={String(tone)} style={{width:`${value}%`}}/></div></div>)}</div>
    </section>
    <section className="workQueueSection"><PanelTitle title="Operations queues" sub="Live work grouped from persisted invoice and proposal state"/><div className="workQueueGrid">{queues.map(queue=><div className="panel workQueue" key={queue.key}><div className="workQueueHead"><b>{queue.title}</b><span>{queue.description}</span><strong>{queue.invoices.length}</strong></div><div className="workQueueList">{queue.invoices.slice(0,5).map(invoice=><button className="workQueueItem" key={invoice.id} onClick={()=>openInvoice(invoice.id)}><b>{invoice.invoice_number||invoice.original_name}</b><span>{invoice.vendor||'Awaiting extraction'} · {date(invoice.created_at)}</span><strong>{amount(invoice.amount,invoice.currency)}</strong>{['review','blocked'].includes(queue.key)&&invoice.risk_flags?.[0]&&<small>{invoice.risk_flags[0].message}</small>}</button>)}{!queue.invoices.length&&<div className="workQueueEmpty">No invoices in this queue.</div>}</div>{queue.invoices.length>5&&<span className="workQueueMore">+{queue.invoices.length-5} more in Invoice workspace</span>}</div>)}</div></section>
    <section className="panel wide"><PanelTitle title="Recent intelligence" sub="Persisted results from PDF → Gemini → Risk Agent"/><InvoiceRows rows={latest}/></section>
    <section className="panel proofPanel"><div className="proofIcon"><Fingerprint/></div><h3>Contract V2 verified</h3><p>RBAC, duplicate protection and PENDING → APPROVED → PAID state transitions are live on Casper Testnet.</p><div className="proofStat"><span>Contract</span><b>{short(CONTRACT)}</b></div><div className="proofStat"><span>Transfer count</span><b>0 · proof anchoring only</b></div></section>
  </div>
}

function InvoiceWorkspace({invoices,query,setQuery,selected,setSelected,invoice,proposal,actions,audit,upload,uploading,connected,run,busy,deleteDocument,deleting}:any){
  const [generatingReport,setGeneratingReport]=useState(false);
  const [reportError,setReportError]=useState('');
  const state=proposal?.onchain_status||'NOT ON-CHAIN';
  const allowed=invoice?.risk_decision==='AUTO_PROPOSE';
  const preserved=!!invoice&&(!!proposal||!!invoice.proposal_id||!!invoice.deploy_hash||!!invoice.contract_state||['PENDING','APPROVED','REJECTED','PAID'].includes(String(invoice.status||invoice.approval_status||'').toUpperCase()));
  const risk=invoice?buildRiskPresentation(invoice):null;
  const timeline=invoice?buildAuditTimeline(invoice,proposal,actions,audit):[];
  const reportReady=!!invoice&&invoice.ai_status==='COMPLETE'&&['AUTO_PROPOSE','ESCALATE','BLOCK'].includes(invoice.risk_decision)&&['invoice_number','vendor','amount','currency','file_hash'].every(key=>invoice[key]!==null&&invoice[key]!==undefined&&invoice[key]!=='');
  async function downloadAuditReport(){
    if(!invoice||!reportReady)return;setGeneratingReport(true);setReportError('');
    try{const response=await fetch(`/api/invoices/${encodeURIComponent(invoice.id)}/audit-report`,{method:'GET',cache:'no-store'});if(!response.ok){const text=await response.text();let message=`Report request failed (${response.status})`;try{message=JSON.parse(text)?.error||message}catch{/* safe fallback */}throw new Error(message)}const blob=await response.blob();const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=`audit-report-${String(invoice.invoice_number||invoice.id).replace(/[^a-zA-Z0-9._-]/g,'_')}.pdf`;document.body.appendChild(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(url)}catch(error){setReportError(error instanceof Error?error.message:'Could not generate audit report.')}finally{setGeneratingReport(false)}
  }
  return <div className="workspace">
    <section className="panel invoiceList"><div className="toolbar"><label className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search invoices…"/></label><label className={`upload ${uploading?'disabled':''}`}><Upload size={16}/>{uploading?'Processing…':'Upload PDF'}<input type="file" accept="application/pdf" disabled={uploading} onChange={e=>{const f=e.target.files?.[0];if(f)upload(f);e.currentTarget.value=''}}/></label></div>
      <div className="invoiceScroll">{invoices.length?invoices.map((i:Invoice)=><button className={`invoiceItem ${selected===i.id?'selected':''}`} key={i.id} onClick={()=>setSelected(i.id)}><div className="docIcon"><FileText size={18}/></div><div><b>{i.invoice_number||i.original_name}</b><span>{i.vendor||'Awaiting extraction'}</span></div><div className="itemRight"><strong>{amount(i.amount,i.currency)}</strong><Badge value={i.risk_decision||i.ai_status}/></div></button>):<div className="empty"><FileText/><b>No invoices yet</b><span>Upload a real PDF to begin.</span></div>}</div>
    </section>
    <section className="detailColumn">{invoice?<>
      <div className="panel detailHero"><div><div className="eyebrow">Invoice intelligence</div><h2>{invoice.invoice_number||invoice.original_name}</h2><p>{invoice.vendor||'Vendor not extracted'} · {date(invoice.invoice_date)}</p></div><div className="detailHeroActions"><Badge value={invoice.risk_decision||invoice.status}/>{reportReady&&<button className="reportButton" disabled={generatingReport} onClick={downloadAuditReport}>{generatingReport?<LoaderCircle className="spin" size={15}/>:<Download size={15}/>} {generatingReport?'Generating report…':'Generate Audit Report'}</button>}{preserved?<span className="preservedLabel"><Shield size={14}/>On-chain record preserved</span>:<button className="deleteDocument" disabled={deleting===invoice.id} onClick={()=>deleteDocument(invoice)} title="Delete document">{deleting===invoice.id?<LoaderCircle className="spin" size={15}/>:<Trash2 size={15}/>}Delete document</button>}</div></div>
      {reportError&&<div className="errorBox">{reportError}</div>}
      <div className="detailStats"><div><span>Amount</span><b>{amount(invoice.amount,invoice.currency)}</b></div><div><span>Confidence</span><b>{Math.round(Number(invoice.confidence||0)*100)}%</b></div><div><span>Risk score</span><b>{invoice.risk_score??'—'} / 100</b></div><div><span>Recipient</span><b>{short(invoice.recipient_wallet)}</b></div></div>
      <div className="panel"><PanelTitle title="Risk Agent decision" sub="Provider-independent controls, evaluated from persisted facts"/>{risk&&<><div className={`riskDecision ${risk.mode==='TECHNICAL_ERROR'?'technical':''}`}><div className={`riskGauge ${statusTone(risk.decision)}`}><Gauge/><b>{risk.score??'—'}</b></div><div>{risk.decision?<Badge value={risk.decision}/>:<Badge value={risk.mode==='TECHNICAL_ERROR'?'ERROR':'PENDING'}/>}<p>{risk.summary}</p></div></div>
        {risk.flags.length>0&&<div className="reasoningSection"><h4>Decision reasoning</h4>{risk.flags.map(f=><div className="flag" key={f.code}><AlertTriangle size={16}/><span><b>{f.code}<em className={`severity ${f.severity.toLowerCase()}`}>{f.severity}</em></b>{f.message}<small>Evidence: {f.evidence||'No evidence detail persisted'}</small></span></div>)}</div>}
        {risk.passedChecks.length>0&&<div className="reasoningSection"><h4>Checks passed</h4><div className="passedChecks">{risk.passedChecks.map(check=><span key={check}><CheckCircle2 size={14}/>{check}</span>)}</div></div>}
        {!!invoice.missing_fields?.length&&risk.mode==='DECISION'&&<div className="flag"><XCircle size={16}/><span><b>Missing source fields</b>{invoice.missing_fields.join(', ')}</span></div>}
        {risk.recommendation&&<div className={`riskRecommendation ${statusTone(risk.decision)}`}><b>Recommendation</b><span>{risk.recommendation}</span></div>}
        </>}
      </div>
      <div className="panel"><PanelTitle title="Casper state machine" sub="UI updates only after execution success"/><div className="stateTrack">{['LOCAL','PENDING','APPROVED','PAID'].map((s,i)=>{const rank:{[k:string]:number}={NONE:0,'NOT ON-CHAIN':0,PENDING:1,APPROVED:2,PAID:3};const active=i<=(rank[state]??0);return <div className={active?'done':''} key={s}><span>{active?<Check size={14}/>:i+1}</span><b>{s}</b></div>})}</div>
        <div className="chainActions">
          <button disabled={!connected||!allowed||state!=='NOT ON-CHAIN'||!!busy} onClick={()=>run('create_invoice_proposal')}>{busy==='create_invoice_proposal'?<LoaderCircle className="spin"/>:<Link2/>}Create on Casper</button>
          <button disabled={!connected||state!=='PENDING'||!!busy} onClick={()=>run('approve_invoice')}><CheckCircle2/>Approve</button>
          <button className="reject" disabled={!connected||state!=='PENDING'||!!busy} onClick={()=>run('reject_invoice')}><XCircle/>Reject</button>
          <button disabled={!connected||state!=='APPROVED'||!!busy} onClick={()=>run('record_payment_proof')}><Fingerprint/>Anchor proof</button>
        </div>
        {!connected&&<p className="hint"><Wallet size={15}/> Connect an authorized wallet to sign state transitions.</p>}
        {invoice.execution_error&&<div className="errorBox">Last execution failed: {invoice.execution_error}</div>}
        {invoice.deploy_hash&&<a className="deployLink" href={explorer(invoice.deploy_hash)} target="_blank" rel="noreferrer"><Network size={15}/>View latest transaction {short(invoice.deploy_hash)}<ArrowUpRight size={14}/></a>}
      </div>
      <AuditTimeline events={timeline}/>
    </>:<div className="panel empty"><FileText/><b>Select an invoice</b></div>}</section>
  </div>
}

function RiskView({invoices}:{invoices:Invoice[]}){return <div className="riskColumns">{[['AUTO_PROPOSE','Auto propose','Policy checks passed'],['ESCALATE','Manager review','Human decision required'],['BLOCK','Blocked','No proposal / no transaction']].map(([key,title,sub])=><section className="riskLane" key={key}><div className="laneHead"><Badge value={key}/><b>{title}</b><span>{sub}</span><strong>{invoices.filter(i=>i.risk_decision===key).length}</strong></div>{invoices.filter(i=>i.risk_decision===key).map(i=><div className="riskCard" key={i.id}><div><b>{i.invoice_number||i.original_name}</b><span>{i.vendor}</span></div><strong>{amount(i.amount,i.currency)}</strong><div className="score"><span style={{width:`${i.risk_score||0}%`}}/><small>Risk {i.risk_score??'—'}</small></div>{i.risk_flags?.[0]&&<p>{i.risk_flags[0].message}</p>}</div>)}</section>)}</div>}

function ChainView({actions,audit}:{actions:ChainAction[];audit:Audit[]}){return <div className="pageGrid"><section className="panel wide"><PanelTitle title="Blockchain actions" sub="Built, submitted and executed deploys persisted in Supabase"/><div className="tableWrap"><table><thead><tr><th>Action</th><th>Proposal</th><th>Execution</th><th>Block</th><th>Deploy</th><th>Transfers</th></tr></thead><tbody>{actions.map(a=><tr key={a.id}><td><b>{String(a.action).replaceAll('_',' ')}</b></td><td>{short(a.proposal_id)}</td><td><Badge value={a.execution_status}/>{a.error_message&&<small className="tableError">{a.error_message}</small>}</td><td>{a.block_height||'—'}</td><td>{a.deploy_hash?<a href={explorer(a.deploy_hash)} target="_blank" rel="noreferrer">{short(a.deploy_hash)} <ArrowUpRight size={12}/></a>:'—'}</td><td>{transferCount(a.transfers_json)}</td></tr>)}</tbody></table></div></section><section className="panel proofPanel"><div className="proofIcon"><Shield/></div><h3>Truthful settlement claim</h3><p>This application anchors approval and payment-proof evidence. It does not transfer vendor funds or release escrow.</p><div className="proofStat"><span>State meaning</span><b>PAID = proof anchored</b></div></section><section className="panel wide"><PanelTitle title="Audit history" sub="Append-only application events"/><div className="auditList">{audit.map(a=><div key={a.id}><span className="auditDot"/><div><b>{a.event}</b><small>{short(a.proposal_id)} · {date(a.created_at)}</small></div></div>)}</div></section></div>}

function Metric({icon:Icon,label,value,tone='blue'}:any){return <div className={`metricCard ${tone}`}><div><Icon size={18}/></div><span>{label}</span><b>{value}</b></div>}
function AmountTotals({label,values}:{label:string;values:CurrencyTotal[]}){return <div className="amountRow"><span>{label}</span><div>{values.length?values.map(value=><b key={value.currency}>{value.currency==='UNSPECIFIED'?`${value.amount.toLocaleString('en-US')} (currency missing)`:amount(value.amount,value.currency)}</b>):<b>—</b>}</div></div>}
function AuditTimeline({events}:{events:TimelineEvent[]}){return <div className="panel invoiceAudit"><PanelTitle title="Audit Timeline" sub="Persisted local, AI, human and Casper evidence"/><div className="timelineList">{events.length?events.map(item=><div className={`timelineEvent ${item.kind.toLowerCase()}`} key={item.id}><span className="timelineMarker"/><div className="timelineBody"><div className="timelineTitle"><b>{item.name}</b><em>{item.kind.replace('_',' ')}</em><Badge value={item.status}/></div><time>{date(item.timestamp)}</time><div className="timelineMeta">{item.actor&&<span>Actor: {short(item.actor)}</span>}{item.proposalId&&<span>Proposal: {short(item.proposalId)}</span>}{item.blockHeight!=null&&<span>Block: {item.blockHeight}</span>}{item.deployHash&&<a href={explorer(item.deployHash)} target="_blank" rel="noreferrer">Deploy: {short(item.deployHash)} <ArrowUpRight size={11}/></a>}</div>{item.error&&<div className="timelineError">{item.error}</div>}</div></div>):<div className="workQueueEmpty">No persisted audit events for this invoice.</div>}</div></div>}
function Badge({ value }: { value?: string | null }) {
  const label = String(value ?? 'PENDING').replaceAll('_', ' ');

  return (
    <span className={`badge ${statusTone(value)}`}>
      {label}
    </span>
  );
}
function PanelTitle({title,sub}:{title:string;sub:string}){return <div className="panelTitle"><div><h3>{title}</h3><p>{sub}</p></div><Activity size={18}/></div>}
function InvoiceRows({rows}:{rows:Invoice[]}){return <div className="recentRows">{rows.map(i=><div key={i.id}><div className="docIcon"><FileText size={17}/></div><div><b>{i.invoice_number||i.original_name}</b><span>{i.vendor||'Awaiting extraction'} · {date(i.created_at)}</span></div><strong>{amount(i.amount,i.currency)}</strong><Badge value={i.risk_decision||i.ai_status}/></div>)}</div>}
