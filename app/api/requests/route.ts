import {NextRequest,NextResponse} from 'next/server';
import crypto from 'node:crypto';
import {z} from 'zod';
import {adminDb} from '@/lib/supabase';
import {currentUser,fail,digest,notification,safeText} from '@/lib/server';
export const runtime='nodejs';
const schema=z.object({campaign:z.string().trim().min(3).max(150),department:z.string().trim().min(2).max(100),objective:z.string().trim().min(10).max(2000),channels:z.string().trim().min(2).max(250),start_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),end_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),amount:z.number().positive().max(100000000),justification:z.string().trim().min(10).max(5000)});
export async function GET(req:NextRequest){
 const user=await currentUser(req);if(!user)return fail('Sign in required',401);
 const db=adminDb();let q=db.from('requests').select('id,request_no,campaign,department,amount,currency,status,created_at,approvals(manager_slot,manager_name,decision,decided_at)').order('created_at',{ascending:false});
 if(user.role!=='admin')q=q.eq('created_by',user.id);
 const {data,error}=await q;return error?fail('Unable to load requests',500):NextResponse.json({requests:data});
}
export async function POST(req:NextRequest){
 const user=await currentUser(req);if(!user)return fail('Sign in required',401);
 const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return fail('Complete all required fields with valid values');
 const payload=parsed.data;if(payload.end_date<payload.start_date)return fail('End date must be on or after start date');
 if(!process.env.APP_BASE_URL)return fail('Application URL is not configured. Contact the administrator.',503);
 const db=adminDb();const {data:managers,error:managersError}=await db.from('managers').select('*').eq('is_active',true).order('slot');
 if(managersError||!managers||managers.length!==2||managers[0].slot!==1||managers[1].slot!==2)return fail('Both managers must be configured by the administrator first',409);
 const {data:request,error}=await db.from('requests').insert({...payload,created_by:user.id,currency:'QAR'}).select('id,request_no').single();
 if(error||!request)return fail('Could not create request',500);
 const base=process.env.APP_BASE_URL!.replace(/\/$/,'');
 const expires=new Date(Date.now()+14*24*60*60*1000).toISOString();
 const links=managers.map(m=>{const token=crypto.randomBytes(32).toString('hex');return {manager:m,token,url:`${base}/approve/${token}`};});
 const {error:approvalError}=await db.from('approvals').insert(links.map(({manager,token})=>({request_id:request.id,manager_id:manager.id,manager_slot:manager.slot,manager_name:manager.full_name,manager_email:manager.email,token_hash:digest(token),expires_at:expires})));
 if(approvalError){await db.from('requests').delete().eq('id',request.id);return fail('Could not initialize approvals',500);}
 await db.from('audit_events').insert({request_id:request.id,actor_type:'requestor',actor_label:user.email,event_type:'submitted'});
 const emailConfigured=Boolean(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM);
 const delivery=await Promise.all(links.map(async ({manager,url})=>({slot:manager.slot,name:manager.full_name,email:manager.email,url, ...(emailConfigured ? await notification(manager.email,`Ads Budget Request #${request.request_no}`,`<p>A new advertising budget request requires your review.</p><p><b>${safeText(payload.campaign)}</b> — QAR ${payload.amount.toFixed(2)}</p><p><a href="${url}">Review request</a></p><p>Use your separately provided six-digit PIN to decide. This link expires in 14 days.</p>`) : {sent:false,reason:'Manual link delivery'})})));
 // Approval URLs are returned only once, to the authenticated request creator. They are never stored as plaintext or exposed in GET requests.
 return NextResponse.json({id:request.id,request_no:request.request_no,delivery},{status:201});
}
