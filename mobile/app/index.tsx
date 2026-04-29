import { Redirect } from 'expo-router';
import { useLang } from '../context/LanguageContext';

export default function Index() {
  const { isLoaded, isFirstLaunch } = useLang();

  if (!isLoaded) return null;

  if (isFirstLaunch) {
    return <Redirect href="/language-select" />;
  }

  return <Redirect href="/(tabs)" />;
}
