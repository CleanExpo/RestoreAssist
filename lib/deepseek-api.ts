/**
 * Deepseek API Integration for Quick Fill functionality
 * Cost: ~$0.01 per use
 */

interface DeepseekMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface DeepseekResponse {
  choices: Array<{
    message: {
      role: string
      content: string
    }
  }>
  usage?: {
    total_tokens: number
    prompt_tokens: number
    completion_tokens: number
  }
}

/**
 * Call Deepseek API to generate form data based on use case
 */
export async function callDeepseekAPI(
  apiKey: string,
  messages: DeepseekMessage[],
  temperature: number = 0.7
): Promise<string> {
  if (!apiKey) {
    throw new Error('Deepseek API key is required')
  }

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature,
      max_tokens: 4000,
      stream: false
    })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error?.message || `Deepseek API error: ${response.statusText}`)
  }

  const data: DeepseekResponse = await response.json()
  
  if (!data.choices || data.choices.length === 0) {
    throw new Error('No response from Deepseek API')
  }

  return data.choices[0].message.content
}

/**
 * Generate Quick Fill data using Deepseek API
 * This is a simplified version - in production, you'd want more sophisticated prompting
 */
export async function generateQuickFillData(
  apiKey: string,
  useCaseName: string,
  useCaseDescription: string
): Promise<any> {
  const systemPrompt = `You are a helpful assistant that generates structured data for water damage restoration reports. 
Generate JSON data that matches the use case description provided. Return only valid JSON, no markdown formatting.`

  const userPrompt = `Generate form data for a water damage restoration report based on this use case:

Name: ${useCaseName}
Description: ${useCaseDescription}

Generate realistic data including:
- Client information (name, contact)
- Property details (address, postcode, building age, structure type)
- Claim information (claim reference, insurer, dates)
- Technician field report (detailed narrative)
- NIR inspection data (moisture readings, affected areas, scope items)
- Psychrometric data (water class, temperature, humidity)
- Equipment needs (scope areas with dimensions)

Return as a JSON object matching the InitialDataEntryForm structure.`

  const messages: DeepseekMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ]

  const response = await callDeepseekAPI(apiKey, messages)
  
  // Try to parse JSON from response
  try {
    // Remove markdown code blocks if present
    const cleanedResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(cleanedResponse)
  } catch (error) {
    // If parsing fails, return the raw response and let the caller handle it
    throw new Error(`Failed to parse Deepseek response as JSON: ${error}`)
  }
}
