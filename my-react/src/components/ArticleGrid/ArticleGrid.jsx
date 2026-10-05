/*
 * This component presents four key areas of ToKa Fitness content.
 * The cards give visitors clear routes into practical training and wellbeing advice.
 */
import { useState } from 'react'
import trainingPhoto from '../../assets/training-advice.jpg'
import healthyLivingPhoto from '../../assets/healthy-living.jpg'
import memberStoriesPhoto from '../../assets/member-stories.jpg'
import workoutLibraryPhoto from '../../assets/workout-library.jpg'
import './ArticleGrid.css'

const articles = [
  {
    title: 'Training Advice',
    category: 'Training',
    image: trainingPhoto,
    imageDescription: 'Strength-training equipment arranged in a bright gym.',
    description: 'Build strength with clear, beginner-friendly training tips. Find a pace that feels right for you.',
  },
  {
    title: 'Healthy Living',
    category: 'Wellbeing',
    image: healthyLivingPhoto,
    imageDescription: 'A colourful healthy meal with greens, vegetables and egg.',
    description: 'Explore everyday ideas for food, rest and movement. Small, steady choices can support your wellbeing.',
  },
  {
    title: 'Member Stories',
    category: 'Stories',
    image: memberStoriesPhoto,
    imageDescription: 'A woman doing a floor exercise in a bright studio.',
    description: 'Read how members make fitness work around busy schedules, new goals and different access needs.',
  },
  {
    title: 'Workout Library',
    category: 'Training',
    image: workoutLibraryPhoto,
    imageDescription: 'An athlete lifting a barbell during a strength workout.',
    description: 'Browse a growing collection of guided sessions. Choose a workout to match your time and energy.',
  },
]

function ArticleGrid() {
  const [searchTerm, setSearchTerm] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const categories = ['All', 'Training', 'Wellbeing', 'Stories']
  const visibleArticles = articles.filter((article) => {
    const matchesCategory = activeCategory === 'All' || article.category === activeCategory
    const searchText = `${article.title} ${article.description} ${article.category}`.toLowerCase()
    return matchesCategory && searchText.includes(searchTerm.trim().toLowerCase())
  })

  return (
    <section className="article-section section-shell" id="training" aria-labelledby="articles-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Move with purpose</p>
          <h2 id="articles-heading">Explore ToKa</h2>
        </div>
        <p>Helpful ideas and inspiration for every stage of your fitness journey.</p>
      </div>
      <div className="article-controls">
        <label className="article-search-label" htmlFor="article-search">Search training and wellbeing resources</label>
        <input
          className="article-search"
          id="article-search"
          type="search"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Try “strength” or “food”"
        />
        <div className="category-filters" aria-label="Filter resources by category">
          {categories.map((category) => (
            <button
              className="category-button"
              type="button"
              key={category}
              aria-pressed={activeCategory === category}
              onClick={() => setActiveCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>
      </div>
      <p className="article-results" aria-live="polite">
        {visibleArticles.length} {visibleArticles.length === 1 ? 'resource' : 'resources'} shown
      </p>
      <div className="article-grid">
        {visibleArticles.map((article) => (
          <article className="article-card" key={article.title}>
            <figure className="image-figure image-landscape">
              <img
                className="image-content"
                src={article.image}
                alt={article.imageDescription}
                loading="lazy"
              />
            </figure>
            <div className="article-card-copy">
              <h3>{article.title}</h3>
              <p>{article.description}</p>
            </div>
          </article>
        ))}
      </div>
      {visibleArticles.length === 0 && (
        <p className="no-articles">No resources match that search. Try another word or category.</p>
      )}
    </section>
  )
}

export default ArticleGrid
