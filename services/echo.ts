import Echo from "laravel-echo";
import Pusher from "pusher-js";

// Polyfill for React Native Mobile (Web already has window)
Pusher.logToConsole = true;
global.Pusher = Pusher;
// ⚠️ CHANGE THIS TO YOUR LARAVEL URL (Local IP for testing, Domain for production)
const BASE_URL = "https://restaurant.techstrota.com";

export const initEcho = (sessionToken: string) => {
  return new Echo({
    broadcaster: "pusher",
    key: "a36b8c344a4f12a3bd4a", // e.g., '1234abcd5678efgh'
    cluster: "ap2", // e.g., 'ap2'
    forceTLS: true,
    authEndpoint: `${BASE_URL}/api/pusher/auth`,
    auth: {
      headers: {
        Authorization: sessionToken,
        Accept: "application/json",
      },
    },
  });
};
