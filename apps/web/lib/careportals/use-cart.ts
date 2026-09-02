'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addToCart,
  clearStoredCartId,
  fetchCart,
  removeItem,
  updateItemQuantity,
} from './cart.client';
import type { CareportalsCart } from './types';

/**
 * The shared cart state (docs/shop/01-commerce.md section 5): TanStack Query
 * over the plain browser client. CarePortals declares the latest response the
 * source of truth and every mutation returns the full cart, so mutations
 * write their result straight into the one cache entry; no optimistic
 * updates, no second store. The query never runs during SSR, which is what
 * keeps the nav's cart count hydration-safe by construction.
 */
export const cartKeys = { cart: ['careportals-cart'] as const };

/** The live cart, `null` for "none stored or gone". Shared by badge, cart page and checkout. */
export function useCart() {
  return useQuery<CareportalsCart | null>({
    queryKey: cartKeys.cart,
    queryFn: fetchCart,
    // Cross-tab freshness is worth the cheap re-read here, unlike the app default.
    refetchOnWindowFocus: true,
  });
}

function useCartMutation<TVars>(mutationFn: (vars: TVars) => Promise<CareportalsCart>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (cart) => queryClient.setQueryData(cartKeys.cart, cart),
  });
}

export function useAddToCart() {
  return useCartMutation((vars: { productId: string; quantity?: number }) =>
    addToCart(vars.productId, vars.quantity ?? 1),
  );
}

export function useRemoveCartItem() {
  return useCartMutation((vars: { itemId: string }) => removeItem(vars.itemId));
}

/** Non-subscription lines only; the server reverts subscription quantities. */
export function useUpdateCartQuantity() {
  return useCartMutation((vars: { itemId: string; productId: string; quantity: number }) =>
    updateItemQuantity(vars.itemId, vars.productId, vars.quantity),
  );
}

/** The confirmation page's cleanup: forget the consumed cart everywhere at once. */
export function useClearCartAfterOrder() {
  const queryClient = useQueryClient();
  return () => {
    clearStoredCartId();
    queryClient.setQueryData(cartKeys.cart, null);
  };
}
