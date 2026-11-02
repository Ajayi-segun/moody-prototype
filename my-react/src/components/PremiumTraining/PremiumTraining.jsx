import { useEffect, useState } from 'react'
import { apiRequest } from '../../lib/api.js'
import './PremiumTraining.css'

function localDate() {
  const date = new Date()
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function PremiumTraining({ user }) {
  const [isLoading, setIsLoading] = useState(Boolean(user))
  const [isPremium, setIsPremium] = useState(false)
  const [training, setTraining] = useState({ routines: [], workouts: [] })
  const [routineName, setRoutineName] = useState('')
  const [routineGoal, setRoutineGoal] = useState('strength')
  const [routineExercises, setRoutineExercises] = useState('')
  const [routineConsent, setRoutineConsent] = useState(false)
  const [workoutName, setWorkoutName] = useState('')
  const [workoutDate, setWorkoutDate] = useState(localDate)
  const [duration, setDuration] = useState('')
  const [exerciseLog, setExerciseLog] = useState('')
  const [workoutConsent, setWorkoutConsent] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return undefined

    let active = true
    async function loadTraining() {
      try {
        const membership = await apiRequest('/membership')
        if (!active) return
        setIsPremium(membership.is_premium)
        if (membership.is_premium) {
          const result = await apiRequest('/premium/training')
          if (active) setTraining(result)
        }
      } catch (requestError) {
        if (active) setError(requestError.message)
      } finally {
        if (active) setIsLoading(false)
      }
    }

    loadTraining()
    return () => {
      active = false
    }
  }, [user])

  async function saveRoutine(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setIsSaving(true)
    try {
      const result = await apiRequest('/premium/routines', {
        method: 'POST',
        body: {
          name: routineName.trim(),
          goal: routineGoal,
          exercises: routineExercises.split('\n').map((exercise) => exercise.trim()).filter(Boolean),
          consent: routineConsent,
        },
      })
      setTraining((current) => ({
        ...current,
        routines: [result.routine, ...current.routines],
      }))
      setRoutineName('')
      setRoutineExercises('')
      setRoutineConsent(false)
      setNotice('Your custom workout routine has been saved.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSaving(false)
    }
  }

  async function saveWorkout(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    const exercises = exerciseLog.split('\n').map((line) => {
      const [name, sets, reps, weightKg] = line.split(',').map((value) => value.trim())
      return {
        name,
        sets: Number(sets),
        reps: Number(reps),
        weight_kg: Number(weightKg),
      }
    })
    if (exercises.some((exercise) => (
      !exercise.name
      || !Number.isInteger(exercise.sets)
      || !Number.isInteger(exercise.reps)
      || !Number.isFinite(exercise.weight_kg)
    ))) {
      setError('Enter each exercise as: name, sets, reps, weight in kg. Use one exercise per line.')
      return
    }

    setIsSaving(true)
    try {
      const result = await apiRequest('/premium/workouts', {
        method: 'POST',
        body: {
          name: workoutName.trim(),
          workout_date: workoutDate,
          duration_minutes: Number(duration),
          exercises,
          consent: workoutConsent,
        },
      })
      setTraining((current) => ({
        ...current,
        workouts: [result.workout, ...current.workouts],
      }))
      setWorkoutName('')
      setDuration('')
      setExerciseLog('')
      setWorkoutConsent(false)
      setNotice('Your workout was added to your history.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteItem(type, item) {
    if (!window.confirm(`Delete "${item.name}" from your account?`)) return

    setError('')
    setNotice('')
    try {
      const result = await apiRequest(`/premium/${type}/${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
      })
      setTraining((current) => ({
        ...current,
        [type === 'workouts' ? 'workouts' : 'routines']: current[
          type === 'workouts' ? 'workouts' : 'routines'
        ].filter((entry) => entry.id !== item.id),
      }))
      setNotice(result.message)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <section className="premium-training standalone-page" aria-labelledby="premium-training-heading">
      <p className="eyebrow">Premium member tools</p>
      <h1 id="premium-training-heading">Your training, your progress</h1>
      {!user ? (
        <p>Sign in with an active Premium membership to create routines and save workout history. <a href="/sign-in">Sign in</a> or <a href="/membership">compare memberships</a>.</p>
      ) : isLoading ? (
        <p role="status">Loading your member training…</p>
      ) : error ? (
        <div className="premium-error" role="alert">
          <p>We could not verify your membership or load your training records.</p>
          <p>{error}</p>
          <button type="button" onClick={() => window.location.reload()}>Try again</button>
        </div>
      ) : !isPremium ? (
        <div className="premium-lock">
          <h2>Premium membership required</h2>
          <p>Save custom routines and review your progress over time with Premium.</p>
          <a className="premium-action" href="/membership">Explore Premium</a>
        </div>
      ) : (
        <>
          <p className="page-intro">Create routines, record sets and repetitions, and compare your training history. Your records are private to your account.</p>
          {notice && <p className="premium-notice" role="status">{notice}</p>}
          {error && <p className="premium-error" role="alert">{error}</p>}

          <div className="premium-forms">
            <form className="premium-form" onSubmit={saveRoutine}>
              <h2>Create a routine</h2>
              <label>
                Routine name
                <input value={routineName} onChange={(event) => setRoutineName(event.target.value)} minLength={2} maxLength={80} required />
              </label>
              <label>
                Training goal
                <select value={routineGoal} onChange={(event) => setRoutineGoal(event.target.value)}>
                  <option value="strength">Build strength</option>
                  <option value="fitness">General fitness</option>
                  <option value="mobility">Improve mobility</option>
                  <option value="endurance">Build endurance</option>
                </select>
              </label>
              <label>
                Exercises (one per line)
                <textarea value={routineExercises} onChange={(event) => setRoutineExercises(event.target.value)} maxLength={2500} rows={4} required />
              </label>
              <label className="premium-consent">
                <input type="checkbox" checked={routineConsent} onChange={(event) => setRoutineConsent(event.target.checked)} required />
                I consent to saving this routine with my account.
              </label>
              <button type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save routine'}</button>
            </form>

            <form className="premium-form" onSubmit={saveWorkout}>
              <h2>Log a workout</h2>
              <label>
                Workout name
                <input value={workoutName} onChange={(event) => setWorkoutName(event.target.value)} minLength={2} maxLength={80} required />
              </label>
              <div className="premium-form-row">
                <label>
                  Date
                  <input type="date" value={workoutDate} onChange={(event) => setWorkoutDate(event.target.value)} required />
                </label>
                <label>
                  Duration (minutes)
                  <input type="number" min="1" max="300" value={duration} onChange={(event) => setDuration(event.target.value)} required />
                </label>
              </div>
              <label>
                Exercise, sets, reps, weight in kg (one per line)
                <textarea value={exerciseLog} onChange={(event) => setExerciseLog(event.target.value)} placeholder={'Squat, 3, 10, 40\\nDumbbell row, 3, 12, 16'} rows={4} required />
              </label>
              <label className="premium-consent">
                <input type="checkbox" checked={workoutConsent} onChange={(event) => setWorkoutConsent(event.target.checked)} required />
                I consent to saving these fitness records with my account. I can delete them below.
              </label>
              <button type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save workout'}</button>
            </form>
          </div>

          <section className="premium-history" aria-labelledby="routine-history-heading">
            <h2 id="routine-history-heading">Your routines</h2>
            {training.routines.length ? (
              <ul>
                {training.routines.map((routine) => (
                  <li key={routine.id}>
                    <div><strong>{routine.name}</strong><span>{routine.goal} · {routine.exercises.join(', ')}</span></div>
                    <button type="button" onClick={() => deleteItem('routines', routine)}>Delete</button>
                  </li>
                ))}
              </ul>
            ) : <p>No saved routines yet.</p>}
          </section>

          <section className="premium-history" aria-labelledby="workout-history-heading">
            <h2 id="workout-history-heading">Workout history</h2>
            {training.workouts.length ? (
              <ul>
                {training.workouts.map((workout) => (
                  <li key={workout.id}>
                    <div>
                      <strong>{workout.name} · {workout.workout_date}</strong>
                      <span>{workout.duration_minutes} minutes · {workout.exercises.map((exercise) => `${exercise.name}: ${exercise.sets} × ${exercise.reps} at ${exercise.weight_kg} kg`).join('; ')}</span>
                    </div>
                    <button type="button" onClick={() => deleteItem('workouts', workout)}>Delete</button>
                  </li>
                ))}
              </ul>
            ) : <p>No workouts logged yet.</p>}
          </section>
          <p className="premium-privacy-note">Workout records are private to your account and are stored only after you consent. You can delete any saved routine or record here.</p>
        </>
      )}
    </section>
  )
}

export default PremiumTraining
