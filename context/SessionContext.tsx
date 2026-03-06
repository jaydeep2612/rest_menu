import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Alert, Platform } from "react-native";
import { SessionService } from "../services/session.service";
// --- TYPES ---
export type CartItem = {
  qty: number;
  price: number;
  name: string;
};

export type TableData = {
  rId: string;
  tId: string;
  token: string;
} | null;

type SessionContextType = {
  isReady: boolean;
  tableData: TableData;
  setTableData: (data: TableData) => void;
  sessionToken: string | null;
  customerName: string;
  joinStatus: string | null;
  setJoinStatus: (status: string | null) => void;
  isPrimary: boolean;
  cart: Record<number, CartItem>;
  setCustomerName: (name: string) => void;
  startSession: (name: string, mode: "new" | "join") => Promise<void>;
  clearSession: () => Promise<void>;
  updateCart: (
    id: number,
    delta: number,
    price?: number,
    name?: string,
  ) => void;
  clearCart: () => void; // Added for Cart Tab
  cartTotalQty: number;
  cartTotalPrice: number;
  menuData: any;
  setMenuData: (data: any) => void;
  orders: any[]; // Added for Orders Tab
  setOrders: React.Dispatch<React.SetStateAction<any[]>>; // Added for Orders Tab
};

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  // --- STATE ---
  const [isReady, setIsReady] = useState(false); // Hydration guard
  const [tableData, setTableData] = useState<TableData>(null); // QR URL Params
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [joinStatus, setJoinStatus] = useState<string | null>(null);
  const [isPrimary, setIsPrimary] = useState(false); // Host vs Guest
  const [cart, setCart] = useState<Record<number, CartItem>>({});
  const [menuData, setMenuData] = useState<any>(null);

  // NEW: Global Orders State
  const [orders, setOrders] = useState<any[]>([]);

  // --- 1. LOAD PERSISTED STATE ON MOUNT ---
  useEffect(() => {
    const loadStoredSession = async () => {
      try {
        const storedTable = await AsyncStorage.getItem("tableData");
        const token = await AsyncStorage.getItem("sessionToken");
        const name = await AsyncStorage.getItem("customerName");
        const storedCart = await AsyncStorage.getItem("cart");
        const primary = await AsyncStorage.getItem("isPrimary");
        const status = await AsyncStorage.getItem("joinStatus");

        if (storedTable) setTableData(JSON.parse(storedTable));
        if (token) setSessionToken(token);
        if (name) setCustomerName(name);
        if (storedCart) setCart(JSON.parse(storedCart));
        if (primary) setIsPrimary(primary === "true");
        if (status) setJoinStatus(status);
      } catch (e) {
        console.error("Failed to load session from storage", e);
      } finally {
        setIsReady(true); // Hydration is complete, safe to render app
      }
    };
    loadStoredSession();
  }, []);

  // --- 2. PERSIST STATE CHANGES (AUTOSAVE) ---
  useEffect(() => {
    if (!isReady) return;

    if (tableData) AsyncStorage.setItem("tableData", JSON.stringify(tableData));
    if (sessionToken) AsyncStorage.setItem("sessionToken", sessionToken);
    AsyncStorage.setItem("customerName", customerName);
    AsyncStorage.setItem("cart", JSON.stringify(cart));
    AsyncStorage.setItem("isPrimary", isPrimary ? "true" : "false");

    // Actively remove ghost state if status becomes null
    if (joinStatus) {
      AsyncStorage.setItem("joinStatus", joinStatus);
    } else {
      AsyncStorage.removeItem("joinStatus");
    }
  }, [
    tableData,
    sessionToken,
    customerName,
    cart,
    isPrimary,
    joinStatus,
    isReady,
  ]);

  // --- 3. OPTIMIZED CART LOGIC ---
  const updateCart = (
    id: number,
    delta: number,
    price: number = 0,
    name: string = "",
  ) => {
    setCart((prev) => {
      // Safety check: Prevent decreasing an item that isn't in the cart
      if (!prev[id] && delta < 0) return prev;

      const currentItem = prev[id] || { qty: 0, price, name };
      const newQty = currentItem.qty + delta;

      // If quantity hits 0, remove it from the cart object
      if (newQty <= 0) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: { ...currentItem, qty: newQty } };
    });
  };

  // NEW: Instantly clear the cart after placing an order
  const clearCart = () => setCart({});

  // Calculate Totals using useMemo (O(N) operation on cart items only)
  const { cartTotalQty, cartTotalPrice } = useMemo(() => {
    let qty = 0;
    let price = 0;
    Object.values(cart).forEach((item) => {
      qty += item.qty;
      price += item.qty * item.price;
    });
    return { cartTotalQty: qty, cartTotalPrice: price };
  }, [cart]);

  // --- 4. API ACTIONS ---
  const startSession = async (name: string, mode: "new" | "join") => {
    try {
      if (!tableData) {
        throw new Error(
          "Missing table QR data. Please scan the QR code again.",
        );
      }

      const data: any = await SessionService.startSession(
        name,
        mode,
        tableData.rId,
        tableData.tId,
        tableData.token,
      );

      setCustomerName(data.customer_name || name);
      setSessionToken(data.session_token);
      setJoinStatus(data.join_status);
      setIsPrimary(data.is_primary || false);
    } catch (e: any) {
      console.error("Session start failed", e);

      // 🔥 NEW: Cross-platform Error Popup
      const errorMessage = e.message || "Failed to start session.";
      if (Platform.OS === "web") {
        window.alert(`Error: ${errorMessage}`);
      } else {
        Alert.alert("Session Error", errorMessage);
      }

      throw e; // Keep throwing so the UI stops loading spinners if needed
    }
  };

  const clearSession = async () => {
    try {
      if (sessionToken) {
        await SessionService.leaveSession(sessionToken);
      }
    } catch (e) {
      console.error("Failed to notify server of leave", e);
    } finally {
      // 🔥 CRITICAL FIX: Added "tableData" to fully wipe the device's memory
      await AsyncStorage.multiRemove([
        "sessionToken",
        "customerName",
        "cart",
        "isPrimary",
        "joinStatus",
        "tableData",
      ]);

      // Reset all state to completely blank
      setSessionToken(null);
      setCustomerName("");
      setCart({});
      setIsPrimary(false);
      setJoinStatus(null);
      setOrders([]);
      setTableData(null); // 🔥 CRITICAL FIX: Unlink the old table
    }
  };
  return (
    <SessionContext.Provider
      value={{
        isReady,
        tableData,
        setTableData,
        sessionToken,
        customerName,
        joinStatus,
        setJoinStatus,
        isPrimary,
        cart,
        setCustomerName,
        startSession,
        clearSession,
        updateCart,
        clearCart, // Exported
        cartTotalQty,
        cartTotalPrice,
        menuData,
        setMenuData,
        orders, // Exported
        setOrders, // Exported
      }}
    >
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (!context)
    throw new Error("useSession must be used within a SessionProvider");
  return context;
};
