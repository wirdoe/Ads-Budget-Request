import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {adminDb} from '@/lib/supabase';
import {digest,fail,validPin,notification,safeText} from '@/lib/server';
export const runtime='nodejs';
const schema=z.object({pin:z.string().regex(/^\d{6}$/),decision:z.enum(['approved','rejected']),comment:z.string().max(1000).default('')});
async function lookup(token:string){
 if(!/^[a-f0-9]{64}$/.test(token))return null;
 const {data}=await adminDb().from('approvals').select('*,requests(id,request_no,campaign,department,objective,channels,start_date,end_date,amount,currency,justification,status,created_by)').eq('token_hash',digest(token)).single();
 return data;
}
export async function GET(_req:NextRequest,{params}:{params:Promise<{token:string}>}){
 const {token}=await params;const approval=await lookup(token);if(!approval)return fail('Invalid approval link',404);
 const {manager_name,manager_slot,decision,decided_at,expires_at,requests}=approval;
 return NextResponse.json({approval:{manager_name,manager_slot,decision,decided_at,expires_at},request:requests});
}
export async function POST(req:NextRequest,{params}:{params:Promise<{token:string}>}){
 const {token}=await params;const approval=await lookup(token);if(!approval)return fail('Invalid approval link',404);
 const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return fail('Decision and valid six-digit PIN required');
 const db=adminDb();const now=Date.now();
 if(approval.decision!=='pending'||approval.requests.status!=='pending')return fail('Request is already decided',409);
 if(new Date(approval.expires_at).getTime()<now)return fail('This approval link has expired',410);
 if(approval.locked_until&&new Date(approval.locked_until).getTime()>now)return fail('Too many incorrect attempts. Try again later.',429);
 const {data:manager}=await db.from('managers').select('pin_hash,pin_salt').eq('id',approval.manager_id).single();
 if(!manager)return fail('Manager account unavailable',403);
 if(!validPin(parsed.data.pin,manager.pin_salt,manager.pin_hash)){
  const attempts=approval.locked_until&&new Date(approval.locked_until).getTime()<=now?1:approval.failed_attempts+1;
  await db.from('approvals').update({failed_attempts:attempts,locked_until:attempts>=5?new Date(now+15*60*1000).toISOString():null}).eq('id',approval.id).eq('failed_attempts',approval.failed_attempts);
  return fail('Incorrect PIN',403);
 }
 const {data,error}=await db.rpc('record_approval',{p_approval_id:approval.id,p_decision:parsed.data.decision,p_comment:parsed.data.comment});
 if(error)return fail('Decision could not be recorded. The request may already be finalized.',409);
 const {data:creator}=await db.auth.admin.getUserById(approval.requests.created_by);
 let requesterNotified=false;
 if(creator?.user?.email){const mail=await notification(creator.user.email,`Ads Budget Request #${approval.requests.request_no}: ${data.status}`,`<p>${safeText(approval.manager_name)} has ${parsed.data.decision} request #${approval.requests.request_no}.</p><p>Overall status: ${safeText(data.status)}</p>`);requesterNotified=mail.sent;}
 return NextResponse.json({ok:true,status:data.status,decision:data.decision,requesterNotified});
}
