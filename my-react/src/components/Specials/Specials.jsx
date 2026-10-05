/*
 * This component highlights the newest updates from ToKa Fitness.
 * It gives members a quick view of timely classes, guidance and tools.
 */
import monthlyTrainingPhoto from '../../assets/monthly-training.jpg'
import './Specials.css'

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
          src={monthlyTrainingPhoto}
          alt="A gym member training beside a rack of dumbbells."
        />
      </figure>
    </aside>
  )
}

export default Specials
