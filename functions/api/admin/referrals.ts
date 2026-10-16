import { Env, ensureWalletSchema, isAdminTestAccount, json, randomToken, readJson } from "../auth/_shared";
import { getSolUsd } from "../_shared/sol-price";
import { ensureReferralSchema, refreshReferralEligibility } from "../referrals/_shared";

async function ensureBookOfTempleBonusSchema(db:D1Database):Promise<void>{
  await db.prepare(`CREATE TABLE IF NOT EXISTS book_of_ra_real_features (
    user_id TEXT PRIMARY KEY,
    free_spins INTEGER NOT NULL DEFAULT 0,
    free_spin_bet INTEGER NOT NULL DEFAULT 20,
    expanding_symbol TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
  const columns=await db.prepare("PRAGMA table_info(book_of_ra_real_features)").all<{name:string}>();
  const names=new Set((columns.results||[]).map(column=>column.name));
  if(!names.has("bonus_balance_cents"))await db.prepare("ALTER TABLE book_of_ra_real_features ADD COLUMN bonus_balance_cents INTEGER NOT NULL DEFAULT 0").run();
  if(!names.has("bonus_funded_spins"))await db.prepare("ALTER TABLE book_of_ra_real_features ADD COLUMN bonus_funded_spins INTEGER NOT NULL DEFAULT 0").run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS book_of_ra_bonus_grants (
    id TEXT PRIMARY KEY,
    reward_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL CHECK(amount_cents=1000),
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();
}

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
      (SELECT wallet_transaction_id FROM referral_rewards rr WHERE rr.referrer_user_id=u.id ORDER BY rr.created_at DESC LIMIT 1) AS walletTransactionId,
      (SELECT credited_units FROM referral_rewards rr WHERE rr.referrer_user_id=u.id ORDER BY rr.created_at DESC LIMIT 1) AS creditedUnits,
      (SELECT sol_usd_at_credit FROM referral_rewards rr WHERE rr.referrer_user_id=u.id ORDER BY rr.created_at DESC LIMIT 1) AS solUsdAtCredit,
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
  if(!/^[a-f0-9]{32}$/.test(rewardId)||!["approve","paid","reject"].includes(String(action)))return json({error:"Invalid referral reward action."},400);
  try{
    await ensureWalletSchema(env.DB);
    await ensureReferralSchema(env.DB);
    if(action==="paid")await ensureBookOfTempleBonusSchema(env.DB);
    const reward=await env.DB.prepare("SELECT id,referrer_user_id,status,choice,wallet_transaction_id,game_bonus_grant_id FROM referral_rewards WHERE id=? LIMIT 1")
      .bind(rewardId).first<{id:string;referrer_user_id:string;status:string;choice:string|null;wallet_transaction_id:string|null;game_bonus_grant_id:string|null}>();
    if(!reward)return json({error:"Referral reward not found."},404);
    const now=new Date().toISOString();

    if(action==="approve"){
      if(reward.status!=="requested")return json({error:"Only requested rewards can be approved."},409);
      if(reward.choice!=="wallet"&&reward.choice!=="book_of_temple")return json({error:"The reward destination is missing."},409);
      const update=await env.DB.prepare("UPDATE referral_rewards SET status='approved',updated_at=?,admin_note=? WHERE id=? AND status='requested'")
        .bind(now,note||null,rewardId).run();
      if(!update.meta||update.meta.changes!==1)return json({error:"Reward status changed concurrently. Refresh and retry."},409);
      return json({ok:true,status:"approved",message:"Referral reward approved. Wallet rewards can now be credited to the user's SOL wallet; Book of Temple activation is not connected by this endpoint."});
    }

    if(action==="reject"){
      if(reward.status==="paid")return json({error:"A credited reward cannot be rejected; use an audited reversal instead."},409);
      if(!["eligible","requested","approved"].includes(reward.status))return json({error:"This reward can no longer be rejected."},409);
      const update=await env.DB.prepare("UPDATE referral_rewards SET status='rejected',updated_at=?,admin_note=? WHERE id=? AND status IN ('eligible','requested','approved')")
        .bind(now,note||null,rewardId).run();
      if(!update.meta||update.meta.changes!==1)return json({error:"Reward status changed concurrently. Refresh and retry."},409);
      return json({ok:true,status:"rejected",message:"Referral reward rejected. A second reward will not be generated for the same referrer."});
    }

    if(reward.status==="paid"){
      if(reward.choice==="book_of_temple"&&reward.game_bonus_grant_id){
        const grant=await env.DB.prepare("SELECT id,amount_cents FROM book_of_ra_bonus_grants WHERE id=? AND reward_id=? AND user_id=? LIMIT 1")
          .bind(reward.game_bonus_grant_id,rewardId,reward.referrer_user_id).first<{id:string;amount_cents:number}>();
        if(grant)return json({ok:true,alreadyCredited:true,status:"paid",gameBonusGrantId:grant.id,bonusCents:grant.amount_cents,message:"Book of Temple bonus credits were already activated. No second grant was created."});
        return json({error:"Reward is marked paid but its Book of Temple grant is missing. No additional credits were added; inspect the slot bonus ledger."},409);
      }
      const posted=reward.wallet_transaction_id
        ? await env.DB.prepare("SELECT id,amount_units FROM wallet_transactions WHERE id=? AND user_id=? AND kind='adjustment' AND status='confirmed' AND idempotency_key=? LIMIT 1")
            .bind(reward.wallet_transaction_id,reward.referrer_user_id,"referral_reward:"+rewardId).first<{id:string;amount_units:string}>()
        : null;
      if(posted)return json({ok:true,alreadyCredited:true,status:"paid",walletTransactionId:posted.id,creditedUnits:posted.amount_units,message:"This reward is already credited. No second credit was created."});
      return json({error:"Reward is marked paid but its matching confirmed wallet ledger entry is missing. No additional credit was attempted; investigate the ledger."},409);
    }
    if(reward.status!=="approved")return json({error:"Approve the reward request before crediting it to the wallet."},409);
    if(reward.choice==="book_of_temple"){
      if(reward.status!=="approved")return json({error:"Approve the Book of Temple reward request before activating slot credits."},409);
      const grantId="referral_"+rewardId;
      const now=new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO book_of_ra_real_features (user_id,free_spins,free_spin_bet,expanding_symbol,updated_at,bonus_balance_cents,bonus_funded_spins) VALUES (?,0,20,NULL,?,0,0)")
          .bind(reward.referrer_user_id,now),
        env.DB.prepare(`INSERT INTO book_of_ra_bonus_grants (id,reward_id,user_id,amount_cents,created_at)
          SELECT ?,?,?,1000,? WHERE EXISTS(SELECT 1 FROM referral_rewards WHERE id=? AND referrer_user_id=? AND status='approved' AND choice='book_of_temple')
          ON CONFLICT(reward_id) DO NOTHING`)
          .bind(grantId,rewardId,reward.referrer_user_id,now,rewardId,reward.referrer_user_id),
        env.DB.prepare("UPDATE book_of_ra_real_features SET bonus_balance_cents=bonus_balance_cents+1000,updated_at=? WHERE user_id=? AND changes()=1 AND EXISTS(SELECT 1 FROM book_of_ra_bonus_grants WHERE id=? AND reward_id=? AND user_id=?)")
          .bind(now,reward.referrer_user_id,grantId,rewardId,reward.referrer_user_id),
        env.DB.prepare("UPDATE referral_rewards SET status='paid',game_bonus_grant_id=?,credited_units='1000',updated_at=?,admin_note=? WHERE id=? AND referrer_user_id=? AND status='approved' AND choice='book_of_temple' AND changes()=1 AND EXISTS(SELECT 1 FROM book_of_ra_bonus_grants WHERE id=? AND reward_id=? AND user_id=?)")
          .bind(grantId,now,note||"Activated $10 non-withdrawable Book of Temple slot credits",rewardId,reward.referrer_user_id,grantId,rewardId,reward.referrer_user_id)
      ]);
      const [grant,updatedReward,feature]=await Promise.all([
        env.DB.prepare("SELECT id,amount_cents FROM book_of_ra_bonus_grants WHERE id=? AND reward_id=? AND user_id=? LIMIT 1").bind(grantId,rewardId,reward.referrer_user_id).first<{id:string;amount_cents:number}>(),
        env.DB.prepare("SELECT status,game_bonus_grant_id,choice FROM referral_rewards WHERE id=? AND referrer_user_id=? LIMIT 1").bind(rewardId,reward.referrer_user_id).first<{status:string;game_bonus_grant_id:string|null;choice:string|null}>(),
        env.DB.prepare("SELECT bonus_balance_cents FROM book_of_ra_real_features WHERE user_id=? LIMIT 1").bind(reward.referrer_user_id).first<{bonus_balance_cents:number}>()
      ]);
      if(!grant||updatedReward?.status!=="paid"||updatedReward.game_bonus_grant_id!==grantId||updatedReward.choice!=="book_of_temple"||!feature||Number(feature.bonus_balance_cents)<1000)
        return json({error:"The Book of Temple bonus could not be verified after activation. Refresh admin data and inspect the slot bonus ledger before retrying."},409);
      return json({ok:true,status:"paid",credited:true,gameBonusGrantId:grant.id,bonusCents:grant.amount_cents,bonusBalanceCents:feature.bonus_balance_cents,message:"$10 was added to the user's non-withdrawable Book of Temple bonus-credit balance and verified against the slot bonus grant ledger."});
    }
    if(reward.choice!=="wallet")return json({error:"Unknown referral reward destination."},409);
    if(await isAdminTestAccount(env.DB,reward.referrer_user_id))return json({error:"Referral cash rewards cannot be credited to a simulated test account."},403);

    const idempotencyKey="referral_reward:"+rewardId;
    const prior=await env.DB.prepare("SELECT id,amount_units FROM wallet_transactions WHERE user_id=? AND idempotency_key=? LIMIT 1")
      .bind(reward.referrer_user_id,idempotencyKey).first<{id:string;amount_units:string}>();
    if(prior)return json({error:"An idempotent ledger entry already exists but the reward is not marked paid. No second credit was made; inspect the wallet ledger before reconciling."},409);

    const quote=await getSolUsd(env.DB,90_000);
    if(!quote||!Number.isFinite(quote.price)||quote.price<=0)return json({error:"A fresh SOL/USD price is unavailable. No wallet credit was made."},503);
    const lamportsNumber=Math.floor((10/quote.price)*1_000_000_000);
    if(!Number.isSafeInteger(lamportsNumber)||lamportsNumber<=0)return json({error:"The $10 reward cannot be safely converted to SOL units at the current price."},503);
    const amountUnits=BigInt(lamportsNumber).toString();
    const transactionId=randomToken(16);
    const metadata=JSON.stringify({source:"referral_reward",rewardId,usdCents:1000,solUsdAtCredit:quote.price,priceSource:quote.source,priceUpdatedAt:quote.updatedAt,creditedAt:now});
    // One D1 batch makes ledger insert, available-balance increment and reward status
    // atomic. SQLite changes() gates each step on the immediately preceding write,
    // so retries/concurrent admin requests cannot increment the balance twice.
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO wallet_balances (user_id,asset,available_units,reserved_units,updated_at) VALUES (?,'SOL','0','0',?)")
        .bind(reward.referrer_user_id,now),
      env.DB.prepare(`INSERT INTO wallet_transactions (id,user_id,asset,kind,status,amount_units,tx_hash,address,idempotency_key,created_at,updated_at,metadata_json)
        SELECT ?,?,'SOL','adjustment','confirmed',?,NULL,NULL,?,?,?,?
        WHERE EXISTS (SELECT 1 FROM referral_rewards WHERE id=? AND referrer_user_id=? AND status='approved' AND choice='wallet')
        ON CONFLICT(user_id,idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`)
        .bind(transactionId,reward.referrer_user_id,amountUnits,idempotencyKey,now,now,metadata,rewardId,reward.referrer_user_id),
      env.DB.prepare(`UPDATE wallet_balances SET available_units=CAST(available_units AS INTEGER)+?,updated_at=?
        WHERE user_id=? AND asset='SOL' AND changes()=1
          AND EXISTS (SELECT 1 FROM wallet_transactions WHERE id=? AND user_id=? AND idempotency_key=? AND status='confirmed')`)
        .bind(amountUnits,now,reward.referrer_user_id,transactionId,reward.referrer_user_id,idempotencyKey),
      env.DB.prepare(`UPDATE referral_rewards SET status='paid',wallet_transaction_id=?,credited_units=?,sol_usd_at_credit=?,updated_at=?,admin_note=?
        WHERE id=? AND referrer_user_id=? AND status='approved' AND choice='wallet' AND changes()=1
          AND EXISTS (SELECT 1 FROM wallet_transactions WHERE id=? AND user_id=? AND idempotency_key=? AND status='confirmed')`)
        .bind(transactionId,amountUnits,quote.price,now,note||"Credited to available SOL wallet balance",rewardId,reward.referrer_user_id,transactionId,reward.referrer_user_id,idempotencyKey)
    ]);

    // Verify the committed ledger, reward link, and resulting wallet row rather than
    // treating the admin button response as proof of a credit.
    const [posted,updatedReward,balance]=await Promise.all([
      env.DB.prepare("SELECT id,amount_units,status,metadata_json FROM wallet_transactions WHERE id=? AND user_id=? AND kind='adjustment' AND status='confirmed' AND idempotency_key=? LIMIT 1")
        .bind(transactionId,reward.referrer_user_id,idempotencyKey).first<{id:string;amount_units:string;status:string;metadata_json:string|null}>(),
      env.DB.prepare("SELECT status,wallet_transaction_id,credited_units,sol_usd_at_credit FROM referral_rewards WHERE id=? AND referrer_user_id=? LIMIT 1")
        .bind(rewardId,reward.referrer_user_id).first<{status:string;wallet_transaction_id:string|null;credited_units:string|null;sol_usd_at_credit:number|null}>(),
      env.DB.prepare("SELECT available_units,reserved_units FROM wallet_balances WHERE user_id=? AND asset='SOL' LIMIT 1")
        .bind(reward.referrer_user_id).first<{available_units:string;reserved_units:string}>()
    ]);
    if(!posted && updatedReward?.status==="paid" && updatedReward.wallet_transaction_id){
      const alreadyPosted=await env.DB.prepare("SELECT id,amount_units FROM wallet_transactions WHERE id=? AND user_id=? AND kind='adjustment' AND status='confirmed' AND idempotency_key=? LIMIT 1")
        .bind(updatedReward.wallet_transaction_id,reward.referrer_user_id,idempotencyKey).first<{id:string;amount_units:string}>();
      if(alreadyPosted)return json({ok:true,status:"paid",credited:true,alreadyCredited:true,walletTransactionId:alreadyPosted.id,creditedUnits:alreadyPosted.amount_units,message:"This referral reward was credited by a concurrent request and verified in the wallet ledger. No second credit was created."});
    }
    if(!posted||updatedReward?.status!=="paid"||updatedReward.wallet_transaction_id!==transactionId||updatedReward.credited_units!==amountUnits||!balance){
      return json({error:"The wallet credit could not be verified from the committed ledger and balance records. Do not retry blindly; refresh admin data and inspect the referral reward and wallet ledger."},409);
    }
    return json({ok:true,status:"paid",credited:true,alreadyCredited:false,walletTransactionId:posted.id,asset:"SOL",creditedUnits:posted.amount_units,solAmount:(Number(posted.amount_units)/1_000_000_000).toFixed(9),usdValue:10,solUsdAtCredit:updatedReward.sol_usd_at_credit,availableUnits:balance.available_units,reservedUnits:balance.reserved_units,message:"$10 referral reward was credited to the user's available SOL wallet balance and verified against the confirmed wallet ledger. The user can request a withdrawal through the existing manual SOL withdrawal flow."});
  }catch(error){console.error("[MAXWIN admin referrals] Update failed:",error instanceof Error?error.message:String(error));return json({error:"Could not update or credit the referral reward."},500);}
};
