import React, { useEffect, useState, useRef } from 'react';
import { View, Text } from 'react-native';
import * as Location from 'expo-location';
import { Client, Message } from 'paho-mqtt';

export default function App() {
  const [location, setLocation] = useState(null);
  const clientRef = useRef(null);
  const isPublishingRef = useRef(false);
  const intervalRef = useRef(null);

  // ----- CONFIG -----
  const USE_LOCAL = true; // toggle this: true = localhost, false = Render
  const MQTT_BROKER = USE_LOCAL
    ? 'ws://192.168.1.7:8080/mqtt' // replace with your PC's local IP
    : 'wss://busmate-broker.onrender.com/mqtt';

  const MQTT_CLIENT_ID = 'mobile_' + Math.floor(Math.random() * 10000);
  const MQTT_TOPIC = 'busmate/location';
  const PUBLISH_INTERVAL = 15000; // 15s, adjust for low-speed networks

  // ----- CONNECT MQTT -----
  const connectMQTT = () => {
    const client = new Client(MQTT_BROKER, MQTT_CLIENT_ID);
    clientRef.current = client;

    client.onConnectionLost = (res) => {
      console.log('⚠️ Connection lost:', res?.errorMessage);
      setTimeout(() => connectMQTT(), 5000); // reconnect after 5s
    };

    client.connect({
      onSuccess: () => console.log('✅ Connected to MQTT broker!'),
      onFailure: (err) => {
        console.log('❌ MQTT connect error:', err?.errorMessage);
        setTimeout(() => connectMQTT(), 5000);
      },
      useSSL: !USE_LOCAL, // false for ws://, true for wss://
      reconnect: true,
    });
  };

  // ----- PUBLISH LOCATION -----
  const publishLocation = (loc) => {
    const client = clientRef.current;
    if (!client?.isConnected()) return;

    const payload = JSON.stringify({
      lat: loc.coords.latitude.toFixed(5),
      lng: loc.coords.longitude.toFixed(5),
      ts: loc.timestamp,
    });

    const message = new Message(payload);
    message.destinationName = MQTT_TOPIC;
    client.send(message);
  };

  // ----- EFFECT -----
  useEffect(() => {
    connectMQTT();

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('❌ Location permission denied');
        return;
      }

      // Initial location fetch & publish
      const loc = await Location.getCurrentPositionAsync({});
      setLocation(loc);
      publishLocation(loc);

      // Interval publishing
      intervalRef.current = setInterval(async () => {
        if (isPublishingRef.current) return;
        isPublishingRef.current = true;

        const newLoc = await Location.getCurrentPositionAsync({});
        setLocation(newLoc);
        publishLocation(newLoc);

        isPublishingRef.current = false;
      }, PUBLISH_INTERVAL);
    })();

    return () => clearInterval(intervalRef.current);
  }, []);

  // ----- UI -----
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      {location ? (
        <Text>
          Lat: {location.coords.latitude.toFixed(5)}{"\n"}
          Lng: {location.coords.longitude.toFixed(5)}
        </Text>
      ) : (
        <Text>Fetching location...</Text>
      )}
    </View>
  );
}
