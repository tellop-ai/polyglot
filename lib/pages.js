// Every independently opened page belongs here. wordsKey names its real locale
// message; AppMenu translates it at render time. Keep routes and keys current.
export const PAGES = Object.freeze([
  Object.freeze({ href: '/', wordsKey: 'learn.menu.today' }),
  Object.freeze({ href: '/lessons', wordsKey: 'learn.menu.lessons' }),
  Object.freeze({ href: '/cards', wordsKey: 'learn.menu.cards' }),
  Object.freeze({ href: '/practice', wordsKey: 'learn.menu.practice' }),
  Object.freeze({ href: '/settings', wordsKey: 'learn.menu.settings' }),
]);
