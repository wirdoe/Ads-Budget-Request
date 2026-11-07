import {NextRequest,NextResponse} from 'next/server';
import crypto from 'node:crypto';
import {z} from 'zod';
import {adminDb} from '@/lib/supabase';
import {currentUser,fail} from '@/lib/server';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 const actor=await currentUser(req);if(!actor||actor.role!=='admin')return fail('Forbidden',403);
 const db=adminDb();const [{data:profiles,error:pErr},{data:auth,error:aErr}]=await Promise.all([db.from('profiles').select('id,email,role,is_active,created_at').order('created_at',{ascending:false}),db.auth.admin.listUsers({page:1,perPage:1000})]);
 if(pErr||aErr)return fail('Unable to load users',500);
 const users=(profiles||[]).map(p=>({...p,last_sign_in_at:auth.users.find(u=>u.id===p.id)?.last_sign_in_at||null}));
 return NextResponse.json({users});
}
const schema=z.object({email:z.string().email(),role:z.enum(['requestor','admin'])});
export async function POST(req:NextRequest){
 const actor=await currentUser(req);if(!actor||actor.role!=='admin')return fail('Forbidden',403);
 const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return fail('Valid email and role required');
 const db=adminDb();const tempPassword=crypto.randomBytes(18).toString('base64url')+'A9!';
 const {data,error}=await db.auth.admin.createUser({email:parsed.data.email,password:tempPassword,email_confirm:true});
 if(error||!data.user)return fail(error?.message||'Could not create user',400);
 const {error:profileError}=await db.from('profiles').upsert({id:data.user.id,email:parsed.data.email,role:parsed.data.role,is_active:true},{onConflict:'id'});
 if(profileError){await db.auth.admin.deleteUser(data.user.id);return fail('Could not create user profile',500);}
 return NextResponse.json({ok:true,user:{id:data.user.id,email:parsed.data.email,role:parsed.data.role},temporary_password:tempPassword},{status:201});
}