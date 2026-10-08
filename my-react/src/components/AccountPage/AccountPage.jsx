import { useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import './AccountPage.css'

function AccountPage({ initialMode, user, passwordRecovery, onPasswordUpdated, loading, notice, onSignOut }) {
  const [mode, setMode] = useState(initialMode)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

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
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      setMessage('Your password has been updated.')
      onPasswordUpdated()
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

    if (!supabase) {
      setError('Registration is not connected yet. Configure the Supabase project URL and public key to create accounts.')
      return
    }

    setIsSubmitting(true)
    try {
      if (mode === 'reset') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/account`,
        })
        if (resetError) throw resetError
        setMessage('If an account exists for that address, a password reset link is on its way.')
      } else if (mode === 'register') {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: `${window.location.origin}/account`,
          },
        })
        if (signUpError) throw signUpError
        setMessage('Check your inbox for a verification link to finish creating your account.')
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError
        setMessage('You are signed in.')
      }
    } catch (requestError) {
      setError(requestError.message || 'Your request could not be completed. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return <section className="account-page" aria-live="polite">Checking your account…</section>
  }

  if (user && passwordRecovery) {
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
          <button className="account-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Please wait…' : 'Update password'}
          </button>
        </form>
        {message && <p className="account-feedback" role="status">{message}</p>}
        {error && <p className="account-error" role="alert">{error}</p>}
      </section>
    )
  }

  if (user) {
    const name = user.user_metadata?.full_name
    return (
      <section className="account-page" aria-labelledby="account-heading">
        <p className="eyebrow">Your ToKa Fitness account</p>
        <h1 id="account-heading">You’re signed in</h1>
        {name && <p>Welcome, {name}.</p>}
        <p>Your account is connected as <strong>{user.email}</strong>.</p>
        {notice && <p className="account-feedback" role="status">{notice}</p>}
        <button className="account-submit" type="button" onClick={onSignOut}>Sign out</button>
      </section>
    )
  }

  const isReset = mode === 'reset'
  const isRegister = mode === 'register'

  return (
    <section className="account-page" aria-labelledby="account-heading">
      <p className="eyebrow">ToKa Fitness member access</p>
      <h1 id="account-heading">
        {isReset ? 'Reset your password' : isRegister ? 'Create your account' : 'Welcome back'}
      </h1>
      <p className="account-intro">
        {isReset
          ? 'We’ll email you a secure link to choose a new password.'
          : 'Sign in or join ToKa Fitness to keep your account available wherever you are.'}
      </p>

      {!isReset && (
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
          <label>
            Full name
            <input
              type="text"
              name="name"
              autoComplete="name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
            />
          </label>
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
        {!isReset && (
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
        <button className="account-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? 'Please wait…'
            : isReset ? 'Send reset link' : isRegister ? 'Create account' : 'Sign in'}
        </button>
      </form>

      {mode === 'sign-in' && (
        <button className="account-text-button" type="button" onClick={() => { setMode('reset'); setMessage(''); setError('') }}>
          Forgot your password?
        </button>
      )}
      {message && <p className="account-feedback" role="status">{message}</p>}
      {notice && <p className="account-feedback" role="status">{notice}</p>}
      {error && <p className="account-error" role="alert">{error}</p>}
      {isReset && (
        <button className="account-text-button" type="button" onClick={() => { setMode('sign-in'); setMessage(''); setError('') }}>
          Back to sign in
        </button>
      )}
    </section>
  )
}

export default AccountPage
