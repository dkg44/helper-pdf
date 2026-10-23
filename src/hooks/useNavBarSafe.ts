/**
 * useNavBarSafe
 * Returns safe bottom padding for elements near bottom edge of screen.
 * Accounts for Android 3-button nav bar and iOS home indicator.
 */
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function useNavBarSafe(extraSpacing = 0): number {
  const insets = useSafeAreaInsets();
  const bottom = insets?.bottom ?? 0;
  if (bottom > 0) return bottom + extraSpacing;
  return extraSpacing;
}
