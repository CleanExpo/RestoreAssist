import * as SecureStore from 'expo-secure-store';
import { PROVIDER_AUTH } from '@/constants/byok';
import type { Provider, AllowedModel, BYOKConfig } from '@/shared/types';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GenerateOptions {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

interface GenerateResult {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export class BYOKClient {
  private config: BYOKConfig;

  constructor(config: BYOKConfig) {
    this.config = config;
  }

  static async fromSecureStore(): Promise<BYOKClient | null> {
    try {
      const provider = await SecureStore.getItemAsync('byok_active_provider') as Provider | null;
      const model = await SecureStore.getItemAsync('byok_active_model') as AllowedModel | null;
      if (!provider || !model) return null;

      const apiKey = await SecureStore.getItemAsync(`byok_${provider}_key`);
      if (!apiKey) return null;

      return new BYOKClient({ provider, model, apiKey });
    } catch {
      return null;
    }
  }
  async generate(options: GenerateOptions): Promise<GenerateResult> {
    switch (this.config.provider) {
      case 'anthropic':
        return this.generateAnthropic(options);
      case 'google':
        return this.generateGoogle(options);
      case 'openai':
        return this.generateOpenAI(options);
      default:
        throw new Error(`Unknown provider: ${this.config.provider}`);
    }
  }

  private async generateAnthropic(options: GenerateOptions): Promise<GenerateResult> {
    const auth = PROVIDER_AUTH.anthropic;
    const systemMsg = options.messages.find(m => m.role === 'system');
    const messages = options.messages.filter(m => m.role !== 'system');

    const body = {
      model: this.config.model,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7,
      system: systemMsg?.content || options.systemPrompt || '',
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    };

    const response = await fetch(auth.endpoint, {
      method: 'POST',
      headers: {
        [auth.headerKey]: `${auth.headerPrefix}${this.config.apiKey}`,
        'content-type': 'application/json',
        ...auth.extraHeaders,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Anthropic API error (${response.status}): ${error?.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const textBlock = data.content?.find((c: any) => c.type === 'text');

    return {
      content: textBlock?.text || '',
      model: data.model,
      usage: {
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
      },
    };
  }

  private async generateGoogle(options: GenerateOptions): Promise<GenerateResult> {
    const auth = PROVIDER_AUTH.google;
    const systemMsg = options.messages.find(m => m.role === 'system');
    const contents = options.messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : m.role,
      parts: [{ text: m.content }],
    }));

    const body: any = {
      contents,
      generationConfig: {
        maxOutputTokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 1.0, // Gemini 3 models require temp >= 1.0
      },
    };

    if (systemMsg?.content || options.systemPrompt) {
      body.system_instruction = {
        parts: [{ text: systemMsg?.content || options.systemPrompt }],
      };
    }
    const endpoint = `${auth.endpoint}/${this.config.model}:generateContent`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        [auth.headerKey]: `${auth.headerPrefix}${this.config.apiKey}`,
        'content-type': 'application/json',
        ...auth.extraHeaders,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Gemini API error (${response.status}): ${error?.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return {
      content: text,
      model: this.config.model,
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount || 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
      },
    };
  }

  private async generateOpenAI(options: GenerateOptions): Promise<GenerateResult> {
    const auth = PROVIDER_AUTH.openai;
    const messages = options.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));
    if (options.systemPrompt && !messages.find(m => m.role === 'system')) {
      messages.unshift({ role: 'system', content: options.systemPrompt });
    }

    const body = {
      model: this.config.model,
      messages,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7,
    };

    const response = await fetch(auth.endpoint, {
      method: 'POST',
      headers: {
        [auth.headerKey]: `${auth.headerPrefix}${this.config.apiKey}`,
        'content-type': 'application/json',
        ...auth.extraHeaders,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API error (${response.status}): ${error?.error?.message || response.statusText}`);
    }

    const data = await response.json();

    return {
      content: data.choices?.[0]?.message?.content || '',
      model: data.model,
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      },
    };
  }
  // Validate API key by making a minimal request
  async validateKey(): Promise<{ valid: boolean; error?: string }> {
    try {
      await this.generate({
        messages: [{ role: 'user', content: 'Hello' }],
        maxTokens: 10,
      });
      return { valid: true };
    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  }
}
