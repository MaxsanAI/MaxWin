import { Env, ensureAuthSchema, json, randomToken, readJson, sha256 } from "../auth/_shared";

async function authorize(request: Request, env: Env): Promise<boolean> {
  const expected=env.MAXWIN_ADMIN_KEY||"", supplied=request.headers.get("X-MAXWIN-ADMIN-KEY")||"";
  if(!expected||expected.length!==supplied.length)return false;
  const a=new TextEncoder().encode(expected),b=new TextEncoder().encode(supplied);let mismatch=0;
  for(let i=0;i<a.length;i++)mismatch|=a[i]^b[i];return mismatch===0;
}

export const onRequestGet: PagesFunction<Env> = async ({request,env}) => {
  if(!env.DB)return json({error:"Database is not configured."},503);
  if(!await authorize(request,env))return json({error:env.MAXWIN_ADMIN_KEY?"Unauthorized admin access.":"Set MAXWIN_ADMIN_KEY in Cloudflare."},401);
  try {
    await ensureAuthSchema(env.DB);
    const users=await env.DB.prepare("SELECT u.id,u.username,u.email,u.created_at AS createdAt,COALESCE(s.account_status,'active') AS accountStatus,COALESCE(s.risk_level,'normal') AS riskLevel,COALESCE(s.bonus_frozen,0) AS bonusFrozen,COALESCE(s.free_spins_frozen,0) AS freeSpinsFrozen,COALESCE(s.admin_note,'') AS adminNote,(SELECT COUNT(*) FROM user_ip_events e WHERE e.user_id=u.id) AS ipEvents,(SELECT COUNT(DISTINCT e.ip_hash) FROM user_ip_events e WHERE e.user_id=u.id) AS uniqueIps,(SELECT e.ip_address FROM user_ip_events e WHERE e.user_id=u.id ORDER BY e.created_at DESC LIMIT 1) AS lastIp,(SELECT e.created_at FROM user_ip_events e WHERE e.user_id=u.id ORDER BY e.created_at DESC LIMIT 1) AS lastSeenAt,(SELECT COUNT(DISTINCT other.user_id) FROM user_ip_events mine JOIN user_ip_events other ON other.ip_hash=mine.ip_hash WHERE mine.user_id=u.id AND other.user_id<>u.id) AS sharedIpAccounts,(SELECT COUNT(*) FROM wallet_transactions t WHERE t.user_id=u.id AND t.kind='deposit' AND t.status='confirmed') AS confirmedDeposits,(SELECT COUNT(*) FROM withdrawal_requests w WHERE w.user_id=u.id) AS withdrawalRequests FROM users u LEFT JOIN user_security s ON s.user_id=u.id ORDER BY u.created_at DESC LIMIT 500").all();
    const ipGroups=await env.DB.prepare("SELECT e.ip_hash AS ipHash,e.ip_address AS ipAddress,COUNT(DISTINCT e.user_id) AS accountCount,GROUP_CONCAT(DISTINCT u.username) AS usernames,MAX(e.created_at) AS lastSeenAt FROM user_ip_events e JOIN users u ON u.id=e.user_id GROUP BY e.ip_hash,e.ip_address HAVING COUNT(DISTINCT e.user_id)>1 ORDER BY accountCount DESC,lastSeenAt DESC LIMIT 200").all();
    const audits=await env.DB.prepare("SELECT a.id,a.user_id AS userId,u.username,a.action,a.details,a.created_at AS createdAt FROM admin_user_audit a JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 100").all();
    const stats=await env.DB.prepare("SELECT COUNT(*) AS users,SUM(CASE WHEN COALESCE(s.account_status,'active')='suspended' THEN 1 ELSE 0 END) AS suspended,SUM(CASE WHEN COALESCE(s.risk_level,'normal') IN ('review','high') THEN 1 ELSE 0 END) AS flagged,SUM(CASE WHEN COALESCE(s.bonus_frozen,0)=1 THEN 1 ELSE 0 END) AS bonusFrozen,SUM(CASE WHEN COALESCE(s.free_spins_frozen,0)=1 THEN 1 ELSE 0 END) AS spinsFrozen FROM users u LEFT JOIN user_security s ON s.user_id=u.id").first();
    return json({users:users.results||[],ipGroups:ipGroups.results||[],audits:audits.results||[],stats:stats||{}});
  } catch(e) { console.error("[MAXWIN admin users] GET failed:",e instanceof Error?e.message:String(e));return json({error:"Could not load user risk controls."},500); }
};

export const onRequestPost: PagesFunction<Env> = async ({request,env}) => {
  if(!env.DB)return json({error:"Database is not configured."},503);
  if(!await authorize(request,env))return json({error:"Unauthorized admin access."},401);
  const body=await readJson(request),userId=typeof body?.userId==="string"?body.userId.trim():"",action=typeof body?.action==="string"?body.action:"",note=typeof body?.note==="string"?body.note.slice(0,2000):"",riskLevel=typeof body?.riskLevel==="string"?body.riskLevel:"";
  if(!userId||userId.length>100)return json({error:"Choose a valid user."},400);
  const allowed=["suspend","activate","freeze_bonus","unfreeze_bonus","freeze_spins","unfreeze_spins","set_risk","save_note","revoke_sessions"];
  if(!allowed.includes(action))return json({error:"Unsupported user action."},400);
  if(action==="set_risk"&&!["normal","review","high"].includes(riskLevel))return json({error:"Invalid risk level."},400);
  try {
    await ensureAuthSchema(env.DB);
    const user=await env.DB.prepare("SELECT id FROM users WHERE id=? LIMIT 1").bind(userId).first<{id:string}>();if(!user)return json({error:"User not found."},404);
    const now=new Date().toISOString();await env.DB.prepare("INSERT OR IGNORE INTO user_security (user_id,updated_at) VALUES (?,?)").bind(userId,now).run();
    let details="";
    if(action==="suspend"||action==="activate"){const status=action==="suspend"?"suspended":"active";await env.DB.prepare("UPDATE user_security SET account_status=?,updated_at=? WHERE user_id=?").bind(status,now,userId).run();if(action==="suspend")await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(userId).run();details="Account status: "+status+(note?"; reason: "+note:"");}
    else if(action==="freeze_bonus"||action==="unfreeze_bonus"){const frozen=action==="freeze_bonus"?1:0;await env.DB.prepare("UPDATE user_security SET bonus_frozen=?,updated_at=? WHERE user_id=?").bind(frozen,now,userId).run();details="Bonus claims "+(frozen?"frozen":"unfrozen");}
    else if(action==="freeze_spins"||action==="unfreeze_spins"){const frozen=action==="freeze_spins"?1:0;await env.DB.prepare("UPDATE user_security SET free_spins_frozen=?,updated_at=? WHERE user_id=?").bind(frozen,now,userId).run();details="Free spins "+(frozen?"frozen":"unfrozen");}
    else if(action==="set_risk"){await env.DB.prepare("UPDATE user_security SET risk_level=?,updated_at=? WHERE user_id=?").bind(riskLevel,now,userId).run();details="Risk level: "+riskLevel+(note?"; "+note:"");}
    else if(action==="save_note"){await env.DB.prepare("UPDATE user_security SET admin_note=?,updated_at=? WHERE user_id=?").bind(note,now,userId).run();details="Admin note updated";}
    else if(action==="revoke_sessions"){await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(userId).run();details="All active sessions revoked";}
    await env.DB.prepare("INSERT INTO admin_user_audit (id,user_id,action,details,admin_key_fingerprint,created_at) VALUES (?,?,?,?,?,?)").bind(randomToken(12),userId,action,details,(await sha256(env.MAXWIN_ADMIN_KEY||"")).slice(0,16),now).run();
    return json({ok:true,message:details});
  } catch(e) {console.error("[MAXWIN admin users] POST failed:",e instanceof Error?e.message:String(e));return json({error:"Could not apply user action."},500);}
};