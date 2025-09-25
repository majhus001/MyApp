import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import { Client, Message } from 'paho-mqtt';

export default function App() {
  const [location, setLocation] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('Connecting...');
  const clientRef = useRef(null);
  const isPublishingRef = useRef(false);
  const intervalRef = useRef(null);

  // ----- CONFIG -----
  const USE_LOCAL = false; // true = localhost, false = Render
  const MQTT_BROKER = USE_LOCAL
    ? 'ws://192.168.1.7:8080/mqtt' // replace with your PC's local IP
    : 'wss://mqtt-server-0dxl.onrender.com/mqtt'; // Fixed URL - removed https://

  const MQTT_CLIENT_ID = 'mobile_' + Math.floor(Math.random() * 10000);
  const MQTT_TOPIC = 'busmate/location';
  const PUBLISH_INTERVAL = 15000; // 15s

  // ----- CONNECT MQTT -----
  const connectMQTT = () => {
    console.log(`🔗 Connecting to: ${MQTT_BROKER}`);
    setConnectionStatus('Connecting to MQTT...');
    
    const client = new Client(MQTT_BROKER, MQTT_CLIENT_ID);
    clientRef.current = client;

    client.onConnectionLost = (res) => {
      console.log('⚠️ Connection lost:', res?.errorMessage);
      setConnectionStatus('Connection lost - Reconnecting...');
      setTimeout(() => connectMQTT(), 5000);
    };

    client.onMessageArrived = (message) => {
      console.log('📨 Message received:', message.destinationName);
    };

    const connectOptions = {
      onSuccess: () => {
        console.log('✅ Connected to MQTT broker!');
        setConnectionStatus('Connected to MQTT');
      },
      onFailure: (err) => {
        console.log('❌ MQTT connect error:', err);
        console.log('🔗 Attempted URL:', MQTT_BROKER);
        setConnectionStatus('Connection failed - Retrying...');
        setTimeout(() => connectMQTT(), 5000);
      },
      useSSL: MQTT_BROKER.startsWith('wss://'), // Auto-detect based on URL
      reconnect: true,
      timeout: 30, // Increased timeout for slower networks
      keepAliveInterval: 60,
    };

    client.connect(connectOptions);
  };

  // ----- PUBLISH LOCATION -----
  const publishLocation = (loc) => {
    const client = clientRef.current;
    if (!client || !client.isConnected()) {
      console.log('⚠️ MQTT client not connected, skipping publish');
      return;
    }

    try {
      const payload = JSON.stringify({
        seats:50,
        lat: loc.coords.latitude.toFixed(5),
        lng: loc.coords.longitude.toFixed(5),
        ts: loc.timestamp,
        clientId: MQTT_CLIENT_ID,
      });

      const message = new Message(payload);
      message.destinationName = MQTT_TOPIC;
      message.qos = 1; // Ensure message delivery
      
      client.send(message);
      console.log('📍 Location published:', payload);
    } catch (error) {
      console.log('❌ Error publishing location:', error);
    }
  };

  // ----- LOCATION HANDLING -----
  const startLocationTracking = async () => {
    try {
      // Request location permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('❌ Location permission denied');
        setConnectionStatus('Location permission denied');
        return;
      }

      console.log('✅ Location permission granted');

      // Set location accuracy options
      const locationOptions = {
        accuracy: Location.Accuracy.Balanced,
        timeout: 10000,
      };

      // Initial location fetch & publish
      const loc = await Location.getCurrentPositionAsync(locationOptions);
      setLocation(loc);
      publishLocation(loc);

      // Interval publishing
      intervalRef.current = setInterval(async () => {
        if (isPublishingRef.current) return;
        isPublishingRef.current = true;

        try {
          const newLoc = await Location.getCurrentPositionAsync(locationOptions);
          setLocation(newLoc);
          publishLocation(newLoc);
        } catch (error) {
          console.log('❌ Error getting location:', error);
        }

        isPublishingRef.current = false;
      }, PUBLISH_INTERVAL);

    } catch (error) {
      console.log('❌ Location tracking error:', error);
      setConnectionStatus('Location error');
    }
  };

  // ----- EFFECT -----
  useEffect(() => {
    connectMQTT();

    // Start location tracking after a brief delay
    const locationTimer = setTimeout(() => {
      startLocationTracking();
    }, 1000);

    return () => {
      clearInterval(intervalRef.current);
      clearTimeout(locationTimer);
      if (clientRef.current?.isConnected()) {
        clientRef.current.disconnect();
      }
    };
  }, []);

  // ----- UI -----
  return (
    <View style={styles.container}>
      <Text style={styles.title}>BusMate Location Tracker</Text>
      
      <View style={styles.statusContainer}>
        <Text style={styles.statusLabel}>Connection:</Text>
        <Text style={[
          styles.statusValue,
          connectionStatus.includes('Connected') && styles.connected
        ]}>
          {connectionStatus}
        </Text>
      </View>

      {location ? (
        <View style={styles.locationContainer}>
          <Text style={styles.locationText}>
            📍 Latitude: {location.coords.latitude.toFixed(5)}
          </Text>
          <Text style={styles.locationText}>
            📍 Longitude: {location.coords.longitude.toFixed(5)}
          </Text>
          <Text style={styles.locationText}>
            ⏰ Last Update: {new Date(location.timestamp).toLocaleTimeString()}
          </Text>
          <Text style={styles.locationText}>
            🆔 Client ID: {MQTT_CLIENT_ID}
          </Text>
        </View>
      ) : (
        <Text style={styles.loadingText}>Fetching location...</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
    color: '#333',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginRight: 10,
    color: '#666',
  },
  statusValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ff6b35',
  },
  connected: {
    color: '#4caf50',
  },
  locationContainer: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
    minWidth: '80%',
  },
  locationText: {
    fontSize: 16,
    marginBottom: 8,
    color: '#333',
    fontWeight: '500',
  },
  loadingText: {
    fontSize: 18,
    color: '#666',
    fontStyle: 'italic',
  },
});