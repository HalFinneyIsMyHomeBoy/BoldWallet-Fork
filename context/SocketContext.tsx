// SocketContext.tsx
import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';

interface SocketContextType {
  socket: Socket | null;
  connectSocket: (codeValue: string) => void;
  disconnectSocket: () => void;
  isConnected: boolean;
  pairingStatus: 'idle' | 'connecting' | 'paired' | 'failed' | 'pairingLost';
  error: string | null;
  webSocketId: string | null;
  mobileSocketId: string | null;
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
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // The explicit TRPC mutation is no longer necessary as the backend's socket
  // disconnect handler is sufficient.
  // const unpairDeviceMutation = trpc.device.unpairDevice.useMutation();

  const clearHeartbeatInterval = () => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
      console.log('SocketContext: Heartbeat interval cleared.');
    }
  };

  const startHeartbeatInterval = () => {
    clearHeartbeatInterval();
    console.log('SocketContext: Starting heartbeat interval...');
    heartbeatIntervalRef.current = setInterval(() => {
      if (socketRef.current && socketRef.current.connected && pairingStatus === 'paired') {
        socketRef.current.emit('heartbeat');
        console.log('SocketContext: Sent heartbeat.');
      } else {
        console.log('SocketContext: Conditions not met for heartbeat. Clearing interval.');
        clearHeartbeatInterval();
      }
    }, 5000);
  };

  const connectSocket = (codeValue: string) => {
    if (socketRef.current) {
      console.log('SocketContext: Cleaning up old socket before new connection.');
      clearHeartbeatInterval();
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setPairingStatus('connecting');
    setError(null);
    setWebSocketId(null);
    setMobileSocketId(null);
    setLastScannedCode(codeValue);

    const newSocket = io('http://192.168.0.170:7001', { // Your NestJS backend URL
      reconnectionAttempts: 3,
      timeout: 10000,
    });
    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      console.log('SocketContext: Socket connected. ID:', newSocket.id);
      setIsConnected(true);
      newSocket.emit('submitPairingCode', { code: codeValue });
      console.log('SocketContext: Sent submitPairingCode with code:', codeValue);
    });

    newSocket.on('pairingComplete', (data: { webSocketId?: string, mobileSocketId?: string }) => {
      console.log('SocketContext: "pairingComplete" received:', data);
      if (data && data.webSocketId && data.mobileSocketId && newSocket.id === data.mobileSocketId) {
        setWebSocketId(data.webSocketId);
        setMobileSocketId(data.mobileSocketId);
        setPairingStatus('paired');
        setError(null);
        console.log(`SocketContext: Pairing successful. WebID: ${data.webSocketId}, MobileID: ${data.mobileSocketId}`);
        startHeartbeatInterval();
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
        clearHeartbeatInterval();
      }
    });

    newSocket.on('pairingFailed', (data: { reason?: string }) => {
      console.warn('SocketContext: "pairingFailed" received:', data);
      setPairingStatus('failed');
      setError(data.reason || 'Pairing failed as reported by server.');
      setWebSocketId(null);
      setMobileSocketId(null);
      setLastScannedCode(null);
      clearHeartbeatInterval();
    });

    newSocket.on('pairingLost', (data?: { reason?: string }) => {
      console.warn('SocketContext: "pairingLost" received:', data);
      setPairingStatus('pairingLost');
      setError(data?.reason || 'Pairing with web client was lost.');
      setWebSocketId(null);
      setMobileSocketId(null);
      setLastScannedCode(null);
      clearHeartbeatInterval();
    });

    newSocket.on('disconnect', (reason: string) => {
      console.log(`SocketContext: Socket disconnected. Reason: ${reason}.`);
      setIsConnected(false);
      clearHeartbeatInterval();
      // If an unexpected disconnect happens while paired, it's a lost pairing.
      if (pairingStatus === 'paired' && reason !== 'io client disconnect') {
        setError(prevError => prevError || `Connection lost with server (${reason}).`);
        setPairingStatus('pairingLost');
      }
      // If disconnect was manual via disconnectSocket(), the state will be reset to 'idle' there.
    });

    newSocket.on('connect_error', (err: Error) => {
      console.error('SocketContext: Connection error:', err.message);
      setPairingStatus('failed');
      setError(`Connection Error: ${err.message}.`);
      setIsConnected(false);
      clearHeartbeatInterval();
      setWebSocketId(null);
      setMobileSocketId(null);
      setLastScannedCode(null);
    });
  };

  const disconnectSocket = () => {
    console.log(`SocketContext: disconnectSocket called manually.`);
    clearHeartbeatInterval();

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

  useEffect(() => {
    return () => {
      console.log('SocketProvider unmounting, ensuring cleanup.');
      disconnectSocket();
    };
  }, []);

  return (
    <SocketContext.Provider value={{
      socket: socketRef.current,
      connectSocket,
      disconnectSocket,
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