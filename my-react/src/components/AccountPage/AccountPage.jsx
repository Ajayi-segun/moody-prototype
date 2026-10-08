import { useState } from 'react'
import { apiRequest } from '../../lib/api.js'
import './AccountPage.css'

const minimumRegistrationDate = new Date()
minimumRegistrationDate.setFullYear(minimumRegistrationDate.getFullYear() - 14)
const maxDateOfBirth = [
  minimumRegistrationDate.getFullYear(),
  String(minimumRegistrationDate.getMonth() + 1).padStart(2, '0'),
  String(minimumRegistrationDate.getDate()).padStart(2, '0'),
].join('-')

function AccountPage({ initialMode, user, onSignedIn, onPasswordUpdated, loading, notice, onSignOut }) {
  const [mode, setMode] = useState(() => (
    new URLSearchParams(window.location.search).has('reset_token')
      ? 'reset-password'
      : initialMode
  ))
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [postcode, setPostcode] = useState('')
  const [membershipInterest, setMembershipInterest] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [resetToken, setResetToken] = useState(
    () => new URLSearchParams(window.location.search).get('reset_token') || '',
  )
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [verificationEmail, setVerificationEmail] = useState('')

  async function handlePasswordUpdate(event) {
    event.preventDefault()
    setMessage('')
    setError('')
    if (password.length < 8) {
      setError('Your password must be at least 8 characters.')
      return
    }

    setIsSubmitting(true)
    try {
      if (mode === 'reset-password') {
        if (password !== passwordConfirmation) {
          setError('Your passwords do not match.')
          return
        }
        const result = await apiRequest('/auth/reset-password', {
          method: 'POST',
          body: { token: resetToken, password },
        })
        setMessage(result.message)
        setResetToken('')
        setMode('sign-in')
        window.history.replaceState({}, '', '/account')
      } else {
        const result = await apiRequest('/auth/update-password', {
          method: 'POST',
          body: { password },
        })
        setMessage(result.message)
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

    if (mode === 'register' && !normalizedName) {
      setError('Enter your full name.')
      return
    }
    if (mode === 'register' && dateOfBirth > maxDateOfBirth) {
      setError('You must be at least 14 years old to register.')
      return
    }
    if (mode === 'register' && password !== passwordConfirmation) {
      setError('Your passwords do not match.')
      return
    }
    if (mode === 'resend' && !normalizedEmail) {
      setError('Enter the email address you used to register.')
      return
    }

    setIsSubmitting(true)
    try {
      if (mode === 'reset') {
        const result = await apiRequest('/auth/forgot-password', {
          method: 'POST',
          body: { email: normalizedEmail },
        })
        setMessage(result.message)
      } else if (mode === 'resend') {
        const result = await apiRequest('/auth/resend', {
          method: 'POST',
          body: { email: normalizedEmail },
        })
        setMessage(result.message)
      } else if (mode === 'register') {
        const result = await apiRequest('/auth/register', {
          method: 'POST',
          body: {
            email: normalizedEmail,
            password,
            full_name: normalizedName,
            phone: normalizedPhone,
            date_of_birth: dateOfBirth,
            address: normalizedAddress,
            city: normalizedCity,
            postcode: normalizedPostcode,
            membership_interest: membershipInterest,
          },
        })
        setMessage(result.message)
        setVerificationEmail(normalizedEmail)
      } else {
        const result = await apiRequest('/auth/login', {
          method: 'POST',
          body: { email: normalizedEmail, password },
        })
        onSignedIn(result.user)
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
      const result = await apiRequest('/auth/resend', {
        method: 'POST',
        body: { email: verificationEmail },
      })
      setMessage(result.message)
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
                minLength={8}
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
              minLength={8}
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
                onChange={(event) => setFullName(event.target.value)}
                required
              />
            </label>
            <label>
              Phone number
              <input
                type="tel"
                name="phone"
                autoComplete="tel"
                maxLength={30}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
              />
            </label>
            <label>
              Date of birth
              <input
                type="date"
                name="date-of-birth"
                autoComplete="bday"
                max={maxDateOfBirth}
                value={dateOfBirth}
                onChange={(event) => setDateOfBirth(event.target.value)}
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
                onChange={(event) => setAddress(event.target.value)}
                required
              />
            </label>
            <label>
              Town or city
              <input
                type="text"
                name="city"
                autoComplete="address-level2"
                maxLength={100}
                value={city}
                onChange={(event) => setCity(event.target.value)}
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
                onChange={(event) => setPostcode(event.target.value)}
                required
              />
            </label>
            <label>
              Membership interests
              <select
                name="membership-interest"
                value={membershipInterest}
                onChange={(event) => setMembershipInterest(event.target.value)}
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
            value={email}
            onChange={(event) => setEmail(event.target.value)}
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
                minLength={8}
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
            {isRegister && <span className="account-help">Use at least 8 characters.</span>}
          </label>
        )}
        {isRegister && (
          <label>
            Confirm password
            <input
              type={showPassword ? 'text' : 'password'}
              name="password-confirmation"
              autoComplete="new-password"
              minLength={8}
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
