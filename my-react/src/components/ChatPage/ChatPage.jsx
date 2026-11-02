import { useCallback, useEffect, useRef, useState } from 'react'
import { apiRequest } from '../../lib/api.js'
import './ChatPage.css'

function mergeMessages(current, incoming) {
  const messages = new Map(current.map((message) => [message.id, message]))
  for (const message of incoming) {
    messages.set(message.id, { ...messages.get(message.id), ...message })
  }
  return [...messages.values()].sort(
    (first, second) => new Date(first.created_at) - new Date(second.created_at),
  )
}

function formatConversationTime(value) {
  if (!value) return ''

  const date = new Date(value)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function ChatPage({ user }) {
  const [conversations, setConversations] = useState([])
  const [search, setSearch] = useState('')
  const [members, setMembers] = useState([])
  const [selectedMember, setSelectedMember] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [reportReason, setReportReason] = useState('spam')
  const [showReportForm, setShowReportForm] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [isPeerOnline, setIsPeerOnline] = useState(false)
  const [isPeerTyping, setIsPeerTyping] = useState(false)
  const socketRef = useRef(null)
  const messagesEndRef = useRef(null)
  const requestIdRef = useRef(0)
  const typingTimerRef = useRef(null)

  const loadInbox = useCallback(async (active = () => true) => {
    const result = await apiRequest('/chat/conversations')
    if (active()) setConversations(result.conversations)
  }, [])

  const reportChatError = useCallback(
    (requestError) => setError(requestError.message),
    [],
  )

  const loadMessages = useCallback(async (member, active = () => true) => {
    const requestId = ++requestIdRef.current
    const result = await apiRequest(`/chat/conversations/${encodeURIComponent(member.id)}`)
    if (!active() || requestId !== requestIdRef.current) return

    setMessages((current) => mergeMessages(current, result.messages))
    setConversations((current) => current.map((conversation) => (
      conversation.member_id === member.id
        ? { ...conversation, unread_count: 0 }
        : conversation
    )))
  }, [])

  useEffect(() => {
    if (!user) return undefined

    let active = true
    loadInbox(() => active)
      .catch((requestError) => {
        if (active) reportChatError(requestError)
      })

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      loadInbox(() => active).catch((requestError) => {
        if (active) reportChatError(requestError)
      })
    }, 12000)

    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [loadInbox, reportChatError, user])

  useEffect(() => {
    if (!selectedMember || !user) return undefined

    let active = true
    let reconnectTimeout = null
    let pollingInterval = null
    let reconnectDelay = 1000
    const conversationId = selectedMember.id
    const websocketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const websocketUrl = `${websocketProtocol}//${window.location.host}/api/chat/ws/${encodeURIComponent(conversationId)}`

    function startPolling() {
      if (pollingInterval !== null) return
      pollingInterval = window.setInterval(() => {
        if (document.visibilityState !== 'visible') return
        loadMessages(selectedMember, () => active).catch((requestError) => {
          if (active) setError(requestError.message)
        })
      }, 4000)
    }

    function stopPolling() {
      if (pollingInterval === null) return
      window.clearInterval(pollingInterval)
      pollingInterval = null
    }

    function connect() {
      if (!active) return

      const currentSocket = new WebSocket(websocketUrl)
      socketRef.current = currentSocket
      setConnectionStatus('connecting')

      currentSocket.addEventListener('open', () => {
        if (!active) return
        reconnectDelay = 1000
        setConnectionStatus('live')
        setError('')
        stopPolling()
      })

      currentSocket.addEventListener('message', (event) => {
        if (!active) return

        try {
          const update = JSON.parse(event.data)
          if (update.type === 'message') {
            setMessages((current) => mergeMessages(current, [update.message]))
            setIsPeerTyping(false)
            if (update.message.recipient_id === user.id) {
              loadMessages(selectedMember, () => active).catch((requestError) => {
                if (active) setError(requestError.message)
              })
            } else {
              loadInbox(() => active).catch((requestError) => {
                if (active) setError(requestError.message)
              })
            }
          } else if (update.type === 'typing' && update.member_id === conversationId) {
            setIsPeerTyping(update.is_typing)
          } else if (update.type === 'presence' && update.member_id === conversationId) {
            setIsPeerOnline(update.online)
            if (!update.online) setIsPeerTyping(false)
          } else if (update.type === 'read' && update.member_id === conversationId) {
            setMessages((current) => current.map((message) => (
              message.sender_id === user.id && !message.read_at
                ? { ...message, read_at: update.read_at }
                : message
            )))
          } else if (update.type === 'blocked') {
            setError('This conversation is no longer available.')
            setSelectedMember(null)
          } else if (update.type === 'error') {
            setError(update.message)
          }
        } catch {
          setError('A live chat update could not be read. Reconnecting…')
        }
      })

      currentSocket.addEventListener('close', (event) => {
        if (!active) return
        if (socketRef.current === currentSocket) socketRef.current = null
        const isTerminalError = [4401, 4403, 4404].includes(event.code)
        setConnectionStatus(isTerminalError ? 'unavailable' : 'reconnecting')
        if (isTerminalError) {
          setError(event.reason || 'Live messaging is unavailable. Try again after signing in.')
          stopPolling()
          return
        }

        startPolling()
        reconnectTimeout = window.setTimeout(connect, reconnectDelay)
        reconnectDelay = Math.min(reconnectDelay * 2, 30000)
      })

      currentSocket.addEventListener('error', () => {
        if (active) setConnectionStatus('reconnecting')
      })
    }

    loadMessages(selectedMember, () => active).catch((requestError) => {
      if (active) setError(requestError.message)
    })
    startPolling()
    connect()

    return () => {
      active = false
      requestIdRef.current += 1
      if (reconnectTimeout !== null) window.clearTimeout(reconnectTimeout)
      if (pollingInterval !== null) window.clearInterval(pollingInterval)
      if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current)
      socketRef.current?.close(1000, 'Conversation changed.')
      socketRef.current = null
      setIsPeerTyping(false)
      setIsPeerOnline(false)
    }
  }, [loadInbox, loadMessages, selectedMember, user])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  async function findMembers(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setIsSearching(true)
    try {
      const result = await apiRequest(`/chat/members?search=${encodeURIComponent(search.trim())}`)
      setMembers(result.members)
      if (result.members.length === 0) setNotice('No members matched that name. Try another search.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSearching(false)
    }
  }

  function openConversation(member) {
    setError('')
    setNotice('')
    setDraft('')
    setMessages([])
    setShowReportForm(false)
    setConnectionStatus('connecting')
    setSelectedMember(member)
  }

  async function sendMessage(event) {
    event.preventDefault()
    if (!selectedMember || !draft.trim() || isSending) return

    setError('')
    setIsSending(true)
    const text = draft.trim()
    try {
      const result = await apiRequest(
        `/chat/conversations/${encodeURIComponent(selectedMember.id)}`,
        { method: 'POST', body: { message: text } },
      )
      setMessages((current) => mergeMessages(current, [result.message]))
      setDraft('')
      setIsPeerTyping(false)
      await loadInbox()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSending(false)
    }
  }

  function handleDraftChange(value) {
    setDraft(value)
    const socket = socketRef.current
    if (!selectedMember || socket?.readyState !== WebSocket.OPEN) return

    if (typingTimerRef.current === null) {
      socket.send(JSON.stringify({ type: 'typing' }))
    } else {
      window.clearTimeout(typingTimerRef.current)
    }

    typingTimerRef.current = window.setTimeout(() => {
      typingTimerRef.current = null
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'stop_typing' }))
      }
    }, 1200)
  }

  async function blockMember() {
    if (!selectedMember) return
    if (!window.confirm(`Block ${selectedMember.full_name}? They won’t be able to message you.`)) return

    setError('')
    try {
      const result = await apiRequest(`/chat/members/${encodeURIComponent(selectedMember.id)}/block`, {
        method: 'POST',
      })
      setNotice(result.message)
      setConversations((current) => current.filter(
        (conversation) => conversation.member_id !== selectedMember.id,
      ))
      setSelectedMember(null)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function reportMember(event) {
    event.preventDefault()
    if (!selectedMember) return
    setError('')
    try {
      const result = await apiRequest(`/chat/members/${encodeURIComponent(selectedMember.id)}/report`, {
        method: 'POST',
        body: { reason: reportReason },
      })
      setNotice(result.message)
      setShowReportForm(false)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  if (!user) {
    return (
      <section className="chat-gate standalone-page" aria-labelledby="chat-heading">
        <p className="eyebrow">Good people. Great progress.</p>
        <h1 id="chat-heading">Your people are here.</h1>
        <p>Sign in to find your training crew and pick up the conversation.</p>
        <a className="chat-action-link" href="/sign-in">Sign in</a>
        <a href="/register">Create a free account</a>
      </section>
    )
  }

  return (
    <section className="chat-page standalone-page" aria-labelledby="chat-heading">
      <header className="chat-page-heading">
        <div>
          <p className="eyebrow">Good people. Great progress.</p>
          <h1 id="chat-heading">Your training crew.</h1>
          <p>Swap a tip. Celebrate a personal best. Cheer somebody on.</p>
        </div>
        <span className="chat-encryption-note">Private member messages</span>
      </header>

      {notice && <p className="chat-notice" role="status">{notice}</p>}
      {error && <p className="chat-error" role="alert">{error}</p>}

      <div className={`chat-layout${selectedMember ? ' chat-layout-conversation-open' : ''}`}>
        <aside className="chat-sidebar" aria-label="Your conversations">
          <form className="chat-member-search" onSubmit={findMembers}>
            <label htmlFor="member-search">Find your people</label>
            <div className="chat-search-row">
              <input
                id="member-search"
                type="search"
                placeholder="Search by member name"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                minLength={2}
                maxLength={80}
                required
              />
              <button type="submit" disabled={isSearching}>
                {isSearching ? '…' : 'Find'}
              </button>
            </div>
          </form>

          {members.length > 0 && (
            <section className="chat-search-results" aria-labelledby="chat-search-results-heading">
              <h2 id="chat-search-results-heading">People</h2>
              <ul>
                {members.map((member) => (
                  <li key={member.id}>
                    <button
                      type="button"
                      className="chat-member"
                      onClick={() => openConversation(member)}
                    >
                      <span className="chat-avatar" aria-hidden="true">
                        {member.full_name.trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="chat-member-copy">
                        <strong>{member.full_name}</strong>
                        <span>{member.membership_interest?.replaceAll('-', ' ') || 'ToKa Fitness member'}</span>
                      </span>
                      <span className="chat-member-add" aria-hidden="true">+</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="chat-inbox-heading">
            <h2>Messages</h2>
            <span>{conversations.length}</span>
          </div>
          {conversations.length === 0 ? (
            <p className="chat-sidebar-empty">
              Search for a member to say hello. Your conversations will show up here.
            </p>
          ) : (
            <ul className="chat-conversation-list">
              {conversations.map((conversation) => {
                const member = conversation.member
                return (
                  <li key={conversation.member_id}>
                    <button
                      type="button"
                      className={`chat-conversation-link${selectedMember?.id === member.id ? ' selected' : ''}`}
                      onClick={() => openConversation(member)}
                      aria-current={selectedMember?.id === member.id ? 'true' : undefined}
                    >
                      <span className="chat-avatar" aria-hidden="true">
                        {member.full_name.trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="chat-member-copy">
                        <span className="chat-conversation-title">
                          <strong>{member.full_name}</strong>
                          <time>{formatConversationTime(conversation.last_message_at)}</time>
                        </span>
                        <span className="chat-conversation-preview">
                          {conversation.last_message}
                        </span>
                      </span>
                      {conversation.unread_count > 0 && (
                        <span className="chat-unread-count" aria-label={`${conversation.unread_count} unread messages`}>
                          {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="chat-sidebar-caption">A little encouragement goes a long way. Be kind in every conversation.</p>
        </aside>

        <section
          className="chat-conversation"
          aria-label={selectedMember ? `Conversation with ${selectedMember.full_name}` : 'Conversation'}
        >
          {selectedMember ? (
            <>
              <header className="chat-conversation-header">
                <button
                  type="button"
                  className="chat-back-button"
                  onClick={() => setSelectedMember(null)}
                  aria-label="Back to conversations"
                >
                  <span aria-hidden="true">←</span>
                </button>
                <span className={`chat-avatar${isPeerOnline ? ' chat-avatar-online' : ''}`} aria-hidden="true">
                  {selectedMember.full_name.trim().charAt(0).toUpperCase()}
                </span>
                <div className="chat-conversation-contact">
                  <h2>{selectedMember.full_name}</h2>
                  <p>
                    {isPeerTyping
                      ? 'Finding the words…'
                      : isPeerOnline
                        ? 'Online and ready to cheer you on'
                        : connectionStatus === 'live'
                          ? 'Part of your ToKa crew'
                          : connectionStatus === 'unavailable'
                            ? 'Live chat is unavailable right now'
                          : 'Reconnecting your conversation…'}
                  </p>
                </div>
                <div className="chat-conversation-actions">
                  <button type="button" onClick={() => setShowReportForm((current) => !current)}>
                    Report
                  </button>
                  <button type="button" onClick={blockMember}>Block</button>
                </div>
              </header>
              {showReportForm && (
                <form className="chat-report-form" onSubmit={reportMember}>
                  <label htmlFor="report-reason">Help us keep this a welcoming space</label>
                  <select
                    id="report-reason"
                    value={reportReason}
                    onChange={(event) => setReportReason(event.target.value)}
                  >
                    <option value="spam">Spam</option>
                    <option value="harassment">Harassment or abusive messages</option>
                    <option value="other">Something else</option>
                  </select>
                  <button type="submit">Send private report</button>
                </form>
              )}
              <div className="chat-day-divider">
                <span>Your ToKa crew · Look out for each other</span>
              </div>
              <ol className="chat-message-list" aria-live="polite" aria-label="Messages">
                {messages.map((message) => (
                  <li
                    key={message.id}
                    className={message.sender_id === user.id ? 'chat-message mine' : 'chat-message'}
                  >
                    <p>{message.message}</p>
                    <span className="chat-message-meta">
                      <time dateTime={message.created_at}>
                        {new Date(message.created_at).toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </time>
                      {message.sender_id === user.id && (
                        <span
                          className={`chat-read-receipt${message.read_at ? ' read' : ''}`}
                          aria-label={message.read_at ? 'Read' : message.delivered_at ? 'Delivered' : 'Sent'}
                          title={message.read_at ? 'Read' : message.delivered_at ? 'Delivered' : 'Sent'}
                        >
                          {message.read_at ? '✓✓' : message.delivered_at ? '✓✓' : '✓'}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
                {isPeerTyping && (
                  <li className="chat-typing-indicator" aria-label={`${selectedMember.full_name} is typing`}>
                    <span /><span /><span />
                  </li>
                )}
                {messages.length === 0 && !isPeerTyping && (
                  <li className="chat-welcome">
                    <span className="chat-welcome-sparkle" aria-hidden="true">✦</span>
                    <strong>Every great training crew starts somewhere.</strong>
                    <span>Say hello. Your next favourite training buddy is one message away.</span>
                  </li>
                )}
                <li className="chat-messages-end" ref={messagesEndRef} aria-hidden="true" />
              </ol>
              <form className="chat-compose" onSubmit={sendMessage}>
                <label className="visually-hidden" htmlFor="chat-message">Your message</label>
                <textarea
                  id="chat-message"
                  value={draft}
                  onChange={(event) => handleDraftChange(event.target.value)}
                  placeholder="Send a little encouragement…"
                  maxLength={2000}
                  rows={1}
                  required
                />
                <span className="chat-compose-count" aria-live="polite">{draft.length}/2000</span>
                <button
                  type="submit"
                  className="chat-send-button"
                  disabled={isSending || !draft.trim() || connectionStatus === 'sign-in'}
                  aria-label={isSending ? 'Sending message' : 'Send message'}
                >
                  {isSending ? 'Sending…' : 'Send'}
                  {!isSending && <span aria-hidden="true"> ↗</span>}
                </button>
              </form>
              <p className="chat-privacy-note">Your messages are visible only to you and the member you’re chatting with. Please don’t share sensitive health or payment information.</p>
            </>
          ) : (
            <div className="chat-inbox-welcome">
              <div className="chat-welcome-illustration" aria-hidden="true">
                <span>✦</span><span>✉</span><span>↗</span>
              </div>
              <p className="eyebrow">Together, we go further.</p>
              <h2>A good message can make someone’s day.</h2>
              <p>Choose someone from your messages or find a new training buddy. Their next “let’s go” might be yours.</p>
              <span className={`chat-live-indicator${connectionStatus === 'live' ? ' connected' : ''}`}>
                <span /> {connectionStatus === 'live' ? 'Your crew is one tap away' : 'Getting your conversations ready'}
              </span>
            </div>
          )}
        </section>
      </div>
    </section>
  )
}

export default ChatPage
