import { useEffect, useState } from 'react'
import { apiRequest } from '../../lib/api.js'
import './MembershipPage.css'

const membershipPlans = [
  {
    id: 'free',
    name: 'Free',
    price_gbp: 0,
    interval: null,
    label: 'Your first rep',
    description: 'A little momentum, completely free.',
    benefits: [
      'Fitness and healthy-living articles',
      'Introductory exercise videos and general guidance',
      'BMI calculator and display accessibility tools',
      'Member community and private messaging',
    ],
    checkout_enabled: false,
  },
  {
    id: 'premium',
    name: 'Premium',
    price_gbp: 18,
    interval: 'month',
    label: 'Build your rhythm',
    description: 'Your training, with a plan to match.',
    benefits: [
      'Everything in Free',
      'Create and save private custom training routines',
      'Log exercises, sets, reps, weights, and workout history',
    ],
    checkout_enabled: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price_gbp: 30,
    interval: 'month',
    label: 'Get coached',
    description: 'More accountability. More high-fives.',
    benefits: [
      'Everything in Premium',
      'Small-group coaching sessions',
      'Monthly coach check-in and progress review',
    ],
    checkout_enabled: false,
  },
  {
    id: 'ultimate',
    name: 'Ultimate',
    price_gbp: 40,
    interval: 'month',
    label: 'Full-send support',
    description: 'The full ToKa team in your corner.',
    benefits: [
      'Everything in Pro',
      'One personal training session each month',
      'Monthly training and nutrition-guidance review',
      'Priority support from the ToKa Fitness team',
    ],
    checkout_enabled: false,
  },
]

function MembershipPage({ user, loading }) {
  const [membership, setMembership] = useState(null)
  const [isLoading, setIsLoading] = useState(Boolean(user))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const paymentResult = new URLSearchParams(window.location.search).get('payment')

  useEffect(() => {
    if (!user) return undefined

    let active = true
    apiRequest('/membership')
      .then((result) => {
        if (active) setMembership(result)
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [user])

  async function startCheckout(planId) {
    if (!user) {
      window.history.pushState({}, '', '/sign-in?next=/membership')
      window.dispatchEvent(new PopStateEvent('popstate'))
      return
    }

    setError('')
    setNotice('')
    setIsSubmitting(true)
    try {
      const result = await apiRequest('/payments/checkout', {
        method: 'POST',
        body: { plan: planId },
      })
      window.location.assign(result.checkout_url)
    } catch (requestError) {
      setError(requestError.message)
      setIsSubmitting(false)
    }
  }

  async function openBillingPortal() {
    setError('')
    setIsSubmitting(true)
    try {
      const result = await apiRequest('/payments/portal', { method: 'POST' })
      window.location.assign(result.portal_url)
    } catch (requestError) {
      setError(requestError.message)
      setIsSubmitting(false)
    }
  }

  const plans = membership?.plans ?? membershipPlans
  const hasActivePaidPlan = membership?.is_premium === true

  return (
    <section className="membership-page standalone-page" aria-labelledby="membership-heading">
      <header className="membership-hero">
        <p className="eyebrow">Strong fits. No guesswork.</p>
        <h1 id="membership-heading">Your next level has your name on it.</h1>
        <p className="page-intro">
          Dip a toe in for free, train with more structure, or get a coach in your corner.
          Pick the support that fits your life right now. You can grow from here.
        </p>
        <span className="membership-hero-note">
          All paid plans are month-to-month · No hidden fees · Cancel online
        </span>
      </header>

      {paymentResult === 'success' && (
        <p className="membership-notice" role="status">
          Payment received. Your membership will appear here once Stripe confirms it. Nice one!
        </p>
      )}
      {paymentResult === 'cancelled' && (
        <p className="membership-notice" role="status">Checkout was cancelled. No payment was made.</p>
      )}
      {notice && <p className="membership-notice" role="status">{notice}</p>}
      {error && <p className="membership-error" role="alert">{error}</p>}

      <div className="membership-plan-grid">
        {plans.map((plan) => {
          const description = membershipPlans.find((item) => item.id === plan.id)
          const currentPlan = membership?.tier === plan.id && membership?.is_premium
          const checkoutEnabled = membership ? plan.checkout_enabled : false

          return (
            <article
              className={`membership-plan${plan.id === 'pro' ? ' membership-plan-featured' : ''}${plan.id === 'ultimate' ? ' membership-plan-ultimate' : ''}`}
              key={plan.id}
              aria-labelledby={`membership-plan-${plan.id}`}
            >
              <p className="membership-plan-kicker">{description?.label}</p>
              <h2 id={`membership-plan-${plan.id}`}>{plan.name}</h2>
              <p className="membership-plan-description">{description?.description}</p>
              <p className="membership-price">
                <span className="membership-currency">£</span>{plan.price_gbp}
                <span className="membership-price-period">{plan.interval ? '/ month' : '/ forever'}</span>
              </p>
              <ul>
                {plan.benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}
              </ul>
              {currentPlan ? (
                <>
                  <p className="membership-current-plan" role="status">You’re on this plan now. Nice work.</p>
                  <button
                    className="membership-plan-action"
                    type="button"
                    onClick={openBillingPortal}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Opening…' : 'Manage your plan'}
                  </button>
                </>
              ) : plan.id === 'free' ? (
                <a className="membership-plan-action membership-secondary-action" href="/training">
                  Take a look around
                </a>
              ) : (
                <button
                  className="membership-plan-action"
                  type="button"
                  onClick={() => (
                    hasActivePaidPlan ? openBillingPortal() : startCheckout(plan.id)
                  )}
                  disabled={
                    isSubmitting
                    || loading
                    || (user && (isLoading || !membership))
                    || (!hasActivePaidPlan && !checkoutEnabled)
                  }
                >
                  {isSubmitting
                    ? 'Opening secure checkout…'
                    : loading || (user && isLoading)
                      ? 'Checking availability…'
                      : !user
                        ? 'Sign in to choose this plan'
                        : hasActivePaidPlan
                          ? 'Manage in secure billing'
                          : checkoutEnabled
                            ? `Choose ${plan.name}`
                            : 'Online checkout coming soon'}
                </button>
              )}
              {plan.id === 'pro' && (
                <p className="membership-plan-footnote">For the days when “I’ll do it tomorrow” needs a coach.</p>
              )}
            </article>
          )
        })}
      </div>

      <p className="membership-payment-note">
        Every paid membership is billed monthly in GBP. Stripe securely handles payments and receipts;
        ToKa Fitness never stores card details. Change or cancel your membership from your secure
        billing portal. Coaching, training, and nutrition-review benefits are coordinated directly
        with ToKa Fitness staff; they are not automatically scheduled by this website.
      </p>
      <p><a href="/contact">Questions about membership? Contact ToKa Fitness.</a></p>
      {!user && (
        <p className="membership-signup-prompt">
          New around here? <a href="/register">Create your free account</a> and get moving.
        </p>
      )}
    </section>
  )
}

export default MembershipPage
