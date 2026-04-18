import { UiLanguage } from './chineseClientText';

export type ChatStyleKind = 'preset' | 'custom';

export interface ChatStyle {
  id: string;
  kind: ChatStyleKind;
  name: string;
  description: string;
  instructions: string;
  localizedName?: Partial<Record<UiLanguage, string>>;
  localizedDescription?: Partial<Record<UiLanguage, string>>;
}

const CUSTOM_STYLES_KEY = 'chat_styles_custom';
const DEFAULT_STYLE_KEY = 'default_chat_style_id';
const CONVERSATION_STYLE_OVERRIDES_KEY = 'conversation_chat_style_overrides';
export const CHAT_STYLES_EVENT = 'chatStylesChanged';

function emitChatStylesChanged() {
  window.dispatchEvent(new Event(CHAT_STYLES_EVENT));
}

export const PRESET_CHAT_STYLES: ChatStyle[] = [
  {
    id: 'balanced',
    kind: 'preset',
    name: 'Balanced',
    description: 'Clear and practical without overdoing either brevity or detail.',
    instructions: 'Respond naturally with a balanced level of detail. Be clear, helpful, and practical.',
    localizedName: { 'zh-CN': '平衡', en: 'Balanced' },
    localizedDescription: {
      'zh-CN': '清晰实用，细节和简洁度保持平衡。',
      en: 'Clear and practical without overdoing either brevity or detail.',
    },
  },
  {
    id: 'concise',
    kind: 'preset',
    name: 'Concise',
    description: 'Short answers first, details only when they matter.',
    instructions: 'Keep responses concise and direct. Lead with the answer and only add extra detail when it is necessary.',
    localizedName: { 'zh-CN': '简洁', en: 'Concise' },
    localizedDescription: {
      'zh-CN': '先给短答案，只有必要时再展开。',
      en: 'Short answers first, details only when they matter.',
    },
  },
  {
    id: 'formal',
    kind: 'preset',
    name: 'Formal',
    description: 'Professional tone with polished wording and structure.',
    instructions: 'Use a professional, polished tone. Keep the structure tidy and avoid slang or casual phrasing.',
    localizedName: { 'zh-CN': '正式', en: 'Formal' },
    localizedDescription: {
      'zh-CN': '更职业、更克制，表达更工整。',
      en: 'Professional tone with polished wording and structure.',
    },
  },
  {
    id: 'explanatory',
    kind: 'preset',
    name: 'Explanatory',
    description: 'Explain the why, not just the answer.',
    instructions: 'Be explanatory and teaching-oriented. Include the reasoning, tradeoffs, and useful context behind the answer.',
    localizedName: { 'zh-CN': '解释型', en: 'Explanatory' },
    localizedDescription: {
      'zh-CN': '不只给结论，也讲清原因、背景和取舍。',
      en: 'Explain the why, not just the answer.',
    },
  },
];

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function sanitizeCustomStyle(style: Partial<ChatStyle>, index: number): ChatStyle | null {
  const id = typeof style.id === 'string' && style.id.trim() ? style.id.trim() : `custom-${index}`;
  const name = typeof style.name === 'string' ? style.name.trim() : '';
  const description = typeof style.description === 'string' ? style.description.trim() : '';
  const instructions = typeof style.instructions === 'string' ? style.instructions.trim() : '';
  if (!name || !instructions) return null;
  return {
    id,
    kind: 'custom',
    name,
    description,
    instructions,
  };
}

export function getCustomChatStyles(): ChatStyle[] {
  const parsed = safeParse<Array<Partial<ChatStyle>>>(localStorage.getItem(CUSTOM_STYLES_KEY), []);
  return parsed
    .map((style, index) => sanitizeCustomStyle(style, index))
    .filter((style): style is ChatStyle => !!style);
}

export function saveCustomChatStyles(styles: ChatStyle[]) {
  const customOnly = styles.filter((style) => style.kind === 'custom');
  localStorage.setItem(CUSTOM_STYLES_KEY, JSON.stringify(customOnly));
  emitChatStylesChanged();
}

export function getAllChatStyles(): ChatStyle[] {
  return [...PRESET_CHAT_STYLES, ...getCustomChatStyles()];
}

export function getChatStyleById(styleId?: string | null): ChatStyle | null {
  if (!styleId) return null;
  return getAllChatStyles().find((style) => style.id === styleId) || null;
}

export function getDefaultChatStyleId(): string {
  const stored = localStorage.getItem(DEFAULT_STYLE_KEY);
  return getChatStyleById(stored)?.id || PRESET_CHAT_STYLES[0].id;
}

export function setDefaultChatStyleId(styleId: string) {
  const resolved = getChatStyleById(styleId);
  localStorage.setItem(DEFAULT_STYLE_KEY, resolved?.id || PRESET_CHAT_STYLES[0].id);
  emitChatStylesChanged();
}

function getConversationStyleOverrides(): Record<string, string> {
  return safeParse<Record<string, string>>(localStorage.getItem(CONVERSATION_STYLE_OVERRIDES_KEY), {});
}

function saveConversationStyleOverrides(overrides: Record<string, string>) {
  localStorage.setItem(CONVERSATION_STYLE_OVERRIDES_KEY, JSON.stringify(overrides));
}

export function getConversationChatStyleId(conversationId?: string | null): string | null {
  if (!conversationId) return null;
  const overrides = getConversationStyleOverrides();
  const styleId = overrides[conversationId];
  return getChatStyleById(styleId)?.id || null;
}

export function setConversationChatStyleId(conversationId: string, styleId: string) {
  const resolved = getChatStyleById(styleId);
  if (!resolved) return;
  const overrides = getConversationStyleOverrides();
  overrides[conversationId] = resolved.id;
  saveConversationStyleOverrides(overrides);
  emitChatStylesChanged();
}

export function clearConversationChatStyleId(conversationId: string) {
  const overrides = getConversationStyleOverrides();
  if (!(conversationId in overrides)) return;
  delete overrides[conversationId];
  saveConversationStyleOverrides(overrides);
  emitChatStylesChanged();
}

export function getEffectiveChatStyle(conversationId?: string | null): ChatStyle {
  const conversationStyle = getChatStyleById(getConversationChatStyleId(conversationId));
  if (conversationStyle) return conversationStyle;
  return getChatStyleById(getDefaultChatStyleId()) || PRESET_CHAT_STYLES[0];
}

export function getChatStyleLabel(style: ChatStyle, language: UiLanguage): string {
  return style.localizedName?.[language] || style.localizedName?.['zh-CN'] || style.name;
}

export function getChatStyleDescription(style: ChatStyle, language: UiLanguage): string {
  return style.localizedDescription?.[language] || style.localizedDescription?.['zh-CN'] || style.description;
}

export function createCustomChatStyle(input: { name: string; description?: string; instructions: string }): ChatStyle {
  const timestamp = Date.now().toString(36);
  return {
    id: `custom-${timestamp}`,
    kind: 'custom',
    name: input.name.trim(),
    description: (input.description || '').trim(),
    instructions: input.instructions.trim(),
  };
}
