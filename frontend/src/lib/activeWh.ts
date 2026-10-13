import { useSyncExternalStore } from "react";

const KEY = "internal_active_wh";
const listeners = new Set<() => void>();

export function getActiveWh(): string {
  return localStorage.getItem(KEY) || "";
}
export function setActiveWh(id: string): void {
  localStorage.setItem(KEY, id);
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function useActiveWh(): string {
  return useSyncExternalStore(subscribe, getActiveWh, () => "");
}
