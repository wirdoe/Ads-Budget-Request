import {NextRequest,NextResponse} from 'next/server';
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
