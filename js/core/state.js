import { api } from './api.js';

export const state = { user: null, accounts: [], categories: [], budget: null, logos: new Map(), serverOffset: 0 };
export const bus = new EventTarget();
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

export const accountById = (id) => state.accounts.find((a) => a.id === id) || null;
export const categoryById = (id) => state.categories.find((c) => c.id === id) || null;
export const categoriesOf = (type) => state.categories.filter((c) => c.type === type);
export const savingsAccounts = () => state.accounts.filter((a) => a.type === 'savings');

export function setBootstrap(b) {
  state.user = b.user;
  state.accounts = b.accounts;
  state.categories = b.categories;
  state.budget = b.budget;
  state.serverOffset = Date.parse(b.serverTime) - Date.now();
}
export function clearState() { Object.assign(state, { user: null, accounts: [], categories: [], budget: null }); }

export async function reloadAccounts() { state.accounts = (await api.get('/accounts')).accounts; return state.accounts; }
export async function reloadCategories() { state.categories = (await api.get('/categories')).categories; return state.categories; }
