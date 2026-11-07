import {NextRequest,NextResponse} from 'next/server';
import crypto from 'node:crypto';
import {z} from 'zod';
import {currentUser,fail} from '@/lib/server';
import {adminDb} from '@/lib/supabase';
export const runtime='nodejs';
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const user=await currentUser(req);if(!user)return fail('Sign in required',401);
 const {id}=await params;const db=adminDb();const {data,error}=await db.from('requests').select('*,approvals(manager_slot,manager_name,manager_email,decision,decided_at,comment,expires_at)').eq('id',id).single();
 if(error||!data)return fail('Not found',404);
 if(data.created_by!==user.id&&user.role!=='admin')return fail('Forbidden',403);
 const {data:events}=await db.from('audit_events').select('actor_type,actor_label,event_type,created_at,details').eq('request_id',id).order('created_at',{ascending:true});
 return NextResponse.json({request:data,events:events||[]});
}

const amendSchema=z.object({campaign:z.string().trim().min(3).max(150),department:z.string().trim().min(2).max(100),objective:z.string().trim().min(10).max(2000),channels:z.string().trim().min(2).max(250),start_date:z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/),end_date:z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/),amount:z.number().positive().max(100000000),justification:z.string().trim().min(10).max(5000)});
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const user=await currentUser(req);if(!user||user.role!=='admin')return fail('Administrator access required',403);
 const {id}=await params;const parsed=amendSchema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return fail('Complete all required fields with valid values');
 const payload=parsed.data;if(payload.end_date<payload.start_date)return fail('End date must be on or after start date');
 const db=adminDb();const {data:managers,error}=await db.from('managers').select('id,slot,full_name,email').eq('is_active',true).order('slot');
 if(error||!managers||managers.length!==2||managers[0].slot!==1||managers[1].slot!==2)return fail('Both active manager slots must be configured',409);
 const base=process.env.APP_BASE_URL;if(!base)return fail('Application URL is not configured',503);
 const expires=new Date(Date.now()+14*24*60*60*1000).toISOString();
 const links=managers.map(m=>{const token=crypto.randomBytes(32).toString('hex');return {manager_slot:m.slot,manager_id:m.id,manager_name:m.full_name,manager_email:m.email,token_hash:crypto.createHash('sha256').update(token).digest('hex'),expires_at:expires,url:base.replace(/\/$/,'')+'/approve/'+token};});
 const {error:rpcError}=await db.rpc('admin_amend_request',{p_request_id:id,p_campaign:payload.campaign,p_department:payload.department,p_objective:payload.objective,p_channels:payload.channels,p_start_date:payload.start_date,p_end_date:payload.end_date,p_amount:payload.amount,p_justification:payload.justification,p_approvals:links.map(({url,...x})=>x),p_actor:user.email});
 if(rpcError)return fail(rpcError.message.includes('Only pending')?'Only pending requests can be amended': 'Could not amend request',409);
 return NextResponse.json({ok:true,delivery:links.map(x=>({slot:x.manager_slot,name:x.manager_name,email:x.manager_email,url:x.url}))});
}
