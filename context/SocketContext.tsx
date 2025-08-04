// SocketContext.tsx
import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';

interface SocketContextType {
  socket: Socket | null;
  submitPairingCode: (codeValue: string) => void;
  disconnectSocket: () => void;
  updateWalletData: (data: any) => void;
  isConnected: boolean;
  pairingStatus: 'idle' | 'connecting' | 'paired' | 'failed' | 'pairingLost';
  error: string | null;
  webSocketId: string | null;
  mobileSocketId: string | null;
}

interface PairingCompleteData {
  webSocketId?: string;
  mobileSocketId?: string;
  dateStamp?: string; // Or Date
  status?: string;
}

// Updated to reflect the actual data being sent on this event
interface PairingLostData {
  mobileSocketId?: string;
  webSocketId?: string;
  reason?: string;
}


const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [pairingStatus, setPairingStatus] = useState<SocketContextType['pairingStatus']>('idle');
  const [error, setError] = useState<string | null>(null);
  const [webSocketId, setWebSocketId] = useState<string | null>(null);
  const [mobileSocketId, setMobileSocketId] = useState<string | null>(null);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);

  const submitPairingCode = (codeValue: string) => {
    if (socketRef.current) {
      console.log('SocketContext: Cleaning up old socket before new connection.');
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setPairingStatus('connecting');
    setError(null);
    setWebSocketId(null);
    setMobileSocketId(null);
    setLastScannedCode(codeValue);

    // More robust connection options
    const newSocket = io('http://192.168.0.170:7001', { // Your NestJS backend URL
      reconnectionAttempts: 3,
      timeout: 10000,
      transports: ['websocket'], // Prioritize websocket transport
      pingInterval: 20000,       // Send a ping every 20 seconds
      pingTimeout: 15000,        // Consider connection lost if no pong received within 15 seconds
    });
    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      console.log('SocketContext: Socket connected. ID:', newSocket.id);
      setIsConnected(true);
      newSocket.emit('submitPairingCode', { code: codeValue });
      console.log('SocketContext: Sent submitPairingCode with code:', codeValue);
    });

    newSocket.on('pairingComplete', (data: PairingCompleteData) => {
      console.log('SocketContext: "pairingComplete" received:', data);
      if (data && data.webSocketId && data.mobileSocketId && newSocket.id === data.mobileSocketId) {
        setWebSocketId(data.webSocketId);
        setMobileSocketId(data.mobileSocketId);
        setPairingStatus('paired');
        setError(null);
        console.log(`SocketContext: Pairing successful. WebID: ${data.webSocketId}, MobileID: ${data.mobileSocketId}`);
      } else {
        let reason = 'Pairing data validation failed.';
        if (!data) reason = 'Pairing complete event received with no data.';
        else if (newSocket.id !== data.mobileSocketId) reason = 'Received pairing confirmation for a different mobile device.';

        console.error('SocketContext: Pairing failed validation.', reason, 'Data:', data);
        setPairingStatus('failed');
        setError(reason);
        setWebSocketId(null);
        setMobileSocketId(null);
        setLastScannedCode(null);
      }
    });

    newSocket.on('pairingFailed', (data: { reason?: string }) => {
      console.warn('SocketContext: "pairingFailed" received:', data);
      setPairingStatus('failed');
      setError(data.reason || 'Pairing failed as reported by server.');
      setWebSocketId(null);
      setMobileSocketId(null);
      setLastScannedCode(null);
    });

    newSocket.on('pairingLost', (data?: PairingLostData) => {
      console.warn('SocketContext: "pairingLost" received:', data);
      setPairingStatus('pairingLost');
      setError(data?.reason || 'Pairing with web client was lost.');
      setWebSocketId(null);
      setMobileSocketId(null);
      setLastScannedCode(null);
    });

    newSocket.on('disconnect', (reason: string) => {
      console.log(`SocketContext: Socket disconnected. Reason: ${reason}.`);
      setIsConnected(false);
      
      // Use functional update to get the latest pairingStatus and avoid stale closures.
      // This is crucial for correctly handling unexpected disconnects (e.g., when un-paired by web).
      setPairingStatus(prevPairingStatus => {
        if (prevPairingStatus === 'paired' && reason !== 'io client disconnect') {
          setError(prevError => prevError || `Connection lost with server (${reason}).`);
          return 'pairingLost';
        }
        // For other statuses, or for a manual disconnect, we don't change the pairing status here.
        // Manual disconnects are handled by disconnectSocket(), which sets status to 'idle'.
        return prevPairingStatus;
      });
    });

    newSocket.on('connect_error', (err: Error) => {
      console.error('SocketContext: Connection error:', err.message);
      setPairingStatus('failed');
      setError(`Connection Error: ${err.message}.`);
      setIsConnected(false);
      setWebSocketId(null);
      setMobileSocketId(null);
      setLastScannedCode(null);
    });
  };

  const disconnectSocket = () => {
    console.log(`SocketContext: disconnectSocket called manually.`);

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setIsConnected(false);
    setPairingStatus('idle');
    setError(null);
    setWebSocketId(null);
    setMobileSocketId(null);
    setLastScannedCode(null);
  };

  const updateWalletData = (data: any) => {
    if (socketRef.current && socketRef.current.connected && pairingStatus === 'paired') {
      socketRef.current.emit('updateWalletData', {
        webSocketId,
        mobileSocketId,
        payload: data,
      });
      console.log('SocketContext: Sent updateWalletData.');
    } else {
      console.log('SocketContext: Conditions not met for sending data.');
    }
  };

  useEffect(() => {
    return () => {
      console.log('SocketProvider unmounting, ensuring cleanup.');
      disconnectSocket();
    };
  }, []);

  return (
    <SocketContext.Provider value={{
      socket: socketRef.current,
      submitPairingCode,
      disconnectSocket,
      updateWalletData,
      isConnected,
      pairingStatus,
      error,
      webSocketId,
      mobileSocketId,
    }}>
      {children}
    </SocketContext.Provider>
  );
};
