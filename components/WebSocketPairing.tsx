// WebSocketPairingScreen.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { useSocket } from '../context/SocketContext'; // Adjust path
import { useNavigation } from '@react-navigation/native';

export default function WebSocketPairingScreen() {
  const [code, setCode] = useState('');
  const {
    connectSocket,
    disconnectSocket, // <-- 1. Get the disconnect function
    pairingStatus,
    error: contextError,
    webSocketId: contextWebSocketId,
    mobileSocketId: contextMobileSocketId,
  } = useSocket();

  const navigation = useNavigation();
  const [localUiError, setLocalUiError] = useState('');

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
    if (code.trim().length === 6 && /^\d+$/.test(code.trim())) {
      setLocalUiError('');
      connectSocket(code.trim());
    } else {
      setLocalUiError('Please enter a valid 6-digit code.');
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

        {/* --- 2. Add the Unpair Button --- */}
        <View style={styles.buttonContainer}>
          <Button
            title="Unpair Device"
            onPress={disconnectSocket} // <-- Call disconnectSocket on press
            color="#c00" // A red color for a destructive action
          />
        </View>

      </View>
    );
  }

  // UI for 'idle', 'failed', or 'lost'
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enter Pairing Code from Web:</Text>
      <TextInput
        value={code}
        onChangeText={(text) => {
            setCode(text);
            if (localUiError) setLocalUiError('');
        }}
        placeholder="6-digit code"
        keyboardType="numeric"
        style={[styles.input, displayError ? styles.inputError : null]}
        maxLength={6}
        autoFocus={true}
      />
      <Button
        title="Pair Device"
        onPress={handleInitiatePairing}
        disabled={code.trim().length !== 6 || pairingStatus === 'connecting' || pairingStatus === 'paired'}
      />
      {displayError && (
        <Text style={styles.errorText}>
          Error: {displayError}
        </Text>
      )}
      <Text style={styles.subtleText}>
        Current Status: {pairingStatus}
      </Text>
    </View>
  );
}

// Optional: Add some basic styles for better layout
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
    marginVertical: 20,
    width: 200,
    textAlign: 'center',
    fontSize: 18,
    borderRadius: 8,
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
  }
});