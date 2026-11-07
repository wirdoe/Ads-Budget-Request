import { createClient } from '@supabase/supabase-js';
export function adminDb() {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error('Supabase server environment variables are missing');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export function publicDb() {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw new Error('Supabase public environment variables are missing');
 return createClient(url,key);
}
