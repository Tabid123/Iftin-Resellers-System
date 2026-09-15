import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number): string {
  // For very small amounts (like small profits), show up to 4 decimal places
  if (price > 0 && price < 0.10) {
    return price.toFixed(4).replace(/\.?0+$/, '');
  }
  // For normal amounts, show 2 decimal places and remove trailing zeros
  return price.toFixed(2).replace(/\.?0+$/, '');
}
