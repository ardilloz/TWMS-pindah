import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";
import type { StockSummary, Supplier, TodayOut, Transaction, User, Warehouse } from "./types";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => apiGet<User>("/auth/me"), retry: false });
}

export function useToday() {
  return useQuery({ queryKey: ["today"], queryFn: () => apiGet<TodayOut>("/meta/today") });
}

export function useWarehouses() {
  return useQuery({ queryKey: ["warehouses"], queryFn: () => apiGet<Warehouse[]>("/warehouses") });
}

export function useSuppliers() {
  return useQuery({ queryKey: ["suppliers"], queryFn: () => apiGet<Supplier[]>("/suppliers") });
}

export function useStock() {
  return useQuery({ queryKey: ["stock"], queryFn: () => apiGet<StockSummary>("/stock") });
}

export type TxParams = Record<string, string>;

export function txQueryString(params: TxParams): string {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v && v !== "all"));
  return new URLSearchParams(clean).toString();
}

export function useTransactions(params: TxParams, enabled = true) {
  const qs = txQueryString(params);
  return useQuery({
    queryKey: ["transactions", qs],
    enabled,
    queryFn: () => apiGet<Transaction[]>(`/transactions${qs ? `?${qs}` : ""}`),
  });
}
