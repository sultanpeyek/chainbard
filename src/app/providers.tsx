'use client';

import type { WalletError } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { Toaster } from 'sonner';
import { env } from '@/env';
import '@solana/wallet-adapter-react-ui/styles.css';

// SOLANA_RPC_URL is server-only and cannot be read in a Client Component, so the
// browser ConnectionProvider needs a NEXT_PUBLIC_ endpoint. Mainnet-only.
const endpoint = env.NEXT_PUBLIC_SOLANA_RPC_URL;

// User-rejection is an expected outcome, not an error — swallow it so it does not
// surface as an uncaught console error. Real failures still log.
function onWalletError(error: WalletError) {
  const rejected = error.name === 'WalletConnectionError' || /user rejected/i.test(error.message);
  if (rejected) return;
  console.error(error);
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider autoConnect wallets={[]} onError={onWalletError}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--ink-raised)',
            color: 'var(--bone)',
            border: '1px solid var(--ink-line)',
            borderRadius: '3px',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
          },
        }}
      />
    </ConnectionProvider>
  );
}
