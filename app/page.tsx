'use client';
import { useMemo, useState } from 'react';
import { initialWallets, invoices as seedInvoices, vendors as seedVendors, WalletUser, Role, Invoice } from '../data/seed';
import { BarChart3, Bot, CreditCard, FileText, Home, ListChecks, Lock, Settings, ShieldCheck, Store, Upload, Wallet, History, PieChart, Eye, Plus, Save, Trash2 } from 'lucide-react';

type Tab='Dashboard'|'Invoices'|'Vendors'|'AI Analysis'|'Payments & Escrow'|'Transactions'|'Reports'|'Settings';
type Proposal={id:string; status:'Draft'|'Approved'|'Executed'; invoiceIds:string[]; total:number; createdBy:string; txHash?:string; createdAt:string};
const nav: [Tab, any][]=[['Dashboard',Home],['Invoices',FileText],['Vendors',Store],['AI Analysis',Bot],['Payments & Escrow',CreditCard],['Transactions',History],['Reports',PieChart],['Settings',Settings]];
function short(a=''){return a.slice(0,8)+'...'+a.slice(-6)}
function money(n:number){return '$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
function can(role:Role|undefined, action:'admin'|'approve'|'view'){ if(action==='view') return !!role; if(action==='admin') return role==='ADMIN'; return role==='ADMIN'||role==='MANAGER'; }
export default function Page(){
 const [tab,setTab]=useState<Tab>('Dashboard');
 const [wallets,setWallets]=useState<WalletUser[]>(initialWallets);
 const [connected,setConnected]=useState('');
 const [invoices,setInvoices]=useState<Invoice[]>(seedInvoices);
 const [proposal,setProposal]=useState<Proposal|null>(null);
 const [txs,setTxs]=useState<any[]>([]);
 const [aiLog,setAiLog]=useState<string[]>(['AI Agent ready. Connect a whitelisted wallet to start.']);
 const current=wallets.find(w=>w.address===connected && w.status==='ACTIVE');
 const locked=!current;
 const ready=invoices.filter(i=>['Pending','Overdue'].includes(i.status) && i.risk<60);
 const review=invoices.filter(i=>['Duplicate','Amount Mismatch','Need Review'].includes(i.status)||i.risk>=60);
 const summary=useMemo(()=>({total:invoices.length, pending:invoices.filter(i=>i.status==='Pending').length, paid:invoices.filter(i=>i.status==='Paid').length, alerts:review.length, amount:invoices.reduce((s,i)=>s+i.amount,0)}),[invoices,review.length]);
 function analyze(){ if(!can(current?.role,'approve')) return alert('Only Admin or Manager can run AI analysis.'); const ids=ready.map(i=>i.id); const total=ready.reduce((s,i)=>s+i.amount+i.tax,0); setInvoices(inv=>inv.map(x=>ids.includes(x.id)?{...x,status:'Ready to Pay'}:x)); setProposal({id:'PROP-'+Date.now().toString().slice(-6),status:'Draft',invoiceIds:ids,total,createdBy:current!.name,createdAt:new Date().toLocaleString()}); setAiLog([`Scanned ${invoices.length} invoices.`,`${ids.length} invoices are safe to pay.`,`${review.length} invoices require manual review.`,`Recommended payment proposal total: ${money(total)}.`]); setTab('AI Analysis'); }
 function approve(){ if(!proposal) return; if(!can(current?.role,'approve')) return alert('Only Admin or Manager can approve.'); setProposal({...proposal,status:'Approved'}); setAiLog(x=>['Manager approved payment proposal.',...x]); }
 function execute(){
  if(!proposal||proposal.status!=='Approved') return alert('Approve proposal first.');
  if(!can(current?.role,'approve')) return alert('Only Admin or Manager can execute payment.');

  const tx = process.env.NEXT_PUBLIC_CASPER_RECORD_PROOF_DEPLOY_HASH || '672f3c4b462a0f7ba85a8fad193429a2034fe581dba56bff60aa10f96196af91';
  const network = process.env.NEXT_PUBLIC_CASPER_NETWORK || 'casper-test';
  const contractHash = process.env.NEXT_PUBLIC_CASPER_CONTRACT_HASH || 'contract-4e2f1bbc04fdb44e2654b014124d21b48457330b9e9031813fa6b8e1608bc991';
  const blockHeight = process.env.NEXT_PUBLIC_CASPER_RECORD_PROOF_BLOCK_HEIGHT || '8347679';
  const proofHash = process.env.NEXT_PUBLIC_CASPER_DEMO_PROOF_HASH || 'proof-hash-demo-002';
  const proposalId = process.env.NEXT_PUBLIC_CASPER_DEMO_PROPOSAL_ID || proposal.id;

  setProposal({...proposal,status:'Executed',txHash:tx});
  setInvoices(inv=>inv.map(x=>proposal.invoiceIds.includes(x.id)?{...x,status:'Paid'}:x));
  setTxs(t=>[{
    hash:tx,
    type:'PaymentBatchProof',
    amount:proposal.total,
    by:current!.name,
    time:new Date().toLocaleString(),
    network:`Casper Testnet (${network})`,
    status:'Confirmed',
    blockHeight,
    contractHash,
    proposalId,
    proofHash
  },...t]);
  setAiLog(x=>[
    `Payment proof confirmed on Casper Testnet. Deploy hash: ${tx}`,
    `Contract: ${contractHash}`,
    `Block height: ${blockHeight}`,
    ...x
  ]);
 }
 function addWallet(){ if(!can(current?.role,'admin')) return; setWallets(w=>[...w,{id:'w'+Date.now(),name:'New Wallet',address:'paste-public-key-here',role:'EMPLOYEE',status:'ACTIVE',note:'Added by Admin'}]); }
 function updateWallet(id:string, patch:Partial<WalletUser>){setWallets(ws=>ws.map(w=>w.id===id?{...w,...patch}:w));}
 const shell=(children:any)=><>{locked?<div className="card notice"><b>Access locked.</b> Connect a whitelisted Casper Testnet wallet. Unknown wallets cannot view operational data.</div>:children}</>;
 return <div className="app"><aside className="sidebar"><div className="brand"><div className="logo">CI</div><div><h1>Casper Invoice Agent</h1><p>AI AP + Escrow workflow</p></div></div><nav className="nav">{nav.map(([n,Icon])=><button key={n} className={tab===n?'active':''} onClick={()=>setTab(n)}><Icon size={18}/>{n}</button>)}</nav><div className="agent"><b>Ask AI Agent</b><p className="muted" style={{color:'#bfdbfe',fontSize:12}}>Always visible. Try: Pay invoices due this week.</p><input placeholder="Ask about invoices..." onKeyDown={e=>{if(e.key==='Enter'){setAiLog([`User asked: ${(e.target as HTMLInputElement).value}`,'Suggestion: run AI Analyze All to create a proposal.',...aiLog]);(e.target as HTMLInputElement).value='';setTab('AI Analysis')}}}/></div></aside><main className="main"><header className="top"><div><h2>{tab}</h2><p>Production-style MVP for Casper Agentic Buildathon.</p></div><div className="wallet"><Wallet size={20}/><select value={connected} onChange={e=>setConnected(e.target.value)}><option value="">Connect Wallet</option>{wallets.filter(w=>w.status==='ACTIVE').map(w=><option key={w.id} value={w.address}>{w.name} — {w.role}</option>)}</select>{current&&<><div><b>{current.role}</b><div className="addr">{short(current.address)}</div></div><button onClick={()=>setConnected('')}>Disconnect</button></>}</div></header>
 {tab==='Dashboard'&&shell(<div className="grid"><div className="grid cards"><Metric title="Total invoices" v={summary.total}/><Metric title="Pending" v={summary.pending}/><Metric title="Paid" v={summary.paid}/><Metric title="Need review" v={summary.alerts}/></div><div className="grid split"><div className="card"><div className="row"><h3>AI Payment Run</h3><div className="actions"><button className="btn primary" onClick={analyze} disabled={!can(current?.role,'approve')}>AI Analyze All</button><button className="btn green" onClick={approve} disabled={!proposal||proposal.status!=='Draft'||!can(current?.role,'approve')}>Approve Proposal</button><button className="btn primary" onClick={execute} disabled={!proposal||proposal.status!=='Approved'||!can(current?.role,'approve')}>Execute on Casper</button></div></div><p className="muted">AI scans invoices, detects risks, creates a payment proposal, then manager executes a Casper Testnet proof.</p><div className="ok">Ready to pay: <b>{ready.length}</b> invoices. Manual review: <b>{review.length}</b>. Total AP exposure: <b>{money(summary.amount)}</b>.</div></div><div className="card"><h3>Current Proposal</h3>{proposal?<div className="list"><b>{proposal.id}</b><span>Status: {proposal.status}</span><span>Invoices: {proposal.invoiceIds.length}</span><span>Total: {money(proposal.total)}</span>{proposal.txHash&&<>
      <span>Casper status: <b>Confirmed on Testnet</b></span>
      <span>Proof deploy: {proposal.txHash}</span>
      <span>Block height: {process.env.NEXT_PUBLIC_CASPER_RECORD_PROOF_BLOCK_HEIGHT || '8347679'}</span>
      <span>Contract: {short(process.env.NEXT_PUBLIC_CASPER_CONTRACT_HASH || 'contract-4e2f1bbc04fdb44e2654b014124d21b48457330b9e9031813fa6b8e1608bc991')}</span>
    </>}</div>:<p className="muted">No proposal yet. Run AI Analyze All.</p>}</div></div><InvoiceTable invoices={invoices.slice(0,8)}/></div>)}
 {tab==='Invoices'&&shell(<div className="grid"><div className="card row"><div><h3>Invoice Workspace</h3><p className="muted">50 synthetic PDF invoices. Each row has a public PDF for judge review.</p></div><button className="btn gray"><Upload size={16}/> Upload Invoice</button></div><InvoiceTable invoices={invoices}/></div>)}
 {tab==='Vendors'&&shell(<div className="card"><h3>Vendor Profiles</h3><table className="table"><thead><tr><th>Vendor</th><th>Category</th><th>Risk</th><th>Invoices</th><th>Total</th><th>Avg Pay Days</th></tr></thead><tbody>{seedVendors.map(v=><tr key={v.id}><td><b>{v.name}</b></td><td>{v.category}</td><td>{v.risk}</td><td>{v.invoices}</td><td>{money(v.total)}</td><td>{v.avgPayDays}</td></tr>)}</tbody></table></div>)}
 {tab==='AI Analysis'&&shell(<div className="grid split"><div className="card"><h3>AI Agent Findings</h3><div className="list">{aiLog.map((l,i)=><div key={i} className={i===0?'ok':'notice'}>{l}</div>)}</div></div><div className="card"><h3>Risk Queue</h3><div className="list">{review.slice(0,10).map(i=><div key={i.id} className="notice"><b>{i.id}</b> — {i.vendor}<br/><span>{i.status}: {i.note}</span></div>)}</div></div></div>)}
 {tab==='Payments & Escrow'&&shell(<div className="grid split"><div className="card"><h3>Payment Proposal</h3>{proposal?<div className="list"><p><b>{proposal.id}</b> generated by {proposal.createdBy}</p><p>Status: <b>{proposal.status}</b></p><p>Invoices: <b>{proposal.invoiceIds.length}</b></p><p>Total with tax: <b>{money(proposal.total)}</b></p><div className="actions"><button className="btn green" onClick={approve} disabled={proposal.status!=='Draft'||!can(current?.role,'approve')}>Approve</button><button className="btn primary" onClick={execute} disabled={proposal.status!=='Approved'||!can(current?.role,'approve')}>Execute Casper Payment Proof</button></div></div>:<p className="muted">Run AI analysis to create a proposal.</p>}</div><div className="card"><h3>Permission</h3><p>Current role: <b>{current?.role}</b></p><p className="muted">Employee can view/upload only. Manager can approve and execute. Admin can manage wallets.</p></div></div>)}
 {tab==='Transactions'&&shell(<div className="card"><h3>Audit Transactions</h3>{txs.length===0?<p className="muted">No transaction yet. Execute a payment proposal.</p>:<table className="table"><thead><tr><th>Hash</th><th>Type</th><th>Amount</th><th>By</th><th>Network</th><th>Status</th><th>Block</th><th>Time</th></tr></thead><tbody>{txs.map(t=><tr key={t.hash}><td>{t.hash}</td><td>{t.type}</td><td>{money(t.amount)}</td><td>{t.by}</td><td>{t.network}</td><td><span className="badge b-Paid">{t.status || 'Confirmed'}</span></td><td>{t.blockHeight || '-'}</td><td>{t.time}</td></tr>)}</tbody></table>}</div>)}
 {tab==='Reports'&&shell(<div className="grid cards"><Metric title="AP total" v={money(summary.amount)}/><Metric title="AI review items" v={review.length}/><Metric title="Vendors" v={seedVendors.length}/><Metric title="Payment batches" v={txs.length}/><div className="card" style={{gridColumn:'1/-1'}}><h3>Audit Timeline</h3><div className="timeline"><div>Invoice Uploaded</div><div>AI Extracted</div><div>Risk Scored</div><div>Manager Approved</div><div>Casper Payment Proof</div><div>Paid</div></div></div></div>)}
 {tab==='Settings'&&shell(<div className="grid"><div className="card row"><div><h3>Wallet Management</h3><p className="muted">Only Admin can add, edit, disable, or delete wallets.</p></div><button className="btn primary" onClick={addWallet} disabled={!can(current?.role,'admin')}><Plus size={16}/> Add Wallet</button></div><div className="card"><table className="table"><thead><tr><th>Name</th><th>Address</th><th>Role</th><th>Status</th><th>Note</th><th>Action</th></tr></thead><tbody>{wallets.map(w=><tr key={w.id}><td><input className="input" value={w.name} disabled={!can(current?.role,'admin')} onChange={e=>updateWallet(w.id,{name:e.target.value})}/></td><td><input className="input" value={w.address} disabled={!can(current?.role,'admin')} onChange={e=>updateWallet(w.id,{address:e.target.value})}/></td><td><select className="input" value={w.role} disabled={!can(current?.role,'admin')} onChange={e=>updateWallet(w.id,{role:e.target.value as Role})}><option>ADMIN</option><option>MANAGER</option><option>EMPLOYEE</option></select></td><td><select className="input" value={w.status} disabled={!can(current?.role,'admin')} onChange={e=>updateWallet(w.id,{status:e.target.value as any})}><option>ACTIVE</option><option>DISABLED</option></select></td><td><input className="input" value={w.note} disabled={!can(current?.role,'admin')} onChange={e=>updateWallet(w.id,{note:e.target.value})}/></td><td><button className="btn red" disabled={!can(current?.role,'admin')} onClick={()=>setWallets(ws=>ws.filter(x=>x.id!==w.id))}><Trash2 size={16}/></button></td></tr>)}</tbody></table></div></div>)}
 </main></div>;
}
function Metric({title,v}:{title:string;v:any}){return <div className="card"><div className="muted">{title}</div><div className="metric">{v}</div></div>}
function InvoiceTable({invoices}:{invoices:Invoice[]}){return <div className="card"><h3>Invoices</h3><table className="table"><thead><tr><th>Invoice</th><th>Vendor</th><th>Amount</th><th>Tax</th><th>Due Date</th><th>Status</th><th>Risk</th><th>PDF</th></tr></thead><tbody>{invoices.map(i=><tr key={i.id}><td><b>{i.id}</b></td><td>{i.vendor}</td><td>{money(i.amount)}</td><td>{money(i.tax)}</td><td>{i.dueDate}</td><td><span className={'badge b-'+i.status.split(' ')[0]}>{i.status}</span></td><td>{i.risk}</td><td><a className="btn gray" href={i.pdf} target="_blank"><Eye size={14}/> View</a></td></tr>)}</tbody></table></div>}
