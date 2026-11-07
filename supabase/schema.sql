-- Ads Budget Approval Portal. Run on a dedicated Supabase project. Already applied to project ssoiiurfngyhlurmgjrm.
create extension if not exists pgcrypto;
create table if not exists public.profiles(id uuid primary key references auth.users(id) on delete cascade,email text not null,role text not null default 'requestor' check(role in ('requestor','admin')),created_at timestamptz not null default now());
create or replace function public.create_profile() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.profiles(id,email) values(new.id,coalesce(new.email,'')) on conflict(id) do nothing;return new;end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.create_profile();
revoke execute on function public.create_profile() from public,anon,authenticated;
insert into public.profiles(id,email) select id,coalesce(email,'') from auth.users on conflict(id) do nothing;
create table if not exists public.managers(id uuid primary key default gen_random_uuid(),slot integer not null unique check(slot in (1,2)),full_name text not null,email text not null,pin_salt text not null,pin_hash text not null,updated_at timestamptz not null default now());
create table if not exists public.requests(id uuid primary key default gen_random_uuid(),request_no bigint generated always as identity unique,created_by uuid not null references auth.users(id),campaign text not null,department text not null,objective text not null,channels text not null,start_date date not null,end_date date not null,amount numeric(14,2) not null check(amount>0),currency text not null default 'QAR' check(currency='QAR'),justification text not null,status text not null default 'pending' check(status in ('pending','approved','rejected')),created_at timestamptz not null default now(),finalized_at timestamptz);
create table if not exists public.approvals(id uuid primary key default gen_random_uuid(),request_id uuid not null references public.requests(id) on delete cascade,manager_id uuid not null references public.managers(id),manager_slot integer not null check(manager_slot in(1,2)),manager_name text not null,manager_email text not null,token_hash text not null unique,expires_at timestamptz not null,decision text not null default 'pending' check(decision in('pending','approved','rejected')),comment text,decided_at timestamptz,failed_attempts integer not null default 0,locked_until timestamptz,unique(request_id,manager_slot));
create table if not exists public.audit_events(id bigint generated always as identity primary key,request_id uuid not null references public.requests(id) on delete cascade,actor_type text not null check(actor_type in('requestor','manager','system')),actor_label text not null,event_type text not null,details jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
create index if not exists requests_creator_idx on public.requests(created_by,created_at desc);
create index if not exists approvals_request_idx on public.approvals(request_id);
create index if not exists audit_request_idx on public.audit_events(request_id,created_at);
alter table public.profiles enable row level security;
alter table public.managers enable row level security;
alter table public.requests enable row level security;
alter table public.approvals enable row level security;
alter table public.audit_events enable row level security;
create or replace function public.record_approval(p_approval_id uuid,p_decision text,p_comment text) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_approval public.approvals%rowtype;v_request public.requests%rowtype;v_approved integer;v_status text;
begin
if p_decision not in ('approved','rejected') then raise exception 'Invalid decision';end if;
select * into v_approval from public.approvals where id=p_approval_id;if not found then raise exception 'Approval not found';end if;
select * into v_request from public.requests where id=v_approval.request_id for update;
select * into v_approval from public.approvals where id=p_approval_id;
if v_request.status<>'pending' or v_approval.decision<>'pending' then raise exception 'Request or approval already finalized';end if;
if v_approval.expires_at<now() then raise exception 'Approval link expired';end if;
update public.approvals set decision=p_decision,comment=nullif(trim(p_comment),''),decided_at=now() where id=p_approval_id;
insert into public.audit_events(request_id,actor_type,actor_label,event_type,details) values(v_request.id,'manager',v_approval.manager_name,'manager_'||p_decision,jsonb_build_object('slot',v_approval.manager_slot,'comment',p_comment));
if p_decision='rejected' then v_status:='rejected';else select count(*) into v_approved from public.approvals where request_id=v_request.id and decision='approved';v_status:=case when v_approved=2 then 'approved' else 'pending' end;end if;
if v_status<>'pending' then update public.requests set status=v_status,finalized_at=now() where id=v_request.id;insert into public.audit_events(request_id,actor_type,actor_label,event_type) values(v_request.id,'system','System','request_'||v_status);end if;
return jsonb_build_object('status',v_status,'decision',p_decision);
end;$$;
revoke execute on function public.record_approval(uuid,text,text) from public,anon,authenticated;
grant execute on function public.record_approval(uuid,text,text) to service_role;
