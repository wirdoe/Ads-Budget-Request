import {NextRequest,NextResponse} from 'next/server';
import {adminDb} from '@/lib/supabase';
import {currentUser,fail} from '@/lib/server';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 const actor=await currentUser(req);if(!actor||actor.role!=='admin')return fail('Forbidden',403);
 const from=req.nextUrl.searchParams.get('from'),to=req.nextUrl.searchParams.get('to');
 const db=adminDb();let q=db.from('requests').select('id,request_no,campaign,department,amount,currency,status,created_at,finalized_at,approvals(manager_slot,manager_name,decision,decided_at)').order('created_at',{ascending:false});
 if(from&&/^\d{4}-\d{2}-\d{2}$/.test(from))q=q.gte('created_at',from+'T00:00:00.000Z');
 if(to&&/^\d{4}-\d{2}-\d{2}$/.test(to))q=q.lt('created_at',new Date(new Date(to+'T00:00:00Z').getTime()+86400000).toISOString());
 const {data,error}=await q;if(error)return fail('Unable to generate report',500);
 const rows=data||[];const sum=(s:string)=>rows.filter(r=>r.status===s).reduce((n,r)=>n+Number(r.amount),0);
 return NextResponse.json({rows,summary:{count:rows.length,total:rows.reduce((n,r)=>n+Number(r.amount),0),pending:sum('pending'),approved:sum('approved'),rejected:sum('rejected'),approved_count:rows.filter(r=>r.status==='approved').length,pending_count:rows.filter(r=>r.status==='pending').length,rejected_count:rows.filter(r=>r.status==='rejected').length}});
}