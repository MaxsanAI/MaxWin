import { Env, getUser, json, readJson } from "../auth/_shared";
import { ensureReferralSchema, refreshReferralEligibility } from "./_shared";

export const onRequestGet: PagesFunction<Env> = async ({request,env}) => {
  if (!env.DB) return json({error:"Referral service is not configured."},503);
  const user = await getUser(request,env.DB);
  if (!user) return json({error:"Log in to view your referral program."},401);
  try {
    await ensureReferralSchema(env.DB);
    await refreshReferralEligibility(env.DB,user.id);
    const [total,qualified,rewards] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS count FROM referrals WHERE referrer_user_id=?").bind(user.id).first<{count:number}>(),
      env.DB.prepare(`SELECT COUNT(*) AS count FROM referrals r WHERE r.referrer_user_id=? AND EXISTS (SELECT 1 FROM wallet_transactions t WHERE t.user_id=r.referred_user_id AND t.kind='deposit' AND t.status='confirmed')`).bind(user.id).first<{count:number}>(),
      env.DB.prepare("SELECT id,reward_usd AS rewardUsd,status,choice,wallet_transaction_id AS walletTransactionId,credited_units AS creditedUnits,sol_usd_at_credit AS solUsdAtCredit,created_at AS createdAt,updated_at AS updatedAt FROM referral_rewards WHERE referrer_user_id=? ORDER BY created_at DESC").bind(user.id).all()
    ]);
    return json({username:user.username, referralUrl:new URL("/?ref="+encodeURIComponent(user.username),request.url).toString(),total:Number(total?.count||0),qualified:Number(qualified?.count||0),target:10,rewardUsd:10,rewards:rewards.results||[]});
  } catch (error) {
    console.error("[MAXWIN referrals] Read failed:",error instanceof Error?error.message:String(error));
    return json({error:"Could not load referral status."},500);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({request,env}) => {
  if (!env.DB) return json({error:"Referral service is not configured."},503);
  const user = await getUser(request,env.DB);
  if (!user) return json({error:"Log in to choose your referral reward."},401);
  const body = await readJson(request);
  const rewardId = typeof body?.rewardId==="string"?body.rewardId.trim():"";
  const choice = body?.choice;
  if (!/^[a-f0-9]{32}$/.test(rewardId) || (choice!=="wallet" && choice!=="book_of_temple")) return json({error:"Choose a valid reward and destination."},400);
  try {
    await ensureReferralSchema(env.DB);
    await refreshReferralEligibility(env.DB,user.id);
    const reward = await env.DB.prepare("SELECT id,status FROM referral_rewards WHERE id=? AND referrer_user_id=? LIMIT 1").bind(rewardId,user.id).first<{id:string;status:string}>();
    if (!reward || reward.status!=="eligible") return json({error:"This reward is not available or has already been requested."},409);
    await env.DB.prepare("UPDATE referral_rewards SET status='requested',choice=?,updated_at=? WHERE id=? AND referrer_user_id=? AND status='eligible'")
      .bind(choice,new Date().toISOString(),rewardId,user.id).run();
    return json({ok:true,message:choice==="wallet"?"Wallet reward request submitted for admin review. It is not spendable or withdrawable until approved and credited.":"Book of Temple bonus request submitted for admin review. It will not be playable until the bonus is activated in the game system."});
  } catch (error) {
    console.error("[MAXWIN referrals] Reward request failed:",error instanceof Error?error.message:String(error));
    return json({error:"Could not submit reward request."},500);
  }
};
