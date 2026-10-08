/*
 * This component highlights the newest updates from ToKa Fitness.
 * It gives members a quick view of timely classes, guidance and tools.
 */
import './Specials.css'

const fitnessImage = 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=800&q=80'

function Specials() {
  return (
    <aside className="monthly-updates" aria-labelledby="monthly-heading">
      <div className="update-copy">
        <h2 id="monthly-heading">New This Month</h2>
        <ul>
          <li>A refreshed class timetable</li>
          <li>Updated meal-plan guidance</li>
          <li>A new members' blog feed</li>
          <li>A live gym crowd meter</li>
        </ul>
      </div>
      <figure className="image-figure image-square">
        <img
          className="image-content"
          src={fitnessImage}
          alt="A fit person training in the gym with a focus on strength and wellness."
        />
      </figure>
    </aside>
  )
}

export default Specials
