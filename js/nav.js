/* Single source of truth for navigation. Only implemented modules are routes; future modules are listed as "Soon". */
export const ROUTES = {
  dashboard: { title: 'Dashboard', icon: 'house', tab: 'Home', main: true, sub: () => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()), load: () => import('../pages/dashboard.js') },
  transactions: { title: 'Transactions', icon: 'arrow-left-right', tab: 'Activity', main: true, load: () => import('../pages/transactions.js') },
  accounts: { title: 'Accounts', icon: 'wallet', main: true, load: () => import('../pages/accounts.js') },
  analytics: { title: 'Analytics', icon: 'chart-pie', tab: 'Analytics', main: true, load: () => import('../pages/analytics.js') },
  savings: { title: 'Savings', icon: 'piggy-bank', main: true, load: () => import('../pages/savings.js') },
  coding: { title: 'Coding', icon: 'code', main: true, group: 'business', sub: 'Web development business', load: () => import('../pages/coding.js') },
  daraz: { title: 'Daraz', icon: 'store', main: true, group: 'business', sub: 'Inventory & profit', load: () => import('../pages/daraz.js') },
  trading: { title: 'Trading', icon: 'trending-up', main: true, group: 'business', sub: 'Crypto & investments', load: () => import('../pages/trading.js') },
  notes: { title: 'Notes', icon: 'notebook-pen', main: true, group: 'productivity', sub: 'Your notes', load: () => import('../pages/notes.js') },
  todo: { title: 'To-Do', icon: 'list-todo', main: true, group: 'productivity', sub: 'Daily tasks', load: () => import('../pages/todo.js') },
  settings: { title: 'Settings', icon: 'settings', load: () => import('../pages/settings.js'), highlight: 'settings' },
  more: { title: 'More', icon: 'ellipsis', tab: 'More', load: () => import('../pages/more.js') },
};
export const SOON = []; // every planned module is now live
