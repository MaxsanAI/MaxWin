import { Env, ensureWalletSchema, json, readJson, randomToken } from "../auth/_shared";
async function authorize(request: Request, env: Env): Promise<boolean> {
  const expected=env.MAXWIN_ADMIN_KEY||"", supplied=request.headers.get("X-MAXWIN-ADMIN-KEY")||"";
  const a=new TextEncoder().encode(expected), b=new TextEncoder().encode(supplied);
  if(!expected||a.length!==b.length)return false;
  let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a[i]^b[i];return mismatch===0;
}
async function ensureSupportSchema(db:D1Database):Promise<void>{
 await db.prepare("CREATE TABLE IF NOT EXISTS support_tickets (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,subject TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('open','in_progress','resolved')),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)").run();
 await db.prepare("CREATE TABLE IF NOT EXISTS support_messages (id TEXT PRIMARY KEY,ticket_id TEXT NOT NULL,sender_type TEXT NOT NULL CHECK(sender_type IN ('user','admin')),sender_user_id TEXT,message TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,FOREIGN KEY(sender_user_id) REFERENCES users(id) ON DELETE SET NULL)").run();
 await db.prepare("CREATE INDEX IF NOT EXISTS idx_support_tickets_user_updated ON support_tickets(user_id,updated_at DESC)").run();
 await db.prepare("CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_created ON support_messages(ticket_id,created_at)").run();
 await db.prepare("CREATE TABLE IF NOT EXISTS support_manual_credits (idempotency_key TEXT PRIMARY KEY,ticket_id TEXT NOT NULL,user_id TEXT NOT NULL,asset TEXT NOT NULL CHECK(asset='SOL'),amount_units TEXT NOT NULL,usd_amount INTEGER NOT NULL,sol_usd REAL NOT NULL,reason TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','applied')),created_at TEXT NOT NULL,applied_at TEXT,FOREIGN KEY(ticket_id) REFERENCES support_tickets(id),FOREIGN KEY(user_id) REFERENCES users(id))").run();
 await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_support_manual_credit_ticket ON support_manual_credits(ticket_id)").run();
}
async function getSolUsd():Promise<number|null>{
 const ps:Array<{url:string;extract:(d:any)=>unknown}>=[
 {url:"https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",extract:d=>d?.solana?.usd},
 {url:"https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT",extract:d=>d?.price},
 {url:"https://api.kraken.com/0/public/Ticker?pair=SOLUSD",extract:d=>{const r=d?.result;if(!r||typeof r!=="object")return null;const p=Object.values(r)[0] as {c?:unknown[]}|undefined;return p?.c?.[0];}}
 ];
 for(const p of ps){try{const r=await fetch(p.url,{headers:{Accept:"application/json"},cf:{cacheTtl:15,cacheEverything:true}});if(!r.ok)continue;const d:unknown=await r.json();const raw=p.extract(d);const n=typeof raw==="number"?raw:typeof raw==="string"?Number(raw):NaN;if(Number.isFinite(n)&&n>0)return n;}catch{/* try next quote source */}}
 return null;
}
export const onRequestGet:PagesFunction<Env>=async({request,env})=>{
 if(!env.DB)return json({error:"Support administration is not configured."},503);
 if(!await authorize(request,env))return json({error:env.MAXWIN_ADMIN_KEY?"Unauthorized admin access.":"Set MAXWIN_ADMIN_KEY in Cloudflare before using Support administration."},401);
 try{await ensureWalletSchema(env.DB);await ensureSupportSchema(env.DB);
 const [tickets,messages,credits]=await Promise.all([
 env.DB.prepare("SELECT t.id,t.user_id AS userId,u.username,u.email,t.subject,t.status,t.created_at AS createdAt,t.updated_at AS updatedAt FROM support_tickets t JOIN users u ON u.id=t.user_id ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,t.updated_at DESC LIMIT 200").all(),
 env.DB.prepare("SELECT id,ticket_id AS ticketId,sender_type AS senderType,message,created_at AS createdAt FROM support_messages ORDER BY created_at ASC LIMIT 3000").all(),
 env.DB.prepare("SELECT idempotency_key AS idempotencyKey,ticket_id AS ticketId,usd_amount AS usdAmount,sol_usd AS solUsd,amount_units AS amountUnits,status,created_at AS createdAt,applied_at AS appliedAt FROM support_manual_credits ORDER BY created_at DESC LIMIT 200").all()
 ]);
 return json({tickets:tickets.results||[],messages:messages.results||[],credits:credits.results||[]});
 }catch(e){console.error("[MAXWIN support admin] Load failed:",e instanceof Error?e.message:String(e));return json({error:"Could not load Support Inbox."},500);}
};
export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
 if(!env.DB)return json({error:"Support administration is not configured."},503);
 if(!await authorize(request,env))return json({error:"Unauthorized admin access."},401);
 const body=await readJson(request);if(!body)return json({error:"Submit a valid admin action."},400);
 const action=body.action,ticketId=typeof body.ticketId==="string"?body.ticketId.trim():"";
 if(!ticketId||ticketId.length>128)return json({error:"A valid ticket ID is required."},400);
 try{
 await ensureWalletSchema(env.DB);await ensureSupportSchema(env.DB);
 const t=await env.DB.prepare("SELECT t.id,t.user_id AS userId,t.subject,t.status,u.username FROM support_tickets t JOIN users u ON u.id=t.user_id WHERE t.id=? LIMIT 1").bind(ticketId).first<{id:string;userId:string;subject:string;status:string;username:string}>();
 if(!t)return json({error:"Support ticket not found."},404);
 const now=new Date().toISOString();
 if(action==="reply"){
 const message=typeof body.message==="string"?body.message.trim():"";
 if(message.length<2||message.length>4000)return json({error:"Reply must be between 2 and 4,000 characters."},400);
 if(t.status==="resolved")return json({error:"Reopen the ticket before replying."},409);
 await env.DB.batch([
 env.DB.prepare("INSERT INTO support_messages(id,ticket_id,sender_type,sender_user_id,message,created_at) VALUES(?,?,'admin',NULL,?,?)").bind(randomToken(16),ticketId,message,now),
 env.DB.prepare("UPDATE support_tickets SET status='in_progress',updated_at=? WHERE id=? AND status!='resolved'").bind(now,ticketId)
 ]);
 return json({ok:true,message:"Reply sent."});
 }
 if(action==="status"){
 const status=body.status;if(status!=="open"&&status!=="in_progress"&&status!=="resolved")return json({error:"Choose a valid ticket status."},400);
 await env.DB.prepare("UPDATE support_tickets SET status=?,updated_at=? WHERE id=?").bind(status,now,ticketId).run();return json({ok:true,status});
 }
 if(action==="credit"){
 const usd=Number(body.usdAmount),reason=typeof body.reason==="string"?body.reason.trim():"",key=typeof body.idempotencyKey==="string"?body.idempotencyKey.trim():"";
 if(!Number.isInteger(usd)||usd<5||usd>500||usd%5!==0)return json({error:"Manual credits must be $5–$500 in $5 increments."},400);
 if(reason.length<5||reason.length>300)return json({error:"Add a clear verification note (5–300 characters)."},400);
 if(!/^[a-f0-9]{32}$/.test(key))return json({error:"Refresh the credit form and try again."},400);
 const existing=await env.DB.prepare("SELECT status,usd_amount AS usdAmount FROM support_manual_credits WHERE idempotency_key=? LIMIT 1").bind(key).first<{status:string;usdAmount:number}>();
 if(existing)return json({ok:true,replayed:true,status:existing.status,usdAmount:existing.usdAmount,message:"This credit request was already recorded; no second credit was applied."});
 const ticketCredit=await env.DB.prepare("SELECT status,usd_amount AS usdAmount FROM support_manual_credits WHERE ticket_id=? LIMIT 1").bind(ticketId).first<{status:string;usdAmount:number}>();
 if(ticketCredit)return json({error:"This support ticket already has a recorded manual credit. Review the wallet ledger before making any further adjustment."},409);
 const solUsd=await getSolUsd();if(!solUsd)return json({error:"Live SOL/USD quote is unavailable. No balance was changed."},503);
 const lamports=Math.ceil(usd/solUsd*1e9);if(!Number.isSafeInteger(lamports)||lamports<=0)return json({error:"Could not safely convert USD to SOL."},503);
 const amountUnits=String(lamports),creditId=randomToken(16),meta=JSON.stringify({source:"support-manual-credit",ticketId,usdAmount:usd,solUsdAtCredit:solUsd,verificationNote:reason,idempotencyKey:key});
 await env.DB.batch([
 env.DB.prepare("INSERT OR IGNORE INTO support_manual_credits(idempotency_key,ticket_id,user_id,asset,amount_units,usd_amount,sol_usd,reason,status,created_at,applied_at) VALUES(?,?,?,'SOL',?,?,?,?,'pending',?,NULL)").bind(key,ticketId,t.userId,amountUnits,usd,solUsd,reason,now),
 env.DB.prepare("INSERT OR IGNORE INTO wallet_balances(user_id,asset,available_units,reserved_units,updated_at) SELECT user_id,'SOL','0','0',? FROM support_manual_credits WHERE idempotency_key=? AND status='pending'").bind(now,key),
 env.DB.prepare("INSERT OR IGNORE INTO wallet_transactions(id,user_id,asset,kind,status,amount_units,tx_hash,address,idempotency_key,created_at,updated_at,metadata_json) SELECT ?,user_id,'SOL','adjustment','confirmed',?,NULL,NULL,?,?,?,? FROM support_manual_credits WHERE idempotency_key=? AND status='pending'").bind(creditId,amountUnits,"support-credit:"+key,now,now,meta,key),
 env.DB.prepare("UPDATE wallet_balances SET available_units=CAST(available_units AS INTEGER)+CAST(? AS INTEGER),updated_at=? WHERE user_id=? AND asset='SOL' AND EXISTS(SELECT 1 FROM support_manual_credits WHERE idempotency_key=? AND status='pending') AND EXISTS(SELECT 1 FROM wallet_transactions WHERE id=? AND user_id=? AND idempotency_key=?)").bind(amountUnits,now,t.userId,key,creditId,t.userId,"support-credit:"+key),
 env.DB.prepare("UPDATE support_manual_credits SET status='applied',applied_at=? WHERE idempotency_key=? AND status='pending' AND EXISTS(SELECT 1 FROM wallet_transactions WHERE id=? AND idempotency_key=?)").bind(now,key,creditId,"support-credit:"+key),
 env.DB.prepare("INSERT INTO support_messages(id,ticket_id,sender_type,sender_user_id,message,created_at) SELECT ?,?,'admin',NULL,?,? WHERE EXISTS(SELECT 1 FROM support_manual_credits WHERE idempotency_key=? AND status='applied')").bind(randomToken(16),ticketId,"Manual account credit: $"+usd+" equivalent in SOL. Verification: "+reason,now,key)
 ]);
 const saved=await env.DB.prepare("SELECT status,usd_amount AS usdAmount,amount_units AS amountUnits,sol_usd AS solUsd FROM support_manual_credits WHERE idempotency_key=? LIMIT 1").bind(key).first<{status:string;usdAmount:number;amountUnits:string;solUsd:number}>();
 if(!saved||saved.status!=="applied")return json({error:"Credit was not confirmed in the ledger. Review the audit trail before retrying."},500);
 return json({ok:true,replayed:false,credit:{usdAmount:saved.usdAmount,asset:"SOL",amountUnits:saved.amountUnits,solUsd:saved.solUsd},message:"Verified support credit recorded in the SOL wallet and transaction ledger."},201);
 }
 return json({error:"Unknown support action."},400);
 }catch(e){console.error("[MAXWIN support admin] Action failed:",e instanceof Error?e.message:String(e));return json({error:"Could not complete the Support Inbox action."},500);}
};