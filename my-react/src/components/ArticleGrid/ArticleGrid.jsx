/*
 * This component presents four key areas of ToKa Fitness content.
 * The cards give visitors clear routes into practical training and wellbeing advice.
 */
import { useState } from 'react'
import './ArticleGrid.css'

const articles = [
  {
    title: 'Training Advice',
    category: 'Training',
    image: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?auto=format&fit=crop&w=1000&q=80',
    imageDescription: 'A gym member lifting dumbbells during strength training.',
    description: 'Build strength with clear, beginner-friendly training tips. Find a pace that feels right for you.',
  },
  {
    title: 'Healthy Living',
    category: 'Wellbeing',
    image: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=1000&q=80',
    imageDescription: 'A colourful, balanced meal to support an active lifestyle.',
    description: 'Explore everyday ideas for food, rest and movement. Small, steady choices can support your wellbeing.',
  },
  {
    title: 'Member Stories',
    category: 'Stories',
    image: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1000&q=80',
    imageDescription: 'A woman stretching on a mat during a workout.',
    description: 'Read how members make fitness work around busy schedules, new goals and different access needs.',
  },
  {
    title: 'Workout Library',
    category: 'Training',
    image: 'https://images.unsplash.com/photo-1599058945522-28d584b6f0ff?auto=format&fit=crop&w=1000&q=80',
    imageDescription: 'A gym member training with free weights.',
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
