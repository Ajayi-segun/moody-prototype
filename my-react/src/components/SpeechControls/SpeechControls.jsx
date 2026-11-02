import { useEffect, useRef, useState } from 'react'
import './SpeechControls.css'

const narratorAliases = [
  { label: 'Voice 1 - Susan', name: 'susan' },
  { label: 'Voice 2 - George', name: 'george' },
  { label: 'Voice 3 - Hazel', name: 'hazel' },
]

function findNarratorVoice(voices, name) {
  const matches = voices.filter((voice) => voice.name.toLowerCase().includes(name))
  return matches.find((voice) => voice.lang.toLowerCase() === 'en-gb')
    ?? matches.find((voice) => voice.lang.toLowerCase().startsWith('en'))
    ?? matches[0]
}

function SpeechControls() {
  const supportsSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [voices, setVoices] = useState([])
  const [voiceName, setVoiceName] = useState('')
  const [rate, setRate] = useState(1)
  const [isReading, setIsReading] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [clickToRead, setClickToRead] = useState(false)
  const [isVisible, setIsVisible] = useState(true)
  const [notice, setNotice] = useState(() => (
    supportsSpeech ? '' : 'Read-aloud is not available in this browser.'
  ))
  const narratorChoices = narratorAliases
    .map((alias) => ({
      label: alias.label,
      voice: findNarratorVoice(voices, alias.name),
    }))
    .filter((choice) => choice.voice)
  const textRef = useRef('')
  const offsetRef = useRef(0)
  const voiceRef = useRef('')
  const rateRef = useRef(1)

  useEffect(() => {
    if (!supportsSpeech) return undefined

    function loadVoices() {
      setVoices(window.speechSynthesis.getVoices())
    }

    loadVoices()
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices)
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices)
      window.speechSynthesis.cancel()
    }
  }, [supportsSpeech])

  useEffect(() => {
    voiceRef.current = voiceName
    rateRef.current = rate
  }, [rate, voiceName])

  function readText(text, startAt = 0) {
    const speech = window.speechSynthesis
    if (!speech || !text.trim()) {
      setNotice('Select some text or open a page with content to read.')
      return
    }

    speech.cancel()
    const utterance = new SpeechSynthesisUtterance(text.slice(startAt))
    utterance.rate = rateRef.current
    utterance.onboundary = (event) => {
      if (typeof event.charIndex === 'number') {
        offsetRef.current = startAt + event.charIndex
      }
    }
    utterance.onend = () => {
      setIsReading(false)
      setIsPaused(false)
      offsetRef.current = text.length
    }
    utterance.onerror = () => {
      setIsReading(false)
      setIsPaused(false)
      setNotice('The selected voice could not read this text. Please choose another voice.')
    }

    const voice = speech.getVoices().find((item) => item.name === voiceRef.current)
    if (voice) utterance.voice = voice

    textRef.current = text
    offsetRef.current = startAt
    setNotice('')
    setIsReading(true)
    setIsPaused(false)
    speech.speak(utterance)
  }

  function play() {
    const selectedText = window.getSelection()?.toString().trim()
    const mainContent = document.getElementById('main-content')
    readText(selectedText || mainContent?.innerText || '')
  }

  function toggleReading() {
    const speech = window.speechSynthesis
    if (speech.speaking && !speech.paused) {
      speech.pause()
      setIsPaused(true)
      return
    }
    if (speech.paused) {
      speech.resume()
      setIsPaused(false)
      return
    }
    play()
  }

  function changeRate(nextRate) {
    const speech = window.speechSynthesis
    const shouldResume = speech.speaking && !speech.paused
    const shouldRestart = speech.speaking || speech.paused
    const text = textRef.current
    const offset = offsetRef.current

    rateRef.current = nextRate
    setRate(nextRate)
    if (!shouldRestart || !text) return

    readText(text, offset)
    if (!shouldResume) {
      window.setTimeout(() => {
        speech.pause()
        setIsPaused(true)
      }, 0)
    }
  }

  function changeVoice(nextVoice) {
    const speech = window.speechSynthesis
    const shouldResume = speech.speaking && !speech.paused
    const shouldRestart = speech.speaking || speech.paused
    const text = textRef.current
    const offset = offsetRef.current

    voiceRef.current = nextVoice
    setVoiceName(nextVoice)
    if (!shouldRestart || !text) return

    readText(text, offset)
    if (!shouldResume) {
      window.setTimeout(() => {
        speech.pause()
        setIsPaused(true)
      }, 0)
    }
  }

  function rewind() {
    const text = textRef.current
    if (!text) {
      play()
      return
    }

    const words = [...text.slice(0, offsetRef.current).matchAll(/\S+/g)]
    const startAt = words[Math.max(0, words.length - 5)]?.index ?? 0
    readText(text, startAt)
  }

  useEffect(() => {
    if (!clickToRead) return undefined

    function readClickedText(event) {
      if (event.target.closest('a, button, input, select, textarea, summary')) return

      const mainContent = document.getElementById('main-content')
      if (!mainContent?.contains(event.target)) return

      const documentWithCaret = document
      const range = documentWithCaret.caretRangeFromPoint?.(event.clientX, event.clientY)
      const position = documentWithCaret.caretPositionFromPoint?.(event.clientX, event.clientY)
      const node = range?.startContainer ?? position?.offsetNode
      const offset = range?.startOffset ?? position?.offset
      if (!node || typeof offset !== 'number') return

      const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement
      const block = element?.closest('p, li, h1, h2, h3, blockquote, article')
      if (!block) return

      const prefix = document.createRange()
      prefix.selectNodeContents(block)
      prefix.setEnd(node, offset)
      readText(block.innerText, prefix.toString().length)
    }

    document.addEventListener('click', readClickedText)
    return () => document.removeEventListener('click', readClickedText)
  }, [clickToRead])

  function stop() {
    window.speechSynthesis?.cancel()
    setIsReading(false)
    setIsPaused(false)
  }

  return (
    <>
    <section
      className="speech-controls"
      aria-labelledby="speech-controls-heading"
      data-speech-controls
      id="speech-controls-panel"
      hidden={!isVisible}
    >
      <div className="speech-controls-copy">
        <span className="speech-controls-icon" aria-hidden="true">◖</span>
        <p className="eyebrow">Accessibility</p>
        <p id="speech-controls-heading" className="speech-controls-title">Read aloud</p>
        <p>Select a passage and press Read, or start with the whole page. Take it at your pace.</p>
      </div>
      <button
        type="button"
        className="speech-hide-button"
        onClick={() => setIsVisible(false)}
        aria-label="Hide read-aloud controls"
        aria-expanded={isVisible}
        aria-controls="speech-controls-panel"
      >
        <span aria-hidden="true">×</span>
        <span className="visually-hidden">Hide read-aloud controls</span>
      </button>
      <div className="speech-controls-actions">
        <button
          type="button"
          className="speech-read-button"
          onClick={toggleReading}
          disabled={!supportsSpeech}
        >
          <span aria-hidden="true">{isReading && !isPaused ? 'Ⅱ' : '▶'}</span>
          {isPaused ? 'Continue' : isReading ? 'Pause' : 'Read'}
        </button>
        <button type="button" onClick={rewind} disabled={!supportsSpeech}>
          ↶ <span>Back 5 words</span>
        </button>
        <button type="button" onClick={stop} disabled={!isReading}>
          Stop
        </button>
        <label>
          Narrator
          <select
            value={voiceName}
            onChange={(event) => changeVoice(event.target.value)}
            disabled={voices.length === 0}
          >
            <option value="">Default</option>
            {narratorChoices.map(({ label, voice }) => (
              <option key={`${voice.name}-${voice.lang}`} value={voice.name}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Read speed · {rate.toFixed(2)}×
          <input
            type="range"
            min="0.75"
            max="1.5"
            step="0.25"
            value={rate}
            onChange={(event) => changeRate(Number(event.target.value))}
          />
        </label>
        <label className="speech-click-option">
          <input
            type="checkbox"
            checked={clickToRead}
            onChange={(event) => setClickToRead(event.target.checked)}
          />
          Click on text to start reading from there
        </label>
      </div>
      <p className="speech-status" role="status" aria-live="polite">{notice}</p>
    </section>
    {!isVisible && (
      <button
        type="button"
        className="speech-show-button"
        onClick={() => setIsVisible(true)}
        aria-controls="speech-controls-panel"
        aria-expanded={isVisible}
        aria-label="Show read-aloud controls"
      >
        <span aria-hidden="true">◖</span>
        Read aloud
      </button>
    )}
    </>
  )
}

export default SpeechControls
