import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import uuid from "react-native-uuid";
import { THEME } from "../../constants/theme";
import { useSession } from "../../context/SessionContext";
import { OrderService } from "../../services/order.service";

export default function CartTab() {
  const {
    cart,
    updateCart,
    cartTotalQty,
    cartTotalPrice,
    tableData,
    sessionToken,
    clearCart,
    menuData,
  } = useSession();

  const [placing, setPlacing] = useState(false);
  const [itemNotes, setItemNotes] = useState<Record<number, string>>({});
  const [orderNote, setOrderNote] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const currency = menuData?.restaurant?.currency_symbol || "₹";

  // Reset Idempotency Key if the user changes their cart intent
  useEffect(() => {
    setPendingKey(null);
  }, [cart, itemNotes, orderNote]);

  const handlePlaceOrder = async () => {
    if (placing) return;
    if (!sessionToken || cartTotalQty === 0) return;
    if (!tableData) {
      Alert.alert("Error", "Missing table connection.");
      return;
    }

    setPlacing(true);

    try {
      const idempotencyKey = pendingKey || uuid.v4().toString();
      if (!pendingKey) setPendingKey(idempotencyKey);

      // Construct items array exactly as backend expects
      const payload = Object.entries(cart)
        .filter(([_, item]) => item.qty > 0)
        .map(([id, item]) => ({
          menu_item_id: Number(id),
          quantity: item.qty,
          notes: itemNotes[Number(id)]?.trim() || null,
        }));

      // Call the fixed service
      await OrderService.placeOrder(
        tableData.rId,
        tableData.tId,
        sessionToken,
        payload,
        orderNote.trim(),
        idempotencyKey,
      );

      // Atomic cleanup on success
      clearCart();
      setItemNotes({});
      setOrderNote("");
      setPendingKey(null);

      // Navigate to orders to track it
      router.push("/(tabs)/orders");
    } catch (err: any) {
      console.error("Order error:", err);
      Alert.alert(
        "Order Failed",
        err?.data?.message || err.message || "Network error. Please try again.",
      );
    } finally {
      setPlacing(false);
    }
  };

  const handleItemNoteChange = (id: number, text: string) => {
    setItemNotes((prev) => ({ ...prev, [id]: text }));
  };

  // --- EMPTY STATE ---
  if (cartTotalQty === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Your Cart</Text>
        </View>
        <View style={styles.emptyState}>
          <Ionicons
            name="cart-outline"
            size={80}
            color={THEME.textSecondary}
            style={{ opacity: 0.3, marginBottom: 16 }}
          />
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptySub}>
            Add some delicious items from the menu!
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/(tabs)/menu")}
            style={styles.browseBtn}
          >
            <Text style={styles.browseBtnText}>Browse Menu</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // --- ACTIVE CART STATE ---
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Review Order</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.sectionHeader}>Selected Items</Text>

          {Object.entries(cart).map(([idStr, item]) => {
            const id = Number(idStr);
            if (item.qty <= 0) return null;

            return (
              <View key={id} style={styles.cartItemCard}>
                <View style={styles.itemTopRow}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.itemName} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={styles.itemPrice}>
                      {currency}
                      {(item.price * item.qty).toFixed(2)}
                    </Text>
                  </View>

                  {/* Quantity Controls */}
                  <View style={styles.qtySelector}>
                    <TouchableOpacity
                      onPress={() => updateCart(id, -1, item.price, item.name)}
                      style={styles.qtyBtn}
                    >
                      <Ionicons
                        name="remove"
                        size={18}
                        color={THEME.textPrimary}
                      />
                    </TouchableOpacity>
                    <Text style={styles.qtyText}>{item.qty}</Text>
                    <TouchableOpacity
                      onPress={() => updateCart(id, 1, item.price, item.name)}
                      style={styles.qtyBtn}
                    >
                      <Ionicons
                        name="add"
                        size={18}
                        color={THEME.textPrimary}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Per-Item Note */}
                <TextInput
                  style={styles.noteInput}
                  placeholder={`Note for ${item.name} (e.g. No onions)`}
                  placeholderTextColor={THEME.textSecondary}
                  value={itemNotes[id] || ""}
                  onChangeText={(text) => handleItemNoteChange(id, text)}
                  maxLength={100}
                />
              </View>
            );
          })}

          <View style={styles.divider} />

          <Text style={[styles.sectionHeader, { marginTop: 10 }]}>
            Order Instructions (Optional)
          </Text>
          <TextInput
            style={[styles.noteInput, { height: 80, textAlignVertical: "top" }]}
            placeholder="Any general requests for the kitchen? (e.g. Extra plates)"
            placeholderTextColor={THEME.textSecondary}
            value={orderNote}
            onChangeText={setOrderNote}
            multiline
            maxLength={200}
          />
        </ScrollView>

        {/* --- FLOATING CHECKOUT FOOTER --- */}
        <View style={styles.footer}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>
              {currency}
              {cartTotalPrice.toFixed(2)}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, placing && { opacity: 0.7 }]}
            onPress={handlePlaceOrder}
            disabled={placing}
          >
            {placing ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={22}
                  color="white"
                />
                <Text style={styles.primaryBtnText}>Confirm & Place Order</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
  },
  header: {
    backgroundColor: THEME.cardBg,
    paddingTop: Platform.OS === "android" ? 40 : 16,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: THEME.textPrimary,
  },

  // Scroll Content
  scrollContent: {
    padding: 20,
    paddingBottom: 140, // Avoid overlap with fixed footer
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: THEME.textSecondary,
    marginBottom: 15,
  },
  divider: {
    height: 1,
    backgroundColor: THEME.border,
    marginVertical: 15,
  },

  // Cart Item
  cartItemCard: {
    backgroundColor: THEME.cardBg,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
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
  itemTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "bold",
    color: THEME.textPrimary,
    marginBottom: 4,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: "800",
    color: THEME.primary,
  },

  // Quantity Selector
  qtySelector: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: THEME.background,
    borderRadius: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  qtyBtn: { padding: 4, paddingHorizontal: 8 },
  qtyText: {
    marginHorizontal: 8,
    fontWeight: "800",
    fontSize: 15,
    color: THEME.textPrimary,
  },

  // Notes Input
  noteInput: {
    backgroundColor: THEME.background,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: THEME.textPrimary,
  },

  // Footer
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: THEME.cardBg,
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 30 : 20,
    borderTopWidth: 1,
    borderColor: THEME.border,
    ...Platform.select({
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 10,
      },
    }),
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: "bold",
    color: THEME.textPrimary,
  },
  totalValue: {
    fontSize: 22,
    fontWeight: "900",
    color: THEME.primary,
  },
  primaryBtn: {
    backgroundColor: THEME.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    shadowColor: THEME.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  primaryBtnText: { color: "white", fontWeight: "bold", fontSize: 16 },

  // Empty State
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: THEME.textPrimary,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 15,
    color: THEME.textSecondary,
    textAlign: "center",
    marginBottom: 30,
  },
  browseBtn: {
    backgroundColor: THEME.primaryLight,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  browseBtnText: {
    color: THEME.primary,
    fontWeight: "bold",
    fontSize: 16,
  },
});
