import { MaterialIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { THEME } from "../constants/theme";
import { useSession } from "../context/SessionContext";
import { SessionService } from "../services/session.service";

export default function JoinScreen() {
  const {
    startSession,
    customerName,
    setCustomerName,
    sessionToken,
    setTableData,
    tableData,
    joinStatus,
    setJoinStatus,
    clearSession,
  } = useSession();

  const { r, t, token } = useLocalSearchParams<{
    r: string;
    t: string;
    token: string;
  }>();

  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [isTableFull, setIsTableFull] = useState(false); // 🔥 NEW STATE
  // Join vs Split State
  const [existingHostName, setExistingHostName] = useState<string | null>(null);
  const [showJoinChoice, setShowJoinChoice] = useState(false);
  const [selectedMode, setSelectedMode] = useState<"new" | "join">("new");

  // 1. Save QR Data & Validate Table
  useEffect(() => {
    const initTable = async () => {
      if (r && t && token) {
        if (tableData?.tId !== t || tableData?.token !== token) {
          setTableData({ rId: r, tId: t, token });
        }

        // Validate Table API Call
        try {
          const data = await SessionService.validateTable(r, t, token);
          if (data.is_full) {
            setIsTableFull(true);
            setValidating(false);
            return; // Stop here, don't show the form
          }
          if (data.has_active_host) {
            setExistingHostName(data.host_name);
            setShowJoinChoice(true);
            setSelectedMode("join"); // Default to joining
          } else {
            setShowJoinChoice(false);
            setSelectedMode("new");
          }
        } catch (e) {
          console.error("Validation failed", e);
        } finally {
          setValidating(false);
        }
      } else {
        setValidating(false);
      }
    };
    initTable();
  }, [r, t, token]);
  // 2. Polling for Approval (Waiting Room)
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (joinStatus === "pending" && tableData && sessionToken) {
      interval = setInterval(async () => {
        try {
          const res = await SessionService.checkSessionStatus(
            tableData.rId,
            tableData.tId,
            tableData.token,
            sessionToken,
          );

          if (res.session?.join_status === "approved") {
            setJoinStatus("approved");
            router.replace("/(tabs)/menu");
          }
        } catch (e: any) {
          console.log(`Poll Error ${e.status}:`, e.data);

          // 1. Explicitly rejected by payload
          const isExplicitlyRejected = e.data?.join_status === "rejected";
          // 2. Session was deactivated/deleted by the host rejecting them
          const isInvalidSession =
            e.status === 403 &&
            e.data?.message?.includes("Invalid or inactive");
          // 3. Session completely wiped from database
          const isNotFound = e.status === 404 || e.status === 401;

          if (isExplicitlyRejected || isInvalidSession || isNotFound) {
            console.log(
              "Request was rejected or session terminated. Updating UI.",
            );
            setJoinStatus("rejected");
          } else if (e.data?.join_status === "approved") {
            // Edge case safety
            setJoinStatus("approved");
            router.replace("/(tabs)/menu");
          }
        }
      }, 3000);
    }

    return () => clearInterval(interval);
  }, [joinStatus, sessionToken, tableData, setJoinStatus]);
  // 3. Auto-Redirect if Active/Approved
  useEffect(() => {
    if (
      sessionToken &&
      (joinStatus === "active" || joinStatus === "approved")
    ) {
      router.replace("/(tabs)/menu");
    }
  }, [sessionToken, joinStatus]);

  const handleJoin = async () => {
    if (!customerName.trim()) return;
    setLoading(true);
    try {
      await startSession(customerName, selectedMode);
      // If they request to join, startSession sets status to 'pending', which triggers polling.
      // If 'new', it sets status to 'active' and auto-redirect triggers.
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // --- RENDERS ---

  if (validating) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={THEME.primary} />
        <Text style={{ marginTop: 16, color: THEME.textSecondary }}>
          Checking table status...
        </Text>
      </View>
    );
  }

  // REJECTED STATE
  if (joinStatus === "rejected") {
    return (
      <View style={styles.centerContainer}>
        <MaterialIcons name="cancel" size={80} color={THEME.danger} />
        <Text style={styles.welcomeTitle}>Access Denied</Text>
        <Text style={styles.subtitle}>
          The Host has declined your request to join this table.
        </Text>
        <TouchableOpacity
          onPress={clearSession}
          style={[styles.joinButton, { width: "80%", marginTop: 24 }]}
        >
          <Text style={styles.joinButtonText}>Start Over</Text>
        </TouchableOpacity>
      </View>
    );
  }
  // TABLE FULL STATE
  if (isTableFull) {
    return (
      <View style={styles.centerContainer}>
        <MaterialIcons name="event-seat" size={80} color={THEME.warning} />
        <Text style={styles.welcomeTitle}>Table is Full</Text>
        <Text style={styles.subtitle}>
          Sorry, this table has reached its maximum seating capacity. Please
          speak to the staff.
        </Text>
        <TouchableOpacity
          onPress={() => window.location.reload()}
          style={[
            styles.joinButton,
            {
              width: "80%",
              marginTop: 24,
              backgroundColor: THEME.textSecondary,
            },
          ]}
        >
          <Text style={styles.joinButtonText}>Refresh Status</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // PENDING / WAITING ROOM
  if (joinStatus === "pending") {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={THEME.warning} />
        <Text style={styles.welcomeTitle}>Waiting...</Text>
        <Text style={styles.subtitle}>
          Waiting for{" "}
          <Text style={{ fontWeight: "bold", color: THEME.textPrimary }}>
            {existingHostName || "Host"}
          </Text>{" "}
          to approve you.
        </Text>
        <TouchableOpacity onPress={clearSession} style={{ marginTop: 32 }}>
          <Text style={{ color: THEME.danger, fontWeight: "bold" }}>
            Cancel Request
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // MAIN LOGIN / JOIN FORM
  const isButtonDisabled = !customerName.trim() || loading;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <MaterialIcons name="restaurant" size={24} color={THEME.primary} />
        </View>
        {/* Make it generic until the API loads the real name on the next screen */}
        <Text style={styles.headerTitle}>Welcome to our Restaurant</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.welcomeTitle}>Welcome!</Text>
        <View style={styles.tableBadge}>
          <MaterialIcons
            name="local-activity"
            size={16}
            color={THEME.primary}
          />
          <Text style={styles.tableBadgeText}>
            Table #{tableData?.tId || "?"}
          </Text>
        </View>

        {/* SPLIT VS JOIN UI */}
        {showJoinChoice ? (
          <View style={{ width: "100%", marginBottom: 24 }}>
            <Text
              style={[styles.subtitle, { textAlign: "left", marginBottom: 12 }]}
            >
              Hosted by{" "}
              <Text style={{ fontWeight: "bold", color: THEME.textPrimary }}>
                {existingHostName}
              </Text>
              . How do you want to order?
            </Text>

            <TouchableOpacity
              style={[
                styles.choiceCard,
                selectedMode === "join" && styles.choiceCardActive,
              ]}
              onPress={() => setSelectedMode("join")}
            >
              <MaterialIcons
                name="group"
                size={28}
                color={selectedMode === "join" ? "#FFF" : THEME.textPrimary}
              />
              <View style={{ marginLeft: 16 }}>
                <Text
                  style={[
                    styles.choiceTitle,
                    selectedMode === "join" && { color: "#FFF" },
                  ]}
                >
                  Join the Table
                </Text>
                <Text
                  style={[
                    styles.choiceDesc,
                    selectedMode === "join" && {
                      color: "rgba(255,255,255,0.8)",
                    },
                  ]}
                >
                  Orders added to {existingHostName}'s bill
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.choiceCard,
                selectedMode === "new" && styles.choiceCardActive,
              ]}
              onPress={() => setSelectedMode("new")}
            >
              <MaterialIcons
                name="receipt-long"
                size={28}
                color={selectedMode === "new" ? "#FFF" : THEME.textPrimary}
              />
              <View style={{ marginLeft: 16 }}>
                <Text
                  style={[
                    styles.choiceTitle,
                    selectedMode === "new" && { color: "#FFF" },
                  ]}
                >
                  Separate Bill
                </Text>
                <Text
                  style={[
                    styles.choiceDesc,
                    selectedMode === "new" && {
                      color: "rgba(255,255,255,0.8)",
                    },
                  ]}
                >
                  Start your own separate tab
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={[styles.subtitle, { marginBottom: 32 }]}>
            Enter your name to start ordering.
          </Text>
        )}

        {/* NAME INPUT */}
        <View style={styles.formArea}>
          <Text style={styles.label}>Your Name</Text>
          <View style={styles.inputContainer}>
            <MaterialIcons
              name="person"
              size={24}
              color={THEME.textSecondary}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="e.g. John Doe"
              placeholderTextColor="#94A3B8"
              value={customerName}
              onChangeText={setCustomerName}
            />
          </View>

          <TouchableOpacity
            style={[styles.joinButton, isButtonDisabled && { opacity: 0.6 }]}
            onPress={handleJoin}
            disabled={isButtonDisabled}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.joinButtonText}>
                {showJoinChoice && selectedMode === "join"
                  ? "Request to Join"
                  : "Start Session"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  centerContainer: {
    flex: 1,
    backgroundColor: THEME.background,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: THEME.primaryLight,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "bold", color: THEME.textPrimary },
  content: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  welcomeTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: THEME.textPrimary,
    marginBottom: 8,
    marginTop: 16,
  },
  subtitle: {
    fontSize: 15,
    color: THEME.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  tableBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: THEME.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 24,
  },
  tableBadgeText: { color: THEME.primary, fontWeight: "bold", marginLeft: 6 },
  choiceCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: THEME.border,
    backgroundColor: THEME.cardBg,
    marginBottom: 12,
  },
  choiceCardActive: {
    backgroundColor: THEME.primary,
    borderColor: THEME.primary,
  },
  choiceTitle: {
    fontWeight: "bold",
    fontSize: 16,
    color: THEME.textPrimary,
    marginBottom: 2,
  },
  choiceDesc: { fontSize: 13, color: THEME.textSecondary },
  formArea: { width: "100%" },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: THEME.textPrimary,
    marginBottom: 8,
    marginLeft: 4,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: THEME.cardBg,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    height: 56,
    marginBottom: 24,
  },
  inputIcon: { paddingHorizontal: 16 },
  input: { flex: 1, fontSize: 16, color: THEME.textPrimary },
  joinButton: {
    backgroundColor: THEME.primary,
    alignItems: "center",
    justifyContent: "center",
    height: 56,
    borderRadius: 12,
  },
  joinButtonText: { color: "#FFF", fontSize: 16, fontWeight: "bold" },
});
