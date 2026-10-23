import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Home, Folder, ScanLine, Wrench } from 'lucide-react-native';

export type NavTabType = 'home' | 'files' | 'scan' | 'tools';

interface AcrobatBottomNavProps {
  currentTab: NavTabType;
  onSelectTab: (tab: NavTabType) => void;
  primaryColor: string;
  isDark: boolean;
  bottomInset: number;
}

export const AcrobatBottomNav: React.FC<AcrobatBottomNavProps> = ({
  currentTab,
  onSelectTab,
  primaryColor,
  isDark,
  bottomInset,
}) => {
  const bg = isDark ? '#0f172a' : '#ffffff';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const inactiveColor = isDark ? '#64748b' : '#94a3b8';

  const navItems: Array<{ tab: NavTabType; label: string; icon: (active: boolean) => React.ReactNode }> = [
    {
      tab: 'home',
      label: 'Home',
      icon: (active) => <Home size={22} color={active ? primaryColor : inactiveColor} />,
    },
    {
      tab: 'files',
      label: 'Files',
      icon: (active) => <Folder size={22} color={active ? primaryColor : inactiveColor} />,
    },
    {
      tab: 'scan',
      label: 'Scan',
      icon: (active) => <ScanLine size={22} color={active ? primaryColor : inactiveColor} />,
    },
    {
      tab: 'tools',
      label: 'Tools',
      icon: (active) => <Wrench size={22} color={active ? primaryColor : inactiveColor} />,
    },
  ];

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: bg,
          borderTopColor: border,
          paddingBottom: Math.max(bottomInset, Platform.OS === 'ios' ? 14 : 8),
        },
      ]}
    >
      {navItems.map((item) => {
        const isActive = currentTab === item.tab;
        return (
          <TouchableOpacity
            key={item.tab}
            onPress={() => onSelectTab(item.tab)}
            style={styles.tabBtn}
            activeOpacity={0.7}
          >
            <View style={styles.iconSlot}>
              {item.icon(isActive)}
            </View>
            <Text
              style={[
                styles.tabLabel,
                {
                  color: isActive ? primaryColor : inactiveColor,
                  fontWeight: isActive ? '800' : '600',
                },
              ]}
            >
              {item.label}
            </Text>
            <View
              style={[
                styles.activeDot,
                { backgroundColor: isActive ? primaryColor : 'transparent' },
              ]}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    paddingTop: 6,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 10,
  },
  tabBtn: {
    flex: 1,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSlot: {
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 10.5,
    marginTop: 2,
    letterSpacing: 0.2,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
});
