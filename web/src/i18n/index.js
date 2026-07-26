import { ref } from 'vue';
import en from './en.json';
import ja from './ja.json';
import ko from './ko.json';
const messages = {
    en,
    ko,
    ja,
};
const DEFAULT_LOCALE = 'en';
const LOCALE_STORAGE_KEY = 'cylinderdicer.locale';
function isLocaleCode(value) {
    return value !== null && value in messages;
}
function readInitialLocale() {
    if (typeof window === 'undefined') {
        return DEFAULT_LOCALE;
    }
    const savedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocaleCode(savedLocale)) {
        return savedLocale;
    }
    return DEFAULT_LOCALE;
}
export const activeLocale = ref(readInitialLocale());
export function setLocale(locale) {
    activeLocale.value = locale;
    if (typeof document !== 'undefined') {
        document.documentElement.lang = locale;
    }
    if (typeof window !== 'undefined') {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    }
}
setLocale(activeLocale.value);
function lookup(path, locale) {
    const value = path.split('.').reduce((current, segment) => {
        if (current && typeof current === 'object' && segment in current) {
            return current[segment];
        }
        return undefined;
    }, messages[locale]);
    return typeof value === 'string' ? value : undefined;
}
export function t(path, replacements = {}) {
    const template = lookup(path, activeLocale.value) ?? lookup(path, DEFAULT_LOCALE) ?? path;
    return Object.entries(replacements).reduce((message, [key, value]) => message.replace(`{${key}}`, value), template);
}
