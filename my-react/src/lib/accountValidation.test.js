import assert from 'node:assert/strict'
import test from 'node:test'
import {
  validateAddress,
  validateEmail,
  validatePhone,
  validatePostcode,
  validateRegistration,
  validateStrongPassword,
} from './accountValidation.js'

const validRegistration = {
  fullName: 'Taylor Member',
  email: 'taylor@example.com',
  phone: '+44 7700 900123',
  dateOfBirth: '2000-01-01',
  address: '1 Example Road',
  city: 'London',
  postcode: 'SW1A 1AA',
  membershipInterest: 'general-fitness',
  password: 'Strong!Passphrase42',
  passwordConfirmation: 'Strong!Passphrase42',
}

test('accepts a valid registration', () => {
  assert.equal(validateRegistration(validRegistration), '')
})

test('rejects malformed email addresses', () => {
  assert.notEqual(validateEmail('person@invalid'), '')
  assert.notEqual(validateEmail('person example.com'), '')
  assert.equal(validateEmail('person@example.com'), '')
})

test('requires long passwords with mixed character types', () => {
  assert.notEqual(validateStrongPassword('short'), '')
  assert.notEqual(validateStrongPassword('alllowercasepassword'), '')
  assert.notEqual(validateStrongPassword('nouppercase123!'), '')
  assert.notEqual(validateStrongPassword('NoNumber!AndSymbols'), '')
  assert.notEqual(validateStrongPassword('NoSymbolPassword123'), '')
  assert.equal(validateStrongPassword('Strong!Passphrase42'), '')
})

test('rejects malformed phone numbers, addresses, and postcodes', () => {
  assert.notEqual(validatePhone('telephone'), '')
  assert.notEqual(validateAddress('???'), '')
  assert.notEqual(validatePostcode('London'), '')
  assert.equal(validatePhone('+44 7700 900123'), '')
  assert.equal(validateAddress('Flat 2, 1 Example Road'), '')
  assert.equal(validatePostcode('SW1A 1AA'), '')
})

test('rejects incomplete registration details and mismatched passwords', () => {
  assert.notEqual(validateRegistration({ ...validRegistration, address: '' }), '')
  assert.notEqual(
    validateRegistration({ ...validRegistration, passwordConfirmation: 'Different!Pass123' }),
    '',
  )
  assert.notEqual(
    validateRegistration({ ...validRegistration, membershipInterest: 'unknown' }),
    '',
  )
})

test('rejects impossible, future, and implausibly old birth dates', () => {
  for (const dateOfBirth of ['2001-02-29', '2099-01-01', '1800-01-01']) {
    assert.notEqual(
      validateRegistration({ ...validRegistration, dateOfBirth }),
      '',
      `expected ${dateOfBirth} to be rejected`,
    )
  }
})

test('rejects PO boxes as a street address', () => {
  assert.notEqual(validateAddress('PO Box 123'), '')
  assert.equal(validateAddress('Flat 2, 1 Example Road'), '')
})
