import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {adminDb} from '@/lib/supabase';
import {currentUser,fail} from '@/lib/server';
export const runtime='nodejs';
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const actor=await currentUser(req);if(!actor||actor.role!=='admin')return fail('Forbidden',403);
 const {id}=await params;if(id===actor.id)return fail('You cannot deactivate or demote your own account',400);
 const parsed=z.object({role:z.enum(['requestor','admin']).optional(),is_active:z.boolean().optional()}).refine(v=>v.role!==undefined||v.is_active!==undefined).safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return fail('A valid role or active status is required');
 const db=adminDb();const {data:profile,error}=await db.from('profiles').select('id,email,role,is_active').eq('id',id).single();
 if(error||!profile)return fail('User not found',404);
 const updates={...parsed.data};const {error:updateError}=await db.from('profiles').update(updates).eq('id',id);
 if(updateError)return fail('Could not update user',500);
 if(parsed.data.is_active===false)await db.auth.admin.signOut(id,'global');
 return NextResponse.json({ok:true});
}