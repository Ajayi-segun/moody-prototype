import { useState } from 'react'
import {
  getMemberProfile,
  registerMember,
  requestPasswordReset,
  resendSignupConfirmation,
  signInMember,
  updateMemberPassword,
} from '../../lib/account.js'
import {
  validateEmail,
  validateRegistration,
  validateStrongPassword,
} from '../../lib/accountValidation.js'
import './AccountPage.css'

const registrationDraftKey = 'toka-registration-draft'
const emptyRegistrationDraft = {
  fullName: '',
  email: '',
  phone: '',
  dateOfBirth: '',
  address: '',
  city: '',
  postcode: '',
  membershipInterest: '',
}

function readRegistrationDraft() {
  try {
    const storedDraft = window.localStorage.getItem(registrationDraftKey)
    if (!storedDraft) return { ...emptyRegistrationDraft }
    const parsedDraft = JSON.parse(storedDraft)
    return Object.fromEntries(
      Object.keys(emptyRegistrationDraft).map((field) => [
        field,
        typeof parsedDraft[field] === 'string' ? parsedDraft[field] : '',
      ]),
    )
  } catch {
    return { ...emptyRegistrationDraft }
  }
}

function clearRegistrationDraft() {
  try {
    window.localStorage.removeItem(registrationDraftKey)
  } catch {
    return false
  }
  return true
}

const minimumRegistrationDate = new Date()
minimumRegistrationDate.setFullYear(minimumRegistrationDate.getFullYear() - 14)
const maxDateOfBirth = [
  minimumRegistrationDate.getFullYear(),
  String(minimumRegistrationDate.getMonth() + 1).padStart(2, '0'),
  String(minimumRegistrationDate.getDate()).padStart(2, '0'),
].join('-')

function AccountPage({ initialMode, user, onSignedIn, onPasswordUpdated, loading, notice, onSignOut }) {
  const [mode, setMode] = useState(() => (
    new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery'
      || new URLSearchParams(window.location.search).has('reset_token')
      ? 'reset-password'
      : initialMode
  ))
  const [registrationDraft, setRegistrationDraft] = useState(readRegistrationDraft)
  const { fullName, email, phone, dateOfBirth, address, city, postcode, membershipInterest } = registrationDraft
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [verificationEmail, setVerificationEmail] = useState('')
  const [draftNotice, setDraftNotice] = useState('')

  function updateRegistrationField(field, value) {
    const nextDraft = { ...registrationDraft, [field]: value }
    setRegistrationDraft(nextDraft)
    if (mode !== 'register') return
    try {
      window.localStorage.setItem(registrationDraftKey, JSON.stringify(nextDraft))
      setDraftNotice('')
    } catch {
      setDraftNotice('Your browser could not save this draft. Keep this page open to avoid losing your details.')
    }
  }

  async function handlePasswordUpdate(event) {
    event.preventDefault()
    setMessage('')
    setError('')
    const passwordError = validateStrongPassword(password)
    if (passwordError) {
      setError(`Your password is not strong enough. ${passwordError}`)
      return
    }

    setIsSubmitting(true)
    try {
      if (mode === 'reset-password') {
        if (password !== passwordConfirmation) {
          setError('Your passwords do not match.')
          return
        }
        await updateMemberPassword(password)
        setMessage('Your password has been updated. Please sign in.')
        setMode('sign-in')
        window.history.replaceState({}, '', '/account')
        onPasswordUpdated()
      } else {
        await updateMemberPassword(password)
        setMessage('Your password has been updated.')
        onPasswordUpdated()
      }
    } catch (updateError) {
      setError(updateError.message || 'Your password could not be updated. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setMessage('')
    setError('')
    setVerificationEmail('')

    const normalizedEmail = email.trim().toLowerCase()
    const normalizedName = fullName.trim()
    const normalizedPhone = phone.trim()
    const normalizedAddress = address.trim()
    const normalizedCity = city.trim()
    const normalizedPostcode = postcode.trim()

    if (mode === 'register') {
      const validationError = validateRegistration({
        fullName: normalizedName,
        email: normalizedEmail,
        phone: normalizedPhone,
        dateOfBirth,
        address: normalizedAddress,
        city: normalizedCity,
        postcode: normalizedPostcode,
        membershipInterest,
        password,
        passwordConfirmation,
      })
      if (validationError) {
        setError(validationError)
        return
      }
    }
    if (mode === 'resend' && !normalizedEmail) {
      setError('Enter the email address you used to register.')
      return
    }
    if ((mode === 'reset' || mode === 'resend') && validateEmail(normalizedEmail)) {
      setError(validateEmail(normalizedEmail))
      return
    }

    setIsSubmitting(true)
    try {
      if (mode === 'reset') {
        await requestPasswordReset(normalizedEmail)
        setMessage('If an account exists for that address, a password reset email has been sent.')
      } else if (mode === 'resend') {
        await resendSignupConfirmation(normalizedEmail)
        setMessage('A new confirmation email has been requested. Check your inbox and spam folder.')
      } else if (mode === 'register') {
        const result = await registerMember({
          email: normalizedEmail,
          password,
          profile: {
            full_name: normalizedName,
            phone: normalizedPhone,
            date_of_birth: dateOfBirth,
            address: normalizedAddress,
            city: normalizedCity,
            postcode: normalizedPostcode,
            membership_interest: membershipInterest,
          },
        })
        setPassword('')
        setPasswordConfirmation('')
        if (!clearRegistrationDraft()) {
          setDraftNotice('Your account was created, but the saved draft could not be removed from this browser.')
        } else {
          setRegistrationDraft({ ...emptyRegistrationDraft })
        }
        if (result.session) {
          const member = await getMemberProfile(result.user)
          onSignedIn(member)
          setMessage('Your account has been created and you are signed in.')
        } else {
          setMessage('Your account has been created. Check your email to confirm your address before signing in.')
          setVerificationEmail(normalizedEmail)
        }
      } else {
        const member = await signInMember(normalizedEmail, password)
        onSignedIn(member)
        setMessage('You are signed in to ToKa Fitness.')
      }
    } catch (requestError) {
      setError(requestError.message || 'Your request could not be completed. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function resendVerificationEmail() {
    setMessage('')
    setError('')
    setIsSubmitting(true)
    try {
      await resendSignupConfirmation(verificationEmail)
      setMessage('A new confirmation email has been requested. Check your inbox and spam folder.')
    } catch (resendError) {
      setError(resendError.message || 'The verification email could not be resent. Please try again later.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (mode === 'reset-password') {
    return (
      <section className="account-page" aria-labelledby="account-heading">
        <p className="eyebrow">Secure your account</p>
        <h1 id="account-heading">Choose a new password</h1>
        <form className="account-form" onSubmit={handlePasswordUpdate}>
          <label>
            New password
            <span className="account-password-control">
              <input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                name="new-password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                className="account-password-toggle"
                type="button"
                aria-controls="new-password"
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </span>
          </label>
          <label>
            Confirm new password
            <input
              type={showPassword ? 'text' : 'password'}
              name="new-password-confirmation"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              value={passwordConfirmation}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
              required
            />
          </label>
          <button className="account-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Please wait…' : 'Update password'}
          </button>
        </form>
        {message && <p className="account-feedback" role="status">{message}</p>}
        {error && <p className="account-error" role="alert">{error}</p>}
      </section>
    )
  }

  if (loading) {
    return <section className="account-page" aria-live="polite">Checking your account…</section>
  }

  if (user) {
    return (
      <section className="account-page" aria-labelledby="account-heading">
        <p className="eyebrow">Your ToKa Fitness account</p>
        <h1 id="account-heading">You’re signed in</h1>
        {user.full_name && <p>Welcome, {user.full_name}.</p>}
        <p>Your account is connected as <strong>{user.email}</strong>.</p>
        {notice && <p className="account-feedback" role="status">{notice}</p>}
        <button className="account-submit" type="button" onClick={onSignOut}>Sign out</button>
      </section>
    )
  }

  const isReset = mode === 'reset'
  const isRegister = mode === 'register'
  const isResend = mode === 'resend'

  return (
    <section className="account-page" aria-labelledby="account-heading">
      <p className="eyebrow">ToKa Fitness member access</p>
      <h1 id="account-heading">
        {isReset
          ? 'Reset your password'
          : isResend
            ? 'Resend verification email'
            : isRegister ? 'Create your account' : 'Welcome back'}
      </h1>
      <p className="account-intro">
        {isReset
          ? 'ToKa Fitness will email you a secure link to choose a new password.'
          : isResend
            ? 'Enter the email address you used to register. ToKa Fitness will request a new account verification email.'
            : isRegister
              ? 'Join ToKa Fitness: a welcoming community for building healthier routines with practical training guidance and support.'
              : 'Sign in or join ToKa Fitness to keep your account available wherever you are.'}
      </p>
      {isRegister && (
        <div className="registration-draft-note">
          <p>Your registration details are saved on this device, so you can return and continue later. Passwords are never saved in the draft.</p>
          {draftNotice && <p className="account-error" role="alert">{draftNotice}</p>}
        </div>
      )}

      {!isReset && !isResend && (
        <div className="account-tabs" aria-label="Account options">
          <a
            href="/sign-in"
            aria-current={isRegister ? undefined : 'page'}
          >
            Sign in
          </a>
          <a
            href="/register"
            aria-current={isRegister ? 'page' : undefined}
          >
            Register
          </a>
        </div>
      )}

      <form className="account-form" onSubmit={handleSubmit}>
        {isRegister && (
          <>
            <label>
              Full name
              <input
                type="text"
                name="name"
                autoComplete="name"
                maxLength={120}
                value={fullName}
                onChange={(event) => updateRegistrationField('fullName', event.target.value)}
                aria-describedby="full-name-help"
                required
              />
              <span className="account-help" id="full-name-help">Use your name as it appears on your membership details.</span>
            </label>
            <label>
              Phone number
              <input
                type="tel"
                name="phone"
                autoComplete="tel"
                maxLength={30}
                value={phone}
                onChange={(event) => updateRegistrationField('phone', event.target.value)}
                aria-describedby="phone-help"
                required
              />
              <span className="account-help" id="phone-help">Include your country code if you are outside the UK.</span>
            </label>
            <label>
              Date of birth
              <input
                type="date"
                name="date-of-birth"
                autoComplete="bday"
                max={maxDateOfBirth}
                value={dateOfBirth}
                onChange={(event) => updateRegistrationField('dateOfBirth', event.target.value)}
                aria-describedby="date-of-birth-help"
                required
              />
              <span className="account-help" id="date-of-birth-help">You must be at least 14 years old to register.</span>
            </label>
            <label>
              Address
              <input
                type="text"
                name="address"
                autoComplete="street-address"
                maxLength={200}
                value={address}
                onChange={(event) => updateRegistrationField('address', event.target.value)}
                aria-describedby="address-help"
                required
              />
              <span className="account-help" id="address-help">Enter a street/building address. The form checks its format but cannot verify that it physically exists.</span>
            </label>
            <label>
              Town or city
              <input
                type="text"
                name="city"
                autoComplete="address-level2"
                maxLength={100}
                value={city}
                onChange={(event) => updateRegistrationField('city', event.target.value)}
                required
              />
            </label>
            <label>
              Postcode
              <input
                type="text"
                name="postcode"
                autoComplete="postal-code"
                maxLength={20}
                value={postcode}
                onChange={(event) => updateRegistrationField('postcode', event.target.value.toUpperCase())}
                aria-describedby="postcode-help"
                required
              />
              <span className="account-help" id="postcode-help">Enter a valid UK postcode, for example SW1A 1AA.</span>
            </label>
            <label>
              Membership interests
              <select
                name="membership-interest"
                value={membershipInterest}
                onChange={(event) => updateRegistrationField('membershipInterest', event.target.value)}
                required
              >
                <option value="">Choose an interest</option>
                <option value="general-fitness">General fitness</option>
                <option value="strength-training">Strength training</option>
                <option value="weight-management">Weight management</option>
                <option value="flexibility-mobility">Flexibility and mobility</option>
                <option value="group-classes">Group classes</option>
                <option value="not-sure">Not sure yet</option>
              </select>
            </label>
          </>
        )}
        <label>
          Email address
          <input
            type="email"
            name="email"
            autoComplete="email"
            maxLength={254}
            value={email}
            onChange={(event) => updateRegistrationField('email', event.target.value)}
            required
          />
        </label>
        {!isReset && !isResend && (
          <label>
            Password
            <span className="account-password-control">
              <input
                id="account-password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                minLength={isRegister ? 12 : 8}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                className="account-password-toggle"
                type="button"
                aria-controls="account-password"
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </span>
            {isRegister && (
              <span className="account-help">
                Use 12–128 characters, including an uppercase letter, a lowercase letter, a number, and a symbol.
              </span>
            )}
          </label>
        )}
        {isRegister && (
          <label>
            Confirm password
            <input
              type={showPassword ? 'text' : 'password'}
              name="password-confirmation"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              value={passwordConfirmation}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
              required
            />
          </label>
        )}
        <button className="account-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? 'Please wait…'
            : isReset
              ? 'Send reset link'
              : isResend
                ? 'Resend verification email'
                : isRegister ? 'Create account' : 'Sign in'}
        </button>
      </form>

      {mode === 'sign-in' && (
        <>
            <button className="account-text-button" type="button" onClick={() => { setMode('reset'); setMessage(''); setError('') }}>
              Forgot your password?
            </button>
            <button className="account-text-button" type="button" onClick={() => { setMode('resend'); setMessage(''); setError('') }}>
              Resend verification email
            </button>
        </>
      )}
      {message && <p className="account-feedback" role="status">{message}</p>}
      {verificationEmail && (
        <button
          className="account-text-button"
          type="button"
          onClick={resendVerificationEmail}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Sending…' : 'Resend verification email'}
        </button>
      )}
      {notice && <p className="account-feedback" role="status">{notice}</p>}
      {error && <p className="account-error" role="alert">{error}</p>}
      {isReset && (
        <button className="account-text-button" type="button" onClick={() => { setMode('sign-in'); setMessage(''); setError('') }}>
          Back to sign in
        </button>
      )}
      {isResend && (
        <button className="account-text-button" type="button" onClick={() => { setMode('sign-in'); setMessage(''); setError('') }}>
          Back to sign in
        </button>
      )}
    </section>
  )
}

export default AccountPage
