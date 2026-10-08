import { useState } from 'react'
import './WorkoutLibrary.css'

const workouts = [
  {
    id: 'chest',
    name: 'Chest',
    focus: 'Pressing strength and controlled pushing patterns.',
    videos: [
      { title: 'Bench press', file: 'bench-press.mp4' },
      { title: 'Incline press', file: 'incline-press.mp4' },
    ],
    exercises: [
      { name: 'Push-up', instruction: 'Keep your body in a straight line, lower with control, and press the floor away.', equipment: 'Bodyweight' },
      { name: 'Dumbbell bench press', instruction: 'Keep feet planted, lower dumbbells beside your chest, then press up without locking your elbows.', equipment: 'Dumbbells and bench' },
      { name: 'Incline push-up', instruction: 'Place hands on a secure raised surface and keep your core gently braced as you lower.', equipment: 'Bench or sturdy surface' },
    ],
  },
  {
    id: 'back',
    name: 'Back',
    focus: 'Pulling movements for your upper back and lats.',
    videos: [
      { title: 'Bent-over row', file: 'bent-over-row.mp4' },
      { title: 'Deadlift: back position', file: 'deadlift.mp4', note: 'This is a compound lift. Follow the form guidance and use a light or no weight while learning.' },
    ],
    exercises: [
      { name: 'Dumbbell row', instruction: 'Hinge at the hips with a flat back, pull your elbow toward your hip, and lower slowly.', equipment: 'Dumbbell and bench' },
      { name: 'Lat pulldown', instruction: 'Sit tall, pull the bar toward your upper chest, and let it rise under control.', equipment: 'Cable machine' },
      { name: 'Resistance-band row', instruction: 'Anchor the band safely, sit tall, draw elbows back, and squeeze shoulder blades gently.', equipment: 'Resistance band' },
    ],
  },
  {
    id: 'legs',
    name: 'Legs',
    focus: 'Build lower-body strength with steady, balanced movement.',
    videos: [
      { title: 'Deadlift: lower-body hinge', file: 'deadlift.mp4', note: 'Learn the hip hinge with no weight first; this is not a substitute for coaching.' },
    ],
    exercises: [
      { name: 'Bodyweight squat', instruction: 'Sit your hips back, keep your knees tracking over your toes, and stand through your whole foot.', equipment: 'Bodyweight' },
      { name: 'Reverse lunge', instruction: 'Step back to a comfortable stance, lower both knees with control, then push through the front foot.', equipment: 'Bodyweight or light dumbbells' },
      { name: 'Glute bridge', instruction: 'Lie on your back, brace gently, lift your hips without arching your lower back, and lower slowly.', equipment: 'Mat' },
    ],
  },
  {
    id: 'abs',
    name: 'Abs & core',
    focus: 'Train trunk control, not just repetitions.',
    videos: [
      { title: 'Deadlift: bracing your core', file: 'deadlift.mp4', note: 'This compound lift uses the core to brace; it is not an abs-isolation exercise.' },
    ],
    exercises: [
      { name: 'Dead bug', instruction: 'Keep your lower back gently connected to the mat while reaching opposite arm and leg away.', equipment: 'Mat' },
      { name: 'Bird dog', instruction: 'From hands and knees, reach opposite arm and leg long without letting your hips twist.', equipment: 'Mat' },
      { name: 'Knee plank', instruction: 'Keep a straight line from shoulders to knees, gently brace your middle, and breathe steadily.', equipment: 'Mat' },
    ],
  },
  {
    id: 'shoulders',
    name: 'Shoulders',
    focus: 'Controlled shoulder work with a comfortable range of motion.',
    videos: [
      { title: 'Incline press: shoulder involvement', file: 'incline-press.mp4', note: 'This compound press also uses the front of the shoulders; it is not a shoulder-isolation exercise.' },
    ],
    exercises: [
      { name: 'Seated dumbbell press', instruction: 'Start at shoulder height and press smoothly overhead without leaning your back.', equipment: 'Light dumbbells and bench' },
      { name: 'Lateral raise', instruction: 'With soft elbows, raise light weights out to the sides only as high as feels comfortable.', equipment: 'Light dumbbells' },
      { name: 'Wall slide', instruction: 'Stand against a wall and slide your arms up slowly while keeping your ribs relaxed.', equipment: 'Wall' },
    ],
  },
  {
    id: 'arms',
    name: 'Arms',
    focus: 'Simple biceps and triceps movements with good control.',
    videos: [
      { title: 'Bench press: triceps assistance', file: 'bench-press.mp4', note: 'The triceps help extend the arms in this compound chest press.' },
    ],
    exercises: [
      { name: 'Dumbbell curl', instruction: 'Keep elbows close to your sides and lift without swinging your body.', equipment: 'Light dumbbells' },
      { name: 'Triceps extension', instruction: 'Use a light weight, keep elbows pointing forward, and move only through a comfortable range.', equipment: 'Light dumbbell' },
      { name: 'Close-grip wall push-up', instruction: 'Place hands just inside shoulder width on a wall and keep elbows close as you press.', equipment: 'Wall' },
    ],
  },
]

const goals = {
  strength: { label: 'Build strength', reps: '6–8', rest: '90–120 seconds' },
  muscle: { label: 'Build muscle', reps: '8–12', rest: '60–90 seconds' },
  endurance: { label: 'Improve endurance', reps: '12–15', rest: '45–60 seconds' },
}

const levels = {
  beginner: { label: 'New to training', sets: '1–2', note: 'Practise the movement without weight first and start with one set if you are unsure.' },
  regular: { label: 'I train regularly', sets: '2–3', note: 'Use a manageable weight and finish each set with a few good reps still possible.' },
}

function WorkoutLibrary() {
  const [activeWorkout, setActiveWorkout] = useState(workouts[0].id)
  const [goal, setGoal] = useState('muscle')
  const [level, setLevel] = useState('beginner')
  const [lockedIn, setLockedIn] = useState(false)

  const workout = workouts.find((item) => item.id === activeWorkout) ?? workouts[0]
  const recommendation = goals[goal]
  const experience = levels[level]
  return (
    <section className="workout-library" aria-labelledby="workout-library-heading">
      <div className="workout-library-heading">
        <p className="eyebrow">ToKa guided training</p>
        <h1 id="workout-library-heading">Choose your workout</h1>
        <p>Pick a muscle group and a goal to get clear exercise cues, on-page video demos, and a plan you can adjust to your experience.</p>
      </div>

      <div className="workout-preferences">
        <label>
          Your goal
          <select value={goal} onChange={(event) => setGoal(event.target.value)}>
            {Object.entries(goals).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
          </select>
        </label>
        <label>
          Your experience
          <select value={level} onChange={(event) => setLevel(event.target.value)}>
            {Object.entries(levels).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
          </select>
        </label>
      </div>

      <div className="workout-tabs" role="group" aria-label="Choose a muscle group">
        {workouts.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={activeWorkout === item.id}
            onClick={() => {
              setActiveWorkout(item.id)
              setLockedIn(false)
            }}
          >
            {item.name}
          </button>
        ))}
      </div>

      <div className="workout-focus">
        <div>
          <p className="eyebrow">Today’s focus</p>
          <h2>{workout.name}</h2>
          <p>{workout.focus}</p>
        </div>
        <p>Play the ToKa exercise demos below without leaving this page.</p>
      </div>

      <div className="demo-section" aria-labelledby="demo-heading">
        <h2 id="demo-heading">Watch the {workout.name.toLowerCase()} demos</h2>
        <div className="demo-grid">
          {workout.videos.map((video) => (
            <article className="demo-card" key={video.file}>
              <h3>{video.title}</h3>
              <video
                className="exercise-video"
                controls
                preload="none"
                playsInline
                aria-label={`${video.title} workout demonstration`}
              >
                <source src={`/videos/${video.file}`} type="video/mp4" />
                Your browser does not support this video.
              </video>
              {video.note && <p className="demo-note">{video.note}</p>}
            </article>
          ))}
        </div>
      </div>

      <div className="exercise-list">
        {workout.exercises.map((exercise, index) => (
          <article className="exercise-card" key={exercise.name}>
            <div className="exercise-card-top">
              <span className="exercise-number">0{index + 1}</span>
              <span className="exercise-equipment">{exercise.equipment}</span>
            </div>
            <h3>{exercise.name}</h3>
            <p>{exercise.instruction}</p>
            <dl className="exercise-plan">
              <div><dt>Sets</dt><dd>{experience.sets}</dd></div>
              <div><dt>Reps</dt><dd>{recommendation.reps}</dd></div>
              <div><dt>Rest</dt><dd>{recommendation.rest}</dd></div>
            </dl>
          </article>
        ))}
      </div>

      <aside className={`lock-in-panel${lockedIn ? ' lock-in-active' : ''}`} aria-live="polite">
        <div>
          <h2>{lockedIn ? 'You’re locked in.' : 'Ready to lock in?'}</h2>
          <p>
            {lockedIn
              ? `Your ${workout.name.toLowerCase()} session is set. Focus on smooth form, breathe, and take a break whenever you need one.`
              : `${experience.note} Choose a pace that feels safe and keep your technique steady.`}
          </p>
        </div>
        <button type="button" onClick={() => setLockedIn((current) => !current)}>
          {lockedIn ? 'Reset focus' : 'Lock in'}
        </button>
      </aside>

      <p className="workout-safety">
        Warm up first, use a safe space and equipment, and stop if you feel pain or unwell. If you are under 18, new to exercise, or have a health concern, check with a trusted adult or qualified professional before starting.
      </p>
      <p className="workout-video-note">
        Videos are stored on ToKa Fitness and play here, so no trip to YouTube is needed. Some clips show compound lifts that work more than one muscle group; notes explain where a demo is a supporting example rather than a direct isolation exercise.
      </p>
      <details className="video-credits">
        <summary>Video credits and licences</summary>
        <ul>
          <li>
            FitnessScape, <a href="https://commons.wikimedia.org/wiki/File:Bench_press_-_exercise_demonstration_video.webm" target="_blank" rel="noreferrer">Bench press</a>, <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC BY 3.0</a>. Re-encoded from WebM to MP4.
          </li>
          <li>
            FitnessScape, <a href="https://commons.wikimedia.org/wiki/File:Bent-over_row_-_exercise_demonstration_video.webm" target="_blank" rel="noreferrer">Bent-over row</a>, <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC BY 3.0</a>. Re-encoded from WebM to MP4.
          </li>
          <li>
            FitnessScape, <a href="https://commons.wikimedia.org/wiki/File:Deadlift_-_exercise_demonstration_video.webm" target="_blank" rel="noreferrer">Deadlift</a>, <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC BY 3.0</a>. Re-encoded from WebM to MP4.
          </li>
          <li>
            FitnessScape, <a href="https://commons.wikimedia.org/wiki/File:Incline_press_-_exercise_demonstration_video.webm" target="_blank" rel="noreferrer">Incline press</a>, <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC BY 3.0</a>. Re-encoded from WebM to MP4.
          </li>
        </ul>
      </details>
    </section>
  )
}

export default WorkoutLibrary
