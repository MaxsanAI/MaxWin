import { Env, json, readJson } from "../auth/_shared";
import { ensureReferralSchema, refreshReferralEligibility } from "../referrals/_shared";

async function authorized(request:Request,env:Env):Promise<boolean>{
  const expected=env.MAXWIN_ADMIN_KEY||"", supplied=request.headers.get("X-MAXWIN-ADMIN-KEY")||"";
  if(!expected||expected.length!==supplied.length)return false;
  const a=new TextEncoder().encode(expected),b=new TextEncoder().encode(supplied);let mismatch=0;
  for(let i=0;i<a.length;i++)mismatch|=a[i]^b[i];
  return mismatch===0;
}

export const onRequestGet:PagesFunction<Env>=async({request,env})=>{
  if(!env.DB)return json({error:"Admin database is not configured."},503);
  if(!await authorized(request,env))return json({error:"Unauthorized admin access."},401);
  try{
    await ensureReferralSchema(env.DB);
    await refreshReferralEligibility(env.DB);
    const rows=await env.DB.prepare(`SELECT u.id AS userId,u.username,
      (SELECT COUNT(*) FROM referrals r WHERE r.referrer_user_id=u.id) AS referrals,
      (SELECT COUNT(*) FROM referrals r WHERE r.referrer_user_id=u.id AND EXISTS (SELECT 1 FROM wallet_transactions t WHERE t.user_id=r.referred_user_id AND t.kind='deposit' AND t.status='confirmed')) AS qualified,
      (SELECT status FROM referral_rewards rr WHERE rr.referrer_user_id=u.id ORDER BY rr.created_at DESC LIMIT 1) AS rewardStatus,
      (SELECT choice FROM referral_rewards rr WHERE rr.referrer_user_id=u.id ORDER BY rr.created_at DESC LIMIT 1) AS choice,
      (SELECT id FROM referral_rewards rr WHERE rr.referrer_user_id=u.id ORDER BY rr.created_at DESC LIMIT 1) AS rewardId,
      (SELECT updated_at FROM referral_rewards rr WHERE rr.referrer_user_id=u.id ORDER BY rr.created_at DESC LIMIT 1) AS updatedAt
      FROM users u WHERE EXISTS(SELECT 1 FROM referrals r WHERE r.referrer_user_id=u.id) OR EXISTS(SELECT 1 FROM referral_rewards rr WHERE rr.referrer_user_id=u.id)
      ORDER BY qualified DESC, referrals DESC LIMIT 500`).all();
    const referred=await env.DB.prepare(`SELECT ref.username AS referrerUsername, referred.username AS referredUsername, r.created_at AS registeredAt,
      CASE WHEN EXISTS(SELECT 1 FROM wallet_transactions t WHERE t.user_id=r.referred_user_id AND t.kind='deposit' AND t.status='confirmed') THEN 1 ELSE 0 END AS deposited
      FROM referrals r JOIN users ref ON ref.id=r.referrer_user_id JOIN users referred ON referred.id=r.referred_user_id
      ORDER BY r.created_at DESC LIMIT 1000`).all();
    return json({referrers:rows.results||[],referred:referred.results||[]});
  }catch(error){console.error("[MAXWIN admin referrals] Read failed:",error instanceof Error?error.message:String(error));return json({error:"Could not load referral administration."},500);}
};

export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
  if(!env.DB)return json({error:"Admin database is not configured."},503);
  if(!await authorized(request,env))return json({error:"Unauthorized admin access."},401);
  const body=await readJson(request);
  const rewardId=typeof body?.rewardId==="string"?body.rewardId.trim():"";
  const action=body?.action;
  const note=typeof body?.note==="string"?body.note.trim().slice(0,500):"";
  if(!/^[a-f0-9]{32}$/.test(rewardId)||!["approve","paid","reject"].includes(action))return json({error:"Invalid referral reward action."},400);
  try{
    await ensureReferralSchema(env.DB);
    const reward=await env.DB.prepare("SELECT id,referrer_user_id,status,choice FROM referral_rewards WHERE id=? LIMIT 1").bind(rewardId).first<{id:string;referrer_user_id:string;status:string;choice:string|null}>();
    if(!reward)return json({error:"Referral reward not found."},404);
    const now=new Date().toISOString();
    if(action==="approve"){
      if(reward.status!=="requested")return json({error:"Only requested rewards can be approved."},409);
      await env.DB.prepare("UPDATE referral_rewards SET status='approved',updated_at=?,admin_note=? WHERE id=? AND status='requested'").bind(now,note||null,rewardId).run();
    }else if(action==="paid"){
      if(reward.status!=="approved")return json({error:"Approve the reward before marking it paid."},409);
      // This records the admin's payment confirmation; it deliberately does not fabricate wallet funds.
      await env.DB.prepare("UPDATE referral_rewards SET status='paid',updated_at=?,admin_note=? WHERE id=? AND status='approved'").bind(now,note||null,rewardId).run();
    }else{
      if(reward.status==="paid")return json({error:"A paid reward cannot be rejected."},409);
      await env.DB.prepare("UPDATE referral_rewards SET status='rejected',updated_at=?,admin_note=? WHERE id=? AND status IN ('eligible','requested','approved')").bind(now,note||null,rewardId).run();
    }
    return json({ok:true,message:action==="paid"?"Reward marked paid. This records confirmation only; it does not send funds.":action==="approve"?"Reward approved for manual processing.":"Reward rejected."});
  }catch(error){console.error("[MAXWIN admin referrals] Update failed:",error instanceof Error?error.message:String(error));return json({error:"Could not update referral reward."},500);}
};
