// Who may change the garage.
//
// The deployed copy is public and read-only. The owner signs in with a token
// that lives only in their browser and goes out as a bearer header on every
// request; the server decides what that token allows. Components ask
// useCanEdit() before showing anything that writes.
import { createContext, useContext } from 'react';

export const TOKEN_KEY = 'parc-ferme-owner-token';

export function ownerToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setOwnerToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // private mode: signing in just lasts until the tab closes
  }
}

export const OwnerContext = createContext(false);
export const useCanEdit = () => useContext(OwnerContext);
