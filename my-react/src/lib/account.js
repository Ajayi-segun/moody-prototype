import { getSupabaseClient } from './supabase.js'

const profileFields = [
  'id',
  'full_name',
  'phone',
  'date_of_birth',
  'address',
  'city',
  'postcode',
  'membership_interest',
]

function throwIfError(error) {
  if (error) throw new Error(error.message || 'The Supabase request failed.')
}

export async function getMemberProfile(authUser) {
  if (!authUser) return null

  const client = await getSupabaseClient()
  const { data: profile, error } = await client
    .from('profiles')
    .select(profileFields.join(','))
    .eq('id', authUser.id)
    .maybeSingle()
  throwIfError(error)

  if (!profile) {
    throw new Error(
      'Your account exists, but its member profile is missing. Run backend/supabase_schema.sql in the Supabase SQL editor, then contact support if the issue continues.',
    )
  }

  return {
    id: profile.id,
    email: authUser.email,
    full_name: profile.full_name,
    phone: profile.phone,
    date_of_birth: profile.date_of_birth,
    address: profile.address,
    city: profile.city,
    postcode: profile.postcode,
    membership_interest: profile.membership_interest,
    is_verified: Boolean(authUser.email_confirmed_at),
  }
}

export async function getCurrentMember() {
  const client = await getSupabaseClient()
  const { data, error } = await client.auth.getSession()
  throwIfError(error)
  return getMemberProfile(data.session?.user ?? null)
}

export async function registerMember({ email, password, profile }) {
  const client = await getSupabaseClient()
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/account`,
      data: profile,
    },
  })
  throwIfError(error)

  return {
    user: data.user,
    session: data.session,
  }
}

export async function signInMember(email, password) {
  const client = await getSupabaseClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  throwIfError(error)
  return getMemberProfile(data.user)
}

export async function signOutMember() {
  const client = await getSupabaseClient()
  const { error } = await client.auth.signOut()
  throwIfError(error)
}

export async function requestPasswordReset(email) {
  const client = await getSupabaseClient()
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/account`,
  })
  throwIfError(error)
}

export async function updateMemberPassword(password) {
  const client = await getSupabaseClient()
  const { error } = await client.auth.updateUser({ password })
  throwIfError(error)
}

export async function resendSignupConfirmation(email) {
  const client = await getSupabaseClient()
  const { error } = await client.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${window.location.origin}/account` },
  })
  throwIfError(error)
}
