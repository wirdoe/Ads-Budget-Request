import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {adminDb} from '@/lib/supabase';
import {currentUser,fail,freshPinHash} from '@/lib/server';
export const runtime='nodejs';
const schema=z.object({slot:z.number().int().min(1).max(2),full_name:z.string().trim().min(2).max(100),email:z.string().email(),pin:z.string().regex(/^\d{6}$/)});
export async function GET(req:NextRequest) {
 const user=await currentUser(req);if(!user||user.role!=='admin')return fail('Forbidden',403);
 const {data,error}=await adminDb().from('managers').select('id,slot,full_name,email,is_active').eq('is_active',true).order('slot');
 return error?fail('Failed to load managers',500):NextResponse.json({managers:data});
}
export async function POST(req:NextRequest){
 const user=await currentUser(req);if(!user||user.role!=='admin')return fail('Forbidden',403);
 const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return fail('Valid name, email and six-digit PIN required');
 const {pin,...details}=parsed.data;const hashed=freshPinHash(pin);
 const {error}=await adminDb().from('managers').upsert({...details,pin_salt:hashed.salt,pin_hash:hashed.hash,is_active:true,updated_at:new Date().toISOString()},{onConflict:'slot'});
 return error?fail('Could not save manager',500):NextResponse.json({ok:true});
}

export async function DELETE(req:NextRequest){
 const user=await currentUser(req);if(!user||user.role!=='admin')return fail('Forbidden',403);
 const slot=Number(req.nextUrl.searchParams.get('slot'));if(![1,2].includes(slot))return fail('Valid manager slot required');
 const {error}=await adminDb().from('managers').update({is_active:false,updated_at:new Date().toISOString()}).eq('slot',slot);
 return error?fail('Could not deactivate manager',500):NextResponse.json({ok:true});
}
