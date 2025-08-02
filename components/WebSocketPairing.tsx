// WebSocketPairingScreen.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, Alert, ActivityIndicator, StyleSheet, Platform, TouchableOpacity, Image, Modal } from 'react-native';
import { useSocket } from '../context/SocketContext'; // Adjust path
import { useNavigation } from '@react-navigation/native';
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera';
import BarcodeZxingScan from 'rn-barcode-zxing-scan';
import { HapticFeedback } from '../utils';

const QRScanner = ({ styles, device, codeScanner, onClose }: any) => {
  if (!device) {
    return <Text style={styles.cameraNotFound}>Camera Not Found</Text>;
  }
  return (
    <View style={styles.scannerContainer}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device || null}
        isActive={true}
        torch="off"
        codeScanner={codeScanner}
      />
      <View style={styles.qrFrame} />
      <TouchableOpacity style={styles.closeScannerButton} onPress={onClose}>
        <Text style={styles.closeScannerButtonText}>Close</Text>
      </TouchableOpacity>
    </View>
  );
};

export default function WebSocketPairingScreen() {
  const [code, setCode] = useState('');
  const [isScannerVisible, setIsScannerVisible] = useState(false);
  const {
    submitPairingCode,
    disconnectSocket,
    pairingStatus,
    error: contextError,
    webSocketId: contextWebSocketId,
    mobileSocketId: contextMobileSocketId,
  } = useSocket();

  const navigation = useNavigation();
  const [localUiError, setLocalUiError] = useState('');

  let device;
  if (Platform.OS === 'ios') {
    device = useCameraDevice('back');
  }

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: codes => {
      if (codes.length > 0) {
        const scannedCode = codes[0].value;
        if (scannedCode) {
          const upperCaseCode = scannedCode.toUpperCase();
          setCode(upperCaseCode);
          if (/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(upperCaseCode)) {
            setLocalUiError('');
            submitPairingCode(upperCaseCode);
          } else {
            setLocalUiError('Invalid QR code. Please scan a valid pairing code.');
          }
        }
        setIsScannerVisible(false);
      }
    },
  });

  useEffect(() => {
    if (pairingStatus === 'paired' && contextWebSocketId && contextMobileSocketId) {
      Alert.alert(
        'Pairing Successful',
        `Device paired!\nWeb ID: ${contextWebSocketId}\nMobile ID: ${contextMobileSocketId}`,
        [{ text: "OK" }]
      );
    }
  }, [pairingStatus, contextWebSocketId, contextMobileSocketId]);


  const handleInitiatePairing = () => {
    const upperCaseCode = code.trim().toUpperCase();
    if (/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(upperCaseCode)) {
      setLocalUiError('');
      submitPairingCode(upperCaseCode);
    } else {
      setLocalUiError('Please enter a valid pairing code in the format XXXX-YYYY.');
    }
  };

  const displayError = contextError || localUiError;

  if (pairingStatus === 'connecting') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text style={styles.statusText}>Attempting to pair with code: {code}...</Text>
        <Text style={styles.subtleText}>Status: {pairingStatus}</Text>
        {displayError && <Text style={styles.errorText}>Error: {displayError}</Text>}
      </View>
    );
  }

  if (pairingStatus === 'paired' && contextWebSocketId && contextMobileSocketId) {
    return (
      <View style={styles.container}>
        <Text style={styles.successTitle}>
          Device Successfully Paired!
        </Text>
        <Text style={styles.infoText}>Web App ID: {contextWebSocketId}</Text>
        <Text style={styles.infoText}>Mobile Device ID: {contextMobileSocketId}</Text>
        <Text style={styles.subtleText}>
          The connection will remain active in the background.
        </Text>

        <View style={styles.buttonContainer}>
          <Button
            title="Unpair Device"
            onPress={disconnectSocket}
            color="#c00"
          />
        </View>

      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enter Pairing Code from Web:</Text>
      <View style={styles.inputWithIcons}>
        <TextInput
          value={code}
          onChangeText={(text) => {
              setCode(text.toUpperCase());
              if (localUiError) setLocalUiError('');
          }}
          placeholder="XXXX-YYYY"
          keyboardType="default"
          style={[styles.input, displayError ? styles.inputError : null]}
          maxLength={9}
          autoCapitalize="characters"
          autoFocus={true}
        />
        <TouchableOpacity
            onPress={() => {
              HapticFeedback.light();
              if (Platform.OS === 'android') {
                BarcodeZxingScan.showQrReader(
                  (error: any, data: any) => {
                    if (!error && data) {
                      const upperCaseData = data.toUpperCase();
                      setCode(upperCaseData);
                      if (/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(upperCaseData)) {
                        setLocalUiError('');
                        submitPairingCode(upperCaseData);
                      } else {
                        setLocalUiError('Invalid QR code. Please scan a valid pairing code.');
                      }
                    }
                  },
                );
              } else {
                setIsScannerVisible(true);
              }
            }}
            style={styles.qrIconContainer}>
            <Image
              source={require('../assets/qr-icon.png')}
              style={styles.iconImage}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </View>
      <Button
        title="Pair Device"
        onPress={handleInitiatePairing}
        disabled={!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code.trim().toUpperCase()) || pairingStatus === 'connecting' || pairingStatus === 'paired'}
      />
      {displayError && (
        <Text style={styles.errorText}>
          Error: {displayError}
        </Text>
      )}
      <Text style={styles.subtleText}>
        Current Status: {pairingStatus}
      </Text>
      <Modal
        animationType="fade"
        transparent={false}
        visible={isScannerVisible}
        onRequestClose={() => setIsScannerVisible(false)}>
        <QRScanner
          styles={styles}
          device={device}
          codeScanner={codeScanner}
          onClose={() => setIsScannerVisible(false)}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5'
  },
  title: {
    fontSize: 18,
    marginBottom: 10,
    textAlign: 'center',
  },
  successTitle: {
    color: 'green',
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 15,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    paddingRight: 50,
    width: 250,
    textAlign: 'center',
    fontSize: 18,
    borderRadius: 8,
  },
  inputWithIcons: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  inputError: {
    borderColor: 'red',
  },
  errorText: {
    color: 'red',
    marginTop: 20,
    textAlign: 'center',
  },
  statusText: {
    marginTop: 20,
    fontSize: 16,
  },
  subtleText: {
    marginTop: 20,
    textAlign: 'center',
    color: 'gray',
  },
  infoText: {
    fontSize: 14,
    textAlign: 'center',
    marginVertical: 2,
  },
  buttonContainer: {
    marginTop: 30,
    width: '60%',
  },
  qrIconContainer: {
    position: 'absolute',
    right: 15,
    top: '50%',
    transform: [{ translateY: -12 }],
    padding: 5,
  },
  iconImage: {
    width: 24,
    height: 24,
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: 'black',
  },
  qrFrame: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'white',
    width: 250,
    height: 250,
    alignSelf: 'center',
    top: '25%',
  },
  closeScannerButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 10,
    borderRadius: 50,
  },
  closeScannerButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  cameraNotFound: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});