import en from './en.json'
import ja from './ja.json'
import ko from './ko.json'

export type LocaleCode = keyof typeof messages
type Messages = typeof en
export type MessageKey = keyof Messages
export type CustomGameMessageKey = keyof Messages['customGame']
export type LobbyMenuMessageKey = keyof Messages['lobby']['menu']

const messages = {
  en,
  ko,
  ja,
} as const

const DEFAULT_LOCALE: LocaleCode = 'en'
const activeLocale: LocaleCode = DEFAULT_LOCALE

function lookup(path: string, locale: LocaleCode): string | undefined {
  const value = path.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object' && segment in current) {
      return (current as Record<string, unknown>)[segment]
    }

    return undefined
  }, messages[locale])

  return typeof value === 'string' ? value : undefined
}

export function t(path: string, replacements: Record<string, string> = {}): string {
  const template = lookup(path, activeLocale) ?? lookup(path, DEFAULT_LOCALE) ?? path

  return Object.entries(replacements).reduce(
    (message, [key, value]) => message.replace(`{${key}}`, value),
    template,
  )
}
