
import { apiRequest } from './api.js'

export async function getCurrentMember() {
  try {
    const result = await apiRequest('/auth/me')
    return result.user
  } catch (error) {
    if (
      error.message?.includes('sign in') ||
      error.message?.includes('session') ||
      error.message?.includes('expired')
    ) {
      return null
    }
    throw error
  }
}

export async function getMemberProfile() {
  return getCurrentMember()
}


export async function registerMember(details) {
  // Support both the old nested structure and the new flat structure.
  const profile = details.profile || details

  // Build the exact structure expected by the FastAPI backend.
  const registrationData = {
    email: details.email.trim().toLowerCase(),
    password: details.password,
    full_name: profile.full_name,
    phone: profile.phone || '',
    date_of_birth: profile.date_of_birth,
    address: profile.address || '',
    city: profile.city || '',
    postcode: profile.postcode || '',
    membership_interest: profile.membership_interest || '',
  }

  // Send the corrected registration data.
  return apiRequest('/auth/register', {
    method: 'POST',
    body: registrationData,
  })
}


export async function signInMember(email, password) {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: { email, password },
  })
}

export async function signOutMember() {
  return apiRequest('/auth/logout', {
    method: 'POST',
  })
}

export async function updateMemberPassword(password) {
  return apiRequest('/auth/update-password', {
    method: 'POST',
    body: { password },
  })
}

export async function requestPasswordReset(email) {
  return apiRequest('/auth/forgot-password', {
    method: 'POST',
    body: { email },
  })
}

export async function resendSignupConfirmation(email) {
  return apiRequest('/auth/resend', {
    method: 'POST',
    body: { email },
  })
}