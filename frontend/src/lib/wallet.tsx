import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { setupWalletSelector, type WalletSelector } from "@near-wallet-selector/core";
import { setupModal, type WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import "@near-wallet-selector/modal-ui/styles.css";
import { actionCreators } from "@near-js/transactions";
import { CONFIG } from "../config";
import { txHash } from "./near";

export type ToastKind = "ok" | "err" | "info";
export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
  hash?: string | null;
}

export interface ReturnedTx {
  hash: string | null;
  error: string | null;
}

interface WalletCtx {
  ready: boolean;
  /** Result MyNearWallet put in the URL when it redirected back, if any. */
  returnedTx: ReturnedTx | null;
  accountId: string | null;
  connect: () => void;
  disconnect: () => Promise<void>;
  call: (receiverId: string, methodName: string, args: Record<string, unknown>, gas: string, deposit?: string) => Promise<unknown>;
  toasts: Toast[];
  toast: (text: string, kind?: ToastKind, hash?: string | null) => void;
  dismiss: (id: number) => void;
}

const Ctx = createContext<WalletCtx | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const selectorRef = useRef<WalletSelector | null>(null);
  const modalRef = useRef<WalletSelectorModal | null>(null);
  const [ready, setReady] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [returnedTx, setReturnedTx] = useState<ReturnedTx | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const toast = useCallback((text: string, kind: ToastKind = "info", hash: string | null = null) => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, kind, text, hash }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "err" ? 9000 : 6000);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  useEffect(() => {
    let sub: { unsubscribe: () => void } | null = null;
    (async () => {
      try {
        const selector = await setupWalletSelector({
          // An explicit network object so the selector's own JsonRpcProvider also
          // uses the reliable endpoint instead of the rate-limited default.
          network: { networkId: CONFIG.network, nodeUrl: CONFIG.nodeUrl, helperUrl: "https://helper.testnet.near.org", explorerUrl: CONFIG.explorerUrl, indexerUrl: "" },
          modules: [setupMyNearWallet({ walletUrl: CONFIG.walletUrl }), setupMeteorWallet()],
        });
        selectorRef.current = selector;
        modalRef.current = setupModal(selector, { contractId: CONFIG.contracts.vault });
        const apply = () => {
          const acc = selector.store.getState().accounts.find((a) => a.active) ?? selector.store.getState().accounts[0];
          setAccountId(acc?.accountId ?? null);
        };
        apply();
        sub = selector.store.observable.subscribe(apply);
        setReady(true);

        // MyNearWallet returns here with the result in the URL.
        const url = new URL(window.location.href);
        const h = url.searchParams.get("transactionHashes");
        const err = url.searchParams.get("errorMessage");
        const pendingLock = (() => {
          try {
            return sessionStorage.getItem("ceaser:pending-lock") !== null;
          } catch {
            return false;
          }
        })();
        if (h || err) setReturnedTx({ hash: h ? h.split(",")[0] : null, error: err ? decodeURIComponent(err) : null });
        if (h && !pendingLock) toast("Transaction confirmed", "ok", h.split(",")[0]);
        if (err && !pendingLock) toast(decodeURIComponent(err), "err");
        if (h || err || url.searchParams.has("account_id")) {
          ["transactionHashes", "errorMessage", "errorCode", "account_id", "public_key", "all_keys"].forEach((k) => url.searchParams.delete(k));
          window.history.replaceState({}, "", url.pathname + url.search + url.hash);
        }
      } catch (e) {
        toast(`Wallet setup failed: ${(e as Error).message}`, "err");
      }
    })();
    return () => sub?.unsubscribe();
  }, [toast]);

  const connect = useCallback(() => modalRef.current?.show(), []);
  const disconnect = useCallback(async () => {
    const w = await selectorRef.current?.wallet();
    await w?.signOut();
  }, []);

  const call = useCallback(
    async (receiverId: string, methodName: string, args: Record<string, unknown>, gas: string, deposit = "0") => {
      if (!accountId || !selectorRef.current) {
        modalRef.current?.show();
        throw new Error("Connect a wallet first");
      }
      const wallet = await selectorRef.current.wallet();
      const outcome = await wallet.signAndSendTransaction({
        signerId: accountId,
        receiverId,
        actions: [actionCreators.functionCall(methodName, args, BigInt(gas), BigInt(deposit))],
      });
      const hash = txHash(outcome);
      if (hash) toast(`${methodName} sent`, "ok", hash);
      return outcome;
    },
    [accountId, toast],
  );

  const value = useMemo(
    () => ({ ready, returnedTx, accountId, connect, disconnect, call, toasts, toast, dismiss }),
    [ready, returnedTx, accountId, connect, disconnect, call, toasts, toast, dismiss],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet outside WalletProvider");
  return v;
}

export function errorText(e: unknown): string {
  const m = (e as Error)?.message ?? String(e);
  const match = m.match(/Smart contract panicked: ([^"\\]+)/) ?? m.match(/"panic_msg":"([^"]+)"/);
  return match ? match[1] : m.length > 200 ? m.slice(0, 200) + "…" : m;
}
