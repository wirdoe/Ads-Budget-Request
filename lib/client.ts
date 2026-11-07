'use client';
import {publicDb} from './supabase';
export async function api(path:string,options:RequestInit={}) {
 const {data}=await publicDb().auth.getSession();const token=data.session?.access_token;
 const response=await fetch('/api'+path,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{}),...options.headers},cache:'no-store'});
 const body=await response.json().catch(()=>({error:'Unexpected response'}));
 if(!response.ok)throw new Error(body.error||'Request failed');return body;
}
export function fmtDate(v:string|undefined){return v?new Date(v).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}):'—';}
export function money(n:number){return new Intl.NumberFormat('en-QA',{style:'currency',currency:'QAR'}).format(n)}
