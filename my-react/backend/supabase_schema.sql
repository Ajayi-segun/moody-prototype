create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    full_name text not null check (
        char_length(trim(full_name)) between 1 and 120
    ),
    phone text not null check (char_length(trim(phone)) between 3 and 30),
    date_of_birth date not null,
    address text not null check (
        char_length(trim(address)) between 1 and 200
    ),
    city text not null check (char_length(trim(city)) between 1 and 100),
    postcode text not null,
    membership_interest text not null check (
        membership_interest in (
            'general-fitness',
            'strength-training',
            'weight-management',
            'flexibility-mobility',
            'group-classes',
            'not-sure'
        )
    ),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.profiles
    drop constraint if exists profiles_postcode_check;
alter table public.profiles
    drop constraint if exists profiles_postcode_format_check;
alter table public.profiles
    add constraint profiles_postcode_format_check check (
        upper(trim(postcode)) ~
        '^(GIR 0AA|([A-Z]{1,2}[0-9][A-Z0-9]?|[A-Z]{1,2}[0-9][A-Z])[ ]?[0-9][A-Z]{2})$'
    ) not valid;

alter table public.profiles enable row level security;
grant select, update on public.profiles to authenticated;

drop policy if exists "Members can read their own profile" on public.profiles;
create policy "Members can read their own profile"
    on public.profiles for select
    to authenticated
    using ((select auth.uid()) = id);

drop policy if exists "Members can update their own profile" on public.profiles;
create policy "Members can update their own profile"
    on public.profiles for update
    to authenticated
    using ((select auth.uid()) = id)
    with check ((select auth.uid()) = id);

create or replace function public.create_member_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    member_data jsonb := new.raw_user_meta_data;
    member_date_of_birth date;
begin
    member_date_of_birth := (member_data ->> 'date_of_birth')::date;
    if member_date_of_birth > (current_date - interval '14 years')::date then
        raise exception 'Members must be at least 14 years old.';
    end if;
    if member_date_of_birth > current_date then
        raise exception 'Date of birth cannot be in the future.';
    end if;

    insert into public.profiles (
        id,
        full_name,
        phone,
        date_of_birth,
        address,
        city,
        postcode,
        membership_interest
    )
    values (
        new.id,
        trim(member_data ->> 'full_name'),
        trim(member_data ->> 'phone'),
        member_date_of_birth,
        trim(member_data ->> 'address'),
        trim(member_data ->> 'city'),
        trim(member_data ->> 'postcode'),
        member_data ->> 'membership_interest'
    );
    return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
    after insert on auth.users
    for each row execute function public.create_member_profile();

create table if not exists public.mailing_list_subscribers (
    email text primary key check (
        email = lower(trim(email)) and char_length(email) <= 254
    ),
    subscribed_at timestamptz not null default now()
);

alter table public.mailing_list_subscribers enable row level security;
grant insert, update on public.mailing_list_subscribers to service_role;
