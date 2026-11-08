import {NextRequest,NextResponse} from 'next/server';
import crypto from 'node:crypto';
import {adminDb} from '@/lib/supabase';
import {currentUser,fail,digest} from '@/lib/server';
export const runtime='nodejs';
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const actor=await currentUser(req);if(!actor||actor.role!=='admin')return fail('Administrator access required',403);
 const {id}=await params;
 const body=await req.json().catch(()=>null);const slot=body?.slot;
 if(slot!==1&&slot!==2)return fail('Manager slot must be 1 or 2');
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(id))return fail('Invalid request identifier');
 const db=adminDb();
 const {data:request,error:requestError}=await db.from('requests').select('id,status,approvals(manager_slot,manager_name,manager_email,decision)').eq('id',id).single();
 if(requestError||!request)return fail('Request not found',404);
 if(request.status!=='pending')return fail('Only pending requests support replacement links',409);
 const approval=request.approvals?.find((a:{manager_slot:number})=>a.manager_slot===slot);
 if(!approval)return fail('Approval slot not found',404);
 if(approval.decision!=='pending')return fail('This manager has already decided',409);
 const base=process.env.APP_BASE_URL;if(!base)return fail('Application URL not configured',503);
 const token=crypto.randomBytes(32).toString('hex');
 const expires=new Date(Date.now()+14*86400000).toISOString();
 const {error}=await db.rpc('rotate_pending_approval_link',{p_request_id:id,p_slot:slot,p_hash:digest(token),p_expires:expires,p_actor:actor.email});
 if(error)return fail('Cannot replace link: '+error.message,409);
 return NextResponse.json({ok:true,slot,name:approval.manager_name,email:approval.manager_email,url:base.replace(/\/$/,'')+'/approve/'+token,expires_at:expires});
}