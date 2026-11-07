import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { adminDb } from './supabase';
export const fail=(message:string,status=400)=>NextResponse.json({error:message},{status});
export const digest=(value:string)=>crypto.createHash('sha256').update(value).digest('hex');
export function pinHash(pin:string,salt:string){return crypto.scryptSync(pin,salt,64).toString('hex');}
export function freshPinHash(pin:string){const salt=crypto.randomBytes(16).toString('hex');return {salt,hash:pinHash(pin,salt)};}
export function validPin(pin:string,salt:string,hash:string){
 if(!/^\d{6}$/.test(pin))return false;
 const a=Buffer.from(pinHash(pin,salt),'hex');const b=Buffer.from(hash,'hex');
 return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
export async function currentUser(req:NextRequest){
 const bearer=req.headers.get('authorization')||'';
 if(!bearer.startsWith('Bearer '))return null;
 const db=adminDb();const {data,error}=await db.auth.getUser(bearer.slice(7));
 if(error||!data.user)return null;
 const {data:profile}=await db.from('profiles').select('id,role').eq('id',data.user.id).single();
 if(!profile)return null;
 return {id:data.user.id,role:profile.role,email:data.user.email||''};
}
export async function notification(to:string,subject:string,html:string){
 if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)return {sent:false,reason:'Email provider not configured'};
 try{
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[to],subject,html})});
 return response.ok?{sent:true}:{sent:false,reason:`Email provider HTTP ${response.status}`};
 }catch{return {sent:false,reason:'Email provider unreachable'};}
}
export const safeText=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
