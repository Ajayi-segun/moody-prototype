const membershipInterests = new Set([
  'general-fitness',
  'strength-training',
  'weight-management',
  'flexibility-mobility',
  'group-classes',
  'not-sure',
])

const ukPostcodePattern = /^(GIR 0AA|(?:[A-Z]{1,2}[0-9][A-Z0-9]?|[A-Z]{1,2}[0-9][A-Z]) ?[0-9][A-Z]{2})$/i
const addressCharacterPattern = /^[\p{L}\p{N}\s.,'#/-]+$/u
const namePattern = /^[\p{L}\p{M}][\p{L}\p{M}\s.'’-]*$/u

export function validateEmail(value) {
  const email = value.trim()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return 'Enter a valid email address, such as name@example.com.'
  }
  return ''
}

export function getStrongPasswordErrors(value) {
  const errors = []
  if (value.length < 8) errors.push('Use at least 8 characters.')
  if (value.length > 13) errors.push('Use no more than 13 characters.')
  if (!/[a-z]/.test(value)) errors.push('Add at least one lowercase letter.')
  if (!/[A-Z]/.test(value)) errors.push('Add at least one uppercase letter.')
  if (!/[0-9]/.test(value)) errors.push('Add at least one number.')
  if (!/[^A-Za-z0-9\s]/.test(value)) errors.push('Add at least one symbol, such as ! or #.')
  return errors
}

export function validateStrongPassword(value) {
  return getStrongPasswordErrors(value).join(' ')
}

export function validatePhone(value) {
  const phone = value.trim()
  const digitCount = phone.replace(/\D/g, '').length
  if (!/^[+()\d.\s/-]+$/.test(phone) || digitCount < 7 || digitCount > 15) {
    return 'Enter a valid phone number with 7 to 15 digits.'
  }
  return ''
}

export function validateAddress(value) {
  const address = value.trim()
  if (address.length < 5 || address.length > 200) {
    return 'Enter a street address between 5 and 200 characters.'
  }
  if (!/\p{L}/u.test(address) || !addressCharacterPattern.test(address)) {
    return 'Enter a street address using letters and numbers only where appropriate.'
  }
  if (/^\s*(p\.?\s*o\.?\s*box|post office box)\b/i.test(address)) {
    return 'Enter a street or building address rather than a PO box.'
  }
  return ''
}

export function validateCity(value) {
  const city = value.trim()
  if (city.length < 2 || city.length > 100 || !namePattern.test(city)) {
    return 'Enter a valid town or city name.'
  }
  return ''
}

export function validatePostcode(value) {
  if (!ukPostcodePattern.test(value.trim().replace(/\s+/g, ' ').toUpperCase())) {
    return 'Enter a valid UK postcode, such as SW1A 1AA.'
  }
  return ''
}

export function validateRegistration({ fullName, email, phone, dateOfBirth, address, city, postcode, membershipInterest, password, passwordConfirmation }) {
  const errors = []
  if (!fullName.trim() || fullName.trim().length > 120 || !namePattern.test(fullName.trim())) {
    errors.push('Full name: enter a valid name using letters, spaces, apostrophes, or hyphens (up to 120 characters).')
  }
  const emailError = validateEmail(email)
  if (emailError) errors.push(`Email: ${emailError}`)
  const phoneError = validatePhone(phone)
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    errors.push('Date of birth: enter a valid date.')
  } else {
    const [birthYear, birthMonth, birthDay] = dateOfBirth.split('-').map(Number)
    const birthDate = new Date(0)
    birthDate.setUTCFullYear(birthYear, birthMonth - 1, birthDay)
    if (
      birthMonth < 1
      || birthMonth > 12
      || birthDate.getUTCFullYear() !== birthYear
      || birthDate.getUTCMonth() !== birthMonth - 1
      || birthDate.getUTCDate() !== birthDay
    ) {
      errors.push('Date of birth: enter a real calendar date.')
    } else {
      const today = new Date()
      let age = today.getFullYear() - birthYear
      if (
        today.getMonth() + 1 < birthMonth
        || (today.getMonth() + 1 === birthMonth && today.getDate() < birthDay)
      ) {
        age -= 1
      }
      const todayDate = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0'),
      ].join('-')
      if (dateOfBirth > todayDate || age < 14 || age > 120) {
        errors.push('Date of birth: you must be at least 14 years old and enter a valid date.')
      }
    }
  }
  const addressError = validateAddress(address)
  if (addressError) errors.push(`Address: ${addressError}`)
  const cityError = validateCity(city)
  if (cityError) errors.push(`Town or city: ${cityError}`)
  const postcodeError = validatePostcode(postcode)
  if (postcodeError) errors.push(`Postcode: ${postcodeError}`)
  if (!membershipInterests.has(membershipInterest)) errors.push('Membership interest: choose one option from the list.')
  for (const passwordError of getStrongPasswordErrors(password)) {
    errors.push(`Password: ${passwordError}`)
  }
  if (password !== passwordConfirmation) errors.push('Password confirmation: the two passwords do not match.')
  if (phoneError) errors.push(`Phone number: ${phoneError}`)
  return errors
}
