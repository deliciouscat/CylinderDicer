import { ref } from 'vue'
import en from './en.json'
import ja from './ja.json'
import ko from './ko.json'
import zh from './zh.json'

export type LocaleCode = keyof typeof messages
type Messages = typeof en
export type MessageKey = keyof Messages
export type CustomGameMessageKey = keyof Messages['customGame']
export type LobbyMenuMessageKey = keyof Messages['lobby']['menu']

const messages = {
  en,
  ko,
  ja,
  zh,
} as const

const DEFAULT_LOCALE: LocaleCode = 'en'
const LOCALE_STORAGE_KEY = 'cylinderdicer.locale'

function isLocaleCode(value: string | null): value is LocaleCode {
  return value !== null && value in messages
}

function readInitialLocale(): LocaleCode {
  if (typeof window === 'undefined') {
    return DEFAULT_LOCALE
  }

  const savedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY)
  if (isLocaleCode(savedLocale)) {
    return savedLocale
  }

  return DEFAULT_LOCALE
}

export const activeLocale = ref<LocaleCode>(readInitialLocale())

export function setLocale(locale: LocaleCode) {
  activeLocale.value = locale
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale
  }
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  }
}

setLocale(activeLocale.value)

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
  const template = lookup(path, activeLocale.value) ?? lookup(path, DEFAULT_LOCALE) ?? path

  return Object.entries(replacements).reduce(
    (message, [key, value]) => message.replace(`{${key}}`, value),
    template,
  )
}
