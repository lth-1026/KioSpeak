import { Tool, Type } from '@google/genai';

export const toolDefinitions: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "addToCart",
        description: "Adds a menu item to the cart by menu name. Returns: cartItemId (SAVE THIS - required for all subsequent operations on this item) and pendingOptions array. If pendingOptions is not empty, you MUST ask the customer about each option group in order before proceeding. Use exact option IDs from pendingOptions.items[].id when calling selectOption.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            menuName: { type: Type.STRING, description: "Exact menu name from getMenu response (e.g., '불고기 버거', '콜라'). Must match name field exactly." },
            quantity: { type: Type.NUMBER, description: "Quantity to add (default: 1)" }
          },
          required: ["menuName"]
        }
      },
      {
        name: "selectOption",
        description: "Selects an option for a cart item. Use values from pendingOptions returned by addToCart or previous selectOption call. After calling, check the new pendingOptions in response - if not empty, ask about the next option group. If empty, the item configuration is complete.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            cartItemId: { type: Type.STRING, description: "Cart item ID from addToCart response or getCart response. Format: 'cart_xxx'. Each cart item has a unique ID." },
            groupId: { type: Type.STRING, description: "Option group ID from pendingOptions[].groupId (e.g., 'set_choice', 'drink', 'size'). Use exact value from response." },
            optionId: { type: Type.STRING, description: "Option ID from pendingOptions[].items[].id (e.g., 'set', 'single', 'cola'). Use exact value - do not translate or guess." }
          },
          required: ["cartItemId", "groupId", "optionId"]
        }
      },
      {
        name: "updateQuantity",
        description: "Changes the quantity of a cart item. IMPORTANT: Call getCart first to find the cartItemId of the item to modify. Setting quantity to 0 removes the item from cart.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            cartItemId: { type: Type.STRING, description: "Cart item ID from getCart response. Format: 'cart_xxx'." },
            quantity: { type: Type.NUMBER, description: "New quantity. Use 0 to remove the item." }
          },
          required: ["cartItemId", "quantity"]
        }
      },
      {
        name: "removeFromCart",
        description: "Removes an item from the cart permanently. IMPORTANT: Call getCart first to find the correct cartItemId. Confirm with customer before removing.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            cartItemId: { type: Type.STRING, description: "Cart item ID from getCart response. Format: 'cart_xxx'." }
          },
          required: ["cartItemId"]
        }
      },
      {
        name: "getCart",
        description: "Retrieves the current cart state including all items, their options, quantities, and prices. MUST be called before any cart modification (updateQuantity, removeFromCart, selectOption on existing items) to get the correct cartItemId. Also use to show order summary before payment.",
        parameters: {
          type: Type.OBJECT,
          properties: {},
          required: []
        }
      },
      {
        name: "getMenu",
        description: "Retrieves all available menu items with prices, categories, and optionGroups. MUST be called at conversation start before taking any orders. Returns items with available: false for sold-out items - inform customer these cannot be ordered. Menu names returned here should be used for addToCart menuName parameter.",
        parameters: {
          type: Type.OBJECT,
          properties: {},
          required: []
        }
      },
      {
        name: "processPayment",
        description: "Processes payment and completes the order. Call only after: 1) Customer confirms they want to pay, 2) Customer chooses payment method (CARD or MOBILE), 3) All cart items have completed options (no pending options). On success, cart is cleared and order is complete.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            method: {
              type: Type.STRING,
              description: "Payment method chosen by customer. CARD: card payment, MOBILE: mobile payment (e.g., Samsung Pay, Kakao Pay)",
              enum: ["CARD", "MOBILE"]
            }
          },
          required: ["method"]
        }
      }
    ]
  }
];
