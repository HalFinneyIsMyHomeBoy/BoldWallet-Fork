import React, { useEffect } from 'react';
import { View, StyleSheet, Alert, Text } from 'react-native';
import {
  useCameraDevice,
  useCameraPermission,
  Camera,
  useCodeScanner,
} from 'react-native-vision-camera';
import { useNavigation } from '@react-navigation/native';

export function QrScanner() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const navigation = useNavigation();

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission]);

  const codeScanner = useCodeScanner({
    codeTypes: ['qr', 'ean-13'],
    onCodeScanned: codes => {
      if (codes.length > 0) {
        const scannedCode = codes[0].value;
        console.log(`Scanned QR code with value: ${scannedCode}`);
        
        // Vibrate or give some feedback to the user
        // Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        // Navigate back to the previous screen and pass the scanned code as a parameter
        navigation.navigate('Device Pairing', { scannedCode });
      }
    },
  });

  useEffect(() => {
    if (!device) {
      Alert.alert('Error', 'No camera device found.');
    }
  }, [device]);

  if (!device) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No camera device found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        codeScanner={codeScanner}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: 'white',
    fontSize: 16,
  },
});
