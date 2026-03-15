import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Vibration,
  StatusBar,
  Animated,
  Platform,
  Linking,
  ActivityIndicator,
} from "react-native";
import * as Location from "expo-location";
import { Accelerometer } from "expo-sensors";
import * as SMS from "expo-sms";
import { Audio } from "expo-av";
import { io } from "socket.io-client";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const API_URL = "http://192.168.0.102:3001"; // USER CAN EDIT THIS TO LAN IP
const USER = {
  id: "user_001",
  name: "Priya Sharma",
  phone: "+919876543210",
};
const EMERGENCY_CONTACTS = [
  { name: "Brother Rahul", phone: "+919876543211" },
  { name: "Mom", phone: "+919876543212" },
];

// Shake detection config
const SHAKE_THRESHOLD = 2.5;
const SHAKE_COUNT_REQUIRED = 3;
const SHAKE_WINDOW_MS = 1500;

export default function HomeScreen() {
  const [sosActive, setSosActive] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [countdown, setCountdown] = useState(null); // pre-SOS countdown
  const [fakeCallActive, setFakeCallActive] = useState(false);
  const [location, setLocation] = useState(null);
  const [statusMsg, setStatusMsg] = useState("You are safe");
  const [shakeCount, setShakeCount] = useState(0);

  const locationInterval = useRef(null);
  const recordingRef = useRef(null);
  const countdownTimer = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const countdownScale = useRef(new Animated.Value(2)).current;
  const shakeTimestamps = useRef([]);
  const socket = useRef(null);

  // ─── Setup ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let sub = null;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          if (Platform.OS !== "web") {
             Alert.alert("Permission needed", "Location permission is required for SOS.");
          } else {
             console.warn("Location permission denied (web)");
          }
          return;
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced, // Safer for web/emulators
        });
        if (loc && loc.coords) {
          setLocation(loc.coords);
        }
      } catch (e) {
        console.warn("Location fetch error:", e);
      }
    })();

    // WebSocket connection
    try {
      socket.current = io(API_URL);
      socket.current.on("connect", () => console.log("WS connected"));
    } catch(e) {
      console.warn("Socket connection warning:", e);
    }

    // Accelerometer for shake detection
    try {
      Accelerometer.setUpdateInterval(100);
      sub = Accelerometer.addListener(({ x, y, z }) => {
        const acceleration = Math.sqrt(x * x + y * y + z * z);
        if (acceleration > SHAKE_THRESHOLD) {
          const now = Date.now();
          shakeTimestamps.current.push(now);
          // Keep only shakes within window
          shakeTimestamps.current = shakeTimestamps.current.filter(
            (t) => now - t < SHAKE_WINDOW_MS,
          );
          if (shakeTimestamps.current.length >= SHAKE_COUNT_REQUIRED) {
            shakeTimestamps.current = [];
            handleShakeDetected();
          }
        }
      });
    } catch(e) {
      console.warn("Accelerometer error:", e);
    }

    return () => {
      if (sub && typeof sub.remove === 'function') {
        sub.remove();
      }
      socket.current?.disconnect();
      clearInterval(locationInterval.current);
    };
  }, []);

  // Pulse animation when SOS is active
  useEffect(() => {
    if (sosActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [sosActive]);

  // ─── Shake Handler ────────────────────────────────────────────────────────
  const handleShakeDetected = () => {
    if (sosActive || countdown !== null) return;
    try { Vibration.vibrate([100, 50, 100]); } catch(e){}
    startCountdown();
  };

  // ─── Countdown before SOS (gives user chance to cancel) ──────────────────
  const startCountdown = () => {
    let count = 5;
    setCountdown(count);
    
    // Scale animation helper
    const animateTick = () => {
       countdownScale.setValue(1.5);
       Animated.spring(countdownScale, {
          toValue: 1,
          friction: 4,
          useNativeDriver: true,
       }).start();
    };
    animateTick();

    countdownTimer.current = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        clearInterval(countdownTimer.current);
        setCountdown(null);
        triggerSOS();
      } else {
        setCountdown(count);
        animateTick();
      }
    }, 1000);
  };

  const cancelCountdown = () => {
    clearInterval(countdownTimer.current);
    setCountdown(null);
    setStatusMsg("You are safe");
  };

  // ─── Core SOS Flow ───────────────────────────────────────────────────────
  const triggerSOS = async () => {
    setSosActive(true);
    setIsSending(true);
    setStatusMsg("🚨 SOS TRIGGERED — Getting location & alerting...");
    try { Vibration.vibrate([100, 200, 100, 200, 1000]); } catch(e){}

    // Get fresh location carefully
    let coords = location;
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      coords = loc.coords;
      setLocation(coords);
    } catch (e) {
      console.warn("Location refresh error:", e);
    }

    // Start audio recording (evidence)
    await startRecording();

    // Hit backend
    try {
      const res = await fetch(`${API_URL}/api/sos/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: USER.id,
          userName: USER.name,
          phone: USER.phone,
          lat: coords?.latitude,
          lng: coords?.longitude,
          contacts: EMERGENCY_CONTACTS,
          shakeIntensity: 3.5, // Mock value for AI Prioritization testing
          audioDuration: 12   // Mock value for AI Prioritization testing
        }),
      });
      const data = await res.json();
      if (data.liveLink) {
        let newStatus = `🚨 SOS ACTIVE\nContacts notified\nTracking link sent`;
        if (data.priority === "HIGH") {
           newStatus = `⚠️ HIGH PRIORITY SOS\n` + newStatus;
        }
        if (data.helpersNotified > 0) {
           newStatus += `\n👥 Helpers Notified: ${data.helpersNotified}`;
        }
        setStatusMsg(newStatus);
      }
    } catch (e) {
      // Fallback: send SMS directly if backend unreachable
      await fallbackSMS(coords);
      setStatusMsg("🚨 SOS ACTIVE\n(SMS sent directly)");
    }

    setIsSending(false);

    // Start pushing location updates every 30 seconds
    locationInterval.current = setInterval(pushLocationUpdate, 30000);
  };

  const cancelSOS = async () => {
    setSosActive(false);
    setStatusMsg("You are safe");
    clearInterval(locationInterval.current);

    await stopRecording();

    try {
      await fetch(`${API_URL}/api/sos/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: USER.id }),
      });
    } catch (e) {
      // Notify contacts manually
      const msg = `✅ ${USER.name} is safe now. SOS cancelled.`;
      try {
        await SMS.sendSMSAsync(
          EMERGENCY_CONTACTS.map((c) => c.phone),
          msg,
        );
      } catch(smsErr) {}
    }
  };

  // ─── Location Streaming ───────────────────────────────────────────────────
  const pushLocationUpdate = async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({});
      if (loc && loc.coords) {
         setLocation(loc.coords);
         await fetch(`${API_URL}/api/sos/location`, {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({
             userId: USER.id,
             lat: loc.coords.latitude,
             lng: loc.coords.longitude,
           }),
         });
      }
    } catch (e) {
      console.warn("Location update failed:", e);
    }
  };

  // ─── Audio Recording ──────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
    } catch (e) {
      console.warn("Recording failed:", e);
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      console.log("Recording saved:", uri);
      recordingRef.current = null;
    } catch (e) {
      console.warn("Stop recording failed:", e);
    }
  };

  // ─── Fallback SMS (no internet) ───────────────────────────────────────────
  const fallbackSMS = async (coords) => {
    const mapsLink = coords && coords.latitude && coords.longitude
      ? `https://maps.google.com/?q=${coords.latitude},${coords.longitude}`
      : "Location unavailable";
    const msg = `🚨 EMERGENCY! ${USER.name} needs help!\n📍 Location: ${mapsLink}\n📞 Call: ${USER.phone}`;
    try {
      await SMS.sendSMSAsync(
        EMERGENCY_CONTACTS.map((c) => c.phone),
        msg,
      );
    } catch (e) {
      console.warn("SMS failed:", e);
    }
  };

  // ─── Fake Call ────────────────────────────────────────────────────────────
  const fakeCallPattern = [0, 1000, 2000, 1000, 2000]; 
  
  const triggerFakeCall = () => {
    setFakeCallActive(true);
    try { Vibration.vibrate(fakeCallPattern, true); } catch(e){} // loop true
    // Auto-dismiss after 30s if not answered
    setTimeout(() => {
       setFakeCallActive(false);
       try { Vibration.cancel(); } catch(e){}
    }, 30000);
  };
  
  const finishFakeCall = () => {
     setFakeCallActive(false);
     try { Vibration.cancel(); } catch(e){}
  };

  // ─── Call Police ──────────────────────────────────────────────────────────
  const callPolice = () => Linking.openURL("tel:100").catch(()=>{});
  const callHelpline = () => Linking.openURL("tel:1091").catch(()=>{});

  // ─── UI ──────────────────────────────────────────────────────────────────
  if (fakeCallActive) {
    return <FakeCallScreen onDismiss={finishFakeCall} />;
  }

  if (countdown !== null) {
    return (
      <View style={[styles.container, styles.countdownContainer]}>
        <StatusBar barStyle="light-content" backgroundColor="#1a0000" />
        <Text style={styles.countdownLabel}>SOS activating in...</Text>
        <Animated.Text style={[styles.countdownNumber, { transform: [{ scale: countdownScale }] }]}>
          {countdown}
        </Animated.Text>
        <TouchableOpacity
          style={styles.cancelCountdownBtn}
          onPress={cancelCountdown}
        >
          <Text style={styles.cancelCountdownText}>TAP TO CANCEL</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0d0d0d" />

      {/* Header */}
      <View style={styles.header}>
        {isSending ? (
          <ActivityIndicator color={RED} size="small" />
        ) : (
          <View style={[styles.statusDot, sosActive && { backgroundColor: RED }]} />
        )}
        <Text style={[styles.statusText, sosActive && { color: "#fff", fontWeight: "bold" }]}>{statusMsg}</Text>
      </View>

      {/* SOS Button */}
      <View style={styles.sosWrapper}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <TouchableOpacity
            style={[styles.sosButton, sosActive && styles.sosButtonActive]}
            onPress={sosActive ? cancelSOS : startCountdown}
            activeOpacity={0.85}
          >
            {isSending ? (
               <ActivityIndicator color="#fff" size="large" />
            ) : (
              <>
                <Text style={styles.sosButtonLabel}>
                  {sosActive ? "CANCEL" : "SOS"}
                </Text>
                <Text style={styles.sosButtonSub}>
                  {sosActive ? "Tap to cancel alert" : "Shake 3× or press"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Location */}
      <Text style={styles.locationText}>
        {location && typeof location.latitude === "number" && typeof location.longitude === "number"
          ? `📍 ${(location.latitude).toFixed(5)}, ${(location.longitude).toFixed(5)}`
          : "📍 Getting location..."}
      </Text>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.actionBtn} onPress={triggerFakeCall}>
          <Text style={styles.actionIcon}>📞</Text>
          <Text style={styles.actionLabel}>Fake Call</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={callHelpline}>
          <Text style={styles.actionIcon}>🆘</Text>
          <Text style={styles.actionLabel}>Helpline{"\n"}1091</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={callPolice}>
          <Text style={styles.actionIcon}>🚔</Text>
          <Text style={styles.actionLabel}>Police{"\n"}100</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => fallbackSMS(location)}
        >
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={styles.actionLabel}>SMS{"\n"}Contacts</Text>
        </TouchableOpacity>
      </View>

      {/* Contacts preview */}
      <View style={styles.contactsCard}>
        <Text style={styles.contactsTitle}>Emergency Contacts</Text>
        {EMERGENCY_CONTACTS.map((c, i) => (
          <Text key={i} style={styles.contactRow}>
            👤 {c.name} <Text style={styles.contactPhone}>{c.phone}</Text>
          </Text>
        ))}
      </View>

      <Text style={styles.hint}>💡 Shake phone 3× to trigger SOS silently</Text>
    </View>
  );
}

// ─── Fake Call Screen ─────────────────────────────────────────────────────────
function FakeCallScreen({ onDismiss }) {
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View
      style={[fakeStyles.container, { transform: [{ translateY: slideAnim }] }]}
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={fakeStyles.avatar}>
         <Text style={fakeStyles.avatarText}>M</Text>
      </View>
      <Text style={fakeStyles.callerName}>Mom</Text>
      <Text style={fakeStyles.callerSub}>Incoming call...</Text>
      
      <View style={{ flex: 1 }} />
      
      <View style={fakeStyles.buttons}>
        <TouchableOpacity
          style={[fakeStyles.callBtn, fakeStyles.decline]}
          onPress={onDismiss}
        >
          <Text style={fakeStyles.callBtnText}>✕</Text>
          <Text style={fakeStyles.callLabelText}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[fakeStyles.callBtn, fakeStyles.answer]} onPress={onDismiss}>
          <Text style={fakeStyles.callBtnText}>✓</Text>
          <Text style={fakeStyles.callLabelText}>Answer</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const RED = "#FF1744";
const DARK = "#0d0d0d";
const CARD = "#1a1a1a";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK,
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  countdownContainer: { justifyContent: "center", backgroundColor: "#1a0000" },
  countdownLabel: {
    color: "#ff8a80",
    fontSize: 22,
    marginBottom: 16,
    fontWeight: "300",
  },
  countdownNumber: {
    color: RED,
    fontSize: 120,
    fontWeight: "900",
    lineHeight: 120,
  },
  cancelCountdownBtn: {
    marginTop: 40,
    borderWidth: 2,
    borderColor: "#ff8a80",
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 40,
  },
  cancelCountdownText: {
    color: "#ff8a80",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 2,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 40,
    gap: 10,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#69f0ae",
  },
  statusText: { color: "#aaa", fontSize: 14, textAlign: "center", flex: 1 },

  sosWrapper: { marginVertical: 20 },
  sosButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: RED,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: RED,
    shadowOpacity: 0.7,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
    elevation: 20,
  },
  sosButtonActive: { backgroundColor: "#333", shadowColor: "#aaa" },
  sosButtonLabel: {
    color: "#fff",
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: 4,
  },
  sosButtonSub: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    marginTop: 4,
    textAlign: "center",
  },

  locationText: {
    color: "#555",
    fontSize: 11,
    marginVertical: 16,
    textAlign: "center",
  },

  quickActions: {
    flexDirection: "row",
    gap: 12,
    marginVertical: 20,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  actionBtn: {
    backgroundColor: CARD,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: "center",
    minWidth: 72,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  actionIcon: { fontSize: 24, marginBottom: 6 },
  actionLabel: {
    color: "#ccc",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16,
  },

  contactsCard: {
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 20,
    width: "100%",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    marginTop: 8,
  },
  contactsTitle: {
    color: "#666",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
    marginBottom: 12,
  },
  contactRow: { color: "#ccc", fontSize: 14, marginBottom: 8 },
  contactPhone: { color: "#666" },

  hint: { color: "#333", fontSize: 12, marginTop: 24, textAlign: "center" },
});

const fakeStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    paddingTop: 80,
    paddingBottom: 60,
  },
  avatar: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: "#333", alignItems: "center", justifyContent: "center",
    marginBottom: 24,
  },
  avatarText: { color: "#aaa", fontSize: 40, fontWeight: "600" },
  callerName: {
    color: "#fff",
    fontSize: 42,
    fontWeight: "300",
    marginBottom: 8,
  },
  callerSub: { color: "#888", fontSize: 18, marginBottom: 32 },
  buttons: { flexDirection: "row", gap: 60, paddingHorizontal: 40 },
  callBtn: {
    width: 72, height: 72,
    borderRadius: 36,
    alignItems: "center", justifyContent: "center",
    marginBottom: 10,
  },
  decline: { backgroundColor: "#FF3B30" },
  answer: { backgroundColor: "#34C759" },
  callBtnText: { color: "#fff", fontSize: 32, fontWeight: "500" },
  callLabelText: { color: "#fff", fontSize: 14, marginTop: 80, textAlign: "center", position: "absolute", bottom: -24 },
});
