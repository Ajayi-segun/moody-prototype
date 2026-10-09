export async function apiRequest(path, { method = 'GET', body } = {}) {
  let response
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error('ToKa Fitness could not reach its mailing-list API. Start the FastAPI server and try again.')
  }

  const responseText = await response.text()
  let result = null
  if (responseText) {
    try {
      result = JSON.parse(responseText)
    } catch {
      const serviceIssue = response.status === 502 || response.status === 503
        ? 'The ToKa Fitness API is not available. Make sure the FastAPI server is running, then try again.'
        : `The ToKa Fitness API returned an unexpected response (HTTP ${response.status}). Restart FastAPI and try again.`
      throw new Error(serviceIssue)
    }
  }

  if (!response.ok) {
    const detail = result?.detail
    const message = Array.isArray(detail)
      ? detail.map((item) => item.msg).filter(Boolean).join(' ')
      : detail
    const fallbackMessage = response.status === 502 || response.status === 503
      ? 'The ToKa Fitness API is unavailable or not configured. Start FastAPI and check its server settings, then try again.'
      : `ToKa Fitness could not complete that request (HTTP ${response.status}). Please try again.`
    throw new Error(message || fallbackMessage)
  }
  return result
}
