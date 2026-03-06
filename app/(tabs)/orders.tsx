import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { THEME } from "../../constants/theme";
import { useSession } from "../../context/SessionContext";
import { OrderService } from "../../services/order.service";
import { SessionService } from "../../services/session.service";

export default function OrdersTab() {
  const { sessionToken, tableData, menuData, orders, setOrders } = useSession();

  const [loading, setLoading] = useState(true);

  // Connection and Sync State
  const [isSyncing, setIsSyncing] = useState(true);
  const [socketConnected, setSocketConnected] = useState(false);

  const currency = menuData?.restaurant?.currency_symbol || "₹";

  // Safely merge incoming orders without screen flickering (Sorted Newest First)
  const mergeOrders = (incomingOrders: any[]) => {
    setOrders((prev) => {
      const map = new Map(prev.map((o) => [o.id, o]));
      incomingOrders.forEach((o) => map.set(o.id, o));
      return Array.from(map.values()).sort((a, b) => b.id - a.id);
    });
  };

  useEffect(() => {
    if (!sessionToken) return;

    let isMounted = true;
    let pollingInterval: ReturnType<typeof setInterval>;
    const abortController = new AbortController();

    const fetchOrders = async () => {
      try {
        const data = await OrderService.getOrders(
          sessionToken,
          abortController.signal,
        );
        if (!isMounted) return;

        mergeOrders(Array.isArray(data) ? data : []);
        setIsSyncing(true);
      } catch (e: any) {
        if (e.name !== "AbortError" && isMounted) {
          console.error("Sync failed", e);
          setIsSyncing(false); // Triggers the offline banner
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchOrders(); // Initial load

    // Poll every 5 seconds as a fallback to WebSockets
    const startPolling = () => {
      pollingInterval = setInterval(() => {
        if (!socketConnected) fetchOrders();
      }, 5000);
    };

    startPolling();

    return () => {
      isMounted = false;
      abortController.abort(); // Cancel network request if user leaves tab
      clearInterval(pollingInterval);
    };
  }, [sessionToken, socketConnected]);

  const displayOrders = Array.isArray(orders) ? orders : [];

  // Calculate totals strictly from backend values (Excluding Cancelled Orders)
  const totalBill = useMemo(
    () =>
      displayOrders.reduce((sum, order) => {
        const status = order.status?.toLowerCase() || "";
        // Do not add cancelled/rejected orders to the total bill
        if (status === "cancelled" || status === "rejected") {
          return sum;
        }
        return sum + (parseFloat(String(order.total_amount)) || 0);
      }, 0),
    [displayOrders],
  );

  const handleCallWaiter = async () => {
    if (!tableData?.tId || !sessionToken) return;
    try {
      await SessionService.callWaiter(tableData.tId, sessionToken);
      Alert.alert(
        "Waiter Notified",
        "A staff member has been alerted and is on the way.",
      );
    } catch (e) {
      Alert.alert("Error", "Could not reach staff. Please try again.");
    }
  };

  const getStatusUI = (status: string) => {
    const s = status?.toLowerCase() || "";

    if (s === "accepted")
      return {
        color: THEME.primary,
        bg: THEME.primary,
        text: "Order Accepted",
        icon: "checkmark-circle-outline",
      };
    if (s === "placed" || s === "pending")
      return {
        color: THEME.textSecondary,
        bg: "#94A3B8",
        text: "Placed",
        icon: "time-outline",
      };
    if (s === "preparing")
      return {
        color: THEME.warning,
        bg: THEME.warning,
        text: "Preparing",
        icon: "flame-outline",
      };
    if (s === "ready")
      return {
        color: THEME.primary,
        bg: THEME.primary,
        text: "Ready to Serve",
        icon: "restaurant-outline",
      };
    if (s === "served" || s === "completed")
      return {
        color: THEME.success,
        bg: THEME.success,
        text: "Served",
        icon: "checkmark-circle-outline",
      };
    return {
      color: THEME.danger,
      bg: THEME.danger,
      text: "Cancelled",
      icon: "close-circle-outline",
    };
  };

  // Render a single order card
  const renderOrderItem = ({ item: order }: { item: any }) => {
    const statusUI = getStatusUI(order.status);
    const isCancelled =
      order.status?.toLowerCase() === "cancelled" ||
      order.status?.toLowerCase() === "rejected";

    return (
      <View style={[styles.orderCard, isCancelled && { opacity: 0.6 }]}>
        <View style={styles.orderHeader}>
          <View>
            <Text
              style={[
                styles.orderId,
                isCancelled && {
                  textDecorationLine: "line-through",
                  color: THEME.textSecondary,
                },
              ]}
            >
              Order #{order.id}
            </Text>
            <Text style={styles.orderTime}>
              Placed by {order.customer_name || "Guest"}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusUI.bg + "15" },
            ]}
          >
            <Ionicons
              name={statusUI.icon as any}
              size={14}
              color={statusUI.color}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.statusText, { color: statusUI.color }]}>
              {statusUI.text}
            </Text>
          </View>
        </View>

        <View style={styles.itemsList}>
          {Array.isArray(order.items) &&
            order.items.map((item: any, i: number) => (
              <View key={`item-${item.id || i}`} style={styles.orderItem}>
                <View
                  style={{ flexDirection: "row", flex: 1, paddingRight: 12 }}
                >
                  <Text style={styles.itemQtyBadge}>{item.quantity}x</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemText} numberOfLines={2}>
                      {item.menu_item?.name || item.item_name || "Menu Item"}
                    </Text>
                    {item.notes && (
                      <Text style={styles.itemNote}>Note: {item.notes}</Text>
                    )}
                  </View>
                </View>
                <Text style={styles.itemPrice}>
                  {currency}
                  {(
                    Number(item.total_price) ||
                    Number(item.unit_price || item.price || 0) *
                      Number(item.quantity || 1)
                  ).toFixed(2)}
                </Text>
              </View>
            ))}
        </View>

        {order.notes && (
          <View style={styles.orderLevelNote}>
            <Ionicons
              name="chatbox-ellipses-outline"
              size={14}
              color="#B45309"
            />
            <Text style={styles.orderLevelNoteText}>{order.notes}</Text>
          </View>
        )}

        <View style={styles.orderFooter}>
          <Text style={styles.totalText}>Order Total</Text>
          <Text
            style={[
              styles.totalText,
              isCancelled && {
                textDecorationLine: "line-through",
                color: THEME.textSecondary,
              },
            ]}
          >
            {currency}
            {(parseFloat(String(order.total_amount)) || 0).toFixed(2)}
          </Text>
        </View>
      </View>
    );
  };

  const renderFooter = () => (
    <View style={styles.summaryCard}>
      <View style={styles.summaryTotalRow}>
        <Text style={styles.summaryTotalLabel}>Total Bill</Text>
        <Text style={styles.summaryTotalValue}>
          {currency}
          {totalBill.toFixed(2)}
        </Text>
      </View>
      <Text style={styles.summaryNote}>
        *Cancelled orders are not included in the total bill.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Order History</Text>
      </View>

      {!isSyncing && !socketConnected && (
        <View style={styles.offlineBanner}>
          <Ionicons
            name="cloud-offline-outline"
            size={16}
            color={THEME.cardBg}
          />
          <Text style={styles.offlineText}>
            Connection lost. Trying to reconnect...
          </Text>
        </View>
      )}

      {loading && orders.length === 0 ? (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={THEME.primary} />
          <Text style={styles.emptyStateText}>Loading orders...</Text>
        </View>
      ) : displayOrders.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons
            name="receipt-outline"
            size={64}
            color={THEME.textSecondary}
            style={{ opacity: 0.3 }}
          />
          <Text style={styles.emptyStateTitle}>No orders found.</Text>
          <Text style={styles.emptyStateText}>
            When you place orders, they will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayOrders}
          keyExtractor={(item) => `order-${item.id}`}
          renderItem={renderOrderItem}
          ListFooterComponent={renderFooter}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={handleCallWaiter}>
        <Ionicons name="notifications-outline" size={24} color={THEME.cardBg} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background },
  header: {
    backgroundColor: THEME.cardBg,
    paddingTop: Platform.OS === "android" ? 40 : 16,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
    alignItems: "center",
  },
  headerTitle: { fontSize: 20, fontWeight: "bold", color: THEME.textPrimary },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: THEME.danger,
    paddingVertical: 8,
    gap: 8,
  },
  offlineText: { color: THEME.cardBg, fontSize: 13, fontWeight: "bold" },

  scrollContent: { padding: 16, paddingBottom: 100 },

  orderCard: {
    backgroundColor: THEME.cardBg,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    ...Platform.select({
      web: { boxShadow: "0px 2px 8px rgba(0,0,0,0.04)" } as any,
      default: {
        shadowColor: THEME.textPrimary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
      },
    }),
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  orderId: { fontSize: 16, fontWeight: "bold", color: THEME.textPrimary },
  orderTime: { fontSize: 13, color: THEME.textSecondary, marginTop: 2 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: { fontSize: 12, fontWeight: "bold" },

  itemsList: { gap: 12 },
  orderItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  itemQtyBadge: {
    color: THEME.primary,
    fontWeight: "bold",
    fontSize: 14,
    marginRight: 8,
    width: 24,
  },
  itemText: { fontSize: 15, fontWeight: "500", color: THEME.textPrimary },
  itemPrice: { fontSize: 15, color: THEME.textPrimary, fontWeight: "600" },
  itemNote: {
    fontSize: 13,
    color: THEME.textSecondary,
    fontStyle: "italic",
    marginTop: 4,
  },

  orderLevelNote: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFBEB",
    padding: 12,
    marginTop: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FEF3C7",
  },
  orderLevelNoteText: {
    fontSize: 13,
    color: "#B45309",
    marginLeft: 8,
    flex: 1,
  },

  orderFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
  },
  totalText: { fontSize: 16, fontWeight: "bold", color: THEME.textPrimary },

  summaryCard: {
    backgroundColor: THEME.cardBg,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    marginTop: 8,
    marginBottom: 24,
  },
  summaryTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryTotalLabel: {
    fontSize: 18,
    fontWeight: "900",
    color: THEME.textPrimary,
  },
  summaryTotalValue: { fontSize: 24, fontWeight: "900", color: THEME.primary },
  summaryNote: {
    fontSize: 11,
    color: THEME.textSecondary,
    marginTop: 8,
    fontStyle: "italic",
  },

  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    marginTop: 60,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: THEME.textPrimary,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: THEME.textSecondary,
    textAlign: "center",
    marginTop: 8,
  },

  fab: {
    position: "absolute",
    bottom: 24,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: THEME.primary,
    justifyContent: "center",
    alignItems: "center",
    ...Platform.select({
      default: {
        shadowColor: THEME.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
      },
    }),
  },
});
