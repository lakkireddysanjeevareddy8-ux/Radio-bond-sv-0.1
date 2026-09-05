import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography } from '../utils/theme';

interface Props {
  title: string;
}

export const PlaceholderScreen: React.FC<Props> = ({ title }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.text as any}>{title} Screen</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  text: {
    ...typography.h2,
    color: colors.textPrimary,
  },
});
