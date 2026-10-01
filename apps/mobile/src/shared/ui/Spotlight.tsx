import { StyleSheet, View } from 'react-native';
import { colors } from './theme';

/** The welcome screen's one bold element: a stage light falling from the top corner. */
export function Spotlight() {
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.disc} />
  );
}

const DIAMETER = 420;

const styles = StyleSheet.create({
  disc: {
    position: 'absolute',
    top: -DIAMETER * 0.42,
    right: -DIAMETER * 0.3,
    width: DIAMETER,
    height: DIAMETER,
    borderRadius: DIAMETER / 2,
    backgroundColor: colors.stagelight,
  },
});
