import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { Home, TrendingUp, Users, Leaf, Settings, Newspaper, Calendar } from 'lucide-react-native';
import { COLORS, FONTS } from '../../constants/theme';
import { useT } from '../../utils/useT';

export default function TabLayout() {
  const { t } = useT();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        lazy: true,
        tabBarActiveTintColor: COLORS.sprout,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('homeTab'),
          tabBarIcon: ({ color, size }) => (
            <Home color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="prices"
        options={{
          title: t('pricesTab'),
          tabBarIcon: ({ color, size }) => (
            <TrendingUp color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="news"
        options={{
          title: 'News',
          tabBarIcon: ({ color, size }) => (
            <Newspaper color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="cooperative"
        options={{
          title: t('cooperative'),
          tabBarIcon: ({ color, size }) => (
            <Users color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: 'Plan',
          tabBarIcon: ({ color, size }) => (
            <Calendar color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="farm"
        options={{
          title: t('farmTab'),
          tabBarIcon: ({ color, size }) => (
            <Leaf color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('settingsTitle'),
          tabBarIcon: ({ color, size }) => (
            <Settings color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: COLORS.forest,
    borderTopColor: COLORS.canopy,
    borderTopWidth: 1,
    paddingTop: 8,
    paddingBottom: 8,
    height: 60,
  },
  tabLabel: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    marginTop: 4,
  },
});
