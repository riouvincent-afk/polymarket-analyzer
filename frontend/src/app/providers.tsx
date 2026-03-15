"use client";

import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/wagmi";
import { BotProvider } from "@/lib/BotContext";
import { AuthProvider } from "@/lib/AuthContext";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <AuthProvider>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <BotProvider>
            {children}
          </BotProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </AuthProvider>
  );
}
